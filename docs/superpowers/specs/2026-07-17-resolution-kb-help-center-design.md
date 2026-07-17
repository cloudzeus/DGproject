# Λύση από τον resolver, AI polish & Knowledge Base με δημόσιο Help Center

**Ημερομηνία:** 2026-07-17 · **Κατάσταση:** Εγκεκριμένο design
**Βασίζεται στο:** [2026-07-17-ticketing-system-design.md](2026-07-17-ticketing-system-design.md)

## Στόχος

Όταν ολοκληρώνεται task συνδεδεμένο με ticket, ο resolver καταγράφει τη λύση με
τα δικά του λόγια, τη βελτιώνει προαιρετικά με AI, και η γνώση καταλήγει σε ένα
Knowledge Base με εσωτερική όψη (`/knowledge`) και δημόσιο help center ανά πηγή
(`/help/{sourceCode}`). Τα emails προς τον reporter αναφέρουν τον χρόνο επίλυσης.

## Αποφάσεις (από brainstorming)

- **Ροή λύσης:** prompt (dialog) τη στιγμή της ολοκλήρωσης — μη μπλοκάρον· η
  λύση μπορεί να γραφτεί και αργότερα από τη σελίδα του ticket.
- **Έκταση KB:** εσωτερικό KB + δημόσιο help center, **ανά πηγή**, με ρητή
  έγκριση δημοσίευσης από admin. Υποστηρίζονται και χειροκίνητες εγγραφές
  (γνώση εκτός tickets).
- **Αναζήτηση v1:** full-text (LIKE/FULLTEXT) — όχι RAG/AI chat σε αυτή τη φάση.
- **Αρχιτεκτονική:** η λύση του resolver τροφοδοτεί το **υπάρχον** kb_draft
  flow· ο triager/admin παραμένει το gate έγκρισης (προσέγγιση Α).

## 1. Καταγραφή λύσης στην ολοκλήρωση

- Όταν task με συνδεδεμένο ticket μαρκάρεται `done` (από όποιο σημείο του UI
  αλλάζει status), ανοίγει dialog «Περιγράψτε τη λύση»:
  - Textarea (≤4000 χαρ.) για ελεύθερο κείμενο.
  - Κουμπί **«Βελτίωση με AI»** → server action `polishSolution` → DeepSeek
    ξαναγράφει το κείμενο καθαρά στα Ελληνικά. Ο χρήστης βλέπει το αποτέλεσμα,
    το επεξεργάζεται ελεύθερα ή επαναφέρει το αρχικό του (κρατάμε και τα δύο
    στο client state).
  - «Αποθήκευση» / «Παράλειψη» — η αλλαγή status **δεν εξαρτάται** από το dialog.
- Αν παραλειφθεί: στη σελίδα του ticket εμφανίζεται section «Λύση» με το ίδιο
  form (ορατό όταν το ticket είναι `resolved`/`converted` με task done και δεν
  έχει ήδη λύση).
- Αποθήκευση: `Ticket.resolutionSummary` + `TicketEvent(type: 'resolution_written', actorId)`.
  Επιτρεπτό σε κάθε αυθεντικοποιημένο μέλος (όχι μόνο triager) — ο resolver
  συνήθως δεν είναι triager.

### AI polish (`polishSolution`)

- Input: ελεύθερο κείμενο + ticketId (για context: subject, aiDescription).
- Prompt: τεχνικός συντάκτης, κρατά ΟΛΑ τα τεχνικά δεδομένα, δεν εφευρίσκει
  βήματα, μασκάρει emails/τηλέφωνα (ίδιο `mask()` με `kb.ts` — εξάγεται σε
  κοινό helper `lib/tickets/mask.ts`).
- Rate limit: 20/ώρα ανά χρήστη μέσω του υπάρχοντος `checkRateLimit`.
- Αποτυχία → επιστρέφεται σφάλμα, το αρχικό κείμενο δεν χάνεται ποτέ.

## 2. KB draft με τη λύση του ανθρώπου

- Το `generateKbDraft` προσθέτει block «ΛΥΣΗ ΑΠΟ ΤΟΝ ΤΕΧΝΙΚΟ» (πριν από τα
  σχόλια) και το prompt ορίζει ότι αυτή είναι η κύρια πηγή για το πεδίο
  `solution`· τα σχόλια είναι συμπληρωματικά.
- Το draft πυροδοτείται ήδη στο `done` (propagate.ts). Επειδή η λύση συνήθως
  γράφεται λίγο μετά: **κάθε αποθήκευση λύσης ξαναπαράγει το draft**
  (fire-and-forget), εκτός αν το ticket έχει ήδη εγκεκριμένο `KnowledgeEntry`.
  Το νεότερο `TicketEvent(kb_draft)` υπερισχύει (η σελίδα ticket διαβάζει ήδη
  το τελευταίο).

## 3. Schema

```prisma
// Ticket
resolutionSummary String? @db.Text

// KnowledgeEntry — νέα πεδία
isPublic  Boolean  @default(false)
slug      String?  @unique          // μόνο για δημόσιες εγγραφές
sourceId  String?                   // TicketSource για ομαδοποίηση στο help center
updatedAt DateTime @updatedAt
@@index([sourceId, isPublic])
```

- Το `saveKnowledgeEntry` συμπληρώνει `sourceId` από το ticket.
- Migration με το ίδιο `prisma migrate diff` workaround (shadow DB θέμα).

## 4. Εσωτερικό KB — `/knowledge`

- Λίστα εγγραφών: αναζήτηση full-text σε title/problem/solution/tags, φίλτρα
  project/κατηγορία/πηγή/δημόσιο, ταξινόμηση κατά createdAt.
- Σελίδα εγγραφής `/knowledge/{id}`: προβολή + επεξεργασία (title, problem,
  solution, tags, category, sourceId), toggle **«Δημόσιο»** (παράγει slug από
  τον τίτλο — ελληνικός τίτλος → transliterated slug, μοναδικός).
- «Νέα εγγραφή»: χειροκίνητη δημιουργία χωρίς ticket (ticketId null).
- Δικαιώματα: όλα τα μέλη διαβάζουν· triager/admin (υπάρχον `requireTriager`)
  δημιουργεί/επεξεργάζεται/δημοσιεύει.
- Sidebar link «Γνωσιακή βάση».

## 5. Δημόσιο help center — `/help/{sourceCode}`

- Public route (εξαίρεση στο middleware, όπως το `/t/`).
- `/help/{sourceCode}`: λίστα δημόσιων εγγραφών της πηγής, ομαδοποίηση ανά
  κατηγορία, search box (server-side full-text στις public εγγραφές της πηγής).
- `/help/{sourceCode}/{slug}`: σελίδα άρθρου (τίτλος, πρόβλημα, λύση) στα
  Ελληνικά, χωρίς στοιχεία ομάδας/πελατών.
- Άγνωστο sourceCode ή ανενεργή πηγή → 404. Καμία εγγραφή με `isPublic=false`
  δεν εκτίθεται ποτέ.
- Το status page `/t/{token}` και τα emails μπορούν να δείχνουν link στο help
  center της πηγής (nice-to-have, μία γραμμή).

## 6. Χρόνος επίλυσης στα emails

- Helper `formatDuration(from, to)` → «2 ημέρες 4 ώρες» / «3 ώρες 20 λεπτά» /
  «45 λεπτά» (δύο μεγαλύτερες μονάδες, ελληνικά).
- Προστίθεται γραμμή «Χρόνος επίλυσης: …» στο `sendTicketResolvedEmail`
  (createdAt → resolvedAt) και στο email κλεισίματος από το
  `saveKnowledgeEntry` (createdAt → resolvedAt· fallback σε now αν λείπει).

## 7. Σφάλματα & ασφάλεια

- AI polish: σφάλμα δικτύου/DeepSeek → μήνυμα στο dialog, το κείμενο μένει.
- Regenerate draft: fire-and-forget με catch/log (όπως σήμερα).
- Δημόσιες σελίδες: μόνο `isPublic=true` + έγκυρη πηγή· PII μασκαρισμένο ήδη
  στο draft και ελεγμένο από άνθρωπο πριν τη δημοσίευση.
- Slug collision → επίθημα `-2`, `-3`.

## 8. Testing

- Unit: `formatDuration`, slug generation.
- CLI: επέκταση του υπάρχοντος triage test script με polish + regenerate flow.
- Χειροκίνητο E2E: ολοκλήρωση task → dialog → AI polish → αποθήκευση →
  νέο draft → έγκριση + δημοσίευση → εμφάνιση στο `/help/{source}` →
  email με χρόνο επίλυσης.

## Εκτός scope (v1)

- RAG / AI chat πάνω στη γνώση (εσωτερικά ή δημόσια).
- Deflection στη φόρμα υποβολής («μήπως σας λύνει αυτό το άρθρο;»).
- Πολυγλωσσία help center.
- Versioning / ιστορικό εγγραφών KB.
