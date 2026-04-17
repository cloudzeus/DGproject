import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { DashboardClient, type DashboardTask, type DashboardActivity, type DashboardProject } from './dashboard-client';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const displayName = session?.user?.name ?? session?.user?.email ?? 'there';
  const firstName = displayName.split(' ')[0] ?? displayName;

  const now = new Date();
  const weekAhead = new Date(now.getTime() + WEEK_MS);

  const [
    openAssigned,
    completedCount,
    teamCount,
    activities,
    activeProjectsRaw,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: { not: 'done' },
        assignees: { some: { userId } },
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.task.count({
      where: { status: 'done', assignees: { some: { userId } } },
    }),
    prisma.user.count(),
    prisma.activity.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, email: true, image: true } },
        task: { select: { title: true } },
      },
    }),
    prisma.project.findMany({
      where: {
        status: 'active',
        ...(session?.user?.role === 'admin' || session?.user?.role === 'manager'
          ? {}
          : {
              OR: [
                { ownerId: userId },
                { members: { some: { userId } } },
              ],
            }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        tasks: { select: { status: true } },
      },
    }),
  ]);

  const dueSoon: DashboardTask[] = openAssigned
    .filter((t) => t.dueDate && t.dueDate.getTime() - now.getTime() < WEEK_MS)
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      project: { id: t.project.id, name: t.project.name, color: t.project.color },
      assignees: t.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name ?? a.user.email,
        avatarUrl: a.user.image ?? undefined,
      })),
    }));

  const activityList: DashboardActivity[] = activities.map((a) => ({
    id: a.id,
    action: a.action,
    createdAt: a.createdAt,
    actor: {
      id: a.actor.id,
      name: a.actor.name ?? a.actor.email,
      avatarUrl: a.actor.image ?? undefined,
    },
    taskTitle: a.task?.title ?? null,
  }));

  const activeProjects: DashboardProject[] = activeProjectsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    status: p.status,
    progress: p.progress,
    taskCount: p.tasks.length,
    completedTaskCount: p.tasks.filter((t) => t.status === 'done').length,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email,
      avatarUrl: m.user.image ?? undefined,
    })),
  }));

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <DashboardClient
      greeting={greeting}
      firstName={firstName}
      stats={{
        myTasks: openAssigned.length,
        completed: completedCount,
        dueSoon: dueSoon.length,
        team: teamCount,
      }}
      dueSoon={dueSoon}
      activities={activityList}
      activeProjects={activeProjects}
    />
  );
}
