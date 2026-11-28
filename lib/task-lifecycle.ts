export const STALE_TASK_DAYS = 30
export const DAY_MS = 24 * 60 * 60 * 1000

export type OpenTaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review'
export type ClosedTaskStatus = 'done' | 'cancelled'
export type TaskLifecycleStatus = OpenTaskStatus | ClosedTaskStatus

export function isOpenTaskStatus(status: string): status is OpenTaskStatus {
  return status !== 'done' && status !== 'cancelled'
}

export function staleTaskCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_TASK_DAYS * DAY_MS)
}

export function isStaleOpenTask(
  task: { createdAt: Date; status: string; mergedIntoId?: string | null },
  now: Date = new Date(),
): boolean {
  return (
    !task.mergedIntoId &&
    isOpenTaskStatus(task.status) &&
    task.createdAt.getTime() <= staleTaskCutoff(now).getTime()
  )
}

/** Empty is a valid choice: billable time is optional, never a completion blocker. */
export function parseBillableHours(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  const normalized = typeof raw === 'string' ? raw.trim().replace(',', '.') : raw
  const value = typeof normalized === 'number' ? normalized : Number(normalized)
  if (!Number.isFinite(value) || value < 0 || value > 100_000) {
    throw new Error('Οι χρεώσιμες ώρες πρέπει να είναι μη αρνητικός αριθμός.')
  }
  return Math.round(value * 100) / 100
}
