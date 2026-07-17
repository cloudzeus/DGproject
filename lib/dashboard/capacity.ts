import { prisma } from '@/lib/prisma'
import { getUserLoads } from '@/lib/task-scheduling'
import type { CapacityRow, DashScope } from './types'

// 9:00–18:30 (lib/business-hours) ⇒ 9.5h * 5 εργάσιμες.
const CAPACITY_5D_HOURS = 47.5

export async function buildCapacity(scope: DashScope): Promise<CapacityRow[]> {
  if (!scope.isPrivileged) return []
  const now = scope.now ?? new Date()

  const users = await prisma.user.findMany({
    where: { userType: 'employee', role: { in: ['admin', 'manager', 'member'] } },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: 'asc' },
  })
  const [loads, overdueCounts] = await Promise.all([
    getUserLoads(users.map((u) => u.id)),
    prisma.taskAssignee.groupBy({
      by: ['userId'],
      where: { task: { status: { not: 'done' }, dueDate: { lt: now } }, userId: { in: users.map((u) => u.id) } },
      _count: { _all: true },
    }),
  ])
  const loadBy = new Map(loads.map((l) => [l.userId, l]))
  const overdueBy = new Map(overdueCounts.map((o) => [o.userId, o._count._all]))

  const rows: CapacityRow[] = users.map((u) => {
    const l = loadBy.get(u.id)
    const busy = l?.busyHoursNext5Days ?? 0
    const free = l?.nextFreeSlot ?? null
    return {
      userId: u.id, name: u.name ?? u.email, email: u.email, avatarUrl: u.image ?? undefined,
      openTasks: l?.openTasks ?? 0,
      overdue: overdueBy.get(u.id) ?? 0,
      busyHours: busy,
      capacityHours: CAPACITY_5D_HOURS,
      utilizationPct: Math.min(150, Math.round((busy / CAPACITY_5D_HOURS) * 100)),
      nextFreeIso: free?.toISOString() ?? null,
      freeNow: free !== null && free.getTime() - now.getTime() < 30 * 60_000,
    }
  })
  // Πιο διαθέσιμος πρώτος.
  return rows.sort((a, b) => a.utilizationPct - b.utilizationPct || a.openTasks - b.openTasks)
}
