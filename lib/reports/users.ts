import { prisma } from '@/lib/prisma'
import { dedupeCompletionActivities } from '@/lib/task-contribution'
import { uniqueTasksById } from '@/lib/task-roles'
import { type ReportScope, hoursBetween, laborCostEur, mean, msToHours, pctDelta, trackedMs, bucketByWeek } from './shared'

const REPORT_TASK_SELECT = {
  id: true, title: true, status: true, dueDate: true, createdAt: true, completedAt: true,
  inProgressAccumulatedMs: true, inProgressStartedAt: true,
  project: { select: { name: true } },
  ticket: { select: { id: true } },
} as const

export type UserReportRow = {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
  requestedInPeriod: number
  completedInPeriod: number
  completedDelta: number | null
  trackedHours: number
  laborCost: number
  avgCycleHours: number | null
  cycleN: number
  onTimePct: number | null
  onTimeN: number
  activeLoad: number // open + in_progress τώρα
  overdue: number
  ticketsResolved: number // ολοκληρωμένα tasks της περιόδου που συνδέονται με ticket
  weeklyCompletions: { week: string; count: number }[]
  recentTasks: { id: string; title: string; status: string; projectName: string }[]
}

export type UsersReport = { rows: UserReportRow[] }

export async function buildUsersReport(scope: ReportScope): Promise<UsersReport> {
  const { range, prev } = scope
  const now = new Date()

  const users = await prisma.user.findMany({
    where: { userType: 'employee' },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, email: true, image: true, role: true,
      createdTasks: {
        where: { mergedIntoId: null },
        select: { id: true, createdAt: true },
      },
      requestedTasks: {
        where: { task: { mergedIntoId: null } },
        select: { task: { select: { id: true, createdAt: true } } },
      },
      assignedTasks: {
        where: { task: { mergedIntoId: null } },
        select: { task: { select: REPORT_TASK_SELECT } },
      },
      activities: {
        where: { action: 'completed', task: { mergedIntoId: null } },
        select: {
          action: true,
          taskId: true,
          createdAt: true,
          task: { select: REPORT_TASK_SELECT },
        },
      },
    },
  })

  const rows: UserReportRow[] = users.map((u) => {
    const tasks = u.assignedTasks.map((a) => a.task)
    const completions = dedupeCompletionActivities(u.activities).flatMap((activity) =>
      activity.task ? [{ ...activity.task, actualCompletedAt: activity.createdAt }] : [],
    )
    const completedCur = completions.filter((t) => t.actualCompletedAt >= range.from && t.actualCompletedAt <= range.to)
    const completedPrev = completions.filter((t) => t.actualCompletedAt >= prev.from && t.actualCompletedAt <= prev.to)
    const cycles = completedCur.map((t) => hoursBetween(t.createdAt, t.actualCompletedAt))
    const avgCycle = mean(cycles)
    const withDue = completedCur.filter((t) => t.dueDate)
    const onTime = withDue.filter((t) => t.actualCompletedAt <= t.dueDate!)
    const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    return {
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
      avatarUrl: u.image ?? undefined,
      role: u.role,
      requestedInPeriod: uniqueTasksById(u.createdTasks, u.requestedTasks.map((request) => request.task))
        .filter((t) => t.createdAt >= range.from && t.createdAt <= range.to).length,
      completedInPeriod: completedCur.length,
      completedDelta: pctDelta(completedCur.length, completedPrev.length),
      trackedHours: msToHours(completedCur.reduce((a, t) => a + trackedMs(t, now), 0)),
      laborCost: laborCostEur(Number(completedCur.reduce((a, t) => a + trackedMs(t, now), 0)) / 3_600_000),
      avgCycleHours: avgCycle === null ? null : Math.round(avgCycle * 10) / 10,
      cycleN: cycles.length,
      onTimePct: withDue.length === 0 ? null : Math.round((onTime.length / withDue.length) * 100),
      onTimeN: withDue.length,
      activeLoad: open.length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
      ticketsResolved: completedCur.filter((t) => t.ticket).length,
      weeklyCompletions: bucketByWeek(completedCur, (t) => t.actualCompletedAt, range),
      recentTasks: [...tasks]
        .sort((a, b) => (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime())
        .slice(0, 10)
        .map((t) => ({ id: t.id, title: t.title, status: t.status, projectName: t.project.name })),
    }
  })

  rows.sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.activeLoad - a.activeLoad)
  return { rows }
}
