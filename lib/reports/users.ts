import { prisma } from '@/lib/prisma'
import { type ReportScope, hoursBetween, mean, msToHours, pctDelta, trackedMs, bucketByWeek } from './shared'

export type UserReportRow = {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
  completedInPeriod: number
  completedDelta: number | null
  trackedHours: number
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
      assignedTasks: {
        select: {
          task: {
            select: {
              id: true, title: true, status: true, dueDate: true, createdAt: true, completedAt: true,
              inProgressAccumulatedMs: true, inProgressStartedAt: true,
              project: { select: { name: true } },
              ticket: { select: { id: true } },
            },
          },
        },
      },
    },
  })

  const rows: UserReportRow[] = users.map((u) => {
    const tasks = u.assignedTasks.map((a) => a.task)
    const completedCur = tasks.filter((t) => t.completedAt && t.completedAt >= range.from && t.completedAt <= range.to)
    const completedPrev = tasks.filter((t) => t.completedAt && t.completedAt >= prev.from && t.completedAt <= prev.to)
    const cycles = completedCur.map((t) => hoursBetween(t.createdAt, t.completedAt!))
    const avgCycle = mean(cycles)
    const withDue = completedCur.filter((t) => t.dueDate)
    const onTime = withDue.filter((t) => t.completedAt! <= t.dueDate!)
    const open = tasks.filter((t) => t.status !== 'done')
    return {
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
      avatarUrl: u.image ?? undefined,
      role: u.role,
      completedInPeriod: completedCur.length,
      completedDelta: pctDelta(completedCur.length, completedPrev.length),
      trackedHours: msToHours(completedCur.reduce((a, t) => a + trackedMs(t, now), 0)),
      avgCycleHours: avgCycle === null ? null : Math.round(avgCycle * 10) / 10,
      cycleN: cycles.length,
      onTimePct: withDue.length === 0 ? null : Math.round((onTime.length / withDue.length) * 100),
      onTimeN: withDue.length,
      activeLoad: open.length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
      ticketsResolved: completedCur.filter((t) => t.ticket).length,
      weeklyCompletions: bucketByWeek(completedCur, (t) => t.completedAt!, range),
      recentTasks: [...tasks]
        .sort((a, b) => (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime())
        .slice(0, 10)
        .map((t) => ({ id: t.id, title: t.title, status: t.status, projectName: t.project.name })),
    }
  })

  rows.sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.activeLoad - a.activeLoad)
  return { rows }
}
