# Αναλυτικές Αναφορές (Reports v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Αντικατάσταση του basic `/reports` με 5 tabs (Επισκόπηση, Projects, Tasks, Tickets, Χρήστες), φίλτρο περιόδου με σύγκριση προηγούμενης περιόδου, trends, χρόνους επίλυσης tickets και metrics απόδοσης από time tracking.

**Architecture:** On-the-fly aggregation ανά ενεργό tab (Prisma queries + καθαρά JS aggregation helpers — καμία migration). URL-driven state (`/reports?tab=…&period=…`). Server component χτίζει τα δεδομένα του ενεργού tab και τα περνά JSON-safe σε client tab components. Recharts μόνο για time-series· HTML/SVG για bar lists, stacked bars, sparklines.

**Tech Stack:** Next.js App Router, Prisma/MySQL, recharts (νέο dep), Tailwind (υπάρχοντα fluent tokens), tsx assert scripts για tests (μοτίβο `scripts/test-*.ts` — ΔΕΝ υπάρχει vitest/jest).

**Spec:** `docs/superpowers/specs/2026-07-17-detailed-reports-design.md`

**Κλειδωμένη παλέτα charts** (validated με dataviz `validate_palette.js`, surface `#FFFFFF`, όλα PASS στις 2026-07-17):
- Task status series: backlog `#9C6A00`, todo `#0078D4`, in_progress `#D83B01`, review `#8764B8`, done `#107C10`
- Categorical slots (πηγές/κατηγορίες, max 6 μετά fold σε «Άλλο»): `#0078D4, #D83B01, #8764B8, #107C10, #C239B3, #9C6A00`
- Μονή σειρά (magnitude bars, trends μίας σειράς): `#0078D4`

**Συμβατότητα κατά τη μετάβαση:** Τα `app/api/reports/export/route.ts` και `app/api/projects/[id]/export/route.ts` κάνουν import από `@/lib/reports` (`buildReportsData`, labels). Το `lib/reports.ts` μετατρέπεται σε `lib/reports/index.ts` που συνεχίζει να εξάγει ΤΑ ΠΑΝΤΑ (παλιό `buildReportsData` + labels) μέχρι το Task 12 να μεταφέρει το export route· το παλιό `buildReportsData` διαγράφεται μόνο στο Task 13, και τα labels μένουν για πάντα στο `shared.ts`.

---

### Task 1: Μετατροπή `lib/reports.ts` σε φάκελο + `shared.ts` helpers με unit tests

**Files:**
- Create: `lib/reports/shared.ts`
- Create: `lib/reports/index.ts`
- Delete: `lib/reports.ts` (το περιεχόμενό του μοιράζεται σε index/shared)
- Create: `scripts/test-reports-helpers.ts`

- [ ] **Step 1: Δημιούργησε `lib/reports/shared.ts`**

```ts
// Καθαρά helpers + κοινοί τύποι για τα report builders. ΟΧΙ Prisma imports εδώ —
// ό,τι μπαίνει σε αυτό το αρχείο πρέπει να τρέχει και στο scripts/test-reports-helpers.ts.

export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'mtd'
export type DateRange = { from: Date; to: Date }
export type ResolvedPeriod = { range: DateRange; prev: DateRange; preset: PeriodPreset | 'custom' }

export type ReportScope = {
  range: DateRange
  prev: DateRange
  userId: string
  isPrivileged: boolean
}

const DAY = 86_400_000
const MAX_CUSTOM_DAYS = 366

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/**
 * URL params → τρέχουσα + προηγούμενη περίοδος (ίδιας διάρκειας, ακριβώς πριν).
 * Invalid/απόντα params → fallback '30d'. Custom range clamped στις 366 ημέρες.
 */
export function resolveRange(
  params: { period?: string; from?: string; to?: string },
  now: Date = new Date(),
): ResolvedPeriod {
  if (params.from && params.to) {
    const fromRaw = new Date(params.from)
    const toRaw = new Date(params.to)
    if (!Number.isNaN(fromRaw.getTime()) && !Number.isNaN(toRaw.getTime()) && toRaw >= fromRaw) {
      const to = endOfDay(toRaw)
      let from = startOfDay(fromRaw)
      if (to.getTime() - from.getTime() > MAX_CUSTOM_DAYS * DAY) {
        from = startOfDay(new Date(to.getTime() - (MAX_CUSTOM_DAYS - 1) * DAY))
      }
      const span = to.getTime() - from.getTime()
      return {
        range: { from, to },
        prev: { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) },
        preset: 'custom',
      }
    }
  }
  const preset: PeriodPreset =
    params.period === 'today' || params.period === '7d' || params.period === '90d' || params.period === 'mtd'
      ? params.period
      : '30d'
  let from: Date
  switch (preset) {
    case 'today': from = startOfDay(now); break
    case '7d': from = startOfDay(new Date(now.getTime() - 6 * DAY)); break
    case '90d': from = startOfDay(new Date(now.getTime() - 89 * DAY)); break
    case 'mtd': from = new Date(now.getFullYear(), now.getMonth(), 1); break
    default: from = startOfDay(new Date(now.getTime() - 29 * DAY))
  }
  const to = endOfDay(now)
  const span = to.getTime() - from.getTime()
  return {
    range: { from, to },
    prev: { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) },
    preset,
  }
}

/** 'YYYY-MM-DD' με τοπική ώρα (τα γραφήματα δουλεύουν σε τοπικές ημέρες). */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Όλες οι ημέρες της περιόδου, inclusive, ως keys. */
export function dayKeys(range: DateRange): string[] {
  const keys: string[] = []
  for (let t = startOfDay(range.from).getTime(); t <= range.to.getTime(); t += DAY) {
    keys.push(dayKey(new Date(t)))
  }
  return keys
}

/** Μετράει rows ανά ημέρα πάνω σε ΟΛΕΣ τις ημέρες της περιόδου (μηδενικά όπου λείπουν). */
export function bucketByDay<T>(rows: T[], getDate: (r: T) => Date, range: DateRange): { day: string; count: number }[] {
  const counts = new Map<string, number>(dayKeys(range).map((k) => [k, 0]))
  for (const r of rows) {
    const k = dayKey(getDate(r))
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].map(([day, count]) => ({ day, count }))
}

/** Δευτέρα της εβδομάδας του d, ως key 'YYYY-MM-DD'. */
export function weekKey(d: Date): string {
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // Δευτέρα=0
  x.setDate(x.getDate() - dow)
  return dayKey(x)
}

export function bucketByWeek<T>(rows: T[], getDate: (r: T) => Date, range: DateRange): { week: string; count: number }[] {
  const weeks = new Map<string, number>()
  for (const k of dayKeys(range)) {
    const w = weekKey(new Date(`${k}T12:00:00`))
    if (!weeks.has(w)) weeks.set(w, 0)
  }
  for (const r of rows) {
    const w = weekKey(getDate(r))
    if (weeks.has(w)) weeks.set(w, (weeks.get(w) ?? 0) + 1)
  }
  return [...weeks.entries()].map(([week, count]) => ({ week, count }))
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function msToHours(ms: bigint | number): number {
  return Math.round((Number(ms) / 3_600_000) * 10) / 10
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 10) / 10
}

/** % μεταβολή vs προηγούμενη περίοδο. null όταν prev=0 (δεν ορίζεται ποσοστό). */
export function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

/**
 * Συνολικός tracked χρόνος (ms) ενός task: accumulated + τρέχον ανοιχτό διάστημα
 * όσο είναι in_progress. Βλ. σχόλιο στο Task model (prisma/schema.prisma).
 */
export function trackedMs(
  t: { inProgressAccumulatedMs: bigint; inProgressStartedAt: Date | null; status: string },
  now: Date = new Date(),
): number {
  const base = Number(t.inProgressAccumulatedMs)
  if (t.status === 'in_progress' && t.inProgressStartedAt) {
    return base + Math.max(0, now.getTime() - t.inProgressStartedAt.getTime())
  }
  return base
}

/** Buckets κατανομής cycle time σε ημέρες. Σειρά σταθερή για τα charts. */
export const CYCLE_BUCKETS = ['<1μ', '1–3μ', '3–7μ', '7–14μ', '>14μ'] as const
export function cycleBucket(hours: number): (typeof CYCLE_BUCKETS)[number] {
  const d = hours / 24
  if (d < 1) return '<1μ'
  if (d < 3) return '1–3μ'
  if (d < 7) return '3–7μ'
  if (d < 14) return '7–14μ'
  return '>14μ'
}

// ─── Labels (μεταφέρθηκαν από το παλιό lib/reports.ts — ΜΗΝ αλλάξεις τιμές) ───

export const STATUS_LABELS_EL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Προς έλεγχο',
  done: 'Ολοκληρωμένο',
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
}

export const PRIORITY_LABELS_EL: Record<string, string> = {
  low: 'Χαμηλή',
  medium: 'Μεσαία',
  high: 'Υψηλή',
  urgent: 'Επείγουσα',
}

export const ROLE_LABELS_EL: Record<string, string> = {
  admin: 'Διαχειριστής',
  manager: 'Διευθυντής',
  member: 'Μέλος',
  viewer: 'Προβολή',
}

/** Λεκτικό περιόδου για τον header, π.χ. «1 Ιουλ – 17 Ιουλ 2026». */
export function rangeLabel(range: DateRange): string {
  const fmt = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
  const fmtShort = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' })
  const sameYear = range.from.getFullYear() === range.to.getFullYear()
  return `${(sameYear ? fmtShort : fmt).format(range.from)} – ${fmt.format(range.to)}`
}
```

- [ ] **Step 2: Δημιούργησε `lib/reports/index.ts`** — μεταφορά ΟΛΟΥ του υπάρχοντος `lib/reports.ts` εκτός των labels

Αντίγραψε το σημερινό περιεχόμενο του `lib/reports.ts` στο `lib/reports/index.ts` με αυτές τις αλλαγές: (α) αφαίρεσε τα τρία label consts (μεταφέρθηκαν στο shared), (β) πρόσθεσε re-exports:

```ts
import { prisma } from '@/lib/prisma';
export {
  STATUS_LABELS_EL,
  PRIORITY_LABELS_EL,
  ROLE_LABELS_EL,
} from './shared';
export * from './shared';

// … (τα υπάρχοντα ReportProjectRow, ReportUserRow, ReportsData, buildReportsData
//    ΑΥΤΟΥΣΙΑ από το παλιό lib/reports.ts — μην αλλάξεις τίποτα στη λογική τους)
```

Μετά διάγραψε το `lib/reports.ts`. Τα υπάρχοντα imports `from '@/lib/reports'` (reports-client, δύο export routes) συνεχίζουν να δουλεύουν επειδή το `@/lib/reports` resolve-άρει πλέον στο `lib/reports/index.ts`.

- [ ] **Step 3: Γράψε το test script `scripts/test-reports-helpers.ts`** (θα αποτύχει αν τα helpers έχουν λάθος λογική)

```ts
/**
 * Unit tests για τα lib/reports/shared.ts helpers.
 *   npx tsx scripts/test-reports-helpers.ts
 * Καθαρές συναρτήσεις — δεν αγγίζει DB.
 */
import assert from 'node:assert/strict'
import {
  resolveRange, dayKey, dayKeys, bucketByDay, weekKey, bucketByWeek,
  median, pctDelta, msToHours, hoursBetween, trackedMs, cycleBucket,
} from '../lib/reports/shared'

const now = new Date('2026-07-17T15:00:00')

// resolveRange: 7d = σήμερα + 6 πίσω, prev ακριβώς πριν, ίδιας διάρκειας
{
  const { range, prev, preset } = resolveRange({ period: '7d' }, now)
  assert.equal(preset, '7d')
  assert.equal(dayKey(range.from), '2026-07-11')
  assert.equal(dayKey(range.to), '2026-07-17')
  assert.equal(dayKey(prev.to), '2026-07-10')
  assert.equal(dayKey(prev.from), '2026-07-04')
}
// invalid period → 30d fallback
assert.equal(resolveRange({ period: 'bogus' }, now).preset, '30d')
// custom από params, from > to → fallback
assert.equal(resolveRange({ from: '2026-07-10', to: '2026-07-01' }, now).preset, '30d')
// custom clamp στις 366 ημέρες
{
  const { range } = resolveRange({ from: '2020-01-01', to: '2026-07-17' }, now)
  assert.ok(range.to.getTime() - range.from.getTime() <= 366 * 86_400_000)
}
// mtd
assert.equal(dayKey(resolveRange({ period: 'mtd' }, now).range.from), '2026-07-01')

// dayKeys inclusive
assert.equal(dayKeys({ from: new Date('2026-07-15T00:00:00'), to: new Date('2026-07-17T23:59:59') }).length, 3)

// bucketByDay: μηδενικά στις κενές ημέρες, αγνοεί εκτός περιόδου
{
  const range = { from: new Date('2026-07-15T00:00:00'), to: new Date('2026-07-17T23:59:59') }
  const rows = [{ d: new Date('2026-07-15T10:00:00') }, { d: new Date('2026-07-15T11:00:00') }, { d: new Date('2026-06-01T00:00:00') }]
  const out = bucketByDay(rows, (r) => r.d, range)
  assert.deepEqual(out.map((o) => o.count), [2, 0, 0])
}

// weekKey: Δευτέρα — 17 Ιουλ 2026 είναι Παρασκευή ⇒ εβδομάδα της 13ης
assert.equal(weekKey(new Date('2026-07-17T12:00:00')), '2026-07-13')
{
  const range = { from: new Date('2026-07-06T00:00:00'), to: new Date('2026-07-17T23:59:59') }
  const out = bucketByWeek([{ d: new Date('2026-07-14T09:00:00') }], (r) => r.d, range)
  assert.deepEqual(out, [{ week: '2026-07-06', count: 0 }, { week: '2026-07-13', count: 1 }])
}

assert.equal(median([]), null)
assert.equal(median([5]), 5)
assert.equal(median([1, 2, 3, 4]), 2.5)
assert.equal(pctDelta(115, 100), 15)
assert.equal(pctDelta(5, 0), null)
assert.equal(msToHours(BigInt(5_400_000)), 1.5)
assert.equal(hoursBetween(new Date('2026-07-17T10:00:00'), new Date('2026-07-17T13:30:00')), 3.5)

// trackedMs: κλειστό vs ανοιχτό διάστημα
assert.equal(trackedMs({ inProgressAccumulatedMs: BigInt(3_600_000), inProgressStartedAt: null, status: 'done' }, now), 3_600_000)
assert.equal(
  trackedMs({ inProgressAccumulatedMs: BigInt(0), inProgressStartedAt: new Date(now.getTime() - 7_200_000), status: 'in_progress' }, now),
  7_200_000,
)

assert.equal(cycleBucket(12), '<1μ')
assert.equal(cycleBucket(30), '1–3μ')
assert.equal(cycleBucket(24 * 20), '>14μ')

console.log('✅ test-reports-helpers: όλα πέρασαν')
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx scripts/test-reports-helpers.ts`
Expected: `✅ test-reports-helpers: όλα πέρασαν`

- [ ] **Step 5: Typecheck ότι οι υπάρχοντες importers δουλεύουν**

Run: `npx tsc --noEmit`
Expected: καμία διαγνωστική (τα export routes + reports-client βρίσκουν ό,τι έβρισκαν).

- [ ] **Step 6: Commit**

```bash
git add lib/reports scripts/test-reports-helpers.ts
git rm lib/reports.ts 2>/dev/null; git add -A lib
git commit -m "refactor(reports): lib/reports -> module folder + period/aggregation helpers with tests"
```

---

### Task 2: Chart theme + εγκατάσταση recharts

**Files:**
- Create: `lib/reports/chart-theme.ts`
- Modify: `package.json` (recharts)

- [ ] **Step 1: Δημιούργησε `lib/reports/chart-theme.ts`**

```ts
// Μοναδικό σημείο αλήθειας για χρώματα charts στα reports.
// Παλέτες validated με το dataviz validate_palette.js σε surface #FFFFFF
// (όλα τα checks PASS, 2026-07-17). ΜΗΝ προσθέσεις χρώμα χωρίς re-validation.

/** Σταθερή αντιστοίχιση TaskStatus → χρώμα, ίδια σε όλη τη σελίδα. */
export const STATUS_SERIES: Record<string, string> = {
  backlog: '#9C6A00',
  todo: '#0078D4',
  in_progress: '#D83B01',
  review: '#8764B8',
  done: '#107C10',
}

/** Categorical slots για πηγές/κατηγορίες. >6 σειρές ⇒ fold σε «Άλλο». */
export const CATEGORICAL = ['#0078D4', '#D83B01', '#8764B8', '#107C10', '#C239B3', '#9C6A00'] as const

/** Bars/trends μίας σειράς (magnitude) — ΠΟΤΕ εναλλαγή χρωμάτων ανά μπάρα. */
export const SINGLE_SERIES = '#0078D4'

/** Ζεύγος «εισερχόμενα vs επιλυμένα» — σταθερό παντού. */
export const FLOW = { incoming: '#D83B01', resolved: '#107C10' } as const

export const INK = {
  grid: '#E5E5E5',       // hairline gridlines
  axis: '#8A8A8A',       // axis ticks/labels
  label: '#5C5C5C',      // direct labels
} as const

/** Χρώματα δεικτών σύγκρισης — σημασιολογικά, όχι κατεύθυνσης. */
export const DELTA = { good: '#0E700E', bad: '#C50F1F', neutral: '#8A8A8A' } as const

/** Ομαδοποίηση TicketStatus για το 100% stacked bar (9 statuses → 6 σταθερές ομάδες). */
export const TICKET_STATUS_GROUPS: { key: string; label: string; statuses: string[]; color: string }[] = [
  { key: 'open', label: 'Ανοιχτά', statuses: ['new', 'analyzing'], color: CATEGORICAL[1] },
  { key: 'triaged', label: 'Ταξινομημένα', statuses: ['triaged'], color: CATEGORICAL[0] },
  { key: 'converted', label: 'Σε εργασία', statuses: ['converted'], color: CATEGORICAL[2] },
  { key: 'needs_info', label: 'Αναμονή χρήστη', statuses: ['needs_info'], color: CATEGORICAL[5] },
  { key: 'resolved', label: 'Επιλυμένα', statuses: ['resolved', 'closed'], color: CATEGORICAL[3] },
  { key: 'other', label: 'Απορ./Συγχων.', statuses: ['rejected', 'merged'], color: CATEGORICAL[4] },
]
```

- [ ] **Step 2: Εγκατάσταση recharts**

Run: `npm install recharts`
Expected: προστίθεται στο package.json χωρίς peer errors.

- [ ] **Step 3: Commit**

```bash
git add lib/reports/chart-theme.ts package.json package-lock.json
git commit -m "feat(reports): validated chart theme + recharts dependency"
```

---

### Task 3: UI primitives — KpiTile, ChartCard, HBarList, StackedBar, Sparkline

**Files:**
- Create: `components/reports/kpi-tile.tsx`
- Create: `components/reports/chart-card.tsx`
- Create: `components/reports/static-charts.tsx`

Όλα client components (`'use client'`). Ακολουθούν το Fluent 2 στυλ του project: κάρτες `bg-white rounded-xl border border-black/5 shadow-fluent-2`, radius 8px+, two-layer shadows, 4px grid.

- [ ] **Step 1: `components/reports/kpi-tile.tsx`**

```tsx
'use client';
import { ArrowUp16Filled, ArrowDown16Filled } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { DELTA, SINGLE_SERIES } from '@/lib/reports/chart-theme';

/**
 * KPI tile με προαιρετικό δείκτη σύγκρισης και sparkline.
 * `invert`: όταν η ΑΥΞΗΣΗ είναι κακό νέο (π.χ. overdue) — αντιστρέφει τα χρώματα, όχι τα βέλη.
 * `delta` null ⇒ δεν εμφανίζεται δείκτης (prev περίοδος χωρίς δεδομένα).
 */
export function KpiTile({
  label, value, unit, delta, invert = false, spark, subtitle,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  invert?: boolean;
  spark?: number[];
  subtitle?: string;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const good = showDelta && (invert ? delta! < 0 : delta! > 0);
  const deltaColor = !showDelta || delta === 0 ? DELTA.neutral : good ? DELTA.good : DELTA.bad;
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
      <p className="text-xs text-fluent-neutral-60 mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[32px] leading-9 font-semibold text-fluent-neutral-90">
          {value}
          {unit && <span className="text-sm font-normal text-fluent-neutral-60 ml-1">{unit}</span>}
        </p>
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
      <div className="mt-1.5 flex items-center gap-2 min-h-[16px]">
        {showDelta && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: deltaColor }}>
            {delta! > 0 ? <ArrowUp16Filled className="h-3 w-3" /> : delta! < 0 ? <ArrowDown16Filled className="h-3 w-3" /> : null}
            {delta === 0 ? '±0%' : `${delta! > 0 ? '+' : ''}${delta}%`}
          </span>
        )}
        {showDelta && <span className="text-[11px] text-fluent-neutral-50">vs προηγ. περίοδο</span>}
        {subtitle && <span className="text-[11px] text-fluent-neutral-50">{subtitle}</span>}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 72, h = 28, pad = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${pad + (i * (w - pad * 2)) / (data.length - 1)},${h - pad - ((v - min) / span) * (h - pad * 2)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={SINGLE_SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: `components/reports/chart-card.tsx`** — κάρτα με τίτλο, empty state, προαιρετικό table view toggle

```tsx
'use client';
import { useState } from 'react';
import { Table20Regular, DataArea20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';

/**
 * Wrapper κάθε γραφήματος: τίτλος, empty state, toggle «Γράφημα/Πίνακας».
 * `table`: rows για το table view (accessibility) — όταν λείπει δεν εμφανίζεται toggle.
 * `empty`: true ⇒ δείχνει λεκτικό αντί για άδειους άξονες.
 */
export function ChartCard({
  title, subtitle, empty, emptyText = 'Κανένα δεδομένο στην περίοδο.', table, children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  emptyText?: string;
  table?: { headers: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-fluent-neutral-90">{title}</h3>
          {subtitle && <p className="text-[11px] text-fluent-neutral-50 mt-0.5">{subtitle}</p>}
        </div>
        {table && !empty && (
          <button
            type="button"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            aria-label={view === 'chart' ? 'Προβολή πίνακα' : 'Προβολή γραφήματος'}
            title={view === 'chart' ? 'Πίνακας' : 'Γράφημα'}
            className="h-7 w-7 rounded-md text-fluent-neutral-60 hover:bg-fluent-neutral-6 flex items-center justify-center shrink-0"
          >
            {view === 'chart' ? <Table20Regular /> : <DataArea20Regular />}
          </button>
        )}
      </div>
      {empty ? (
        <p className="py-10 text-center text-sm text-fluent-neutral-50">{emptyText}</p>
      ) : view === 'table' && table ? (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-fluent-neutral-60 border-b border-black/5">
                {table.headers.map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-black/[0.03] last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className={cn('py-1.5 pr-3', j > 0 && 'tabular-nums')}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
```

- [ ] **Step 3: `components/reports/static-charts.tsx`** — HTML bar list + 100% stacked bar

```tsx
'use client';
import { INK, SINGLE_SERIES } from '@/lib/reports/chart-theme';

/**
 * Οριζόντιες μπάρες σύγκρισης κατηγοριών (αντί για pie). Μία σειρά ⇒ ένα χρώμα.
 * Direct labels: όνομα αριστερά, τιμή δεξιά — δεν χρειάζεται legend/tooltip.
 */
export function HBarList({ items, color = SINGLE_SERIES, maxItems = 8 }: {
  items: { label: string; value: number; color?: string }[];
  color?: string;
  maxItems?: number;
}) {
  const shown = items.slice(0, maxItems);
  const rest = items.slice(maxItems);
  const restSum = rest.reduce((a, b) => a + b.value, 0);
  const rows = restSum > 0 ? [...shown, { label: `Άλλο (${rest.length})`, value: restSum, color: '#8A8A8A' }] : shown;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(90px,1fr)_2fr_auto] items-center gap-2 text-xs">
          <span className="text-fluent-neutral-70 truncate" title={r.label}>{r.label}</span>
          <span className="h-4 rounded-r bg-fluent-neutral-6 overflow-hidden">
            <span
              className="block h-full rounded-r"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color, minWidth: r.value > 0 ? 3 : 0 }}
            />
          </span>
          <span className="tabular-nums font-semibold text-fluent-neutral-80 w-8 text-right">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** 100% stacked μπάρα μίας γραμμής με 2px gaps και legend από κάτω. */
export function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-5 rounded overflow-hidden gap-[2px]">
        {visible.map((s) => (
          <span key={s.label} title={`${s.label}: ${s.value}`} style={{ background: s.color, width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-fluent-neutral-70">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="tabular-nums font-semibold">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: καθαρό.

- [ ] **Step 5: Commit**

```bash
git add components/reports
git commit -m "feat(reports): KPI tile, chart card with table view, HTML bar primitives"
```

---

### Task 4: Recharts time-series components

**Files:**
- Create: `components/reports/time-charts.tsx`

- [ ] **Step 1: `components/reports/time-charts.tsx`**

```tsx
'use client';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { INK, SINGLE_SERIES, FLOW } from '@/lib/reports/chart-theme';

const fmtDay = (k: string) => {
  const d = new Date(`${k}T12:00:00`);
  return new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' }).format(d);
};

const axisProps = {
  stroke: INK.axis,
  tick: { fill: INK.axis, fontSize: 10, fontVariantNumeric: 'tabular-nums' as const },
  tickLine: false,
  axisLine: { stroke: INK.grid },
};

function VizTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white border border-black/10 shadow-fluent-8 px-3 py-2 text-xs">
      <p className="font-semibold text-fluent-neutral-90 mb-1">{label ? fmtDay(label) : ''}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-fluent-neutral-70">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="tabular-nums font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Trend μίας σειράς (area). data: [{ day:'YYYY-MM-DD', value }]. */
export function TrendArea({ data, name, color = SINGLE_SERIES, height = 200 }: {
  data: { day: string; value: number }[];
  name: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} {...axisProps} minTickGap={28} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip content={<VizTooltip />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Δύο σειρές grouped bars ανά ημέρα/εβδομάδα (π.χ. εισερχόμενα vs επιλυμένα).
 * ≥2 σειρές ⇒ legend πάντα παρόν.
 */
export function DualBars({ data, aName, bName, aColor = FLOW.incoming, bColor = FLOW.resolved, height = 200 }: {
  data: { day: string; a: number; b: number }[];
  aName: string;
  bName: string;
  aColor?: string;
  bColor?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barGap={2}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} {...axisProps} minTickGap={28} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Bar dataKey="a" name={aName} fill={aColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="b" name={bName} fill={bColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Μπάρες μίας σειράς ανά εβδομάδα (throughput). */
export function WeeklyBars({ data, name, color = SINGLE_SERIES, height = 180 }: {
  data: { week: string; count: number }[];
  name: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey="week" tickFormatter={fmtDay} {...axisProps} minTickGap={16} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Bar dataKey="count" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → καθαρό.

- [ ] **Step 3: Commit**

```bash
git add components/reports/time-charts.tsx
git commit -m "feat(reports): recharts time-series components with fluent tooltip"
```

---

### Task 5: Overview builder (`lib/reports/overview.ts`)

**Files:**
- Create: `lib/reports/overview.ts`

Όλα τα builders επιστρέφουν **JSON-safe** αντικείμενα (Dates→ISO strings, BigInt→ώρες number) ώστε να περνούν από server σε client components χωρίς serialization σφάλματα.

- [ ] **Step 1: Γράψε το builder**

```ts
import { prisma } from '@/lib/prisma'
import {
  type ReportScope, bucketByDay, pctDelta, mean, hoursBetween,
} from './shared'

export type OverviewReport = {
  kpis: {
    tasksCompleted: { value: number; delta: number | null; spark: number[] }
    ticketsNew: { value: number; delta: number | null; spark: number[] }
    ticketsResolved: { value: number; delta: number | null }
    avgResolutionHours: { value: number | null; n: number }
    overdueNow: number
  }
  taskCompletionsByDay: { day: string; value: number }[]
  ticketFlowByDay: { day: string; a: number; b: number }[] // a=εισερχόμενα, b=επιλυμένα
}

export async function buildOverviewReport(scope: ReportScope): Promise<OverviewReport> {
  const { range, prev, userId, isPrivileged } = scope
  const now = new Date()
  const projectWhere = isPrivileged
    ? {}
    : { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } }

  const [doneCur, donePrev, ticketsCur, ticketsPrev, resolvedCur, resolvedPrev, overdueNow] = await Promise.all([
    prisma.task.findMany({
      where: { ...projectWhere, completedAt: { gte: range.from, lte: range.to } },
      select: { completedAt: true },
    }),
    prisma.task.count({ where: { ...projectWhere, completedAt: { gte: prev.from, lte: prev.to } } }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true },
    }),
    prisma.ticket.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: range.from, lte: range.to }, status: { not: 'merged' } },
      select: { resolvedAt: true, createdAt: true },
    }),
    prisma.ticket.count({ where: { resolvedAt: { gte: prev.from, lte: prev.to }, status: { not: 'merged' } } }),
    prisma.task.count({
      where: { ...projectWhere, dueDate: { lt: now }, status: { not: 'done' } },
    }),
  ])

  const completionsByDay = bucketByDay(doneCur, (t) => t.completedAt!, range)
  const newByDay = bucketByDay(ticketsCur, (t) => t.createdAt, range)
  const resolvedByDay = bucketByDay(resolvedCur, (t) => t.resolvedAt!, range)

  const resolutionHours = resolvedCur.map((t) => hoursBetween(t.createdAt, t.resolvedAt!))
  const avg = mean(resolutionHours)

  return {
    kpis: {
      tasksCompleted: {
        value: doneCur.length,
        delta: pctDelta(doneCur.length, donePrev),
        spark: completionsByDay.map((d) => d.count),
      },
      ticketsNew: {
        value: ticketsCur.length,
        delta: pctDelta(ticketsCur.length, ticketsPrev),
        spark: newByDay.map((d) => d.count),
      },
      ticketsResolved: { value: resolvedCur.length, delta: pctDelta(resolvedCur.length, resolvedPrev) },
      avgResolutionHours: { value: avg === null ? null : Math.round(avg * 10) / 10, n: resolutionHours.length },
      overdueNow,
    },
    taskCompletionsByDay: completionsByDay.map((d) => ({ day: d.day, value: d.count })),
    ticketFlowByDay: newByDay.map((d, i) => ({ day: d.day, a: d.count, b: resolvedByDay[i]?.count ?? 0 })),
  }
}
```

Σημείωση spec-συμμόρφωσης: το «overdue τώρα» είναι snapshot — χωρίς delta. Merged tickets εξαιρούνται από επιλύσεις/χρόνους.

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → καθαρό.

- [ ] **Step 3: Commit**

```bash
git add lib/reports/overview.ts
git commit -m "feat(reports): overview report builder (KPIs + trends + period deltas)"
```

---

### Task 6: Σελίδα-κέλυφος — tabs, period picker, νέο page.tsx, Overview tab UI

**Files:**
- Create: `components/reports/period-picker.tsx`
- Create: `app/(app)/reports/reports-shell.tsx`
- Create: `app/(app)/reports/overview-tab.tsx`
- Create: `app/(app)/reports/loading.tsx`
- Rewrite: `app/(app)/reports/page.tsx`

- [ ] **Step 1: `components/reports/period-picker.tsx`**

Fluent dropdown με preset rows (check 16px στο επιλεγμένο, hover wash) + custom range πίσω από hairline στο footer. Αλλαγή = URL navigation (κρατά το `tab`).

```tsx
'use client';
import { useRef, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Checkmark16Filled, ChevronDown16Regular, Calendar20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import type { PeriodPreset } from '@/lib/reports/shared';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Σήμερα' },
  { id: '7d', label: 'Τελευταίες 7 ημέρες' },
  { id: '30d', label: 'Τελευταίες 30 ημέρες' },
  { id: '90d', label: 'Τελευταίες 90 ημέρες' },
  { id: 'mtd', label: 'Τρέχων μήνας' },
];

export function PeriodPicker({ preset }: { preset: PeriodPreset | 'custom' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function go(next: URLSearchParams) {
    setOpen(false);
    router.push(`/reports?${next.toString()}`);
  }
  function pick(p: PeriodPreset) {
    const next = new URLSearchParams(params.toString());
    next.set('period', p); next.delete('from'); next.delete('to');
    go(next);
  }
  function applyCustom() {
    if (!from || !to) return;
    const next = new URLSearchParams(params.toString());
    next.set('from', from); next.set('to', to); next.delete('period');
    go(next);
  }

  const current = preset === 'custom' ? 'Προσαρμοσμένη' : PRESETS.find((p) => p.id === preset)?.label ?? '';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-4 shadow-fluent-2"
      >
        <Calendar20Regular className="text-fluent-neutral-60" />
        {current}
        <ChevronDown16Regular className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-64 rounded-lg bg-white shadow-fluent-16 border border-black/5 py-1 text-sm z-50">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={preset === p.id}
              onClick={() => pick(p.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-fluent-neutral-90 hover:bg-fluent-neutral-6"
            >
              <span className="w-4">{preset === p.id && <Checkmark16Filled className="h-4 w-4 text-fluent-blue-600" />}</span>
              {p.label}
            </button>
          ))}
          <div className="mt-1 pt-2 px-3 pb-2 border-t border-black/5">
            <p className="text-[11px] font-semibold text-fluent-neutral-60 mb-1.5">Προσαρμοσμένη περίοδος</p>
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="flex-1 h-8 px-1.5 rounded border border-fluent-neutral-20 text-xs" aria-label="Από" />
              <span className="text-fluent-neutral-50">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="flex-1 h-8 px-1.5 rounded border border-fluent-neutral-20 text-xs" aria-label="Έως" />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!from || !to}
              className="mt-2 w-full h-8 rounded-md bg-fluent-blue-600 text-white text-xs font-semibold hover:bg-fluent-blue-700 disabled:opacity-40"
            >
              Εφαρμογή
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `app/(app)/reports/reports-shell.tsx`** — header + pivot tabs + export κουμπί

```tsx
'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDownload20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { PeriodPicker } from '@/components/reports/period-picker';
import type { PeriodPreset } from '@/lib/reports/shared';

export type ReportTab = 'overview' | 'projects' | 'tasks' | 'tickets' | 'users';

const TABS: { id: ReportTab; label: string; privilegedOnly?: boolean }[] = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'tickets', label: 'Tickets', privilegedOnly: true },
  { id: 'users', label: 'Χρήστες', privilegedOnly: true },
];

export function ReportsShell({
  tab, preset, periodLabel, prevLabel, isPrivileged, children,
}: {
  tab: ReportTab;
  preset: PeriodPreset | 'custom';
  periodLabel: string;
  prevLabel: string;
  isPrivileged: boolean;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const tabHref = (t: ReportTab) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    return `/reports?${next.toString()}`;
  };
  const exportHref = `/api/reports/export?${new URLSearchParams({ ...Object.fromEntries(params.entries()), tab }).toString()}`;
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Αναφορές</h1>
          <p className="text-sm text-fluent-neutral-60 mt-1">
            {periodLabel} <span className="text-fluent-neutral-40">· σύγκριση με {prevLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker preset={preset} />
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm font-medium text-fluent-neutral-80 hover:bg-fluent-neutral-4 shadow-fluent-2"
          >
            <ArrowDownload20Regular /> Εξαγωγή
          </a>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-black/5 mb-6" aria-label="Ενότητες αναφορών">
        {TABS.filter((t) => !t.privilegedOnly || isPrivileged).map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'px-3 py-2 -mb-px text-sm border-b-2 transition-colors',
              tab === t.id
                ? 'border-fluent-blue-500 font-semibold text-fluent-neutral-95'
                : 'border-transparent text-fluent-neutral-40 hover:text-fluent-neutral-70 hover:bg-fluent-neutral-4/60 rounded-t',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
```

- [ ] **Step 3: `app/(app)/reports/overview-tab.tsx`**

```tsx
'use client';
import { KpiTile } from '@/components/reports/kpi-tile';
import { ChartCard } from '@/components/reports/chart-card';
import { TrendArea, DualBars } from '@/components/reports/time-charts';
import type { OverviewReport } from '@/lib/reports/overview';

export function OverviewTab({ data }: { data: OverviewReport }) {
  const k = data.kpis;
  const flowEmpty = data.ticketFlowByDay.every((d) => d.a === 0 && d.b === 0);
  const doneEmpty = data.taskCompletionsByDay.every((d) => d.value === 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile label="Ολοκληρωμένα tasks" value={k.tasksCompleted.value} delta={k.tasksCompleted.delta} spark={k.tasksCompleted.spark} />
        <KpiTile label="Νέα tickets" value={k.ticketsNew.value} delta={k.ticketsNew.delta} invert spark={k.ticketsNew.spark} />
        <KpiTile label="Επιλυμένα tickets" value={k.ticketsResolved.value} delta={k.ticketsResolved.delta} />
        <KpiTile
          label="Μέσος χρόνος επίλυσης"
          value={k.avgResolutionHours.value ?? '—'}
          unit={k.avgResolutionHours.value !== null ? 'ώρες' : undefined}
          subtitle={k.avgResolutionHours.n > 0 && k.avgResolutionHours.n < 5 ? `μόνο ${k.avgResolutionHours.n} tickets` : undefined}
        />
        <KpiTile label="Εκπρόθεσμα τώρα" value={k.overdueNow} subtitle="snapshot" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Ολοκληρώσεις tasks ανά ημέρα"
          empty={doneEmpty}
          table={{ headers: ['Ημέρα', 'Ολοκληρώσεις'], rows: data.taskCompletionsByDay.map((d) => [d.day, d.value]) }}
        >
          <TrendArea data={data.taskCompletionsByDay} name="Ολοκληρώσεις" />
        </ChartCard>
        <ChartCard
          title="Ροή tickets ανά ημέρα"
          empty={flowEmpty}
          table={{ headers: ['Ημέρα', 'Εισερχόμενα', 'Επιλυμένα'], rows: data.ticketFlowByDay.map((d) => [d.day, d.a, d.b]) }}
        >
          <DualBars data={data.ticketFlowByDay} aName="Εισερχόμενα" bName="Επιλυμένα" />
        </ChartCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `app/(app)/reports/page.tsx`**

```tsx
import { auth } from '@/auth';
import { resolveRange, rangeLabel } from '@/lib/reports/shared';
import { buildOverviewReport } from '@/lib/reports/overview';
import { ReportsShell, type ReportTab } from './reports-shell';
import { OverviewTab } from './overview-tab';

export const dynamic = 'force-dynamic';

const VALID_TABS: ReportTab[] = ['overview', 'projects', 'tasks', 'tickets', 'users'];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const isPrivileged = session?.user?.role === 'admin' || session?.user?.role === 'manager';

  let tab: ReportTab = VALID_TABS.includes(sp.tab as ReportTab) ? (sp.tab as ReportTab) : 'overview';
  if (!isPrivileged && (tab === 'tickets' || tab === 'users')) tab = 'overview';

  const { range, prev, preset } = resolveRange(sp);
  const scope = { range, prev, userId, isPrivileged };

  // Φορτώνουμε ΜΟΝΟ το ενεργό tab — αλλαγή tab/περιόδου είναι navigation.
  let content: React.ReactNode;
  switch (tab) {
    case 'overview': {
      const data = await buildOverviewReport(scope);
      content = <OverviewTab data={data} />;
      break;
    }
    // Τα υπόλοιπα tabs προστίθενται στα Tasks 7–10 του πλάνου:
    // case 'projects': ... case 'tasks': ... case 'tickets': ... case 'users': ...
    default: {
      const data = await buildOverviewReport(scope);
      content = <OverviewTab data={data} />;
    }
  }

  return (
    <ReportsShell
      tab={tab}
      preset={preset}
      periodLabel={rangeLabel(range)}
      prevLabel={rangeLabel(prev)}
      isPrivileged={isPrivileged}
    >
      {content}
    </ReportsShell>
  );
}
```

(ΠΡΟΣΟΧΗ: το παλιό `reports-client.tsx` μένει προσωρινά στο repo αχρησιμοποίητο — διαγράφεται στο Task 13.)

- [ ] **Step 5: `app/(app)/reports/loading.tsx`** — skeletons, όχι spinners

```tsx
export default function ReportsLoading() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-pulse">
      <div className="h-8 w-44 bg-fluent-neutral-8 rounded mb-2" />
      <div className="h-4 w-72 bg-fluent-neutral-6 rounded mb-6" />
      <div className="h-9 w-full max-w-md bg-fluent-neutral-6 rounded mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
            <div className="h-3 w-20 bg-fluent-neutral-8 rounded mb-3" />
            <div className="h-8 w-16 bg-fluent-neutral-8 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 bg-white rounded-xl border border-black/5 shadow-fluent-2" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Χειροκίνητος έλεγχος**

Run: `npm run dev` (ή χρησιμοποίησε τον τρέχοντα dev server) και άνοιξε `http://localhost:3000/reports`, `/reports?period=7d`, `/reports?from=2026-06-01&to=2026-07-17`.
Expected: KPI tiles με δείκτες σύγκρισης, δύο charts με tooltips, ο picker αλλάζει URL και δεδομένα.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/\(app\)/reports components/reports/period-picker.tsx
git commit -m "feat(reports): tabbed shell, period picker with comparison, overview tab"
```

---

### Task 7: Projects tab

**Files:**
- Create: `lib/reports/projects.ts`
- Create: `app/(app)/reports/projects-tab.tsx`
- Modify: `app/(app)/reports/page.tsx` (case 'projects')

- [ ] **Step 1: `lib/reports/projects.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { type ReportScope, hoursBetween, mean, trackedMs, msToHours } from './shared'

export type ProjectReportRow = {
  id: string
  name: string
  color: string
  status: string
  ownerName: string
  memberCount: number
  total: number
  done: number
  open: number
  overdue: number
  completionPct: number
  dueDate: string | null
  // Νέα, για την περίοδο:
  completedInPeriod: number
  createdInPeriod: number
  netFlow: number // createdInPeriod - completedInPeriod (θετικό = συσσώρευση)
  velocityPerWeek: number
  trackedHours: number
  estimatedHours: number
  avgCycleHours: number | null
  cycleN: number
}

export type ProjectsReport = { rows: ProjectReportRow[] }

export async function buildProjectsReport(scope: ReportScope): Promise<ProjectsReport> {
  const { range, userId, isPrivileged } = scope
  const now = new Date()
  const where = isPrivileged ? {} : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] }
  const weeks = Math.max(1, (range.to.getTime() - range.from.getTime()) / (7 * 86_400_000))

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { name: true, email: true } },
      members: { select: { userId: true } },
      tasks: {
        select: {
          status: true, dueDate: true, createdAt: true, completedAt: true,
          estimatedHours: true, inProgressAccumulatedMs: true, inProgressStartedAt: true,
        },
      },
    },
  })

  const rows: ProjectReportRow[] = projects.map((p) => {
    const total = p.tasks.length
    const done = p.tasks.filter((t) => t.status === 'done').length
    const overdue = p.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'done').length
    const completedInPeriod = p.tasks.filter(
      (t) => t.completedAt && t.completedAt >= range.from && t.completedAt <= range.to,
    )
    const createdInPeriod = p.tasks.filter((t) => t.createdAt >= range.from && t.createdAt <= range.to).length
    const cycles = completedInPeriod.map((t) => hoursBetween(t.createdAt, t.completedAt!))
    const avgCycle = mean(cycles)
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      ownerName: p.owner.name ?? p.owner.email,
      memberCount: p.members.length,
      total,
      done,
      open: total - done,
      overdue,
      completionPct: total === 0 ? 0 : Math.round((done / total) * 100),
      dueDate: p.dueDate?.toISOString() ?? null,
      completedInPeriod: completedInPeriod.length,
      createdInPeriod,
      netFlow: createdInPeriod - completedInPeriod.length,
      velocityPerWeek: Math.round((completedInPeriod.length / weeks) * 10) / 10,
      trackedHours: msToHours(p.tasks.reduce((a, t) => a + trackedMs(t, now), 0)),
      estimatedHours: Math.round(p.tasks.reduce((a, t) => a + (t.estimatedHours ?? 0), 0) * 10) / 10,
      avgCycleHours: avgCycle === null ? null : Math.round(avgCycle * 10) / 10,
      cycleN: cycles.length,
    }
  })

  rows.sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.open - a.open)
  return { rows }
}
```

- [ ] **Step 2: `app/(app)/reports/projects-tab.tsx`** — sortable πίνακας με micro-bars

```tsx
'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowSortDown16Filled, ArrowSortUp16Filled } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { STATUS_LABELS_EL } from '@/lib/reports/shared';
import type { ProjectsReport, ProjectReportRow } from '@/lib/reports/projects';

type SortKey = 'name' | 'completedInPeriod' | 'velocityPerWeek' | 'netFlow' | 'trackedHours' | 'avgCycleHours' | 'overdue' | 'completionPct';

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Έργο' },
  { key: 'completionPct', label: 'Πρόοδος' },
  { key: 'completedInPeriod', label: 'Ολοκλ. στην περίοδο' },
  { key: 'velocityPerWeek', label: 'Velocity/εβδ.' },
  { key: 'netFlow', label: 'Net flow', title: 'Νέα tasks μείον ολοκληρώσεις στην περίοδο' },
  { key: 'trackedHours', label: 'Ώρες (πραγμ./εκτ.)' },
  { key: 'avgCycleHours', label: 'Μ.ό. cycle' },
  { key: 'overdue', label: 'Εκπρόθεσμα' },
];

export function ProjectsTab({ data }: { data: ProjectsReport }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'completedInPeriod', dir: -1 });
  const rows = useMemo(() => {
    const r = [...data.rows];
    r.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string' && typeof bv === 'string') return sort.dir * av.localeCompare(bv, 'el');
      return sort.dir * ((Number(av ?? -1)) - (Number(bv ?? -1)));
    });
    return r;
  }, [data.rows, sort]);

  if (data.rows.length === 0) {
    return <p className="py-16 text-center text-sm text-fluent-neutral-50">Κανένα έργο.</p>;
  }
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40">
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-4 py-2.5 whitespace-nowrap" title={c.title}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}
                  className="inline-flex items-center gap-1 hover:text-fluent-neutral-90"
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === -1 ? <ArrowSortDown16Filled className="h-3 w-3" /> : <ArrowSortUp16Filled className="h-3 w-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => <Row key={p.id} p={p} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ p }: { p: ProjectReportRow }) {
  return (
    <tr className="border-b border-black/[0.03] last:border-0 hover:bg-fluent-blue-50/30">
      <td className="px-4 py-3 min-w-[200px]">
        <Link href={`/projects/${p.id}`} className="flex items-center gap-2 group">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="font-medium text-fluent-neutral-90 group-hover:text-fluent-blue-600 truncate">{p.name}</span>
          <span className="text-[10px] text-fluent-neutral-50">{STATUS_LABELS_EL[p.status]}</span>
        </Link>
      </td>
      <td className="px-4 py-3 w-36">
        <div className="flex items-center gap-2">
          <span className="flex-1 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${p.completionPct}%`, background: p.color }} />
          </span>
          <span className="text-[11px] tabular-nums font-semibold w-8 text-right">{p.completionPct}%</span>
        </div>
        <span className="text-[10px] text-fluent-neutral-50 tabular-nums">{p.done}/{p.total}</span>
      </td>
      <td className="px-4 py-3 tabular-nums font-semibold">{p.completedInPeriod}</td>
      <td className="px-4 py-3 tabular-nums">{p.velocityPerWeek}</td>
      <td className={cn('px-4 py-3 tabular-nums font-semibold', p.netFlow > 0 ? 'text-fluent-accent-orange' : 'text-fluent-neutral-70')}>
        {p.netFlow > 0 ? `+${p.netFlow}` : p.netFlow}
      </td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
        {p.trackedHours}h <span className="text-fluent-neutral-50">/ {p.estimatedHours}h</span>
      </td>
      <td className="px-4 py-3 tabular-nums">
        {p.avgCycleHours === null ? '—' : `${p.avgCycleHours}h`}
        {p.cycleN > 0 && p.cycleN < 5 && <span className="text-[10px] text-fluent-neutral-50 ml-1">n={p.cycleN}</span>}
      </td>
      <td className={cn('px-4 py-3 tabular-nums', p.overdue > 0 && 'text-fluent-accent-red font-semibold')}>{p.overdue}</td>
    </tr>
  );
}
```

- [ ] **Step 3: Σύνδεση στο page.tsx** — πρόσθεσε στο switch:

```tsx
    case 'projects': {
      const data = await buildProjectsReport(scope);
      content = <ProjectsTab data={data} />;
      break;
    }
```
με imports `import { buildProjectsReport } from '@/lib/reports/projects';` και `import { ProjectsTab } from './projects-tab';`.

- [ ] **Step 4: Έλεγχος + commit**

Run: `npx tsc --noEmit` και άνοιξε `/reports?tab=projects` — sortable στήλες, velocity, ώρες.
```bash
git add lib/reports/projects.ts app/\(app\)/reports
git commit -m "feat(reports): projects tab with velocity, tracked-vs-estimated, cycle time"
```

---

### Task 8: Tasks tab

**Files:**
- Create: `lib/reports/tasks.ts`
- Create: `app/(app)/reports/tasks-tab.tsx`
- Modify: `app/(app)/reports/page.tsx` (case 'tasks')

- [ ] **Step 1: `lib/reports/tasks.ts`**

```ts
import { prisma } from '@/lib/prisma'
import {
  type ReportScope, bucketByWeek, hoursBetween, pctDelta, cycleBucket, CYCLE_BUCKETS,
} from './shared'

export type TasksReport = {
  statusBreakdown: { status: string; count: number }[]     // ανοιχτά τώρα + done στην περίοδο
  priorityBreakdown: { priority: string; count: number }[] // tasks που δημιουργήθηκαν στην περίοδο
  throughputByWeek: { week: string; count: number }[]
  throughputDelta: number | null
  cycleDistribution: { bucket: string; count: number }[]
  onTimePct: number | null
  onTimeN: number
  meetingTasks: { total: number; needsReview: number }
  aging: {
    id: string; title: string; projectId: string; projectName: string; status: string;
    daysOpen: number; assignees: string[];
  }[]
}

export async function buildTasksReport(scope: ReportScope): Promise<TasksReport> {
  const { range, prev, userId, isPrivileged } = scope
  const now = new Date()
  const projectWhere = isPrivileged
    ? {}
    : { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } }

  const [completedCur, completedPrev, createdCur, openTasks, meetingTotal, meetingReview] = await Promise.all([
    prisma.task.findMany({
      where: { ...projectWhere, completedAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, completedAt: true, dueDate: true },
    }),
    prisma.task.count({ where: { ...projectWhere, completedAt: { gte: prev.from, lte: prev.to } } }),
    prisma.task.groupBy({
      by: ['priority'],
      where: { ...projectWhere, createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { ...projectWhere, status: { not: 'done' } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, title: true, status: true, createdAt: true, projectId: true,
        project: { select: { name: true } },
        assignees: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.task.count({
      where: { ...projectWhere, generatedFromMeetingId: { not: null }, createdAt: { gte: range.from, lte: range.to } },
    }),
    prisma.task.count({
      where: { ...projectWhere, meetingNeedsReview: true, createdAt: { gte: range.from, lte: range.to } },
    }),
  ])

  // Status breakdown: ανοιχτά τώρα ανά status + done της περιόδου
  const statusCounts = new Map<string, number>([['backlog', 0], ['todo', 0], ['in_progress', 0], ['review', 0], ['done', completedCur.length]])
  for (const t of openTasks) statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1)

  const priorityOrder = ['urgent', 'high', 'medium', 'low']
  const priorityBreakdown = priorityOrder.map((p) => ({
    priority: p,
    count: createdCur.find((r) => r.priority === p)?._count._all ?? 0,
  }))

  const cycles = completedCur.map((t) => hoursBetween(t.createdAt, t.completedAt!))
  const cycleCounts = new Map<string, number>(CYCLE_BUCKETS.map((b) => [b, 0]))
  for (const h of cycles) cycleCounts.set(cycleBucket(h), (cycleCounts.get(cycleBucket(h)) ?? 0) + 1)

  const withDue = completedCur.filter((t) => t.dueDate)
  const onTime = withDue.filter((t) => t.completedAt! <= t.dueDate!)

  return {
    statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    priorityBreakdown,
    throughputByWeek: bucketByWeek(completedCur, (t) => t.completedAt!, range),
    throughputDelta: pctDelta(completedCur.length, completedPrev),
    cycleDistribution: [...cycleCounts.entries()].map(([bucket, count]) => ({ bucket, count })),
    onTimePct: withDue.length === 0 ? null : Math.round((onTime.length / withDue.length) * 100),
    onTimeN: withDue.length,
    meetingTasks: { total: meetingTotal, needsReview: meetingReview },
    aging: openTasks.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project.name,
      status: t.status,
      daysOpen: Math.floor((now.getTime() - t.createdAt.getTime()) / 86_400_000),
      assignees: t.assignees.map((a) => a.user.name ?? a.user.email),
    })),
  }
}
```

- [ ] **Step 2: `app/(app)/reports/tasks-tab.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { KpiTile } from '@/components/reports/kpi-tile';
import { ChartCard } from '@/components/reports/chart-card';
import { WeeklyBars } from '@/components/reports/time-charts';
import { HBarList, StackedBar } from '@/components/reports/static-charts';
import { STATUS_LABELS_EL, PRIORITY_LABELS_EL } from '@/lib/reports/shared';
import { STATUS_SERIES } from '@/lib/reports/chart-theme';
import { cn } from '@/lib/utils';
import type { TasksReport } from '@/lib/reports/tasks';

/** Aging semantics: <7μ ήσυχο, 7–30μ warning, >30μ critical — icon+κείμενο, όχι μόνο χρώμα. */
function agingBadge(days: number) {
  if (days > 30) return { text: `${days} ημέρες`, cls: 'bg-red-100 text-red-700', icon: '⚠' };
  if (days > 7) return { text: `${days} ημέρες`, cls: 'bg-amber-100 text-amber-800', icon: '•' };
  return { text: `${days} ημέρες`, cls: 'bg-fluent-neutral-6 text-fluent-neutral-70', icon: '' };
}

export function TasksTab({ data }: { data: TasksReport }) {
  const throughputTotal = data.throughputByWeek.reduce((a, b) => a + b.count, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Ολοκληρώσεις στην περίοδο" value={throughputTotal} delta={data.throughputDelta} />
        <KpiTile
          label="Εντός προθεσμίας"
          value={data.onTimePct === null ? '—' : `${data.onTimePct}%`}
          subtitle={data.onTimeN > 0 && data.onTimeN < 5 ? `μόνο ${data.onTimeN} με προθεσμία` : undefined}
        />
        <KpiTile label="Tasks από meetings" value={data.meetingTasks.total} />
        <KpiTile label="Χρειάζονται έλεγχο (AI)" value={data.meetingTasks.needsReview} invert />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Κατανομή status"
          subtitle="Ανοιχτά τώρα + ολοκληρώσεις της περιόδου"
          empty={data.statusBreakdown.every((s) => s.count === 0)}
        >
          <StackedBar segments={data.statusBreakdown.map((s) => ({
            label: STATUS_LABELS_EL[s.status] ?? s.status, value: s.count, color: STATUS_SERIES[s.status],
          }))} />
        </ChartCard>
        <ChartCard title="Νέα tasks ανά προτεραιότητα" empty={data.priorityBreakdown.every((p) => p.count === 0)}>
          <HBarList items={data.priorityBreakdown.map((p) => ({ label: PRIORITY_LABELS_EL[p.priority] ?? p.priority, value: p.count }))} />
        </ChartCard>
        <ChartCard
          title="Throughput ανά εβδομάδα"
          empty={throughputTotal === 0}
          table={{ headers: ['Εβδομάδα', 'Ολοκληρώσεις'], rows: data.throughputByWeek.map((w) => [w.week, w.count]) }}
        >
          <WeeklyBars data={data.throughputByWeek} name="Ολοκληρώσεις" />
        </ChartCard>
        <ChartCard title="Κατανομή cycle time" subtitle="Δημιουργία → ολοκλήρωση" empty={data.cycleDistribution.every((c) => c.count === 0)}>
          <HBarList items={data.cycleDistribution.map((c) => ({ label: c.bucket, value: c.count }))} />
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
        <h3 className="text-sm font-semibold text-fluent-neutral-90 mb-3">Παλαιότερα ανοιχτά tasks</h3>
        {data.aging.length === 0 ? (
          <p className="py-6 text-center text-sm text-fluent-neutral-50">Κανένα ανοιχτό task.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Έργο</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Ανάθεση</th>
                  <th className="py-2">Ανοιχτό εδώ και</th>
                </tr>
              </thead>
              <tbody>
                {data.aging.map((t) => {
                  const b = agingBadge(t.daysOpen);
                  return (
                    <tr key={t.id} className="border-b border-black/[0.03] last:border-0 hover:bg-fluent-blue-50/30">
                      <td className="py-2.5 pr-3 max-w-xs">
                        <Link href={`/board?task=${t.id}`} className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600 line-clamp-1">
                          {t.title}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-fluent-neutral-70 whitespace-nowrap">{t.projectName}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-xs">{STATUS_LABELS_EL[t.status] ?? t.status}</td>
                      <td className="py-2.5 pr-3 text-xs text-fluent-neutral-60">{t.assignees.join(', ') || '—'}</td>
                      <td className="py-2.5">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', b.cls)}>
                          {b.icon} {b.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Σύνδεση στο page.tsx** (`case 'tasks'` όπως στο Task 7 με `buildTasksReport`/`TasksTab`).

- [ ] **Step 4: Έλεγχος + commit**

Run: `npx tsc --noEmit`, άνοιξε `/reports?tab=tasks`.
```bash
git add lib/reports/tasks.ts app/\(app\)/reports
git commit -m "feat(reports): tasks tab — throughput, cycle distribution, aging, on-time"
```

---

### Task 9: Tickets tab

**Files:**
- Create: `lib/reports/tickets.ts`
- Create: `app/(app)/reports/tickets-tab.tsx`
- Modify: `app/(app)/reports/page.tsx` (case 'tickets' — μόνο isPrivileged)

- [ ] **Step 1: `lib/reports/tickets.ts`**

Χρόνοι από `TicketEvent` (`analyzed`, `converted`) + `resolvedAt`. Merged: μετράνε στον όγκο, ΟΧΙ στους χρόνους. Tickets χωρίς αντίστοιχο event εξαιρούνται από το εκάστοτε metric.

```ts
import { prisma } from '@/lib/prisma'
import { type ReportScope, bucketByWeek, hoursBetween, mean, median } from './shared'

export type TicketsReport = {
  volume: {
    total: number
    bySource: { label: string; value: number }[]
    byCategory: { label: string; value: number }[]
    byStatusGroup: { key: string; value: number }[] // keys από TICKET_STATUS_GROUPS
    incomingByDay: { day: string; value: number }[]
  }
  times: {
    toTriage: { mean: number | null; median: number | null; n: number }
    toConvert: { mean: number | null; median: number | null; n: number }
    toResolve: { mean: number | null; median: number | null; n: number }
    resolutionByWeek: { week: string; count: number }[] // επιλύσεις/εβδομάδα
  }
  ai: {
    avgConfidence: number | null
    confidenceBuckets: { label: string; value: number }[]
    rejectedPct: number
    mergedPct: number
    needsInfoPct: number
    errors: number
    convertedTotal: number
    acceptedSuggestion: number // converted με task στο προτεινόμενο project
  }
  reporters: { email: string; name: string | null; count: number; topCategory: string | null }[]
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Σφάλμα', feature: 'Νέα λειτουργία', support: 'Υποστήριξη',
  question: 'Ερώτηση', billing: 'Χρέωση', other: 'Άλλο',
}

export async function buildTicketsReport(scope: ReportScope): Promise<TicketsReport> {
  const { range } = scope
  const { bucketByDay } = await import('./shared')

  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    select: {
      id: true, createdAt: true, resolvedAt: true, status: true,
      reporterEmail: true, reporterName: true, aiCategory: true, aiConfidence: true, aiError: true,
      aiSuggestedProjectId: true,
      source: { select: { name: true } },
      task: { select: { projectId: true } },
      events: {
        where: { type: { in: ['analyzed', 'converted'] } },
        orderBy: { createdAt: 'asc' },
        select: { type: true, createdAt: true },
      },
    },
  })

  const notMerged = tickets.filter((t) => t.status !== 'merged')

  const count = <T,>(rows: T[], key: (r: T) => string): { label: string; value: number }[] => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }

  const statusGroupOf = (s: string): string => {
    if (s === 'new' || s === 'analyzing') return 'open'
    if (s === 'triaged') return 'triaged'
    if (s === 'converted') return 'converted'
    if (s === 'needs_info') return 'needs_info'
    if (s === 'resolved' || s === 'closed') return 'resolved'
    return 'other'
  }

  const durations = (type: 'analyzed' | 'converted') =>
    notMerged
      .map((t) => {
        const ev = t.events.find((e) => e.type === type)
        return ev ? hoursBetween(t.createdAt, ev.createdAt) : null
      })
      .filter((v): v is number => v !== null)

  const toTriage = durations('analyzed')
  const toConvert = durations('converted')
  const toResolve = notMerged.filter((t) => t.resolvedAt).map((t) => hoursBetween(t.createdAt, t.resolvedAt!))
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)

  const withConf = notMerged.filter((t) => t.aiConfidence !== null)
  const confBucket = (c: number) => (c < 0.6 ? '<60%' : c < 0.85 ? '60–85%' : '≥85%')
  const confCounts = new Map<string, number>([['<60%', 0], ['60–85%', 0], ['≥85%', 0]])
  for (const t of withConf) confCounts.set(confBucket(t.aiConfidence!), (confCounts.get(confBucket(t.aiConfidence!)) ?? 0) + 1)

  const converted = tickets.filter((t) => t.task)
  const accepted = converted.filter((t) => t.aiSuggestedProjectId && t.task!.projectId === t.aiSuggestedProjectId)

  const byReporter = new Map<string, { name: string | null; count: number; cats: Map<string, number> }>()
  for (const t of tickets) {
    const e = byReporter.get(t.reporterEmail) ?? { name: t.reporterName, count: 0, cats: new Map() }
    e.count += 1
    if (t.aiCategory) e.cats.set(t.aiCategory, (e.cats.get(t.aiCategory) ?? 0) + 1)
    byReporter.set(t.reporterEmail, e)
  }
  const reporters = [...byReporter.entries()]
    .map(([email, e]) => ({
      email,
      name: e.name,
      count: e.count,
      topCategory: [...e.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        ? CATEGORY_LABEL[[...e.cats.entries()].sort((a, b) => b[1] - a[1])[0][0]]
        : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const pct = (n: number) => (tickets.length === 0 ? 0 : Math.round((n / tickets.length) * 100))

  return {
    volume: {
      total: tickets.length,
      bySource: count(tickets, (t) => t.source.name),
      byCategory: count(tickets.filter((t) => t.aiCategory), (t) => CATEGORY_LABEL[t.aiCategory!] ?? t.aiCategory!),
      byStatusGroup: count(tickets, (t) => statusGroupOf(t.status)).map((c) => ({ key: c.label, value: c.value })),
      incomingByDay: bucketByDay(tickets, (t) => t.createdAt, range).map((d) => ({ day: d.day, value: d.count })),
    },
    times: {
      toTriage: { mean: r1(mean(toTriage)), median: r1(median(toTriage)), n: toTriage.length },
      toConvert: { mean: r1(mean(toConvert)), median: r1(median(toConvert)), n: toConvert.length },
      toResolve: { mean: r1(mean(toResolve)), median: r1(median(toResolve)), n: toResolve.length },
      resolutionByWeek: bucketByWeek(notMerged.filter((t) => t.resolvedAt), (t) => t.resolvedAt!, range),
    },
    ai: {
      avgConfidence: withConf.length === 0 ? null : Math.round((mean(withConf.map((t) => t.aiConfidence!))! * 100)),
      confidenceBuckets: [...confCounts.entries()].map(([label, value]) => ({ label, value })),
      rejectedPct: pct(tickets.filter((t) => t.status === 'rejected').length),
      mergedPct: pct(tickets.filter((t) => t.status === 'merged').length),
      needsInfoPct: pct(tickets.filter((t) => t.status === 'needs_info').length),
      errors: tickets.filter((t) => t.aiError).length,
      convertedTotal: converted.length,
      acceptedSuggestion: accepted.length,
    },
    reporters,
  }
}
```

- [ ] **Step 2: `app/(app)/reports/tickets-tab.tsx`**

```tsx
'use client';
import { KpiTile } from '@/components/reports/kpi-tile';
import { ChartCard } from '@/components/reports/chart-card';
import { TrendArea, WeeklyBars } from '@/components/reports/time-charts';
import { HBarList, StackedBar } from '@/components/reports/static-charts';
import { TICKET_STATUS_GROUPS, CATEGORICAL } from '@/lib/reports/chart-theme';
import type { TicketsReport } from '@/lib/reports/tickets';

function TimeStat({ label, t }: { label: string; t: { mean: number | null; median: number | null; n: number } }) {
  return (
    <KpiTile
      label={label}
      value={t.median ?? '—'}
      unit={t.median !== null ? 'ώρες (median)' : undefined}
      subtitle={t.n === 0 ? undefined : `μ.ό. ${t.mean}h · ${t.n} tickets${t.n < 5 ? ' ⚠ λίγα δεδομένα' : ''}`}
    />
  );
}

export function TicketsTab({ data }: { data: TicketsReport }) {
  const groups = TICKET_STATUS_GROUPS.map((g) => ({
    label: g.label,
    color: g.color,
    value: data.volume.byStatusGroup.find((x) => x.key === g.key)?.value ?? 0,
  }));
  const conversionPct = data.ai.convertedTotal === 0 ? null : Math.round((data.ai.acceptedSuggestion / data.ai.convertedTotal) * 100);
  return (
    <div className="space-y-5">
      {/* Χρόνοι */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Σύνολο tickets" value={data.volume.total} />
        <TimeStat label="Έως triage" t={data.times.toTriage} />
        <TimeStat label="Έως μετατροπή σε task" t={data.times.toConvert} />
        <TimeStat label="Έως επίλυση" t={data.times.toResolve} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Εισερχόμενα ανά ημέρα"
          empty={data.volume.incomingByDay.every((d) => d.value === 0)}
          table={{ headers: ['Ημέρα', 'Tickets'], rows: data.volume.incomingByDay.map((d) => [d.day, d.value]) }}
        >
          <TrendArea data={data.volume.incomingByDay} name="Εισερχόμενα" color={CATEGORICAL[1]} />
        </ChartCard>
        <ChartCard title="Επιλύσεις ανά εβδομάδα" empty={data.times.resolutionByWeek.every((w) => w.count === 0)}>
          <WeeklyBars data={data.times.resolutionByWeek} name="Επιλύσεις" color={CATEGORICAL[3]} />
        </ChartCard>
        <ChartCard title="Ανά πηγή" empty={data.volume.bySource.length === 0}>
          <HBarList items={data.volume.bySource} />
        </ChartCard>
        <ChartCard title="Ανά κατηγορία (AI)" empty={data.volume.byCategory.length === 0}>
          <HBarList items={data.volume.byCategory} />
        </ChartCard>
      </div>

      <ChartCard title="Κατάσταση tickets" subtitle="Όλα τα tickets της περιόδου" empty={data.volume.total === 0}>
        <StackedBar segments={groups} />
      </ChartCard>

      {/* AI ποιότητα */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Μέσο confidence AI" value={data.ai.avgConfidence === null ? '—' : `${data.ai.avgConfidence}%`} />
        <KpiTile
          label="Αποδοχή πρότασης project"
          value={conversionPct === null ? '—' : `${conversionPct}%`}
          subtitle={data.ai.convertedTotal > 0 ? `${data.ai.acceptedSuggestion}/${data.ai.convertedTotal} μετατροπές` : undefined}
        />
        <KpiTile label="Needs info" value={`${data.ai.needsInfoPct}%`} invert />
        <KpiTile label="Σφάλματα ανάλυσης" value={data.ai.errors} invert />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Κατανομή confidence" empty={data.ai.confidenceBuckets.every((b) => b.value === 0)}>
          <HBarList items={data.ai.confidenceBuckets} />
        </ChartCard>
        <ChartCard title="Απορρίψεις / Συγχωνεύσεις" empty={data.volume.total === 0}>
          <HBarList items={[
            { label: 'Απορρίφθηκαν', value: Math.round((data.ai.rejectedPct / 100) * data.volume.total) },
            { label: 'Συγχωνεύθηκαν', value: Math.round((data.ai.mergedPct / 100) * data.volume.total) },
          ]} />
        </ChartCard>
      </div>

      {/* Reporters */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
        <h3 className="text-sm font-semibold text-fluent-neutral-90 mb-1">Top reporters</h3>
        <p className="text-[11px] text-fluent-neutral-50 mb-3">Reporters με ≥3 tickets είναι υποψήφιοι για άρθρο στο Knowledge Base.</p>
        {data.reporters.length === 0 ? (
          <p className="py-6 text-center text-sm text-fluent-neutral-50">Κανένα ticket στην περίοδο.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5">
                <th className="py-2 pr-3">Reporter</th>
                <th className="py-2 pr-3">Tickets</th>
                <th className="py-2">Συχνότερη κατηγορία</th>
              </tr>
            </thead>
            <tbody>
              {data.reporters.map((r) => (
                <tr key={r.email} className="border-b border-black/[0.03] last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-fluent-neutral-90">{r.name ?? r.email}</span>
                    {r.name && <span className="text-xs text-fluent-neutral-50 ml-2">{r.email}</span>}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums font-semibold">
                    {r.count}
                    {r.count >= 3 && <span className="ml-2 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold">KB</span>}
                  </td>
                  <td className="py-2.5 text-fluent-neutral-70">{r.topCategory ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Σύνδεση στο page.tsx** (`case 'tickets'` — φτάνει εδώ μόνο όταν isPrivileged, το guard υπάρχει ήδη στο tab resolution).

- [ ] **Step 4: Έλεγχος + commit**

Run: `npx tsc --noEmit`, άνοιξε `/reports?tab=tickets` (τα 2 converted tickets της βάσης πρέπει να δίνουν χρόνους triage/convert).
```bash
git add lib/reports/tickets.ts app/\(app\)/reports
git commit -m "feat(reports): tickets tab — response times, volume, AI quality, reporters"
```

---

### Task 10: Users tab (admin/manager μόνο)

**Files:**
- Create: `lib/reports/users.ts`
- Create: `app/(app)/reports/users-tab.tsx`
- Modify: `app/(app)/reports/page.tsx` (case 'users')

- [ ] **Step 1: `lib/reports/users.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { type ReportScope, hoursBetween, mean, msToHours, pctDelta, trackedMs, bucketByWeek } from './shared'

export type UserReportRow = {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
  completedInPeriod: number
  completedDelta: number | null
  trackedHours: number
  avgCycleHours: number | null
  cycleN: number
  onTimePct: number | null
  onTimeN: number
  activeLoad: number // open + in_progress τώρα
  overdue: number
  ticketsResolved: number // ολοκληρωμένα tasks της περιόδου που συνδέονται με ticket
  weeklyCompletions: { week: string; count: number }[]
  recentTasks: { id: string; title: string; status: string; projectName: string }[]
}

export type UsersReport = { rows: UserReportRow[] }

export async function buildUsersReport(scope: ReportScope): Promise<UsersReport> {
  const { range, prev } = scope
  const now = new Date()

  const users = await prisma.user.findMany({
    where: { userType: 'employee' },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, email: true, image: true, role: true,
      assignedTasks: {
        select: {
          task: {
            select: {
              id: true, title: true, status: true, dueDate: true, createdAt: true, completedAt: true,
              inProgressAccumulatedMs: true, inProgressStartedAt: true,
              project: { select: { name: true } },
              ticket: { select: { id: true } },
            },
          },
        },
      },
    },
  })

  const rows: UserReportRow[] = users.map((u) => {
    const tasks = u.assignedTasks.map((a) => a.task)
    const completedCur = tasks.filter((t) => t.completedAt && t.completedAt >= range.from && t.completedAt <= range.to)
    const completedPrev = tasks.filter((t) => t.completedAt && t.completedAt >= prev.from && t.completedAt <= prev.to)
    const cycles = completedCur.map((t) => hoursBetween(t.createdAt, t.completedAt!))
    const avgCycle = mean(cycles)
    const withDue = completedCur.filter((t) => t.dueDate)
    const onTime = withDue.filter((t) => t.completedAt! <= t.dueDate!)
    const open = tasks.filter((t) => t.status !== 'done')
    return {
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
      avatarUrl: u.image ?? undefined,
      role: u.role,
      completedInPeriod: completedCur.length,
      completedDelta: pctDelta(completedCur.length, completedPrev.length),
      trackedHours: msToHours(completedCur.reduce((a, t) => a + trackedMs(t, now), 0)),
      avgCycleHours: avgCycle === null ? null : Math.round(avgCycle * 10) / 10,
      cycleN: cycles.length,
      onTimePct: withDue.length === 0 ? null : Math.round((onTime.length / withDue.length) * 100),
      onTimeN: withDue.length,
      activeLoad: open.length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
      ticketsResolved: completedCur.filter((t) => t.ticket).length,
      weeklyCompletions: bucketByWeek(completedCur, (t) => t.completedAt!, range),
      recentTasks: [...tasks]
        .sort((a, b) => (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime())
        .slice(0, 10)
        .map((t) => ({ id: t.id, title: t.title, status: t.status, projectName: t.project.name })),
    }
  })

  rows.sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.activeLoad - a.activeLoad)
  return { rows }
}
```

- [ ] **Step 2: `app/(app)/reports/users-tab.tsx`** — πίνακας με expandable rows

```tsx
'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown16Regular, ChevronRight16Regular, ArrowUp16Filled, ArrowDown16Filled } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ROLE_LABELS_EL, STATUS_LABELS_EL } from '@/lib/reports/shared';
import { DELTA } from '@/lib/reports/chart-theme';
import { WeeklyBars } from '@/components/reports/time-charts';
import type { UsersReport, UserReportRow } from '@/lib/reports/users';

export function UsersTab({ data }: { data: UsersReport }) {
  const [open, setOpen] = useState<string | null>(null);
  if (data.rows.length === 0) {
    return <p className="py-16 text-center text-sm text-fluent-neutral-50">Κανένας χρήστης.</p>;
  }
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40">
            <th className="px-4 py-2.5 w-8" />
            <th className="px-4 py-2.5">Χρήστης</th>
            <th className="px-4 py-2.5">Ολοκλ. στην περίοδο</th>
            <th className="px-4 py-2.5">Ώρες tracked</th>
            <th className="px-4 py-2.5">Μ.ό. cycle</th>
            <th className="px-4 py-2.5">Εντός προθεσμίας</th>
            <th className="px-4 py-2.5">Ενεργός φόρτος</th>
            <th className="px-4 py-2.5">Εκπρόθεσμα</th>
            <th className="px-4 py-2.5">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((u) => (
            <Fragment key={u.id}>
              <tr
                className="border-b border-black/[0.03] hover:bg-fluent-blue-50/30 cursor-pointer"
                onClick={() => setOpen(open === u.id ? null : u.id)}
              >
                <td className="px-4 py-3 text-fluent-neutral-50">
                  {open === u.id ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                    <span>
                      <span className="block font-medium text-fluent-neutral-90">{u.name}</span>
                      <span className="block text-[11px] text-fluent-neutral-50">{ROLE_LABELS_EL[u.role] ?? u.role}</span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="tabular-nums font-semibold">{u.completedInPeriod}</span>
                  {u.completedDelta !== null && (
                    <span
                      className="ml-2 inline-flex items-center gap-0.5 text-[11px] font-semibold"
                      style={{ color: u.completedDelta === 0 ? DELTA.neutral : u.completedDelta > 0 ? DELTA.good : DELTA.bad }}
                    >
                      {u.completedDelta > 0 ? <ArrowUp16Filled className="h-3 w-3" /> : u.completedDelta < 0 ? <ArrowDown16Filled className="h-3 w-3" /> : null}
                      {Math.abs(u.completedDelta)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{u.trackedHours}h</td>
                <td className="px-4 py-3 tabular-nums">
                  {u.avgCycleHours === null ? '—' : `${u.avgCycleHours}h`}
                  {u.cycleN > 0 && u.cycleN < 5 && <span className="text-[10px] text-fluent-neutral-50 ml-1">n={u.cycleN}</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">{u.onTimePct === null ? '—' : `${u.onTimePct}%`}</td>
                <td className="px-4 py-3 tabular-nums">{u.activeLoad}</td>
                <td className={cn('px-4 py-3 tabular-nums', u.overdue > 0 && 'text-fluent-accent-red font-semibold')}>{u.overdue}</td>
                <td className="px-4 py-3 tabular-nums">{u.ticketsResolved}</td>
              </tr>
              {open === u.id && (
                <tr className="border-b border-black/[0.03] bg-fluent-neutral-4/30">
                  <td />
                  <td colSpan={8} className="px-4 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div>
                        <p className="text-[11px] font-semibold text-fluent-neutral-60 uppercase tracking-wider mb-2">Ολοκληρώσεις ανά εβδομάδα</p>
                        {u.weeklyCompletions.every((w) => w.count === 0) ? (
                          <p className="text-sm text-fluent-neutral-50 py-4">Καμία ολοκλήρωση στην περίοδο.</p>
                        ) : (
                          <WeeklyBars data={u.weeklyCompletions} name="Ολοκληρώσεις" height={140} />
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-fluent-neutral-60 uppercase tracking-wider mb-2">Πρόσφατα tasks</p>
                        <ul className="space-y-1.5">
                          {u.recentTasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 text-xs">
                              <Link href={`/board?task=${t.id}`} className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600 truncate">
                                {t.title}
                              </Link>
                              <span className="text-fluent-neutral-50 shrink-0">
                                {t.projectName} · {STATUS_LABELS_EL[t.status] ?? t.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Σύνδεση στο page.tsx** (`case 'users'` με `buildUsersReport`/`UsersTab`).

- [ ] **Step 4: Έλεγχος + commit**

Run: `npx tsc --noEmit`, άνοιξε `/reports?tab=users`, δοκίμασε expand.
```bash
git add lib/reports/users.ts app/\(app\)/reports
git commit -m "feat(reports): users tab — per-user performance with expandable detail"
```

---

### Task 11: Έλεγχος πρόσβασης για απλά μέλη

- [ ] **Step 1:** Επιβεβαίωσε στο `page.tsx` ότι μη-privileged χρήστης με `?tab=users` ή `?tab=tickets` πέφτει σε `overview` (ήδη γραμμένο στο Task 6 Step 4 — απλώς verify) και ότι το `ReportsShell` κρύβει τα δύο tabs (`privilegedOnly`).
- [ ] **Step 2:** Χειροκίνητο τεστ με λογαριασμό member (ή προσωρινή αλλαγή του `isPrivileged` σε `false` στο page.tsx — ΜΗΝ την κάνεις commit): τα tabs Tickets/Χρήστες δεν φαίνονται, το URL `?tab=users` δείχνει Επισκόπηση, τα projects περιορίζονται στα δικά του.
- [ ] **Step 3:** Commit μόνο αν χρειάστηκε διόρθωση.

---

### Task 12: Επέκταση export route

**Files:**
- Modify: `app/api/reports/export/route.ts`

Το route έχει ήδη ExcelJS/docx με tabs overview/projects/users πάνω στο παλιό `buildReportsData`. Επέκταση: (α) δέξου `period/from/to` και τα νέα tabs, (β) для τα νέα tabs χτίσε CSV (απλούστερο από ExcelJS sheets και καλύπτει το spec· τα υπάρχοντα xlsx/docx μένουν ως έχουν για συμβατότητα).

- [ ] **Step 1:** Πρόσθεσε στο route handler (πριν το υπάρχον xlsx/docx path):

```ts
import { resolveRange } from '@/lib/reports/shared';
import { buildOverviewReport } from '@/lib/reports/overview';
import { buildProjectsReport } from '@/lib/reports/projects';
import { buildTasksReport } from '@/lib/reports/tasks';
import { buildTicketsReport } from '@/lib/reports/tickets';
import { buildUsersReport } from '@/lib/reports/users';

function csvResponse(filename: string, headers: string[], rows: (string | number | null)[][]): NextResponse {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // UTF-8 BOM ώστε το Excel να διαβάζει σωστά τα ελληνικά.
  const body = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2:** Μέσα στον GET handler, μετά το auth check, χειρίσου τα νέα tabs (το `format=xlsx|docx` παλιό path μένει για τα παλιά tabs):

```ts
  const sp = req.nextUrl.searchParams;
  const tab = sp.get('tab') ?? 'overview';
  const isPrivileged = session.user.role === 'admin' || session.user.role === 'manager';
  const { range, prev } = resolveRange({
    period: sp.get('period') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
  });
  const scope = { range, prev, userId: session.user.id, isPrivileged };
  const stamp = todayStamp();

  if (tab === 'tasks') {
    const d = await buildTasksReport(scope);
    return csvResponse(`tasks-report-${stamp}.csv`,
      ['Εβδομάδα', 'Ολοκληρώσεις'],
      d.throughputByWeek.map((w) => [w.week, w.count]));
  }
  if (tab === 'tickets') {
    if (!isPrivileged) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const d = await buildTicketsReport(scope);
    return csvResponse(`tickets-report-${stamp}.csv`,
      ['Πηγή', 'Tickets'],
      d.volume.bySource.map((s) => [s.label, s.value]));
  }
  if (tab === 'projects' && (sp.get('period') || sp.get('from'))) {
    const d = await buildProjectsReport(scope);
    return csvResponse(`projects-report-${stamp}.csv`,
      ['Έργο', 'Κατάσταση', 'Ολοκλ. περιόδου', 'Velocity/εβδ', 'Net flow', 'Ώρες tracked', 'Ώρες εκτίμηση', 'Μ.ό. cycle (h)', 'Εκπρόθεσμα'],
      d.rows.map((p) => [p.name, p.status, p.completedInPeriod, p.velocityPerWeek, p.netFlow, p.trackedHours, p.estimatedHours, p.avgCycleHours, p.overdue]));
  }
  if (tab === 'users' && (sp.get('period') || sp.get('from'))) {
    if (!isPrivileged) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const d = await buildUsersReport(scope);
    return csvResponse(`users-report-${stamp}.csv`,
      ['Χρήστης', 'Email', 'Ολοκλ. περιόδου', 'Δ%', 'Ώρες tracked', 'Μ.ό. cycle (h)', 'Εντός προθεσμίας %', 'Ενεργός φόρτος', 'Εκπρόθεσμα', 'Tickets'],
      d.rows.map((u) => [u.name, u.email, u.completedInPeriod, u.completedDelta, u.trackedHours, u.avgCycleHours, u.onTimePct, u.activeLoad, u.overdue, u.ticketsResolved]));
  }
  if (tab === 'overview' && (sp.get('period') || sp.get('from'))) {
    const d = await buildOverviewReport(scope);
    return csvResponse(`overview-report-${stamp}.csv`,
      ['Ημέρα', 'Ολοκληρώσεις tasks', 'Εισερχόμενα tickets', 'Επιλυμένα tickets'],
      d.taskCompletionsByDay.map((row, i) => [row.day, row.value, d.ticketFlowByDay[i]?.a ?? 0, d.ticketFlowByDay[i]?.b ?? 0]));
  }
  // …fallthrough στο υπάρχον xlsx/docx path (παλιά συμπεριφορά χωρίς period params)
```

- [ ] **Step 3:** Δοκιμή: `curl -s -o /tmp/x.csv -w '%{http_code}' 'http://localhost:3000/api/reports/export?tab=tickets&period=30d'` με session cookie (ή από τον browser μέσω του κουμπιού «Εξαγωγή»). Expected: 200, αρχείο ξεκινά με BOM, ελληνικά σωστά στο Excel.

- [ ] **Step 4: Commit**

```bash
git add app/api/reports/export/route.ts
git commit -m "feat(reports): CSV export per tab honoring period filters"
```

---

### Task 13: Καθάρισμα παλιού κώδικα

**Files:**
- Delete: `app/(app)/reports/reports-client.tsx`
- Modify: `lib/reports/index.ts`

- [ ] **Step 1:** `grep -rn "reports-client\|buildReportsData" app/ lib/ components/` — αναμενόμενα ευρήματα: το ίδιο το reports-client.tsx και τα δύο export routes.
- [ ] **Step 2:** Διάγραψε το `app/(app)/reports/reports-client.tsx`. Αν το `app/api/reports/export/route.ts` fallthrough path (xlsx/docx) χρησιμοποιείται ακόμα από πουθενά αλλού στο UI, κράτησέ το· το `buildReportsData` μένει στο `lib/reports/index.ts` όσο το χρησιμοποιούν τα export routes (ΜΗΝ το διαγράψεις αν το `api/projects/[id]/export` το χρειάζεται — έλεγξε με grep).
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` → καθαρά.
- [ ] **Step 4: Commit**

```bash
git rm app/\(app\)/reports/reports-client.tsx
git commit -m "chore(reports): remove superseded reports client"
```

---

### Task 14: Smoke test + τελική επαλήθευση

**Files:**
- Create: `scripts/test-reports.ts`

- [ ] **Step 1: `scripts/test-reports.ts`** (μοτίβο των υπαρχόντων scripts — φορτώνει .env.local):

```ts
/**
 * Smoke test: χτίζει και τα 5 reports με την πραγματική DB.
 *   npx tsx scripts/test-reports.ts
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (process.env[m[1]] === undefined) process.env[m[1]] = val
    }
  }
}
loadEnv()

async function main() {
  const assert = (await import('node:assert/strict')).default
  const { resolveRange } = await import('../lib/reports/shared')
  const { buildOverviewReport } = await import('../lib/reports/overview')
  const { buildProjectsReport } = await import('../lib/reports/projects')
  const { buildTasksReport } = await import('../lib/reports/tasks')
  const { buildTicketsReport } = await import('../lib/reports/tickets')
  const { buildUsersReport } = await import('../lib/reports/users')

  const { range, prev } = resolveRange({ period: '90d' })
  const scope = { range, prev, userId: '', isPrivileged: true }

  const overview = await buildOverviewReport(scope)
  console.log('overview:', JSON.stringify(overview.kpis))
  assert.ok(overview.taskCompletionsByDay.length > 0)

  const projects = await buildProjectsReport(scope)
  console.log('projects rows:', projects.rows.length)
  assert.ok(projects.rows.length > 0)
  // JSON-serializable (κανένα BigInt/Date leak)
  JSON.stringify(projects)

  const tasks = await buildTasksReport(scope)
  console.log('tasks aging:', tasks.aging.length, 'throughput weeks:', tasks.throughputByWeek.length)
  JSON.stringify(tasks)

  const tickets = await buildTicketsReport(scope)
  console.log('tickets total:', tickets.volume.total, 'toTriage n:', tickets.times.toTriage.n)
  JSON.stringify(tickets)

  const users = await buildUsersReport(scope)
  console.log('users rows:', users.rows.length)
  JSON.stringify(users)

  console.log('✅ test-reports: όλα τα builders έτρεξαν και είναι JSON-safe')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2:** Run: `npx tsx scripts/test-reports.ts` → `✅ test-reports: όλα τα builders έτρεξαν και είναι JSON-safe`
- [ ] **Step 3:** Run: `npx tsx scripts/test-reports-helpers.ts` → πράσινο. Run: `npx tsc --noEmit && npm run build` → καθαρά.
- [ ] **Step 4: Οπτικός έλεγχος (απαίτηση dataviz):** με dev server ανοιχτό, δες ΚΑΘΕ tab σε `period=7d` και `period=90d` + ένα custom range. Ψάξε: label collisions στους άξονες, overflow σε στενό viewport (τα tables σκρολάρουν μέσα στην κάρτα τους;), σωστά empty states σε περίοδο χωρίς δεδομένα (π.χ. `from=2020-01-01&to=2020-01-31`), δείκτες σύγκρισης με σωστό πρόσημο/χρώμα. Διόρθωσε ό,τι βρεις πριν το τελικό commit.
- [ ] **Step 5: Commit**

```bash
git add scripts/test-reports.ts
git commit -m "test(reports): smoke test for all report builders"
```

---

## Self-Review Notes (έγινε κατά τη σύνταξη)

- **Spec coverage:** Όλα τα sections του spec αντιστοιχούν σε task: αρχιτεκτονική/δομή (T1), παλέτα validated (T2 — τα hex κλειδώθηκαν με πραγματικό run του validator), primitives/charts/states (T3–T4), tabs (T5–T10), πρόσβαση (T11), export+BOM (T12), edge cases (BigInt→`trackedMs`/`msToHours` T1· merged εκτός χρόνων T5/T9· n<5 σήμανση T6/T8/T9/T10· custom clamp 366 ημέρες T1· fallback 30d T1), testing/verification (T14).
- **Εκτός scope (όπως στο spec):** PDF export, snapshots, αναφορές πελατών.
- **Type consistency:** `ReportScope` ορίζεται μία φορά στο shared και χρησιμοποιείται από όλα τα builders· τα tab components κάνουν import τους τύπους από τα αντίστοιχα builders.
