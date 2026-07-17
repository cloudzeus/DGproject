import { prisma } from '@/lib/prisma'
import type { DashScope, RadarDay } from './types'

export async function buildRadar(scope: DashScope): Promise<RadarDay[]> {
  const now = scope.now ?? new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 7 * 86_400_000 - 1)
  const projectWhere = scope.isPrivileged
    ? {}
    : { OR: [{ ownerId: scope.userId }, { members: { some: { userId: scope.userId } } }] }

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: 'done' }, dueDate: { gte: start, lte: end }, project: projectWhere },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true, color: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.project.findMany({
      where: { ...projectWhere, dueDate: { gte: start, lte: end }, status: { notIn: ['completed', 'archived'] } },
      select: { id: true, name: true, color: true, dueDate: true },
    }),
  ])

  const fmt = new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: 'numeric' })
  const days: RadarDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    const sameDay = (x: Date) => x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate()
    days.push({
      dayIso: key,
      label: fmt.format(d),
      isToday: i === 0,
      tasks: tasks.filter((t) => t.dueDate && sameDay(t.dueDate)).map((t) => ({
        id: t.id, title: t.title, projectName: t.project.name, projectColor: t.project.color, href: `/board?task=${t.id}`,
      })),
      projectDeadlines: projects.filter((p) => p.dueDate && sameDay(p.dueDate)).map((p) => ({ id: p.id, name: p.name, color: p.color })),
    })
  }
  return days
}
