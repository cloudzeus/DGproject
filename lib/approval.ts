import type { UserRole } from '@prisma/client';

/**
 * Whether `userId` may approve tasks (move a task into `done`) in a project that
 * has a designated approver. Qualifies: the designated approver, the project
 * owner, or a GLOBAL admin. A global manager who is neither owner nor approver
 * does NOT qualify — approval is a deliberately stricter gate than editing.
 */
export function canApprove(params: {
  approverId: string | null;
  ownerId: string;
  userId: string;
  userRole: UserRole;
}): boolean {
  const { approverId, ownerId, userId, userRole } = params;
  if (userRole === 'admin') return true;
  if (userId === ownerId) return true;
  if (approverId != null && userId === approverId) return true;
  return false;
}

/**
 * True when a status change must pass `canApprove`. Only enforced when an
 * approver is set. Gates ANY entry into `done` (from a non-done state) so review
 * cannot be bypassed by jumping straight to done.
 */
export function isApprovalGatedTransition(
  approverId: string | null,
  from: string | null,
  to: string,
): boolean {
  return approverId != null && to === 'done' && from !== 'done';
}

/** True when a task entering `review` should notify the approver. */
export function entersReview(from: string | null, to: string): boolean {
  return to === 'review' && from !== 'review';
}

/** True when an approver moves a task OUT of review to a non-done state (a rejection). */
export function isRejection(from: string | null, to: string): boolean {
  return from === 'review' && to !== 'done' && to !== 'review';
}
