import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_OCR_PAYLOAD_CHARS, parseOcrPages } from '../payload'

/**
 * Σύνορο εμπιστοσύνης: οι εικόνες έρχονται από τον browser και καταλήγουν σε
 * κλήσεις που κοστίζουν. Ό,τι δεν έχει σωστή μορφή πέφτει σιωπηλά — μια
 * χαλασμένη σελίδα δεν ρίχνει το ανέβασμα.
 */

const valid = { base64: 'AAAA', mimeType: 'image/webp', width: 800, height: 1130 }

test('έγκυρες σελίδες περνούν', () => {
  const out = parseOcrPages(JSON.stringify([valid, valid]))
  assert.equal(out.length, 2)
  assert.equal(out[0].base64, 'AAAA')
  assert.equal(out[0].width, 800)
})

test('απουσία πεδίου δίνει κενή λίστα, όχι σφάλμα', () => {
  assert.deepEqual(parseOcrPages(null), [])
  assert.deepEqual(parseOcrPages(undefined), [])
  assert.deepEqual(parseOcrPages(''), [])
  assert.deepEqual(parseOcrPages(42), [])
})

test('κακοσχηματισμένο JSON δίνει κενή λίστα', () => {
  assert.deepEqual(parseOcrPages('{δεν είναι json'), [])
})

test('JSON που δεν είναι πίνακας δίνει κενή λίστα', () => {
  assert.deepEqual(parseOcrPages(JSON.stringify({ pages: [valid] })), [])
})

test('σελίδα χωρίς base64 πέφτει, οι υπόλοιπες περνούν', () => {
  const out = parseOcrPages(JSON.stringify([valid, { ...valid, base64: '' }, valid]))
  assert.equal(out.length, 2)
})

test('μη επιτρεπτός τύπος εικόνας πέφτει', () => {
  // Μόνο webp/png/jpeg. Ένα «image/svg+xml» θα ήταν φορέας κώδικα, όχι σελίδα.
  const out = parseOcrPages(
    JSON.stringify([valid, { ...valid, mimeType: 'image/svg+xml' }, { ...valid, mimeType: 'text/html' }]),
  )
  assert.equal(out.length, 1)
})

test('σκουπίδια μέσα στον πίνακα αγνοούνται', () => {
  const out = parseOcrPages(JSON.stringify([valid, null, 'κείμενο', 42, [], valid]))
  assert.equal(out.length, 2)
})

test('διαστάσεις που λείπουν ή δεν είναι αριθμοί γίνονται 0', () => {
  const out = parseOcrPages(JSON.stringify([{ base64: 'A', mimeType: 'image/png', width: 'πολύ' }]))
  assert.equal(out.length, 1)
  assert.equal(out[0].width, 0)
  assert.equal(out[0].height, 0)
})

test('περισσότερες σελίδες από την οροφή κόβονται', () => {
  const many = Array.from({ length: 50 }, () => valid)
  assert.equal(parseOcrPages(JSON.stringify(many), 30).length, 30)
})

test('payload πάνω από την οροφή απορρίπτεται ΠΡΙΝ το parse', () => {
  // Ο έλεγχος γίνεται στο μήκος του string: ένα payload 200 MB δεν πρέπει καν
  // να φτάσει στον JSON parser.
  const huge = 'x'.repeat(MAX_OCR_PAYLOAD_CHARS + 1)
  assert.deepEqual(parseOcrPages(huge), [])
})
