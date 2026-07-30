import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { TICKET_PUBLIC_STATUS_LABEL, publicEventLabel } from '@/lib/tickets/status-labels';
import { PortalTicketReply } from './portal-ticket-reply';

export const dynamic = 'force-dynamic';

export default async function PortalTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      subject: true,
      body: true,
      status: true,
      createdAt: true,
      reporterEmail: true,
      resolutionSummary: true,
      events: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, payload: true, createdAt: true },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, direction: true, body: true, createdAt: true },
      },
      attachments: { select: { id: true, name: true, url: true } },
    },
  });
  // Ticket εκτός scope → 404, χωρίς να αποκαλύπτεται η ύπαρξή του.
  if (!ticket || !scope.emails.includes(ticket.reporterEmail.trim().toLowerCase())) notFound();

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium', timeStyle: 'short' });

  // Ίδιο σανιτισμένο λεξιλόγιο με το /t/{token} — ο πελάτης δεν πρέπει να
  // βλέπει δύο διαφορετικά ονόματα για την ίδια κατάσταση.
  const timeline = ticket.events
    .map((e) => {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = e.payload ? JSON.parse(e.payload) : null;
      } catch {}
      const label = publicEventLabel(e.type, payload);
      return label ? { id: e.id, label, at: e.createdAt } : null;
    })
    .filter((e): e is { id: string; label: string; at: Date } => e !== null);

  const canReply = !['closed', 'rejected', 'merged'].includes(ticket.status);

  return (
    <div className="max-w-2xl">
      <Link href="/portal/tickets" className="text-xs text-fluent-blue-600">
        ← Αιτήματα
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-fluent-neutral-90">{ticket.subject}</h1>
      <div className="mt-2 flex items-center gap-3">
        <span className="font-mono text-sm text-fluent-neutral-60">{ticket.code}</span>
        <span className="rounded-full bg-fluent-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
          {TICKET_PUBLIC_STATUS_LABEL[ticket.status]}
        </span>
        <span className="text-xs text-fluent-neutral-60">{fmt.format(ticket.createdAt)}</span>
      </div>

      <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50">
          Το αίτημα
        </p>
        <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap">{ticket.body}</p>
      </div>

      {ticket.attachments.length > 0 && (
        <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-2">
            Συνημμένα
          </p>
          <div className="flex flex-wrap gap-2">
            {ticket.attachments.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-20 w-20 rounded-lg object-cover border border-fluent-neutral-20"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {ticket.resolutionSummary && (
        <div className="mt-4 rounded-xl border border-[#b7e0b7] bg-[#f1faf1] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0f7b0f]">Λύση</p>
          <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap">
            {ticket.resolutionSummary}
          </p>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-2">
            Πορεία
          </p>
          {timeline.map((e) => (
            <div key={e.id} className="flex gap-3 py-1">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fluent-neutral-40" />
              <div>
                <p className="text-sm text-fluent-neutral-80">{e.label}</p>
                <p className="text-[11px] text-fluent-neutral-50">{fmt.format(e.at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {ticket.messages.length > 0 && (
        <div className="mt-4 space-y-3">
          {ticket.messages.map((m) => {
            const outbound = m.direction === 'outbound';
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${outbound ? 'bg-white border border-fluent-neutral-20' : 'bg-fluent-blue-50'}`}
                >
                  <p className="text-xs font-semibold text-fluent-neutral-60">
                    {outbound ? 'Η ομάδα' : 'Εσείς'}
                  </p>
                  <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap break-words">
                    {m.body}
                  </p>
                  <p className="mt-1 text-[11px] text-fluent-neutral-50">
                    {fmt.format(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canReply && (
        <PortalTicketReply ticketId={ticket.id} needsInfo={ticket.status === 'needs_info'} />
      )}
    </div>
  );
}
