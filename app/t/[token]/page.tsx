import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { TICKET_PUBLIC_STATUS_LABEL, publicEventLabel } from '@/lib/tickets/status-labels'
import { PublicReplyForm } from '@/components/tickets/public-reply-form'

export const dynamic = 'force-dynamic'

type TicketEventRow = { id: string; type: string; payload: string | null; createdAt: Date }

function toPublicTimeline(events: TicketEventRow[]) {
  return events
    .map((e) => {
      let payload: Record<string, unknown> | null = null
      try {
        payload = e.payload ? JSON.parse(e.payload) : null
      } catch {}
      const label = publicEventLabel(e.type, payload)
      return label ? { id: e.id, label, at: e.createdAt } : null
    })
    .filter((e): e is { id: string; label: string; at: Date } => e !== null)
}

function Timeline({ events, fmt }: { events: { id: string; label: string; at: Date }[]; fmt: Intl.DateTimeFormat }) {
  return (
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
  )
}

function badgeColorFor(status: string) {
  const isDone = status === 'resolved' || status === 'closed'
  const isRejected = status === 'rejected'
  return isDone ? '#0f7b0f' : isRejected ? '#a4262c' : '#0078d4'
}

// Public ticket status page — no auth, addressed by unguessable token.
// Shows only sanitized info: code, public status, event timeline, thread, attachments.
export default async function TicketStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { publicToken: token },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
      source: { select: { name: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      attachments: { select: { id: true, name: true, url: true, mimeType: true } },
    },
  })
  if (!ticket) notFound()

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium', timeStyle: 'short' })

  // Merged proxy view: show the primary ticket's progress (sanitized), no reply form.
  if (ticket.mergedIntoId) {
    const primary = await prisma.ticket.findUnique({
      where: { id: ticket.mergedIntoId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })
    if (!primary) notFound()

    const primaryStatusLabel = TICKET_PUBLIC_STATUS_LABEL[primary.status]
    const primaryEvents = toPublicTimeline(primary.events)

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
              style={{ backgroundColor: badgeColorFor(primary.status) }}
            >
              {primaryStatusLabel}
            </span>
          </div>

          <p className="mt-4 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-700">
            Το αίτημά σας συγχωνεύθηκε με άλλο σχετικό αίτημα — η πορεία εμφανίζεται παρακάτω.
          </p>

          <Timeline events={primaryEvents} fmt={fmt} />

          <p className="mt-8 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
            Υποβλήθηκε {fmt.format(ticket.createdAt)}. Θα ενημερωθείτε με email για κάθε εξέλιξη.
          </p>
        </div>
      </main>
    )
  }

  const statusLabel = TICKET_PUBLIC_STATUS_LABEL[ticket.status]
  const events = toPublicTimeline(ticket.events)
  const canReply = !['closed', 'rejected', 'merged'].includes(ticket.status)

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
            style={{ backgroundColor: badgeColorFor(ticket.status) }}
          >
            {statusLabel}
          </span>
        </div>

        <Timeline events={events} fmt={fmt} />

        {ticket.attachments.length > 0 && (
          <div className="mt-8 border-t border-neutral-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Συνημμένα</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ticket.attachments.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-24 w-24 rounded-lg object-cover border border-neutral-200"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {ticket.messages.length > 0 && (
          <div className="mt-8 border-t border-neutral-100 pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Συνομιλία</p>
            {ticket.messages.map((m) => {
              const outbound = m.direction === 'outbound'
              return (
                <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-lg p-3 ${outbound ? 'bg-[#eff6fc]' : 'bg-neutral-100'}`}
                  >
                    <p className="text-xs font-semibold text-neutral-500">
                      {outbound ? 'Η ομάδα' : 'Εσείς'}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{m.body}</p>
                    <p className="mt-1 text-xs text-neutral-500">{fmt.format(m.createdAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {canReply && (
          <div className="mt-8 border-t border-neutral-100 pt-4">
            {ticket.status === 'needs_info' && (
              <p className="rounded-lg bg-[#fff4ce] p-3 text-sm text-neutral-800">
                Η ομάδα περιμένει την απάντησή σας για να συνεχίσει.
              </p>
            )}
            <PublicReplyForm code={ticket.code} token={token} />
          </div>
        )}

        <p className="mt-8 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
          Υποβλήθηκε {fmt.format(ticket.createdAt)}. Θα ενημερωθείτε με email για κάθε εξέλιξη.
        </p>
      </div>
    </main>
  )
}
