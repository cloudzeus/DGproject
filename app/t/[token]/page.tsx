import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { TICKET_PUBLIC_STATUS_LABEL, publicEventLabel } from '@/lib/tickets/status-labels'

export const dynamic = 'force-dynamic'

// Public ticket status page — no auth, addressed by unguessable token.
// Shows only sanitized info: code, public status, event timeline.
export default async function TicketStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { publicToken: token },
    include: { events: { orderBy: { createdAt: 'asc' } }, source: { select: { name: true } } },
  })
  if (!ticket) notFound()

  const statusLabel = TICKET_PUBLIC_STATUS_LABEL[ticket.status]
  const isDone = ticket.status === 'resolved' || ticket.status === 'closed'
  const isRejected = ticket.status === 'rejected'
  const badgeColor = isDone ? '#0f7b0f' : isRejected ? '#a4262c' : '#0078d4'

  const events = ticket.events
    .map((e) => {
      let payload: Record<string, unknown> | null = null
      try {
        payload = e.payload ? JSON.parse(e.payload) : null
      } catch {}
      const label = publicEventLabel(e.type, payload)
      return label ? { id: e.id, label, at: e.createdAt } : null
    })
    .filter((e): e is { id: string; label: string; at: Date } => e !== null)

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className="min-h-screen bg-neutral-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Αίτημα υποστήριξης · {ticket.source.name}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">{ticket.subject}</h1>
        <div className="mt-3 flex items-center gap-3">
          <span className="font-mono text-sm text-neutral-600">{ticket.code}</span>
          <span
            className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: badgeColor }}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-8 space-y-0">
          {events.map((e, i) => (
            <div key={e.id} className="relative flex gap-3 pb-6 last:pb-0">
              {i < events.length - 1 && (
                <span className="absolute left-[5px] top-4 h-full w-px bg-neutral-200" aria-hidden />
              )}
              <span className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white bg-neutral-400 ring-1 ring-neutral-300" />
              <div>
                <p className="text-sm font-medium text-neutral-800">{e.label}</p>
                <p className="text-xs text-neutral-500">{fmt.format(e.at)}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
          Υποβλήθηκε {fmt.format(ticket.createdAt)}. Θα ενημερωθείτε με email για κάθε εξέλιξη.
        </p>
      </div>
    </main>
  )
}
