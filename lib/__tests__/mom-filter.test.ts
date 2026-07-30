import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterMomInsights, type MomInsights } from '../meeting-mom'

/**
 * Το φίλτρο επιλογής των πρακτικών είναι η πύλη ορατότητας του portal.
 *
 * Δεν ελέγχεται εδώ «η μορφοποίηση του email» — ελέγχεται ότι ΟΤΙ ΞΕΤΣΕΚΑΡΕ η
 * ομάδα δεν επιστρέφεται. Το ίδιο αποτέλεσμα τροφοδοτεί και το email και το
 * portal, οπότε μια αστοχία εδώ είναι διαρροή, όχι κοσμητικό πρόβλημα.
 */

const SAMPLE: MomInsights = {
  summary: 'Σύνοψη σύσκεψης',
  decisions: [
    { text: 'Απόφαση Α', timestampSec: 10, participantEmails: ['a@x.gr'] },
    { text: 'Απόφαση Β', timestampSec: 20, participantEmails: [] },
    { text: 'Απόφαση Γ', timestampSec: 30, participantEmails: [] },
  ],
  actionItems: [
    {
      title: 'Ενέργεια Α',
      description: '',
      assigneeEmail: null,
      dueDate: null,
      priority: 'medium',
      confidence: 0.9,
      sourceQuote: '',
      sourceTimestampSec: 0,
    },
  ],
  risks: [
    { text: 'Ο πελάτης καθυστερεί τις εγκρίσεις', severity: 'high', ownerEmail: null },
    { text: 'Ασαφές scope', severity: 'medium', ownerEmail: null },
  ],
  openQuestions: [{ question: 'Ποιος αναλαμβάνει;', askedToEmail: null, askedByEmail: null }],
}

test('χωρίς φίλτρο επιστρέφονται όλα', () => {
  const out = filterMomInsights(SAMPLE)
  assert.equal(out.decisions.length, 3)
  assert.equal(out.risks.length, 2)
  assert.equal(out.summary, 'Σύνοψη σύσκεψης')
})

test('κενός πίνακας indexes κόβει ΟΛΗ την ενότητα', () => {
  // Αυτή είναι η προεπιλογή της δημοσίευσης για τα ρίσκα.
  const out = filterMomInsights(SAMPLE, { riskIndexes: [] })
  assert.deepEqual(out.risks, [])
  // Οι υπόλοιπες ενότητες μένουν ανέπαφες.
  assert.equal(out.decisions.length, 3)
  assert.equal(out.actionItems.length, 1)
})

test('undefined indexes σημαίνει «όλα», όχι «κανένα»', () => {
  const out = filterMomInsights(SAMPLE, { summary: true })
  assert.equal(out.risks.length, 2)
  assert.equal(out.decisions.length, 3)
})

test('επιλεγμένα indexes κρατούν μόνο αυτά, με τη σειρά που δόθηκαν', () => {
  const out = filterMomInsights(SAMPLE, { decisionIndexes: [2, 0] })
  assert.deepEqual(
    out.decisions.map((d) => d.text),
    ['Απόφαση Γ', 'Απόφαση Α'],
  )
})

test('summary:false αφαιρεί την περίληψη', () => {
  const out = filterMomInsights(SAMPLE, { summary: false })
  assert.equal(out.summary, null)
})

test('index εκτός ορίων αγνοείται αντί να παράγει κενή θέση', () => {
  const out = filterMomInsights(SAMPLE, { decisionIndexes: [0, 99] })
  assert.equal(out.decisions.length, 1)
  assert.equal(out.decisions[0].text, 'Απόφαση Α')
})

test('ξετσεκαρισμένο ρίσκο δεν διαρρέει σε καμία ενότητα', () => {
  const out = filterMomInsights(SAMPLE, { riskIndexes: [1] })
  const serialized = JSON.stringify(out)
  assert.equal(serialized.includes('καθυστερεί τις εγκρίσεις'), false)
  assert.equal(serialized.includes('Ασαφές scope'), true)
})
