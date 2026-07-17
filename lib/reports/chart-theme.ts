// Μοναδικό σημείο αλήθειας για χρώματα charts στα reports.
// Παλέτες validated με το dataviz validate_palette.js σε surface #FFFFFF
// (όλα τα checks PASS, 2026-07-17). ΜΗΝ προσθέσεις χρώμα χωρίς re-validation.

/** Σταθερή αντιστοίχιση TaskStatus → χρώμα, ίδια σε όλη τη σελίδα. */
export const STATUS_SERIES: Record<string, string> = {
  backlog: '#9C6A00',
  todo: '#0078D4',
  in_progress: '#D83B01',
  review: '#8764B8',
  done: '#107C10',
}

/** Categorical slots για πηγές/κατηγορίες. >6 σειρές ⇒ fold σε «Άλλο». */
export const CATEGORICAL = ['#0078D4', '#D83B01', '#8764B8', '#107C10', '#C239B3', '#9C6A00'] as const

/** Bars/trends μίας σειράς (magnitude) — ΠΟΤΕ εναλλαγή χρωμάτων ανά μπάρα. */
export const SINGLE_SERIES = '#0078D4'

/** Ζεύγος «εισερχόμενα vs επιλυμένα» — σταθερό παντού. */
export const FLOW = { incoming: '#D83B01', resolved: '#107C10' } as const

export const INK = {
  grid: '#E5E5E5',       // hairline gridlines
  axis: '#8A8A8A',       // axis ticks/labels
  label: '#5C5C5C',      // direct labels
} as const

/** Χρώματα δεικτών σύγκρισης — σημασιολογικά, όχι κατεύθυνσης. */
export const DELTA = { good: '#0E700E', bad: '#C50F1F', neutral: '#8A8A8A' } as const

/** Ομαδοποίηση TicketStatus για το 100% stacked bar (9 statuses → 6 σταθερές ομάδες). */
export const TICKET_STATUS_GROUPS: { key: string; label: string; statuses: string[]; color: string }[] = [
  { key: 'open', label: 'Ανοιχτά', statuses: ['new', 'analyzing'], color: CATEGORICAL[1] },
  { key: 'triaged', label: 'Ταξινομημένα', statuses: ['triaged'], color: CATEGORICAL[0] },
  { key: 'converted', label: 'Σε εργασία', statuses: ['converted'], color: CATEGORICAL[2] },
  { key: 'needs_info', label: 'Αναμονή χρήστη', statuses: ['needs_info'], color: CATEGORICAL[5] },
  { key: 'resolved', label: 'Επιλυμένα', statuses: ['resolved', 'closed'], color: CATEGORICAL[3] },
  { key: 'other', label: 'Απορ./Συγχων.', statuses: ['rejected', 'merged'], color: CATEGORICAL[4] },
]
