/**
 * Έλεγχος της απάντησης του μοντέλου.
 *
 * Ίδια φιλοσοφία με το lib/llm/providers/shared.ts: χειροποίητος έλεγχος αντί
 * για Zod, ώστε να μην μπει νέα εξάρτηση. Η διαφορά εδώ είναι ότι απορρίπτουμε
 * ενεργά αντικείμενα, δεν τα «διορθώνουμε» σιωπηλά:
 *
 *   - χωρίς τίτλο → πέταμα
 *   - χωρίς απόσπασμα → πέταμα, γιατί σημαίνει επινόηση
 *
 * Ένα κακό αντικείμενο που περνά είναι χειρότερο από ένα που λείπει: το πρώτο
 * μπαίνει σαν εργασία στο έργο και κανείς δεν το ξαναρωτά.
 */

import type { ChunkExtraction, ExtractedItem, ProposalItemKind, ProposalPriority } from './types'

const KINDS: ProposalItemKind[] = ['step', 'milestone', 'requirement']
const PRIORITIES: ProposalPriority[] = ['low', 'medium', 'high', 'urgent']
const MAX_TITLE = 200
const MAX_QUOTE = 2_000

export function parseChunkExtraction(raw: string): ChunkExtraction {
  const json = parseJsonLoose(raw)

  const summary = typeof json.summary === 'string' ? json.summary.trim() : ''
  const items = asArray(json.items)
    .map(parseItem)
    .filter((i): i is ExtractedItem => i !== null)

  return { summary, items }
}

function parseItem(value: unknown): ExtractedItem | null {
  if (!isObject(value)) return null

  const title = str(value.title).trim().slice(0, MAX_TITLE)
  if (title.length < 3) return null

  const sourceQuote = str(value.sourceQuote).trim().slice(0, MAX_QUOTE)
  if (sourceQuote.length === 0) return null

  const kind = KINDS.includes(value.kind as ProposalItemKind)
    ? (value.kind as ProposalItemKind)
    : 'step'

  return {
    kind,
    title,
    description: str(value.description).trim(),
    sourceQuote,
    confidence: clamp01(num(value.confidence, 0.5)),
    suggestedOffsetDays: positiveInt(value.suggestedOffsetDays),
    estimatedHours: positiveFloat(value.estimatedHours),
    priority: PRIORITIES.includes(value.priority as ProposalPriority)
      ? (value.priority as ProposalPriority)
      : null,
    requirementCategory:
      kind === 'requirement' ? nullableStr(value.requirementCategory) : null,
  }
}

/** Το αποτέλεσμα του τελικού περάσματος συγχώνευσης. */
export type MergeDecision = {
  kind: ProposalItemKind
  title: string
  description: string
  keepIndexes: number[]
}

export function parseMergeDecisions(raw: string, itemCount: number): MergeDecision[] {
  const json = parseJsonLoose(raw)

  return asArray(json.items)
    .map((value): MergeDecision | null => {
      if (!isObject(value)) return null
      const title = str(value.title).trim().slice(0, MAX_TITLE)
      if (title.length < 3) return null

      // Δείκτες εκτός ορίων σημαίνουν ότι το μοντέλο επινόησε αντικείμενο.
      const keepIndexes = asArray(value.keepIndexes)
        .map((n) => num(n, -1))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < itemCount)
      if (keepIndexes.length === 0) return null

      return {
        kind: KINDS.includes(value.kind as ProposalItemKind)
          ? (value.kind as ProposalItemKind)
          : 'step',
        title,
        description: str(value.description).trim(),
        keepIndexes,
      }
    })
    .filter((d): d is MergeDecision => d !== null)
}

function parseJsonLoose(raw: string): Record<string, unknown> {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  }

  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `Το μοντέλο δεν επέστρεψε έγκυρο JSON. Πρώτοι 200 χαρακτήρες: ${cleaned.slice(0, 200)}`,
    )
  }

  if (!isObject(json)) throw new Error('Η ρίζα του JSON δεν είναι αντικείμενο.')
  return json
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function nullableStr(v: unknown): string | null {
  const s = str(v).trim()
  return s.length > 0 ? s : null
}
function num(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
function positiveInt(v: unknown): number | null {
  const n = num(v, NaN)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}
function positiveFloat(v: unknown): number | null {
  const n = num(v, NaN)
  return Number.isFinite(n) && n > 0 ? n : null
}
