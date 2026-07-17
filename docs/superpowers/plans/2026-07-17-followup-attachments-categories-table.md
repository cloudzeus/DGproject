# Follow-up, Attachments, AI Categories & Tickets Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Νήμα follow-up διευκρινίσεων (status `needs_info`), εικόνες στη φόρμα ticket → Bunny CDN → task, δυναμικές AI κατηγορίες KB/help center, και αναβαθμισμένο `/tickets` data table (row dropdown, bulk actions, merge, expandable ιστορικό).

**Architecture:** Spec: `docs/superpowers/specs/2026-07-17-ticket-followup-attachments-categories-design.md`. Νέα μοντέλα `HelpCategory`, `TicketAttachment`, `TicketMessage`· νέα statuses `needs_info`, `merged` + `Ticket.statusBeforeInfo/mergedIntoId`. Public συμμετοχή μέσω token (`/t/{token}` reply form → `POST /api/tickets/[code]/reply`). Το `/tickets` γίνεται client table component με server actions.

**Tech Stack:** Next.js App Router, Prisma/MySQL (shadow DB ΣΠΑΣΜΕΝΟ — migrations με `prisma migrate diff --from-url` ή hand-written SQL + `migrate deploy`), Bunny CDN (`lib/bunnycdn.ts` υπάρχον), DeepSeek (pattern `lib/tickets/kb.ts`), custom dropdown/modal patterns (topbar flyouts, resolution-dialog), node:test μέσω `npx tsx --test`.

**Κρίσιμες συμβάσεις repo:**
- Server actions: `{ ok: true as const, ... } | { ok: false as const, error: string }`. `requireTriager` (admin|manager) στο `app/(app)/tickets/actions.ts:15`.
- `/tickets/page.tsx` είναι σήμερα καθαρό server component με `<table>` (γραμμές 126-164), badges `STATUS_BADGE` map, labels από `lib/tickets/status-labels.ts`.
- `/t/[token]/page.tsx` server component, generic `neutral-*` palette (ΟΧΙ fluent tokens), timeline με `publicEventLabel`.
- Token auth API pattern: `app/api/tickets/[code]/route.ts` — lookup by code, verify `ticket.publicToken !== token` → 404.
- Upload route pattern: `app/api/upload/project-attachment/[projectId]/route.ts` — formData, size check, `uploadFileToCDN({file: buffer, filename, folder, contentType})` → `{url}`.
- Notifications: `createNotifications([{userId,title,message,type:'ticket',link}])` από `lib/notifications.ts:13` (createMany, swallow errors).
- `TaskAssignee`: `@@unique([taskId,userId])`· replace pattern `deleteMany + createMany` (task-actions.ts:668-684).
- Dropdown pattern: topbar flyouts (`components/layout/topbar.tsx:216-224`) — fixed backdrop + absolute motion.div. Κανένα `dark:` class πουθενά.
- Emails: `lib/tickets/emails.ts` (`emailLayout`, `metaTable`, `quote`, `safeSend`) — όλα σε try/catch.

---

### Task 1: Schema — HelpCategory, TicketAttachment, TicketMessage, statuses

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: enum + Ticket πεδία**

`enum TicketStatus` προσθέτει (μετά το `rejected`):
```prisma
  needs_info
  merged
```

`model Ticket` προσθέτει (μετά το `resolutionSummary`):
```prisma
  // Status to restore when the reporter answers a clarification request
  statusBeforeInfo TicketStatus?
  // Set when this ticket was merged into another (status becomes 'merged')
  mergedIntoId String?

  attachments TicketAttachment[]
  messages    TicketMessage[]
```
και index `@@index([mergedIntoId])`.

- [ ] **Step 2: Νέα μοντέλα** (μετά το KnowledgeEntry)

```prisma
model HelpCategory {
  id        String   @id @default(cuid())
  name      String   @unique
  slug      String   @unique
  sourceId  String?
  createdAt DateTime @default(now())

  entries KnowledgeEntry[]
}

model TicketAttachment {
  id        String   @id @default(cuid())
  ticketId  String
  name      String
  size      Int
  mimeType  String
  url       String   @db.Text
  createdAt DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
}

model TicketMessage {
  id        String   @id @default(cuid())
  ticketId  String
  // 'outbound' = ομάδα → πελάτης, 'inbound' = πελάτης → ομάδα
  direction String
  body      String   @db.Text
  authorId  String?
  createdAt DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
}
```

`model KnowledgeEntry` προσθέτει:
```prisma
  helpCategoryId String?
  helpCategory   HelpCategory? @relation(fields: [helpCategoryId], references: [id], onDelete: SetNull)
```
και `@@index([helpCategoryId])`.

- [ ] **Step 3: Migration (shadow-DB workaround — ΟΧΙ σκέτο migrate dev)**

```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > /private/tmp/mig.sql
# Επιθεώρησε το SQL: πρέπει να έχει ΜΟΝΟ τα νέα (2 enum values ως ALTER MODIFY status columns, νέες στήλες, 3 CREATE TABLE, indexes, FKs). Αν προτείνει DROP σε FULLTEXT indexes (KnowledgeEntry_fulltext/Task_fulltext) ΑΦΑΙΡΕΣΕ τα.
mkdir -p prisma/migrations/20260717150000_followup_attachments_categories
cp /private/tmp/mig.sql prisma/migrations/20260717150000_followup_attachments_categories/migration.sql
npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit
```
(DATABASE_URL από .env. Αν το timestamp πέφτει πριν από applied migration, μετονόμασε ώστε να ταξινομείται τελευταίο.)

- [ ] **Step 4: Commit** — `git add prisma/ && git commit -m "feat(tickets): schema for follow-up, attachments, merge, help categories"`

---

### Task 2: Magic-bytes image sniffer (TDD)

**Files:** Create `lib/tickets/image-sniff.ts`, Test `lib/tickets/__tests__/image-sniff.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffImage } from '../image-sniff'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 ')])

test('detects jpeg', () => assert.deepEqual(sniffImage(jpeg), { mime: 'image/jpeg', ext: 'jpg' }))
test('detects png', () => assert.deepEqual(sniffImage(png), { mime: 'image/png', ext: 'png' }))
test('detects webp', () => assert.deepEqual(sniffImage(webp), { mime: 'image/webp', ext: 'webp' }))
test('rejects gif', () => assert.equal(sniffImage(Buffer.from('GIF89a....')), null))
test('rejects pdf', () => assert.equal(sniffImage(Buffer.from('%PDF-1.4')), null))
test('rejects riff-but-not-webp (wav)', () =>
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])), null))
test('rejects tiny buffer', () => assert.equal(sniffImage(Buffer.from([0xff])), null))
```

Run: `npx tsx --test lib/tickets/__tests__/image-sniff.test.ts` → FAIL (module not found).

- [ ] **Step 2: Υλοποίηση**

```ts
// lib/tickets/image-sniff.ts

export type SniffedImage = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' }

/** Identify jpeg/png/webp από τα magic bytes — ποτέ εμπιστοσύνη στο δηλωμένο content-type. */
export function sniffImage(buf: Buffer): SniffedImage | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return { mime: 'image/png', ext: 'png' }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' }
  return null
}
```

- [ ] **Step 3:** Run test → `# pass 7`. Commit: `git add lib/tickets/image-sniff.ts lib/tickets/__tests__/image-sniff.test.ts && git commit -m "feat(tickets): magic-bytes image sniffer"`

---

### Task 3: Status labels & badges για needs_info/merged + νέα event labels

**Files:** Modify `lib/tickets/status-labels.ts`, `app/(app)/tickets/page.tsx` (STATUS_BADGE map, γρ. 10-18), `app/(app)/tickets/[id]/ticket-detail-client.tsx` (eventLabel switch)

- [ ] **Step 1: status-labels.ts**

`TICKET_PUBLIC_STATUS_LABEL`: `needs_info: 'Αναμονή απάντησής σας'`, `merged: 'Συγχωνεύθηκε'`.
`TICKET_STATUS_LABEL`: `needs_info: 'Αναμονή πελάτη'`, `merged: 'Συγχωνεύθηκε'`.
`publicEventLabel` προσθέτει cases: `clarification_requested` → `'Ζητήθηκε διευκρίνιση'`, `reporter_replied` → `'Λάβαμε την απάντησή σας'`, `merged` → `'Το αίτημα συγχωνεύθηκε με άλλο'`.

- [ ] **Step 2: STATUS_BADGE (tickets/page.tsx)** προσθέτει: `needs_info: 'bg-amber-100 text-amber-800'`, `merged: 'bg-neutral-200 text-neutral-600'`.

- [ ] **Step 3: eventLabel switch (ticket-detail-client.tsx)** προσθέτει: `clarification_requested` → `'Ζητήθηκε διευκρίνιση'`, `reporter_replied` → `'Απάντησε ο πελάτης'`, `merged` → `'Συγχωνεύθηκε'`, `absorbed` → `'Απορρόφησε συγχωνευμένο ticket'`.

- [ ] **Step 4:** `npx tsc --noEmit` (τα Records είναι exhaustive στα TicketStatus — ο compiler θα απαιτήσει τα νέα keys, γι' αυτό το task προηγείται των υπολοίπων), commit `feat(tickets): labels/badges for needs_info + merged`.

---

### Task 4: Emails — clarification, merged, fan-out σε merged reporters

**Files:** Modify `lib/tickets/emails.ts`, `lib/tickets/propagate.ts`, `app/(app)/tickets/actions.ts` (saveKnowledgeEntry)

- [ ] **Step 1: Νέοι senders + helper στο emails.ts**

```ts
/** Reporters που πρέπει να ενημερώνονται για το ticket: ο δικός του + των merged children. */
export async function reporterRecipients(ticketId: string): Promise<TicketEmailInput[]> {
  const { prisma } = await import('@/lib/prisma')
  const primary = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { code: true, subject: true, reporterEmail: true, reporterName: true, publicToken: true },
  })
  if (!primary) return []
  const merged = await prisma.ticket.findMany({
    where: { mergedIntoId: ticketId, status: 'merged' },
    select: { code: true, subject: true, reporterEmail: true, reporterName: true, publicToken: true },
  })
  return [primary, ...merged].map((t) => ({
    to: t.reporterEmail, reporterName: t.reporterName, code: t.code, subject: t.subject, publicToken: t.publicToken,
  }))
}

export async function sendTicketClarificationEmail(input: TicketEmailInput & { question: string }) {
  const url = statusUrl(input.publicToken)
  const html = emailLayout({
    recipientName: input.reporterName,
    header: { kicker: { text: '💬 Χρειαζόμαστε μια διευκρίνιση', tone: 'info' }, eyebrow: { text: input.code }, title: input.subject },
    body: `
      <p style="font-size:14px;line-height:1.6;">Για να προχωρήσουμε το αίτημά σας, χρειαζόμαστε την απάντησή σας:</p>
      ${quote({ body: input.question, tone: 'info' })}
      <p style="font-size:14px;line-height:1.6;">Απαντήστε από τη σελίδα παρακολούθησης — δεν χρειάζεται σύνδεση.</p>`,
    actions: [{ label: 'Απάντηση', url }],
  })
  return safeSend(input.to, `[${input.code}] Χρειαζόμαστε μια διευκρίνιση`, html)
}

export async function sendTicketMergedEmail(input: TicketEmailInput & { primaryCode: string }) {
  const url = statusUrl(input.publicToken)
  const html = emailLayout({
    recipientName: input.reporterName,
    header: { kicker: { text: 'ℹ️ Ενημέρωση αιτήματος', tone: 'neutral' }, eyebrow: { text: input.code }, title: input.subject },
    body: `<p style="font-size:14px;line-height:1.6;">Το αίτημά σας αφορά το ίδιο θέμα με άλλο ανοιχτό αίτημα (${input.primaryCode}) και συγχωνεύθηκε με αυτό. Θα συνεχίσετε να λαμβάνετε όλες τις ενημερώσεις εξέλιξης στον ίδιο σύνδεσμο παρακολούθησης.</p>`,
    actions: [{ label: 'Παρακολούθηση', url }],
  })
  return safeSend(input.to, `[${input.code}] Το αίτημά σας συγχωνεύθηκε`, html)
}
```

- [ ] **Step 2: Fan-out στα υπάρχοντα σημεία**

`lib/tickets/propagate.ts`: στο done branch και στο STATUS_EMAIL branch, αντί για ένα σκέτο send στο ticket, κάνε loop:
```ts
const recipients = await reporterRecipients(ticket.id)
for (const r of recipients) {
  await sendTicketResolvedEmail({ ...r, resolutionTime: formatDurationGr(ticket.createdAt, resolvedAt) })
}
```
(αντίστοιχα για `sendTicketStatusEmail`). Το `reporterRecipients` επιστρέφει τον primary πρώτο — ο καθένας με ΤΟ ΔΙΚΟ ΤΟΥ code/token.

`app/(app)/tickets/actions.ts` `saveKnowledgeEntry`: το closing `sendTicketStatusEmail` γίνεται loop πάνω σε `reporterRecipients(ticket.id)` (κρατώντας το resolutionTime από τον primary).

- [ ] **Step 3:** `npx tsc --noEmit`, commit `feat(tickets): clarification/merged emails + merged-reporter fan-out`.

---

### Task 5: Follow-up actions + public reply endpoint

**Files:** Create `app/(app)/tickets/followup-actions.ts`, Create `app/api/tickets/[code]/reply/route.ts`

- [ ] **Step 1: followup-actions.ts**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { reporterRecipients, sendTicketClarificationEmail } from '@/lib/tickets/emails'

const OPEN_FOR_CLARIFICATION = ['new', 'analyzing', 'triaged', 'converted', 'resolved', 'needs_info'] as const

async function requireMember(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.userType === 'customer') throw new Error('Απαιτείται σύνδεση μέλους ομάδας.')
  return session.user.id
}

/** Στέλνει ερώτηση διευκρίνισης στον reporter και βάζει το ticket σε «Αναμονή πελάτη». */
export async function requestClarification(input: { ticketId: string; message: string }) {
  const userId = await requireMember()
  const message = input.message.trim().slice(0, 3000)
  if (message.length < 5) return { ok: false as const, error: 'Γράψτε το ερώτημα προς τον πελάτη.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (!OPEN_FOR_CLARIFICATION.includes(ticket.status as (typeof OPEN_FOR_CLARIFICATION)[number])) {
    return { ok: false as const, error: 'Το ticket δεν είναι ανοιχτό για διευκρινίσεις.' }
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId: ticket.id, direction: 'outbound', body: message, authorId: userId } }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(ticket.status !== 'needs_info' ? { statusBeforeInfo: ticket.status, status: 'needs_info' } : {}),
        events: { create: { type: 'clarification_requested', actorId: userId } },
      },
    }),
  ])

  for (const r of await reporterRecipients(ticket.id)) {
    await sendTicketClarificationEmail({ ...r, question: message })
  }

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${ticket.id}`)
  return { ok: true as const }
}

/** Νήμα + στοιχεία ticket για το task detail (read-only). */
export async function getTicketThreadForTask(taskId: string) {
  await requireMember()
  const ticket = await prisma.ticket.findUnique({
    where: { taskId },
    select: {
      id: true, code: true, status: true,
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, body: true, createdAt: true } },
    },
  })
  if (!ticket) return null
  return { ticketId: ticket.id, code: ticket.code, status: ticket.status, messages: ticket.messages }
}
```

- [ ] **Step 2: reply route** (`app/api/tickets/[code]/reply/route.ts`) — token pattern από το GET route, CORS όπως το POST /api/tickets:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/tickets/source-auth'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 })

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    select: { id: true, publicToken: true, status: true, statusBeforeInfo: true, subject: true, code: true, taskId: true },
  })
  if (!ticket || ticket.publicToken !== token) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (['closed', 'rejected', 'merged'].includes(ticket.status)) {
    return NextResponse.json({ error: 'ticket_closed' }, { status: 409 })
  }
  if (!checkRateLimit(`reply:${ticket.id}`, 10, 3_600_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: string
  try {
    const json = (await req.json()) as { body?: unknown }
    body = String(json.body ?? '').trim().slice(0, 3000)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 422 })
  }
  if (!body) return NextResponse.json({ error: 'empty_body' }, { status: 422 })

  await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId: ticket.id, direction: 'inbound', body } }),
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

  // Ειδοποίηση ομάδας: assignees του task, αλλιώς όλοι οι admin/manager.
  let userIds: string[] = []
  if (ticket.taskId) {
    const assignees = await prisma.taskAssignee.findMany({ where: { taskId: ticket.taskId }, select: { userId: true } })
    userIds = assignees.map((a) => a.userId)
  }
  if (userIds.length === 0) {
    const managers = await prisma.user.findMany({ where: { role: { in: ['admin', 'manager'] } }, select: { id: true } })
    userIds = managers.map((u) => u.id)
  }
  await createNotifications(
    userIds.map((userId) => ({
      userId,
      title: `Απάντηση πελάτη — ${ticket.code}`,
      message: body.slice(0, 140),
      type: 'ticket' as const,
      link: `/tickets/${ticket.id}`,
    }))
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3:** `npx tsc --noEmit`, commit `feat(tickets): clarification request action + public reply endpoint`.

---

### Task 6: `/t/[token]` — νήμα, φόρμα απάντησης, attachments, merged view

**Files:** Modify `app/t/[token]/page.tsx`, Create `components/tickets/public-reply-form.tsx`

- [ ] **Step 1: public-reply-form.tsx (client)**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PublicReplyForm({ code, token }: { code: string; token: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    const res = await fetch(`/api/tickets/${code}/reply?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (res.ok) {
      setState('sent'); setBody(''); router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error === 'rate_limited' ? 'Πολλές απαντήσεις — δοκιμάστε αργότερα.' : 'Η αποστολή απέτυχε — δοκιμάστε ξανά.')
      setState('error')
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <textarea
        value={body} onChange={(e) => setBody(e.target.value)} required maxLength={3000} rows={4}
        placeholder="Γράψτε την απάντησή σας…"
        className="w-full rounded-lg border border-neutral-200 p-3 text-sm focus:border-[#0078d4] focus:outline-none"
      />
      {state === 'error' && <p className="text-sm text-[#a4262c]">{error}</p>}
      {state === 'sent' && <p className="text-sm text-[#0f7b0f]">Η απάντησή σας καταχωρήθηκε — ευχαριστούμε.</p>}
      <button type="submit" disabled={state === 'sending' || !body.trim()}
        className="rounded-lg bg-[#0078d4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {state === 'sending' ? 'Αποστολή…' : 'Αποστολή απάντησης'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: page.tsx** — επέκταση του fetch:

```ts
include: {
  events: { orderBy: { createdAt: 'asc' } },
  source: { select: { name: true } },
  messages: { orderBy: { createdAt: 'asc' } },
  attachments: { select: { id: true, name: true, url: true, mimeType: true } },
}
```

**Merged proxy view:** αν `ticket.mergedIntoId`, φόρτωσε τον primary (`prisma.ticket.findUnique({ where: { id: ticket.mergedIntoId }, include: { events... } })`) και render: το δικό του card με σημείωση «Το αίτημά σας συγχωνεύθηκε με άλλο σχετικό αίτημα — η πορεία εμφανίζεται παρακάτω», status badge/timeline **του primary** (μέσω publicEventLabel — καμία πληροφορία reporter), ΧΩΡΙΣ φόρμα απάντησης. Return νωρίς.

**Κανονικό view — νέες ενότητες** (μετά το timeline, ίδιο styling neutral-*):
1. Attachments: αν υπάρχουν, grid με `<a href={url} target="_blank"><img src={url} className="h-24 w-24 rounded-lg object-cover border border-neutral-200" /></a>`.
2. Νήμα: `messages.map` — bubble δεξιά (outbound, `bg-[#eff6fc]`, label «Η ομάδα») / αριστερά (inbound, `bg-neutral-100`, label «Εσείς»), ημερομηνία el-GR.
3. `<PublicReplyForm code={ticket.code} token={token} />` όταν το status ΔΕΝ είναι closed/rejected/merged. Πάνω από τη φόρμα, αν status === 'needs_info', banner: «Η ομάδα περιμένει την απάντησή σας για να συνεχίσει.»

- [ ] **Step 3:** `npx tsc --noEmit`, χειροκίνητο: incognito `/t/{token}` → thread + reply → refresh δείχνει το μήνυμα, status επανέρχεται. Commit `feat(tickets): public thread, reply form, attachments, merged view on /t page`.

---

### Task 7: Multipart υποβολή με εικόνες → Bunny → TicketAttachment

**Files:** Modify `app/api/tickets/route.ts`

- [ ] **Step 1: Διπλό parsing**

Στο POST, μετά το auth και πριν το validation, αντικατέστησε το σκέτο `req.json()` με:

```ts
  const contentType = req.headers.get('content-type') ?? ''
  let body: Record<string, unknown>
  let files: File[] = []
  if (contentType.includes('multipart/form-data')) {
    let fd: FormData
    try { fd = await req.formData() } catch { return json({ error: 'invalid_form' }, 422) }
    body = {
      subject: fd.get('subject'), body: fd.get('body'),
      reporterEmail: fd.get('reporterEmail'), reporterName: fd.get('reporterName'),
      originUrl: fd.get('originUrl'),
    }
    files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  } else {
    try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 422) }
  }
```

- [ ] **Step 2: Validation αρχείων** (μετά τα υπάρχοντα text validations, πριν τα rate limits)

```ts
  const MAX_FILES = 3, MAX_FILE_BYTES = 5 * 1024 * 1024, MAX_TOTAL_BYTES = 15 * 1024 * 1024
  if (files.length > MAX_FILES) return json({ error: 'too_many_files' }, 422)
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) return json({ error: 'files_too_large' }, 413)
  const checked: { buffer: Buffer; name: string; mime: string; ext: string; size: number }[] = []
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return json({ error: 'file_too_large' }, 413)
    const buffer = Buffer.from(await f.arrayBuffer())
    const sniff = sniffImage(buffer)
    if (!sniff) return json({ error: 'invalid_file_type' }, 422)
    checked.push({ buffer, name: f.name.replace(/[^\w.\-]+/g, '_').slice(0, 120), mime: sniff.mime, ext: sniff.ext, size: f.size })
  }
```
Imports: `import { sniffImage } from '@/lib/tickets/image-sniff'`, `import { uploadFileToCDN } from '@/lib/bunnycdn'`, `import { randomUUID } from 'crypto'`. Πρόσθεσε `export const runtime = 'nodejs'`.

- [ ] **Step 3: Upload μετά τη δημιουργία του ticket** (μετά το create/retry loop, πριν τα fire-and-forget)

```ts
  let attachmentCount = 0
  for (const f of checked) {
    try {
      const uploaded = await uploadFileToCDN({
        file: f.buffer,
        filename: `${randomUUID()}.${f.ext}`,
        folder: `tickets/${ticket.code}`,
        contentType: f.mime,
      })
      await prisma.ticketAttachment.create({
        data: { ticketId: ticket.id, name: f.name, size: f.size, mimeType: f.mime, url: uploaded.url },
      })
      attachmentCount++
    } catch (err) {
      console.error('[tickets] attachment upload failed:', err)
      await prisma.ticketEvent.create({
        data: { ticketId: ticket.id, type: 'note', payload: JSON.stringify({ upload_failed: f.name }) },
      }).catch(() => {})
    }
  }
```
Στο τελικό 201 response πρόσθεσε `attachments: attachmentCount`. Στο dedup path (200 duplicate) ΜΗΝ ανεβάζεις αρχεία.

- [ ] **Step 4:** `npx tsc --noEmit`. Δοκιμή με curl:
```bash
curl -s -X POST http://localhost:3000/api/tickets -H "X-Ticket-Project: <code>" -H "X-Ticket-Key: <key>" \
  -F subject="Δοκιμή με εικόνα" -F body="multipart test" -F reporterEmail=test@example.com -F files=@/path/img.png
```
Expected: 201 με `attachments: 1`, TicketAttachment row με Bunny URL. Commit `feat(tickets): multipart image uploads to Bunny CDN on submission`.

---

### Task 8: Attachments → task στο convert + εμφάνιση στη σελίδα ticket

**Files:** Modify `app/(app)/tickets/actions.ts` (convertTicketToTask), `app/(app)/tickets/[id]/page.tsx`, `app/(app)/tickets/[id]/ticket-detail-client.tsx`

- [ ] **Step 1: convertTicketToTask** — στο select του ticket πρόσθεσε `attachments: { select: { name: true, size: true, mimeType: true, url: true } }`. Μετά το `prisma.task.create` πρόσθεσε:

```ts
  if (ticket.attachments.length > 0) {
    await prisma.attachment.createMany({
      data: ticket.attachments.map((a) => ({
        taskId: task.id,
        projectId: input.projectId,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        url: a.url,
        source: 'local' as const,
        uploadedById: actorId,
      })),
    })
  }
```

- [ ] **Step 2: Εμφάνιση στη σελίδα ticket** — στο page.tsx include πρόσθεσε `attachments: true` και πέρασε `attachments: ticket.attachments.map(a => ({ id: a.id, name: a.name, url: a.url, mimeType: a.mimeType }))` στο client. Στο ticket-detail-client: νέο section «Συνημμένα» (ορατό όταν length > 0, ίδιο card styling με τα άλλα sections) με thumbnails `<a target="_blank"><img className="h-20 w-20 rounded-md object-cover border border-black/5" /></a>` + όνομα αρχείου.

- [ ] **Step 3:** `npx tsc --noEmit`, commit `feat(tickets): carry attachments to task on convert + show on ticket page`.

---

### Task 9: Νήμα στη σελίδα ticket + «Ζητήστε διευκρίνιση» + task section

**Files:** Create `components/tickets/clarification-thread.tsx`, Modify `app/(app)/tickets/[id]/page.tsx` + `ticket-detail-client.tsx`, Modify `components/board/task-drawer.tsx`

- [ ] **Step 1: clarification-thread.tsx**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestClarification } from '@/app/(app)/tickets/followup-actions'

export type ThreadMessage = { id: string; direction: string; body: string; createdAt: string | Date }

export function ThreadList({ messages }: { messages: ThreadMessage[] }) {
  if (messages.length === 0) return null
  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <div key={m.id} className={`max-w-[85%] rounded-lg p-3 text-sm ${m.direction === 'outbound' ? 'ml-auto bg-fluent-blue-600/10' : 'bg-black/5'}`}>
          <p className="mb-1 text-[11px] font-semibold text-fluent-neutral-60">
            {m.direction === 'outbound' ? 'Ομάδα' : 'Πελάτης'} · {new Date(m.createdAt).toLocaleString('el-GR')}
          </p>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
    </div>
  )
}

export function ClarificationBox({ ticketId, disabled }: { ticketId: string; disabled?: boolean }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const send = () =>
    startTransition(async () => {
      setError(null)
      const res = await requestClarification({ ticketId, message: text })
      if (res.ok) { setText(''); router.refresh() } else setError(res.error)
    })

  return (
    <div className="space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} rows={3}
        placeholder="Τι θέλετε να ρωτήσετε τον πελάτη;"
        className="w-full rounded-md border border-neutral-300 p-2.5 text-sm focus:border-fluent-blue-500 focus:outline-none" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="button" onClick={send} disabled={pending || disabled || text.trim().length < 5}
        className="rounded-md bg-fluent-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50">
        {pending ? 'Αποστολή…' : 'Ζητήστε διευκρίνιση'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Σελίδα ticket** — page.tsx include `messages: { orderBy: { createdAt: 'asc' } }`, πέρασε serialized. Στο ticket-detail-client, νέο section «Επικοινωνία με πελάτη» (πριν το Resolution section, ίδιο card styling): `<ThreadList messages={ticket.messages} />` + `<ClarificationBox ticketId={ticket.id} disabled={['closed','rejected','merged'].includes(ticket.status)} />`. Όταν status === 'needs_info', badge «Αναμονή πελάτη» στο section header.

- [ ] **Step 3: Task drawer** — στο `components/board/task-drawer.tsx` (διάβασέ το πρώτα): φόρτωσε lazily μέσω `getTicketThreadForTask(taskId)` σε useEffect/useState όταν ανοίγει το drawer· αν επιστρέψει ticket, render section «Επικοινωνία με πελάτη ({code})» με `<ThreadList>` + `<ClarificationBox ticketId>` + link «Άνοιγμα ticket». Αν null, τίποτα.

- [ ] **Step 4:** `npx tsc --noEmit`, χειροκίνητο E2E: clarify από ticket → email + needs_info → reply από /t → status επαναφορά + notification + νήμα παντού. Commit `feat(tickets): clarification thread on ticket page and task drawer`.

---

### Task 10: Server actions για το table — assign, bulk status, merge, history

**Files:** Modify `app/(app)/tickets/actions.ts` (προσθήκες στο τέλος)

- [ ] **Step 1: assignTicketEngineer**

```ts
/** Αναθέτει μηχανικό: σε υπάρχον task αντικαθιστά τους assignees, αλλιώς convert με τα AI στοιχεία. */
export async function assignTicketEngineer(input: { ticketId: string; userId: string }) {
  const actorId = await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true, status: true, taskId: true, subject: true,
      aiTitle: true, aiDescription: true, aiPriority: true, aiSuggestedProjectId: true,
      source: { select: { defaultProjectId: true } },
    },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }

  if (ticket.taskId) {
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: ticket.taskId } }),
      prisma.taskAssignee.create({ data: { taskId: ticket.taskId, userId: input.userId } }),
    ])
    await notifyTaskAssignment(ticket.taskId, [input.userId], actorId)
    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'note', actorId, payload: JSON.stringify({ assigned: input.userId }) },
    })
    revalidatePath('/tickets')
    revalidatePath(`/tickets/${ticket.id}`)
    return { ok: true as const }
  }

  const projectId = ticket.aiSuggestedProjectId ?? ticket.source.defaultProjectId
  if (!projectId) return { ok: false as const, error: 'Δεν υπάρχει προτεινόμενο έργο — ανοίξτε το ticket για πλήρη ανάθεση.' }
  return convertTicketToTask({
    ticketId: ticket.id,
    projectId,
    assigneeId: input.userId,
    title: ticket.aiTitle ?? ticket.subject,
    description: ticket.aiDescription ?? '',
    priority: ticket.aiPriority ?? 'medium',
  })
}
```

- [ ] **Step 2: bulkUpdateTicketStatus**

```ts
/** Bulk μεταβάσεις: reject (new/analyzing/triaged/needs_info) ή close (resolved). Αγνοεί τα μη επιτρεπτά. */
export async function bulkUpdateTicketStatus(input: { ticketIds: string[]; action: 'reject' | 'close' }) {
  const actorId = await requireTriager()
  const allowedFrom: TicketStatus[] = input.action === 'reject' ? ['new', 'analyzing', 'triaged', 'needs_info'] : ['resolved']
  const to: TicketStatus = input.action === 'reject' ? 'rejected' : 'closed'
  const targets = await prisma.ticket.findMany({
    where: { id: { in: input.ticketIds.slice(0, 50) }, status: { in: allowedFrom } },
    select: { id: true },
  })
  for (const t of targets) {
    await prisma.ticket.update({
      where: { id: t.id },
      data: { status: to, events: { create: { type: to === 'rejected' ? 'rejected' : 'closed', actorId } } },
    })
  }
  revalidatePath('/tickets')
  return { ok: true as const, updated: targets.length, skipped: input.ticketIds.length - targets.length }
}
```
(import `TicketStatus` type από @prisma/client.)

- [ ] **Step 3: mergeTickets**

```ts
/** Συγχώνευση: τα secondaries γίνονται merged, μηνύματα/αρχεία μεταφέρονται στο primary, reporters ενημερώνονται. */
export async function mergeTickets(input: { primaryId: string; secondaryIds: string[] }) {
  const actorId = await requireTriager()
  const ids = input.secondaryIds.filter((id) => id !== input.primaryId).slice(0, 20)
  if (ids.length === 0) return { ok: false as const, error: 'Επιλέξτε τουλάχιστον δύο tickets.' }

  const primary = await prisma.ticket.findUnique({
    where: { id: input.primaryId },
    select: { id: true, code: true, status: true, sourceId: true },
  })
  if (!primary || ['closed', 'rejected', 'merged'].includes(primary.status)) {
    return { ok: false as const, error: 'Το κύριο ticket δεν είναι ανοιχτό.' }
  }
  const secondaries = await prisma.ticket.findMany({
    where: { id: { in: ids }, sourceId: primary.sourceId, status: { notIn: ['closed', 'rejected', 'merged'] } },
    select: { id: true, code: true, reporterEmail: true, reporterName: true, subject: true, publicToken: true },
  })
  if (secondaries.length === 0) return { ok: false as const, error: 'Κανένα επιλέξιμο ticket για συγχώνευση (ίδια πηγή, ανοιχτό).' }

  for (const s of secondaries) {
    await prisma.$transaction([
      prisma.ticketMessage.updateMany({ where: { ticketId: s.id }, data: { ticketId: primary.id } }),
      prisma.ticketAttachment.updateMany({ where: { ticketId: s.id }, data: { ticketId: primary.id } }),
      prisma.ticket.update({
        where: { id: s.id },
        data: {
          status: 'merged', mergedIntoId: primary.id,
          events: { create: { type: 'merged', actorId, payload: JSON.stringify({ into: primary.code }) } },
        },
      }),
      prisma.ticketEvent.create({
        data: { ticketId: primary.id, type: 'absorbed', actorId, payload: JSON.stringify({ from: s.code }) },
      }),
    ])
    await sendTicketMergedEmail({
      to: s.reporterEmail, reporterName: s.reporterName, code: s.code, subject: s.subject,
      publicToken: s.publicToken, primaryCode: primary.code,
    })
  }

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${primary.id}`)
  return { ok: true as const, merged: secondaries.length }
}
```
(import `sendTicketMergedEmail` από emails.)

- [ ] **Step 4: getTicketHistory** (για expandable rows)

```ts
/** Lazy ιστορικό για το expandable row του table. */
export async function getTicketHistory(ticketId: string) {
  await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      aiTitle: true, aiCategory: true, aiPriority: true, aiConfidence: true,
      events: { orderBy: { createdAt: 'asc' }, select: { id: true, type: true, payload: true, createdAt: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, body: true, createdAt: true } },
      attachments: { select: { id: true, name: true, url: true } },
    },
  })
  if (!ticket) return null
  return ticket
}
```

- [ ] **Step 5:** `npx tsc --noEmit`, commit `feat(tickets): table server actions — assign, bulk status, merge, history`.

---

### Task 11: Tickets table client — checkboxes, dropdown, bulk bar, expandable

**Files:** Create `app/(app)/tickets/tickets-table.tsx`, Modify `app/(app)/tickets/page.tsx`

- [ ] **Step 1: page.tsx γίνεται λεπτό** — κρατά auth/fetch/φίλτρα-chips και φορτώνει επιπλέον `users` (για ανάθεση): `prisma.user.findMany({ where: { role: { in: ['admin','manager','member'] }, userType: 'employee' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } })`. Το `<table>` block (γρ. 126-164) αντικαθίσταται από `<TicketsTable rows={serialized} users={users} />` όπου serialized = τα σημερινά πεδία + `status`, `aiCategory`, `createdAt.toISOString()`.

- [ ] **Step 2: tickets-table.tsx** — 'use client'. Δομή:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal20Regular, ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons'
import { assignTicketEngineer, bulkUpdateTicketStatus, mergeTickets, getTicketHistory, rejectTicket } from './actions'
import { requestClarification } from './followup-actions'
import { ThreadList } from '@/components/tickets/clarification-thread'

export type TicketRow = {
  id: string; code: string; subject: string; aiTitle: string | null; reporterEmail: string
  sourceName: string; aiCategory: string | null; status: string; createdAt: string
}
type UserOpt = { id: string; name: string | null; email: string }
```

Κύριο component `TicketsTable({ rows, users })` με state: `selected: Set<string>`, `openMenu: string | null`, `expanded: Set<string>`, `histories: Record<string, Awaited<ReturnType<typeof getTicketHistory>>>`, `mergeOpen: boolean`, `clarifyFor: string | null`.

Συμπεριφορές (πλήρης υλοποίηση, με το υπάρχον STATUS_BADGE/labels — μετέφερε τα maps από το page.tsx εδώ ή πέρασέ τα ως props):

1. **Header row**: checkbox select-all (indeterminate όταν μερική επιλογή)· όταν `selected.size > 0` εμφανίζεται bulk bar πάνω από τον πίνακα:
   - «{n} επιλεγμένα»
   - Κουμπί «Απόρριψη» → `bulkUpdateTicketStatus({ticketIds, action:'reject'})` + toast/`alert` με `updated/skipped`, `router.refresh()`
   - Κουμπί «Κλείσιμο» → action `'close'`
   - Κουμπί «Συγχώνευση» (disabled αν selected.size < 2) → ανοίγει MergeDialog
2. **Κάθε row**: `<tr>` με: checkbox· chevron button (toggle expand)· τα υπάρχοντα cells (code link, θέμα, πηγή, κατηγορία, badge, ημερομηνία)· τελευταίο cell κουμπί «⋯» → flyout menu (pattern topbar: fixed inset-0 backdrop + absolute panel, `z-40/50`, `shadow-fluent-16 rounded-lg border border-black/5 bg-white`):
   - «Άνοιγμα» → Link `/tickets/{id}`
   - «Δημιουργία task» → Link `/tickets/{id}` (το convert γίνεται εκεί) — εμφανίζεται μόνο για status new/analyzing/triaged/needs_info
   - «Ανάθεση σε μηχανικό ▸» → inline λίστα `users` (scrollable max-h-64) → `assignTicketEngineer({ticketId, userId})` → refresh· σε σφάλμα alert(res.error)
   - «Ζητήστε διευκρίνιση» → θέτει `clarifyFor` (inline mini-dialog με textarea → `requestClarification`) — κρυφό για closed/rejected/merged
   - «Απόρριψη» → `rejectTicket({ticketId, reason: '', notifyReporter: false})` μετά από confirm() — μόνο για new/analyzing/triaged
3. **Expanded row**: όταν expand και δεν υπάρχει `histories[id]`, `getTicketHistory(id)` σε transition → αποθήκευση. Render `<tr><td colSpan={8}>` με: AI σύνοψη (τίτλος/κατηγορία/προτεραιότητα/confidence), timeline events (map type → ελληνικά labels — ίδιο mapping με eventLabel του detail: created/analyzed/triaged/converted/task_status/emailed/kb_draft/closed/rejected/note/resolution_written/clarification_requested/reporter_replied/merged/absorbed), `<ThreadList messages>` και attachments thumbnails. Loading state «Φόρτωση ιστορικού…».
4. **MergeDialog**: modal (pattern resolution-dialog) με radio λίστα των επιλεγμένων rows (code + subject) για επιλογή **κύριου** → «Συγχώνευση» → `mergeTickets({primaryId, secondaryIds: υπόλοιπα})` → σε ok: κλείσιμο, καθάρισμα selection, refresh· σε error: μήνυμα στο dialog.

- [ ] **Step 3:** `npx tsc --noEmit` + χειροκίνητο τεστ στο dev (select 2 → merge → emails/status· expand → ιστορικό· ανάθεση → notification). Commit `feat(tickets): interactive tickets table — bulk actions, merge, row menu, expandable history`.

---

### Task 12: HelpCategory — AI πρόταση στο KB draft + resolve στο approve

**Files:** Modify `lib/tickets/kb.ts`, `app/(app)/tickets/actions.ts` (saveKnowledgeEntry), `app/(app)/knowledge/actions.ts`

- [ ] **Step 1: kb.ts** — φόρτωσε κατηγορίες και πρόσθεσε στο prompt:

```ts
  const categories = await prisma.helpCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
```
Στο userMsg, πριν την τελική οδηγία:
```
ΥΠΑΡΧΟΥΣΕΣ ΚΑΤΗΓΟΡΙΕΣ ΓΝΩΣΙΑΚΗΣ ΒΑΣΗΣ:
${categories.map((c) => `- ${c.id}: ${c.name}`).join('\n') || '(καμία ακόμα)'}
```
Και η τελική οδηγία γίνεται:
```
Γράψε εγγραφή γνωσιακής βάσης στα Ελληνικά. Αν υπάρχει ΛΥΣΗ ΑΠΟ ΤΟΝ ΤΕΧΝΙΚΟ, το "solution" βασίζεται σε αυτήν. Για την κατηγορία: διάλεξε υπάρχουσα (categoryId) ή πρότεινε νέα σύντομη ελληνική ονομασία (newCategoryName) μόνο αν καμία δεν ταιριάζει. JSON: {"title": string, "problem": string, "solution": string, "tags": string[], "categoryId": string | null, "newCategoryName": string | null}
```
Στο draft object πρόσθεσε:
```ts
    categoryId: typeof parsed.categoryId === 'string' && categories.some((c) => c.id === parsed.categoryId) ? parsed.categoryId : null,
    newCategoryName: typeof parsed.newCategoryName === 'string' ? parsed.newCategoryName.slice(0, 80) : null,
```

- [ ] **Step 2: Κοινός resolver** — στο `app/(app)/knowledge/actions.ts` πρόσθεσε export:

```ts
/** Επιστρέφει helpCategoryId: υπάρχον id ή δημιουργία/επανάχρηση από όνομα. Ποτέ αυτόνομα από AI — μόνο σε approve. */
export async function resolveHelpCategory(input: { categoryId?: string | null; newName?: string | null }): Promise<string | null> {
  if (input.categoryId) {
    const existing = await prisma.helpCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } })
    if (existing) return existing.id
  }
  const name = input.newName?.trim().slice(0, 80)
  if (!name) return null
  const byName = await prisma.helpCategory.findUnique({ where: { name }, select: { id: true } })
  if (byName) return byName.id
  const { slugify } = await import('@/lib/tickets/slug')
  let slug = slugify(name)
  if (await prisma.helpCategory.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Date.now().toString(36)}`
  const created = await prisma.helpCategory.create({ data: { name, slug }, select: { id: true } })
  return created.id
}
```
(ΣΗΜΕΙΩΣΗ: αυτό ΔΕΝ είναι server action με τη στενή έννοια — αν το 'use server' αρχείο απαιτεί μόνο async exports είναι ήδη async, ok. Καλείται μόνο server-side.)

- [ ] **Step 3: saveKnowledgeEntry** (tickets/actions.ts) — input προσθέτει `helpCategoryId?: string | null; newCategoryName?: string | null`. Πριν το create: `const helpCategoryId = await resolveHelpCategory({ categoryId: input.helpCategoryId, newName: input.newCategoryName })` (import από `../knowledge/actions`), και στο data: `helpCategoryId`.

- [ ] **Step 4: create/updateKnowledgeEntry** — EntryInput προσθέτει `helpCategoryId: string | null; newCategoryName?: string | null`· και τα δύο actions κάνουν resolve πριν το create/update και γράφουν `helpCategoryId`.

- [ ] **Step 5:** `npx tsc --noEmit` (τα UI callers διορθώνονται στο Task 13 — αν σπάσει το build εδώ, κάνε τα νέα πεδία optional με defaults). Commit `feat(knowledge): AI-suggested dynamic help categories (resolve on approve)`.

---

### Task 13: HelpCategory UI — KB form, entry form, help center, διαχείριση

**Files:** Modify `app/(app)/tickets/[id]/page.tsx` + `ticket-detail-client.tsx` (KB form), `app/(app)/knowledge/entry-form.tsx` + `page.tsx` + `new/page.tsx` + `[id]/page.tsx`, `app/help/[source]/page.tsx`

- [ ] **Step 1: Ticket KB form** — page.tsx: το kbDraft parsing περνά και `categoryId/newCategoryName` από το payload· φόρτωσε `helpCategories` (findMany name asc) και πέρασέ τες. Στο ticket-detail-client KB section: select «Κατηγορία help center» (options: καμία / υπάρχουσες / «➕ Νέα: {newCategoryName}» προεπιλεγμένη όταν το draft πρότεινε νέα) + free text input για custom νέα. Το `saveKnowledgeEntry` call περνά `helpCategoryId` ή `newCategoryName`.

- [ ] **Step 2: entry-form.tsx** — props προσθέτουν `helpCategories: {id,name}[]`· νέο select «Κατηγορία help center» με επιλογή «➕ Νέα κατηγορία…» που εμφανίζει text input· submit περνά `helpCategoryId`/`newCategoryName`. Οι σελίδες new/[id]/list φορτώνουν και περνούν `helpCategories`. Το `/knowledge/page.tsx` προσθέτει φίλτρο `helpcat` (select) στο where (`where.helpCategoryId = helpcat`).

- [ ] **Step 3: Help center grouping** — `app/help/[source]/page.tsx`: το select προσθέτει `helpCategory: { select: { name: true } }`· η ομαδοποίηση γίνεται κατά `e.helpCategory?.name ?? (CATEGORY_LABELS[e.category] ?? 'Γενικά')` (νέες κατηγορίες πρώτες, μετά τα legacy enum groups).

- [ ] **Step 4: Διαχείριση κατηγοριών** — στο `/knowledge/page.tsx` πάνω από τη λίστα, section «Κατηγορίες» ορατό σε canEdit: λίστα chips με count + inline μετονομασία (prompt()) + διαγραφή (confirm). Actions στο knowledge/actions.ts:

```ts
export async function renameHelpCategory(input: { id: string; name: string }) {
  await requireTriager()
  const name = input.name.trim().slice(0, 80)
  if (!name) return { ok: false as const, error: 'Κενό όνομα.' }
  const clash = await prisma.helpCategory.findUnique({ where: { name }, select: { id: true } })
  if (clash && clash.id !== input.id) return { ok: false as const, error: 'Υπάρχει ήδη κατηγορία με αυτό το όνομα.' }
  await prisma.helpCategory.update({ where: { id: input.id }, data: { name } })
  revalidatePath('/knowledge')
  return { ok: true as const }
}

export async function deleteHelpCategory(id: string) {
  await requireTriager()
  await prisma.helpCategory.delete({ where: { id } }) // entries → SetNull
  revalidatePath('/knowledge')
  return { ok: true as const }
}
```
(UI: μικρό client component `app/(app)/knowledge/category-manager.tsx` που τα καλεί.)

- [ ] **Step 5:** `npx tsc --noEmit`, χειροκίνητο: draft με νέα κατηγορία → approve → κατηγορία εμφανίζεται στο help center grouping + διαχείριση. Commit `feat(knowledge): help category UI — forms, filter, grouping, management`.

---

### Task 14: Docs + smoke + τελική επαλήθευση

**Files:** Modify `docs/ticketing/INTEGRATION.md`, Create `scripts/test-followup-flow.ts`

- [ ] **Step 1: INTEGRATION.md** — στην §3 (API Reference) πρόσθεσε: multipart παραλλαγή του POST (πεδία + `files` ≤3 εικόνες ≤5MB, `422 too_many_files/invalid_file_type`, `413 file_too_large`), και νέο endpoint:

```md
### POST `/api/tickets/{code}/reply?token={publicToken}` — απάντηση πελάτη

Body: `{ "body": "κείμενο ≤3000 χαρ." }` → `200 {ok:true}`. Σφάλματα: `401 missing_token` · `404 not_found` · `409 ticket_closed` · `422 empty_body` · `429 rate_limited` (10/ώρα). Η φόρμα υπάρχει έτοιμη στη σελίδα `/t/{token}` — δεν χρειάζεται δική σας υλοποίηση.
```
Στην §4, στο route handler παράδειγμα, πρόσθεσε σχόλιο ότι για αρχεία η φόρμα κάνει POST multipart στο δικό σας proxy που προωθεί το FormData ως έχει (ίδια headers, χωρίς Content-Type override).

- [ ] **Step 2: scripts/test-followup-flow.ts** — pattern του test-kb-flow.ts (loadEnv + dynamic imports):

```ts
/**
 * Smoke: clarification → needs_info → public reply → status restore.
 * Run: npx tsx scripts/test-followup-flow.ts --ticket <id>
 */
```
Βήματα στο script: φόρτωσε ticket (status πριν) → δημιούργησε TicketMessage outbound + status needs_info/statusBeforeInfo με prisma απευθείας (όχι το server action — δεν υπάρχει session σε CLI) → κάλεσε `fetch` στο τοπικό reply endpoint με το publicToken (`process.env.APP_URL ?? 'http://localhost:3000'`) → ξαναδιάβασε το ticket και τύπωσε: status επανήλθε, μηνύματα, events. Αν ο dev server δεν τρέχει, τύπωσε σαφή οδηγία αντί για crash.

- [ ] **Step 3: Πλήρης επαλήθευση**

```bash
npx tsx --test lib/tickets/__tests__/format-duration.test.ts lib/tickets/__tests__/slug.test.ts lib/tickets/__tests__/image-sniff.test.ts
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: Commit** — `git add scripts/test-followup-flow.ts docs/ticketing/INTEGRATION.md && git commit -m "test(tickets): follow-up smoke test + integration docs for uploads and replies"`

---

## Spec coverage map

| Spec | Tasks |
|---|---|
| §1 Schema | 1 |
| §2 AI κατηγορίες KB | 12, 13 |
| §3 Attachments → Bunny → task | 2, 7, 8 |
| §4 Follow-up (actions, reply, /t, ticket/task UI) | 3, 4, 5, 6, 9 |
| §4β Table (row actions, bulk, merge, expandable) | 10, 11 |
| §5 Ασφάλεια | 2 (sniffer), 5 (token+rate limit), 7 (όρια/τυχαία ονόματα) |
| §6 Testing | 2, 14 |
