import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';

export const dynamic = 'force-dynamic';

/** Καταστάσεις που ο πελάτης αντιλαμβάνεται ως «ανοιχτό». */
const OPEN_TICKET_STATUSES = ['new', 'analyzing', 'triaged', 'converted', 'needs_info'] as const;

export default async function PortalHome() {
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  // Το layout δείχνει το empty state όταν λείπει scope — εδώ δεν φτάνουμε ποτέ
  // με null, αλλά ο έλεγχος κρατά το query ασφαλές αν αλλάξει η σειρά.
  if (!scope) return null;

  const [awaitingReply, openTickets, projects, pendingQuestions] = await Promise.all([
    prisma.ticket.findMany({
      where: { reporterEmail: { in: scope.emails }, status: 'needs_info' },
      select: { id: true, code: true, subject: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.ticket.count({
      where: { reporterEmail: { in: scope.emails }, status: { in: [...OPEN_TICKET_STATUSES] } },
    }),
    prisma.project.findMany({
      where: { id: { in: scope.projectIds }, status: { in: ['planning', 'active'] } },
      select: {
        id: true,
        name: true,
        color: true,
        dueDate: true,
        _count: { select: { tasks: true } },
        tasks: { where: { status: 'done' }, select: { id: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
      take: 6,
    }),
    prisma.taskQuestion.count({
      where: { askedToId: { in: scope.userIds }, answer: null },
    }),
  ]);

  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fluent-neutral-90">{scope.companyName}</h1>
        <p className="text-sm text-fluent-neutral-60 mt-0.5">
          {openTickets} ανοιχτά αιτήματα · {projects.length} ενεργά έργα
          {pendingQuestions > 0 && ` · ${pendingQuestions} ερωτήσεις για εσάς`}
        </p>
      </div>

      {awaitingReply.length > 0 && (
        <section className="rounded-xl border border-[#fde7a9] bg-[#fff9e6] p-4">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">
            Περιμένουμε την απάντησή σας
          </h2>
          <div className="mt-2 space-y-1">
            {awaitingReply.map((t) => (
              <Link
                key={t.id}
                href={`/portal/tickets/${t.id}`}
                className="flex items-center gap-3 text-sm hover:underline"
              >
                <span className="font-mono text-xs text-fluent-neutral-60 shrink-0">{t.code}</span>
                <span className="flex-1 truncate">{t.subject}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {pendingQuestions > 0 && (
        <section className="rounded-xl border border-fluent-blue-200 bg-fluent-blue-50/50 p-4">
          <p className="text-sm text-fluent-neutral-90">
            Η ομάδα έχει <strong>{pendingQuestions}</strong>{' '}
            {pendingQuestions === 1 ? 'ερώτηση' : 'ερωτήσεις'} που{' '}
            {pendingQuestions === 1 ? 'περιμένει' : 'περιμένουν'} απάντηση. Θα{' '}
            {pendingQuestions === 1 ? 'τη βρείτε' : 'τις βρείτε'} μέσα στις εργασίες των έργων σας.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-2">Έργα σε εξέλιξη</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-fluent-neutral-60">Κανένα ενεργό έργο.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const total = p._count.tasks;
              const done = p.tasks.length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <Link
                  key={p.id}
                  href={`/portal/projects/${p.id}`}
                  className="rounded-xl border border-fluent-neutral-20 bg-white p-4 hover:shadow-fluent-2 transition-shadow"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm font-medium text-fluent-neutral-90 truncate">
                      {p.name}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-black/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-fluent-blue-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-fluent-neutral-60">
                    {done}/{total} εργασίες ({pct}%)
                    {p.dueDate && ` · προθεσμία ${fmtDate.format(p.dueDate)}`}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
