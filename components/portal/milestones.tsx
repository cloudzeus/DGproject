import Link from 'next/link'
import type { Milestone } from '@/lib/portal/timeline'

/**
 * Λίστα οροσήμων με κάθετη γραμμή χρόνου.
 *
 * Το εκπρόθεσμο σημειώνεται με πορτοκαλί ΚΟΥΚΙΔΑ και ετικέτα, όχι με βαμμένο
 * κείμενο: το μελάνι μένει αναγνώσιμο και ο τόνος μεταφέρεται από το accent.
 * Ίδια αρχή με τα stat tiles — ο αριθμός δεν βάφεται ποτέ.
 */

const fmtDay = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' })
const fmtFull = new Intl.DateTimeFormat('el-GR', { dateStyle: 'full' })

function daysFromToday(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/** «σε 3 ημέρες», «σήμερα», «πριν 2 ημέρες» — ο πελάτης σκέφτεται σε αποστάσεις. */
function distanceLabel(iso: string): string {
  const d = daysFromToday(iso)
  if (d === 0) return 'σήμερα'
  if (d === 1) return 'αύριο'
  if (d === -1) return 'χθες'
  if (d > 1) return `σε ${d} ημέρες`
  return `πριν ${Math.abs(d)} ημέρες`
}

export function PortalMilestones({
  milestones,
  compact = false,
  showProject = true,
}: {
  milestones: Milestone[]
  compact?: boolean
  showProject?: boolean
}) {
  if (milestones.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-4 py-6 text-center text-xs text-fluent-neutral-60">
        Καμία προθεσμία στον ορίζοντα.
      </p>
    )
  }

  return (
    <ol className="relative space-y-0">
      {/* Η κάθετη γραμμή σταματά στο τελευταίο στοιχείο, δεν κρέμεται από κάτω. */}
      <span
        className="absolute bottom-3 left-[5px] top-3 w-px bg-fluent-neutral-10"
        aria-hidden
      />

      {milestones.map((m) => (
        <li key={m.id} className="relative flex gap-3 py-2 pl-0">
          <span
            className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white ${
              m.overdue
                ? 'bg-fluent-accent-orange'
                : m.done
                  ? 'bg-fluent-accent-green'
                  : ''
            }`}
            style={
              !m.overdue && !m.done ? { backgroundColor: m.projectColor } : undefined
            }
            aria-hidden
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/portal/projects/${m.projectId}`}
                className={`min-w-0 flex-1 truncate text-fluent-neutral-90 hover:text-fluent-blue-600 hover:underline ${
                  compact ? 'text-[13px]' : 'text-sm'
                } ${m.kind === 'project' ? 'font-semibold' : 'font-medium'}`}
                title={m.title}
              >
                {m.title}
              </Link>
              <time
                dateTime={m.date}
                title={fmtFull.format(new Date(m.date))}
                className="shrink-0 text-[11px] tabular-nums text-fluent-neutral-60"
              >
                {fmtDay.format(new Date(m.date))}
              </time>
            </div>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fluent-neutral-60">
              <span>{distanceLabel(m.date)}</span>
              {showProject && m.kind === 'task' && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{m.projectName}</span>
                </>
              )}
              {m.overdue && (
                <span className="rounded bg-[#D83B01]/10 px-1.5 py-px font-medium text-fluent-accent-orange">
                  εκπρόθεσμο
                </span>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
