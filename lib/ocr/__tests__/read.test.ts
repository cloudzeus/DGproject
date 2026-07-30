import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTranscription } from '../read'

/**
 * Ό,τι επιβιώνει εδώ καταλήγει σε απόσπασμα προέλευσης — δηλαδή σε αυτό που ο
 * χρήστης ανοίγει για να ελέγξει «πού το βρήκε αυτό;». Ένα markdown fence ή
 * μια εισαγωγική φράση του μοντέλου εκεί μοιάζει με κείμενο της πρότασης.
 */

test('markdown fences αφαιρούνται', () => {
  assert.equal(cleanTranscription('```\nΑΝΤΙΚΕΙΜΕΝΟ ΕΡΓΟΥ\n```'), 'ΑΝΤΙΚΕΙΜΕΝΟ ΕΡΓΟΥ')
  assert.equal(cleanTranscription('```text\nΑΝΤΙΚΕΙΜΕΝΟ\n```'), 'ΑΝΤΙΚΕΙΜΕΝΟ')
})

test('εισαγωγική φράση του μοντέλου αφαιρείται', () => {
  assert.equal(
    cleanTranscription('Ορίστε το κείμενο της σελίδας:\n\nΑΝΤΙΚΕΙΜΕΝΟ ΕΡΓΟΥ'),
    'ΑΝΤΙΚΕΙΜΕΝΟ ΕΡΓΟΥ',
  )
  assert.equal(cleanTranscription("Here's the transcription:\n\nΦΑΣΗ 1"), 'ΦΑΣΗ 1')
})

test('πραγματικό κείμενο που ΜΟΙΑΖΕΙ με εισαγωγή δεν κόβεται', () => {
  // Δεν τελειώνει σε άνω κάτω τελεία + κενή γραμμή, άρα δεν είναι πρόλογος.
  const text = 'Ορίστε τα παραδοτέα του έργου σύμφωνα με τη σύμβαση.'
  assert.equal(cleanTranscription(text), text)
})

test('τα πολλαπλά κενά και οι κενές γραμμές κανονικοποιούνται', () => {
  assert.equal(
    cleanTranscription('ΦΑΣΗ   1\n\n\n\nΦΑΣΗ  2'),
    'ΦΑΣΗ 1\n\nΦΑΣΗ 2',
  )
})

test('η δομή πινάκων με | επιβιώνει', () => {
  const table = 'Περιγραφή | Ποσότητα | Τιμή\nΆδεια χρήσης | 10 | 1.200,00'
  assert.equal(cleanTranscription(table), table)
})

test('η σήμανση δυσανάγνωστου διατηρείται', () => {
  assert.ok(cleanTranscription('Παράδοση την [δυσανάγνωστο] εβδομάδα').includes('[δυσανάγνωστο]'))
})

test('κενή είσοδος δίνει κενό, όχι σφάλμα', () => {
  assert.equal(cleanTranscription('   \n\n  '), '')
})
