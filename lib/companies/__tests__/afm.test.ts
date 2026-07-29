import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAfm, isValidAfm, hasValidChecksum } from '../afm'

test('normalizeAfm κρατά μόνο ψηφία', () => {
  assert.equal(normalizeAfm(' 094019245 '), '094019245')
  assert.equal(normalizeAfm('EL094019245'), '094019245')
  assert.equal(normalizeAfm('el-094-019-245'), '094019245')
  assert.equal(normalizeAfm(''), '')
})

test('isValidAfm ελέγχει μόνο μορφή 9 ψηφίων', () => {
  assert.equal(isValidAfm('094019245'), true)
  // Σωστή μορφή αλλά λάθος ψηφίο ελέγχου — η μορφή περνάει.
  assert.equal(isValidAfm('123456789'), true)
  assert.equal(isValidAfm('12345678'), false)
  assert.equal(isValidAfm('1234567890'), false)
  assert.equal(isValidAfm('09401924A'), false)
  assert.equal(isValidAfm(''), false)
})

test('hasValidChecksum εφαρμόζει τον αλγόριθμο ΓΓΠΣ', () => {
  assert.equal(hasValidChecksum('094019245'), true)
  assert.equal(hasValidChecksum('094014201'), true)
  assert.equal(hasValidChecksum('123456789'), false)
  assert.equal(hasValidChecksum('000000000'), false)
})

test('hasValidChecksum απορρίπτει λάθος μορφή χωρίς να σκάει', () => {
  assert.equal(hasValidChecksum('abc'), false)
  assert.equal(hasValidChecksum(''), false)
})
