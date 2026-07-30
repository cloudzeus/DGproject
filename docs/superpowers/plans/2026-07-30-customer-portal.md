# Customer Portal (Φάση Β) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ο συνδεδεμένος πελάτης να βλέπει τα έργα και τα tickets της **εταιρίας** του, να ανοίγει και να παρακολουθεί αιτήματα, να σχολιάζει εργασίες και να απαντά σε ερωτήσεις — χωρίς ποτέ να βλέπει εσωτερικά δεδομένα ή άλλη εταιρία.

**Architecture:** Νέο route group `app/(portal)/` κάτω από `/portal/*`. Ο `proxy.ts` γίνεται το μοναδικό σημείο ελέγχου: ο customer δεν φτάνει σε `/(app)` routes **από το routing**, όχι από διάσπαρτους ελέγχους. Όλα τα queries του portal παίρνουν το `where` τους από ένα module, `lib/portal/scope.ts`, με κλειδί το `Company.id` — fail-closed όταν ο χρήστης δεν έχει εταιρία.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma/MySQL (**shadow DB ΣΠΑΣΜΕΝΟ** → `migrate diff` + `db execute` + `migrate resolve`), tests με `node:test` μέσω `npx tsx --test`, Fluent/DG design tokens.

**Προαπαιτούμενο:** Η Φάση Α είναι ολοκληρωμένη (`Company`, `Contact`, `ProjectCompany`, `User.companyId`, `Project.primaryCompanyId`).

---

## Δύο ευρήματα που διαμορφώνουν το plan

**1. Το `Comment` model είναι νεκρό.** Δεν υπάρχει `prisma.comment.create` πουθενά, ούτε
composer, ούτε UI ανάγνωσης — μόνο ένα badge `commentCount` στο
`components/board/task-card.tsx:89` που είναι πάντα 0. Το spec υπέθετε υπάρχοντα composer.
Τα σχόλια χτίζονται εξ ολοκλήρου εδώ, και για τις δύο πλευρές (Tasks 2-4).

**2. Το `TaskQuestion` δουλεύει πλήρως** και έχει το `TaskQuestionsPanel` ως αδελφικό
pattern (`app/(app)/projects/[id]/task-questions-panel.tsx`, renders από
`task-form.tsx:419`). Ο composer σχολίων ακολουθεί ακριβώς αυτό το σχήμα.

---

## File Structure

**Create**
| Αρχείο | Ευθύνη |
|---|---|
| `lib/portal/scope.ts` | `getPortalScope(session)`. Το ΜΟΝΟ σημείο που ορίζει τι βλέπει μια εταιρία. |
| `lib/portal/__tests__/scope.test.ts` | Tests της λογικής scope (καθαρή συνάρτηση + integration). |
| `lib/portal/route-gate.ts` | Καθαρή απόφαση ανακατεύθυνσης ανά route group — δοκιμάσιμη χωρίς HTTP. |
| `lib/portal/__tests__/route-gate.test.ts` | Route-guard tests. |
| `lib/comments/visibility.ts` | Καθαρός κανόνας: ποια σχόλια βλέπει ποιος. |
| `lib/comments/__tests__/visibility.test.ts` | Tests του κανόνα. |
| `app/(app)/projects/[id]/comment-actions.ts` | Server actions σχολίων (staff πλευρά). |
| `app/(app)/projects/[id]/task-comments-panel.tsx` | Composer + λίστα σχολίων στο task form. |
| `app/(portal)/layout.tsx` | Portal shell + gate. |
| `app/(portal)/portal-shell.tsx` | Trimmed nav/shell (client). |
| `app/(portal)/portal/page.tsx` | Landing. |
| `app/(portal)/portal/projects/page.tsx` | Λίστα έργων. |
| `app/(portal)/portal/projects/[id]/page.tsx` | Έργο read-only + σχόλια + ερωτήσεις. |
| `app/(portal)/portal/projects/[id]/portal-project-client.tsx` | Client UI σχολίων/απαντήσεων. |
| `app/(portal)/portal/tickets/page.tsx` | Λίστα tickets. |
| `app/(portal)/portal/tickets/[id]/page.tsx` | Timeline + thread + απάντηση. |
| `app/(portal)/portal/tickets/new/page.tsx` | Νέο αίτημα. |
| `app/(portal)/portal/actions.ts` | Portal write paths (ticket, reply, comment, answer). |
| `lib/portal/__tests__/leak.test.ts` | Το test που πρέπει να επιζήσει κάθε μελλοντικού feature. |
| `scripts/seed-portal-source.ts` | Δημιουργεί το `TicketSource` με code `PORTAL`. |

**Modify**
| Αρχείο | Αλλαγή |
|---|---|
| `prisma/schema.prisma` | `CommentVisibility` enum + `Comment.visibility`. |
| `proxy.ts` | Gating customer ↔ employee ανά route group. |
| `app/(app)/projects/[id]/task-form.tsx` | Render του `TaskCommentsPanel`. |
| `app/(app)/projects/[id]/page.tsx` | Φόρτωση σχολίων ανά task. |

---

### Task 1: `Comment.visibility` + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Πρόσθεσε enum και πεδίο**

Κοντά στα υπόλοιπα enums:

```prisma
enum CommentVisibility {
  /// Μόνο η ομάδα. Το default — τα υπάρχοντα σχόλια μένουν αόρατα στους πελάτες.
  internal
  /// Ορατό και στο portal πελατών.
  shared
}
```

Στο `model Comment`, μετά το `content`:

```prisma
  visibility CommentVisibility @default(internal)
```

και στα indexes του `Comment`: `@@index([taskId, visibility])`

- [ ] **Step 2: Δημιούργησε το migration με diff**

Το shadow DB είναι σπασμένο (P3018 σε παλιό migration), οπότε `migrate dev` αποτυγχάνει.

Run:
```bash
MIG="prisma/migrations/$(date +%Y%m%d%H%M%S)_comment_visibility"
mkdir -p "$MIG"
npx prisma migrate diff \
  --from-url "$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIG/migration.sql"
cat "$MIG/migration.sql"
```

- [ ] **Step 3: ΑΦΑΙΡΕΣΕ τα DROP INDEX για τα FULLTEXT**

**Κρίσιμο.** Το `migrate diff` θα προτείνει ξανά:

```sql
DROP INDEX `KnowledgeEntry_fulltext` ON `KnowledgeEntry`;
DROP INDEX `Task_fulltext` ON `Task`;
```

Η Prisma δεν εκφράζει MySQL FULLTEXT indexes, οπότε φαίνονται μόνιμα ως drift — αλλά τα
χρησιμοποιεί το `lib/tickets/similar.ts:39,81` μέσω `MATCH…AGAINST`. Σβήσε αυτές τις γραμμές
από το `migration.sql` και βάλε στη θέση τους σχόλιο:

```sql
-- NOTE: το `migrate diff` προτείνει να ρίξει τα FULLTEXT indexes
-- KnowledgeEntry_fulltext και Task_fulltext. ΜΗΝ το κάνεις: δημιουργούνται από
-- 20260717100246_ticketing_system και χρησιμοποιούνται από
-- lib/tickets/similar.ts μέσω MATCH…AGAINST. Η Prisma δεν τα εκφράζει, γι' αυτό
-- εμφανίζονται μόνιμα ως drift.
```

Επιβεβαίωσε ότι δεν έμεινε καμία καταστροφική εντολή:

Run: `grep -nE '^\s*(DROP|TRUNCATE|DELETE)' "$MIG/migration.sql"`
Expected: κανένα αποτέλεσμα.

- [ ] **Step 4: Εφάρμοσε**

Run:
```bash
npx prisma db execute --file "$MIG/migration.sql" --schema prisma/schema.prisma
npx prisma migrate resolve --applied "$(basename "$MIG")"
npx prisma generate
```
Expected: «Script executed successfully», «marked as applied».

- [ ] **Step 5: Επαλήθευσε ότι τα FULLTEXT επέζησαν και το default είναι internal**

Run:
```bash
npx tsx --env-file=.env -e "
import('./lib/prisma.ts').then(async ({ prisma }) => {
  const ft = await prisma.\$queryRawUnsafe(\`SELECT COUNT(DISTINCT INDEX_NAME) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND INDEX_TYPE='FULLTEXT'\`)
  console.log('FULLTEXT indexes:', Number(ft[0].n), Number(ft[0].n) === 2 ? 'OK' : 'MISSING')
  const col = await prisma.\$queryRawUnsafe(\`SELECT COLUMN_DEFAULT d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Comment' AND COLUMN_NAME='visibility'\`)
  console.log('Comment.visibility default:', col[0]?.d)
  await prisma.\$disconnect()
})
"
```
Expected: `FULLTEXT indexes: 2 OK` και `default: internal`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Comment.visibility defaulting to internal"
```

---

### Task 2: Ο κανόνας ορατότητας (καθαρός)

Ο κανόνας μπαίνει σε δική του συνάρτηση ώστε να δοκιμάζεται χωρίς DB και να μην
αντιγράφεται σε κάθε query.

**Files:**
- Create: `lib/comments/visibility.ts`
- Test: `lib/comments/__tests__/visibility.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/comments/__tests__/visibility.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentVisibilityFilter, visibilityForAuthor } from '../visibility'

test('η ομάδα βλέπει όλα τα σχόλια', () => {
  assert.deepEqual(commentVisibilityFilter('employee'), {})
  assert.deepEqual(commentVisibilityFilter('supplier'), {})
})

test('ο πελάτης βλέπει μόνο τα shared', () => {
  assert.deepEqual(commentVisibilityFilter('customer'), { visibility: 'shared' })
})

test('άγνωστος/απών τύπος αντιμετωπίζεται ως πελάτης (fail-closed)', () => {
  assert.deepEqual(commentVisibilityFilter(undefined), { visibility: 'shared' })
  assert.deepEqual(commentVisibilityFilter('nonsense' as never), { visibility: 'shared' })
})

test('το σχόλιο πελάτη γράφεται πάντα shared', () => {
  assert.equal(visibilityForAuthor('customer', 'internal'), 'shared')
  assert.equal(visibilityForAuthor('customer', 'shared'), 'shared')
})

test('η ομάδα επιλέγει, με default internal', () => {
  assert.equal(visibilityForAuthor('employee', 'shared'), 'shared')
  assert.equal(visibilityForAuthor('employee', 'internal'), 'internal')
  assert.equal(visibilityForAuthor('employee', undefined), 'internal')
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/comments/__tests__/visibility.test.ts`
Expected: FAIL — `Cannot find module '../visibility'`

- [ ] **Step 3: Υλοποίησε**

```ts
// lib/comments/visibility.ts

export type CommentVisibility = 'internal' | 'shared'
type UserType = 'employee' | 'customer' | 'supplier'

/**
 * Prisma `where` fragment για τα σχόλια που επιτρέπεται να δει ο χρήστης.
 *
 * Fail-closed: οτιδήποτε δεν είναι ρητά μέλος της ομάδας περιορίζεται στα
 * `shared`. Αν προστεθεί νέος userType και ξεχαστεί εδώ, θα βλέπει λιγότερα
 * αντί για περισσότερα.
 */
export function commentVisibilityFilter(
  userType: UserType | string | undefined,
): { visibility?: CommentVisibility } {
  return userType === 'employee' || userType === 'supplier' ? {} : { visibility: 'shared' }
}

/**
 * Η ορατότητα με την οποία αποθηκεύεται ένα νέο σχόλιο.
 *
 * Ο πελάτης δεν μπορεί να γράψει κρυφό σχόλιο — ό,τι γράφει είναι εξ ορισμού
 * ορατό και στην ομάδα και στον ίδιο. Η ομάδα επιλέγει, με default `internal`
 * ώστε η παράλειψη να μη διαρρέει.
 */
export function visibilityForAuthor(
  userType: UserType | string | undefined,
  requested: CommentVisibility | undefined,
): CommentVisibility {
  if (userType !== 'employee' && userType !== 'supplier') return 'shared'
  return requested === 'shared' ? 'shared' : 'internal'
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/comments/__tests__/visibility.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/comments
git commit -m "feat(comments): add fail-closed visibility rule"
```

---

### Task 3: Server actions σχολίων (staff πλευρά)

**Files:**
- Create: `app/(app)/projects/[id]/comment-actions.ts`

- [ ] **Step 1: Γράψε τα actions**

```ts
// app/(app)/projects/[id]/comment-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { visibilityForAuthor, type CommentVisibility } from '@/lib/comments/visibility'

const MAX_LEN = 5000

/**
 * Επιβεβαιώνει ότι ο χρήστης έχει πρόσβαση στο task μέσω του έργου του.
 * Επιστρέφει το projectId για revalidation.
 */
async function assertTaskAccess(taskId: string, userId: string, isPrivileged: boolean) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      projectId: true,
      project: {
        select: {
          ownerId: true,
          members: { where: { userId }, select: { userId: true } },
        },
      },
    },
  })
  if (!task) throw new Error('Δεν βρέθηκε η εργασία.')
  const isMember = task.project.ownerId === userId || task.project.members.length > 0
  if (!isPrivileged && !isMember) throw new Error('Δεν έχεις πρόσβαση σε αυτή την εργασία.')
  return task.projectId
}

export async function addTaskComment(input: {
  taskId: string
  content: string
  visibility?: CommentVisibility
}) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }
  // Οι πελάτες σχολιάζουν από το portal, όχι από εδώ.
  if (session.user.userType === 'customer') {
    return { ok: false as const, error: 'Μη διαθέσιμο.' }
  }

  const content = input.content.trim().slice(0, MAX_LEN)
  if (!content) return { ok: false as const, error: 'Το σχόλιο είναι κενό.' }

  const isPrivileged = session.user.role === 'admin' || session.user.role === 'manager'
  const projectId = await assertTaskAccess(input.taskId, session.user.id, isPrivileged)

  await prisma.comment.create({
    data: {
      taskId: input.taskId,
      authorId: session.user.id,
      content,
      visibility: visibilityForAuthor(session.user.userType, input.visibility),
    },
  })

  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

/** Αλλαγή ορατότητας υπάρχοντος σχολίου — μόνο ο συντάκτης ή admin. */
export async function setCommentVisibility(commentId: string, visibility: CommentVisibility) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }
  if (session.user.userType === 'customer') return { ok: false as const, error: 'Μη διαθέσιμο.' }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, task: { select: { projectId: true } } },
  })
  if (!comment) return { ok: false as const, error: 'Δεν βρέθηκε το σχόλιο.' }
  if (comment.authorId !== session.user.id && session.user.role !== 'admin') {
    return { ok: false as const, error: 'Μόνο ο συντάκτης μπορεί να αλλάξει την ορατότητα.' }
  }

  await prisma.comment.update({ where: { id: commentId }, data: { visibility } })
  revalidatePath(`/projects/${comment.task.projectId}`)
  return { ok: true as const }
}

export async function deleteTaskComment(commentId: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'Απαιτείται σύνδεση.' }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, task: { select: { projectId: true } } },
  })
  if (!comment) return { ok: false as const, error: 'Δεν βρέθηκε το σχόλιο.' }
  if (comment.authorId !== session.user.id && session.user.role !== 'admin') {
    return { ok: false as const, error: 'Μόνο ο συντάκτης μπορεί να το διαγράψει.' }
  }

  await prisma.comment.delete({ where: { id: commentId } })
  revalidatePath(`/projects/${comment.task.projectId}`)
  return { ok: true as const }
}
```

- [ ] **Step 2: Έλεγξε**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/projects/[id]/comment-actions.ts"
git commit -m "feat(comments): add staff-side comment actions with visibility"
```

---

### Task 4: Panel σχολίων στο task form (staff)

Ακολουθεί ακριβώς το σχήμα του `task-questions-panel.tsx`.

**Files:**
- Create: `app/(app)/projects/[id]/task-comments-panel.tsx`
- Modify: `app/(app)/projects/[id]/task-form.tsx`
- Modify: `app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Διάβασε το αδελφικό pattern πρώτα**

Run: `sed -n '1,60p' "app/(app)/projects/[id]/task-questions-panel.tsx"`

Αντέγραψε τη δομή του (props shape, container styling, μοτίβο `useTransition`) ώστε τα δύο
panels να μοιάζουν. Μην εφεύρεις νέο styling.

- [ ] **Step 2: Γράψε το panel**

```tsx
// app/(app)/projects/[id]/task-comments-panel.tsx
'use client'

import { useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { addTaskComment, setCommentVisibility, deleteTaskComment } from './comment-actions'

export type TaskCommentInfo = {
  id: string
  content: string
  visibility: 'internal' | 'shared'
  createdAt: string
  author: { id: string; name: string | null; email: string; image: string | null }
  authorIsCustomer: boolean
}

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' })

export function TaskCommentsPanel({
  taskId,
  comments,
  currentUserId,
  canEdit,
}: {
  taskId: string
  comments: TaskCommentInfo[]
  currentUserId: string
  canEdit: boolean
}) {
  const [content, setContent] = useState('')
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    const text = content.trim()
    if (!text) return
    setError(null)
    startTransition(async () => {
      const res = await addTaskComment({
        taskId,
        content: text,
        visibility: shared ? 'shared' : 'internal',
      })
      if (!res.ok) { setError(res.error); return }
      setContent('')
      setShared(false)
    })
  }

  return (
    <div className="rounded-lg border border-fluent-neutral-20 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fluent-neutral-90">Σχόλια</h3>
        <span className="text-[11px] text-fluent-neutral-60">{comments.length}</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {comments.length === 0 && (
        <p className="text-xs text-fluent-neutral-60">Κανένα σχόλιο ακόμα.</p>
      )}

      <div className="space-y-3 max-h-72 overflow-y-auto">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar name={c.author.name ?? c.author.email} src={c.author.image} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-fluent-neutral-90">
                  {c.author.name ?? c.author.email}
                </span>
                {c.authorIsCustomer && (
                  <span className="text-[9px] uppercase font-semibold text-fluent-blue-700">πελάτης</span>
                )}
                <span
                  className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full ${
                    c.visibility === 'shared'
                      ? 'bg-fluent-blue-50 text-fluent-blue-700'
                      : 'bg-black/5 text-fluent-neutral-60'
                  }`}
                  title={
                    c.visibility === 'shared'
                      ? 'Ορατό στον πελάτη στο portal'
                      : 'Μόνο για την ομάδα'
                  }
                >
                  {c.visibility === 'shared' ? 'κοινό' : 'εσωτερικό'}
                </span>
                <span className="text-[11px] text-fluent-neutral-50">{fmt.format(new Date(c.createdAt))}</span>
              </div>
              <p className="mt-0.5 text-sm text-fluent-neutral-80 whitespace-pre-wrap break-words">
                {c.content}
              </p>
              {canEdit && c.author.id === currentUserId && !c.authorIsCustomer && (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await setCommentVisibility(
                          c.id,
                          c.visibility === 'shared' ? 'internal' : 'shared',
                        )
                        if (!res.ok) setError(res.error)
                      })
                    }
                    className="text-[11px] text-fluent-blue-600 hover:underline disabled:opacity-40"
                  >
                    {c.visibility === 'shared' ? 'Κάνε εσωτερικό' : 'Κοινοποίησε στον πελάτη'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await deleteTaskComment(c.id)
                        if (!res.ok) setError(res.error)
                      })
                    }
                    className="text-[11px] text-fluent-neutral-60 hover:text-red-600 disabled:opacity-40"
                  >
                    Διαγραφή
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="border-t border-black/5 pt-3 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Γράψε σχόλιο…"
            className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-fluent-neutral-70 cursor-pointer">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              Ορατό στον πελάτη
            </label>
            <Button size="sm" onClick={submit} disabled={pending || !content.trim()}>
              Σχολίασε
            </Button>
          </div>
          <p className="text-[10px] text-fluent-neutral-60">
            Χωρίς το τσεκ, το σχόλιο είναι εσωτερικό και δεν εμφανίζεται στο portal πελατών.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Φόρτωσε τα σχόλια στη σελίδα έργου**

Στο `app/(app)/projects/[id]/page.tsx`, στο `tasks` include (γύρω στη γραμμή 27, δίπλα στο
`questions`), πρόσθεσε:

```ts
            comments: {
              orderBy: { createdAt: 'asc' },
              include: {
                author: { select: { id: true, name: true, email: true, image: true, userType: true } },
              },
            },
```

Και όπου χτίζεται το payload κάθε task για το `task-form`, πρόσθεσε:

```ts
  comments: t.comments.map((c) => ({
    id: c.id,
    content: c.content,
    visibility: c.visibility,
    createdAt: c.createdAt.toISOString(),
    author: { id: c.author.id, name: c.author.name, email: c.author.email, image: c.author.image },
    authorIsCustomer: c.author.userType === 'customer',
  })),
```

- [ ] **Step 4: Render το panel**

Στο `app/(app)/projects/[id]/task-form.tsx`, στον τύπο των props δίπλα στο
`questions?: TaskQuestionInfo[]` (γραμμή ~96):

```ts
  comments?: TaskCommentInfo[];
  currentUserId?: string;
```

και στο destructuring (γραμμή ~117) `comments, currentUserId,`. Μετά το
`<TaskQuestionsPanel … />` (γραμμή ~419) πρόσθεσε:

```tsx
          <TaskCommentsPanel
            taskId={initial?.id ?? ''}
            comments={comments ?? []}
            currentUserId={currentUserId ?? ''}
            canEdit={Boolean(initial?.id)}
          />
```

Το `canEdit={Boolean(initial?.id)}` είναι σημαντικό: σε νέα εργασία δεν υπάρχει ακόμα
`taskId`, οπότε ο composer πρέπει να είναι κλειστός.

- [ ] **Step 5: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά. Άνοιξε εργασία, γράψε εσωτερικό σχόλιο και ένα κοινό, δες τα badges.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/projects/[id]"
git commit -m "feat(comments): add task comment panel with internal/shared toggle"
```

---

### Task 5: Το scope module — ο πυρήνας ασφάλειας

**Files:**
- Create: `lib/portal/scope.ts`
- Test: `lib/portal/__tests__/scope.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/portal/__tests__/scope.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPortalUser } from '../scope'

test('isPortalUser δέχεται μόνο customer με companyId', () => {
  assert.equal(isPortalUser({ userType: 'customer', companyId: 'c1' }), true)
  assert.equal(isPortalUser({ userType: 'customer', companyId: null }), false)
  assert.equal(isPortalUser({ userType: 'employee', companyId: 'c1' }), false)
  assert.equal(isPortalUser({ userType: 'supplier', companyId: 'c1' }), false)
  assert.equal(isPortalUser(undefined), false)
  assert.equal(isPortalUser({ userType: undefined, companyId: 'c1' }), false)
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/portal/__tests__/scope.test.ts`
Expected: FAIL — `Cannot find module '../scope'`

- [ ] **Step 3: Υλοποίησε**

```ts
// lib/portal/scope.ts
import { prisma } from '@/lib/prisma'

/**
 * Το ΜΟΝΟ σημείο που ορίζει τι βλέπει μια εταιρία στο portal.
 *
 * Καμία σελίδα του portal δεν χτίζει δικό της φίλτρο. Αυτό είναι το μοναδικό
 * σημείο που πρέπει να ελεγχθεί σε review και το μοναδικό όπου μπορεί να ζήσει
 * bug ορατότητας.
 */

export type PortalScope = {
  companyId: string
  companyName: string
  /** Χρήστες της εταιρίας — για ερωτήσεις και συντάκτες σχολίων. */
  userIds: string[]
  /** Emails χρηστών ΚΑΙ επαφών — για ταίριασμα tickets. */
  emails: string[]
  /** Έργα όπου η εταιρία είναι ΠΕΛΑΤΗΣ. Όχι συνεργάτης. */
  projectIds: string[]
}

type SessionUserLike = { userType?: string; companyId?: string | null } | undefined

/**
 * Fail-closed έλεγχος: μόνο `customer` ΜΕ εταιρία μπαίνει στο portal. Χρήστης
 * χωρίς εταιρία δεν είναι «δει τα πάντα» — είναι «δεν δει τίποτα».
 */
export function isPortalUser(user: SessionUserLike): boolean {
  return user?.userType === 'customer' && Boolean(user.companyId)
}

/**
 * `null` σημαίνει «δεν υπάρχει scope» — η σελίδα δείχνει empty state, ΔΕΝ
 * επιστρέφει αφιλτράριστα δεδομένα.
 */
export async function getPortalScope(userId: string): Promise<PortalScope | null> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true, companyId: true },
  })
  if (!me || me.userType !== 'customer' || !me.companyId) return null

  const company = await prisma.company.findUnique({
    where: { id: me.companyId },
    select: {
      id: true,
      NAME: true,
      users: { select: { id: true, email: true } },
      contacts: { select: { email: true } },
      primaryProjects: { select: { id: true } },
    },
  })
  if (!company) return null

  const emails = new Set<string>()
  for (const u of company.users) if (u.email) emails.add(u.email.toLowerCase())
  for (const c of company.contacts) if (c.email) emails.add(c.email.trim().toLowerCase())

  return {
    companyId: company.id,
    companyName: company.NAME,
    userIds: company.users.map((u) => u.id),
    emails: [...emails],
    // ΜΟΝΟ primaryProjects. Δεν γίνεται join στο ProjectCompany — συνεργάτης ή
    // υπεργολάβος δεν βλέπει ποτέ το έργο στο δικό του portal.
    projectIds: company.primaryProjects.map((p) => p.id),
  }
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/portal/__tests__/scope.test.ts`
Expected: PASS — 1 test

- [ ] **Step 5: Integration test με πραγματικά δεδομένα**

```bash
npx tsx --env-file=.env -e "
import('./lib/portal/scope.ts').then(async ({ getPortalScope }) => {
  const { prisma } = await import('./lib/prisma.ts')
  const employee = await prisma.user.findFirst({ where: { userType: 'employee' }, select: { id: true, email: true } })
  console.log('employee scope:', await getPortalScope(employee.id), '(πρέπει null)')
  await prisma.\$disconnect()
})
"
```
Expected: `null` — οι employees δεν έχουν scope.

- [ ] **Step 6: Commit**

```bash
git add lib/portal
git commit -m "feat(portal): add the single company scoping module"
```

---

### Task 6: Gating στον proxy

Η απόφαση ανακατεύθυνσης βγαίνει σε **καθαρή συνάρτηση** ώστε να δοκιμάζεται χωρίς να
σηκώνουμε HTTP server. Το spec ζητά route-guard tests· χωρίς αυτόν τον διαχωρισμό ο μόνος
τρόπος να ελεγχθεί το gate είναι χειροκίνητα, και δεν θα ελεγχθεί ποτέ ξανά.

**Files:**
- Create: `lib/portal/route-gate.ts`
- Test: `lib/portal/__tests__/route-gate.test.ts`
- Modify: `proxy.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/portal/__tests__/route-gate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateRedirect } from '../route-gate'

test('ο πελάτης γυρίζει στο /portal από κάθε employee route', () => {
  for (const p of ['/dashboard', '/projects', '/admin/users', '/reports', '/board', '/tickets']) {
    assert.equal(gateRedirect(p, 'customer', 'viewer'), '/portal', `απέτυχε για ${p}`)
  }
})

test('ο πελάτης περνά στα /portal routes', () => {
  assert.equal(gateRedirect('/portal', 'customer', 'viewer'), null)
  assert.equal(gateRedirect('/portal/tickets/abc', 'customer', 'viewer'), null)
})

test('κοινές σελίδες λογαριασμού επιτρέπονται στον πελάτη', () => {
  assert.equal(gateRedirect('/profile', 'customer', 'viewer'), null)
  assert.equal(gateRedirect('/auth/change-password', 'customer', 'viewer'), null)
})

test('ο employee γυρίζει στο /dashboard από /portal', () => {
  assert.equal(gateRedirect('/portal', 'employee', 'member'), '/dashboard')
  assert.equal(gateRedirect('/portal/projects', 'supplier', 'viewer'), '/dashboard')
})

test('το /admin παραμένει admin-only', () => {
  assert.equal(gateRedirect('/admin/users', 'employee', 'member'), '/dashboard')
  assert.equal(gateRedirect('/admin/users', 'employee', 'manager'), '/dashboard')
  assert.equal(gateRedirect('/admin/users', 'employee', 'admin'), null)
})

test('άγνωστος userType αντιμετωπίζεται ως πελάτης (fail-closed)', () => {
  assert.equal(gateRedirect('/dashboard', undefined, 'member'), '/portal')
  assert.equal(gateRedirect('/dashboard', 'nonsense', 'member'), '/portal')
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/portal/__tests__/route-gate.test.ts`
Expected: FAIL — `Cannot find module '../route-gate'`

- [ ] **Step 3: Υλοποίησε**

```ts
// lib/portal/route-gate.ts

/** Σελίδες λογαριασμού, διαθέσιμες σε κάθε τύπο χρήστη. */
const SHARED_PATHS = ['/profile', '/auth/change-password']

/**
 * Πού πρέπει να ανακατευθυνθεί ένας συνδεδεμένος χρήστης, ή `null` αν επιτρέπεται.
 *
 * Ο διαχωρισμός πελάτη/ομάδας γίνεται από το ROUTING, όχι από ελέγχους μέσα σε
 * κάθε action: ένα employee route είναι απρόσιτο για πελάτη επειδή ο proxy τον
 * γυρίζει πίσω, χωρίς να χρειάζεται να θυμηθεί κανείς guard σε νέο feature.
 *
 * Fail-closed: οτιδήποτε δεν είναι ρητά `employee`/`supplier` θεωρείται πελάτης.
 */
export function gateRedirect(
  pathname: string,
  userType: string | undefined,
  role: string | undefined,
): string | null {
  if (SHARED_PATHS.some((p) => pathname.startsWith(p))) return null

  const isStaff = userType === 'employee' || userType === 'supplier'
  const inPortal = pathname === '/portal' || pathname.startsWith('/portal/')

  if (!isStaff) return inPortal ? null : '/portal'
  if (inPortal) return '/dashboard'
  if (pathname.startsWith('/admin') && role !== 'admin') return '/dashboard'
  return null
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/portal/__tests__/route-gate.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Σύνδεσε το στον proxy**

Στο `proxy.ts` πρόσθεσε στα imports:

```ts
import { gateRedirect } from "@/lib/portal/route-gate";
```

και αντικατέστησε το τέλος της `proxy` (από το `const role = …` μέχρι το τελικό `return`) με:

```ts
  const role = (session.user as { role?: string }).role || "member";
  const userType = (session.user as { userType?: string }).userType || "employee";

  const redirectTo = gateRedirect(pathname, userType, role);
  if (redirectTo && redirectTo !== pathname) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.user.id);
  requestHeaders.set("x-user-role", role);
  requestHeaders.set("x-user-type", userType);

  return NextResponse.next({ request: { headers: requestHeaders } });
```

Ο έλεγχος `redirectTo !== pathname` αποτρέπει βρόχο ανακατεύθυνσης αν κάποτε το `/portal`
γίνει το target και ταυτόχρονα το τρέχον path.

- [ ] **Step 6: Επιβεβαίωσε ότι το `userType` φτάνει στο session**

Run: `grep -n "session.user.userType" lib/auth.config.ts`
Expected: γραμμή που το αναθέτει από το token (υπάρχει στο `lib/auth.config.ts:122`).

- [ ] **Step 7: Χειροκίνητος έλεγχος**

Run: `npm run build && npm run dev`

Με employee: `/portal` → `/dashboard`. Με customer: `/dashboard` → `/portal`,
`/admin/users` → `/portal`, `/profile` → επιτρέπεται.

- [ ] **Step 8: Commit**

```bash
git add proxy.ts lib/portal/route-gate.ts lib/portal/__tests__/route-gate.test.ts
git commit -m "feat(portal): gate customers to /portal at the routing layer"
```

---

### Task 7: Portal shell + layout

**Files:**
- Create: `app/(portal)/layout.tsx`
- Create: `app/(portal)/portal-shell.tsx`

- [ ] **Step 1: Layout με gate και scope**

```tsx
// app/(portal)/layout.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getPortalScope } from '@/lib/portal/scope'
import { PortalShell } from './portal-shell'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/portal')
  if (session.user.mustChangePassword) redirect('/auth/change-password')

  // Ο proxy έχει ήδη μπλοκάρει τους non-customers, αλλά το επαναλαμβάνουμε εδώ:
  // defence in depth για την περίπτωση που το matcher του proxy αλλάξει.
  if (session.user.userType !== 'customer') redirect('/dashboard')

  const scope = await getPortalScope(session.user.id)

  return (
    <PortalShell
      companyName={scope?.companyName ?? null}
      user={{
        name: session.user.name ?? session.user.email,
        email: session.user.email,
        image: session.user.image ?? null,
      }}
    >
      {scope ? (
        children
      ) : (
        <div className="mx-auto max-w-lg rounded-xl border border-fluent-neutral-20 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-fluent-neutral-90">
            Ο λογαριασμός σου δεν έχει συνδεθεί με εταιρία
          </h1>
          <p className="mt-2 text-sm text-fluent-neutral-60">
            Επικοινώνησε με την ομάδα υποστήριξης για να ολοκληρωθεί η ρύθμιση.
          </p>
        </div>
      )}
    </PortalShell>
  )
}
```

Το empty state ζει στο layout, όχι σε κάθε σελίδα: αν λείπει το scope, καμία σελίδα δεν
προλαβαίνει να τρέξει query.

- [ ] **Step 2: Shell**

```tsx
// app/(portal)/portal-shell.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  Home24Regular, Folder24Regular, TicketDiagonal24Regular, Add16Regular,
} from '@fluentui/react-icons'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/portal', label: 'Αρχική', Icon: Home24Regular },
  { href: '/portal/projects', label: 'Έργα', Icon: Folder24Regular },
  { href: '/portal/tickets', label: 'Αιτήματα', Icon: TicketDiagonal24Regular },
]

export function PortalShell({
  companyName, user, children,
}: {
  companyName: string | null
  user: { name: string; email: string; image: string | null }
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-fluent-neutral-4">
      <header className="bg-white border-b border-black/5">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-4">
          <Link href="/portal" className="flex items-center gap-2.5 shrink-0">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-fluent-blue-500 to-fluent-blue-700 p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sisyphus-icon.svg" alt="" className="h-full w-full object-contain" />
            </div>
            <span className="font-display font-semibold text-[15px] tracking-tight">A-Sisyphus</span>
          </Link>

          <nav className="flex-1 flex items-center gap-1">
            {NAV.map(({ href, label, Icon }) => {
              const active = href === '/portal' ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium',
                    active
                      ? 'bg-fluent-blue-50 text-fluent-blue-700'
                      : 'text-fluent-neutral-80 hover:bg-black/5',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              )
            })}
          </nav>

          <Link
            href="/portal/tickets/new"
            className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-md bg-fluent-blue-600 text-white text-sm font-medium hover:bg-fluent-blue-700"
          >
            <Add16Regular /> Νέο αίτημα
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:block text-right">
              <p className="text-xs font-medium text-fluent-neutral-90 leading-tight">{user.name}</p>
              {companyName && (
                <p className="text-[11px] text-fluent-neutral-60 leading-tight">{companyName}</p>
              )}
            </div>
            <Avatar name={user.name} src={user.image} size="sm" />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="text-xs text-fluent-neutral-60 hover:text-fluent-neutral-90"
            >
              Έξοδος
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά, με `/portal` στη λίστα routes.

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/layout.tsx" "app/(portal)/portal-shell.tsx"
git commit -m "feat(portal): add portal layout and shell"
```

---

### Task 8: Portal landing

**Files:**
- Create: `app/(portal)/portal/page.tsx`

- [ ] **Step 1: Γράψε τη σελίδα**

```tsx
// app/(portal)/portal/page.tsx
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { TICKET_PUBLIC_STATUS_LABEL } from '@/lib/tickets/status-labels'

export const dynamic = 'force-dynamic'

const OPEN_TICKET_STATUSES = ['new', 'analyzing', 'triaged', 'converted', 'needs_info'] as const

export default async function PortalHome() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null // το layout δείχνει το empty state

  const [awaitingReply, openTickets, projects, questions] = await Promise.all([
    prisma.ticket.findMany({
      where: { reporterEmail: { in: scope.emails }, status: 'needs_info' },
      select: { id: true, code: true, subject: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.ticket.count({
      where: { reporterEmail: { in: scope.emails }, status: { in: [...OPEN_TICKET_STATUSES] } },
    }),
    prisma.project.findMany({
      where: { id: { in: scope.projectIds }, status: { in: ['planning', 'active'] } },
      select: {
        id: true, name: true, color: true, dueDate: true,
        _count: { select: { tasks: true } },
        tasks: { where: { status: 'done' }, select: { id: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
      take: 6,
    }),
    prisma.taskQuestion.count({
      where: { askedToId: { in: scope.userIds }, answer: null },
    }),
  ])

  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fluent-neutral-90">{scope.companyName}</h1>
        <p className="text-sm text-fluent-neutral-60 mt-0.5">
          {openTickets} ανοιχτά αιτήματα · {projects.length} ενεργά έργα
          {questions > 0 && ` · ${questions} ερωτήσεις για εσάς`}
        </p>
      </div>

      {awaitingReply.length > 0 && (
        <section className="rounded-xl border border-[#fde7a9] bg-[#fff9e6] p-4">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Περιμένουμε την απάντησή σας</h2>
          <div className="mt-2 space-y-1.5">
            {awaitingReply.map((t) => (
              <Link
                key={t.id}
                href={`/portal/tickets/${t.id}`}
                className="flex items-center gap-3 text-sm hover:underline"
              >
                <span className="font-mono text-xs text-fluent-neutral-60 shrink-0">{t.code}</span>
                <span className="flex-1 truncate">{t.subject}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {questions > 0 && (
        <section className="rounded-xl border border-fluent-blue-200 bg-fluent-blue-50/50 p-4">
          <p className="text-sm text-fluent-neutral-90">
            Η ομάδα έχει <strong>{questions}</strong> ερωτήσεις που περιμένουν απάντηση.
            Θα τις βρείτε μέσα στα έργα σας.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-2">Έργα σε εξέλιξη</h2>
        {projects.length === 0 && (
          <p className="text-sm text-fluent-neutral-60">Κανένα ενεργό έργο.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const total = p._count.tasks
            const done = p.tasks.length
            const pct = total ? Math.round((done / total) * 100) : 0
            return (
              <Link
                key={p.id}
                href={`/portal/projects/${p.id}`}
                className="rounded-xl border border-fluent-neutral-20 bg-white p-4 hover:shadow-fluent-2"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium text-fluent-neutral-90 truncate">{p.name}</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-black/5 overflow-hidden">
                  <div className="h-full rounded-full bg-fluent-blue-600" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-fluent-neutral-60">
                  {done}/{total} εργασίες ({pct}%)
                  {p.dueDate && ` · προθεσμία ${fmtDate.format(p.dueDate)}`}
                </p>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά.

- [ ] **Step 3: Commit**

```bash
git add "app/(portal)/portal/page.tsx"
git commit -m "feat(portal): add portal landing page"
```

---

### Task 9: Έργα στο portal

**Files:**
- Create: `app/(portal)/portal/projects/page.tsx`
- Create: `app/(portal)/portal/projects/[id]/page.tsx`
- Create: `app/(portal)/portal/projects/[id]/portal-project-client.tsx`

- [ ] **Step 1: Λίστα έργων**

```tsx
// app/(portal)/portal/projects/page.tsx
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
}

export default async function PortalProjects() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const projects = await prisma.project.findMany({
    where: { id: { in: scope.projectIds } },
    select: {
      id: true, name: true, description: true, color: true, status: true, dueDate: true,
      _count: { select: { tasks: true } },
      tasks: { where: { status: 'done' }, select: { id: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })

  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-fluent-neutral-90 mb-4">Έργα</h1>
      {projects.length === 0 && (
        <p className="text-sm text-fluent-neutral-60">Δεν υπάρχουν έργα ακόμα.</p>
      )}
      <div className="space-y-3">
        {projects.map((p) => {
          const total = p._count.tasks
          const done = p.tasks.length
          const pct = total ? Math.round((done / total) * 100) : 0
          return (
            <Link
              key={p.id}
              href={`/portal/projects/${p.id}`}
              className="block rounded-xl border border-fluent-neutral-20 bg-white p-4 hover:shadow-fluent-2"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-sm font-medium text-fluent-neutral-90 truncate">{p.name}</span>
                <span className="text-[10px] uppercase font-semibold text-fluent-neutral-60">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
              {p.description && (
                <p className="mt-1.5 text-xs text-fluent-neutral-60 line-clamp-2">{p.description}</p>
              )}
              <div className="mt-3 h-1.5 rounded-full bg-black/5 overflow-hidden">
                <div className="h-full rounded-full bg-fluent-blue-600" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-fluent-neutral-60">
                {done}/{total} εργασίες ({pct}%)
                {p.dueDate && ` · προθεσμία ${fmtDate.format(p.dueDate)}`}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Σελίδα έργου**

Το `notFound()` όταν το id δεν είναι στο scope είναι σημαντικό: δεν αποκαλύπτει ότι
υπάρχει έργο που δεν ανήκει στον πελάτη.

```tsx
// app/(portal)/portal/projects/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { commentVisibilityFilter } from '@/lib/comments/visibility'
import { PortalProjectClient } from './portal-project-client'

export const dynamic = 'force-dynamic'

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: 'Σε εκκρεμότητα',
  in_progress: 'Σε εξέλιξη',
  review: 'Σε έλεγχο',
  done: 'Ολοκληρωμένη',
  blocked: 'Μπλοκαρισμένη',
}

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  // Το scope είναι ο μόνος έλεγχος πρόσβασης. Έργο εκτός scope → 404.
  if (!scope.projectIds.includes(id)) notFound()

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, name: true, description: true, color: true, status: true, dueDate: true,
      tasks: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, title: true, description: true, status: true, priority: true,
          startDate: true, dueDate: true,
          assignees: { select: { user: { select: { name: true, email: true, image: true } } } },
          // ΜΟΝΟ shared σχόλια. Το internal δεν φεύγει ποτέ από τον server.
          // Ο κανόνας έρχεται από το lib/comments/visibility.ts — μία μόνο
          // υλοποίηση, ώστε staff και portal να μη μπορούν να διαφωνήσουν.
          comments: {
            where: commentVisibilityFilter('customer'),
            orderBy: { createdAt: 'asc' },
            select: {
              id: true, content: true, createdAt: true,
              author: { select: { name: true, email: true, image: true, userType: true } },
            },
          },
          // ΜΟΝΟ ερωτήσεις που απευθύνονται σε χρήστη της εταιρίας.
          questions: {
            where: { askedToId: { in: scope.userIds } },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true, question: true, answer: true, createdAt: true, answeredAt: true,
              askedBy: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  })
  if (!project) notFound()

  const fmtDate = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' })

  return (
    <div>
      <Link href="/portal/projects" className="text-xs text-fluent-blue-600">← Έργα</Link>
      <div className="flex items-center gap-2 mt-1">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
        <h1 className="text-2xl font-semibold text-fluent-neutral-90">{project.name}</h1>
      </div>
      {project.description && (
        <p className="mt-1 text-sm text-fluent-neutral-60">{project.description}</p>
      )}
      {project.dueDate && (
        <p className="mt-0.5 text-xs text-fluent-neutral-60">
          Προθεσμία {fmtDate.format(project.dueDate)}
        </p>
      )}

      <PortalProjectClient
        tasks={project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          statusLabel: TASK_STATUS_LABEL[t.status] ?? t.status,
          status: t.status,
          dueDate: t.dueDate?.toISOString() ?? null,
          assignees: t.assignees.map((a) => ({
            name: a.user.name ?? a.user.email,
            image: a.user.image,
          })),
          comments: t.comments.map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt.toISOString(),
            authorName: c.author.name ?? c.author.email,
            authorImage: c.author.image,
            fromUs: c.author.userType === 'customer',
          })),
          questions: t.questions.map((q) => ({
            id: q.id,
            question: q.question,
            answer: q.answer,
            createdAt: q.createdAt.toISOString(),
            askedByName: q.askedBy.name ?? q.askedBy.email,
          })),
        }))}
      />
    </div>
  )
}
```

- [ ] **Step 3: Client component**

```tsx
// app/(portal)/portal/projects/[id]/portal-project-client.tsx
'use client'

import { useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { addPortalComment, answerPortalQuestion } from '../../actions'

type Comment = {
  id: string; content: string; createdAt: string
  authorName: string; authorImage: string | null; fromUs: boolean
}
type Question = {
  id: string; question: string; answer: string | null; createdAt: string; askedByName: string
}
export type PortalTask = {
  id: string; title: string; description: string | null
  status: string; statusLabel: string; dueDate: string | null
  assignees: { name: string; image: string | null }[]
  comments: Comment[]
  questions: Question[]
}

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' })

export function PortalProjectClient({ tasks }: { tasks: PortalTask[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  const pendingQuestions = tasks.reduce(
    (n, t) => n + t.questions.filter((q) => !q.answer).length,
    0,
  )

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-fluent-neutral-90">Εργασίες</h2>
        {pendingQuestions > 0 && (
          <span className="text-xs text-fluent-blue-700">
            {pendingQuestions} ερωτήσεις περιμένουν απάντηση
          </span>
        )}
      </div>

      {tasks.length === 0 && <p className="text-sm text-fluent-neutral-60">Καμία εργασία ακόμα.</p>}

      <div className="space-y-2">
        {tasks.map((t) => {
          const open = openId === t.id
          const unanswered = t.questions.filter((q) => !q.answer).length
          return (
            <div key={t.id} className="rounded-xl border border-fluent-neutral-20 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : t.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02]"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-fluent-neutral-90 truncate">{t.title}</span>
                  <span className="block text-xs text-fluent-neutral-60">
                    {t.statusLabel}
                    {t.dueDate && ` · ${fmt.format(new Date(t.dueDate))}`}
                  </span>
                </span>
                {unanswered > 0 && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-fluent-blue-50 text-fluent-blue-700">
                    {unanswered} ερώτηση
                  </span>
                )}
                {t.comments.length > 0 && (
                  <span className="shrink-0 text-xs text-fluent-neutral-60">{t.comments.length} σχόλια</span>
                )}
                <span className="shrink-0 flex -space-x-1.5">
                  {t.assignees.slice(0, 3).map((a, i) => (
                    <Avatar key={i} name={a.name} src={a.image} size="xs" />
                  ))}
                </span>
              </button>

              {open && (
                <div className="border-t border-black/5 p-4 space-y-4">
                  {t.description && (
                    <p className="text-sm text-fluent-neutral-80 whitespace-pre-wrap">{t.description}</p>
                  )}
                  <QuestionsBlock questions={t.questions} />
                  <CommentsBlock taskId={t.id} comments={t.comments} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuestionsBlock({ questions }: { questions: Question[] }) {
  if (questions.length === 0) return null
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50">Ερωτήσεις</p>
      {questions.map((q) => (
        <QuestionRow key={q.id} q={q} />
      ))}
    </div>
  )
}

function QuestionRow({ q }: { q: Question }) {
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="rounded-lg bg-fluent-neutral-4 p-3">
      <p className="text-xs text-fluent-neutral-60">
        {q.askedByName} · {fmt.format(new Date(q.createdAt))}
      </p>
      <p className="mt-1 text-sm text-fluent-neutral-90 whitespace-pre-wrap">{q.question}</p>
      {q.answer ? (
        <p className="mt-2 rounded-md bg-white p-2 text-sm text-fluent-neutral-80 whitespace-pre-wrap">
          {q.answer}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            placeholder="Η απάντησή σας…"
            className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
          <Button
            size="sm"
            disabled={pending || !answer.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await answerPortalQuestion(q.id, answer)
                if (!res.ok) setError(res.error)
              })
            }
          >
            Απάντηση
          </Button>
        </div>
      )}
    </div>
  )
}

function CommentsBlock({ taskId, comments }: { taskId: string; comments: Comment[] }) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50">Συνομιλία</p>
      {comments.length === 0 && (
        <p className="text-xs text-fluent-neutral-60">Κανένα σχόλιο ακόμα.</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className={`flex ${c.fromUs ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[85%] rounded-lg p-3 ${c.fromUs ? 'bg-fluent-blue-50' : 'bg-fluent-neutral-4'}`}>
            <p className="text-xs font-semibold text-fluent-neutral-60">
              {c.fromUs ? 'Εσείς' : c.authorName}
            </p>
            <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap break-words">{c.content}</p>
            <p className="mt-1 text-[11px] text-fluent-neutral-50">{fmt.format(new Date(c.createdAt))}</p>
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder="Γράψτε σχόλιο…"
        className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
      <Button
        size="sm"
        disabled={pending || !content.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await addPortalComment(taskId, content)
            if (!res.ok) { setError(res.error); return }
            setContent('')
          })
        }
      >
        Σχολιάστε
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά (τα actions του Task 11 πρέπει να υπάρχουν πρώτα — αν τρέχεις με τη σειρά,
κάνε πρώτα το Task 11 ή δημιούργησε placeholder αρχείο).

**Σημείωση σειράς:** το Task 9 εξαρτάται από τα actions του Task 11. Αν εκτελείς αυστηρά με
τη σειρά, κάνε **Task 11 πριν από το Task 9**.

- [ ] **Step 5: Commit**

```bash
git add "app/(portal)/portal/projects"
git commit -m "feat(portal): add read-only project views with shared comments and questions"
```

---

### Task 10: Tickets στο portal

**Files:**
- Create: `app/(portal)/portal/tickets/page.tsx`
- Create: `app/(portal)/portal/tickets/[id]/page.tsx`
- Create: `app/(portal)/portal/tickets/new/page.tsx`

- [ ] **Step 1: Λίστα**

```tsx
// app/(portal)/portal/tickets/page.tsx
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { TICKET_PUBLIC_STATUS_LABEL } from '@/lib/tickets/status-labels'

export const dynamic = 'force-dynamic'

function badgeColor(status: string) {
  if (status === 'resolved' || status === 'closed') return '#0f7b0f'
  if (status === 'rejected') return '#a4262c'
  if (status === 'needs_info') return '#c19c00'
  return '#0078d4'
}

export default async function PortalTickets() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const tickets = await prisma.ticket.findMany({
    where: { reporterEmail: { in: scope.emails } },
    select: {
      id: true, code: true, subject: true, status: true, createdAt: true,
      reporterEmail: true,
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-fluent-neutral-90">Αιτήματα</h1>
        <Link
          href="/portal/tickets/new"
          className="h-9 px-3 inline-flex items-center rounded-md bg-fluent-blue-600 text-white text-sm font-medium hover:bg-fluent-blue-700"
        >
          Νέο αίτημα
        </Link>
      </div>

      {tickets.length === 0 && (
        <p className="text-sm text-fluent-neutral-60">Δεν έχετε υποβάλει αιτήματα ακόμα.</p>
      )}

      <div className="rounded-xl border border-fluent-neutral-20 bg-white divide-y divide-black/5">
        {tickets.map((t) => (
          <Link
            key={t.id}
            href={`/portal/tickets/${t.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02]"
          >
            <span className="font-mono text-xs text-fluent-neutral-60 shrink-0 w-24">{t.code}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-fluent-neutral-90 truncate">{t.subject}</span>
              <span className="block text-xs text-fluent-neutral-60">
                {fmt.format(t.createdAt)} · {t.reporterEmail}
              </span>
            </span>
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: badgeColor(t.status) }}
            >
              {TICKET_PUBLIC_STATUS_LABEL[t.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Σελίδα ticket**

Επαναχρησιμοποιεί το ίδιο σανιτισμένο λεξιλόγιο με το `/t/{token}` — ο πελάτης δεν πρέπει να
βλέπει δύο διαφορετικά ονόματα για την ίδια κατάσταση.

```tsx
// app/(portal)/portal/tickets/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { TICKET_PUBLIC_STATUS_LABEL, publicEventLabel } from '@/lib/tickets/status-labels'
import { PortalTicketReply } from './portal-ticket-reply'

export const dynamic = 'force-dynamic'

export default async function PortalTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true, code: true, subject: true, body: true, status: true,
      createdAt: true, reporterEmail: true, resolutionSummary: true,
      events: { orderBy: { createdAt: 'asc' }, select: { id: true, type: true, payload: true, createdAt: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, body: true, createdAt: true } },
      attachments: { select: { id: true, name: true, url: true } },
    },
  })
  // Ticket εκτός scope → 404, χωρίς να αποκαλύπτεται η ύπαρξή του.
  if (!ticket || !scope.emails.includes(ticket.reporterEmail.toLowerCase())) notFound()

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium', timeStyle: 'short' })
  const timeline = ticket.events
    .map((e) => {
      let payload: Record<string, unknown> | null = null
      try { payload = e.payload ? JSON.parse(e.payload) : null } catch {}
      const label = publicEventLabel(e.type, payload)
      return label ? { id: e.id, label, at: e.createdAt } : null
    })
    .filter((e): e is { id: string; label: string; at: Date } => e !== null)

  const canReply = !['closed', 'rejected', 'merged'].includes(ticket.status)

  return (
    <div className="max-w-2xl">
      <Link href="/portal/tickets" className="text-xs text-fluent-blue-600">← Αιτήματα</Link>
      <h1 className="mt-1 text-xl font-semibold text-fluent-neutral-90">{ticket.subject}</h1>
      <div className="mt-2 flex items-center gap-3">
        <span className="font-mono text-sm text-fluent-neutral-60">{ticket.code}</span>
        <span className="rounded-full bg-fluent-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
          {TICKET_PUBLIC_STATUS_LABEL[ticket.status]}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50">Το αίτημα</p>
        <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap">{ticket.body}</p>
      </div>

      {ticket.resolutionSummary && (
        <div className="mt-4 rounded-xl border border-[#b7e0b7] bg-[#f1faf1] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0f7b0f]">Λύση</p>
          <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap">{ticket.resolutionSummary}</p>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-2">Πορεία</p>
          {timeline.map((e) => (
            <div key={e.id} className="flex gap-3 py-1">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fluent-neutral-40" />
              <div>
                <p className="text-sm text-fluent-neutral-80">{e.label}</p>
                <p className="text-[11px] text-fluent-neutral-50">{fmt.format(e.at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {ticket.messages.length > 0 && (
        <div className="mt-4 space-y-3">
          {ticket.messages.map((m) => {
            const outbound = m.direction === 'outbound'
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${outbound ? 'bg-fluent-neutral-4' : 'bg-fluent-blue-50'}`}>
                  <p className="text-xs font-semibold text-fluent-neutral-60">
                    {outbound ? 'Η ομάδα' : 'Εσείς'}
                  </p>
                  <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-[11px] text-fluent-neutral-50">{fmt.format(m.createdAt)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canReply && <PortalTicketReply ticketId={ticket.id} needsInfo={ticket.status === 'needs_info'} />}
    </div>
  )
}
```

- [ ] **Step 3: Reply component**

```tsx
// app/(portal)/portal/tickets/[id]/portal-ticket-reply.tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { replyToPortalTicket } from '../../actions'

export function PortalTicketReply({ ticketId, needsInfo }: { ticketId: string; needsInfo: boolean }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
      {needsInfo && (
        <p className="mb-3 rounded-lg bg-[#fff4ce] p-3 text-sm text-fluent-neutral-80">
          Η ομάδα περιμένει την απάντησή σας για να συνεχίσει.
        </p>
      )}
      {sent && <p className="mb-2 text-sm text-green-700">Η απάντηση καταγράφηκε.</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <textarea
        value={body}
        onChange={(e) => { setBody(e.target.value); setSent(false) }}
        rows={3}
        placeholder="Η απάντησή σας…"
        className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
      <Button
        className="mt-2"
        disabled={pending || !body.trim()}
        onClick={() =>
          startTransition(async () => {
            const res = await replyToPortalTicket(ticketId, body)
            if (!res.ok) { setError(res.error); return }
            setBody(''); setError(null); setSent(true)
          })
        }
      >
        Αποστολή
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Νέο αίτημα**

```tsx
// app/(portal)/portal/tickets/new/page.tsx
import Link from 'next/link'
import { PortalNewTicketForm } from './portal-new-ticket-form'

export const dynamic = 'force-dynamic'

export default function PortalNewTicket() {
  return (
    <div className="max-w-xl">
      <Link href="/portal/tickets" className="text-xs text-fluent-blue-600">← Αιτήματα</Link>
      <h1 className="mt-1 text-2xl font-semibold text-fluent-neutral-90">Νέο αίτημα</h1>
      <p className="mt-1 text-sm text-fluent-neutral-60">
        Περιγράψτε το θέμα. Θα λάβετε email επιβεβαίωσης και θα μπορείτε να παρακολουθείτε
        την πορεία εδώ.
      </p>
      <PortalNewTicketForm />
    </div>
  )
}
```

```tsx
// app/(portal)/portal/tickets/new/portal-new-ticket-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createPortalTicket } from '../../actions'

export function PortalNewTicketForm() {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="mt-4 space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Θέμα</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Περιγραφή</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={5000}
          className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>
      <Button
        disabled={pending || subject.trim().length < 3 || body.trim().length < 10}
        onClick={() =>
          startTransition(async () => {
            const res = await createPortalTicket({ subject, body })
            if (!res.ok) { setError(res.error); return }
            router.push(`/portal/tickets/${res.id}`)
          })
        }
      >
        Υποβολή
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add "app/(portal)/portal/tickets"
git commit -m "feat(portal): add ticket list, thread and submission pages"
```

---

### Task 11: Portal write paths

**Files:**
- Create: `app/(portal)/portal/actions.ts`
- Create: `scripts/seed-portal-source.ts`

- [ ] **Step 1: Seed του `PORTAL` TicketSource**

```ts
// scripts/seed-portal-source.ts
// Τρέξε μία φορά: npx tsx --env-file=.env scripts/seed-portal-source.ts
//
// Τα tickets του portal δένονται σε δικό τους TicketSource ώστε το triage, το
// dedupe και το rate limiting να δουλεύουν αμετάβλητα — αλλάζει μόνο ο τρόπος
// αυθεντικοποίησης (session αντί για API key).
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

async function main() {
  const existing = await prisma.ticketSource.findUnique({ where: { code: 'PORTAL' } })
  if (existing) { console.log('Το PORTAL source υπάρχει ήδη:', existing.id); return }

  // Το secret δεν χρησιμοποιείται ποτέ (η αυθεντικοποίηση γίνεται με session),
  // αλλά το πεδίο είναι NOT NULL.
  const created = await prisma.ticketSource.create({
    data: {
      code: 'PORTAL',
      name: 'Portal πελατών',
      secretHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 10),
      originUrls: JSON.stringify([]),
      active: true,
    },
  })
  console.log('Δημιουργήθηκε:', created.id)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
```

Run: `npx tsx --env-file=.env scripts/seed-portal-source.ts`
Expected: «Δημιουργήθηκε: …» ή «υπάρχει ήδη».

- [ ] **Step 2: Γράψε τα actions**

```ts
// app/(portal)/portal/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { nextTicketCode } from '@/lib/tickets/codes'
import { sendTicketReceivedEmail } from '@/lib/tickets/emails'
import { checkRateLimit } from '@/lib/tickets/source-auth'

/** Κάθε portal write ξεκινά από εδώ. Χωρίς scope, καμία εγγραφή. */
async function requirePortal() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Απαιτείται σύνδεση.')
  const scope = await getPortalScope(session.user.id)
  if (!scope) throw new Error('Ο λογαριασμός δεν έχει συνδεθεί με εταιρία.')
  return { userId: session.user.id, email: session.user.email, name: session.user.name, scope }
}

export async function createPortalTicket(input: { subject: string; body: string }) {
  // Το scope δεν χρειάζεται εδώ — αρκεί ότι το requirePortal πέτυχε, δηλαδή ο
  // χρήστης είναι πελάτης με εταιρία.
  const { email, name } = await requirePortal()

  const subject = input.subject.trim().slice(0, 200)
  const body = input.body.trim().slice(0, 5000)
  if (subject.length < 3) return { ok: false as const, error: 'Το θέμα είναι πολύ σύντομο.' }
  if (body.length < 10) return { ok: false as const, error: 'Η περιγραφή είναι πολύ σύντομη.' }

  if (!checkRateLimit(`portal:${email}`, 10, 3_600_000)) {
    return { ok: false as const, error: 'Πολλά αιτήματα σε σύντομο διάστημα. Δοκιμάστε αργότερα.' }
  }

  const source = await prisma.ticketSource.findUnique({ where: { code: 'PORTAL' } })
  if (!source?.active) {
    return { ok: false as const, error: 'Η υποβολή αιτημάτων είναι προσωρινά ανενεργή.' }
  }

  // Ίδιος έλεγχος διπλότυπων με το /api/tickets: ίδιο θέμα, ίδιος αποστολέας, 10 λεπτά.
  const duplicate = await prisma.ticket.findFirst({
    where: {
      reporterEmail: email,
      subject,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
  })
  if (duplicate) return { ok: true as const, id: duplicate.id, duplicate: true }

  // Retry: το nextTicketCode μπορεί να συγκρουστεί στο unique code.
  let ticket: { id: string; code: string; publicToken: string } | null = null
  for (let attempt = 0; attempt < 3 && !ticket; attempt++) {
    try {
      ticket = await prisma.ticket.create({
        data: {
          code: await nextTicketCode(),
          sourceId: source.id,
          // ΠΟΤΕ από τη φόρμα — μόνο από το session.
          reporterEmail: email,
          reporterName: name ?? null,
          originUrl: 'portal',
          subject,
          body,
          events: { create: { type: 'created', payload: JSON.stringify({ origin: 'portal' }) } },
        },
        select: { id: true, code: true, publicToken: true },
      })
    } catch (err: unknown) {
      const isUnique = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
      if (!isUnique || attempt === 2) throw err
    }
  }
  if (!ticket) return { ok: false as const, error: 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' }

  void sendTicketReceivedEmail({
    to: email,
    reporterName: name ?? null,
    code: ticket.code,
    subject,
    publicToken: ticket.publicToken,
  })
  void import('@/lib/tickets/triage')
    .then((m) => m.analyzeTicket(ticket!.id))
    .catch((err) => console.error('[portal] analyze kick failed:', err))

  revalidatePath('/portal/tickets')
  revalidatePath('/portal')
  return { ok: true as const, id: ticket.id }
}

export async function replyToPortalTicket(ticketId: string, body: string) {
  const { email, scope } = await requirePortal()
  const text = body.trim().slice(0, 3000)
  if (!text) return { ok: false as const, error: 'Το μήνυμα είναι κενό.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, statusBeforeInfo: true, reporterEmail: true },
  })
  // Ο έλεγχος πρόσβασης είναι το scope, όχι το id.
  if (!ticket || !scope.emails.includes(ticket.reporterEmail.toLowerCase())) {
    return { ok: false as const, error: 'Δεν βρέθηκε το αίτημα.' }
  }
  if (['closed', 'rejected', 'merged'].includes(ticket.status)) {
    return { ok: false as const, error: 'Το αίτημα έχει κλείσει.' }
  }
  if (!checkRateLimit(`portal-reply:${ticket.id}`, 10, 3_600_000)) {
    return { ok: false as const, error: 'Πολλές απαντήσεις σε σύντομο διάστημα.' }
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId: ticket.id, direction: 'inbound', body: text } }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(ticket.status === 'needs_info'
          ? { status: ticket.statusBeforeInfo ?? 'converted', statusBeforeInfo: null }
          : {}),
        events: { create: { type: 'reporter_replied' } },
      },
    }),
  ])

  revalidatePath(`/portal/tickets/${ticket.id}`)
  return { ok: true as const }
}

export async function addPortalComment(taskId: string, content: string) {
  const { userId, scope } = await requirePortal()
  const text = content.trim().slice(0, 5000)
  if (!text) return { ok: false as const, error: 'Το σχόλιο είναι κενό.' }

  // Η εργασία πρέπει να ανήκει σε έργο του scope.
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  if (!task || !scope.projectIds.includes(task.projectId)) {
    return { ok: false as const, error: 'Δεν βρέθηκε η εργασία.' }
  }

  await prisma.comment.create({
    data: {
      taskId,
      authorId: userId,
      content: text,
      // Ο πελάτης δεν μπορεί να γράψει κρυφό σχόλιο.
      visibility: 'shared',
    },
  })

  revalidatePath(`/portal/projects/${task.projectId}`)
  return { ok: true as const }
}

export async function answerPortalQuestion(questionId: string, answer: string) {
  const { userId, scope } = await requirePortal()
  const text = answer.trim().slice(0, 5000)
  if (!text) return { ok: false as const, error: 'Η απάντηση είναι κενή.' }

  const question = await prisma.taskQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, askedToId: true, answer: true, task: { select: { projectId: true } } },
  })
  // Διπλός έλεγχος: η ερώτηση απευθύνεται σε ΕΜΕΝΑ και το έργο είναι στο scope.
  if (!question || question.askedToId !== userId || !scope.projectIds.includes(question.task.projectId)) {
    return { ok: false as const, error: 'Δεν βρέθηκε η ερώτηση.' }
  }
  if (question.answer) return { ok: false as const, error: 'Η ερώτηση έχει ήδη απαντηθεί.' }

  await prisma.taskQuestion.update({
    where: { id: questionId },
    data: { answer: text, answeredAt: new Date() },
  })

  revalidatePath(`/portal/projects/${question.task.projectId}`)
  return { ok: true as const }
}
```

- [ ] **Step 3: Έλεγξε**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/portal/actions.ts" scripts/seed-portal-source.ts
git commit -m "feat(portal): add portal write paths with session-derived identity"
```

---

### Task 12: Το leak test

Αυτό είναι το test που πρέπει να επιζήσει κάθε μελλοντικού feature.

**Files:**
- Create: `lib/portal/__tests__/leak.test.ts`

- [ ] **Step 1: Γράψε το test**

```ts
// lib/portal/__tests__/leak.test.ts
/**
 * Integration test ενάντια στη ζωντανή βάση.
 *
 * Στήνει δύο εταιρίες με χωριστά έργα, εργασίες, σχόλια και tickets, και
 * επιβεβαιώνει ότι το scope της μιας δεν αγγίζει τίποτα της άλλης. Κάθε νέο
 * feature του portal πρέπει να συνεχίζει να το περνά.
 *
 * Τρέξε: npx tsx --env-file=.env --test lib/portal/__tests__/leak.test.ts
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'

const TAG = `leaktest-${process.pid}`
let aUserId = ''
let bProjectId = ''
let bTaskId = ''
let aProjectId = ''
let internalCommentId = ''

before(async () => {
  const workspace = await prisma.workspace.findFirst({ select: { id: true } })
  const staff = await prisma.user.findFirst({ where: { userType: 'employee' }, select: { id: true } })
  assert.ok(workspace && staff, 'χρειάζονται workspace και employee στη βάση')

  const [companyA, companyB] = await Promise.all([
    prisma.company.create({ data: { NAME: `${TAG}-A`, AFM: null, SODTYPE: 13 } }),
    prisma.company.create({ data: { NAME: `${TAG}-B`, AFM: null, SODTYPE: 13 } }),
  ])

  const userA = await prisma.user.create({
    data: {
      email: `${TAG}-a@example.test`, name: 'A', userType: 'customer',
      role: 'viewer', companyId: companyA.id,
    },
  })
  aUserId = userA.id

  const projectA = await prisma.project.create({
    data: {
      name: `${TAG}-projA`, workspaceId: workspace!.id, ownerId: staff!.id,
      primaryCompanyId: companyA.id, projectCode: `${TAG}-A`,
    },
  })
  aProjectId = projectA.id

  const projectB = await prisma.project.create({
    data: {
      name: `${TAG}-projB`, workspaceId: workspace!.id, ownerId: staff!.id,
      primaryCompanyId: companyB.id, projectCode: `${TAG}-B`,
    },
  })
  bProjectId = projectB.id

  const taskA = await prisma.task.create({
    data: { title: `${TAG}-taskA`, projectId: projectA.id, createdById: staff!.id },
  })
  const taskB = await prisma.task.create({
    data: { title: `${TAG}-taskB`, projectId: projectB.id, createdById: staff!.id },
  })
  bTaskId = taskB.id

  const internal = await prisma.comment.create({
    data: { taskId: taskA.id, authorId: staff!.id, content: `${TAG}-INTERNAL`, visibility: 'internal' },
  })
  internalCommentId = internal.id
  await prisma.comment.create({
    data: { taskId: taskA.id, authorId: staff!.id, content: `${TAG}-SHARED`, visibility: 'shared' },
  })

  // Το έργο B συνδέεται στην εταιρία A ως υπεργολάβος — ΔΕΝ πρέπει να το βλέπει.
  await prisma.projectCompany.create({
    data: { projectId: projectB.id, companyId: companyA.id, role: 'subcontractor' },
  })
})

after(async () => {
  await prisma.comment.deleteMany({ where: { content: { contains: TAG } } })
  await prisma.task.deleteMany({ where: { title: { contains: TAG } } })
  await prisma.project.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.company.deleteMany({ where: { NAME: { contains: TAG } } })
  await prisma.$disconnect()
})

test('το scope περιέχει μόνο το έργο της δικής του εταιρίας', async () => {
  const scope = await getPortalScope(aUserId)
  assert.ok(scope)
  assert.deepEqual(scope!.projectIds, [aProjectId])
})

test('έργο όπου η εταιρία είναι ΥΠΕΡΓΟΛΑΒΟΣ δεν μπαίνει στο scope', async () => {
  const scope = await getPortalScope(aUserId)
  assert.equal(scope!.projectIds.includes(bProjectId), false)
})

test('τα εσωτερικά σχόλια δεν επιστρέφονται στο portal query', async () => {
  const scope = await getPortalScope(aUserId)
  const comments = await prisma.comment.findMany({
    where: { visibility: 'shared', task: { projectId: { in: scope!.projectIds } } },
    select: { id: true, content: true },
  })
  assert.equal(comments.some((c) => c.id === internalCommentId), false)
  assert.equal(comments.some((c) => c.content.endsWith('-SHARED')), true)
})

test('η εργασία άλλης εταιρίας δεν είναι προσβάσιμη μέσω scope', async () => {
  const scope = await getPortalScope(aUserId)
  const task = await prisma.task.findUnique({ where: { id: bTaskId }, select: { projectId: true } })
  assert.equal(scope!.projectIds.includes(task!.projectId), false)
})

test('χρήστης χωρίς εταιρία δεν έχει scope', async () => {
  const orphan = await prisma.user.create({
    data: { email: `${TAG}-orphan@example.test`, userType: 'customer', role: 'viewer' },
  })
  assert.equal(await getPortalScope(orphan.id), null)
})

test('employee δεν έχει scope', async () => {
  const staff = await prisma.user.findFirst({ where: { userType: 'employee' }, select: { id: true } })
  assert.equal(await getPortalScope(staff!.id), null)
})
```

- [ ] **Step 2: Τρέξε το**

Run: `npx tsx --env-file=.env --test lib/portal/__tests__/leak.test.ts`
Expected: PASS — 6 tests, και κανένα υπόλειμμα `leaktest-` στη βάση μετά.

- [ ] **Step 3: Επιβεβαίωσε ότι δεν έμεινε σκουπίδι**

Run:
```bash
npx tsx --env-file=.env -e "
import('./lib/prisma.ts').then(async ({ prisma }) => {
  console.log('leaktest companies:', await prisma.company.count({ where: { NAME: { contains: 'leaktest' } } }))
  console.log('leaktest users    :', await prisma.user.count({ where: { email: { contains: 'leaktest' } } }))
  await prisma.\$disconnect()
})
"
```
Expected: `0` και `0`.

- [ ] **Step 4: Commit**

```bash
git add lib/portal/__tests__/leak.test.ts
git commit -m "test(portal): add cross-company leak test"
```

---

### Task 13: Τελικός έλεγχος

- [ ] **Step 1: Όλα τα unit tests**

Run: `npx tsx --test lib/companies/__tests__/*.test.ts lib/comments/__tests__/*.test.ts lib/portal/__tests__/scope.test.ts lib/portal/__tests__/route-gate.test.ts lib/tickets/__tests__/*.test.ts`
Expected: όλα PASS

- [ ] **Step 2: Leak test**

Run: `npx tsx --env-file=.env --test lib/portal/__tests__/leak.test.ts`
Expected: PASS

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά, με `/portal`, `/portal/projects`, `/portal/tickets` στη λίστα routes.

- [ ] **Step 4: Χειροκίνητος έλεγχος με πραγματικό λογαριασμό πελάτη**

1. `/admin/companies` → διάλεξε εταιρία → πρόσθεσε επαφή με email → «Δώσε πρόσβαση» → αντίγραψε τον προσωρινό κωδικό.
2. Όρισε αυτή την εταιρία ως πελάτη σε ένα έργο (φόρμα έργου).
3. Σε μια εργασία του έργου, γράψε ένα **εσωτερικό** και ένα **κοινό** σχόλιο.
4. Βγες, μπες με τον νέο λογαριασμό (θα ζητήσει αλλαγή κωδικού).
5. Επιβεβαίωσε: `/portal` δείχνει το έργο· η εργασία δείχνει **μόνο** το κοινό σχόλιο· `/dashboard` και `/admin/users` κάνουν redirect· υποβολή νέου αιτήματος δουλεύει και έρχεται email.

- [ ] **Step 5: Έλεγχος ακεραιότητας**

Run:
```bash
npx prisma db execute --stdin --schema prisma/schema.prisma <<'SQL'
SELECT 'σχόλια χωρίς ορατότητα' AS check_name, COUNT(*) AS bad FROM Comment WHERE visibility IS NULL
UNION ALL
SELECT 'πελάτες χωρίς εταιρία', COUNT(*) FROM User WHERE userType='customer' AND companyId IS NULL
UNION ALL
SELECT 'σχόλια πελάτη μαρκαρισμένα internal', COUNT(*) FROM Comment c JOIN User u ON u.id=c.authorId WHERE u.userType='customer' AND c.visibility='internal';
SQL
```
Expected: `bad` = 0 σε όλες τις γραμμές. Η τρίτη γραμμή είναι ο σημαντικός έλεγχος: σχόλιο
πελάτη δεν πρέπει ποτέ να είναι `internal`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(portal): final verification fixes"
```

---

## Τι ΔΕΝ κάνει αυτό το plan

- **Κόστη/τιμολόγια.** Το `ProjectCostLine` δεν αγγίζεται· η έκθεση χρημάτων είναι ξεχωριστή απόφαση.
- **Εγκρίσεις πελάτη.** Το `Project.approver` μένει εσωτερικό.
- **Γενικό file browser.** Το `Attachment` δεν έχει πεδίο ορατότητας — μόνο συνημμένα tickets φαίνονται. Δικό του flag θέλει, όταν και αν ζητηθεί.
- **Συνημμένα σε σχόλια πελατών.** Το `TaskQuestionAttachment` υπάρχει για ερωτήσεις· τα σχόλια είναι μόνο κείμενο στη v1.
- **Ανώνυμη ροή.** Τα `/t/{token}` και `/help/{source}` μένουν ακριβώς όπως είναι.
