import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
};

export default async function PortalProjects() {
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  const projects = await prisma.project.findMany({
    where: { id: { in: scope.projectIds } },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      status: true,
      dueDate: true,
      _count: { select: { tasks: true } },
      tasks: { where: { status: 'done' }, select: { id: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-fluent-neutral-90 mb-4">Έργα</h1>

      {projects.length === 0 ? (
        <p className="text-sm text-fluent-neutral-60">Δεν υπάρχουν έργα ακόμα.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const total = p._count.tasks;
            const done = p.tasks.length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={`/portal/projects/${p.id}`}
                className="block rounded-xl border border-fluent-neutral-20 bg-white p-4 hover:shadow-fluent-2 transition-shadow"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 text-sm font-medium text-fluent-neutral-90 truncate">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                {p.description && (
                  <p className="mt-1.5 text-xs text-fluent-neutral-60 line-clamp-2">
                    {p.description}
                  </p>
                )}
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
    </div>
  );
}
