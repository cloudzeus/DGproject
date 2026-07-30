/**
 * Ο ενορχηστρωτής της ανάλυσης.
 *
 * ΠΟΤΕ δεν πετάει εξαίρεση — ίδιο μοτίβο με το lib/tickets/triage.ts. Αποτυχία
 * σημαίνει γραμμή σε `failed` με γεμάτο `aiError`, ώστε ο χρήστης να δει τι
 * έφταιξε και να ξαναπροσπαθήσει. Μια εξαίρεση που ανεβαίνει σε fire-and-forget
 * κλήση δεν τη διαβάζει κανείς.
 *
 * Ανθεκτικότητα κατά επίπεδα:
 *   - ένα τεμάχιο που αποτυγχάνει δεν ρίχνει τα υπόλοιπα
 *   - αν ΟΛΑ τα τεμάχια αποτύχουν, τότε μόνο αποτυγχάνει η ανάλυση
 *   - αν το τελικό πέρασμα συγχώνευσης αποτύχει, κρατάμε το απλό dedupe
 */

import { prisma } from '@/lib/prisma'
import { chunkText } from './chunk'
import { buildNameMap, maskProposalPII, pseudonymizeNames, restoreNames, type NameMap } from './mask'
import { dedupeItems, sortItems } from './merge'
import { parseChunkExtraction, parseMergeDecisions } from './parse'
import { buildMergePrompt, buildProposalPrompt } from './prompt'
import { callProposalLlm } from './llm'
import type { ExtractedItem, ProposalProjectContext } from './types'

/** Πάνω από αυτό το πλήθος τεμαχίων σταματάμε: η πρόταση δεν είναι πρόταση. */
const MAX_CHUNKS = 40

export async function runProposalAnalysis(analysisId: string): Promise<void> {
  const analysis = await prisma.proposalAnalysis.findUnique({
    where: { id: analysisId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          startDate: true,
          dueDate: true,
          primaryCompany: { select: { NAME: true } },
          companies: { select: { company: { select: { NAME: true } } } },
        },
      },
    },
  })
  if (!analysis) return
  if (analysis.status === 'analyzing') {
    // Επανεκκίνηση από τον sweeper: προχωράμε μόνο αν κόλλησε πραγματικά.
    const stuckFor = Date.now() - analysis.updatedAt.getTime()
    if (stuckFor < STUCK_AFTER_MS) return
  }

  await prisma.proposalAnalysis.update({
    where: { id: analysisId },
    data: { status: 'analyzing', aiError: null },
  })

  try {
    const context: ProposalProjectContext = {
      projectName: analysis.project.name,
      projectDescription: analysis.project.description,
      startDate: analysis.project.startDate,
      dueDate: analysis.project.dueDate,
    }

    const nameMap = buildNameMap([
      analysis.project.name,
      analysis.project.primaryCompany?.NAME ?? '',
      ...analysis.project.companies.map((c) => c.company.NAME),
    ])

    const result = await analyzeText(analysis.extractedText, context, nameMap)

    await persistItems(analysisId, result.items)

    await prisma.proposalAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'ready',
        aiError: result.partialError,
        summary: result.summary,
        chunkCount: result.chunkCount,
        provider: result.usage.provider,
        model: result.usage.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: result.usage.durationMs,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[proposals] η ανάλυση ${analysisId} απέτυχε:`, message)
    await prisma.proposalAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', aiError: message.slice(0, 2000) },
    })
  }
}

export const STUCK_AFTER_MS = 15 * 60 * 1000

type AnalyzeOutcome = {
  items: ExtractedItem[]
  summary: string
  chunkCount: number
  /** Μη θανατηφόρα αστοχία — η ανάλυση πέτυχε αλλά όχι ολόκληρη. */
  partialError: string | null
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number; durationMs: number }
}

/**
 * Το καθαρό κομμάτι: κείμενο μέσα, αντικείμενα έξω. Χωρίς βάση — έτσι
 * ελέγχεται με ψεύτικο LLM.
 */
export async function analyzeText(
  rawText: string,
  context: ProposalProjectContext,
  nameMap: NameMap,
): Promise<AnalyzeOutcome> {
  const masked = pseudonymizeNames(maskProposalPII(rawText), nameMap)
  const chunks = chunkText(masked)

  if (chunks.length === 0) throw new Error('Το κείμενο της πρότασης είναι κενό.')
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `Η πρόταση είναι πολύ μεγάλη (${chunks.length} τμήματα, όριο ${MAX_CHUNKS}). Ανέβασε μόνο το μέρος με το αντικείμενο του έργου.`,
    )
  }

  const usage = { provider: 'deepseek', model: '', inputTokens: 0, outputTokens: 0, durationMs: 0 }
  const collected: ExtractedItem[] = []
  const summaries: string[] = []
  const failures: number[] = []

  // Σειριακά, όχι παράλληλα: το DeepSeek περιορίζει ρυθμό, και μια πρόταση
  // 50 σελίδων που αποτυγχάνει ολόκληρη σε rate limit είναι χειρότερη από μια
  // που αργεί ένα λεπτό παραπάνω.
  for (const chunk of chunks) {
    try {
      const { system, user } = buildProposalPrompt({
        chunkText: chunk.text,
        chunkIndex: chunk.index,
        chunkTotal: chunks.length,
        context,
      })
      const res = await callProposalLlm({ system, user })
      accumulate(usage, res)

      const parsed = parseChunkExtraction(res.raw)
      collected.push(...parsed.items)
      if (parsed.summary) summaries.push(parsed.summary)
    } catch (err) {
      console.error(`[proposals] τμήμα ${chunk.index + 1}/${chunks.length}:`, err)
      failures.push(chunk.index + 1)
    }
  }

  if (failures.length === chunks.length) {
    throw new Error('Καμία ενότητα της πρότασης δεν αναλύθηκε. Δες αν είναι διαθέσιμο το DeepSeek.')
  }

  let items = sortItems(dedupeItems(collected))
  let partialError =
    failures.length > 0
      ? `Δεν αναλύθηκαν τα τμήματα: ${failures.join(', ')} από ${chunks.length}. Το υπόλοιπο πέρασε κανονικά.`
      : null

  // Τελικό πέρασμα μόνο όταν υπήρξε τεμαχισμός — αλλιώς δεν υπάρχουν σύνορα
  // να ενωθούν και η κλήση είναι σκέτο κόστος.
  if (chunks.length > 1 && items.length > 1) {
    try {
      items = await mergePass(items, context, usage)
    } catch (err) {
      console.error('[proposals] το πέρασμα συγχώνευσης απέτυχε:', err)
      partialError = [partialError, 'Η τελική συγχώνευση δεν έγινε — μπορεί να δεις διπλές εγγραφές.']
        .filter(Boolean)
        .join(' ')
    }
  }

  return {
    items: items.map((item) => restoreItemNames(item, nameMap)),
    summary: restoreNames(summaries.join('\n\n').slice(0, 4000), nameMap),
    chunkCount: chunks.length,
    partialError,
    usage,
  }
}

async function mergePass(
  items: ExtractedItem[],
  context: ProposalProjectContext,
  usage: AnalyzeOutcome['usage'],
): Promise<ExtractedItem[]> {
  const { system, user } = buildMergePrompt(
    items.map((i) => ({ kind: i.kind, title: i.title, description: i.description })),
    context,
  )
  const res = await callProposalLlm({ system, user })
  accumulate(usage, res)

  const decisions = parseMergeDecisions(res.raw, items.length)
  if (decisions.length === 0) throw new Error('Το πέρασμα συγχώνευσης δεν επέστρεψε αντικείμενα.')

  // Ό,τι το μοντέλο δεν άγγιξε επιβιώνει αυτούσιο: η συγχώνευση τακτοποιεί,
  // δεν πετάει. Μια απαίτηση που ξεχάστηκε στο τελικό πέρασμα θα ήταν σιωπηλή
  // απώλεια συμφωνημένου εύρους.
  const used = new Set<number>()
  const merged: ExtractedItem[] = decisions.map((d) => {
    const sources = d.keepIndexes.map((i) => items[i])
    sources.forEach((_, k) => used.add(d.keepIndexes[k]))
    const primary = sources[0]
    return {
      ...primary,
      kind: d.kind,
      title: d.title || primary.title,
      description: d.description || primary.description,
      confidence: Math.max(...sources.map((s) => s.confidence)),
    }
  })

  const untouched = items.filter((_, i) => !used.has(i))
  return sortItems([...merged, ...untouched])
}

function restoreItemNames(item: ExtractedItem, map: NameMap): ExtractedItem {
  return {
    ...item,
    title: restoreNames(item.title, map),
    description: restoreNames(item.description, map),
    sourceQuote: restoreNames(item.sourceQuote, map),
  }
}

function accumulate(
  usage: AnalyzeOutcome['usage'],
  res: { model: string; inputTokens: number; outputTokens: number; durationMs: number },
): void {
  usage.model = res.model
  usage.inputTokens += res.inputTokens
  usage.outputTokens += res.outputTokens
  usage.durationMs += res.durationMs
}

/**
 * Γράφει τα αντικείμενα, σεβόμενο ό,τι πείραξε ο άνθρωπος.
 *
 * Σβήνονται ΜΟΝΟ τα προσχέδια που έφτιαξε το μοντέλο μόνο του. Επιβιώνουν:
 *   - ό,τι μετατράπηκε σε εργασία ή απαίτηση (`converted`)
 *   - ό,τι απορρίφθηκε ρητά (`rejected`) — αλλιώς επανεμφανίζεται σε κάθε
 *     προσπάθεια και ο χρήστης το απορρίπτει ξανά και ξανά
 *   - ό,τι αντικαταστάθηκε (`replaced`), για την ιχνηλασία
 *   - ό,τι πρόσθεσε ο χρήστης με το χέρι (`manual`)
 *   - ό,τι προέκυψε από διευκρίνιση (`regeneratedFromId`) — εκεί μέσα υπάρχει
 *     ανθρώπινη γνώση που το έγγραφο δεν έχει· μια νέα ανάλυση θα την έσβηνε
 *     και θα ξαναέφερνε ακριβώς αυτό που ο χρήστης διόρθωσε
 */
export async function persistItems(analysisId: string, items: ExtractedItem[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.proposalItem.deleteMany({
      where: { analysisId, status: 'draft', manual: false, regeneratedFromId: null },
    })

    if (items.length === 0) return

    await tx.proposalItem.createMany({
      data: items.map((item, index) => ({
        analysisId,
        kind: item.kind,
        order: index,
        title: item.title,
        description: item.description || null,
        suggestedOffsetDays: item.suggestedOffsetDays,
        estimatedHours: item.estimatedHours,
        priority: item.priority,
        requirementCategory: item.requirementCategory,
        sourceQuote: item.sourceQuote,
        confidence: item.confidence,
      })),
    })
  })
}
