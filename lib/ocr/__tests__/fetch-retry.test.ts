import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchWithRetry, isRetryableStatus, nextDelayMs } from '../fetch-retry'

/**
 * Το OCR μιας πρότασης 30 σελίδων είναι οκτώ διαδοχικές κλήσεις. Χωρίς
 * επανάληψη, ένα 503 στην τρίτη ρίχνει όλη τη μεταγραφή.
 *
 * Το αντίστροφο μετράει εξίσου: επανάληψη σε 400 ή 401 δεν διορθώνει τίποτα —
 * τετραπλασιάζει μόνο τον χρόνο μέχρι ο χρήστης να δει το πραγματικό σφάλμα.
 */

function response(status: number): Response {
  return new Response('body', { status })
}

/** Ντετερμινιστικό: μηδενική διασπορά, μηδενική αναμονή. */
const deterministic = { rand: () => 0, sleep: async () => {}, baseMs: 100 }

test('παροδικές καταστάσεις επαναλαμβάνονται, οι υπόλοιπες όχι', () => {
  for (const s of [429, 500, 502, 503, 504]) assert.equal(isRetryableStatus(s), true, `${s}`)
  for (const s of [200, 201, 400, 401, 403, 404, 422]) assert.equal(isRetryableStatus(s), false, `${s}`)
})

test('η υποχώρηση διπλασιάζεται σε κάθε προσπάθεια', () => {
  assert.equal(nextDelayMs(0, 600, () => 0), 600)
  assert.equal(nextDelayMs(1, 600, () => 0), 1200)
  assert.equal(nextDelayMs(2, 600, () => 0), 2400)
})

test('η διασπορά προστίθεται έως το μισό του βήματος', () => {
  assert.equal(nextDelayMs(0, 600, () => 0.999), 600 + 299)
  assert.ok(nextDelayMs(0, 600, () => 1) <= 600 + 300)
})

test('επιτυχία με την πρώτη δεν ξανακαλεί', async () => {
  let calls = 0
  const res = await fetchWithRetry('https://x.test', {}, {
    ...deterministic,
    fetchImpl: async () => { calls++; return response(200) },
  })
  assert.equal(calls, 1)
  assert.equal(res.status, 200)
})

test('503 και μετά 200 → επιστρέφει την επιτυχία', async () => {
  let calls = 0
  const res = await fetchWithRetry('https://x.test', {}, {
    ...deterministic,
    fetchImpl: async () => { calls++; return response(calls === 1 ? 503 : 200) },
  })
  assert.equal(calls, 2)
  assert.equal(res.status, 200)
})

test('400 δεν επαναλαμβάνεται — δεν γίνεται καλύτερο με αναμονή', async () => {
  let calls = 0
  const res = await fetchWithRetry('https://x.test', {}, {
    ...deterministic,
    fetchImpl: async () => { calls++; return response(400) },
  })
  assert.equal(calls, 1)
  assert.equal(res.status, 400)
})

test('εξαντλημένες προσπάθειες επιστρέφουν την πραγματική κατάσταση, όχι σκέτο σφάλμα', async () => {
  let calls = 0
  const res = await fetchWithRetry('https://x.test', {}, {
    ...deterministic,
    attempts: 3,
    fetchImpl: async () => { calls++; return response(503) },
  })
  assert.equal(calls, 3)
  assert.equal(res.status, 503)
})

test('σφάλμα δικτύου ξαναπετιέται μόνο μετά την τελευταία προσπάθεια', async () => {
  let calls = 0
  await assert.rejects(
    fetchWithRetry('https://x.test', {}, {
      ...deterministic,
      attempts: 2,
      fetchImpl: async () => { calls++; throw new Error('ECONNRESET') },
    }),
    /ECONNRESET/,
  )
  assert.equal(calls, 2)
})

test('σφάλμα δικτύου που περνά στη δεύτερη προσπάθεια δεν πετάει', async () => {
  let calls = 0
  const res = await fetchWithRetry('https://x.test', {}, {
    ...deterministic,
    fetchImpl: async () => {
      calls++
      if (calls === 1) throw new Error('ECONNRESET')
      return response(200)
    },
  })
  assert.equal(res.status, 200)
})
