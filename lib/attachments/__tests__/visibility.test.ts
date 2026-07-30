import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attachmentVisibilityFilter, visibilityForUploader } from '../visibility'

test('η ομάδα βλέπει όλα τα αρχεία', () => {
  assert.deepEqual(attachmentVisibilityFilter('employee'), {})
  assert.deepEqual(attachmentVisibilityFilter('supplier'), {})
})

test('ο πελάτης βλέπει μόνο τα shared', () => {
  assert.deepEqual(attachmentVisibilityFilter('customer'), { visibility: 'shared' })
})

test('άγνωστος τύπος αντιμετωπίζεται ως πελάτης (fail-closed)', () => {
  assert.deepEqual(attachmentVisibilityFilter(undefined), { visibility: 'shared' })
  assert.deepEqual(attachmentVisibilityFilter('nonsense'), { visibility: 'shared' })
})

test('αρχείο πελάτη είναι πάντα shared', () => {
  assert.equal(visibilityForUploader('customer', 'internal'), 'shared')
  assert.equal(visibilityForUploader(undefined, 'internal'), 'shared')
})

test('η ομάδα επιλέγει, με default internal', () => {
  assert.equal(visibilityForUploader('employee', 'shared'), 'shared')
  assert.equal(visibilityForUploader('employee', undefined), 'internal')
})
