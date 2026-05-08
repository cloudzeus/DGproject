import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { GlobalTimeline } from './global-timeline';

export default async function GlobalTimelinePage() {
  const [session, projects, users] = await Promise.all([
    auth(),
    prisma.project.findMany({
      where: { status: { not: 'archived' } },
      orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
      include: {
        tasks: {
          orderBy: { order: 'asc' },
          include: { assignees: { include: { user: true } } },
        },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const canEdit = session?.user?.role === 'admin' || session?.user?.role === 'manager';

  const rows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    taskCount: p.tasks.length,
    tasks: p.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      startDate: t.startDate,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      status: t.status,
      priority: t.priority,
      projectId: p.id,
      projectName: p.name,
      projectColor: p.color,
      assignees: t.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name ?? a.user.email,
        avatarUrl: a.user.image ?? undefined,
      })),
    })),
  }));

  const userOptions = users.map((u) => ({
    id: u.id,
    name: u.name ?? '',
    email: u.email,
    image: u.image,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-[1800px] mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">
          Συνολικό Χρονοδιάγραμμα
        </h1>
        <p className="text-fluent-neutral-60 mt-1">
          {projects.length} έργα · {projects.reduce((s, p) => s + p.tasks.length, 0)} εργασίες · Σύρε μια εργασία για αναπρογραμματισμό, κλίκ για επεξεργασία
        </p>
      </div>
      <GlobalTimeline rows={rows} users={userOptions} canEdit={canEdit} />
    </div>
  );
}
