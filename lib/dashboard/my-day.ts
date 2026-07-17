import { prisma } from '@/lib/prisma'
import type { DashScope, MyDayData } from './types'

function dayBounds(d: Date): { from: Date; to: Date } {
  const from = new Date(d); from.setHours(0, 0, 0, 0)
  const to = new Date(d); to.setHours(23, 59, 59, 999)
  return { from, to }
}

export async function buildMyDay(scope: DashScope): Promise<MyDayData> {
  const now = scope.now ?? new Date()
  const today = dayBounds(now)
  const tomorrow = dayBounds(new Date(now.getTime() + 86_400_000))
  const mine = { assignees: { some: { userId: scope.userId } } }

  const [dueToday, dueTomorrow, inProgress, overdue, meetings] = await Promise.all([
    prisma.task.findMany({
      where: { ...mine, status: { not: 'done' }, dueDate: { gte: today.from, lte: today.to } },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.task.findMany({
      where: { ...mine, status: { not: 'done' }, dueDate: { gte: tomorrow.from, lte: tomorrow.to } },
      select: { id: true, title: true, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' }, take: 8,
    }),
    prisma.task.findMany({
      where: { ...mine, status: 'in_progress' },
      select: {
        id: true, title: true, inProgressAccumulatedMs: true, inProgressStartedAt: true,
        project: { select: { name: true } }, ticket: { select: { id: true } },
      },
    }),
    prisma.task.findMany({
      where: { ...mine, status: { not: 'done' }, dueDate: { lt: today.from } },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' }, take: 8,
    }),
    // MeetingNote έχει subject/startedAt όπως αναμενόταν στο spec — καμία προσαρμογή.
    prisma.meetingNote.findMany({
      where: { startedAt: { gte: today.from, lte: today.to } },
      select: { id: true, subject: true, startedAt: true },
      orderBy: { startedAt: 'asc' }, take: 6,
    }).catch(() => []),
  ])

  const fmtTime = (d: Date | null) =>
    d ? new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' }).format(d) : null

  const todayItems = [
    ...dueToday.map((t) => ({
      id: t.id, title: t.title, kind: 'task' as const, time: fmtTime(t.dueDate),
      projectName: t.project.name, href: `/board?task=${t.id}`,
    })),
    ...meetings.map((m) => ({
      id: m.id, title: m.subject ?? 'Meeting', kind: 'meeting' as const,
      time: fmtTime(m.startedAt), projectName: null, href: '/teams-meetings',
    })),
  ].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))

  return {
    today: todayItems,
    tomorrow: dueTomorrow.map((t) => ({ id: t.id, title: t.title, projectName: t.project.name, href: `/board?task=${t.id}` })),
    inProgress: inProgress.map((t) => ({
      id: t.id, title: t.title, projectName: t.project.name, href: `/board?task=${t.id}`,
      accumulatedMs: Number(t.inProgressAccumulatedMs),
      startedAtIso: t.inProgressStartedAt?.toISOString() ?? null,
      fromTicket: Boolean(t.ticket),
    })),
    overdue: overdue.map((t) => ({
      id: t.id, title: t.title, projectName: t.project.name,
      daysLate: Math.floor((today.from.getTime() - t.dueDate!.getTime()) / 86_400_000) + 1,
      href: `/board?task=${t.id}`,
    })),
  }
}
