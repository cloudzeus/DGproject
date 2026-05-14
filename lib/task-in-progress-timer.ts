// Wall-clock time tracking: while a task sits in status=in_progress, its clock
// ticks. When status transitions out of in_progress, the elapsed delta gets
// folded into inProgressAccumulatedMs. Spent time = accumulated + (currently
// running ? now - inProgressStartedAt : 0).

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

type TimerFields = {
  inProgressStartedAt?: Date | null;
  inProgressAccumulatedMs?: bigint;
};

/**
 * Compute the Prisma data partial needed to keep the in_progress clock
 * accurate when a task's status transitions from `previous` to `next`.
 *
 * Returns an empty object when there is nothing to update — caller can spread
 * it unconditionally into the data payload.
 *
 * @param previousStatus  prior status, or null on create
 * @param nextStatus      requested new status
 * @param previousStartedAt prior value of inProgressStartedAt (null if not currently ticking)
 * @param previousAccumulatedMs prior cumulative duration in ms
 * @param now             clock used to compute the elapsed delta (default Date.now())
 */
export function computeInProgressTimerUpdate(
  previousStatus: TaskStatus | null,
  nextStatus: TaskStatus,
  previousStartedAt: Date | null,
  previousAccumulatedMs: bigint | number,
  now: Date = new Date(),
): TimerFields {
  const wasRunning = previousStatus === 'in_progress';
  const willRun = nextStatus === 'in_progress';

  // No transition into or out of in_progress → leave the timer fields alone.
  if (!wasRunning && !willRun) return {};
  if (wasRunning && willRun) return {};

  // Stopping: fold elapsed delta into accumulated, clear the start.
  if (wasRunning && !willRun) {
    const accumulated = typeof previousAccumulatedMs === 'bigint'
      ? previousAccumulatedMs
      : BigInt(previousAccumulatedMs);
    const startedAtMs = previousStartedAt?.getTime() ?? now.getTime();
    const deltaMs = Math.max(0, now.getTime() - startedAtMs);
    return {
      inProgressStartedAt: null,
      inProgressAccumulatedMs: accumulated + BigInt(deltaMs),
    };
  }

  // Starting: stamp the start; accumulated stays put.
  return {
    inProgressStartedAt: now,
  };
}

/**
 * Compute the spent time (in ms) for a task given its persisted timer state.
 * If the task is currently in_progress, this includes the live delta from
 * inProgressStartedAt to now.
 */
export function computeSpentMs(
  status: TaskStatus,
  inProgressStartedAt: Date | null,
  inProgressAccumulatedMs: bigint | number,
  now: Date = new Date(),
): number {
  const accumulated = typeof inProgressAccumulatedMs === 'bigint'
    ? Number(inProgressAccumulatedMs)
    : inProgressAccumulatedMs;
  if (status === 'in_progress' && inProgressStartedAt) {
    return accumulated + Math.max(0, now.getTime() - inProgressStartedAt.getTime());
  }
  return accumulated;
}

/** Render a duration in ms as `4h 23m` / `38m` / `< 1m`. */
export function formatSpent(ms: number): string {
  if (ms < 60_000) return '< 1m';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`;
}
