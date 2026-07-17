import { prisma } from '@/lib/prisma';

export {
  STATUS_LABELS_EL,
  PRIORITY_LABELS_EL,
  ROLE_LABELS_EL,
} from './shared';
export * from './shared';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ReportProjectRow = {
  id: string;
  name: string;
  color: string;
  status: string;
  progress: number;
  ownerName: string;
  memberCount: number;
  total: number;
  done: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  completionPct: number;
  dueDate: string | null;
};

export type ReportUserRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  total: number;
  done: number;
  open: number;
  overdue: number;
  inProgress: number;
};

export type ReportsData = {
  projects: ReportProjectRow[];
  users: ReportUserRow[];
  statusBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  projectStatusBreakdown: Record<string, number>;
  totals: {
    projects: number;
    tasks: number;
    completed: number;
    overdue: number;
  };
};

export async function buildReportsData(opts: { userId: string; isPrivileged: boolean }): Promise<ReportsData> {
  const { userId, isPrivileged } = opts;
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + WEEK_MS);

  const projectWhere = isPrivileged
    ? {}
    : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };

  const [projects, users, taskStatusCounts, taskPriorityCounts] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { select: { userId: true } },
        tasks: { select: { id: true, status: true, dueDate: true, priority: true } },
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        assignedTasks: {
          select: { task: { select: { id: true, status: true, dueDate: true, priority: true } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.task.groupBy({ by: ['priority'], _count: { _all: true } }),
  ]);

  const projectReport: ReportProjectRow[] = projects.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === 'done').length;
    const overdue = p.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'done').length;
    const dueThisWeek = p.tasks.filter(
      (t) => t.dueDate && t.dueDate >= now && t.dueDate < weekFromNow && t.status !== 'done',
    ).length;
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      progress: p.progress,
      ownerName: p.owner.name ?? p.owner.email,
      memberCount: p.members.length,
      total,
      done,
      open: total - done,
      overdue,
      dueThisWeek,
      completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
      dueDate: p.dueDate?.toISOString() ?? null,
    };
  });

  const userReport: ReportUserRow[] = users
    .map((u) => {
      const allTasks = u.assignedTasks.map((a) => a.task);
      const total = allTasks.length;
      const done = allTasks.filter((t) => t.status === 'done').length;
      const overdue = allTasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'done').length;
      const inProgress = allTasks.filter((t) => t.status === 'in_progress').length;
      return {
        id: u.id,
        name: u.name ?? u.email,
        email: u.email,
        avatarUrl: u.image ?? undefined,
        role: u.role,
        total,
        done,
        open: total - done,
        overdue,
        inProgress,
      };
    })
    .sort((a, b) => b.open - a.open || b.total - a.total);

  const statusBreakdown: Record<string, number> = {
    backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0,
  };
  for (const row of taskStatusCounts) statusBreakdown[row.status] = row._count._all;

  const priorityBreakdown: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
  for (const row of taskPriorityCounts) priorityBreakdown[row.priority] = row._count._all;

  const projectStatusBreakdown: Record<string, number> = {
    planning: 0, active: 0, on_hold: 0, completed: 0, archived: 0,
  };
  for (const p of projects) projectStatusBreakdown[p.status] += 1;

  return {
    projects: projectReport,
    users: userReport,
    statusBreakdown,
    priorityBreakdown,
    projectStatusBreakdown,
    totals: {
      projects: projects.length,
      tasks: Object.values(statusBreakdown).reduce((a, b) => a + b, 0),
      completed: statusBreakdown.done,
      overdue: userReport.reduce((sum, u) => sum + u.overdue, 0),
    },
  };
}
