import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { commentVisibilityFilter } from '@/lib/comments/visibility';
import { taskVisibilityFilter } from '@/lib/tasks/visibility';
import { attachmentVisibilityFilter } from '@/lib/attachments/visibility';
import { PortalTeam } from './portal-team';
import { PortalFiles } from './portal-files';
import { PortalStatusBar } from '@/components/portal/status-bar';
import { countByState, completionPct, totalOf } from '@/components/portal/task-status';
import { PortalProjectClient } from './portal-project-client';

export const dynamic = 'force-dynamic';

const PROJECT_STATUS_LABEL: Record<string, string> = {
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
};

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  // Το scope είναι ο μόνος έλεγχος πρόσβασης. Έργο εκτός scope → 404, χωρίς να
  // αποκαλύπτεται ότι υπάρχει έργο που δεν ανήκει στον πελάτη.
  if (!scope.projectIds.includes(id)) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      status: true,
      startDate: true,
      dueDate: true,
      ownerId: true,
      // Μόνο τα μέλη που η ομάδα έχει σημειώσει ως ορατά στον πελάτη.
      members: {
        where: { visibleToCustomer: true },
        orderBy: { createdAt: 'asc' },
        select: {
          title: true,
          responsibilities: true,
          user: {
            select: { id: true, name: true, email: true, image: true, phone: true, mobile: true },
          },
        },
      },
      // Το φίλτρο ορατότητας εδώ: εσωτερικό αρχείο δεν φεύγει από τον server.
      attachments: {
        where: attachmentVisibilityFilter('customer'),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, title: true, size: true, mimeType: true, url: true,
          createdAt: true,
          uploadedBy: { select: { name: true, email: true, userType: true } },
        },
      },
      tasks: {
        // Οι εσωτερικές εργασίες δεν φεύγουν ποτέ από τον server — ούτε στη
        // λίστα, ούτε στα ποσοστά που υπολογίζονται παρακάτω.
        where: taskVisibilityFilter('customer'),
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueDate: true,
          completedAt: true,
          assignees: {
            select: { user: { select: { name: true, email: true, image: true } } },
          },
          // Ο κανόνας έρχεται από το lib/comments/visibility.ts — μία μόνο
          // υλοποίηση, ώστε staff και portal να μη μπορούν να διαφωνήσουν.
          comments: {
            where: commentVisibilityFilter('customer'),
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              content: true,
              createdAt: true,
              author: { select: { name: true, email: true, image: true, userType: true } },
            },
          },
          // ΜΟΝΟ ερωτήσεις που απευθύνονται σε χρήστη αυτής της εταιρίας.
          questions: {
            where: { askedToId: { in: scope.userIds } },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              question: true,
              answer: true,
              createdAt: true,
              askedBy: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const counts = countByState(project.tasks.map((t) => t.status));
  const pct = completionPct(counts);
  const total = totalOf(counts);
  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

  const openQuestions = project.tasks.reduce(
    (n, t) => n + t.questions.filter((q) => !q.answer).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <Link
          href="/portal/projects"
          className="inline-flex items-center gap-1 text-xs font-medium text-fluent-neutral-60 transition-colors hover:text-fluent-blue-600"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Έργα
        </Link>

        {/* ─── Επικεφαλίδα με την πορεία ─── */}
        <div className="relative mt-2 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white p-5 shadow-fluent-2 sm:p-6">
          <span
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ backgroundColor: project.color }}
            aria-hidden
          />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                {PROJECT_STATUS_LABEL[project.status] ?? project.status}
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-fluent-neutral-90">
                {project.name}
              </h1>
              {project.description && (
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-fluent-neutral-70">
                  {project.description}
                </p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="font-display text-4xl font-semibold leading-none tabular-nums text-fluent-neutral-90">
                {pct}
                <span className="text-xl font-medium text-fluent-neutral-60">%</span>
              </p>
              <p className="mt-1 text-[11px] text-fluent-neutral-60 tabular-nums">
                {counts.done} από {total} εργασίες
              </p>
            </div>
          </div>

          <div className="mt-5">
            <PortalStatusBar counts={counts} height="h-2.5" />
          </div>

          {(project.startDate || project.dueDate || openQuestions > 0) && (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-fluent-neutral-8 pt-4 text-xs">
              {project.startDate && (
                <span className="text-fluent-neutral-70">
                  <span className="text-fluent-neutral-50">Έναρξη</span>{' '}
                  <span className="font-medium tabular-nums">
                    {fmtDate.format(project.startDate)}
                  </span>
                </span>
              )}
              {project.dueDate && (
                <span className="text-fluent-neutral-70">
                  <span className="text-fluent-neutral-50">Προθεσμία</span>{' '}
                  <span className="font-medium tabular-nums">
                    {fmtDate.format(project.dueDate)}
                  </span>
                </span>
              )}
              {openQuestions > 0 && (
                <span className="rounded-full bg-fluent-blue-50 px-2.5 py-0.5 font-semibold text-fluent-blue-700">
                  {openQuestions} {openQuestions === 1 ? 'ερώτηση περιμένει' : 'ερωτήσεις περιμένουν'} απάντηση
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <PortalProjectClient
        tasks={project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          dueDate: t.dueDate?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          assignees: t.assignees.map((a) => ({
            name: a.user.name ?? a.user.email,
            avatarUrl: a.user.image ?? undefined,
          })),
          comments: t.comments.map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt.toISOString(),
            authorName: c.author.name ?? c.author.email,
            authorAvatarUrl: c.author.image ?? undefined,
            fromUs: c.author.userType === 'customer',
          })),
          questions: t.questions.map((q) => ({
            id: q.id,
            question: q.question,
            answer: q.answer,
            createdAt: q.createdAt.toISOString(),
            askedByName: q.askedBy.name ?? q.askedBy.email,
          })),
        }))}
      />

      <PortalTeam
        members={project.members.map((m) => ({
          id: m.user.id,
          name: m.user.name ?? m.user.email,
          email: m.user.email,
          avatarUrl: m.user.image ?? undefined,
          title: m.title,
          responsibilities: m.responsibilities,
          phone: m.user.phone,
          mobile: m.user.mobile,
          isOwner: m.user.id === project.ownerId,
        }))}
      />

      <PortalFiles
        files={project.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          title: a.title,
          size: a.size,
          mimeType: a.mimeType,
          url: a.url,
          createdAt: a.createdAt.toISOString(),
          uploadedByName: a.uploadedBy.name ?? a.uploadedBy.email,
          fromUs: a.uploadedBy.userType === 'customer',
        }))}
      />
    </div>
  );
}
