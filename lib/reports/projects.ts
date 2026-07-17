import { prisma } from '@/lib/prisma'
import { type ReportScope, hoursBetween, mean, trackedMs, msToHours } from './shared'

export type ProjectReportRow = {
  id: string
  name: string
  color: string
  status: string
  ownerName: string
  memberCount: number
  total: number
  done: number
  open: number
  overdue: number
  completionPct: number
  dueDate: string | null
  // Νέα, για την περίοδο:
  completedInPeriod: number
  createdInPeriod: number
  netFlow: number // createdInPeriod - completedInPeriod (θετικό = συσσώρευση)
  velocityPerWeek: number
  trackedHours: number
  estimatedHours: number
  avgCycleHours: number | null
  cycleN: number
}

export type ProjectsReport = { rows: ProjectReportRow[] }

export async function buildProjectsReport(scope: ReportScope): Promise<ProjectsReport> {
  const { range, userId, isPrivileged } = scope
  const now = new Date()
  const where = isPrivileged ? {} : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] }
  const weeks = Math.max(1, (range.to.getTime() - range.from.getTime()) / (7 * 86_400_000))

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { name: true, email: true } },
      members: { select: { userId: true } },
      tasks: {
        select: {
          status: true, dueDate: true, createdAt: true, completedAt: true,
          estimatedHours: true, inProgressAccumulatedMs: true, inProgressStartedAt: true,
        },
      },
    },
  })

  const rows: ProjectReportRow[] = projects.map((p) => {
    const total = p.tasks.length
    const done = p.tasks.filter((t) => t.status === 'done').length
    const overdue = p.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'done').length
    const completedInPeriod = p.tasks.filter(
      (t) => t.completedAt && t.completedAt >= range.from && t.completedAt <= range.to,
    )
    const createdInPeriod = p.tasks.filter((t) => t.createdAt >= range.from && t.createdAt <= range.to).length
    const cycles = completedInPeriod.map((t) => hoursBetween(t.createdAt, t.completedAt!))
    const avgCycle = mean(cycles)
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      ownerName: p.owner.name ?? p.owner.email,
      memberCount: p.members.length,
      total,
      done,
      open: total - done,
      overdue,
      completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
      dueDate: p.dueDate?.toISOString() ?? null,
      completedInPeriod: completedInPeriod.length,
      createdInPeriod,
      netFlow: createdInPeriod - completedInPeriod.length,
      velocityPerWeek: Math.round((completedInPeriod.length / weeks) * 10) / 10,
      trackedHours: msToHours(p.tasks.reduce((a, t) => a + trackedMs(t, now), 0)),
      estimatedHours: Math.round(p.tasks.reduce((a, t) => a + (t.estimatedHours ?? 0), 0) * 10) / 10,
      avgCycleHours: avgCycle === null ? null : Math.round(avgCycle * 10) / 10,
      cycleN: cycles.length,
    }
  })

  rows.sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.open - a.open)
  return { rows }
}
