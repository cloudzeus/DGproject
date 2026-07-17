# Dashboard v2 — Design Spec

**Ημερομηνία:** 2026-07-17 · **Κατάσταση:** Εγκεκριμένη κατεύθυνση, προς plan

## Αρχή

Τα reports απαντούν «πώς πάμε;»· το dashboard απαντά **«τι πρέπει να κάνω τώρα;»**. Κάθε στοιχείο είναι ενέργεια ή ειδοποίηση με 1-κλικ δράση. Ό,τι δεν περνά το τεστ κόβεται (π.χ. «Ομάδα: 15»).

## Layout

Header + **Quick Actions bar** πάνω· κύρια στήλη (Ζώνες 1–2, ~2/3 πλάτος) + δεξιά στήλη (Ζώνες 4–5, ~1/3) σε lg+· κάθετη στοίβαξη σε mobile. Fluent 2 tokens όπως όλο το app, κάρτες radius 8px, shadow-fluent-2.

## Ζώνη 0 — Quick Actions + ⌘K

Sticky σειρά κάτω από το header: `+ Task` (BoardTaskModal create) · `+ Έργο` (ProjectModal) · `✉ Νέο email` (EmailComposerModal με project selector) · `+ KB άρθρο` (link /knowledge/new) · `Εισαγωγή από Outlook` (project selector → EmailImportModal). Όλα τα modals ΥΠΑΡΧΟΥΝ — μόνο wiring.
**⌘K command palette**: αναζήτηση projects/tasks/tickets (τίτλος/κωδικός) + οι παραπάνω ενέργειες. Custom lightweight (input + fuzzy filter σε server-fetched index των ~200 ονομάτων), όχι νέο dependency.

## Ζώνη 1 — «Χρειάζονται εσένα» (Attention Inbox)

Ενιαία λίστα, ταξινομημένη κατά προτεραιότητα/ηλικία, ΜΟΝΟ όσα αφορούν τον χρήστη:

| Πηγή | Ποιοι | Inline ενέργεια |
|---|---|---|
| Tickets new/analyzing (χωρίς triage, με ηλικία) | admin/manager | «Άνοιγμα» → /tickets/{id} |
| Tickets needs_info με νέα απάντηση πελάτη (event answer μετά το τελευταίο δικό μας) | admin/manager | «Απάντηση» |
| Tasks σε review που περιμένουν έγκρισή μου (approver/owner) | approver | «Έγκριση» (inline updateTaskStatus→done) |
| Ολοκληρωμένα tasks από ticket ΧΩΡΙΣ resolutionSummary | ο assignee/όλοι οι triagers | «Γράψε λύση» (ResolutionDialog inline) |
| KB drafts προς έγκριση (resolved tickets με kb_draft χωρίς entry) | admin/manager | «Έλεγχος» → /tickets/{id} |
| Ερωτήσεις tasks προς εμένα (αναπάντητες TaskQuestion) | ο ερωτώμενος | «Απάντηση» → board?task= |
| Meeting-generated tasks με meetingNeedsReview | admin/manager | «Έλεγχος» → board?task= |

Κάθε γραμμή: icon ανά τύπο, τίτλος, ηλικία με κλιμάκωση (ήσυχο <4h, amber <24h, κόκκινο ≥24h — icon+κείμενο, όχι μόνο χρώμα). Empty state: «Όλα καθαρά 🎉». Max 15 με «Προβολή όλων» ανά κατηγορία.

## Ζώνη 2 — Η μέρα μου

- **Σήμερα & αύριο**: δικά μου tasks με dueDate σήμερα/αύριο + meetings ημέρας (MeetingNote/DiscoveredMeeting) σε χρονολογική mini-λίστα.
- **Σε εξέλιξη τώρα**: τα in_progress μου με ζωντανό tracked χρόνο (`inProgressAccumulatedMs` + τρέχον διάστημα, live tick ανά λεπτό client-side) και κουμπί «Ολοκλήρωση» → status done → resolution dialog αν είναι από ticket.
- **Εκπρόθεσμα δικά μου**: κόκκινες γραμμές με ημέρες καθυστέρησης.

## Ζώνη 3 — Χωρητικότητα ομάδας (admin/manager) ⭐

Βασισμένο στο υπάρχον `getUserLoads` (lib/task-scheduling):

- Πίνακας/κάρτες ανά χρήστη (employees): **utilization bar** `busyHoursNext5Days / 47.5h` με ζώνες (πράσινο <70%, amber 70–95%, κόκκινο >95%), open tasks, εκπρόθεσμα, **«Ελεύθερος: Δευ 09:00»** (nextFreeSlot, «Τώρα» αν άμεσα διαθέσιμος).
- Ταξινόμηση: πιο διαθέσιμος πρώτος (για γρήγορη ανάθεση) με toggle «κατά φόρτο».
- Κουμπί **«Ανάθεση»** ανά χρήστη → BoardTaskModal create με προεπιλεγμένο assignee + startDate=nextFreeSlot.
- Σύνολο ομάδας: aggregate bar + «X άτομα διαθέσιμα σήμερα».
- Ο υπολογισμός γίνεται server-side μία φορά ανά load· «Ανανέωση» χειροκίνητα.

## Ζώνη 4 — Ραντάρ προθεσμιών (7 ημέρες)

Οριζόντια λωρίδα Δευ–Κυρ (τρέχουσα εβδομάδα + επόμενες ημέρες): κουκκίδες/chips ανά ημέρα για due tasks (χρώμα project) και project deadlines (⚑). Κλικ σε ημέρα → expand λίστα ημέρας. Δίνει τη «θερμότητα» της εβδομάδας με μια ματιά — όχι πλήρες Gantt (υπάρχει /timeline).

## Ζώνη 5 — Παλμός (δεξιά στήλη)

- 4 KPI micro-tiles (reuse `KpiTile` από reports, περίοδος 7d σταθερή): ανοιχτά tickets, ολοκληρώσεις εβδομάδας, εκπρόθεσμα συνολικά, μέσος χρόνος επίλυσης. Κλικ → αντίστοιχο tab /reports.
- **Email pending**: εισερχόμενα EmailMessage status=pending/analyzed (προς εφαρμογή) με link στο project Email tab.
- Activity feed: φιλτραρισμένο στα projects μου, ομαδοποιημένο ανά ημέρα, max 12.
- «Θερμά» projects: top 3 κατά πρόσφατη δραστηριότητα, mini progress + link.

## Ρόλοι

- admin/manager: όλα.
- member: χωρίς Ζώνη 3, Ζώνη 1 χωρίς tickets/KB γραμμές, KPIs μόνο tasks.
- customer: εκτός scope (redirect όπως σήμερα ή μελλοντική δική του όψη).

## Data / Performance

- Ένα server component `page.tsx` συνθέτει όλα τα δεδομένα με `Promise.all` σε αρθρωτά builders `lib/dashboard/*.ts` (attention.ts, my-day.ts, capacity.ts, radar.ts, pulse.ts) — JSON-safe έξοδοι όπως στα reports.
- Στόχος: ≤10 queries συνολικά, όλα indexed paths. Live μόνο το χρονόμετρο (client tick, όχι polling).
- ⌘K index: ελαφρύ endpoint `/api/search-index` (id, τίτλος, τύπος, url) cached 60s.

## Κόβονται

Στατικά counts χωρίς δράση, πλήρης λίστα projects, «Ομάδα: N». Το drag-reorder των καρτών του παλιού dashboard αντικαθίσταται από το σταθερό zoning (λιγότερη συντήρηση, προβλέψιμη ιεραρχία).

## Testing

- Unit: builders με ψεύτικα rows (καθαρές συναρτήσεις όπου γίνεται), smoke script `scripts/test-dashboard.ts` που χτίζει όλα τα zones με πραγματική DB.
- Οπτικός έλεγχος σε admin + member ρόλο, στενό/φαρδύ viewport.

## Φάσεις

1. Ζώνες 0+1 (Quick Actions, ⌘K, Attention) — αλλάζουν την καθημερινή χρήση.
2. Ζώνες 2+3 (Μέρα μου με live timers, Χωρητικότητα).
3. Ζώνες 4+5 (Ραντάρ, Παλμός).
