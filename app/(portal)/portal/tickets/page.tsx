import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { TICKET_PUBLIC_STATUS_LABEL } from '@/lib/tickets/status-labels';
import { NewTicketButton } from './new-ticket-button';

export const dynamic = 'force-dynamic';

/** Ίδιοι χρωματισμοί με το /t/{token}, ώστε ο πελάτης να βλέπει ένα σύστημα. */
function badgeColor(status: string) {
  if (status === 'resolved' || status === 'closed') return '#0f7b0f';
  if (status === 'rejected') return '#a4262c';
  if (status === 'needs_info') return '#c19c00';
  return '#0078d4';
}

export default async function PortalTickets() {
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  const tickets = await prisma.ticket.findMany({
    where: { reporterEmail: { in: scope.emails } },
    select: {
      id: true,
      code: true,
      subject: true,
      status: true,
      createdAt: true,
      reporterEmail: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-semibold text-fluent-neutral-90">Αιτήματα</h1>
        <NewTicketButton className="h-9 shrink-0 inline-flex items-center rounded-md bg-fluent-blue-600 px-3 text-sm font-medium text-white hover:bg-fluent-blue-700" />
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-fluent-neutral-60">Δεν έχετε υποβάλει αιτήματα ακόμα.</p>
      ) : (
        <div className="rounded-xl border border-fluent-neutral-20 bg-white divide-y divide-black/5">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/portal/tickets/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02]"
            >
              <span className="font-mono text-xs text-fluent-neutral-60 shrink-0 w-24 hidden sm:block">
                {t.code}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-fluent-neutral-90 truncate">{t.subject}</span>
                <span className="block text-xs text-fluent-neutral-60 truncate">
                  {fmt.format(t.createdAt)} · {t.reporterEmail}
                </span>
              </span>
              <span
                className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: badgeColor(t.status) }}
              >
                {TICKET_PUBLIC_STATUS_LABEL[t.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
