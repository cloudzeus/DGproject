/**
 * Σαρωμένες σελίδες → κείμενο.
 *
 * Το ζητούμενο είναι **πιστή μεταγραφή**, όχι περίληψη: η ανάλυση της πρότασης
 * γίνεται μετά, από το DeepSeek, και στηρίζεται σε αυτούσια αποσπάσματα. Αν το
 * μοντέλο όρασης «τακτοποιήσει» το κείμενο, τα αποσπάσματα παύουν να είναι
 * αποδείξεις και γίνονται παραφράσεις.
 *
 * Οι σελίδες πάνε σε παρτίδες: μία κλήση με 30 εικόνες κινδυνεύει να κοπεί
 * στο όριο εξόδου, και μια αποτυχία θα έριχνε ολόκληρη τη μεταγραφή. Με
 * παρτίδες, ό,τι πέρασε μένει.
 */

import { geminiGenerate, type GeminiPart, type GeminiResult } from './gemini'
import type { RasterizedPage } from './limits'

/** Σελίδες ανά κλήση. Τέσσερις χωράνε άνετα και κρατούν την έξοδο διαχειρίσιμη. */
export const PAGES_PER_BATCH = 4

/**
 * Η κλήση προς το μοντέλο όρασης, ως παράμετρος.
 *
 * Υπάρχει για να ελέγχεται το χώρισμα σε παρτίδες, η σειρά των σελίδων και η
 * συμπεριφορά σε μερική αποτυχία — χωρίς δίκτυο και χωρίς κλειδί. Αυτά είναι
 * ακριβώς τα σημεία που σπάνε σιωπηλά: μια παρτίδα που χάνεται αφήνει τρύπα
 * στη μεταγραφή, και η τρύπα δεν φαίνεται πουθενά αν δεν μετρηθεί.
 */
export type VisionGenerator = (args: {
  parts: GeminiPart[]
  systemInstruction?: string
  maxOutputTokens?: number
}) => Promise<GeminiResult>

const SYSTEM = `Είσαι μηχανή οπτικής αναγνώρισης κειμένου για ελληνικά επαγγελματικά έγγραφα.

Μεταγράφεις ΠΙΣΤΑ ό,τι βλέπεις. Δεν συνοψίζεις, δεν σχολιάζεις, δεν διορθώνεις,
δεν συμπληρώνεις ό,τι λείπει.

ΚΑΝΟΝΕΣ:
- Κράτα τη σειρά ανάγνωσης: τίτλοι, παράγραφοι, λίστες, αριθμήσεις.
- Οι πίνακες γίνονται γραμμές κειμένου με τις στήλες χωρισμένες με « | ».
- Κράτα αριθμούς, ποσά, ημερομηνίες και κωδικούς ΑΚΡΙΒΩΣ όπως είναι τυπωμένα.
- Ό,τι δεν διαβάζεται, γράψ' το ως [δυσανάγνωστο]. ΜΗΝ μαντεύεις.
- Καμία εισαγωγή, κανένα «Ορίστε το κείμενο». Μόνο το περιεχόμενο.`

export type OcrOutcome = {
  text: string
  model: string
  pagesRead: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  /** Οι παρτίδες που απέτυχαν — 1-based αρίθμηση σελίδων, για μήνυμα στον χρήστη. */
  failedPages: number[]
}

export async function ocrPagesToText(
  pages: RasterizedPage[],
  opts: { generate?: VisionGenerator } = {},
): Promise<OcrOutcome> {
  if (pages.length === 0) throw new Error('Δεν δόθηκαν σελίδες για OCR.')
  const generate = opts.generate ?? geminiGenerate

  const outcome: OcrOutcome = {
    text: '',
    model: '',
    pagesRead: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    failedPages: [],
  }

  const chunks: string[] = []

  for (let start = 0; start < pages.length; start += PAGES_PER_BATCH) {
    const batch = pages.slice(start, start + PAGES_PER_BATCH)
    const firstPage = start + 1

    const parts: GeminiPart[] = [
      {
        text:
          batch.length === 1
            ? `Μετάγραψε τη σελίδα ${firstPage}.`
            : `Μετάγραψε τις σελίδες ${firstPage} έως ${start + batch.length}, με τη σειρά. Χώρισε κάθε σελίδα με μια κενή γραμμή.`,
      },
      ...batch.map((p): GeminiPart => ({ inlineData: { data: p.base64, mimeType: p.mimeType } })),
    ]

    try {
      const res = await generate({ parts, systemInstruction: SYSTEM, maxOutputTokens: 8192 })
      chunks.push(cleanTranscription(res.text))
      outcome.model = res.model
      outcome.inputTokens += res.inputTokens
      outcome.outputTokens += res.outputTokens
      outcome.durationMs += res.durationMs
      outcome.pagesRead += batch.length
    } catch (err) {
      console.error(`[ocr] σελίδες ${firstPage}-${start + batch.length}:`, err)
      for (let i = 0; i < batch.length; i++) outcome.failedPages.push(firstPage + i)
    }
  }

  if (outcome.pagesRead === 0) {
    throw new Error('Καμία σελίδα δεν διαβάστηκε. Δες αν είναι διαθέσιμο το Gemini.')
  }

  outcome.text = chunks.join('\n\n')
  return outcome
}

/**
 * Καθαρίζει τα συνηθισμένα υπολείμματα του μοντέλου.
 *
 * Παρά τη ρητή οδηγία, τα μοντέλα όρασης βάζουν κάθε τόσο markdown fences ή
 * μια εισαγωγική φράση. Αυτά μπαίνουν μετά στα αποσπάσματα προέλευσης και
 * μοιάζουν με κείμενο της πρότασης — γι' αυτό φεύγουν εδώ, όχι αργότερα.
 *
 * Καθαρή συνάρτηση.
 */
export function cleanTranscription(raw: string): string {
  let out = raw.trim()

  if (out.startsWith('```')) {
    out = out.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '')
  }

  out = out.replace(
    /^(ορίστε|εδώ είναι|παρακάτω είναι|here is|here's)[^\n]{0,80}:\s*\n+/i,
    '',
  )

  return out.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
