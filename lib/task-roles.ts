export function uniqueUserIds(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flat().map((id) => id.trim()).filter(Boolean))];
}

/** New tasks use the explicit requester relation; legacy/imported tasks fall back to their creator. */
export function effectiveRequesterUsers<T>(
  creator: T,
  requesters: readonly { user: T }[],
): T[] {
  return requesters.length > 0 ? requesters.map((requester) => requester.user) : [creator];
}

/** Unions legacy creator-based requests and explicit requesters without double-counting a task. */
export function uniqueTasksById<T extends { id: string }>(
  ...groups: readonly (readonly T[])[]
): T[] {
  const tasks = new Map<string, T>();
  for (const task of groups.flat()) tasks.set(task.id, task);
  return [...tasks.values()];
}
