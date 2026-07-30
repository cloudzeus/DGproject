'use client'

import Link from 'next/link'
import { ArrowRight16Regular, Clock16Regular } from '@fluentui/react-icons'
import { PortalStatusBar } from './status-bar'
import { completionPct, totalOf, type StatusCounts } from './task-status'

export type PortalProjectCardData = {
  id: string
  name: string
  description: string | null
  color: string
  statusLabel: string
  dueDate: string | null
  counts: StatusCounts
  openQuestions: number
}

const fmtDate = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })

/** Ημέρες μέχρι την προθεσμία· αρνητικό = πέρασε. */
function daysUntil(iso: string): number {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Κάρτα έργου.
 *
 * Η ιεραρχία είναι: ποσοστό (το ένα νούμερο που θέλει ο πελάτης) → κατανομή
 * (πού είναι η υπόλοιπη δουλειά) → προθεσμία. Το χρώμα του έργου μπαίνει ως
 * λεπτή ταινία στην αριστερή ακμή: ταυτοποιεί χωρίς να διεκδικεί προσοχή από τα
 * status χρώματα της μπάρας, που φέρουν πραγματικό νόημα.
 */
export function PortalProjectCard({ project }: { project: PortalProjectCardData }) {
  const pct = completionPct(project.counts)
  const total = totalOf(project.counts)
  const days = project.dueDate ? daysUntil(project.dueDate) : null
  const overdue = days !== null && days < 0
  const soon = days !== null && days >= 0 && days <= 7

  return (
    <Link
      href={`/portal/projects/${project.id}`}
      className="group relative block overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white p-5 shadow-fluent-2 transition-shadow duration-150 hover:shadow-fluent-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue-500 focus-visible:ring-offset-2"
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: project.color }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold text-fluent-neutral-90">
            {project.name}
          </h3>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-fluent-neutral-60">
            {project.statusLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-semibold leading-none tabular-nums text-fluent-neutral-90">
            {pct}
            <span className="text-sm font-medium text-fluent-neutral-60">%</span>
          </p>
          <p className="mt-0.5 text-[10px] text-fluent-neutral-60 tabular-nums">
            {project.counts.done}/{total}
          </p>
        </div>
      </div>

      {project.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fluent-neutral-70">
          {project.description}
        </p>
      )}

      <div className="mt-4">
        <PortalStatusBar counts={project.counts} />
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-fluent-neutral-8 pt-3">
        {project.dueDate ? (
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] ${
              overdue
                ? 'font-semibold text-fluent-accent-red'
                : soon
                  ? 'font-semibold text-fluent-accent-orange'
                  : 'text-fluent-neutral-60'
            }`}
          >
            <Clock16Regular className="h-3.5 w-3.5" />
            {overdue
              ? `Εκπρόθεσμο ${Math.abs(days!)} ${Math.abs(days!) === 1 ? 'ημέρα' : 'ημέρες'}`
              : soon
                ? days === 0
                  ? 'Λήγει σήμερα'
                  : `Σε ${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`
                : fmtDate.format(new Date(project.dueDate))}
          </span>
        ) : (
          <span className="text-[11px] text-fluent-neutral-50">Χωρίς προθεσμία</span>
        )}

        {project.openQuestions > 0 && (
          <span className="rounded-full bg-fluent-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fluent-blue-700">
            {project.openQuestions} {project.openQuestions === 1 ? 'ερώτηση' : 'ερωτήσεις'}
          </span>
        )}

        <ArrowRight16Regular className="ml-auto h-4 w-4 shrink-0 text-fluent-neutral-40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fluent-blue-600" />
      </div>
    </Link>
  )
}
