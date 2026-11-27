import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LABOR_HOURLY_RATE_EUR, laborCostEur } from './shared'

test('η ωριαία χρέωση εργασίας είναι 80 ευρώ', () => {
  assert.equal(LABOR_HOURLY_RATE_EUR, 80)
})

test('το κόστος υπολογίζεται από πραγματικές ώρες και στρογγυλοποιείται σε 2 δεκαδικά', () => {
  assert.equal(laborCostEur(0), 0)
  assert.equal(laborCostEur(1), 80)
  assert.equal(laborCostEur(1.25), 100)
  assert.equal(laborCostEur(0.01), 0.8)
  assert.equal(laborCostEur(1.005), 80.4)
  assert.equal(laborCostEur(2.675), 214)
})

test('μη έγκυρες ή αρνητικές ώρες δεν παράγουν κόστος', () => {
  assert.throws(() => laborCostEur(-0.1))
  assert.throws(() => laborCostEur(Number.NaN))
  assert.throws(() => laborCostEur(Number.POSITIVE_INFINITY))
})
