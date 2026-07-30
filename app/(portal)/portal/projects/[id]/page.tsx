import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { commentVisibilityFilter } from '@/lib/comments/visibility';
import { PortalProjectClient } from './portal-project-client';

export const dynamic = 'force-dynamic';

const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: 'Σε αναμονή',
  todo: 'Σε εκκρεμότητα',
  in_progress: 'Σε εξέλιξη',
  review: 'Σε έλεγχο',
  done: 'Ολοκληρωμένη',
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
      dueDate: true,
      tasks: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueDate: true,
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

  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

  return (
    <div>
      <Link href="/portal/projects" className="text-xs text-fluent-blue-600">
        ← Έργα
      </Link>
      <div className="flex items-center gap-2 mt-1">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <h1 className="text-2xl font-semibold text-fluent-neutral-90">{project.name}</h1>
      </div>
      {project.description && (
        <p className="mt-1 text-sm text-fluent-neutral-60">{project.description}</p>
      )}
      {project.dueDate && (
        <p className="mt-0.5 text-xs text-fluent-neutral-60">
          Προθεσμία {fmtDate.format(project.dueDate)}
        </p>
      )}

      <PortalProjectClient
        tasks={project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          statusLabel: TASK_STATUS_LABEL[t.status] ?? t.status,
          dueDate: t.dueDate?.toISOString() ?? null,
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
    </div>
  );
}
