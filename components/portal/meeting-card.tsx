import Link from 'next/link'
import type { PortalMeetingSummary } from '@/lib/portal/meetings'

/**
 * Κάρτα σύσκεψης στη λίστα πρακτικών.
 *
 * Τα μετρητικά είναι ΜΕΤΑ το φίλτρο, όχι πριν: δείχνουν τι θα βρει ο πελάτης αν
 * ανοίξει, όχι τι συζητήθηκε συνολικά. Ένα «3 ρίσκα» πάνω σε πρακτικά που
 * δημοσιεύτηκαν χωρίς ρίσκα θα ήταν ψέμα προς δύο κατευθύνσεις ταυτόχρονα.
 */

function duration(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}′`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h}ω ${rest}′` : `${h}ω`
}

export function PortalMeetingCard({
  meeting,
  showProject = true,
}: {
  meeting: PortalMeetingSummary
  showProject?: boolean
}) {
  const { counts } = meeting

  const chips = [
    counts.decisions > 0 && `${counts.decisions} αποφάσεις`,
    counts.actionItems > 0 && `${counts.actionItems} ενέργειες`,
    counts.openQuestions > 0 && `${counts.openQuestions} ερωτήματα`,
    counts.risks > 0 && `${counts.risks} ρίσκα`,
  ].filter(Boolean) as string[]

  return (
    <Link
      href={`/portal/meetings/${meeting.id}`}
      className="group block rounded-xl border border-fluent-neutral-10 bg-white p-4 shadow-fluent-2 transition-shadow duration-150 hover:shadow-fluent-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue-500"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${meeting.projectColor}1A` }}
          aria-hidden
        >
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 20 20"
            fill="none"
            stroke={meeting.projectColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm3-2v2m6-2v2M4 8h12" />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fluent-neutral-90">
            {meeting.subject}
          </p>
          <p className="mt-0.5 text-[11px] text-fluent-neutral-60">
            {new Intl.DateTimeFormat('el-GR', {
              dateStyle: 'full',
            }).format(new Date(meeting.startedAt))}{' '}
            · {duration(meeting.durationSec)}
            {showProject && ` · ${meeting.projectName}`}
          </p>
        </div>

        <svg
          className="mt-1 h-4 w-4 shrink-0 text-fluent-neutral-40 transition-transform duration-150 group-hover:translate-x-0.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-md bg-fluent-neutral-6 px-2 py-0.5 text-[11px] font-medium text-fluent-neutral-70"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
