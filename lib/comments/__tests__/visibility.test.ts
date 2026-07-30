import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentVisibilityFilter, visibilityForAuthor } from '../visibility'

test('η ομάδα βλέπει όλα τα σχόλια', () => {
  assert.deepEqual(commentVisibilityFilter('employee'), {})
  assert.deepEqual(commentVisibilityFilter('supplier'), {})
})

test('ο πελάτης βλέπει μόνο τα shared', () => {
  assert.deepEqual(commentVisibilityFilter('customer'), { visibility: 'shared' })
})

test('άγνωστος ή απών τύπος αντιμετωπίζεται ως πελάτης (fail-closed)', () => {
  assert.deepEqual(commentVisibilityFilter(undefined), { visibility: 'shared' })
  assert.deepEqual(commentVisibilityFilter('nonsense'), { visibility: 'shared' })
  assert.deepEqual(commentVisibilityFilter(''), { visibility: 'shared' })
})

test('το σχόλιο πελάτη γράφεται πάντα shared', () => {
  assert.equal(visibilityForAuthor('customer', 'internal'), 'shared')
  assert.equal(visibilityForAuthor('customer', 'shared'), 'shared')
  assert.equal(visibilityForAuthor('customer', undefined), 'shared')
})

test('η ομάδα επιλέγει, με default internal', () => {
  assert.equal(visibilityForAuthor('employee', 'shared'), 'shared')
  assert.equal(visibilityForAuthor('employee', 'internal'), 'internal')
  assert.equal(visibilityForAuthor('employee', undefined), 'internal')
  assert.equal(visibilityForAuthor('supplier', 'shared'), 'shared')
})

test('άγνωστος τύπος συντάκτη δεν μπορεί να γράψει εσωτερικό σχόλιο', () => {
  // Fail-closed προς την άλλη κατεύθυνση: δεν εμπιστευόμαστε άγνωστο τύπο με
  // κρυφό σχόλιο, γιατί δεν ξέρουμε αν είναι μέλος της ομάδας.
  assert.equal(visibilityForAuthor(undefined, 'internal'), 'shared')
  assert.equal(visibilityForAuthor('nonsense', 'internal'), 'shared')
})
