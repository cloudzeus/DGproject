import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAGES_PER_BATCH, ocrPagesToText, type VisionGenerator } from '../read'
import type { GeminiResult } from '../gemini'
import type { RasterizedPage } from '../rasterize'

/**
 * Η μεταγραφή 30 σελίδων είναι οκτώ διαδοχικές κλήσεις. Τρία πράγματα σπάνε
 * εδώ σιωπηλά, και κανένα δεν φαίνεται στο αποτέλεσμα αν δεν μετρηθεί:
 *
 *   1. **Σειρά.** Αν οι παρτίδες μπερδευτούν, το κείμενο βγαίνει ανακατεμένο
 *      και τα αποσπάσματα προέλευσης δείχνουν σε λάθος σημείο.
 *   2. **Τρύπα.** Μια παρτίδα που χάνεται αφήνει κενό στη μέση της πρότασης
 *      χωρίς κανένα ίχνος — γι' αυτό μετριούνται οι σελίδες που απέτυχαν.
 *   3. **Ψευδής επιτυχία.** Αν αποτύχουν όλες, το «πέτυχε με κενό κείμενο»
 *      θα περνούσε μια άδεια ανάλυση για έγκυρη.
 */

function page(n: number): RasterizedPage {
  return { base64: `σελίδα-${n}`, mimeType: 'image/webp', width: 100, height: 140 }
}

function pages(count: number): RasterizedPage[] {
  return Array.from({ length: count }, (_, i) => page(i + 1))
}

function result(text: string): GeminiResult {
  return { text, model: 'gemini-test', inputTokens: 10, outputTokens: 5, durationMs: 100 }
}

/** Καταγράφει κάθε κλήση και απαντά με το πλήθος εικόνων που πήρε. */
function recorder(behaviour?: (call: number) => GeminiResult) {
  const calls: number[] = []
  const generate: VisionGenerator = async ({ parts }) => {
    const images = parts.filter((p) => 'inlineData' in p).length
    calls.push(images)
    return behaviour ? behaviour(calls.length) : result(`κείμενο-${calls.length}`)
  }
  return { calls, generate }
}

test('10 σελίδες χωρίζονται σε παρτίδες των 4: 4 + 4 + 2', async () => {
  const { calls, generate } = recorder()
  const out = await ocrPagesToText(pages(10), { generate })

  assert.deepEqual(calls, [4, 4, 2])
  assert.equal(out.pagesRead, 10)
  assert.equal(PAGES_PER_BATCH, 4)
})

test('μία σελίδα δίνει μία κλήση', async () => {
  const { calls, generate } = recorder()
  const out = await ocrPagesToText(pages(1), { generate })
  assert.deepEqual(calls, [1])
  assert.equal(out.pagesRead, 1)
})

test('η σειρά των παρτίδων διατηρείται στο τελικό κείμενο', async () => {
  const { generate } = recorder((n) => result(`ΤΜΗΜΑ_${n}`))
  const out = await ocrPagesToText(pages(9), { generate })

  const order = out.text.split('\n\n')
  assert.deepEqual(order, ['ΤΜΗΜΑ_1', 'ΤΜΗΜΑ_2', 'ΤΜΗΜΑ_3'])
})

test('οι εικόνες φεύγουν με τη σειρά τους μέσα στην παρτίδα', async () => {
  const seen: string[] = []
  const generate: VisionGenerator = async ({ parts }) => {
    for (const p of parts) if ('inlineData' in p) seen.push(p.inlineData.data)
    return result('ok')
  }
  await ocrPagesToText(pages(6), { generate })
  assert.deepEqual(seen, ['σελίδα-1', 'σελίδα-2', 'σελίδα-3', 'σελίδα-4', 'σελίδα-5', 'σελίδα-6'])
})

test('παρτίδα που αποτυγχάνει καταγράφει ΤΙΣ ΣΕΛΙΔΕΣ της, οι υπόλοιπες περνούν', async () => {
  const { generate } = recorder((n) => {
    if (n === 2) throw new Error('503 υψηλή ζήτηση')
    return result(`ΤΜΗΜΑ_${n}`)
  })
  const out = await ocrPagesToText(pages(10), { generate })

  assert.deepEqual(out.failedPages, [5, 6, 7, 8], 'η δεύτερη παρτίδα είναι οι σελίδες 5-8')
  assert.equal(out.pagesRead, 6, 'διαβάστηκαν οι 4 της πρώτης και οι 2 της τρίτης')
  assert.equal(out.text, 'ΤΜΗΜΑ_1\n\nΤΜΗΜΑ_3')
})

test('αν αποτύχουν ΟΛΕΣ οι παρτίδες, πετάει — δεν επιστρέφει κενή μεταγραφή', async () => {
  const { generate } = recorder(() => {
    throw new Error('το Gemini δεν απαντά')
  })
  await assert.rejects(ocrPagesToText(pages(8), { generate }), /Καμία σελίδα δεν διαβάστηκε/)
})

test('χωρίς σελίδες πετάει αντί να καλέσει το μοντέλο', async () => {
  const { calls, generate } = recorder()
  await assert.rejects(ocrPagesToText([], { generate }), /Δεν δόθηκαν σελίδες/)
  assert.deepEqual(calls, [])
})

test('τα tokens και ο χρόνος αθροίζονται σε όλες τις παρτίδες', async () => {
  const { generate } = recorder()
  const out = await ocrPagesToText(pages(9), { generate })

  assert.equal(out.inputTokens, 30, 'τρεις παρτίδες × 10')
  assert.equal(out.outputTokens, 15)
  assert.equal(out.durationMs, 300)
  assert.equal(out.model, 'gemini-test')
})

test('τα υπολείμματα του μοντέλου καθαρίζονται πριν μπουν στη μεταγραφή', async () => {
  const { generate } = recorder(() => result('```\nΑΝΤΙΚΕΙΜΕΝΟ ΕΡΓΟΥ\n```'))
  const out = await ocrPagesToText(pages(2), { generate })
  assert.equal(out.text, 'ΑΝΤΙΚΕΙΜΕΝΟ ΕΡΓΟΥ')
})

test('η οδηγία συστήματος ζητά πιστή μεταγραφή, όχι περίληψη', async () => {
  let system = ''
  const generate: VisionGenerator = async (args) => {
    system = args.systemInstruction ?? ''
    return result('ok')
  }
  await ocrPagesToText(pages(1), { generate })

  assert.match(system, /ΠΙΣΤΑ/)
  assert.match(system, /Δεν συνοψίζεις/)
  assert.match(system, /δυσανάγνωστο/)
})
