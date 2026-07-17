# Ticketing System με DeepSeek Triage — Design Spec

**Ημερομηνία:** 2026-07-17
**Status:** Draft — αναμένει έγκριση πριν την υλοποίηση
**Project:** fluent-pm (A-Sisyphus)

## 1. Στόχος

Ενιαίο support desk για όλα τα projects της DGsmart. Κάθε εξωτερική εφαρμογή (e-shop, GDPR tool, custom app) ενσωματώνει μια φόρμα ticket. Το ticket φτάνει στο fluent-pm, αναλύεται αυτόματα από το DeepSeek (τεχνική επαναδιατύπωση, κατηγοριοποίηση, αντιστοίχιση με project/task/χρήστη), και ο admin/manager το μετατρέπει σε Task με ένα κλικ. Ο reporter ενημερώνεται με email σε κάθε αλλαγή κατάστασης. Με την ολοκλήρωση, η λύση αποθηκεύεται σε Knowledge Base που τροφοδοτεί τα μελλοντικά triage — το σύστημα γίνεται πιο έξυπνο με τον χρόνο.

## 2. Εναλλακτικές προσεγγίσεις

| Προσέγγιση | Υπέρ | Κατά |
|---|---|---|
| **A. Ξεχωριστό μοντέλο `Ticket` + μετατροπή σε `Task`** (προτεινόμενη) | Καθαρός διαχωρισμός δημόσιας εισόδου από εσωτερική δουλειά· το Task pipeline (approval gate, calendar sync, notifications, occupancy) μένει ανέγγιχτο· εύκολο lifecycle/SLA ανά ticket | Ένα ακόμα μοντέλο + sync ticket↔task status |
| B. Ticket = Task σε ειδικό "Support" project | Μηδέν νέα μοντέλα | Μολύνει το Task model με δημόσια πεδία (email, URL, API key)· τα draft/spam tickets εμφανίζονται σε board/timeline/reports· δύσκολο triage state machine |
| C. Ξεχωριστό microservice | Πλήρης απομόνωση | Διπλό deployment, διπλό auth, χάνει την άμεση πρόσβαση σε Projects/Tasks/Users/Notifications του fluent-pm |

**Επιλογή: A.** Ελάχιστη επέμβαση στο υπάρχον σύστημα, μέγιστη επαναχρησιμοποίηση (`lib/llm`, `lib/notifications.ts`, `lib/mailgun.ts`, occupancy logic).

## 3. Data model (Prisma / MySQL)

### 3.1 Νέα μοντέλα

```prisma
model TicketSource {
  id            String   @id @default(cuid())
  code          String   @unique            // π.χ. "DGSHOP" — δηλώνεται στο .env του client app
  name          String                       // "DG WooCommerce Shop"
  secretHash    String                       // bcrypt του API secret
  originUrls    String   @db.Text            // JSON array επιτρεπόμενων origins (CORS + έλεγχος)
  defaultProjectId String?                   // προεπιλεγμένο fluent-pm Project
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  tickets       Ticket[]
  defaultProject Project? @relation(fields: [defaultProjectId], references: [id])
}

enum TicketStatus {
  new          // παραλήφθηκε, εκκρεμεί ανάλυση
  analyzing    // τρέχει DeepSeek
  triaged      // υπάρχει πρόταση, περιμένει admin/manager
  converted    // έγινε Task — παρακολουθεί το task status
  resolved     // το task ολοκληρώθηκε (done)
  closed       // KB entry αποθηκεύτηκε / έκλεισε οριστικά
  rejected     // spam / εκτός σκοπού
}

enum TicketCategory { bug feature support question billing other }

model Ticket {
  id            String   @id @default(cuid())
  code          String   @unique             // TKT-YYYY-NNNN
  sourceId      String
  source        TicketSource @relation(...)
  reporterEmail String
  reporterName  String?
  originUrl     String                        // σελίδα από όπου ήρθε
  subject       String
  body          String   @db.Text             // αυθεντικό κείμενο χρήστη
  status        TicketStatus @default(new)
  publicToken   String   @unique @default(cuid()) // για status page / email links
  // — LLM output —
  aiTitle       String?                       // τεχνικός τίτλος
  aiDescription String?  @db.Text             // τεχνική επαναδιατύπωση (Ελληνικά)
  aiCategory    TicketCategory?
  aiPriority    TaskPriority?
  aiSuggestedProjectId  String?
  aiSuggestedAssigneeId String?
  aiReasoning   String?  @db.Text             // αιτιολόγηση πρότασης
  aiConfidence  Float?                        // 0..1
  aiError       String?                       // αποτυχία ανάλυσης
  // — μετατροπή —
  taskId        String?  @unique
  task          Task?    @relation(fields: [taskId], references: [id])
  resolvedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  events        TicketEvent[]
  @@index([status, createdAt])
  @@index([reporterEmail])
}

model TicketEvent {
  id        String   @id @default(cuid())
  ticketId  String
  ticket    Ticket   @relation(...)
  type      String                            // created|analyzed|triaged|converted|task_status|emailed|closed|note
  payload   String?  @db.Text                 // JSON λεπτομέρειες
  actorId   String?                           // null = σύστημα
  createdAt DateTime @default(now())
  @@index([ticketId, createdAt])
}

model KnowledgeEntry {
  id          String   @id @default(cuid())
  ticketId    String?  @unique
  taskId      String?
  projectId   String?
  title       String
  problem     String   @db.Text               // τεχνική περιγραφή προβλήματος
  solution    String   @db.Text               // πώς λύθηκε
  tags        String                          // JSON array keywords (για FULLTEXT match)
  category    TicketCategory?
  approvedById String?                        // admin που το ενέκρινε
  createdAt   DateTime @default(now())
  @@fulltext([title, problem, solution, tags])
}
```

### 3.2 Επεκτάσεις υπαρχόντων

- `NotificationType` enum: + `ticket` (νέο ticket για triage) — επαναχρησιμοποιεί το in-app σύστημα.
- `Task`: σχέση `ticket Ticket?` (το inverse του `Ticket.taskId`). Κανένα άλλο πεδίο.
- `Project.projectCode` υπάρχει ήδη ("PRJ-YYYY-NNN") — το LLM matching δουλεύει πάνω σε name/description/code.

## 4. Ροή (pipeline)

```
[Client app φόρμα] → POST /api/tickets (API key auth, CORS, rate limit)
   → Ticket(status=new) + TicketEvent(created) + email "Λάβαμε το αίτημά σας TKT-…"
   → άμεσο kick του analyzeTicket(ticketId)  (after-response, μη-blocking)
        + cron σκούπα /api/cron/analyze-tickets για ό,τι κόλλησε σε new/analyzing

analyzeTicket:
   1. pseudonymize(body)                       ← υπάρχον lib/llm/pseudonymize.ts (GDPR)
   2. Συλλογή context:
      • ενεργά Projects (name, code, description, status)
      • top-N παρόμοια Tasks (MySQL FULLTEXT στα title/description) + assignees τους
      • top-N KnowledgeEntry (FULLTEXT match)
      • φόρτος χρηστών: ανοιχτά tasks/χρήστη + occupancy 5 επόμενων εργάσιμων
        (refactor της λογικής occupancy από scripts/backfill-task-dates.ts → lib/task-scheduling.ts)
   3. DeepSeek call (lib/llm, LLM_PROVIDER=deepseek), system prompt με:
      • προφίλ DGsmart: custom software (Next.js), SoftOne ERP integrations,
        WooCommerce e-shops, GDPR tooling, project management — Ελληνικά output
      • JSON schema: {title, description, category, priority,
        suggestedProjectCode|null, suggestedAssigneeId|null, reasoning, confidence}
   4. Αποθήκευση ai* πεδίων, status=triaged, TicketEvent(analyzed)
   5. createNotifications → όλοι οι admin + manager (type: ticket, link: /tickets/{id})
   Σε σφάλμα LLM: status=triaged με aiError — ο admin κάνει χειροκίνητο triage. Ποτέ χαμένο ticket.

Triage UI (/tickets/{id} — admin/manager):
   • Δείχνει original + AI πρόταση δίπλα-δίπλα
   • Ο διαχειριστής: δέχεται ή αλλάζει project (ή δημιουργεί νέο), δέχεται ή αλλάζει assignee
     (dropdown με ένδειξη διαθεσιμότητας: ανοιχτά tasks + πρώτο ελεύθερο slot), επεξεργάζεται περιγραφή
   • «Δημιουργία Task» → createTask με τα υπάρχοντα paths (auto-slot, calendar sync,
     notifyTaskAssignment) + Ticket(status=converted, taskId) + email στον reporter
   • Ή «Απόρριψη» (spam/εκτός σκοπού) → status=rejected + προαιρετικό email

Παρακολούθηση:
   • Hook στο notifyTaskStatusChange (lib/notifications.ts): αν το task έχει ticket,
     → TicketEvent(task_status) + email reporter μέσω Mailgun (ελληνικά templates,
       lib/email-templates.ts) με link στο public status page /t/{publicToken}
   • task → done: Ticket(status=resolved) + email «Το αίτημά σας ολοκληρώθηκε»

Κλείσιμο & Knowledge Base:
   • Στο resolved, το σύστημα ζητά από DeepSeek draft KnowledgeEntry
     (problem/solution/tags) από: ticket body + task description + comments
   • Ο admin το βλέπει στο ticket detail, το διορθώνει, «Αποθήκευση στο KB» → status=closed
   • Τα KnowledgeEntry μπαίνουν στο context του βήματος 2 των επόμενων αναλύσεων
```

## 5. Δημόσιο API (web methods για τα client apps)

Auth: headers `X-Ticket-Project: <code>` + `X-Ticket-Key: <secret>`. Το secret ελέγχεται με bcrypt κατά του `TicketSource.secretHash`, το origin κατά του `originUrls`. Rate limit ανά source + ανά reporterEmail (π.χ. 10/ώρα). Honeypot πεδίο στη φόρμα.

| Method | Route | Περιγραφή |
|---|---|---|
| POST | `/api/tickets` | Δημιουργία: `{subject, body, reporterEmail, reporterName?, originUrl}` → `{code, publicToken}` |
| GET | `/api/tickets/{code}?token={publicToken}` | Κατάσταση + ιστορικό events (sanitized) |
| GET | `/t/{publicToken}` | Δημόσια status page (SSR, Ελληνικά) |

Client app `.env`:
```
TICKETING_URL=https://pm.dgsmart.gr
TICKETING_PROJECT_CODE=DGSHOP
TICKETING_API_KEY=...
```
Θα δοθεί drop-in snippet (plain fetch + React component) — βλ. docs/ticketing/INTEGRATION.md.

## 6. Εσωτερικό UI

- `app/(app)/tickets/` — λίστα (φίλτρα: status, source, category), badge πλήθους `new+triaged` στο sidebar.
- `app/(app)/tickets/[id]/` — detail + triage panel + timeline events + KB draft.
- `app/(app)/admin/ticket-sources/` — CRUD sources (δημιουργία code/secret, εμφάνιση secret μόνο μία φορά).
- `app/(app)/knowledge/` — αναζήτηση/επεξεργασία KB (φάση 2, αρκεί αρχικά το read μέσω triage context).
- Server actions: `app/(app)/tickets/actions.ts` (convert, reject, reassign, saveKb) — inline role checks όπως το υπάρχον pattern (`admin|manager`).

## 7. Διαθεσιμότητα χρηστών

Refactor του occupancy engine από `scripts/backfill-task-dates.ts` σε `lib/task-scheduling.ts`:
- `getUserLoad(userIds, days=5)` → ανοιχτά tasks + κατειλημμένες ώρες/εργάσιμη μέρα (business hours 09:00–18:30 από `lib/business-hours.ts`).
- Το LLM παίρνει συνοπτικό πίνακα φόρτου· το UI δείχνει το ίδιο στο assignee dropdown.
- Το script συνεχίζει να δουλεύει, απλώς κάνει import από το lib.

## 8. Ασφάλεια & GDPR

- Secrets: bcrypt hash, ποτέ plaintext στη ΒΔ· CORS allowlist ανά source· rate limiting (in-memory + DB fallback)· honeypot + max μήκος body.
- **Pseudonymization πριν από κάθε DeepSeek call** (υπάρχον `lib/llm/pseudonymize.ts`) — emails/ονόματα δεν φεύγουν στον provider.
- Το public status page δείχνει μόνο: code, status, ημερομηνίες — όχι εσωτερικά ονόματα/projects.
- Emails μέσω Mailgun με τα υπάρχοντα templates· unsubscribe δεν απαιτείται (transactional).

## 9. Error handling

- LLM αποτυχία → ticket μένει διαχειρίσιμο χειροκίνητα (aiError), cron retry ×3.
- Mailgun αποτυχία → TicketEvent(emailed, payload.error), δεν μπλοκάρει το pipeline.
- Διπλοϋποβολή: dedup ίδιο (email, subject, source) εντός 10 λεπτών → επιστρέφει το υπάρχον code.

## 10. Testing

- Unit: pseudonymize round-trip, prompt builder (snapshot), similarity query, dedup, auth του POST /api/tickets (σωστό/λάθος key/origin/rate-limit).
- Integration: πλήρες lifecycle new→triaged→converted→resolved→closed με mocked LLM.
- `scripts/test-ticket-triage.ts`: CLI δοκιμή του analyzeTicket με πραγματικό DeepSeek σε δείγμα tickets.

## 11. Φάσεις υλοποίησης

1. **Schema + public API** — μοντέλα, migration, POST/GET endpoints, auth, dedup, emails παραλαβής.
2. **DeepSeek triage** — analyzeTicket, context builder, occupancy refactor, cron, admin notifications.
3. **Triage UI + conversion** — tickets pages, convert-to-task, status propagation hook, reporter emails, public status page.
4. **Knowledge Base** — KnowledgeEntry, KB draft generation, feedback loop στο triage context.
5. **Sources admin + integration kit** — sources CRUD, snippets, docs.

## 12. Εκτός scope (YAGNI)

Embeddings/vector search (το FULLTEXT αρκεί αρχικά)· attachments σε tickets· δίγλωσσο KB· SLA timers/escalations· reporter portal με login· webhook προς τα client apps.
