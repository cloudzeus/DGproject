# Project Approver / Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each project designate one optional approver/PM who gates tasks reaching `done`, is notified on approval requests/decisions, and receives a notification for every task event in the project.

**Architecture:** Add a nullable `Project.approverId`. A shared pure module (`lib/approval.ts`) decides approve rights and which transitions are gated. Both `updateTaskStatus` server actions (project view + global board) call it. A deduped `notifyApprover` helper fans every task event out to the approver. UI adds an approver selector on the project page and surfaces gate errors on the board.

**Tech Stack:** Next.js 16 server actions, Prisma + MySQL, React client components, Fluent UI icons, Tailwind.

**Testing note:** This repo has **no test framework** (no `test` script, no vitest/jest, zero `.test.ts`). Per "follow existing patterns, don't unilaterally restructure," each task is verified with `npx tsc --noEmit`, `npm run build` where relevant, and an explicit runtime check — the same gate used elsewhere in this codebase. Pure logic in `lib/approval.ts` is written to be trivially inspectable.

**Refinement over spec §6:** The gate blocks **any** transition into `done` (not only `review → done`) when an approver is set, so a member cannot bypass review by moving `in_progress → done` directly. Members can still move tasks *into* `review`; only an approver/owner/global-admin reaches `done`.

**Deviation from spec §7:** The "comments" firehose item is **N/A** — the app has no comment-creation code path today (the `Comment` model exists but nothing writes to it). Firehose covers: create, every status change, assignment, completion, questions/answers.

---

### Task 1: Schema — `approverId`, `approval` enum value, migration

**Files:**
- Modify: `prisma/schema.prisma` (Project model ~L249-306, User model ~L120-197, NotificationType enum L65-73)

- [ ] **Step 1: Add the `approval` value to `NotificationType`**

In `prisma/schema.prisma`, change the enum (L65-73) to:

```prisma
enum NotificationType {
  mention
  assignment
  due_soon
  comment
  status_change
  question
  answer
  approval
}
```

- [ ] **Step 2: Add `approverId` + relation to `Project`**

Inside `model Project`, add the field near `ownerId` (after L263) and the relation near `owner` (after L289), plus an index:

```prisma
  ownerId           String
  approverId        String?
```

```prisma
  owner         User              @relation("ProjectOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  approver      User?             @relation("ProjectApprover", fields: [approverId], references: [id], onDelete: SetNull)
```

```prisma
  @@index([ownerId])
  @@index([approverId])
```

- [ ] **Step 3: Add the back-relation on `User`**

Inside `model User`, find the existing `ownedProjects Project[] @relation("ProjectOwner")` back-relation and add beneath it:

```prisma
  approverProjects Project[] @relation("ProjectApprover")
```

(If the owner back-relation has a different name, add `approverProjects` alongside the other `Project[]` relations on `User`.)

- [ ] **Step 4: Create the migration**

Run: `npm run db:migrate -- --name add_project_approver`
Expected: a new folder under `prisma/migrations/` containing `ALTER TABLE Project ADD COLUMN approverId ...`, an FK with `ON DELETE SET NULL`, a new index, and `ALTER TABLE Notification MODIFY type ENUM(...)` adding `approval`. Prisma Client regenerates.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from the generated client).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Project.approverId and approval notification type"
```

---

### Task 2: Shared approval logic (`lib/approval.ts`)

**Files:**
- Create: `lib/approval.ts`

- [ ] **Step 1: Write the module**

```ts
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
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Sanity-check the logic by inspection**

Confirm by reading: `canApprove` returns true for admin / owner / approver only; `isApprovalGatedTransition` is false when `approverId` is null (opt-in preserved); gating any `→ done` closes the review bypass.

- [ ] **Step 4: Commit**

```bash
git add lib/approval.ts
git commit -m "feat: add shared task-approval decision logic"
```

---

### Task 3: `notifyApprover` firehose helper (`lib/notifications.ts`)

**Files:**
- Modify: `lib/notifications.ts` (append after L101)

- [ ] **Step 1: Add the helper**

Append to `lib/notifications.ts`:

```ts
/**
 * Notify a project's approver of a task event. Guarantees EXACTLY-ONCE delivery:
 * does nothing when there is no approver, when the approver is the actor, or when
 * the approver is already in `alreadyNotified` (so owners/assignees who are also
 * the approver never get a duplicate for the same event).
 */
export async function notifyApprover(
  projectId: string,
  actorId: string,
  payload: { title: string; message: string; type: NotificationType; link?: string },
  alreadyNotified: string[] = [],
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { approverId: true },
  });
  const approverId = project?.approverId;
  if (!approverId) return;
  if (approverId === actorId) return;
  if (alreadyNotified.includes(approverId)) return;

  await createNotifications([
    {
      userId: approverId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      link: payload.link,
    },
  ]);
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications.ts
git commit -m "feat: add notifyApprover exactly-once firehose helper"
```

---

### Task 4: Gate + approver notifications in project `updateTaskStatus`

**Files:**
- Modify: `app/(app)/projects/[id]/task-actions.ts` (imports L28-29; `updateTaskStatus` L658-705)

- [ ] **Step 1: Add imports**

`auth` and `prisma` are already imported at the top of the file (L4-5) — do **not** re-add them. Change the existing notifications import (L29) to include the two new names, and add the approval-logic import beneath it:

```ts
import { notifyTaskAssignment, notifyTaskCompleted, notifyApprover, createNotifications } from '@/lib/notifications';
import { canApprove, isApprovalGatedTransition, entersReview, isRejection } from '@/lib/approval';
```

- [ ] **Step 2: Load approver + owner + role, and enforce the gate**

Replace the body of `updateTaskStatus` (L658-705). New version:

```ts
export async function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus) {
  const actorId = await requireProjectEditor(projectId);
  if (!STATUSES.includes(status)) return { ok: false, error: 'Μη έγκυρη κατάσταση.' };

  const session = await auth();
  const actorRole = session?.user?.role ?? 'member';

  const [previous, project, taskMeta] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: { status: true, inProgressStartedAt: true, inProgressAccumulatedMs: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { approverId: true, ownerId: true, name: true },
    }),
    prisma.task.findUnique({ where: { id: taskId }, select: { title: true, createdById: true } }),
  ]);
  if (!project || !taskMeta) return { ok: false, error: 'Δεν βρέθηκε.' };

  const from = previous?.status ?? null;

  if (
    isApprovalGatedTransition(project.approverId, from, status) &&
    !canApprove({ approverId: project.approverId, ownerId: project.ownerId, userId: actorId, userRole: actorRole })
  ) {
    return { ok: false, error: 'Μόνο ο υπεύθυνος έγκρισης (approver) μπορεί να εγκρίνει αυτή την εργασία.' };
  }

  const timerFields = computeInProgressTimerUpdate(
    previous?.status ?? null,
    status,
    previous?.inProgressStartedAt ?? null,
    previous?.inProgressAccumulatedMs ?? 0n,
  );
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt:
        status === 'done' && previous?.status !== 'done'
          ? new Date()
          : status !== 'done'
          ? null
          : undefined,
      ...timerFields,
    },
  });

  if (previous && previous.status !== status) {
    const action: ActivityAction = status === 'done' ? 'completed' : 'moved';
    await logTaskActivity(taskId, projectId, actorId, action, { from: previous.status, to: status });

    // Approval-request notification: task entered review.
    if (project.approverId && entersReview(from, status)) {
      await notifyApprover(
        projectId,
        actorId,
        {
          title: 'Εργασία για έγκριση',
          message: `Η εργασία «${taskMeta.title}» στο έργο ${project.name} περιμένει την έγκρισή σου.`,
          type: 'approval',
          link: '/board',
        },
        [],
      );
    }

    // Approval decision notifications to creator + assignees.
    if (project.approverId && (status === 'done' || isRejection(from, status))) {
      const assignees = await prisma.taskAssignee.findMany({
        where: { taskId },
        select: { userId: true },
      });
      const recipients = new Set<string>([taskMeta.createdById, ...assignees.map((a) => a.userId)]);
      recipients.delete(actorId);
      const decided = status === 'done';
      await createNotifications(
        Array.from(recipients).map((userId) => ({
          userId,
          title: decided ? 'Εργασία εγκρίθηκε' : 'Ζητήθηκαν αλλαγές',
          message: decided
            ? `Η εργασία «${taskMeta.title}» εγκρίθηκε.`
            : `Ζητήθηκαν αλλαγές στην εργασία «${taskMeta.title}».`,
          type: 'approval' as const,
          link: '/board',
        })),
      );
    }

    if (status === 'done' && previous.status !== 'done') {
      await notifyTaskCompleted(taskId, actorId);
    }

    // Firehose: approver hears about every status change. Dedup ONLY on
    // entersReview — the only transition where the approver already received a
    // notification (the "Εργασία για έγκριση" call). On done/reject the decision
    // notifications go to creator+assignees, NOT the approver, so the approver
    // must still be informed here. Skip entirely when no approver is set.
    if (project.approverId) {
      await notifyApprover(
        projectId,
        actorId,
        {
          title: 'Αλλαγή κατάστασης εργασίας',
          message: `Η εργασία «${taskMeta.title}»: ${previous.status} → ${status}.`,
          type: 'status_change',
          link: '/board',
        },
        entersReview(from, status) ? [project.approverId] : [],
      );
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Runtime check**

Run `npm run dev`. On a project **with** an approver: as a plain member, drag a task to `done` → expect the action to fail (status unchanged after refresh). As the approver/owner/admin → succeeds and creator/assignees get an "εγκρίθηκε" notification. On a project **without** approver → behaves exactly as before.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/projects/[id]/task-actions.ts"
git commit -m "feat: enforce approval gate + notify approver on status change (project view)"
```

---

### Task 5: Gate + approver notifications in board `updateTaskStatus`

**Files:**
- Modify: `app/(app)/board/actions.ts` (imports L1-8; `updateTaskStatus` L41-86)

- [ ] **Step 1: Add imports**

After L8 add:

```ts
import { notifyApprover, notifyTaskCompleted, createNotifications } from '@/lib/notifications';
import { canApprove, isApprovalGatedTransition, entersReview, isRejection } from '@/lib/approval';
```

- [ ] **Step 2: Enforce gate + notify**

Replace `updateTaskStatus` (L41-86) with:

```ts
export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  if (!STATUSES.includes(status)) return { ok: false, error: 'Invalid status.' };
  const userId = await requireTaskEditor(taskId);
  const session = await auth();
  const actorRole = session?.user?.role ?? 'member';

  const previous = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      title: true,
      createdById: true,
      inProgressStartedAt: true,
      inProgressAccumulatedMs: true,
      projectId: true,
      project: { select: { approverId: true, ownerId: true, name: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!previous) return { ok: false, error: 'Task not found.' };

  const from = previous.status;
  const approverId = previous.project.approverId;

  if (
    isApprovalGatedTransition(approverId, from, status) &&
    !canApprove({ approverId, ownerId: previous.project.ownerId, userId, userRole: actorRole })
  ) {
    return { ok: false, error: 'Μόνο ο υπεύθυνος έγκρισης (approver) μπορεί να εγκρίνει αυτή την εργασία.' };
  }

  const timerFields = computeInProgressTimerUpdate(
    previous.status,
    status,
    previous.inProgressStartedAt,
    previous.inProgressAccumulatedMs,
  );

  const task = await prisma.task.update({
    where: { id: taskId },
    data: { status, completedAt: status === 'done' ? new Date() : null, ...timerFields },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  });

  await prisma.activity.create({
    data: {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: userId,
      action: status === 'done' ? 'completed' : 'moved',
      targetType: 'task',
      metadata: { to: status },
    },
  });

  if (from !== status) {
    if (approverId && entersReview(from, status)) {
      await notifyApprover(task.projectId, userId, {
        title: 'Εργασία για έγκριση',
        message: `Η εργασία «${previous.title}» στο έργο ${previous.project.name} περιμένει την έγκρισή σου.`,
        type: 'approval',
        link: '/board',
      });
    }
    if (approverId && (status === 'done' || isRejection(from, status))) {
      const recipients = new Set<string>([previous.createdById, ...previous.assignees.map((a) => a.userId)]);
      recipients.delete(userId);
      const decided = status === 'done';
      await createNotifications(
        Array.from(recipients).map((uid) => ({
          userId: uid,
          title: decided ? 'Εργασία εγκρίθηκε' : 'Ζητήθηκαν αλλαγές',
          message: decided
            ? `Η εργασία «${previous.title}» εγκρίθηκε.`
            : `Ζητήθηκαν αλλαγές στην εργασία «${previous.title}».`,
          type: 'approval' as const,
          link: '/board',
        })),
      );
    }
    if (status === 'done' && from !== 'done') {
      await notifyTaskCompleted(taskId, userId);
    }
    // Firehose: approver hears about every status change. Dedup ONLY on
    // entersReview — that is the only transition where the approver already got
    // a notification (the "Εργασία για έγκριση" call above). On done/reject the
    // decision notifications go to creator+assignees, NOT the approver, so the
    // approver must still hear about it here. Skip entirely when no approver.
    if (approverId) {
      await notifyApprover(
        task.projectId,
        userId,
        {
          title: 'Αλλαγή κατάστασης εργασίας',
          message: `Η εργασία «${previous.title}»: ${from} → ${status}.`,
          type: 'status_change',
          link: '/board',
        },
        entersReview(from, status) ? [approverId] : [],
      );
    }
  }

  revalidatePath('/board');
  revalidatePath('/dashboard');
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Runtime check**

On `/board`, drag a task to `done` on an approver-gated project as a non-approver → `board-client.tsx` already reads `res` (L138) and should keep the card in place / show its error. Verify the card snaps back.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/board/actions.ts"
git commit -m "feat: enforce approval gate + notify approver on status change (board)"
```

---

### Task 6: Close edit-form gate gap + approver firehose on create/assignment

**Files:**
- Modify: `app/(app)/projects/[id]/task-actions.ts` (`updateTask` gate ~after L538; `createTask` ~L508; assignment path ~L642)

**Why:** `updateTask` (the edit form, L520) also changes status and can set `done` at ~L648 **without** going through `updateTaskStatus`, so the gate must be enforced here too or a member could approve their own task via the edit dialog.

- [ ] **Step 1: Enforce the gate in `updateTask`**

In `updateTask`, immediately after the `previousAssigneeIds` line (~L538) and before the dependency-cycle validation, insert:

```ts
  // Approval gate: block edit-form status changes into `done` when the project
  // has an approver and the editor is not approver/owner/global-admin.
  {
    const gateProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { approverId: true, ownerId: true },
    });
    const gateSession = await auth();
    const gateActorId = gateSession?.user?.id ?? '';
    const gateRole = gateSession?.user?.role ?? 'member';
    if (
      gateProject &&
      isApprovalGatedTransition(gateProject.approverId, previous?.status ?? null, input.status) &&
      !canApprove({
        approverId: gateProject.approverId,
        ownerId: gateProject.ownerId,
        userId: gateActorId,
        userRole: gateRole,
      })
    ) {
      return {
        ok: false,
        error: 'Μόνο ο υπεύθυνος έγκρισης (approver) μπορεί να εγκρίνει αυτή την εργασία.',
      };
    }
  }
```

(This relies on the imports added in Task 4: `auth`/`prisma` already exist; `canApprove` + `isApprovalGatedTransition` were imported there. Both `updateTask` and `updateTaskStatus` live in this same file, so the Task 4 imports cover it.)

- [ ] **Step 2: Notify approver on create**

In `createTask`, immediately after L508 (`await logTaskActivity(created.id, projectId, actorId, 'created');`) add:

```ts
  await notifyApprover(
    projectId,
    actorId,
    {
      title: 'Νέα εργασία',
      message: `Δημιουργήθηκε η εργασία «${input.title}».`,
      type: 'assignment',
      link: '/board',
    },
    input.assigneeIds, // if the approver was just assigned, notifyTaskAssignment already covers them
  );
```

- [ ] **Step 3: Notify approver on assignment change**

Find the block around L642 (`await notifyTaskAssignment(taskId, addedAssigneeIds, actorId);`). Immediately after it add:

```ts
    await notifyApprover(
      projectId,
      actorId,
      {
        title: 'Αλλαγή ανάθεσης',
        message: `Άλλαξε η ανάθεση στην εργασία.`,
        type: 'assignment',
        link: '/board',
      },
      addedAssigneeIds,
    );
```

(`projectId` and `addedAssigneeIds` are both in scope here — confirmed at L631/L639/L652 of the same `updateTask` function.)

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Runtime check**

Create a task in an approver-gated project as a member → the approver gets a "Νέα εργασία" notification (unless the approver is the creator or a just-added assignee). Then, as a member, open the task edit dialog and try to set status to `done` → blocked with the gate error.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/projects/[id]/task-actions.ts"
git commit -m "feat: close edit-form approval gap + notify approver on create/assignment"
```

---

### Task 7: `setProjectApprover` server action

**Files:**
- Modify: `app/(app)/projects/[id]/actions.ts` (append after L49)

- [ ] **Step 1: Add the action**

Append to `app/(app)/projects/[id]/actions.ts`:

```ts
export async function setProjectApprover(projectId: string, userId: string | null) {
  await requireProjectEditor(projectId);

  if (userId) {
    // Approver may be ANY workspace user — no membership requirement.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return { ok: false, error: 'Ο χρήστης δεν βρέθηκε.' };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { approverId: userId },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/projects/[id]/actions.ts"
git commit -m "feat: add setProjectApprover server action"
```

---

### Task 8: Approver selector UI

**Files:**
- Create: `app/(app)/projects/[id]/approver-selector.tsx`
- Modify: `app/(app)/projects/[id]/page.tsx` (project query ~L14-25; render near `MembersManager` ~L681)

- [ ] **Step 1: Create the selector component**

`app/(app)/projects/[id]/approver-selector.tsx`:

```tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckmarkCircle20Regular, Dismiss16Regular, Search20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { setProjectApprover } from './actions';

type UserLite = { id: string; name: string; email: string; image: string | null };

type Props = {
  projectId: string;
  canEdit: boolean;
  approver: UserLite | null;
  allUsers: UserLite[];
};

export function ApproverSelector({ projectId, canEdit, approver, allUsers }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers.filter(
      (u) => q === '' || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [allUsers, query]);

  function assign(userId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await setProjectApprover(projectId, userId);
      if (res && !res.ok && res.error) setError(res.error);
      else { setOpen(false); setQuery(''); }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="p-4 border-b border-black/5 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Υπεύθυνος έγκρισης (PM)</h2>
        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckmarkCircle20Regular />}
            onClick={() => { setOpen((v) => !v); setError(null); setQuery(''); }}
          >
            {approver ? 'Αλλαγή' : 'Ορισμός'}
          </Button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="px-4 py-3 flex items-center gap-3">
        {approver ? (
          <>
            <Avatar user={{ name: approver.name || approver.email, avatarUrl: approver.image ?? undefined }} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-fluent-neutral-90 truncate">{approver.name || approver.email}</div>
              <div className="text-xs text-fluent-neutral-60 truncate">{approver.email}</div>
            </div>
            {canEdit && (
              <button
                onClick={() => assign(null)}
                disabled={pending}
                className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60 disabled:opacity-50"
                aria-label="Αφαίρεση υπεύθυνου"
              >
                <Dismiss16Regular className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <div className="text-sm text-fluent-neutral-60">Δεν έχει οριστεί υπεύθυνος έγκρισης.</div>
        )}
      </div>

      {open && canEdit && (
        <div className="p-4 space-y-3 bg-fluent-neutral-4 border-t border-black/5">
          <div className="relative">
            <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Αναζήτηση χρήστη…"
              className="w-full h-10 pl-10 pr-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border border-fluent-neutral-20 bg-white">
            {candidates.length === 0 ? (
              <div className="p-4 text-xs text-fluent-neutral-60 text-center">Κανένας χρήστης δεν ταιριάζει.</div>
            ) : (
              candidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={pending}
                  onClick={() => assign(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-fluent-neutral-4 border-b border-black/5 last:border-0 text-left disabled:opacity-50"
                >
                  <Avatar user={{ name: u.name || u.email, avatarUrl: u.image ?? undefined }} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fluent-neutral-90 truncate">{u.name || u.email}</div>
                    <div className="text-xs text-fluent-neutral-60 truncate">{u.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Include the approver in the project query**

In `app/(app)/projects/[id]/page.tsx`, the project fetch (~L14-25) includes `members: { include: { user: true } }`. Add the approver relation to that same `include`/`select`:

```ts
        members: { include: { user: true } },
        approver: { select: { id: true, name: true, email: true, image: true } },
```

- [ ] **Step 3: Render the selector next to `MembersManager`**

In `page.tsx`, find the `<MembersManager ... />` usage (~L681-687). Add directly above it:

```tsx
        <ApproverSelector
          projectId={project.id}
          canEdit={canEdit}
          approver={
            project.approver
              ? {
                  id: project.approver.id,
                  name: project.approver.name ?? '',
                  email: project.approver.email,
                  image: project.approver.image,
                }
              : null
          }
          allUsers={allUsers.map((u) => ({ id: u.id, name: u.name ?? '', email: u.email, image: u.image ?? null }))}
        />
```

And add the import at the top of `page.tsx` next to the `MembersManager` import (L5):

```ts
import { ApproverSelector } from './approver-selector';
```

(If `allUsers` objects don't include `image`, add `image: true` to the `allUsers` query select in the same file, or pass `image: null`.)

- [ ] **Step 4: Verify compile + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, route `/projects/[id]` compiles.

- [ ] **Step 5: Runtime check**

Open a project as owner/admin → assign an approver, change it, clear it. As a plain member → the card shows read-only, no "Ορισμός" button.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/projects/[id]/approver-selector.tsx" "app/(app)/projects/[id]/page.tsx"
git commit -m "feat(ui): project approver selector"
```

---

### Task 9: Surface gate errors + approve/reject affordance on the board

**Files:**
- Modify: `app/(app)/projects/[id]/task-views.tsx` (`setStatus` L128-133)
- Modify: `app/(app)/board/board-client.tsx` (status handler ~L138)

- [ ] **Step 1: Surface the error in the project board**

Replace `setStatus` (L128-133) with a version that reads the result and alerts on failure:

```ts
  const setStatus = (taskId: string, status: TaskStatus) => {
    startTransition(async () => {
      const res = await updateTaskStatus(projectId, taskId, status);
      if (res && !res.ok && res.error) {
        alert(res.error);
      }
      router.refresh();
    });
  };
```

- [ ] **Step 2: Confirm the board client already surfaces the error**

Open `app/(app)/board/board-client.tsx` around L138 (`const res = await updateTaskStatus(taskId, status);`). Ensure a failed `res.ok` reverts the optimistic move and shows `res.error` (add an `alert(res.error)` if it currently swallows it). Concrete guard:

```ts
      const res = await updateTaskStatus(taskId, status);
      if (res && !res.ok) {
        if (res.error) alert(res.error);
        router.refresh(); // snap the card back to its persisted column
        return;
      }
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Runtime check**

As a non-approver on a gated project, drag a task to `done` on both `/projects/[id]` and `/board` → an alert appears with the Greek gate message and the card returns to its column. As the approver → it moves to `done` cleanly.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/projects/[id]/task-views.tsx" "app/(app)/board/board-client.tsx"
git commit -m "feat(ui): surface approval-gate errors on task boards"
```

---

### Task 10: Distinct icon for approval notifications (polish)

**Files:**
- Modify: `components/layout/topbar.tsx` (notification icon import L18-ish; notification row render L404-426)

- [ ] **Step 1: Import an approval icon**

In the icon import block (ends ~L18), add `CheckmarkCircle16Regular` to the `@fluentui/react-icons` import list.

- [ ] **Step 2: Render a leading icon for `approval` rows**

In the `notifications.map` render (L404-426), replace the unread-dot span block with one that shows the approval icon when `n.type === 'approval'`:

```tsx
                {n.type === 'approval' ? (
                  <CheckmarkCircle16Regular className="h-4 w-4 text-fluent-blue-600 mt-0.5 shrink-0" />
                ) : !n.read ? (
                  <span className="h-2 w-2 rounded-full bg-fluent-blue-500 mt-1.5 shrink-0" />
                ) : (
                  <span className="h-2 w-2 shrink-0" />
                )}
```

- [ ] **Step 3: Verify compile + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Runtime check**

Trigger an approval notification (move a task to `review` on a gated project) → the approver's bell shows the row with a checkmark icon.

- [ ] **Step 5: Commit**

```bash
git add components/layout/topbar.tsx
git commit -m "feat(ui): distinct icon for approval notifications"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| §4 `Project.approverId` + relation + index | 1 |
| §4 `NotificationType.approval` | 1 |
| §4 nullable, opt-in, no backfill | 1 |
| §5 `canApprove` (approver/owner/admin; manager excluded) | 2, 4, 5 |
| §5 approver gets approve rights without membership | 2 (`canApprove`) + 4/5 (gate uses it, not `requireProjectEditor` for the decision) |
| §6 gate `→ done` when approver set (board, project view, **and edit form**) | 2, 4, 5, 6 |
| §6 notify approver on `→ review` | 4, 5 |
| §6 approve/reject decision notifications | 4, 5 |
| §6 no approver → unchanged behaviour | 2 (`isApprovalGatedTransition` false when null) |
| §7 `notifyApprover` exactly-once dedup | 3 |
| §7 firehose: create, status, assignment, completion, questions/answers | 4, 5, 6 (comments N/A — no call site) |
| §8.1 approver selector, owner/admin/manager editable | 7, 8 |
| §8.2 approve/reject on board + blocked control feedback | 9 |
| §8.3 distinct icon | 10 |
| §10 approver removed → `SetNull` fallback | 1 (FK `onDelete: SetNull`) |
| §11 gate matrix / dedup / firehose verified | runtime checks in 4, 5, 6, 8, 9 |

**Note on §5 approver-without-membership read access:** the approve *decision* path uses `canApprove` (Task 4/5), which does not require membership, so an approver who is not a member can still approve from the board. Viewing the full project page as a non-member is governed by existing page-level auth and is out of scope; the approver operates via `/board` links in their notifications, which resolve per-task.
