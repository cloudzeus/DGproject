import { prisma } from '@/lib/prisma';
import { TeamClient } from './team-client';

const WEEKLY_CAPACITY_HOURS = 40;

export default async function TeamPage() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      departments: { include: { department: { select: { id: true, name: true, color: true } } } },
      projectMemberships: {
        select: {
          project: { select: { id: true, name: true, color: true, status: true } },
        },
      },
      assignedTasks: {
        select: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
              estimatedHours: true,
              priority: true,
              projectId: true,
              project: { select: { name: true, color: true } },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows = users.map((u) => {
    const tasks = u.assignedTasks.map((a) => a.task);
    const openTasks = tasks.filter((t) => t.status !== 'done');
    const remainingHours = openTasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
    const doneTasks = tasks.filter((t) => t.status === 'done');
    const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < new Date()).length;

    const loadPct = Math.min(200, Math.round((remainingHours / WEEKLY_CAPACITY_HOURS) * 100));
    const loadLevel: 'available' | 'moderate' | 'busy' | 'overloaded' =
      remainingHours === 0
        ? 'available'
        : remainingHours <= WEEKLY_CAPACITY_HOURS * 0.5
        ? 'available'
        : remainingHours <= WEEKLY_CAPACITY_HOURS
        ? 'moderate'
        : remainingHours <= WEEKLY_CAPACITY_HOURS * 1.5
        ? 'busy'
        : 'overloaded';

    return {
      id: u.id,
      name: u.name ?? '',
      email: u.email,
      image: u.image,
      role: u.role as 'admin' | 'manager' | 'member' | 'viewer',
      departments: u.departments.map((d) => d.department),
      projects: u.projectMemberships.map((m) => m.project),
      openTaskCount: openTasks.length,
      doneTaskCount: doneTasks.length,
      overdueCount: overdue,
      remainingHours: Math.round(remainingHours * 100) / 100,
      loadPct,
      loadLevel,
      upcoming: openTasks
        .filter((t) => t.dueDate)
        .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
        .slice(0, 3)
        .map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate!,
          projectName: t.project.name,
          projectColor: t.project.color,
          estimatedHours: t.estimatedHours,
        })),
    };
  });

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Ομάδα</h1>
        <p className="text-fluent-neutral-60 mt-1">{rows.length} μέλη · Φόρτος βασισμένος σε {WEEKLY_CAPACITY_HOURS}h/εβδομάδα</p>
      </div>
      <TeamClient users={rows} weeklyCapacity={WEEKLY_CAPACITY_HOURS} />
    </div>
  );
}
