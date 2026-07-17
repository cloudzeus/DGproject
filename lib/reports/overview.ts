import { prisma } from '@/lib/prisma'
import {
  type ReportScope, bucketByDay, pctDelta, mean, hoursBetween,
} from './shared'

export type OverviewReport = {
  kpis: {
    tasksCompleted: { value: number; delta: number | null; spark: number[] }
    ticketsNew: { value: number; delta: number | null; spark: number[] }
    ticketsResolved: { value: number; delta: number | null }
    avgResolutionHours: { value: number | null; n: number }
    overdueNow: number
  }
  taskCompletionsByDay: { day: string; value: number }[]
  ticketFlowByDay: { day: string; a: number; b: number }[] // a=εισερχόμενα, b=επιλυμένα
}

export async function buildOverviewReport(scope: ReportScope): Promise<OverviewReport> {
  const { range, prev, userId, isPrivileged } = scope
  const now = new Date()
  const projectWhere = isPrivileged
    ? {}
    : { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } }

  const [doneCur, donePrev, ticketsCur, ticketsPrev, resolvedCur, resolvedPrev, overdueNow] = await Promise.all([
    prisma.task.findMany({
      where: { ...projectWhere, completedAt: { gte: range.from, lte: range.to } },
      select: { completedAt: true },
    }),
    prisma.task.count({ where: { ...projectWhere, completedAt: { gte: prev.from, lte: prev.to } } }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true },
    }),
    prisma.ticket.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: range.from, lte: range.to }, status: { not: 'merged' } },
      select: { resolvedAt: true, createdAt: true },
    }),
    prisma.ticket.count({ where: { resolvedAt: { gte: prev.from, lte: prev.to }, status: { not: 'merged' } } }),
    prisma.task.count({
      where: { ...projectWhere, dueDate: { lt: now }, status: { not: 'done' } },
    }),
  ])

  const completionsByDay = bucketByDay(doneCur, (t) => t.completedAt!, range)
  const newByDay = bucketByDay(ticketsCur, (t) => t.createdAt, range)
  const resolvedByDay = bucketByDay(resolvedCur, (t) => t.resolvedAt!, range)

  const resolutionHours = resolvedCur.map((t) => hoursBetween(t.createdAt, t.resolvedAt!))
  const avg = mean(resolutionHours)

  return {
    kpis: {
      tasksCompleted: {
        value: doneCur.length,
        delta: pctDelta(doneCur.length, donePrev),
        spark: completionsByDay.map((d) => d.count),
      },
      ticketsNew: {
        value: ticketsCur.length,
        delta: pctDelta(ticketsCur.length, ticketsPrev),
        spark: newByDay.map((d) => d.count),
      },
      ticketsResolved: { value: resolvedCur.length, delta: pctDelta(resolvedCur.length, resolvedPrev) },
      avgResolutionHours: { value: avg === null ? null : Math.round(avg * 10) / 10, n: resolutionHours.length },
      overdueNow,
    },
    taskCompletionsByDay: completionsByDay.map((d) => ({ day: d.day, value: d.count })),
    ticketFlowByDay: newByDay.map((d, i) => ({ day: d.day, a: d.count, b: resolvedByDay[i]?.count ?? 0 })),
  }
}
