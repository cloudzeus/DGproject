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
