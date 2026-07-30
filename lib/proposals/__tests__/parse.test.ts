import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChunkExtraction, parseMergeDecisions } from '../parse'

/**
 * Ο parser είναι η άμυνα απέναντι σε επινοήσεις του μοντέλου.
 *
 * Ο κανόνας που ελέγχεται πιο αυστηρά εδώ: **χωρίς απόσπασμα, πέταμα**. Ένα
 * βήμα που το μοντέλο «συμπλήρωσε λογικά» μπαίνει σαν εργασία στο έργο και
 * κανείς δεν το ξαναρωτά — γι' αυτό δεν του δίνεται δεύτερη ευκαιρία.
 */

function wrap(items: unknown[]): string {
  return JSON.stringify({ summary: 'σύνοψη', items })
}

test('διαβάζει έγκυρη απάντηση', () => {
  const out = parseChunkExtraction(
    wrap([
      {
        kind: 'milestone',
        title: 'Παράδοση πρώτης φάσης',
        description: 'Εγκατάσταση και παραμετροποίηση',
        sourceQuote: 'Η πρώτη φάση παραδίδεται την 3η εβδομάδα',
        confidence: 0.9,
        suggestedOffsetDays: 21,
        estimatedHours: 40,
        priority: 'high',
      },
    ]),
  )
  assert.equal(out.summary, 'σύνοψη')
  assert.equal(out.items.length, 1)
  assert.equal(out.items[0].kind, 'milestone')
  assert.equal(out.items[0].suggestedOffsetDays, 21)
  assert.equal(out.items[0].priority, 'high')
})

test('αντικείμενο ΧΩΡΙΣ απόσπασμα απορρίπτεται — είναι επινόηση', () => {
  const out = parseChunkExtraction(
    wrap([
      { kind: 'step', title: 'Δοκιμές αποδοχής', sourceQuote: '' },
      { kind: 'step', title: 'Εκπαίδευση χρηστών' },
    ]),
  )
  assert.equal(out.items.length, 0)
})

test('αντικείμενο με πολύ σύντομο τίτλο απορρίπτεται', () => {
  const out = parseChunkExtraction(wrap([{ kind: 'step', title: 'Α', sourceQuote: 'κάτι' }]))
  assert.equal(out.items.length, 0)
})

test('άγνωστο είδος πέφτει σε step αντί να ρίξει την ανάλυση', () => {
  const out = parseChunkExtraction(
    wrap([{ kind: 'φάση', title: 'Εγκατάσταση', sourceQuote: 'κείμενο' }]),
  )
  assert.equal(out.items[0].kind, 'step')
})

test('η κατηγορία απαίτησης κρατιέται μόνο για απαιτήσεις', () => {
  const out = parseChunkExtraction(
    wrap([
      { kind: 'step', title: 'Εγκατάσταση', sourceQuote: 'κ', requirementCategory: 'τεχνική' },
      { kind: 'requirement', title: 'Διαθεσιμότητα 99%', sourceQuote: 'κ', requirementCategory: 'τεχνική' },
    ]),
  )
  assert.equal(out.items[0].requirementCategory, null)
  assert.equal(out.items[1].requirementCategory, 'τεχνική')
})

test('η βεβαιότητα περιορίζεται στο [0,1]', () => {
  const out = parseChunkExtraction(
    wrap([
      { kind: 'step', title: 'Πρώτο', sourceQuote: 'κ', confidence: 5 },
      { kind: 'step', title: 'Δεύτερο', sourceQuote: 'κ', confidence: -3 },
    ]),
  )
  assert.equal(out.items[0].confidence, 1)
  assert.equal(out.items[1].confidence, 0)
})

test('αρνητικές ώρες αγνοούνται αντί να γίνουν εργασία με -8 ώρες', () => {
  const out = parseChunkExtraction(
    wrap([{ kind: 'step', title: 'Εγκατάσταση', sourceQuote: 'κ', estimatedHours: -8 }]),
  )
  assert.equal(out.items[0].estimatedHours, null)
})

test('markdown fences γύρω από το JSON αφαιρούνται', () => {
  const out = parseChunkExtraction(
    '```json\n' + wrap([{ kind: 'step', title: 'Εγκατάσταση', sourceQuote: 'κ' }]) + '\n```',
  )
  assert.equal(out.items.length, 1)
})

test('κακοσχηματισμένο JSON πετάει σφάλμα με ορατό δείγμα', () => {
  assert.throws(() => parseChunkExtraction('δεν είναι json'), /δεν επέστρεψε έγκυρο JSON/)
})

test('λίστα items που λείπει δίνει κενό αποτέλεσμα, όχι κατάρρευση', () => {
  const out = parseChunkExtraction(JSON.stringify({ summary: 'μόνο σύνοψη' }))
  assert.deepEqual(out.items, [])
  assert.equal(out.summary, 'μόνο σύνοψη')
})

test('η συγχώνευση απορρίπτει δείκτες εκτός ορίων — σημαίνει επινόηση', () => {
  const decisions = parseMergeDecisions(
    JSON.stringify({
      items: [
        { kind: 'step', title: 'Υπαρκτό', keepIndexes: [0, 1] },
        { kind: 'step', title: 'Φανταστικό', keepIndexes: [99] },
      ],
    }),
    3,
  )
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0].title, 'Υπαρκτό')
})
