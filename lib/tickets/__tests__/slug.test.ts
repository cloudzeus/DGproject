import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify } from '../slug'

test('greek transliteration', () => {
  assert.equal(slugify('Πρόβλημα πληρωμής με κάρτα'), 'provlima-pliromis-me-karta')
})

test('mixed greek/latin/digits', () => {
  assert.equal(slugify('Σφάλμα 500 στο checkout'), 'sfalma-500-sto-checkout')
})

test('theta/chi/psi digraphs', () => {
  assert.equal(slugify('Ψηφιακή θύρα χρήστη'), 'psifiaki-thyra-christi')
})

test('final sigma and diacritics', () => {
  assert.equal(slugify('Λύσεις ΟΛΕΣ'), 'lyseis-oles')
})

test('collapses symbols, trims, caps at 80 chars', () => {
  assert.equal(slugify('  --Hello!! World??  '), 'hello-world')
  assert.equal(slugify('α'.repeat(200)).length <= 80, true)
})

test('NFD-normalized input', () => {
  assert.equal(slugify('πρόβλημα'.normalize('NFD')), 'provlima')
})

test('empty input falls back', () => {
  assert.equal(slugify('!!!'), 'entry')
})
