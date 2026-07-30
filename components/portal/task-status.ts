/**
 * Η κατάσταση εργασιών όπως τη βλέπει ο πελάτης.
 *
 * Οι πέντε εσωτερικές καταστάσεις συμπτύσσονται σε τέσσερις: το `backlog` και το
 * `todo` είναι και τα δύο «δεν ξεκίνησε» για τον πελάτη — η διάκρισή τους είναι
 * εσωτερικός προγραμματισμός και δεν του λέει τίποτα.
 *
 * ── Χρώματα ─────────────────────────────────────────────────────────────────
 * Status palette, ΟΧΙ κατηγορική: κάθε χρώμα σημαίνει κατάσταση και δεν
 * ανακυκλώνεται ποτέ ως «σειρά Ν». Επικυρωμένα με τον validator του dataviz
 * (light surface): lightness band PASS, CVD separation PASS (χειρότερο γειτονικό
 * ζεύγος ΔE 12.9 deutan), contrast vs surface PASS (όλα ≥3:1).
 *
 * Μία σκόπιμη απόκλιση: το γκρι `#8A8A8A` κόβεται στο chroma floor. Ο έλεγχος
 * υπάρχει για να μη χρησιμοποιείται γκρι ως κατηγορική ταυτότητα· εδώ είναι η
 * σημασιολογική κατάσταση «δεν ξεκίνησε», και συνοδεύεται πάντα από ετικέτα και
 * legend, οπότε η ταυτότητα δεν στηρίζεται ποτέ στο χρώμα μόνο.
 */

export type PortalTaskState = 'notStarted' | 'inProgress' | 'inReview' | 'done'

/** Η σειρά είναι η ροή της δουλειάς — καθορίζει και τη σειρά στο stacked bar. */
export const PORTAL_TASK_STATES: PortalTaskState[] = [
  'done',
  'inProgress',
  'inReview',
  'notStarted',
]

export const TASK_STATE_META: Record<
  PortalTaskState,
  { label: string; color: string; textClass: string }
> = {
  done: { label: 'Ολοκληρωμένες', color: '#107C10', textClass: 'text-[#107C10]' },
  inProgress: { label: 'Σε εξέλιξη', color: '#0078D4', textClass: 'text-[#0078D4]' },
  inReview: { label: 'Σε έλεγχο', color: '#D83B01', textClass: 'text-[#D83B01]' },
  notStarted: { label: 'Δεν ξεκίνησαν', color: '#8A8A8A', textClass: 'text-fluent-neutral-60' },
}

/** Εσωτερική κατάσταση → αυτό που βλέπει ο πελάτης. */
export function toPortalState(status: string): PortalTaskState {
  switch (status) {
    case 'done':
      return 'done'
    case 'in_progress':
      return 'inProgress'
    case 'review':
      return 'inReview'
    default:
      return 'notStarted'
  }
}

export type StatusCounts = Record<PortalTaskState, number>

export function emptyCounts(): StatusCounts {
  return { done: 0, inProgress: 0, inReview: 0, notStarted: 0 }
}

export function countByState(statuses: string[]): StatusCounts {
  const counts = emptyCounts()
  for (const s of statuses) counts[toPortalState(s)]++
  return counts
}

export function totalOf(counts: StatusCounts): number {
  return PORTAL_TASK_STATES.reduce((n, s) => n + counts[s], 0)
}

/** Ποσοστό ολοκλήρωσης, στρογγυλοποιημένο. 0 όταν δεν υπάρχουν εργασίες. */
export function completionPct(counts: StatusCounts): number {
  const total = totalOf(counts)
  return total ? Math.round((counts.done / total) * 100) : 0
}
