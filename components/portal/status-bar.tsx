import {
  PORTAL_TASK_STATES,
  TASK_STATE_META,
  totalOf,
  type StatusCounts,
} from './task-status'

/**
 * Οριζόντια stacked μπάρα κατανομής εργασιών.
 *
 * Γιατί όχι δαχτυλίδι/ντόνατ ολοκλήρωσης: για ΕΝΑΝ αριθμό (το %) η σωστή μορφή
 * είναι ο ίδιος ο αριθμός — ένα ring δεν προσθέτει πληροφορία, μόνο διακόσμηση.
 * Η μπάρα κερδίζει τη θέση της επειδή δείχνει κάτι που ο αριθμός δεν δείχνει:
 * ΠΟΥ βρίσκεται η υπόλοιπη δουλειά.
 *
 * Προδιαγραφές marks (dataviz): 2px κενό επιφάνειας ανάμεσα στα τμήματα ώστε να
 * διαβάζονται τα όρια χωρίς περίγραμμα, στρογγυλά άκρα 4px μόνο στις άκρες της
 * μπάρας, και ποτέ ταυτότητα μόνο με χρώμα — κάθε τμήμα φέρει `title` και το
 * legend από κάτω δίνει ετικέτα + αριθμό.
 */
export function PortalStatusBar({
  counts,
  showLegend = true,
  height = 'h-2',
}: {
  counts: StatusCounts
  showLegend?: boolean
  height?: string
}) {
  const total = totalOf(counts)
  const present = PORTAL_TASK_STATES.filter((s) => counts[s] > 0)

  if (total === 0) {
    return (
      <div className={`${height} rounded-full bg-fluent-neutral-8`} aria-hidden />
    )
  }

  return (
    <div>
      <div
        className={`flex ${height} gap-[2px] overflow-hidden rounded-full`}
        role="img"
        aria-label={present
          .map((s) => `${TASK_STATE_META[s].label}: ${counts[s]}`)
          .join(', ')}
      >
        {present.map((s) => (
          <div
            key={s}
            className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-300 ease-[cubic-bezier(0.33,0,0.67,1)]"
            style={{
              width: `${(counts[s] / total) * 100}%`,
              backgroundColor: TASK_STATE_META[s].color,
            }}
            title={`${TASK_STATE_META[s].label}: ${counts[s]} από ${total}`}
          />
        ))}
      </div>

      {showLegend && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {present.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: TASK_STATE_META[s].color }}
                aria-hidden
              />
              <span className="text-fluent-neutral-70">{TASK_STATE_META[s].label}</span>
              <span className="font-semibold tabular-nums text-fluent-neutral-90">
                {counts[s]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
