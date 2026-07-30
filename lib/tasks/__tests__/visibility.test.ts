import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskVisibilityFilter, canSetTaskVisibility } from '../visibility'

test('η ομάδα βλέπει όλες τις εργασίες', () => {
  assert.deepEqual(taskVisibilityFilter('employee'), {})
  assert.deepEqual(taskVisibilityFilter('supplier'), {})
})

test('ο πελάτης βλέπει μόνο τις shared', () => {
  assert.deepEqual(taskVisibilityFilter('customer'), { visibility: 'shared' })
})

test('άγνωστος τύπος αντιμετωπίζεται ως πελάτης (fail-closed)', () => {
  assert.deepEqual(taskVisibilityFilter(undefined), { visibility: 'shared' })
  assert.deepEqual(taskVisibilityFilter('nonsense'), { visibility: 'shared' })
})

test('όλη η ομάδα υλοποίησης μπορεί να αλλάξει ορατότητα', () => {
  assert.equal(canSetTaskVisibility('employee', 'admin'), true)
  assert.equal(canSetTaskVisibility('employee', 'manager'), true)
  assert.equal(canSetTaskVisibility('employee', 'member'), true)
})

test('viewers και πελάτες δεν μπορούν', () => {
  assert.equal(canSetTaskVisibility('employee', 'viewer'), false)
  assert.equal(canSetTaskVisibility('customer', 'admin'), false)
  assert.equal(canSetTaskVisibility(undefined, 'admin'), false)
})
