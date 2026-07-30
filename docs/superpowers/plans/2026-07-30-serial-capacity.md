# Σειριακή χωρητικότητα χρηστών — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ή executing-plans.

**Goal:** Ο χρόνος κάθε χρήστη να υπολογίζεται σειριακά και **σε όλα τα έργα μαζί**, ώστε όταν ανατίθεται εργασία να φαίνεται πότε μπορεί πραγματικά να ξεκινήσει.

**Architecture:** Αντικατάσταση του calendar-span occupancy με **ουρά κόπου ανά χρήστη**. Κάθε εργασία καταναλώνει `estimatedHours` από τη χωρητικότητα εργάσιμων ωρών· η διαθεσιμότητα είναι το σημείο όπου αδειάζει η ουρά, όχι ένα ημερολογιακό κενό.

**Tech Stack:** Prisma/MySQL (**shadow DB σπασμένο** → `migrate diff` + `db execute` + `migrate resolve`, **πάντα αφαίρεσε τα `DROP INDEX` για τα FULLTEXT**), `lib/business-hours.ts` (υπάρχον), tests με `node:test`.

---

## Διάγνωση — τι ακριβώς δεν δουλεύει σήμερα

Το `lib/task-scheduling.ts` **είναι ήδη cross-project** (φιλτράρει μόνο σε `project.status != archived`). Το πρόβλημα δεν είναι το εύρος, είναι η μέτρηση. Τρία ελαττώματα, μετρημένα σε ζωντανά δεδομένα (21 ανοιχτές ανατεθειμένες εργασίες):

| # | Ελάττωμα | Απόδειξη |
|---|---|---|
| 1 | `if (!t.startDate \|\| !t.dueDate) continue` — οι αδήλωτες εργασίες είναι αόρατες | **10/21** χωρίς ημερομηνίες |
| 2 | Το `estimatedHours` επιλέγεται στο query αλλά **δεν χρησιμοποιείται ποτέ**· το occupancy χτίζεται από το ημερολογιακό span | **17/21** χωρίς εκτίμηση· εργασία 2ωρών με προθεσμία 2 εβδομάδων δεσμεύει 2 εβδομάδες |
| 3 | `latestEndFor` επιστρέφει το **τελευταίο τέλος**, όχι το **άθροισμα** κόπου | δύο 3ωρες εργασίες την ίδια μέρα δεν κάνουν 6 ώρες — χωράνε άπειρες |

Συνέπεια: χρήστης με γεμάτη ουρά αδήλωτων εργασιών εμφανίζεται **ελεύθερος**.

**Απόφαση:** το `estimatedHours` γίνεται **υποχρεωτικό**. Χωρίς εκτίμηση κόπου κανένας σειριακός προγραμματιστής δεν μπορεί να είναι σωστός — θα μάντευε.

---

### Task 1: Ο πυρήνας — ουρά κόπου ανά χρήστη

**Files:** Create `lib/scheduling/queue.ts` + `lib/scheduling/__tests__/queue.test.ts`

Καθαρές συναρτήσεις, καμία I/O — ώστε να δοκιμάζεται ντετερμινιστικά χωρίς DB.

- [ ] **Step 1: Test πρώτα**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleQueue, type QueueItem } from '../queue'

// Δευτέρα 09:00, εργάσιμη 09:00–17:00 = 8 ώρες/ημέρα
const MON_9 = new Date('2026-08-03T09:00:00')

test('μία εργασία 3 ωρών τελειώνει στις 12:00 την ίδια μέρα', () => {
  const r = scheduleQueue([{ id: 'a', hours: 3 }], MON_9)
  assert.equal(r[0].start.getHours(), 9)
  assert.equal(r[0].end.getHours(), 12)
})

test('ο κόπος ΑΘΡΟΙΖΕΤΑΙ — δεύτερη εργασία ξεκινά όταν τελειώσει η πρώτη', () => {
  const r = scheduleQueue([{ id: 'a', hours: 3 }, { id: 'b', hours: 2 }], MON_9)
  assert.equal(r[1].start.getHours(), 12)
  assert.equal(r[1].end.getHours(), 14)
})

test('υπέρβαση ημέρας μεταφέρεται στην επόμενη εργάσιμη', () => {
  const r = scheduleQueue([{ id: 'a', hours: 6 }, { id: 'b', hours: 4 }], MON_9)
  // 6h → 15:00· υπόλοιπο 2h μέχρι 17:00, άρα 2h μένουν για Τρίτη
  assert.equal(r[1].end.getDate(), MON_9.getDate() + 1)
})

test('τα Σαββατοκύριακα προσπερνιούνται', () => {
  const FRI_15 = new Date('2026-08-07T15:00:00')
  const r = scheduleQueue([{ id: 'a', hours: 4 }], FRI_15)
  assert.equal(r[0].end.getDay(), 1) // Δευτέρα
})

test('εργασία σε εξέλιξη μετράει μόνο τον υπόλοιπο κόπο', () => {
  const r = scheduleQueue([{ id: 'a', hours: 8, consumedHours: 6 }, { id: 'b', hours: 1 }], MON_9)
  assert.equal(r[0].end.getHours(), 11) // 2h υπόλοιπο
  assert.equal(r[1].start.getHours(), 11)
})

test('κενή ουρά → διαθέσιμος τώρα', () => {
  assert.deepEqual(scheduleQueue([], MON_9), [])
})
```

- [ ] **Step 2: Υλοποίηση**

```ts
// lib/scheduling/queue.ts
import {
  BUSINESS_START_HOUR, BUSINESS_START_MINUTE,
  BUSINESS_END_HOUR, BUSINESS_END_MINUTE,
} from '../business-hours'

export type QueueItem = {
  id: string
  /** Εκτιμώμενος κόπος σε ώρες. */
  hours: number
  /** Ώρες που έχουν ήδη καταναλωθεί (in-progress). */
  consumedHours?: number
}

export type ScheduledItem = QueueItem & { start: Date; end: Date }

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

function dayCapacityMs(): number {
  const start = BUSINESS_START_HOUR * 60 + BUSINESS_START_MINUTE
  const end = BUSINESS_END_HOUR * 60 + BUSINESS_END_MINUTE
  return (end - start) * 60_000
}

function nextBusinessMoment(d: Date): Date {
  const c = new Date(d)
  const dayStart = new Date(c); dayStart.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0)
  const dayEnd = new Date(c); dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0)
  if (isWeekend(c) || c >= dayEnd) {
    do {
      c.setDate(c.getDate() + 1)
      c.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0)
    } while (isWeekend(c))
    return c
  }
  return c < dayStart ? dayStart : c
}

/**
 * Τοποθετεί τον κόπο σειριακά μέσα σε εργάσιμες ώρες.
 *
 * Η ουσία: ο χρόνος ενός ανθρώπου είναι σειριακός. Δύο εργασίες των 3 ωρών
 * είναι 6 ώρες, όχι «δύο πράγματα που τυχαίνει να λήγουν την ίδια μέρα».
 */
export function scheduleQueue(items: QueueItem[], from: Date): ScheduledItem[] {
  const out: ScheduledItem[] = []
  let cursor = nextBusinessMoment(new Date(from))

  for (const item of items) {
    let remainingMs = Math.max(0, (item.hours - (item.consumedHours ?? 0))) * 3_600_000
    const start = new Date(cursor)

    while (remainingMs > 0) {
      cursor = nextBusinessMoment(cursor)
      const dayEnd = new Date(cursor)
      dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0)
      const availableMs = dayEnd.getTime() - cursor.getTime()

      if (remainingMs <= availableMs) {
        cursor = new Date(cursor.getTime() + remainingMs)
        remainingMs = 0
      } else {
        remainingMs -= availableMs
        cursor = new Date(dayEnd.getTime() + 1)
      }
    }

    out.push({ ...item, start, end: new Date(cursor) })
  }

  return out
}

/** Πότε μπορεί να ξεκινήσει κάτι νέο: όταν αδειάσει η ουρά. */
export function queueDrainsAt(items: QueueItem[], from: Date): Date {
  const scheduled = scheduleQueue(items, from)
  return scheduled.length ? scheduled[scheduled.length - 1].end : nextBusinessMoment(new Date(from))
}

/** Συνολικός εκκρεμής κόπος σε ώρες. */
export function pendingHours(items: QueueItem[]): number {
  return items.reduce((h, i) => h + Math.max(0, i.hours - (i.consumedHours ?? 0)), 0)
}
```

- [ ] **Step 3:** `npx tsx --test lib/scheduling/__tests__/queue.test.ts` → PASS (6 tests). Commit.

---

### Task 2: Φόρτωση της ουράς από τη βάση

**Files:** Create `lib/scheduling/user-load.ts`

- [ ] **Step 1:** `getUserQueues(userIds: string[])` → `Map<userId, QueueItem[]>`.

Κρίσιμα σημεία, όλα διορθώσεις των τριών ελαττωμάτων:

- **ΚΑΜΙΑ** συνθήκη `if (!startDate || !dueDate) continue`. Οι αδήλωτες εργασίες μπαίνουν
  κανονικά στην ουρά — αυτό ήταν το ελάττωμα #1.
- Ο κόπος έρχεται από `estimatedHours`, ΟΧΙ από το span — ελάττωμα #2.
- Cross-project: `project: { status: { not: 'archived' } }`, χωρίς φίλτρο έργου.
- Σειρά ουράς: `priority desc, dueDate asc nulls last, order asc` — πρώτα το επείγον,
  μετά το επικείμενο.
- Για `in_progress`, το `consumedHours` βγαίνει από
  `inProgressAccumulatedMs + (now - inProgressStartedAt)`.
- Εργασία μοιρασμένη σε **N assignees**: ο κόπος **μοιράζεται** (`hours / N`). Αλλιώς μια
  ομαδική εργασία 8 ωρών θα δέσμευε 8 ώρες σε καθέναν — τριπλή προσμέτρηση.

- [ ] **Step 2:** `getUserAvailability(userIds)` → ανά χρήστη
      `{ pendingHours, queueLength, availableFrom, overdueCount }`.

- [ ] **Step 3:** Integration check με ζωντανά δεδομένα· commit.

---

### Task 3: Υποχρεωτικό `estimatedHours`

**Files:** Modify `app/(app)/projects/[id]/task-form.tsx`, `actions.ts`

- [ ] **Step 1:** Validation στο server action: `estimatedHours` > 0 απαιτείται σε κάθε
      δημιουργία/ενημέρωση εργασίας. Μήνυμα: «Χρειάζεται εκτίμηση ωρών για να
      προγραμματιστεί η δουλειά.»

- [ ] **Step 2:** Στη φόρμα, γρήγορες επιλογές δίπλα στο πεδίο: `1ω · 2ω · 4ω · 1 μέρα ·
      2 μέρες` (με 8ω/μέρα), συν ελεύθερη τιμή.

- [ ] **Step 3: Οι 17 υπάρχουσες εργασίες χωρίς εκτίμηση.**
      **ΜΗΝ** τους βάλεις σιωπηλά τεκμαρτή τιμή — θα έδινε ψεύτικη αίσθηση ακρίβειας.
      Αντ' αυτού: λίστα «Χρειάζονται εκτίμηση» στη σελίδα έργου και στο dashboard, με
      inline πεδίο. Στην ουρά μετρούν με 0 ώρες μέχρι να συμπληρωθούν, και το UI το λέει
      ρητά ώστε να μη διαβάζεται η πρόβλεψη ως πλήρης.

```bash
npx tsx --env-file=.env -e "
import('./lib/prisma.ts').then(async ({ prisma }) => {
  const n = await prisma.task.count({ where: { estimatedHours: null, status: { in: ['todo','in_progress','review'] } } })
  console.log('εργασίες χωρίς εκτίμηση:', n)
  await prisma.\$disconnect()
})"
```

---

### Task 4: «Πότε μπορεί να ξεκινήσει» στην ανάθεση

**Files:** Create `components/scheduling/assignee-availability.tsx`

- [ ] **Step 1:** Στον επιλογέα assignee κάθε εργασίας, δίπλα σε κάθε χρήστη:

```
Γιάννης Κοζύρης          ουρά 14ω · ξεκινά Τρί 5 Αυγ, 11:00
Μαρία Παπαδοπούλου       ελεύθερη τώρα
Νίκος Δημητρίου          ουρά 32ω · ξεκινά Πέμ 7 Αυγ  ⚠ 2 εκπρόθεσμες
```

- [ ] **Step 2:** Μετά την επιλογή, γραμμή κάτω από το πεδίο: «Με βάση τον σημερινό φόρτο
      σε **όλα** τα έργα, ο Γιάννης μπορεί να ξεκινήσει Τρί 5 Αυγ 11:00 και να τελειώσει
      Τρί 5 Αυγ 15:00.» Η λέξη «όλα» έχει σημασία — ο manager βλέπει μόνο το δικό του έργο
      και χρειάζεται να ξέρει ότι ο υπολογισμός δεν είναι τοπικός.

- [ ] **Step 3:** Προειδοποίηση όταν το `availableFrom + estimate` ξεπερνά το `dueDate`
      της εργασίας: «Η προθεσμία δεν προλαβαίνει με τον τρέχοντα φόρτο.»

---

### Task 5: Ενημέρωση των καταναλωτών

**Files:** Modify `lib/dashboard/capacity.ts`, `lib/tickets/triage.ts`, `app/(app)/tickets/*`

- [ ] **Step 1:** Το capacity zone του dashboard τρέφεται από `getUserAvailability` —
      εκκρεμείς ώρες και πρώτη διαθεσιμότητα αντί για το παλιό `busyHoursNext5Days`.

- [ ] **Step 2:** Η πρόταση αναθέτη στο ticket triage λαμβάνει υπόψη τη διαθεσιμότητα:
      με ίδια καταλληλότητα, προτείνεται ο πιο σύντομα διαθέσιμος.

- [ ] **Step 3:** Το `lib/task-scheduling.ts` γίνεται thin wrapper πάνω στο νέο module ή
      αφαιρείται. **Έλεγξε πρώτα τους καταναλωτές** — το χρησιμοποιεί και το
      `scripts/backfill-task-dates.ts`.

```bash
grep -rn "task-scheduling" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

---

### Task 6: Τελικός έλεγχος

- [ ] Όλα τα tests PASS (queue + υπάρχοντα 57)
- [ ] `npx tsc --noEmit && npm run build` καθαρά
- [ ] Χειροκίνητα: ανάθεση εργασίας σε φορτωμένο χρήστη δείχνει ρεαλιστική ημερομηνία
      έναρξης· η ίδια ημερομηνία μετακινείται όταν του ανατεθεί κάτι σε **άλλο** έργο

---

## Τι ΔΕΝ κάνει αυτό το plan

- **Άδειες / αργίες** — μόνο Σαββατοκύριακα και εργάσιμες ώρες. Χρειάζεται μοντέλο
  απουσιών, ξεχωριστά.
- **Μερική απασχόληση** — όλοι μετρούν 8 ώρες/ημέρα.
- **Εξαρτήσεις εργασιών** στον προγραμματισμό — το `TaskDependency` υπάρχει αλλά η ουρά
  δεν το λαμβάνει υπόψη· θα ήταν σωστό επόμενο βήμα.
- **Αυτόματη ανακατανομή** όταν αλλάζουν εκτιμήσεις — ο υπολογισμός είναι on-read.
