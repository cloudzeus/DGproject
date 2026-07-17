# Ticketing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Κεντρικό support desk στο fluent-pm: δημόσιο API για tickets από client apps, DeepSeek triage με πρόταση project/assignee, μετατροπή σε Task, email ενημερώσεις reporter, Knowledge Base feedback loop.

**Architecture:** Ξεχωριστό μοντέλο `Ticket` + `TicketSource`/`TicketEvent`/`KnowledgeEntry` (spec: `docs/superpowers/specs/2026-07-17-ticketing-system-design.md`). Triage μέσω υπάρχοντος `lib/llm` (DeepSeek) με υποχρεωτικό pseudonymize. Status propagation μέσω hook στο `notifyTaskStatusChange`.

**Tech Stack:** Next.js 16 App Router, Prisma 5 / MySQL, NextAuth v5, Mailgun, lib/llm (DeepSeek raw fetch). Χωρίς test framework — verification με `npx tsc --noEmit`, `npm run build`, CLI scripts.

**Branch:** `feat/ticketing-system` από το τρέχον HEAD.

**Σύμβαση verification κάθε task:** `npx tsc --noEmit` πρέπει να βγάζει exit 0 πριν από κάθε commit. Commits ανά task.

---

### Task 1: Prisma schema + migration

**Files:** Modify `prisma/schema.prisma`

- [ ] Πρόσθεσε enums `TicketStatus` (new, analyzing, triaged, converted, resolved, closed, rejected), `TicketCategory` (bug, feature, support, question, billing, other).
- [ ] Πρόσθεσε στο `NotificationType` την τιμή `ticket`.
- [ ] Πρόσθεσε μοντέλα `TicketSource`, `Ticket`, `TicketEvent`, `KnowledgeEntry` όπως στο spec §3.1, με τις εξής συγκεκριμενοποιήσεις:
  - `Ticket.aiPriority TaskPriority?` (υπάρχον enum), `Ticket.taskId String? @unique`, relation `task Task? @relation("TicketTask", fields: [taskId], references: [id], onDelete: SetNull)`.
  - `TicketSource.defaultProject Project? @relation("SourceDefaultProject", ...)`, inverse `Project.ticketSources TicketSource[] @relation("SourceDefaultProject")`.
  - Inverse στο Task: `ticket Ticket? @relation("TicketTask")`.
  - `KnowledgeEntry`: `@@fulltext([title, problem, solution, tags])` — απαιτεί `previewFeatures = ["fullTextIndex", "fullTextSearch"]` στον generator ΑΝ δεν υπάρχει ήδη· αν το preview flag δημιουργήσει πρόβλημα, παράλειψε το `@@fulltext` και κράτα απλά indexes — το similarity query έχει LIKE fallback (Task 6).
- [ ] `npx prisma migrate dev --name ticketing_system` (χρειάζεται το shadow-DB workaround που εφαρμόστηκε στο project-approver migration — δες `prisma/migrations/` πρόσφατο pattern· εναλλακτικά `npx prisma migrate dev --create-only` + `npx prisma migrate deploy` + `npx prisma generate`).
- [ ] `npx tsc --noEmit` → exit 0. Commit: `feat(tickets): schema for ticket sources, tickets, events, knowledge base`.

### Task 2: Ticket codes + API auth helpers

**Files:** Create `lib/tickets/codes.ts`, `lib/tickets/source-auth.ts`

- [ ] `codes.ts`:

```ts
import { prisma } from '@/lib/prisma'

export async function nextTicketCode(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TKT-${year}-`
  const last = await prisma.ticket.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  })
  const n = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(4, '0')}`
}
```
(Σε race, το `@unique` του code σκάει — ο caller κάνει retry ×3.)

- [ ] `source-auth.ts`: `verifyTicketSource(code, key, origin)` → φέρνει active source, `bcrypt.compare(key, secretHash)`, έλεγχος origin κατά `JSON.parse(originUrls)` (match σε origin prefix· κενή λίστα = όλα). Επίσης in-memory rate limiter `checkRateLimit(bucket: string, limit: number, windowMs: number): boolean` με `Map<string, number[]>` (καθάρισμα expired timestamps σε κάθε κλήση).
- [ ] tsc → commit: `feat(tickets): ticket code generator + source auth/rate-limit helpers`.

### Task 3: Email templates για reporter

**Files:** Modify `lib/email-templates.ts` (ή create `lib/tickets/emails.ts` αν το υπάρχον αρχείο είναι δύσχρηστο)

- [ ] Συναρτήσεις (Ελληνικά, ίδιο HTML στυλ με υπάρχοντα templates): `ticketReceivedEmail({code, subject, statusUrl})`, `ticketStatusEmail({code, subject, statusLabel, statusUrl})`, `ticketResolvedEmail({code, subject, statusUrl})`, `ticketRejectedEmail({code, subject, reason?})`.
- [ ] Helper `sendTicketEmail(to, template)` που τυλίγει το `sendEmail` του `lib/mailgun.ts` σε try/catch και επιστρέφει `{ok, error?}` — ΠΟΤΕ throw (spec §9).
- [ ] tsc → commit: `feat(tickets): reporter email templates (Greek)`.

### Task 4: POST /api/tickets + GET status + public page

**Files:** Create `app/api/tickets/route.ts`, `app/api/tickets/[code]/route.ts`, `app/t/[token]/page.tsx`

- [ ] `POST /api/tickets`: headers `X-Ticket-Project`/`X-Ticket-Key` → `verifyTicketSource` (401/403). Body validation: subject ≤200, body ≤5000, reporterEmail regex, originUrl (422). Rate limit: `checkRateLimit('src:'+sourceId, 60, 3600_000)` και `('email:'+email, 10, 3600_000)` → 429. Dedup: ίδιο (sourceId, reporterEmail, subject) με createdAt > now-10min → 200 με υπάρχον code. Αλλιώς: `nextTicketCode()` (retry ×3 σε P2002), create Ticket(status=new) + TicketEvent(created), `sendTicketEmail` επιβεβαίωσης, fire-and-forget `analyzeTicket(id)` (dynamic import, `.catch()` logged — ΟΧΙ await). Response 201 `{code, publicToken, statusUrl}`. + `OPTIONS` handler με CORS headers (origin echo αν επιτρεπτό).
- [ ] `GET /api/tickets/[code]?token=`: βρες ticket by code, 404 αν token ≠ publicToken. Επιστρέφει code, status, ελληνικό statusLabel (map: new/analyzing/triaged→«Σε αξιολόγηση», converted→«Σε επεξεργασία», resolved→«Ολοκληρώθηκε», closed→«Έκλεισε», rejected→«Απορρίφθηκε»), createdAt, sanitized events (μόνο type ∈ created|converted|task_status|closed + created label + timestamp — όχι εσωτερικά ονόματα).
- [ ] `app/t/[token]/page.tsx`: server component ΕΚΤΟΣ `(app)` group (δημόσιο, χωρίς auth). Δείχνει code, status badge, timeline events, στα Ελληνικά. `notFound()` αν άγνωστο token.
- [ ] Verification: `npx tsc --noEmit` + χειροκίνητο curl σε dev (θα γίνει στο Task 12 end-to-end). Commit: `feat(tickets): public ticket API + status page`.

### Task 5: Occupancy refactor → lib/task-scheduling.ts

**Files:** Create `lib/task-scheduling.ts`, Modify `scripts/backfill-task-dates.ts`

- [ ] Μετάφερε από το script τα occupancy helpers (`occKey`, `latestEndFor`, `markBusy`, business-day iteration) σε `lib/task-scheduling.ts` με export:

```ts
export interface UserLoad {
  userId: string
  openTasks: number            // tasks σε todo/in_progress/review όπου είναι assignee
  busyHoursNext5Days: number   // άθροισμα estimatedHours (default 1h) σε εργάσιμες επόμενων 5 ημερών
  nextFreeSlot: Date | null    // πρώτο business-hours κενό ≥1h
}
export async function getUserLoads(userIds: string[]): Promise<UserLoad[]>
```

Υλοποίηση: ένα query σε Task (status ∈ todo/in_progress/review, assignees in userIds, startDate μέσα στο παράθυρο ή null), χτίσε occupancy map ανά (user, day) με `lib/business-hours.ts` όρια, υπολόγισε τα τρία μεγέθη.
- [ ] Το script κάνει import ό,τι μεταφέρθηκε (χωρίς αλλαγή συμπεριφοράς — τρέξε `npx ts-node scripts/backfill-task-dates.ts` dry-run και σύγκρινε ότι δεν προτείνει αλλαγές αφού όλα είναι ήδη τακτοποιημένα).
- [ ] tsc → commit: `refactor(scheduling): extract occupancy engine to lib/task-scheduling`.

### Task 6: DeepSeek triage engine

**Files:** Create `lib/tickets/triage.ts`, Create `lib/tickets/similar.ts`

- [ ] `similar.ts`: `findSimilarTasks(text, limit=5)` και `findKnowledgeEntries(text, limit=5)`. Πρώτα δοκιμή MySQL FULLTEXT (`$queryRaw` MATCH...AGAINST σε NATURAL LANGUAGE MODE)· σε error (χωρίς index) fallback σε LIKE στα 6 μεγαλύτερα keywords (λέξεις >3 χαρακτήρων του text). Επιστρέφει tasks με project + assignees(user id/name) και KB entries (title, problem, solution).
- [ ] `triage.ts` — `analyzeTicket(ticketId)`:
  1. Ticket → status=analyzing.
  2. Context: ενεργά projects (id, projectCode, name, description, status ∈ planning/active), similar tasks, KB entries, `getUserLoads` για όλους τους employees (role ≠ viewer, userType=employee) + ονόματα.
  3. `pseudonymize` το subject+body (υπάρχον `lib/llm/pseudonymize.ts` — δες signature πριν τη χρήση· κράτα το mapping για να ΜΗΝ αποθηκευτούν ψευδώνυμα στο aiDescription: κάνε reverse στο αποτέλεσμα αν το util το υποστηρίζει, αλλιώς στείλε μόνο το body pseudonymized και κράτα ονόματα εκτός prompt).
  4. System prompt (Ελληνικά): προφίλ DGsmart (custom software Next.js, SoftOne ERP integrations, WooCommerce e-shops, GDPR tooling, PM), οδηγία αυστηρού JSON: `{"title","description","category","priority","suggestedProjectCode":null|string,"suggestedAssigneeId":null|string,"reasoning","confidence":0..1}`. User prompt: ticket (subject/body/originUrl/source name) + λίστες projects/similar tasks/KB/φόρτου.
  5. Κλήση μέσω `lib/llm` (δες `lib/llm/index.ts` export — χρησιμοποίησε το ίδιο entrypoint με το `email-analysis.ts`). Parse JSON (strip ```json fences), validation: category/priority σε enum values, projectCode → resolve σε projectId (αλλιώς null), assigneeId ∈ γνωστούς users (αλλιώς null).
  6. Update ticket: ai* πεδία, status=triaged + TicketEvent(analyzed).
  7. `createNotifications` σε όλους τους admin+manager: type `ticket`, title «Νέο ticket TKT-…», link `/tickets/{id}`.
  8. catch: status=triaged, aiError=message, TicketEvent(analyzed, {error}) + notifications ίδια (χειροκίνητο triage). Ποτέ throw προς τον caller.
- [ ] tsc → commit: `feat(tickets): DeepSeek triage engine with project/assignee suggestion`.

### Task 7: CLI δοκιμή triage + cron sweeper

**Files:** Create `scripts/test-ticket-triage.ts`, Create `app/api/cron/analyze-tickets/route.ts`

- [ ] Script κατά το pattern του `scripts/test-llm-extract.ts` (.env loading όπως στο backfill script): φτιάχνει in-memory δείγμα ticket (ΔΕΝ γράφει DB αν περαστεί `--dry`· με `--ticket <id>` τρέχει analyzeTicket σε υπαρκτό). Τύπωσε το LLM αποτέλεσμα.
- [ ] Cron route: guard `CRON_SECRET` (ίδιο pattern με `app/api/cron/ingest-meetings`), βρες tickets status ∈ new/analyzing με updatedAt < now-5min και <3 analyzed-error events, τρέξε σειριακά analyzeTicket. Επιστρέφει `{processed}`.
- [ ] Τρέξε `npx ts-node scripts/test-ticket-triage.ts --dry` με πραγματικό DeepSeek — έλεγξε ότι επιστρέφει έγκυρο JSON πρόταση. Commit: `feat(tickets): triage CLI test + cron sweeper`.

### Task 8: Tickets list + detail UI (admin/manager)

**Files:** Create `app/(app)/tickets/page.tsx`, `app/(app)/tickets/[id]/page.tsx`, `app/(app)/tickets/ticket-detail-client.tsx`. Modify sidebar nav (βρες το component του `(app)` layout — ίδιο pattern με Questions badge αν υπάρχει).

- [ ] Λίστα: server component, `auth()` + redirect αν όχι admin/manager. Πίνακας: code, subject, source name, aiCategory badge, status badge, createdAt, link σε detail. Φίλτρα μέσω searchParams (status, sourceId). Default: status ∈ new/analyzing/triaged πρώτα.
- [ ] Sidebar: item «Tickets» με badge count όπου status ∈ new/triaged (ορατό μόνο admin/manager).
- [ ] Detail: αριστερά το original (subject, body, reporter, originUrl, source, events timeline)· δεξιά AI panel (aiTitle, aiDescription — editable textarea, aiCategory/aiPriority selects, aiReasoning, aiConfidence, aiError αν υπάρχει). Κάτω: επιλογή Project (default aiSuggestedProjectId, όλα τα planning/active), επιλογή Assignee dropdown με ένδειξη φόρτου από `getUserLoads` (π.χ. «Γιάννης — 3 ανοιχτά, ελεύθερος από Δευ 09:00», default aiSuggestedAssigneeId), κουμπιά «Δημιουργία Task», «Απόρριψη», «Επανάληψη ανάλυσης».
- [ ] tsc → commit: `feat(tickets): triage UI (list, detail, availability hints)`.

### Task 9: Server actions — convert / reject / reanalyze

**Files:** Create `app/(app)/tickets/actions.ts`

- [ ] `'use server'`, όλα με `auth()` + role admin|manager (inline pattern όπως `board/actions.ts:19`).
- [ ] `convertTicketToTask({ticketId, projectId, assigneeId, title, description, priority})`: δημιουργεί Task με το ίδιο path που χρησιμοποιεί το υπάρχον createTask των projects (δες `app/(app)/projects/[id]/task-actions.ts` — αντέγραψε τη ροή: create + TaskAssignee + auto-slot startDate μέσω business-hours/occupancy + `syncTaskCalendar` + `notifyTaskAssignment` + Activity αν υπάρχει pattern). Μετά: ticket → status=converted, taskId, TicketEvent(converted, {taskId, actor}), `sendTicketEmail` status «Σε επεξεργασία». `revalidatePath('/tickets')`.
- [ ] `rejectTicket({ticketId, reason, notifyReporter})`: status=rejected + event + προαιρετικό email.
- [ ] `reanalyzeTicket(ticketId)`: καθαρίζει aiError, καλεί `analyzeTicket`.
- [ ] `updateTicketAi({...})`: αποθήκευση edits του admin στο AI panel πριν το convert.
- [ ] tsc → commit: `feat(tickets): convert-to-task, reject, reanalyze actions`.

### Task 10: Status propagation → reporter emails

**Files:** Modify `lib/notifications.ts` (μέσα στο `notifyTaskStatusChange`) ή create `lib/tickets/propagate.ts` καλούμενο από εκεί.

- [ ] `propagateTicketStatus(taskId, newStatus)`: αν το task έχει linked ticket (status=converted): TicketEvent(task_status, {status}) + `sendTicketEmail` με χάρτη: in_progress→«Ξεκίνησε η επεξεργασία», review→«Σε έλεγχο ποιότητας», done→resolved email. Στο done: ticket → status=resolved, resolvedAt + kick `generateKbDraft` (Task 11, fire-and-forget). Debounce: μην στείλεις email αν ίδιο status event υπάρχει ήδη τελευταίο.
- [ ] Κλήση στο τέλος του `notifyTaskStatusChange` (ένα σημείο — αυτό είναι ήδη το consolidation point και των τριών mutation paths).
- [ ] tsc → commit: `feat(tickets): task status propagation to ticket + reporter emails`.

### Task 11: Knowledge Base loop

**Files:** Create `lib/tickets/kb.ts`, Modify `app/(app)/tickets/[id]/page.tsx` + `actions.ts`

- [ ] `generateKbDraft(ticketId)`: μαζεύει ticket body + task description + task comments, pseudonymize, LLM → `{title, problem, solution, tags[]}`, αποθήκευση ως TicketEvent(type='kb_draft', payload=JSON) (όχι KnowledgeEntry ακόμα — δεν είναι εγκεκριμένο).
- [ ] Ticket detail: όταν status=resolved και υπάρχει kb_draft event → φόρμα με τα πεδία (editable) + κουμπί «Αποθήκευση στο KB».
- [ ] Action `saveKnowledgeEntry({ticketId, title, problem, solution, tags})`: create KnowledgeEntry (approvedById=session user, projectId/taskId από ticket), ticket → status=closed + event + τελικό email «Το αίτημα έκλεισε».
- [ ] Το triage context (Task 6) ήδη διαβάζει KnowledgeEntry — ο κύκλος κλείνει.
- [ ] tsc → commit: `feat(tickets): knowledge base draft + approval loop`.

### Task 12: Ticket sources admin + end-to-end verification

**Files:** Create `app/(app)/admin/ticket-sources/page.tsx`, `app/(app)/admin/ticket-sources/actions.ts`

- [ ] CRUD: λίστα sources (code, name, origins, default project, active, tickets count). Create: γεννάει secret `crypto.randomBytes(24).toString('base64url')`, δείχνει ΜΟΝΟ μία φορά στο response, αποθηκεύει bcrypt hash. Toggle active. Edit origins/default project. Admin-only (πρόσθεσε link στο admin nav).
- [ ] **End-to-end δοκιμή σε dev server** (`npm run dev`): δημιούργησε source, `curl -X POST /api/tickets` με σωστά headers → 201· λάθος key → 401· έλεγξε ticket στη λίστα, τρέξε ανάλυση, convert σε task, άλλαξε task status από board, δες TicketEvent + (αν MAILGUN keys διαθέσιμα) email, δες public page `/t/{token}`.
- [ ] `npm run build` → πράσινο.
- [ ] Commit: `feat(tickets): ticket sources admin CRUD`.

### Task 13: Docs sync + τελικά

- [ ] Ενημέρωσε `docs/ticketing/INTEGRATION.md`: αφαίρεσε το «επιβεβαιώστε ότι έχει γίνει deploy» banner, διόρθωσε ό,τι άλλαξε σε routes/πεδία κατά την υλοποίηση.
- [ ] Ενημέρωσε το memory `ticketing-system-design` (status: implemented, τυχόν αποκλίσεις).
- [ ] Commit: `docs(tickets): sync integration guide with implementation`.

---

## Self-review σημειώσεις

- Spec coverage: §3 → Task 1· §5 → Tasks 2-4· §4 pipeline → Tasks 4,6,7,9,10,11· §6 UI → Tasks 8,9,12· §7 availability → Task 5,8· §8 security → Tasks 2,4,6 (pseudonymize)· §9 errors → Tasks 3,6,7· §10 testing → Task 7 + Task 12 e2e· §11 φάσεις καλύπτονται πλήρως.
- Χωρίς test framework στο repo → TDD αντικαθίσταται από tsc gate + CLI script + e2e χειροκίνητη δοκιμή (Task 12), συνειδητή απόκλιση.
- Ονόματα διεπαφών συνεπή: `analyzeTicket`, `getUserLoads`, `sendTicketEmail`, `generateKbDraft`, `propagateTicketStatus` χρησιμοποιούνται με ίδια ονόματα σε όλα τα tasks.
