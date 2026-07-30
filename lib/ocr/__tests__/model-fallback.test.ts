import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildModelChain, tryModels } from '../model-fallback'

test('η αλυσίδα βάζει πρώτο το κύριο μοντέλο', () => {
  assert.deepEqual(buildModelChain('a', ['b', 'c']), ['a', 'b', 'c'])
})

test('διπλά και κενά φεύγουν από την αλυσίδα', () => {
  assert.deepEqual(buildModelChain('a', [' a ', '', '  ', 'b', 'b']), ['a', 'b'])
})

test('χωρίς εναλλακτικά, η αλυσίδα είναι μόνο το κύριο', () => {
  assert.deepEqual(buildModelChain('a', []), ['a'])
})

test('το πρώτο μοντέλο που πετυχαίνει σταματά την αλυσίδα', async () => {
  const tried: string[] = []
  const value = await tryModels(['a', 'b', 'c'], async (m) => {
    tried.push(m)
    return { ok: true, value: m }
  })
  assert.equal(value, 'a')
  assert.deepEqual(tried, ['a'])
})

test('αποτυχία περνά στο επόμενο μοντέλο', async () => {
  const tried: string[] = []
  const value = await tryModels(['a', 'b'], async (m) => {
    tried.push(m)
    return m === 'a' ? { ok: false, error: new Error('υπερφόρτωση') } : { ok: true, value: m }
  })
  assert.equal(value, 'b')
  assert.deepEqual(tried, ['a', 'b'])
})

test('σε ολική αποτυχία πετιέται το σφάλμα του ΠΡΩΤΟΥ μοντέλου', async () => {
  // Το σφάλμα του κύριου («υψηλή ζήτηση») είναι το χρήσιμο. Ένα «δεν βρέθηκε
  // μοντέλο» από κακορυθμισμένο εναλλακτικό θα έστελνε τον χρήστη αλλού.
  await assert.rejects(
    tryModels(['a', 'b'], async (m) => ({
      ok: false,
      error: new Error(m === 'a' ? 'υψηλή ζήτηση' : 'δεν βρέθηκε μοντέλο'),
    })),
    /υψηλή ζήτηση/,
  )
})

test('κενή αλυσίδα πετάει αντί να επιστρέψει undefined', async () => {
  await assert.rejects(tryModels([], async () => ({ ok: true, value: 1 })), /Δεν δοκιμάστηκε/)
})
