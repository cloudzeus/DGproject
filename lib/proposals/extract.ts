/**
 * Από bytes σε κείμενο.
 *
 * `unpdf` για PDF — καθαρό JavaScript, δουλεύει σε serverless· το `pdf-parse`
 * θέλει native εξαρτήσεις. `mammoth` για DOCX.
 *
 * Επιστρέφει αποτέλεσμα αντί να πετάει: το «δεν βρέθηκε κείμενο» ΔΕΝ είναι
 * σφάλμα πια — είναι η ένδειξη ότι το αρχείο είναι σαρωμένο και πρέπει να
 * περάσει από OCR (lib/ocr/read.ts). Ο καλών αποφασίζει, όχι αυτή η μονάδα.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024
/** Κάτω από αυτό δεν υπάρχει πρόταση να αναλυθεί — το αρχείο είναι σαρωμένο. */
export const MIN_TEXT_CHARS = 200

export type ExtractFailure = 'unsupported' | 'too-large' | 'no-text' | 'failed'

export type ExtractOutcome =
  | { ok: true; text: string; pageCount: number | null }
  | { ok: false; reason: ExtractFailure; message: string }

const PDF_TYPES = new Set(['application/pdf'])
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export function isSupportedProposalFile(mimeType: string, fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    PDF_TYPES.has(mimeType) ||
    DOCX_TYPES.has(mimeType) ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx')
  )
}

export async function extractProposalText(
  bytes: Buffer | Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<ExtractOutcome> {
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      message: `Το αρχείο ξεπερνά τα ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`,
    }
  }

  const lower = fileName.toLowerCase()
  const isPdf = PDF_TYPES.has(mimeType) || lower.endsWith('.pdf')
  const isDocx = DOCX_TYPES.has(mimeType) || lower.endsWith('.docx')

  if (!isPdf && !isDocx) {
    return { ok: false, reason: 'unsupported', message: 'Δεκτά είναι μόνο αρχεία PDF και DOCX.' }
  }

  let raw: { text: string; pageCount: number | null }
  try {
    raw = isPdf ? await extractPdf(bytes) : await extractDocx(bytes)
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: `${isPdf ? 'Το PDF' : 'Το DOCX'} δεν διαβάστηκε: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const text = normalizeWhitespace(raw.text)

  if (text.length < MIN_TEXT_CHARS) {
    return {
      ok: false,
      reason: 'no-text',
      message: isPdf
        ? 'Το PDF φαίνεται σαρωμένο — δεν έχει επιλέξιμο κείμενο.'
        : 'Το αρχείο DOCX δεν περιέχει αρκετό κείμενο για ανάλυση.',
    }
  }

  return { ok: true, text, pageCount: raw.pageCount }
}

async function extractPdf(bytes: Buffer | Uint8Array): Promise<{ text: string; pageCount: number | null }> {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  return { text: Array.isArray(text) ? text.join('\n\n') : text, pageCount: totalPages ?? null }
}

async function extractDocx(bytes: Buffer | Uint8Array): Promise<{ text: string; pageCount: number | null }> {
  const mammoth = await import('mammoth')
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  const { value } = await mammoth.extractRawText({ buffer })
  return { text: value, pageCount: null }
}

/**
 * Τα PDF βγάζουν συχνά μονά γράμματα ανά γραμμή και σελίδες γεμάτες κενά. Το
 * καθάρισμα εδώ γλιτώνει tokens σε κάθε τεμάχιο — και σε 50 σελίδες αυτό δεν
 * είναι κοσμητικό.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
