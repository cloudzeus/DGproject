# Project Approver / Manager — Design Spec

**Date:** 2026-07-17
**Status:** Approved (design) — pending implementation plan
**Author:** brainstorming session

## 1. Problem

Every project needs one designated user who acts as the **task approver** and de-facto
**project manager (PM)**. This user:

1. Approves tasks before they are considered `done`.
2. Receives an in-app notification whenever a task requests approval and when an approval
   decision is made.
3. Is kept informed about **all** task activity in the project — every task, regardless of
   whether they are the creator or an assignee.

Today there is no such role. `Project` has an `ownerId` and `ProjectMember[]`
(global roles: admin/manager/member/viewer), but no approver. Tasks have a `review` status
in the flow (`backlog → todo → in_progress → review → done`) but it is not an enforced gate —
any project editor can move a task straight to `done`. Notifications are in-app only
(`Notification` table + bell); email exists only for meeting MoM.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Approval mechanism | Reuse the existing `review` task status as the approval gate |
| 2 | Notification channel | In-app only (existing `Notification` model) |
| 3 | PM notification scope | **All** task events |
| 4 | Who assigns the approver | Project owner / global admin / global manager; **optional** per project |
| 5 | Approver eligibility | **Any** workspace user (no project-membership requirement) |
| 6 | Approve/bypass escape hatch | Project **owner** + global **admin** only (a global manager who is not the approver does **not** bypass) |

## 3. Scope

### In scope
- Per-project optional approver assignment.
- Enforced approval gate on `review → done` when an approver is set.
- In-app notifications: approval requests, approval decisions, and PM "all events" firehose.
- UI for assigning the approver and for approving/rejecting tasks in `review`.

### Out of scope (YAGNI)
- Email notifications.
- Dedicated approval audit trail beyond the existing `Activity` log.
- Multiple approvers per project / approval chains.
- Per-project approver roles distinct from the single approver field.

## 4. Data model changes (`prisma/schema.prisma`)

```prisma
model Project {
  // ...existing fields...
  approverId String?
  approver   User?   @relation("ProjectApprover", fields: [approverId], references: [id], onDelete: SetNull)

  @@index([approverId])
}

model User {
  // ...existing relations...
  approverProjects Project[] @relation("ProjectApprover")
}

enum NotificationType {
  mention
  assignment
  due_soon
  comment
  status_change
  question
  answer
  approval        // NEW: approval requests + decisions
}
```

- `approverId` is **nullable** → no backfill; existing projects keep current behaviour
  (no approval gate) until an approver is set.
- `onDelete: SetNull` → deleting the approver user clears the field, project falls back to
  no-gate behaviour rather than cascading.
- One non-destructive Prisma migration (add nullable column + index + enum value).

## 5. Permission rules

New helper in `app/(app)/projects/[id]/task-actions.ts` (or a shared auth module):

```
requireApprover(projectId, session) → grants approve rights if:
  - session.user is the project.approverId, OR
  - session.user is the project.ownerId, OR
  - session.user.role === 'admin' (global)
```

- The **approver** gets implicit **read + approve** access to the project and its tasks even
  if they are not a `ProjectMember`. Any code path that currently gates on
  `requireProjectEditor` for the approve/reject transitions must accept the approver via
  `requireApprover`.
- A global **manager** who is neither owner nor the designated approver **cannot** approve.
- Assigning/changing the approver is allowed for: project owner, global admin, global manager
  (same set that can currently edit project settings).

## 6. Approval gate (`updateTaskStatus`)

Current `updateTaskStatus(projectId, taskId, status)` moves freely between statuses and only
notifies on `→ done`. New behaviour, **conditional on `project.approverId != null`**:

| Transition | Rule |
|------------|------|
| `* → review` | Allowed for editors. Notify approver: "Το task «X» περιμένει έγκριση" (type `approval`, link to task). |
| `review → done` (approve) | Allowed **only** via `requireApprover` (approver / owner / global admin). Otherwise return `{ ok:false, error:'Μόνο ο approver μπορεί να εγκρίνει.' }`. On success notify creator + assignees: "Το task «X» εγκρίθηκε" (type `approval`). |
| `review → in_progress` / `review → todo` by the approver (reject) | Treated as "request changes". Notify creator + assignees: "Ζητήθηκαν αλλαγές στο task «X»" (type `approval`). |
| any transition, **no approver set** | Unchanged from today — `review` is an ordinary column, anyone with edit rights can reach `done`. |

Notes:
- The existing in-progress timer logic and `completedAt` handling stay as-is.
- The existing `notifyTaskCompleted` still fires on reaching `done`; the approval notification
  is additive and deduped (see §7).
- Non-approver editors can still move a task **into** `review`; they just cannot move it out to
  `done`.

## 7. PM "all events" notifications

New helper in `lib/notifications.ts`:

```ts
notifyApprover(
  projectId: string,
  actorId: string,
  payload: { title: string; message: string; type: NotificationType; link?: string },
  alreadyNotified: string[],   // userIds the current event already notified
): Promise<void>
```

Behaviour — **skip** (do nothing) when any of:
- `project.approverId` is null,
- `approverId === actorId` (don't notify the person who did the action),
- `approverId ∈ alreadyNotified`.

Otherwise create exactly one notification for the approver. This guarantees **exactly-once**
delivery and no duplicates when the approver is also the owner/creator/assignee for that event.

Call sites (each passes the userIds it already notified so dedup works):
- `createTask` → "Νέο task «X» στο έργο Y" (type `assignment`/`status_change`).
- `updateTaskStatus` → every status change (not just `done`): "Το task «X»: A → B".
- assignment changes (`notifyTaskAssignment` path).
- completion (`notifyTaskCompleted` path).
- comments (comment-actions) → "Νέο σχόλιο στο task «X»".
- questions/answers (`question-actions`) → reuse `question`/`answer` types.

This fills the gaps that produce **no** notification today (status changes other than `done`,
task creation, comments) so the approver sees the full firehose.

## 8. UI

### 8.1 Assign approver
- In the project settings / project detail header, add a **"Project Manager / Approver"**
  selector listing workspace users (default list: internal employees; any workspace user is
  selectable). Shows the current approver, clearable (→ back to no-gate).
- Editable by owner / global admin / global manager. Read-only display for everyone else.

### 8.2 Approve / reject in `review`
- On the board and task detail, when a task is in `review` **and** the current user passes
  `requireApprover`, show **"Έγκριση"** (→ `done`) and **"Ζήτησε αλλαγές"** (→ `in_progress`)
  actions alongside the existing status control.
- For non-approvers, the `review → done` control is disabled with a tooltip explaining the
  task awaits approval.

### 8.3 Notifications
- `approval`-type notifications render with a distinct icon in the bell dropdown and link to
  the relevant task.

## 9. Data flow

```
member moves task → review
        │
        ├─ updateTaskStatus persists status
        ├─ logTaskActivity('moved')
        └─ notifyApprover(..., type:'approval', "περιμένει έγκριση")
                │
        approver opens link → clicks "Έγκριση"
                │
        updateTaskStatus(review → done) guarded by requireApprover
                ├─ completedAt set, timer stopped
                ├─ notifyTaskCompleted (creator+owner+assignees, deduped)
                └─ approval notification "εγκρίθηκε" to creator+assignees
```

## 10. Error handling & edge cases

- **Non-approver tries `review → done`** → action returns error, UI shows toast, status unchanged.
- **Approver removed from workspace** → `onDelete: SetNull` clears `approverId`; project reverts
  to no-gate; no orphaned references.
- **Approver is also owner/creator/assignee** → `notifyApprover` dedup prevents double
  notifications.
- **No approver set** → zero behavioural change anywhere; feature is fully opt-in per project.
- **Approver not a project member** → still gains read+approve via `requireApprover`; ensure the
  task/project read paths used by the approve UI don't hard-block non-members.

## 11. Testing

- Unit: `requireApprover` matrix (approver / owner / admin / manager / member / stranger).
- Unit: `notifyApprover` dedup (null approver, self-actor, already-notified, happy path).
- Integration: `updateTaskStatus` gate — non-approver blocked on `review → done`; approver
  allowed; owner/admin bypass; reject path notifies.
- Integration: creating/updating tasks emits approver notifications for all event types.
- Migration applies cleanly and is reversible on a DB with existing projects (all get
  `approverId = null`).
