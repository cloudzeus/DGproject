# Αναλυτικές Αναφορές (Reports v2) — Design Spec

**Ημερομηνία:** 2026-07-17
**Κατάσταση:** Εγκεκριμένο σχέδιο, προς implementation plan

## Στόχος

Το υπάρχον `/reports` δείχνει μόνο snapshot σύνολα και δύο πίνακες (projects, χρήστες). Η διοίκηση (admin/manager) χρειάζεται αναλυτικές αναφορές με χρονική διάσταση για tasks, projects, tickets και χρήστες: trends, συγκρίσεις περιόδων, χρόνους απόκρισης/επίλυσης, απόδοση βάσει time tracking.

**Κοινό:** κυρίως διοίκηση. Τα απλά μέλη βλέπουν μόνο τα δικά τους projects (όπως σήμερα)· τα tabs «Χρήστες» και τα reporter analytics είναι μόνο για admin/manager.

## Αρχιτεκτονική

**Προσέγγιση:** on-the-fly aggregation (χωρίς snapshots/cron). Όλα τα ζητούμενα metrics ανακατασκευάζονται από υπάρχοντα δεδομένα: `Task.createdAt/completedAt/inProgressAccumulatedMs/estimatedHours`, `Ticket.createdAt/resolvedAt`, `TicketEvent` timeline. Κανένα schema change, καμία migration.

### Δομή κώδικα

Το `lib/reports.ts` γίνεται φάκελος `lib/reports/`:

| Αρχείο | Ρόλος |
|---|---|
| `shared.ts` | Τύποι, period helpers (`resolveRange`, `prevRange`), labels (τα υπάρχοντα `STATUS_LABELS_EL` κ.λπ. μεταφέρονται εδώ), serializers (BigInt→ώρες) |
| `overview.ts` | `buildOverviewReport(opts)` |
| `projects.ts` | `buildProjectsReport(opts)` |
| `tasks.ts` | `buildTasksReport(opts)` |
| `tickets.ts` | `buildTicketsReport(opts)` |
| `users.ts` | `buildUsersReport(opts)` |
| `chart-theme.ts` | Παλέτα charts ως ένα σημείο αλήθειας (βλ. UI/UX) |

Κοινή υπογραφή: `buildXReport({ range, prevRange, userId, isPrivileged })`. Υλοποίηση με Prisma `groupBy` + `$queryRaw` για bucketing ανά ημέρα/εβδομάδα και για χρόνους από `TicketEvent`.

### Routing & data flow

- URL-driven: `/reports?tab=tickets&period=30d` ή `&from=YYYY-MM-DD&to=YYYY-MM-DD`. Presets: `7d`, `30d`, `90d`, `mtd`, `today`.
- Το `page.tsx` (server component) διαβάζει searchParams, υπολογίζει `range` + `prevRange` (ίδια διάρκεια, ακριβώς πριν), φορτώνει **μόνο τα δεδομένα του ενεργού tab**, και τα περνά στο client component του tab.
- Αλλαγή tab/περιόδου = navigation (όχι client fetch). Skeleton μέσω `loading.tsx`.

## Tabs & Metrics

### Επισκόπηση

- KPI tiles με σύγκριση προηγούμενης περιόδου: ολοκληρωμένα tasks, νέα tickets, επιλυμένα tickets, μέσος χρόνος επίλυσης tickets, overdue τώρα (χωρίς σύγκριση — snapshot).
- Trend charts: ολοκληρώσεις tasks/ημέρα (area), εισερχόμενα vs επιλυμένα tickets/ημέρα (grouped bars).

### Projects

Πίνακας (ο υπάρχων εμπλουτισμένος) ανά project:
- Υπάρχοντα: σύνολο/done/open/overdue/dueThisWeek/completion%.
- Νέα: velocity (ολοκληρώσεις ανά εβδομάδα στην περίοδο), πραγματικές ώρες (Σ `inProgressAccumulatedMs`) vs Σ `estimatedHours`, μέσο cycle time (createdAt→completedAt των ολοκληρωμένων στην περίοδο), net flow (νέα tasks − ολοκληρώσεις στην περίοδο).

### Tasks

- Κατανομές status/priority για tasks που δημιουργήθηκαν ή ολοκληρώθηκαν στην περίοδο.
- Throughput ανά εβδομάδα (bars) + σύγκριση με προηγούμενη περίοδο.
- Κατανομή cycle time (buckets: <1μ, 1–3μ, 3–7μ, 7–14μ, >14μ).
- Aging πίνακας: top 20 παλαιότερα ανοιχτά tasks (τίτλος, project, assignees, ημέρες ανοιχτό, status) με aging badge.
- On-time %: ολοκληρώσεις με `completedAt <= dueDate` / ολοκληρώσεις με dueDate.
- Tasks από meetings: πλήθος στην περίοδο + πόσα `meetingNeedsReview`.

### Tickets

1. **Χρόνοι** (από `TicketEvent`, median + μέσος): created→analyzed (triage), created→converted, created→resolved. Trend median χρόνου επίλυσης ανά εβδομάδα.
2. **Όγκος**: ανά `TicketSource` (οριζόντια bars), ανά `aiCategory`, ανά status (100% stacked μία γραμμή), εισερχόμενα/ημέρα.
3. **Ποιότητα AI triage**: μέσο `aiConfidence` + κατανομή (buckets), ποσοστά rejected/merged/needs_info, converted με αποδεκτή πρόταση (ίδιο projectId/assignee με τα suggested) vs με διόρθωση, πλήθος `aiError`.
4. **Reporters**: top 10 reporters ανά πλήθος στην περίοδο, reporters με ≥3 tickets, πιο συχνές κατηγορίες τους — υποψήφια θέματα KB.

### Χρήστες (admin/manager μόνο)

Πίνακας ανά χρήστη:
- Υπάρχοντα: total/done/open/overdue/inProgress.
- Νέα: ολοκληρώσεις στην περίοδο (+δ vs προηγούμενη), πραγματικές ώρες (Σ tracked time των tasks του στην περίοδο), μέσο cycle time, on-time %, ενεργός φόρτος τώρα (open + in_progress), tickets που έλυσε (μέσω linked tasks που ολοκληρώθηκαν).
- Expandable row: mini trend ολοκληρώσεων + 10 πρόσφατα tasks του.

## UI/UX Προδιαγραφές

Βάση: DG design system (Fluent 2 tokens του project — `fluent-blue`, `fluent-neutral`, `shadow-fluent-*`) + μεθοδολογία dataviz skill. Το app είναι light-only.

### Layout

- Header: τίτλος + λεκτικό περιόδου («1–17 Ιουλ 2026 vs 14–30 Ιουν») αριστερά· δεξιά period picker + Export CSV (`Button` secondary, `ArrowDownload20Regular`).
- Period picker: dropdown με preset rows (Σήμερα, 7/30/90 ημέρες, Τρέχων μήνας), επιλογή με bold check 16px, hover ghost wash, custom range πίσω από hairline στο footer.
- Tabs σε Fluent pivot style: underline 2px `fluent-blue-500`, ενεργό bold, ανενεργά `text-neutral-40` με hover wash. Tab state στο URL.
- Grid σε 4px baseline· κάρτες radius 8px, two-layer shadows (`shadow-fluent-*`), ποτέ single-blur.

### KPI tiles

- Label 12px muted πάνω, τιμή 32px `text-neutral-90` (proportional figures).
- Δείκτης σύγκρισης: βέλος + ποσοστό, χρώμα βάσει **σημασίας** (περισσότερα overdue = κόκκινο ακόμη κι αν ↑), πάντα icon+κείμενο — ποτέ μόνο χρώμα. Success text σε σκούρο πράσινο text token, όχι το series green.
- Sparkline δίπλα στην τιμή όπου έχει νόημα (single series, χωρίς άξονες/legend).

### Charts (recharts + shadcn chart wrapper)

- Φόρμα ανά δουλειά: trends → line/area· σύγκριση κατηγοριών → οριζόντια bars με direct labels (όχι pies)· κατανομή status → 100% stacked μία γραμμή με 2px gaps· ροή in/out → grouped bars. **Ποτέ dual-axis** — δύο μεγέθη = δύο charts.
- Παλέτα: σταθερή αντιστοίχιση οντότητα→χρώμα σε όλη τη σελίδα (π.χ. in_progress ίδιο χρώμα παντού), παραγόμενη από τα fluent tokens και **validated με το `validate_palette.js` του dataviz skill** (light surface `#FFFFFF`) πριν κλειδώσει. Τα τελικά hex ζουν μόνο στο `lib/reports/chart-theme.ts` ως ρόλοι (series-1…n, status colors).
- Marks: γραμμές 2px, bars με 4px rounded μόνο στο ελεύθερο άκρο, gridlines hairline `neutral-10`, άξονες muted, `tabular-nums` στα ticks.
- Hover παντού: crosshair+tooltip σε line/area, per-mark tooltip σε bars· tooltip = λευκή κάρτα, hairline border, `shadow-fluent-8`.
- Legend μόνο για ≥2 σειρές· single series ονομάζεται από τον τίτλο της κάρτας.

### Πίνακες

- Sortable headers, inline micro-bars για ποσοστά (μοτίβο υπάρχοντος completion bar).
- Aging/κρισιμότητα με StatusBadge semantics (good/warning/critical βάσει ημερών), icon+κείμενο.
- Expandable rows με chevron, 150ms standard easing (`cubic-bezier(0.33,0,0.67,1)`).
- Toggle «Πίνακας» στις κάρτες trends (table view — accessibility) · το CSV export καλύπτει τον ίδιο ρόλο.

### Καταστάσεις

- Loading: skeletons (tiles/charts), όχι spinners.
- Empty: κάθε κάρτα χωρίς δεδομένα δείχνει λεκτικό empty state — όχι άδειους άξονες.
- Λίγα δεδομένα: μέσοι/median με n<5 εμφανίζουν το n («μ.ό. 4,2 ώρες · 3 tickets»).

## Export

- Κουμπί CSV ανά tab. Επέκταση του υπάρχοντος `/api/reports/export` με `?tab=...&period=...` (ή from/to) ώστε να σέβεται τα ίδια φίλτρα και δικαιώματα.
- UTF-8 με BOM για σωστά ελληνικά στο Excel.

## Edge cases

- `inProgressAccumulatedMs` (BigInt) → μετατροπή σε ώρες server-side πριν το serialization· για tasks σε in_progress προστίθεται `now − inProgressStartedAt`.
- Tickets χωρίς events / tasks χωρίς `completedAt` → εξαιρούνται από χρονικά metrics (όχι μηδενικά).
- Merged tickets: μετράνε στον όγκο, εξαιρούνται από χρόνους επίλυσης.
- Custom range: max 366 ημέρες· invalid params → fallback σε 30d.
- Χρήστες χωρίς tasks στην περίοδο εμφανίζονται με μηδενικά (όχι κρυμμένοι), ταξινόμηση κατά open desc όπως σήμερα.

## Testing & verification

- Unit tests στους καθαρούς aggregation/period helpers του `shared.ts` (bucketing, prevRange, cycle time, on-time %).
- Smoke test script που χτίζει και τα 5 reports με πραγματική DB (μοτίβο υπαρχόντων `scripts/test-*.ts`).
- Οπτικός έλεγχος: render + screenshot κάθε tab (label collisions, overflow, empty states) πριν κλείσει η υλοποίηση.
- Palette validation: το `validate_palette.js` πρέπει να περνά πριν κλειδώσουν τα chart hex.

## Εκτός scope (μελλοντικά)

- PDF export με γραφήματα.
- Ιστορικά snapshots (π.χ. ημερήσιο πλήθος overdue «όπως ήταν τότε») — αν χρειαστεί, υβριδικό μοντέλο με cron.
- Αναφορές προς πελάτες.
