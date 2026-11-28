export type TaskCompletionActivity = {
  action: string;
  taskId: string | null;
  actorId?: string | null;
  actor?: { id: string } | null;
  createdAt: Date;
};

export function completionActorId(activity: TaskCompletionActivity): string | null {
  return activity.actorId ?? activity.actor?.id ?? null;
}

/**
 * Keeps the latest completion event for each actor/task pair. Reopening and
 * completing the same task again therefore does not inflate a user's KPI.
 */
export function dedupeCompletionActivities<T extends TaskCompletionActivity>(
  activities: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  for (const activity of activities) {
    if (activity.action !== 'completed' || !activity.taskId) continue;
    const actorId = completionActorId(activity);
    if (!actorId) continue;
    const key = `${actorId}\0${activity.taskId}`;
    const previous = latest.get(key);
    if (!previous || activity.createdAt.getTime() >= previous.createdAt.getTime()) {
      latest.set(key, activity);
    }
  }
  return [...latest.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Returns the most recent completion actor/event for each task. */
export function latestCompletionActivities<T extends TaskCompletionActivity>(
  activities: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  for (const activity of dedupeCompletionActivities(activities)) {
    const previous = latest.get(activity.taskId!);
    if (!previous || activity.createdAt.getTime() >= previous.createdAt.getTime()) {
      latest.set(activity.taskId!, activity);
    }
  }
  return [...latest.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
