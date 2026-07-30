import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { PortalProjectCard } from '@/components/portal/project-card';
import { countByState } from '@/components/portal/task-status';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
};

/** Τα ενεργά πρώτα· τα κλεισμένα μαζεύονται χωριστά ώστε να μην πνίγουν τη λίστα. */
const LIVE = ['planning', 'active', 'on_hold'];

export default async function PortalProjects() {
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  const [projects, pendingQuestions] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: scope.projectIds } },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        status: true,
        dueDate: true,
        tasks: { select: { status: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
    }),
    prisma.taskQuestion.findMany({
      where: { askedToId: { in: scope.userIds }, answer: null },
      select: { task: { select: { projectId: true } } },
    }),
  ]);

  const questionsByProject = new Map<string, number>();
  for (const q of pendingQuestions) {
    questionsByProject.set(
      q.task.projectId,
      (questionsByProject.get(q.task.projectId) ?? 0) + 1,
    );
  }

  const toCard = (p: (typeof projects)[number]) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    statusLabel: STATUS_LABEL[p.status] ?? p.status,
    dueDate: p.dueDate?.toISOString() ?? null,
    counts: countByState(p.tasks.map((t) => t.status)),
    openQuestions: questionsByProject.get(p.id) ?? 0,
  });

  const live = projects.filter((p) => LIVE.includes(p.status));
  const finished = projects.filter((p) => !LIVE.includes(p.status));

  return (
    <div className="space-y-8">
      <header className="animate-fade-in">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-90">
          Έργα
        </h1>
        <p className="mt-1 text-sm text-fluent-neutral-70">
          {live.length} σε εξέλιξη
          {finished.length > 0 && ` · ${finished.length} ολοκληρωμένα`}
        </p>
      </header>

      {projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-fluent-neutral-80">Δεν υπάρχουν έργα ακόμα</p>
          <p className="mt-1 text-xs text-fluent-neutral-60">
            Μόλις ξεκινήσει η συνεργασία, τα έργα σας θα εμφανιστούν εδώ.
          </p>
        </div>
      )}

      {live.length > 0 && (
        <section>
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((p) => (
              <PortalProjectCard key={p.id} project={toCard(p)} />
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-base font-semibold text-fluent-neutral-90">
            Ολοκληρωμένα
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {finished.map((p) => (
              <PortalProjectCard key={p.id} project={toCard(p)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
