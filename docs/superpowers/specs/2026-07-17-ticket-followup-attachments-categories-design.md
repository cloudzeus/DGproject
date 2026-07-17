# Ticket Follow-up, Attachments (Bunny CDN) & AI Κατηγορίες KB

**Ημερομηνία:** 2026-07-17 · **Κατάσταση:** Εγκεκριμένο design
**Βασίζεται στα:** [2026-07-17-ticketing-system-design.md](2026-07-17-ticketing-system-design.md), [2026-07-17-resolution-kb-help-center-design.md](2026-07-17-resolution-kb-help-center-design.md)

## Στόχος

Τρεις επεκτάσεις του ticketing: (1) δυναμικές κατηγορίες KB/help center που προτείνει
το DeepSeek, (2) πολλαπλά αρχεία (εικόνες) στη φόρμα υποβολής με αποθήκευση στο
Bunny CDN και μεταφορά στο task/project, (3) νήμα follow-up διευκρινίσεων μεταξύ
ομάδας και reporter με νέο status «Αναμονή πελάτη».

## Αποφάσεις (brainstorming)

- Κατηγορίες: **μόνο KB/help center** — το `TicketCategory` enum των tickets μένει ως έχει.
- Attachments: **μόνο εικόνες** (jpg/png/webp), **max 3 αρχεία × 5MB**.
- Follow-up: απάντηση reporter **στη δημόσια σελίδα /t/{token}** (όχι inbound email σε αυτή τη φάση).
- Διευκρίνιση → status **`needs_info`** («Αναμονή πελάτη»)· επαναφορά στο προηγούμενο status όταν απαντήσει.
- Μοντέλα: νέα dedicated (`HelpCategory`, `TicketAttachment`, `TicketMessage`) — όχι overload των TicketEvent/Attachment/comments.

## 1. Schema

```prisma
model HelpCategory {
  id        String   @id @default(cuid())
  name      String   @unique
  slug      String   @unique
  sourceId  String?          // προαιρετική δέσμευση σε πηγή
  createdAt DateTime @default(now())
  entries   KnowledgeEntry[]
}

// KnowledgeEntry: + helpCategoryId String?  (relation HelpCategory, SetNull)
//                 το παλιό `category` enum παραμένει (συμβατότητα με tickets)

model TicketAttachment {
  id        String   @id @default(cuid())
  ticketId  String
  name      String            // original filename (sanitized, μόνο για εμφάνιση)
  size      Int
  mimeType  String
  url       String   @db.Text // Bunny CDN URL
  createdAt DateTime @default(now())
  ticket    Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@index([ticketId])
}

model TicketMessage {
  id        String   @id @default(cuid())
  ticketId  String
  direction String            // 'outbound' (ομάδα→πελάτης) | 'inbound' (πελάτης→ομάδα)
  body      String   @db.Text // plain text, ≤3000
  authorId  String?           // User id για outbound, null για inbound
  createdAt DateTime @default(now())
  ticket    Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@index([ticketId, createdAt])
}

// TicketStatus enum: + needs_info
// Ticket: + statusBeforeInfo TicketStatus?  (για επαναφορά μετά την απάντηση)
```

Migration με το γνωστό workaround (`prisma migrate diff --from-url` / hand-written SQL — shadow DB σπασμένο).

## 2. Δυναμικές κατηγορίες KB (AI-assisted)

- `generateKbDraft`: το prompt περιλαμβάνει τη λίστα υπαρχουσών `HelpCategory`
  (id + name). Το JSON output αποκτά
  `"helpCategory": {"existingId": string} | {"newName": string}`.
- Το draft αποθηκεύει την πρόταση στο payload του `kb_draft` event.
- **Η κατηγορία δημιουργείται μόνο στο approve**: στο KB form ο triager βλέπει
  την πρόταση προσυμπληρωμένη (dropdown υπαρχουσών + free text «νέα κατηγορία»)·
  στο `saveKnowledgeEntry`/`createKnowledgeEntry`/`updateKnowledgeEntry` αν δοθεί
  νέο όνομα → `HelpCategory.create` (name unique, slug από `slugify`, upsert-like:
  αν υπάρχει ίδιο name γίνεται reuse).
- Το help center ομαδοποιεί ανά `HelpCategory.name` (fallback «Γενικά» για
  εγγραφές χωρίς helpCategory). Το `/knowledge` αποκτά φίλτρο helpCategory και
  απλή διαχείριση κατηγοριών (λίστα, μετονομασία, διαγραφή → SetNull).

## 3. Attachments στη φόρμα → Bunny CDN → task

### Υποβολή (public API)
- Το `POST /api/tickets` δέχεται ΚΑΙ `multipart/form-data`: πεδία κειμένου όπως
  σήμερα + `files[]` (≤3). Το JSON path παραμένει αναλλοίωτο (συμβατότητα).
- Έλεγχοι ανά αρχείο: MIME ∈ {image/jpeg, image/png, image/webp}, size ≤5MB,
  **magic-bytes sniffing** (JPEG FF D8 FF, PNG 89 50 4E 47, WEBP RIFF....WEBP) —
  όχι εμπιστοσύνη στο δηλωμένο content-type/extension. Συνολικό όριο 15MB.
- Αποθήκευση: `uploadFileToCDN` (υπάρχον `lib/bunnycdn.ts`) σε φάκελο
  `tickets/{ticketCode}/` με **τυχαίο όνομα** (`cuid + σωστό extension`) — ποτέ
  user-controlled path. `TicketAttachment` row ανά αρχείο.
- Σφάλμα upload σε ≥1 αρχείο → το ticket δημιουργείται κανονικά χωρίς το αρχείο
  (best-effort, καταγραφή σε TicketEvent note) — η υποβολή δεν χάνεται ποτέ.

### Μεταφορά σε task/project
- `convertTicketToTask`: για κάθε `TicketAttachment` δημιουργείται `Attachment`
  row με `taskId`, `projectId`, `uploadedById = actor (triager)`, `source: local`,
  ίδιο url (δεν ξανανεβαίνει στο CDN). Τα αρχεία φαίνονται κανονικά σε task & project.

### Εμφάνιση
- Σελίδα ticket: thumbnails/λίστα με link.
- `/t/{token}`: τα αρχεία του reporter ορατά στη δημόσια σελίδα.
- INTEGRATION.md: νέο παράδειγμα φόρμας με `<input type="file" multiple>` και
  multipart proxy route.

## 4. Follow-up διευκρινίσεων

### Ομάδα → πελάτης
- Κουμπί «Ζητήστε διευκρίνιση» στη σελίδα ticket **και** στο task detail (όταν
  το task προέρχεται από ticket): textarea → server action `requestClarification`
  (επιτρεπτό σε κάθε μέλος ομάδας, όχι customer):
  `TicketMessage(outbound, authorId)`, `statusBeforeInfo = τρέχον status`,
  status → `needs_info`, `TicketEvent(clarification_requested)`, email στον
  reporter με το μήνυμα + link `/t/{token}`.

### Πελάτης → ομάδα
- Στο `/t/{token}`: το νήμα μηνυμάτων + φόρμα απάντησης όταν status
  `needs_info` (ή γενικά ανοιχτό ticket ≠ closed/rejected).
- `POST /api/tickets/[code]/reply` με `?token=` (ίδιο auth pattern με το GET
  status): body ≤3000 chars plain text, rate limit 10/ώρα ανά ticket.
  Δημιουργεί `TicketMessage(inbound)`, status → `statusBeforeInfo ?? converted`
  (μόνο αν ήταν needs_info), `TicketEvent(reporter_replied)`, in-app
  notification στην ομάδα (assignees του task ή triagers) — μέσω του υπάρχοντος
  notification μηχανισμού.

### Εμφάνιση νήματος
- Σελίδα ticket: πλήρες νήμα (outbound δεξιά/inbound αριστερά, χρονολογικά).
- Task detail: read-only section «Επικοινωνία με πελάτη» όταν υπάρχει ticket.
- `/t/{token}`: το νήμα χωρίς εσωτερικά στοιχεία (ονόματα ομάδας → «Η ομάδα»).

### Status labels
- `needs_info`: δημόσιο «Αναμονή απάντησής σας», εσωτερικό «Αναμονή πελάτη».
- Το triage/λίστα tickets δείχνει badge για needs_info.

## 5. Ασφάλεια

- Public reply/upload: token auth, όρια μεγέθους/πλήθους, rate limits, plain
  text μόνο (καμία HTML απόδοση των μηνυμάτων πελάτη).
- Magic-bytes validation στα uploads· τυχαία ονόματα στο CDN· ο φάκελος του
  storage zone δεν κάνει list.
- Το AI δεν δημιουργεί κατηγορίες αυτόνομα — πάντα μέσω ανθρώπινου approve.
- Emails: το μήνυμα διευκρίνισης περνά από escape πριν μπει στο HTML template.

## 6. Testing

- Unit: magic-bytes sniffer, status επαναφορά (needs_info → statusBeforeInfo).
- CLI: επέκταση smoke test για requestClarification/reply κύκλο.
- Χειροκίνητο E2E: υποβολή με 3 εικόνες → CDN URLs → convert → αρχεία στο task →
  «Ζητήστε διευκρίνιση» από το task → email → απάντηση στο /t → status
  επαναφορά + notification → KB draft με πρόταση νέας κατηγορίας → approve →
  νέα κατηγορία στο help center.

## Εκτός scope (v1)

- Inbound email replies (Mailgun routing) — επόμενη φάση.
- Attachments στα follow-up μηνύματα (μόνο στην αρχική υποβολή).
- Auto-merge/συγχώνευση κατηγοριών με AI.
- Εικόνες σε KB άρθρα.
