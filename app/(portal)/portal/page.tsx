import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { taskVisibilityFilter } from '@/lib/tasks/visibility';
import { listMilestones } from '@/lib/portal/timeline';
import { listSharedMeetings } from '@/lib/portal/meetings';
import { listSharedFiles } from '@/lib/portal/files';
import { PortalStat } from '@/components/portal/stat';
import { PortalProjectCard } from '@/components/portal/project-card';
import { PortalMilestones } from '@/components/portal/milestones';
import { NotificationGlyph, relativeTimeGr } from '@/components/portal/notification-glyph';
import { FileGlyph } from '@/components/portal/file-row';
import { countByState, completionPct, emptyCounts, totalOf } from '@/components/portal/task-status';

export const dynamic = 'force-dynamic';

const OPEN_TICKET_STATUSES = ['new', 'analyzing', 'triaged', 'converted', 'needs_info'] as const;

const PROJECT_STATUS_LABEL: Record<string, string> = {
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
};

/**
 * Το dashboard του πελάτη.
 *
 * ΔΙΑΤΑΞΗ: η δράση πάνω από την κατάσταση. Η προηγούμενη έκδοση έθαβε το
 * «χρειαζόμαστε την απάντησή σας» κάτω από τέσσερα πλακίδια που ο πελάτης έχει
 * ήδη διαβάσει — δηλαδή έβαζε την πληροφορία που δεν αλλάζει πάνω από αυτήν που
 * μπλοκάρει τη δουλειά.
 *
 * Η δεξιά στήλη απαντά στο «τι άλλαξε από την τελευταία φορά;», που είναι ο
 * λόγος που κάποιος ανοίγει ένα portal. Η αριστερή απαντά στο «πού βρισκόμαστε;».
 */
export default async function PortalHome() {
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  const [
    awaitingReply,
    openTickets,
    projects,
    pendingQuestions,
    milestones,
    activity,
    meetings,
    files,
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: { reporterEmail: { in: scope.emails }, status: 'needs_info' },
      select: { id: true, code: true, subject: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.ticket.count({
      where: { reporterEmail: { in: scope.emails }, status: { in: [...OPEN_TICKET_STATUSES] } },
    }),
    prisma.project.findMany({
      where: { id: { in: scope.projectIds }, status: { in: ['planning', 'active'] } },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        status: true,
        dueDate: true,
        tasks: { where: taskVisibilityFilter('customer'), select: { status: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
      take: 6,
    }),
    prisma.taskQuestion.findMany({
      // Ερώτηση σε εσωτερική εργασία δεν εμφανίζεται: ο πελάτης δεν βλέπει την
      // εργασία, οπότε η ερώτηση θα ήταν χωρίς συμφραζόμενα.
      where: {
        askedToId: { in: scope.userIds },
        answer: null,
        task: taskVisibilityFilter('customer'),
      },
      select: { task: { select: { projectId: true } } },
    }),
    listMilestones(scope, { horizonDays: 30 }),
    // Η «Πρόσφατη δραστηριότητα» ΕΙΝΑΙ η ροή ειδοποιήσεων. Δεν διαβάζει
    // Task/Attachment/Comment: ο έλεγχος ορατότητας έγινε μία φορά, στην εκπομπή
    // (lib/notifications/customer.ts), αντί για τέσσερις φορές εδώ.
    prisma.notification.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    listSharedMeetings(scope, { take: 3 }),
    listSharedFiles(scope, { take: 4 }),
  ]);

  const questionsByProject = new Map<string, number>();
  for (const q of pendingQuestions) {
    questionsByProject.set(
      q.task.projectId,
      (questionsByProject.get(q.task.projectId) ?? 0) + 1,
    );
  }

  // Συγκεντρωτικά για τα stat tiles: μία μέτρηση σε όλα τα ενεργά έργα.
  const overall = projects.reduce((acc, p) => {
    const c = countByState(p.tasks.map((t) => t.status));
    acc.done += c.done;
    acc.inProgress += c.inProgress;
    acc.inReview += c.inReview;
    acc.notStarted += c.notStarted;
    return acc;
  }, emptyCounts());

  const overallPct = completionPct(overall);
  const activeNow = overall.inProgress + overall.inReview;
  const needsYou = awaitingReply.length + pendingQuestions.length;
  const overdue = milestones.filter((m) => m.overdue).length;

  return (
    <div className="space-y-6">
      {/* ─── Hero ─── */}
      <header className="animate-fade-in">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
          Πύλη πελατών
        </p>
        <h1
          className="mt-1 line-clamp-2 font-display text-xl font-semibold leading-tight tracking-tight text-fluent-neutral-90 sm:text-2xl"
          title={scope.companyName}
        >
          {scope.companyName}
        </h1>
        <p className="mt-1.5 text-sm text-fluent-neutral-70">
          {projects.length > 0
            ? `${projects.length} ${projects.length === 1 ? 'ενεργό έργο' : 'ενεργά έργα'} · ${totalOf(overall)} εργασίες συνολικά`
            : 'Δεν υπάρχουν ενεργά έργα αυτή τη στιγμή.'}
        </p>
      </header>

      {/* ─── Χρειάζονται την προσοχή σας ───
          Πρώτο στη σελίδα, πριν από κάθε μετρικό: είναι το μόνο σημείο που
          ζητά ενέργεια, και η δουλειά έχει σταματήσει μέχρι να γίνει. */}
      {needsYou > 0 && (
        <section className="animate-fade-in rounded-xl border border-fluent-accent-orange/25 bg-[#fffaf5] p-5 shadow-fluent-2">
          <h2 className="font-display text-base font-semibold text-fluent-neutral-90">
            Χρειαζόμαστε την απάντησή σας
          </h2>
          <p className="mt-0.5 text-xs text-fluent-neutral-70">
            Η δουλειά περιμένει σε αυτά τα σημεία.
          </p>

          <div className="mt-3 space-y-1.5">
            {awaitingReply.map((t) => (
              <Link
                key={t.id}
                href={`/portal/tickets/${t.id}`}
                className="group flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2.5 transition-colors duration-150 hover:bg-white"
              >
                <svg className="h-4 w-4 shrink-0 text-fluent-accent-orange" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M3 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V7Z" />
                </svg>
                <span className="shrink-0 font-mono text-[11px] text-fluent-neutral-60">
                  {t.code}
                </span>
                <span className="flex-1 truncate text-sm text-fluent-neutral-90">{t.subject}</span>
                <svg className="h-4 w-4 shrink-0 text-fluent-neutral-40 transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}

            {pendingQuestions.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2.5">
                <svg className="h-4 w-4 shrink-0 text-fluent-blue-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3a2 2 0 0 1-1-2V6Z" strokeLinejoin="round" />
                </svg>
                <span className="flex-1 text-sm text-fluent-neutral-90">
                  <strong className="font-semibold">{pendingQuestions.length}</strong>{' '}
                  {pendingQuestions.length === 1 ? 'ερώτηση' : 'ερωτήσεις'} από την ομάδα, μέσα
                  στις εργασίες των έργων σας
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── Stat tiles ─── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PortalStat
          label="Ολοκλήρωση"
          value={overallPct}
          suffix="%"
          hint={`${overall.done} από ${totalOf(overall)} εργασίες`}
        />
        <PortalStat
          label="Σε εξέλιξη τώρα"
          value={activeNow}
          hint="εργασίες σε ενεργή δουλειά"
        />
        <PortalStat
          label="Ανοιχτά αιτήματα"
          value={openTickets}
          hint="υποστήριξη"
          href="/portal/tickets"
        />
        <PortalStat
          label="Ορόσημα 30 ημερών"
          value={milestones.length}
          tone={overdue > 0 ? 'attention' : 'neutral'}
          hint={overdue > 0 ? `${overdue} εκπρόθεσμα` : 'στο χρονοδιάγραμμα'}
          href="/portal/timeline"
        />
      </section>

      {/* ─── Κύριο σώμα: έργα αριστερά, «τι άλλαξε» δεξιά ─── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-fluent-neutral-90">
              Έργα σε εξέλιξη
            </h2>
            <Link
              href="/portal/projects"
              className="text-xs font-medium text-fluent-blue-600 hover:underline"
            >
              Όλα τα έργα
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-10 text-center">
              <p className="text-sm font-medium text-fluent-neutral-80">Κανένα ενεργό έργο</p>
              <p className="mt-1 text-xs text-fluent-neutral-60">
                Μόλις ξεκινήσει κάτι, θα το δείτε εδώ με την πορεία του.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {projects.map((p) => (
                <PortalProjectCard
                  key={p.id}
                  project={{
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    color: p.color,
                    statusLabel: PROJECT_STATUS_LABEL[p.status] ?? p.status,
                    dueDate: p.dueDate?.toISOString() ?? null,
                    counts: countByState(p.tasks.map((t) => t.status)),
                    openQuestions: questionsByProject.get(p.id) ?? 0,
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Sticky σε lg+: η δεξιά στήλη μένει στο πλάι ενώ ο πελάτης κυλά τα
            έργα. Σε mobile στοιβάζεται από κάτω, με τα έργα πρώτα. */}
        <aside className="space-y-5 lg:sticky lg:top-[4.5rem] lg:self-start">
          <RailCard title="Επόμενα ορόσημα" href="/portal/timeline" linkLabel="Χρονοδιάγραμμα">
            <PortalMilestones milestones={milestones.slice(0, 5)} compact />
          </RailCard>

          <RailCard
            title="Πρόσφατη δραστηριότητα"
            href="/portal/notifications"
            linkLabel="Όλες"
          >
            {activity.length === 0 ? (
              <p className="py-3 text-xs text-fluent-neutral-60">
                Δεν έχει καταγραφεί δραστηριότητα ακόμα.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {activity.map((n) => {
                  const body = (
                    <>
                      <NotificationGlyph type={n.type} className="h-7 w-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fluent-neutral-90">
                          {n.title}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-fluent-neutral-60">
                          {n.message}
                        </span>
                        <span className="mt-0.5 block text-[10px] tabular-nums text-fluent-neutral-50">
                          {relativeTimeGr(n.createdAt.toISOString())}
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-fluent-neutral-4"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-2.5 px-0 py-1.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </RailCard>

          {meetings.length > 0 && (
            <RailCard title="Πρόσφατα πρακτικά" href="/portal/meetings" linkLabel="Όλα">
              <ul className="space-y-2.5">
                {meetings.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/portal/meetings/${m.id}`}
                      className="-mx-2 block rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-fluent-neutral-4"
                    >
                      <span className="block truncate text-[13px] font-medium text-fluent-neutral-90">
                        {m.subject}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-fluent-neutral-60">
                        {new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' }).format(
                          new Date(m.startedAt),
                        )}{' '}
                        · {m.projectName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RailCard>
          )}

          {files.length > 0 && (
            <RailCard title="Πρόσφατα αρχεία" href="/portal/files" linkLabel="Όλα">
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={f.name}
                      className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-fluent-neutral-4"
                    >
                      <FileGlyph mimeType={f.mimeType} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fluent-neutral-90">
                          {f.title || f.name}
                        </span>
                        <span className="block truncate text-[11px] text-fluent-neutral-60">
                          {f.projectName ?? 'Έργο'}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </RailCard>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * Κάρτα της δεξιάς στήλης. Ίδιο κέλυφος για κάθε μπλοκ ώστε η στήλη να
 * διαβάζεται ως ένα πράγμα με ενότητες, όχι ως τέσσερα ανεξάρτητα widget.
 */
function RailCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-fluent-neutral-10 bg-white p-4 shadow-fluent-2">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
          {title}
        </h2>
        <Link href={href} className="text-[11px] font-medium text-fluent-blue-600 hover:underline">
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}
