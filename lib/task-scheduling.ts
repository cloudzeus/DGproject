/**
 * Occupancy-based scheduling primitives shared by the backfill script
 * (scripts/backfill-task-dates.ts), ticket triage and the triage UI.
 *
 * Availability is DERIVED from task occupancy inside business hours
 * (lib/business-hours.ts) — there is no per-user schedule column.
 * Server timezone is Europe/Athens, so getHours()/setHours() are local
 * business time.
 */
// Relative imports (not '@/...') so CLI scripts (tsx/ts-node) can import this
// module without tsconfig path-alias resolution.
import { prisma } from './prisma'
import {
  BUSINESS_START_HOUR,
  BUSINESS_START_MINUTE,
  BUSINESS_END_HOUR,
  BUSINESS_END_MINUTE,
  normalizeToBusinessHours,
} from './business-hours'

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
export function sameLocalDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b)
}
export function atBusinessStart(day: Date): Date {
  const d = new Date(day)
  d.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0)
  return d
}
export function atBusinessEnd(day: Date): Date {
  const d = new Date(day)
  d.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0)
  return d
}
export function isWeekend(d: Date): boolean {
  const wd = d.getDay()
  return wd === 0 || wd === 6
}

/** Occupancy = latest busy end (ms) per `userId|dayKey`. */
export type Occupancy = Map<string, number>

export function occKey(userId: string, day: Date): string {
  return `${userId}|${dayKey(day)}`
}
export function latestEndFor(occ: Occupancy, users: string[], day: Date): number {
  let max = -Infinity
  for (const u of users) {
    const v = occ.get(occKey(u, day))
    if (v !== undefined && v > max) max = v
  }
  return max
}
export function markBusy(occ: Occupancy, users: string[], start: Date, end: Date) {
  const k = end.getTime()
  for (const u of users) {
    const key = occKey(u, start)
    occ.set(key, Math.max(occ.get(key) ?? -Infinity, k))
  }
}

// ─── User load summary (triage suggestions + UI hints) ────────────────

export interface UserLoad {
  userId: string
  /** Open tasks (todo / in_progress / review) where the user is an assignee. */
  openTasks: number
  /** Scheduled hours inside the next 5 business days. */
  busyHoursNext5Days: number
  /** First business-hours gap of ≥1h within the next 10 business days. */
  nextFreeSlot: Date | null
}

const OPEN_STATUSES = ['todo', 'in_progress', 'review'] as const

export async function getUserLoads(userIds: string[]): Promise<UserLoad[]> {
  if (userIds.length === 0) return []

  const now = new Date()
  const horizon = addBusinessDays(now, 10)

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: OPEN_STATUSES as unknown as ('todo' | 'in_progress' | 'review')[] },
      project: { status: { not: 'archived' } },
      assignees: { some: { userId: { in: userIds } } },
    },
    select: {
      startDate: true,
      dueDate: true,
      estimatedHours: true,
      assignees: { select: { userId: true } },
    },
  })

  const open = new Map<string, number>()
  const busyMs = new Map<string, number>()
  const occ: Occupancy = new Map()
  const fiveDayEnd = addBusinessDays(now, 5)

  for (const t of tasks) {
    const users = t.assignees.map((a) => a.userId).filter((u) => userIds.includes(u))
    for (const u of users) open.set(u, (open.get(u) ?? 0) + 1)

    if (!t.startDate || !t.dueDate) continue
    if (t.dueDate <= now || t.startDate >= horizon) continue
    markBusy(occ, users, t.startDate, t.dueDate)
    if (t.startDate < fiveDayEnd) {
      const ms = Math.min(t.dueDate.getTime(), fiveDayEnd.getTime()) - Math.max(t.startDate.getTime(), now.getTime())
      if (ms > 0) for (const u of users) busyMs.set(u, (busyMs.get(u) ?? 0) + ms)
    }
  }

  return userIds.map((userId) => ({
    userId,
    openTasks: open.get(userId) ?? 0,
    busyHoursNext5Days: Math.round(((busyMs.get(userId) ?? 0) / 3_600_000) * 10) / 10,
    nextFreeSlot: findNextFreeSlot(occ, userId, now),
  }))
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (!isWeekend(d)) added++
  }
  return d
}

function findNextFreeSlot(occ: Occupancy, userId: string, from: Date): Date | null {
  const cursor = normalizeToBusinessHours(new Date(from))
  for (let i = 0; i < 14; i++) {
    const day = new Date(cursor)
    day.setDate(day.getDate() + i)
    if (isWeekend(day)) continue
    const base = i === 0 ? Math.max(cursor.getTime(), atBusinessStart(day).getTime()) : atBusinessStart(day).getTime()
    const busyUntil = latestEndFor(occ, [userId], day)
    const candidate = Math.max(base, busyUntil === -Infinity ? base : busyUntil)
    if (candidate + 3_600_000 <= atBusinessEnd(day).getTime()) {
      return new Date(candidate)
    }
  }
  return null
}
