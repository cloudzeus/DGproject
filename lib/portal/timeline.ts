import { prisma } from '@/lib/prisma'
import { taskVisibilityFilter } from '@/lib/tasks/visibility'
import type { PortalScope } from './scope'

/**
 * Τα ορόσημα του πελάτη: πότε παραδίδεται τι.
 *
 * Απαντά στην ερώτηση που ο πελάτης σήμερα αναγκάζεται να κάνει με email —
 * «πότε θα είναι έτοιμο;». Χωρίς αυτό, οι προθεσμίες υπάρχουν στη βάση αλλά
 * είναι σκορπισμένες μέσα στις εργασίες κάθε έργου χωριστά.
 *
 * Δύο είδη οροσήμου, σκόπιμα ξεχωριστά:
 *   - `project` — η προθεσμία ολόκληρου του έργου, το μεγάλο ραντεβού
 *   - `task`    — προθεσμία μεμονωμένης εργασίας, ορατής στον πελάτη
 *
 * Οι εσωτερικές εργασίες αποκλείονται από το `taskVisibilityFilter`. Αυτό δεν
 * είναι μόνο θέμα διαρροής: μια προθεσμία που ο πελάτης δεν μπορεί να ανοίξει
 * και να καταλάβει είναι θόρυβος, όχι πληροφορία.
 */

export type Milestone = {
  id: string
  kind: 'project' | 'task'
  title: string
  date: string
  projectId: string
  projectName: string
  projectColor: string
  /** Πέρασε η ημερομηνία χωρίς να έχει ολοκληρωθεί. */
  overdue: boolean
  done: boolean
}

/** Αρχή της σημερινής μέρας — μια προθεσμία «σήμερα» δεν είναι εκπρόθεσμη. */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function listMilestones(
  scope: PortalScope,
  opts: { horizonDays?: number; includeDone?: boolean } = {},
): Promise<Milestone[]> {
  if (scope.projectIds.length === 0) return []

  const today = startOfToday()
  const horizon = opts.horizonDays
    ? new Date(today.getTime() + opts.horizonDays * 86_400_000)
    : null

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: {
        id: { in: scope.projectIds },
        dueDate: { not: null, ...(horizon ? { lte: horizon } : {}) },
        status: { in: ['planning', 'active', 'on_hold'] },
      },
      select: { id: true, name: true, color: true, dueDate: true, status: true },
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: scope.projectIds },
        ...taskVisibilityFilter('customer'),
        dueDate: { not: null, ...(horizon ? { lte: horizon } : {}) },
        ...(opts.includeDone ? {} : { status: { not: 'done' } }),
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        completedAt: true,
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 200,
    }),
  ])

  const items: Milestone[] = [
    ...projects.map((p) => ({
      id: `project:${p.id}`,
      kind: 'project' as const,
      title: `Παράδοση έργου: ${p.name}`,
      date: p.dueDate!.toISOString(),
      projectId: p.id,
      projectName: p.name,
      projectColor: p.color,
      overdue: p.dueDate! < today,
      done: false,
    })),
    ...tasks.map((t) => ({
      id: `task:${t.id}`,
      kind: 'task' as const,
      title: t.title,
      date: t.dueDate!.toISOString(),
      projectId: t.project.id,
      projectName: t.project.name,
      projectColor: t.project.color,
      overdue: t.status !== 'done' && t.dueDate! < today,
      done: t.status === 'done',
    })),
  ]

  return items.sort((a, b) => a.date.localeCompare(b.date))
}
