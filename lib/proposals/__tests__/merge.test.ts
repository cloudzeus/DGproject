import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeItems, normalizeTitle, sortItems } from '../merge'
import type { ExtractedItem } from '../types'

/**
 * Η επικάλυψη του τεμαχισμού είναι σκόπιμη — και παράγει διπλά. Αν δεν φύγουν
 * εδώ, ο χρήστης βλέπει την ίδια φάση δύο φορές και τη δημιουργεί δύο φορές.
 */

function item(over: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    kind: 'step',
    title: 'Ανάλυση απαιτήσεων',
    description: '',
    sourceQuote: 'απόσπασμα',
    confidence: 0.8,
    suggestedOffsetDays: null,
    estimatedHours: null,
    priority: null,
    requirementCategory: null,
    ...over,
  }
}

test('η κανονικοποίηση αγνοεί τόνους, πεζά/κεφαλαία και στίξη', () => {
  assert.equal(normalizeTitle('Ανάλυση Απαιτήσεων'), normalizeTitle('ΑΝΑΛΥΣΗ ΑΠΑΙΤΗΣΕΩΝ'))
  assert.equal(normalizeTitle('Εγκατάσταση — Φάση 1'), normalizeTitle('εγκατασταση φαση 1'))
})

test('το τελικό σίγμα ταυτίζεται με το μεσαίο', () => {
  assert.equal(normalizeTitle('τέλος'), normalizeTitle('τελοσ'))
})

test('διπλά με ίδιο τίτλο ενώνονται σε ένα', () => {
  const out = dedupeItems([item(), item(), item()])
  assert.equal(out.length, 1)
})

test('ίδιος τίτλος σε διαφορετικό είδος ΔΕΝ ενώνεται', () => {
  const out = dedupeItems([item({ kind: 'step' }), item({ kind: 'requirement' })])
  assert.equal(out.length, 2)
})

test('η πληρέστερη εκδοχή κερδίζει', () => {
  const out = dedupeItems([
    item({ description: '', confidence: 0.9 }),
    item({ description: 'Αναλυτική περιγραφή της φάσης', confidence: 0.5 }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].description, 'Αναλυτική περιγραφή της φάσης')
})

test('ο ηττημένος συμπληρώνει ό,τι λείπει από τον νικητή', () => {
  // Η ημερομηνία εμφανίστηκε μόνο στο ένα τεμάχιο· δεν πρέπει να χαθεί επειδή
  // το άλλο τεμάχιο είχε καλύτερη περιγραφή.
  const out = dedupeItems([
    item({ description: 'Πλήρης περιγραφή εδώ', suggestedOffsetDays: null }),
    item({ description: '', suggestedOffsetDays: 21, estimatedHours: 16 }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].suggestedOffsetDays, 21)
  assert.equal(out[0].estimatedHours, 16)
  assert.equal(out[0].description, 'Πλήρης περιγραφή εδώ')
})

test('η βεβαιότητα που κρατιέται είναι η υψηλότερη', () => {
  const out = dedupeItems([item({ confidence: 0.4 }), item({ confidence: 0.95 })])
  assert.equal(out[0].confidence, 0.95)
})

test('η ταξινόμηση βάζει βήματα, ορόσημα, απαιτήσεις — με σταθερή εσωτερική σειρά', () => {
  const out = sortItems([
    item({ kind: 'requirement', title: 'Α' }),
    item({ kind: 'step', title: 'Β' }),
    item({ kind: 'milestone', title: 'Γ' }),
    item({ kind: 'step', title: 'Δ' }),
  ])
  assert.deepEqual(
    out.map((i) => i.title),
    ['Β', 'Δ', 'Γ', 'Α'],
  )
})
