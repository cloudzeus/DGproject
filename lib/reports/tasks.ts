import { prisma } from '@/lib/prisma'
import {
  type ReportScope, bucketByWeek, hoursBetween, pctDelta, cycleBucket, CYCLE_BUCKETS,
} from './shared'

export type TasksReport = {
  statusBreakdown: { status: string; count: number }[]     // ανοιχτά τώρα + done στην περίοδο
  priorityBreakdown: { priority: string; count: number }[] // tasks που δημιουργήθηκαν στην περίοδο
  throughputByWeek: { week: string; count: number }[]
  throughputDelta: number | null
  cycleDistribution: { bucket: string; count: number }[]
  onTimePct: number | null
  onTimeN: number
  meetingTasks: { total: number; needsReview: number }
  aging: {
    id: string; title: string; projectId: string; projectName: string; status: string;
    daysOpen: number; assignees: string[];
  }[]
}

export async function buildTasksReport(scope: ReportScope): Promise<TasksReport> {
  const { range, prev, userId, isPrivileged } = scope
  const now = new Date()
  const projectWhere = isPrivileged
    ? {}
    : { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } }

  const [completedCur, completedPrev, createdCur, openTasks, meetingTotal, meetingReview] = await Promise.all([
    prisma.task.findMany({
      where: { ...projectWhere, completedAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, completedAt: true, dueDate: true },
    }),
    prisma.task.count({ where: { ...projectWhere, completedAt: { gte: prev.from, lte: prev.to } } }),
    prisma.task.groupBy({
      by: ['priority'],
      where: { ...projectWhere, createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { ...projectWhere, status: { not: 'done' } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, title: true, status: true, createdAt: true, projectId: true,
        project: { select: { name: true } },
        assignees: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.task.count({
      where: { ...projectWhere, generatedFromMeetingId: { not: null }, createdAt: { gte: range.from, lte: range.to } },
    }),
    prisma.task.count({
      where: { ...projectWhere, meetingNeedsReview: true, createdAt: { gte: range.from, lte: range.to } },
    }),
  ])

  // Status breakdown: ανοιχτά τώρα ανά status + done της περιόδου
  const statusCounts = new Map<string, number>([['backlog', 0], ['todo', 0], ['in_progress', 0], ['review', 0], ['done', completedCur.length]])
  for (const t of openTasks) statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1)

  const priorityOrder = ['urgent', 'high', 'medium', 'low']
  const priorityBreakdown = priorityOrder.map((p) => ({
    priority: p,
    count: createdCur.find((r) => r.priority === p)?._count._all ?? 0,
  }))

  const cycles = completedCur.map((t) => hoursBetween(t.createdAt, t.completedAt!))
  const cycleCounts = new Map<string, number>(CYCLE_BUCKETS.map((b) => [b, 0]))
  for (const h of cycles) cycleCounts.set(cycleBucket(h), (cycleCounts.get(cycleBucket(h)) ?? 0) + 1)

  const withDue = completedCur.filter((t) => t.dueDate)
  const onTime = withDue.filter((t) => t.completedAt! <= t.dueDate!)

  return {
    statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    priorityBreakdown,
    throughputByWeek: bucketByWeek(completedCur, (t) => t.completedAt!, range),
    throughputDelta: pctDelta(completedCur.length, completedPrev),
    cycleDistribution: [...cycleCounts.entries()].map(([bucket, count]) => ({ bucket, count })),
    onTimePct: withDue.length === 0 ? null : Math.round((onTime.length / withDue.length) * 100),
    onTimeN: withDue.length,
    meetingTasks: { total: meetingTotal, needsReview: meetingReview },
    aging: openTasks.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project.name,
      status: t.status,
      daysOpen: Math.floor((now.getTime() - t.createdAt.getTime()) / 86_400_000),
      assignees: t.assignees.map((a) => a.user.name ?? a.user.email),
    })),
  }
}
