# Resolver Solution + KB + Public Help Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ο resolver καταγράφει τη λύση όταν ολοκληρώνει task συνδεδεμένο με ticket (με προαιρετικό AI polish), η λύση τροφοδοτεί το KB draft, και η γνώση εκτίθεται σε εσωτερικό `/knowledge` και δημόσιο help center `/help/{sourceCode}`. Τα emails «Ολοκληρώθηκε»/«Έκλεισε» δείχνουν χρόνο επίλυσης.

**Architecture:** Επεκτείνουμε το υπάρχον ticketing pipeline (spec: `docs/superpowers/specs/2026-07-17-resolution-kb-help-center-design.md`). Νέο πεδίο `Ticket.resolutionSummary` γράφεται από dialog στην ολοκλήρωση task (board + project views) ή από τη σελίδα ticket· κάθε αποθήκευση αναπαράγει το `kb_draft`. Το `KnowledgeEntry` αποκτά `isPublic/slug/sourceId` και δύο νέες επιφάνειες: εσωτερική `/knowledge` (CRUD, triager) και δημόσια `/help/[source]` (read-only, μόνο public).

**Tech Stack:** Next.js App Router, Prisma/MySQL, DeepSeek API (υπάρχον pattern στο `lib/tickets/kb.ts`), custom framer-motion modals (pattern: `TaskModal` στο `app/(app)/projects/[id]/task-form.tsx`), node:test μέσω `npx tsx --test` για unit tests.

**Συμβάσεις repo:**
- Server actions επιστρέφουν `{ ok: true as const, ... } | { ok: false as const, error: string }`.
- Emails: `lib/tickets/emails.ts` με `emailLayout`/`metaTable`, όλα σε try/catch (ποτέ δεν σπάνε το pipeline).
- Fire-and-forget LLM: `void import('...').then(...).catch(console.error)`.
- Migration: shadow DB προβληματικό → `npx prisma migrate dev --create-only --name <name>` → `npx prisma migrate deploy` → `npx prisma generate`.
- Typecheck: `npx tsc --noEmit`.

---

### Task 1: Schema — `resolutionSummary` + πεδία δημοσίευσης KnowledgeEntry

**Files:**
- Modify: `prisma/schema.prisma` (μοντέλα `Ticket` ~1028, `KnowledgeEntry` ~1081)

- [ ] **Step 1: Πρόσθεσε τα πεδία στο schema**

Στο `model Ticket`, κάτω από το `resolvedAt DateTime?` (γραμμή ~1054):

```prisma
  resolvedAt DateTime?
  // Human-written solution from the resolver (dialog on task completion / ticket page)
  resolutionSummary String? @db.Text
```

Στο `model KnowledgeEntry`, αντικατέστησε ολόκληρο το μοντέλο με:

```prisma
model KnowledgeEntry {
  id           String          @id @default(cuid())
  ticketId     String?         @unique
  taskId       String?
  projectId    String?
  // TicketSource grouping for the public help center (/help/{sourceCode})
  sourceId     String?
  title        String
  problem      String          @db.Text
  solution     String          @db.Text
  // JSON array of keyword strings — matched via FULLTEXT/LIKE during triage
  tags         String          @db.Text
  category     TicketCategory?
  // Public help-center exposure — flipped explicitly by a triager, never automatic
  isPublic     Boolean         @default(false)
  // URL slug for public articles; set when first published
  slug         String?         @unique
  approvedById String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @default(now()) @updatedAt

  @@index([projectId])
  @@index([createdAt])
  @@index([sourceId, isPublic])
}
```

- [ ] **Step 2: Δημιούργησε και εφάρμοσε το migration (shadow-DB workaround)**

```bash
npx prisma migrate dev --create-only --name resolution_kb_public
npx prisma migrate deploy
npx prisma generate
```

Expected: νέος φάκελος `prisma/migrations/*_resolution_kb_public/` με `ALTER TABLE` για `Ticket.resolutionSummary`, `KnowledgeEntry.sourceId/isPublic/slug/updatedAt` + unique index στο slug. `migrate deploy` → «All migrations have been successfully applied».

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — Expected: καμία αλλαγή σε σφάλματα (baseline).

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(tickets): schema for resolution summary + KB publication fields"
```

---

### Task 2: Κοινό PII mask helper

**Files:**
- Create: `lib/tickets/mask.ts`
- Modify: `lib/tickets/kb.ts:34-37`

- [ ] **Step 1: Δημιούργησε το helper**

```ts
// lib/tickets/mask.ts

/** Mask emails and phone numbers in free text before it reaches the LLM or the KB. */
export function maskPII(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\d\s\-()]{8,}\d)/g, '[τηλέφωνο]')
}
```

- [ ] **Step 2: Χρησιμοποίησέ το στο kb.ts**

Στο `lib/tickets/kb.ts` πρόσθεσε import και σβήσε το τοπικό `mask`:

```ts
import { maskPII } from '@/lib/tickets/mask'
```

Αντικατέστησε τις γραμμές 34-37 (το `const mask = (t: string) => ...` block) με τίποτα, και όλα τα `mask(` του αρχείου με `maskPII(`.

- [ ] **Step 3: Typecheck & commit**

```bash
npx tsc --noEmit
git add lib/tickets/mask.ts lib/tickets/kb.ts
git commit -m "refactor(tickets): extract shared PII mask helper"
```

---

### Task 3: `formatDurationGr` helper (TDD)

**Files:**
- Create: `lib/tickets/format-duration.ts`
- Test: `lib/tickets/__tests__/format-duration.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/tickets/__tests__/format-duration.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDurationGr } from '../format-duration'

const at = (iso: string) => new Date(iso)

test('minutes only', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T10:45:00Z')), '45 λεπτά')
})

test('single minute floor', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T10:00:20Z')), '1 λεπτό')
})

test('hours and minutes', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T13:20:00Z')), '3 ώρες 20 λεπτά')
})

test('one hour singular', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T11:00:00Z')), '1 ώρα')
})

test('days and hours — minutes dropped (two largest units)', () => {
  assert.equal(formatDurationGr(at('2026-07-15T08:00:00Z'), at('2026-07-17T12:30:00Z')), '2 ημέρες 4 ώρες')
})

test('one day singular', () => {
  assert.equal(formatDurationGr(at('2026-07-16T10:00:00Z'), at('2026-07-17T10:00:00Z')), '1 ημέρα')
})

test('negative/zero clamps to 1 λεπτό', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T09:00:00Z')), '1 λεπτό')
})
```

- [ ] **Step 2: Τρέξε το test — πρέπει να αποτύχει**

Run: `npx tsx --test lib/tickets/__tests__/format-duration.test.ts`
Expected: FAIL — `Cannot find module '../format-duration'`.

- [ ] **Step 3: Υλοποίηση**

```ts
// lib/tickets/format-duration.ts

/**
 * Ανθρώπινη διάρκεια στα Ελληνικά: οι δύο μεγαλύτερες μη μηδενικές μονάδες
 * (π.χ. «2 ημέρες 4 ώρες», «3 ώρες 20 λεπτά», «45 λεπτά»). Ελάχιστο «1 λεπτό».
 */
export function formatDurationGr(from: Date, to: Date): string {
  const totalMins = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 60000))
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const minutes = totalMins % 60

  const parts: string[] = []
  if (days) parts.push(`${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`)
  if (hours) parts.push(`${hours} ${hours === 1 ? 'ώρα' : 'ώρες'}`)
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'λεπτό' : 'λεπτά'}`)
  return parts.slice(0, 2).join(' ') || '1 λεπτό'
}
```

- [ ] **Step 4: Τρέξε το test — πρέπει να περνά**

Run: `npx tsx --test lib/tickets/__tests__/format-duration.test.ts`
Expected: `# pass 7`.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/format-duration.ts lib/tickets/__tests__/format-duration.test.ts
git commit -m "feat(tickets): Greek human duration formatter"
```

---

### Task 4: Slug helper με ελληνικό transliteration (TDD)

**Files:**
- Create: `lib/tickets/slug.ts`
- Test: `lib/tickets/__tests__/slug.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/tickets/__tests__/slug.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify } from '../slug'

test('greek transliteration', () => {
  assert.equal(slugify('Πρόβλημα πληρωμής με κάρτα'), 'provlima-pliromis-me-karta')
})

test('mixed greek/latin/digits', () => {
  assert.equal(slugify('Σφάλμα 500 στο checkout'), 'sfalma-500-sto-checkout')
})

test('theta/chi/psi digraphs', () => {
  assert.equal(slugify('Ψηφιακή θύρα χρήστη'), 'psifiaki-thyra-christi')
})

test('final sigma and diacritics', () => {
  assert.equal(slugify('Λύσεις ΟΛΕΣ'), 'lyseis-oles')
})

test('collapses symbols, trims, caps at 80 chars', () => {
  assert.equal(slugify('  --Hello!! World??  '), 'hello-world')
  assert.equal(slugify('α'.repeat(200)).length <= 80, true)
})

test('empty input falls back', () => {
  assert.equal(slugify('!!!'), 'entry')
})
```

- [ ] **Step 2: Τρέξε το — FAIL**

Run: `npx tsx --test lib/tickets/__tests__/slug.test.ts`
Expected: FAIL — `Cannot find module '../slug'`.

- [ ] **Step 3: Υλοποίηση**

```ts
// lib/tickets/slug.ts

const GR: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o', ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
}

/** Greek-aware URL slug: transliterate, lowercase, hyphenate, max 80 chars, fallback 'entry'. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .split('')
    .map((c) => GR[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return base || 'entry'
}
```

- [ ] **Step 4: Τρέξε το — PASS**

Run: `npx tsx --test lib/tickets/__tests__/slug.test.ts`
Expected: `# pass 6`.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/slug.ts lib/tickets/__tests__/slug.test.ts
git commit -m "feat(tickets): greek transliteration slug helper"
```

---

### Task 5: Server actions — `polishSolution`, `saveResolution`, `getResolutionPromptInfo`

**Files:**
- Create: `app/(app)/tickets/resolution-actions.ts`

Ξεχωριστό αρχείο από το `actions.ts` επειδή αυτές οι actions επιτρέπονται σε **κάθε** αυθεντικοποιημένο μέλος (ο resolver σπάνια είναι triager), ενώ το `actions.ts` είναι triager-only.

- [ ] **Step 1: Γράψε το αρχείο**

```ts
// app/(app)/tickets/resolution-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/tickets/source-auth'
import { maskPII } from '@/lib/tickets/mask'

// Resolution capture is open to every authenticated team member — the person
// completing the task is usually NOT a triager (spec §1).
async function requireUser(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Απαιτείται σύνδεση.')
  return session.user.id
}

/**
 * Rewrite the resolver's free-text solution clearly in Greek via DeepSeek.
 * Keeps all technical facts, invents nothing, masks PII. Rate-limited per user.
 * The caller keeps the original text — a failure here never loses user input.
 */
export async function polishSolution(input: { ticketId: string; text: string }) {
  const userId = await requireUser()
  const text = maskPII(input.text.trim()).slice(0, 4000)
  if (text.length < 10) {
    return { ok: false as const, error: 'Γράψτε πρώτα μια σύντομη περιγραφή της λύσης.' }
  }
  if (!checkRateLimit(`polish:${userId}`, 20, 3_600_000)) {
    return { ok: false as const, error: 'Πολλές κλήσεις AI αυτή την ώρα — δοκιμάστε αργότερα.' }
  }
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  if (!apiKey) return { ok: false as const, error: 'Η βελτίωση με AI δεν είναι διαθέσιμη.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { subject: true, aiDescription: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'Είσαι τεχνικός συντάκτης. Ξαναγράφεις περιγραφές λύσεων σε καθαρά, δομημένα Ελληνικά για γνωσιακή βάση. Κρατάς ΟΛΑ τα τεχνικά στοιχεία (ονόματα αρχείων, ρυθμίσεις, βήματα), δεν προσθέτεις βήματα που δεν αναφέρονται, δεν εφευρίσκεις αιτίες. Απαντάς ΜΟΝΟ με το βελτιωμένο κείμενο, χωρίς εισαγωγή ή σχόλια.',
          },
          {
            role: 'user',
            content: `ΘΕΜΑ TICKET: ${maskPII(ticket.subject)}\nΤΕΧΝΙΚΗ ΑΝΑΛΥΣΗ: ${maskPII(ticket.aiDescription ?? '—').slice(0, 1500)}\n\nΚΕΙΜΕΝΟ ΛΥΣΗΣ ΠΡΟΣ ΒΕΛΤΙΩΣΗ:\n${text}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`)
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    const polished = (data.choices?.[0]?.message?.content ?? '').trim().slice(0, 4000)
    if (!polished) throw new Error('empty completion')
    return { ok: true as const, text: polished }
  } catch (err) {
    console.error('[tickets] polishSolution failed:', err)
    return { ok: false as const, error: 'Η βελτίωση απέτυχε — το κείμενό σας δεν χάθηκε.' }
  }
}

/**
 * Persist the resolver's solution on the ticket and (re)generate the KB draft
 * from it, unless an approved KnowledgeEntry already exists (spec §2).
 */
export async function saveResolution(input: { ticketId: string; text: string }) {
  const userId = await requireUser()
  const text = input.text.trim().slice(0, 4000)
  if (!text) return { ok: false as const, error: 'Γράψτε τη λύση πριν την αποθήκευση.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (ticket.status !== 'converted' && ticket.status !== 'resolved') {
    return { ok: false as const, error: 'Η λύση καταγράφεται μόνο σε tickets με εργασία σε εξέλιξη ή ολοκληρωμένη.' }
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      resolutionSummary: text,
      events: { create: { type: 'resolution_written', actorId: userId } },
    },
  })

  const approved = await prisma.knowledgeEntry.findUnique({ where: { ticketId: ticket.id }, select: { id: true } })
  if (!approved && ticket.status === 'resolved') {
    void import('@/lib/tickets/kb')
      .then((m) => m.generateKbDraft(ticket.id))
      .catch((e) => console.error('[tickets] kb draft regen failed:', e))
  }

  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true as const }
}

/**
 * Called by task UIs right after a task is marked done: should we prompt
 * this user for a solution? Returns ticket info only when a linked ticket
 * exists and has no solution yet.
 */
export async function getResolutionPromptInfo(taskId: string) {
  await requireUser()
  const ticket = await prisma.ticket.findUnique({
    where: { taskId },
    select: { id: true, code: true, subject: true, status: true, resolutionSummary: true },
  })
  if (!ticket || ticket.resolutionSummary) return null
  if (ticket.status !== 'converted' && ticket.status !== 'resolved') return null
  return { ticketId: ticket.id, code: ticket.code, subject: ticket.subject }
}
```

- [ ] **Step 2: Typecheck & commit**

```bash
npx tsc --noEmit
git add app/\(app\)/tickets/resolution-actions.ts
git commit -m "feat(tickets): resolution capture + AI polish server actions"
```

---

### Task 6: Το KB draft χρησιμοποιεί τη λύση του τεχνικού

**Files:**
- Modify: `lib/tickets/kb.ts` (select ~γραμμή 16-31, prompt ~γραμμή 39-52)

- [ ] **Step 1: Πρόσθεσε `resolutionSummary` στο select**

Στο `prisma.ticket.findUnique` select του `generateKbDraft`, μετά το `aiDescription: true`:

```ts
      aiDescription: true,
      resolutionSummary: true,
```

- [ ] **Step 2: Πρόσθεσε τη λύση ως κύρια πηγή στο prompt**

Αντικατέστησε το `userMsg` template ώστε το block της λύσης να μπαίνει πριν από τα σχόλια, και η τελευταία οδηγία να την ορίζει ως κύρια πηγή:

```ts
  const userMsg = `ΑΡΧΙΚΟ ΑΙΤΗΜΑ ΠΕΛΑΤΗ:
${maskPII(ticket.subject)}
${maskPII(ticket.body).slice(0, 2000)}

ΤΕΧΝΙΚΗ ΑΝΑΛΥΣΗ:
${maskPII(ticket.aiDescription ?? '—').slice(0, 2000)}

ΕΡΓΑΣΙΑ ΠΟΥ ΟΛΟΚΛΗΡΩΘΗΚΕ:
${ticket.task ? `${ticket.task.title}\n${maskPII(ticket.task.description ?? '')}` : '—'}

ΛΥΣΗ ΑΠΟ ΤΟΝ ΤΕΧΝΙΚΟ (κύρια πηγή για το πεδίο "solution"):
${ticket.resolutionSummary ? maskPII(ticket.resolutionSummary).slice(0, 4000) : '(δεν έχει καταγραφεί — βασίσου στα σχόλια)'}

ΣΧΟΛΙΑ ΟΜΑΔΑΣ ΚΑΤΑ ΤΗΝ ΕΠΙΛΥΣΗ (συμπληρωματικά):
${ticket.task?.comments.map((c) => `- ${maskPII(c.content).slice(0, 300)}`).join('\n') || '(κανένα)'}

Γράψε εγγραφή γνωσιακής βάσης στα Ελληνικά. Αν υπάρχει ΛΥΣΗ ΑΠΟ ΤΟΝ ΤΕΧΝΙΚΟ, το "solution" βασίζεται σε αυτήν. JSON: {"title": string, "problem": string, "solution": string, "tags": string[]}`
```

(Σημείωση: μετά το Task 2 το αρχείο χρησιμοποιεί ήδη `maskPII`.)

- [ ] **Step 3: Typecheck & commit**

```bash
npx tsc --noEmit
git add lib/tickets/kb.ts
git commit -m "feat(tickets): KB draft prioritizes resolver-written solution"
```

---

### Task 7: Dialog λύσης στην ολοκλήρωση task

**Files:**
- Create: `components/tickets/resolution-dialog.tsx`
- Modify: `app/(app)/board/board-client.tsx` (~γραμμή 138)
- Modify: `app/(app)/projects/[id]/task-views.tsx` (~γραμμή 130)

- [ ] **Step 1: Γράψε το dialog component**

```tsx
// components/tickets/resolution-dialog.tsx
'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dismiss20Regular, Sparkle20Regular } from '@fluentui/react-icons'
import { polishSolution, saveResolution, getResolutionPromptInfo } from '@/app/(app)/tickets/resolution-actions'

export type ResolutionPromptInfo = { ticketId: string; code: string; subject: string }

/**
 * Call right after a task is marked done. Resolves to the prompt info when a
 * linked ticket without a solution exists, else null. Never throws.
 */
export async function checkResolutionPrompt(taskId: string): Promise<ResolutionPromptInfo | null> {
  try {
    return await getResolutionPromptInfo(taskId)
  } catch {
    return null
  }
}

export function ResolutionDialog({ info, onClose }: { info: ResolutionPromptInfo; onClose: () => void }) {
  const [text, setText] = useState('')
  const [original, setOriginal] = useState<string | null>(null) // pre-polish text, for undo
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const polish = () =>
    startTransition(async () => {
      setError(null)
      const res = await polishSolution({ ticketId: info.ticketId, text })
      if (res.ok) {
        setOriginal(text)
        setText(res.text)
      } else setError(res.error)
    })

  const save = () =>
    startTransition(async () => {
      setError(null)
      const res = await saveResolution({ ticketId: info.ticketId, text })
      if (res.ok) onClose()
      else setError(res.error)
    })

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-xl rounded-xl bg-white shadow-fluent-16 dark:bg-neutral-900"
        >
          <div className="flex items-start justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
            <div>
              <h2 className="text-base font-semibold">Περιγράψτε τη λύση</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {info.code} · {info.subject}
              </p>
            </div>
            <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Κλείσιμο">
              <Dismiss20Regular />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={7}
              placeholder="Τι προκαλούσε το πρόβλημα και πώς λύθηκε; Γράψτε ελεύθερα — μπορείτε μετά να το βελτιώσετε με AI."
              className="w-full rounded-lg border border-neutral-300 p-3 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            {original !== null && (
              <button type="button" onClick={() => { setText(original); setOriginal(null) }} className="text-xs text-blue-600 hover:underline">
                Επαναφορά αρχικού κειμένου
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
            <button
              type="button"
              onClick={polish}
              disabled={pending || text.trim().length < 10}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Sparkle20Regular /> Βελτίωση με AI
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={pending} className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                Παράλειψη
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending || !text.trim()}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? 'Αποθήκευση…' : 'Αποθήκευση λύσης'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
```

(Αν τα class names του repo διαφέρουν — π.χ. δεν υπάρχει `shadow-fluent-16` — προσαρμόσου στο υπάρχον `TaskModal` styling του `app/(app)/projects/[id]/task-form.tsx:831-860`.)

- [ ] **Step 2: Ενσωμάτωση στο board**

Στο `app/(app)/board/board-client.tsx`:

```tsx
import { ResolutionDialog, checkResolutionPrompt, type ResolutionPromptInfo } from '@/components/tickets/resolution-dialog'
```

Πρόσθεσε state στο component:

```tsx
const [resolutionPrompt, setResolutionPrompt] = useState<ResolutionPromptInfo | null>(null)
```

Στο σημείο που καλείται `const res = await updateTaskStatus(taskId, status)` (~γραμμή 138), αμέσως μετά το επιτυχές αποτέλεσμα:

```tsx
if (status === 'done') {
  const info = await checkResolutionPrompt(taskId)
  if (info) setResolutionPrompt(info)
}
```

Στο τέλος του JSX (μέσα στο root fragment/div):

```tsx
{resolutionPrompt && (
  <ResolutionDialog info={resolutionPrompt} onClose={() => setResolutionPrompt(null)} />
)}
```

- [ ] **Step 3: Ενσωμάτωση στα project task views**

Ίδιο pattern στο `app/(app)/projects/[id]/task-views.tsx`: import, state, hook μετά το `await updateTaskStatus(projectId, taskId, status)` (~γραμμή 130) όταν `status === 'done'`, render του dialog στο τέλος του JSX.

- [ ] **Step 4: Χειροκίνητος έλεγχος**

Run: `npm run dev` → μάρκαρε done ένα task συνδεδεμένο με ticket από το board.
Expected: ανοίγει το dialog· «Παράλειψη» κλείνει χωρίς αλλαγή· task χωρίς ticket δεν εμφανίζει τίποτα.

- [ ] **Step 5: Typecheck & commit**

```bash
npx tsc --noEmit
git add components/tickets/resolution-dialog.tsx app/\(app\)/board/board-client.tsx app/\(app\)/projects/\[id\]/task-views.tsx
git commit -m "feat(tickets): resolution dialog on task completion with AI polish"
```

---

### Task 8: Section «Λύση» στη σελίδα ticket (fallback)

**Files:**
- Modify: `app/(app)/tickets/[id]/page.tsx` (select ~γραμμές 87-95, props ~103)
- Modify: `app/(app)/tickets/[id]/ticket-detail-client.tsx` (props ~44, JSX πριν το KB section ~340)

- [ ] **Step 1: Φέρε το πεδίο από τον server**

Στο select του ticket στο `page.tsx` πρόσθεσε `resolutionSummary: true`, και πέρασέ το στο client component μαζί με τα υπόλοιπα (το ticket object περνά ήδη — αρκεί το select).

- [ ] **Step 2: Πρόσθεσε το section στο client**

Στο `ticket-detail-client.tsx`, στο prop type του `ticket` πρόσθεσε `resolutionSummary: string | null`. Πριν από το KB section (~γραμμή 340) πρόσθεσε:

```tsx
{(ticket.status === 'converted' || ticket.status === 'resolved') && (
  <ResolutionSection ticketId={ticket.id} initial={ticket.resolutionSummary} />
)}
```

Και στο ίδιο αρχείο (ή ως ξεχωριστό export στο `components/tickets/resolution-dialog.tsx`) το section — ίδια λογική με το dialog αλλά inline:

```tsx
function ResolutionSection({ ticketId, initial }: { ticketId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? '')
  const [original, setOriginal] = useState<string | null>(null)
  const [saved, setSaved] = useState(Boolean(initial))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const polish = () =>
    startTransition(async () => {
      setError(null)
      const res = await polishSolution({ ticketId, text })
      if (res.ok) { setOriginal(text); setText(res.text) } else setError(res.error)
    })
  const save = () =>
    startTransition(async () => {
      setError(null)
      const res = await saveResolution({ ticketId, text })
      if (res.ok) setSaved(true)
      else setError(res.error)
    })

  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">Λύση</h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        Περιγραφή της λύσης από τον τεχνικό — τροφοδοτεί το προσχέδιο της γνωσιακής βάσης.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false) }}
        maxLength={4000}
        rows={5}
        className="mt-2 w-full rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={polish} disabled={pending || text.trim().length < 10} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700">
          Βελτίωση με AI
        </button>
        <button type="button" onClick={save} disabled={pending || !text.trim() || saved} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {saved ? 'Αποθηκεύτηκε ✓' : pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        {original !== null && (
          <button type="button" onClick={() => { setText(original); setOriginal(null) }} className="text-xs text-blue-600 hover:underline">
            Επαναφορά αρχικού
          </button>
        )}
      </div>
    </section>
  )
}
```

Imports στο αρχείο: `polishSolution, saveResolution` από `../resolution-actions`, `useTransition` από react (το `useState` υπάρχει ήδη). Ακολούθησε το υπάρχον styling των γειτονικών sections του αρχείου.

- [ ] **Step 3: Χειροκίνητος έλεγχος**

`npm run dev` → σελίδα resolved ticket → γράψε λύση → «Βελτίωση με AI» → «Αποθήκευση».
Expected: μετά την αποθήκευση, σε λίγα δευτερόλεπτα το KB draft section (refresh) δείχνει νέο draft βασισμένο στη λύση· νέο event `resolution_written` στο timeline.

- [ ] **Step 4: Typecheck & commit**

```bash
npx tsc --noEmit
git add app/\(app\)/tickets/\[id\]/
git commit -m "feat(tickets): resolution section on ticket detail page"
```

---

### Task 9: Χρόνος επίλυσης στα emails

**Files:**
- Modify: `lib/tickets/emails.ts:67-81` (`sendTicketResolvedEmail`), `sendTicketStatusEmail` (48-65)
- Modify: `lib/tickets/propagate.ts` (select ~20, done branch ~40-55)
- Modify: `app/(app)/tickets/actions.ts` (`saveKnowledgeEntry` select ~177-184, email ~209-217)

- [ ] **Step 1: Δέξου προαιρετικό `resolutionTime` στα emails**

Στο `emails.ts`:

```ts
export async function sendTicketResolvedEmail(input: TicketEmailInput & { resolutionTime?: string | null }) {
  const url = statusUrl(input.publicToken)
  const html = emailLayout({
    recipientName: input.reporterName,
    header: {
      kicker: { text: '✅ Ολοκληρώθηκε', tone: 'success' },
      eyebrow: { text: input.code },
      title: input.subject,
    },
    body: `
      <p style="font-size:14px;line-height:1.6;">Το αίτημά σας ολοκληρώθηκε. Αν το πρόβλημα επιμένει ή έχετε νέες ερωτήσεις, απαντήστε σε αυτό το email ή υποβάλετε νέο αίτημα.</p>
      ${input.resolutionTime ? metaTable([{ label: 'Χρόνος επίλυσης', value: input.resolutionTime }]) : ''}`,
    actions: [{ label: 'Προβολή αιτήματος', url }],
    footerNote: 'Ευχαριστούμε για την επικοινωνία.',
  })
  return safeSend(input.to, `[${input.code}] Το αίτημά σας ολοκληρώθηκε`, html)
}
```

Στο `sendTicketStatusEmail` άλλαξε την υπογραφή σε `input: TicketEmailInput & { statusLabel: string; detail?: string; resolutionTime?: string | null }` και μετά το `detail` quote πρόσθεσε:

```ts
      ${input.resolutionTime ? metaTable([{ label: 'Χρόνος επίλυσης', value: input.resolutionTime }]) : ''}`,
```

- [ ] **Step 2: Υπολόγισε τον χρόνο στο propagate.ts**

Import: `import { formatDurationGr } from '@/lib/tickets/format-duration'`. Στο select πρόσθεσε `createdAt: true`. Στο done branch:

```ts
    if (newStatus === 'done') {
      const resolvedAt = new Date()
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'resolved', resolvedAt },
      })
      await sendTicketResolvedEmail({
        to: ticket.reporterEmail,
        reporterName: ticket.reporterName,
        code: ticket.code,
        subject: ticket.subject,
        publicToken: ticket.publicToken,
        resolutionTime: formatDurationGr(ticket.createdAt, resolvedAt),
      })
```

- [ ] **Step 3: Ίδιο στο email κλεισίματος του `saveKnowledgeEntry`**

Στο `actions.ts`: import `formatDurationGr`, στο select του ticket πρόσθεσε `createdAt: true, resolvedAt: true`, και στο `sendTicketStatusEmail` του κλεισίματος:

```ts
    resolutionTime: formatDurationGr(ticket.createdAt, ticket.resolvedAt ?? new Date()),
```

- [ ] **Step 4: Typecheck & commit**

```bash
npx tsc --noEmit
git add lib/tickets/emails.ts lib/tickets/propagate.ts app/\(app\)/tickets/actions.ts
git commit -m "feat(tickets): resolution time in resolved/closed reporter emails"
```

---

### Task 10: `saveKnowledgeEntry` συμπληρώνει `sourceId`

**Files:**
- Modify: `app/(app)/tickets/actions.ts` (`saveKnowledgeEntry`, ~γραμμές 177-201)

- [ ] **Step 1: Πέρασε το sourceId**

Στο select του ticket πρόσθεσε `sourceId: true`, και στο `prisma.knowledgeEntry.create` data πρόσθεσε:

```ts
      sourceId: ticket.sourceId,
```

- [ ] **Step 2: Typecheck & commit**

```bash
npx tsc --noEmit
git add app/\(app\)/tickets/actions.ts
git commit -m "feat(tickets): KB entries inherit the ticket source"
```

---

### Task 11: Knowledge actions — create/update/publish/delete

**Files:**
- Create: `app/(app)/knowledge/actions.ts`

- [ ] **Step 1: Γράψε τις actions**

```ts
// app/(app)/knowledge/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/tickets/slug'
import type { TicketCategory } from '@prisma/client'

// KB authoring is a triager surface (admin/manager) — same rule as ticket triage.
async function requireTriager(): Promise<string> {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user?.id || (role !== 'admin' && role !== 'manager')) {
    throw new Error('Δεν έχετε δικαίωμα διαχείρισης της γνωσιακής βάσης.')
  }
  return session.user.id
}

type EntryInput = {
  title: string
  problem: string
  solution: string
  tags: string[]
  category: TicketCategory | null
  projectId: string | null
  sourceId: string | null
  isPublic: boolean
}

function validate(input: EntryInput): string | null {
  if (!input.title.trim()) return 'Ο τίτλος είναι υποχρεωτικός.'
  if (!input.solution.trim()) return 'Η λύση είναι υποχρεωτική.'
  if (input.isPublic && !input.sourceId) return 'Οι δημόσιες εγγραφές χρειάζονται πηγή (project) για το help center.'
  return null
}

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const clash = await prisma.knowledgeEntry.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash || clash.id === excludeId) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function createKnowledgeEntry(input: EntryInput) {
  const actorId = await requireTriager()
  const invalid = validate(input)
  if (invalid) return { ok: false as const, error: invalid }

  const entry = await prisma.knowledgeEntry.create({
    data: {
      title: input.title.trim().slice(0, 190),
      problem: input.problem.trim().slice(0, 8000),
      solution: input.solution.trim().slice(0, 8000),
      tags: JSON.stringify(input.tags.slice(0, 20)),
      category: input.category,
      projectId: input.projectId,
      sourceId: input.sourceId,
      isPublic: input.isPublic,
      slug: input.isPublic ? await uniqueSlug(input.title) : null,
      approvedById: actorId,
    },
    select: { id: true },
  })
  revalidatePath('/knowledge')
  return { ok: true as const, id: entry.id }
}

export async function updateKnowledgeEntry(input: EntryInput & { id: string }) {
  await requireTriager()
  const invalid = validate(input)
  if (invalid) return { ok: false as const, error: invalid }

  const existing = await prisma.knowledgeEntry.findUnique({ where: { id: input.id }, select: { slug: true } })
  if (!existing) return { ok: false as const, error: 'Η εγγραφή δεν βρέθηκε.' }

  await prisma.knowledgeEntry.update({
    where: { id: input.id },
    data: {
      title: input.title.trim().slice(0, 190),
      problem: input.problem.trim().slice(0, 8000),
      solution: input.solution.trim().slice(0, 8000),
      tags: JSON.stringify(input.tags.slice(0, 20)),
      category: input.category,
      projectId: input.projectId,
      sourceId: input.sourceId,
      isPublic: input.isPublic,
      // Slug: minted on first publish, then stable (public URLs must not break).
      slug: input.isPublic ? existing.slug ?? (await uniqueSlug(input.title, input.id)) : existing.slug,
    },
  })
  revalidatePath('/knowledge')
  revalidatePath(`/knowledge/${input.id}`)
  return { ok: true as const }
}

export async function deleteKnowledgeEntry(id: string) {
  await requireTriager()
  await prisma.knowledgeEntry.delete({ where: { id } })
  revalidatePath('/knowledge')
  return { ok: true as const }
}
```

- [ ] **Step 2: Typecheck & commit**

```bash
npx tsc --noEmit
git add app/\(app\)/knowledge/actions.ts
git commit -m "feat(knowledge): CRUD + publish server actions"
```

---

### Task 12: Εσωτερικές σελίδες `/knowledge`

**Files:**
- Create: `app/(app)/knowledge/page.tsx`
- Create: `app/(app)/knowledge/entry-form.tsx`
- Create: `app/(app)/knowledge/[id]/page.tsx`
- Create: `app/(app)/knowledge/new/page.tsx`

- [ ] **Step 1: Λίστα με αναζήτηση/φίλτρα (server component, GET form)**

```tsx
// app/(app)/knowledge/page.tsx
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; project?: string }>
}) {
  const session = await auth()
  const role = session?.user?.role
  const canEdit = role === 'admin' || role === 'manager'
  const { q, source, project } = await searchParams

  const where: Prisma.KnowledgeEntryWhereInput = {}
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { problem: { contains: q } },
      { solution: { contains: q } },
      { tags: { contains: q } },
    ]
  }
  if (source) where.sourceId = source
  if (project) where.projectId = project

  const [entries, sources, projects] = await Promise.all([
    prisma.knowledgeEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.ticketSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Γνωσιακή βάση</h1>
        {canEdit && (
          <Link href="/knowledge/new" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Νέα εγγραφή
          </Link>
        )}
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Αναζήτηση σε τίτλο, πρόβλημα, λύση, tags…"
          className="min-w-64 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <select name="source" defaultValue={source ?? ''} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950">
          <option value="">Όλες οι πηγές</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="project" defaultValue={project ?? ''} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950">
          <option value="">Όλα τα έργα</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Αναζήτηση</button>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {entries.length === 0 && <li className="p-4 text-sm text-neutral-500">Δεν βρέθηκαν εγγραφές.</li>}
        {entries.map((e) => (
          <li key={e.id} className="p-4">
            <Link href={`/knowledge/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
            <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{e.problem}</p>
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-neutral-400">
              {e.isPublic && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/40 dark:text-green-300">Δημόσιο</span>}
              {(JSON.parse(e.tags || '[]') as string[]).slice(0, 6).map((t) => (
                <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{t}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Κοινή φόρμα εγγραφής (client)**

```tsx
// app/(app)/knowledge/entry-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketCategory } from '@prisma/client'
import { createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry } from './actions'

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'bug', label: '🐞 Σφάλμα' },
  { value: 'feature', label: '✨ Νέα λειτουργία' },
  { value: 'support', label: '🛟 Υποστήριξη' },
  { value: 'question', label: '❓ Ερώτηση' },
  { value: 'billing', label: '💶 Χρέωση' },
  { value: 'other', label: '📋 Άλλο' },
]

export type EntryFormValue = {
  id?: string
  title: string
  problem: string
  solution: string
  tags: string[]
  category: TicketCategory | null
  projectId: string | null
  sourceId: string | null
  isPublic: boolean
}

export function EntryForm({
  initial,
  sources,
  projects,
  canDelete,
}: {
  initial: EntryFormValue
  sources: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [tagsText, setTagsText] = useState(initial.tags.join(', '))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      setError(null)
      const payload = { ...v, tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean) }
      const res = v.id
        ? await updateKnowledgeEntry({ ...payload, id: v.id })
        : await createKnowledgeEntry(payload)
      if (!res.ok) return setError(res.error)
      router.push('/knowledge')
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      if (!v.id || !confirm('Διαγραφή εγγραφής;')) return
      await deleteKnowledgeEntry(v.id)
      router.push('/knowledge')
      router.refresh()
    })

  const input = 'w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950'
  return (
    <div className="space-y-3">
      <input className={input} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Τίτλος" maxLength={190} />
      <textarea className={input} rows={4} value={v.problem} onChange={(e) => setV({ ...v, problem: e.target.value })} placeholder="Πρόβλημα" />
      <textarea className={input} rows={8} value={v.solution} onChange={(e) => setV({ ...v, solution: e.target.value })} placeholder="Λύση" />
      <input className={input} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Tags (χωρισμένα με κόμμα)" />
      <div className="flex flex-wrap gap-2">
        <select className={input + ' max-w-56'} value={v.sourceId ?? ''} onChange={(e) => setV({ ...v, sourceId: e.target.value || null })}>
          <option value="">Χωρίς πηγή</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={input + ' max-w-56'} value={v.projectId ?? ''} onChange={(e) => setV({ ...v, projectId: e.target.value || null })}>
          <option value="">Χωρίς έργο</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={input + ' max-w-56'} value={v.category ?? ''} onChange={(e) => setV({ ...v, category: (e.target.value || null) as TicketCategory | null })}>
          <option value="">Χωρίς κατηγορία</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.isPublic} onChange={(e) => setV({ ...v, isPublic: e.target.checked })} />
        Δημόσιο — εμφανίζεται στο help center της πηγής
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        {canDelete && v.id && (
          <button onClick={remove} disabled={pending} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600">
            Διαγραφή
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Σελίδες new + edit**

```tsx
// app/(app)/knowledge/new/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { EntryForm } from '../entry-form'

export default async function NewKnowledgePage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'manager') redirect('/knowledge')

  const [sources, projects] = await Promise.all([
    prisma.ticketSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Νέα εγγραφή γνώσης</h1>
      <EntryForm
        initial={{ title: '', problem: '', solution: '', tags: [], category: null, projectId: null, sourceId: null, isPublic: false }}
        sources={sources}
        projects={projects}
        canDelete={false}
      />
    </div>
  )
}
```

```tsx
// app/(app)/knowledge/[id]/page.tsx
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { EntryForm } from '../entry-form'

export default async function KnowledgeEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const role = session?.user?.role
  const canEdit = role === 'admin' || role === 'manager'

  const entry = await prisma.knowledgeEntry.findUnique({ where: { id } })
  if (!entry) notFound()

  const [sources, projects] = await Promise.all([
    prisma.ticketSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{entry.title}</h1>
        <section><h2 className="text-sm font-semibold text-neutral-500">Πρόβλημα</h2><p className="mt-1 whitespace-pre-wrap text-sm">{entry.problem}</p></section>
        <section><h2 className="text-sm font-semibold text-neutral-500">Λύση</h2><p className="mt-1 whitespace-pre-wrap text-sm">{entry.solution}</p></section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Επεξεργασία εγγραφής</h1>
      <EntryForm
        initial={{
          id: entry.id,
          title: entry.title,
          problem: entry.problem,
          solution: entry.solution,
          tags: JSON.parse(entry.tags || '[]'),
          category: entry.category,
          projectId: entry.projectId,
          sourceId: entry.sourceId,
          isPublic: entry.isPublic,
        }}
        sources={sources}
        projects={projects}
        canDelete
      />
    </div>
  )
}
```

- [ ] **Step 4: Χειροκίνητος έλεγχος**

`npm run dev` → `/knowledge`: λίστα + αναζήτηση δουλεύουν· «Νέα εγγραφή» → αποθήκευση → εμφανίζεται· toggle «Δημόσιο» χωρίς πηγή → σφάλμα validation.

- [ ] **Step 5: Typecheck & commit**

```bash
npx tsc --noEmit
git add app/\(app\)/knowledge/
git commit -m "feat(knowledge): internal KB pages with search, filters, CRUD"
```

---

### Task 13: Sidebar link «Γνωσιακή βάση»

**Files:**
- Modify: `components/layout/sidebar.tsx` (icons ~5-24, nav array ~27-39, φίλτρα ~51-58, 76)

- [ ] **Step 1: Πρόσθεσε το entry**

Import icons (μαζί με τα υπάρχοντα @fluentui/react-icons):

```ts
BookOpen24Regular, BookOpen24Filled,
```

Στο `nav` array, μετά το Tickets entry (γραμμή ~33):

```ts
{ href: '/knowledge', label: 'Γνωσιακή βάση', Regular: BookOpen24Regular, Filled: BookOpen24Filled },
```

Ορατότητα: **όλη η ομάδα** βλέπει το KB (μόνο το Tickets είναι manager/admin-only στη γραμμή 76 — μην προσθέσεις το `/knowledge` εκεί). Πρόσθεσε όμως `/knowledge` στο `CUSTOMER_HIDDEN_HREFS` set (γραμμές ~51-58) ώστε οι πελάτες να μην το βλέπουν.

- [ ] **Step 2: Μπλόκαρε τους customers και στο route level**

Στο `lib/auth.config.ts`, στο customer block του `authorized()` callback (γραμμές ~172-182), πρόσθεσε το `/knowledge` στη λίστα των routes που δεν επιτρέπονται σε `userType === 'customer'` (ίδιο pattern με τα υπάρχοντα εκεί).

- [ ] **Step 3: Typecheck & commit**

```bash
npx tsc --noEmit
git add components/layout/sidebar.tsx lib/auth.config.ts
git commit -m "feat(knowledge): sidebar link, hidden from customers"
```

---

### Task 14: Δημόσιο help center `/help/{sourceCode}`

**Files:**
- Modify: `proxy.ts` (~γραμμές 13-16)
- Create: `app/help/[source]/page.tsx`
- Create: `app/help/[source]/[slug]/page.tsx`

- [ ] **Step 1: Middleware εξαίρεση**

Στο `proxy.ts`, κάτω από το `/t/` block (γραμμές 13-16):

```ts
  // Public help center — read-only, only isPublic entries are served.
  if (pathname.startsWith("/help/")) {
    return NextResponse.next();
  }
```

- [ ] **Step 2: Σελίδα λίστας help center**

```tsx
// app/help/[source]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Σφάλματα',
  feature: 'Νέες λειτουργίες',
  support: 'Υποστήριξη',
  question: 'Ερωτήσεις',
  billing: 'Χρεώσεις',
  other: 'Γενικά',
}

export default async function HelpCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { source: sourceCode } = await params
  const { q } = await searchParams

  const source = await prisma.ticketSource.findUnique({ where: { code: sourceCode } })
  if (!source || !source.active) notFound()

  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      sourceId: source.id,
      isPublic: true,
      ...(q
        ? { OR: [{ title: { contains: q } }, { problem: { contains: q } }, { solution: { contains: q } }, { tags: { contains: q } }] }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, problem: true, slug: true, category: true },
    take: 200,
  })

  const groups = new Map<string, typeof entries>()
  for (const e of entries) {
    const key = e.category ?? 'other'
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Κέντρο βοήθειας — {source.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">Απαντήσεις σε συχνά προβλήματα και ερωτήσεις.</p>
      </header>

      <form>
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Αναζήτηση…"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
      </form>

      {entries.length === 0 && <p className="text-sm text-neutral-500">Δεν βρέθηκαν άρθρα.</p>}

      {[...groups.entries()].map(([category, list]) => (
        <section key={category}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {CATEGORY_LABELS[category] ?? 'Γενικά'}
          </h2>
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {list.map((e) => (
              <li key={e.id} className="p-4">
                <Link href={`/help/${sourceCode}/${e.slug}`} className="font-medium hover:underline">{e.title}</Link>
                <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{e.problem}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
```

- [ ] **Step 3: Σελίδα άρθρου**

```tsx
// app/help/[source]/[slug]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ source: string; slug: string }>
}) {
  const { source: sourceCode, slug } = await params

  const source = await prisma.ticketSource.findUnique({ where: { code: sourceCode }, select: { id: true, name: true, active: true } })
  if (!source || !source.active) notFound()

  const entry = await prisma.knowledgeEntry.findUnique({ where: { slug } })
  if (!entry || !entry.isPublic || entry.sourceId !== source.id) notFound()

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href={`/help/${sourceCode}`} className="text-sm text-blue-600 hover:underline">← Κέντρο βοήθειας</Link>
      <h1 className="text-2xl font-semibold">{entry.title}</h1>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Το πρόβλημα</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.problem}</p>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Η λύση</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.solution}</p>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Χειροκίνητος έλεγχος**

`npm run dev`, σε incognito (χωρίς session):
- `/help/<code>` πηγής με δημόσιες εγγραφές → λίστα χωρίς redirect σε signin.
- Άρθρο ανοίγει στο `/help/<code>/<slug>`.
- Εγγραφή με `isPublic=false` → δεν εμφανίζεται· direct slug URL → 404.
- Άγνωστο source code → 404.

- [ ] **Step 5: Typecheck & commit**

```bash
npx tsc --noEmit
git add proxy.ts app/help/
git commit -m "feat(knowledge): public per-source help center"
```

---

### Task 15: CLI smoke test + τελική επαλήθευση + docs

**Files:**
- Create: `scripts/test-kb-flow.ts`
- Modify: `docs/ticketing/INTEGRATION.md` (τέλος §5)

- [ ] **Step 1: CLI script για το KB flow**

Ακολούθησε το pattern του `scripts/test-ticket-triage.ts` (manual `loadEnv()` + dynamic imports):

```ts
// scripts/test-kb-flow.ts
/**
 * Smoke test: resolution → KB draft regeneration.
 * Run: npx tsx scripts/test-kb-flow.ts --ticket <id> [--solution "..."]
 * Sets resolutionSummary on the ticket, runs generateKbDraft, prints the newest kb_draft event.
 */
import fs from 'fs'
import path from 'path'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

async function main() {
  loadEnv()
  const args = process.argv.slice(2)
  const ticketId = args[args.indexOf('--ticket') + 1]
  if (!ticketId || ticketId.startsWith('--')) {
    console.error('Usage: npx tsx scripts/test-kb-flow.ts --ticket <id> [--solution "..."]')
    process.exit(1)
  }
  const si = args.indexOf('--solution')
  const solution = si >= 0 ? args[si + 1] : 'Δοκιμαστική λύση: καθαρίστηκε η cache του Next.js και έγινε redeploy.'

  const { prisma } = await import('../lib/prisma')
  const { generateKbDraft } = await import('../lib/tickets/kb')

  await prisma.ticket.update({ where: { id: ticketId }, data: { resolutionSummary: solution } })
  console.log('resolutionSummary set. Generating KB draft…')
  await generateKbDraft(ticketId)

  const event = await prisma.ticketEvent.findFirst({
    where: { ticketId, type: 'kb_draft' },
    orderBy: { createdAt: 'desc' },
  })
  console.log(JSON.stringify(event ? JSON.parse(event.payload ?? '{}') : null, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Τρέξε το με πραγματικό resolved ticket**

Run: `npx tsx scripts/test-kb-flow.ts --ticket <id ενός resolved ticket από το dev DB>`
Expected: εκτυπώνεται JSON draft όπου το `solution` αντανακλά τη δοκιμαστική λύση.

- [ ] **Step 3: Ενημέρωσε το INTEGRATION.md**

Στο τέλος της ενότητας «5. Τι συμβαίνει μετά την υποβολή» πρόσθεσε bullet:

```md
6. Οι εγκεκριμένες λύσεις δημοσιεύονται προαιρετικά στο help center της πηγής σας: `https://pm.dgsmart.gr/help/{TICKETING_PROJECT_CODE}` — μπορείτε να το συνδέσετε δίπλα στη φόρμα υποστήριξης.
```

- [ ] **Step 4: Πλήρης επαλήθευση**

```bash
npx tsx --test lib/tickets/__tests__/format-duration.test.ts lib/tickets/__tests__/slug.test.ts
npx tsc --noEmit
npm run build
```

Expected: όλα τα tests pass, καθαρό typecheck, επιτυχές build.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-kb-flow.ts docs/ticketing/INTEGRATION.md
git commit -m "test(tickets): KB flow smoke test + integration doc update"
```

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| §1 Καταγραφή λύσης (dialog + fallback + polish) | 5, 7, 8 |
| §2 KB draft με λύση ανθρώπου + regenerate | 5 (saveResolution), 6 |
| §3 Schema | 1 |
| §4 Εσωτερικό KB `/knowledge` | 11, 12, 13 |
| §5 Δημόσιο help center | 10 (sourceId), 14 |
| §6 Χρόνος επίλυσης στα emails | 3, 9 |
| §7 Σφάλματα/ασφάλεια | 5 (rate limit, try/catch), 14 (isPublic/404) |
| §8 Testing | 3, 4, 15 |
