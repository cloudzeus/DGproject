import { prisma } from '@/lib/prisma'
import type { DashScope, RadarData } from './types'

/**
 * Mini-Gantt δεδομένα 7 ημερών: tasks ως spans (start→due, clamped στο
 * παράθυρο) με χρώμα project + assignees, συν deadlines έργων ανά ημέρα.
 */
export async function buildRadar(scope: DashScope): Promise<RadarData> {
  const now = scope.now ?? new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 7 * 86_400_000 - 1)
  const projectWhere = scope.isPrivileged
    ? {}
    : { OR: [{ ownerId: scope.userId }, { members: { some: { userId: scope.userId } } }] }

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      // Ό,τι ΤΕΜΝΕΙ το παράθυρο: ξεκίνησε πριν το τέλος ΚΑΙ λήγει μετά την αρχή.
      where: {
        status: { not: 'done' },
        dueDate: { not: null, gte: start },
        OR: [{ startDate: { lte: end } }, { startDate: null }],
        project: projectWhere,
      },
      select: {
        id: true, title: true, startDate: true, dueDate: true,
        project: { select: { name: true, color: true } },
        assignees: { select: { user: { select: { name: true, email: true, image: true } } } },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    prisma.project.findMany({
      where: { ...projectWhere, dueDate: { gte: start, lte: end }, status: { notIn: ['completed', 'archived'] } },
      select: { id: true, name: true, color: true, dueDate: true },
    }),
  ])

  const dayIdx = (d: Date) => Math.floor((d.getTime() - start.getTime()) / 86_400_000)
  const clamp = (n: number) => Math.max(0, Math.min(6, n))
  const rangeFmt = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' })

  const spans = tasks
    .filter((t) => t.dueDate && dayIdx(t.dueDate) >= 0)
    .map((t) => {
      const s = t.startDate ? clamp(dayIdx(t.startDate)) : clamp(dayIdx(t.dueDate!))
      const e = clamp(dayIdx(t.dueDate!))
      return {
        id: t.id,
        title: t.title,
        href: `/board?task=${t.id}`,
        color: t.project.color,
        projectName: t.project.name,
        startCol: Math.min(s, e),
        endCol: Math.max(s, e),
        rangeLabel: `${t.startDate ? rangeFmt.format(t.startDate) : ''}${t.startDate ? ' – ' : ''}${rangeFmt.format(t.dueDate!)}`,
        assignees: t.assignees.map((a) => ({
          name: a.user.name ?? a.user.email,
          avatarUrl: a.user.image ?? undefined,
        })),
      }
    })

  const fmt = new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: 'numeric' })
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000)
    return {
      dayIso: d.toISOString().slice(0, 10),
      label: fmt.format(d),
      isToday: i === 0,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      projectDeadlines: projects
        .filter((p) => p.dueDate && dayIdx(p.dueDate) === i)
        .map((p) => ({ id: p.id, name: p.name, color: p.color })),
    }
  })

  return { days, spans }
}
