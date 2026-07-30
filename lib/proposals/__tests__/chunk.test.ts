import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkText } from '../chunk'

/**
 * Ο τεμαχιστής είναι το σημείο όπου μια πρόταση 50 σελίδων γίνεται αναλύσιμη.
 * Δύο αστοχίες θα ήταν σιωπηλές και καταστροφικές: κοπή στη μέση πρότασης
 * (μισές απαιτήσεις που δεν βγάζουν νόημα), και βρόχος που δεν προχωρά.
 */

const PARAGRAPH = 'Η ανάδοχος εταιρεία αναλαμβάνει την εγκατάσταση του συστήματος. '

function textOf(paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, i) => `${PARAGRAPH}(${i})`).join('\n\n')
}

test('κείμενο κάτω από το όριο μένει ένα τεμάχιο', () => {
  const chunks = chunkText('μικρό κείμενο', { maxChars: 1000 })
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].text, 'μικρό κείμενο')
  assert.equal(chunks[0].startOffset, 0)
})

test('κενό κείμενο δεν παράγει τεμάχια', () => {
  assert.deepEqual(chunkText(''), [])
  assert.deepEqual(chunkText('   \n\n  '), [])
})

test('μεγάλο κείμενο σπάει σε πολλά τεμάχια με αύξοντα δείκτη', () => {
  const chunks = chunkText(textOf(200), { maxChars: 2000, overlapChars: 200 })
  assert.ok(chunks.length > 1, 'περίμενα πάνω από ένα τεμάχιο')
  chunks.forEach((c, i) => assert.equal(c.index, i))
})

test('η κοπή γίνεται σε όριο παραγράφου, όχι στη μέση πρότασης', () => {
  const chunks = chunkText(textOf(200), { maxChars: 2000, overlapChars: 200 })
  // Κάθε τεμάχιο εκτός του τελευταίου πρέπει να τελειώνει σε ολοκληρωμένη
  // παράγραφο — δηλαδή στον δείκτη «(ν)» που κλείνει κάθε παράγραφο.
  for (const c of chunks.slice(0, -1)) {
    assert.match(c.text.trimEnd(), /\(\d+\)$/, `κόπηκε στη μέση: …${c.text.slice(-40)}`)
  }
})

test('τα τεμάχια επικαλύπτονται ώστε να μη χάνεται το πλαίσιο', () => {
  const chunks = chunkText(textOf(200), { maxChars: 2000, overlapChars: 400 })
  assert.ok(chunks.length > 2)
  // Η αρχή του δεύτερου τεμαχίου είναι πριν το τέλος του πρώτου.
  const firstEnd = chunks[0].startOffset + chunks[0].text.length
  assert.ok(chunks[1].startOffset < firstEnd, 'δεν υπάρχει επικάλυψη')
})

test('κείμενο χωρίς κανένα κενό κόβεται στο σκληρό όριο αντί να μπλοκάρει', () => {
  const blob = 'α'.repeat(9000)
  const chunks = chunkText(blob, { maxChars: 2000, overlapChars: 100 })
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((c) => c.text.length <= 2000))
})

test('τεράστια επικάλυψη δεν κάνει τον βρόχο αιώνιο', () => {
  // Η επικάλυψη περιορίζεται στο μισό του ορίου· χωρίς αυτό, overlap >= maxChars
  // θα σήμαινε ότι κάθε επόμενη αρχή είναι πριν την προηγούμενη.
  const chunks = chunkText(textOf(100), { maxChars: 1000, overlapChars: 100_000 })
  assert.ok(chunks.length > 0)
  assert.ok(chunks.length < 500, `πολλά τεμάχια: ${chunks.length}`)
})

test('όλο το κείμενο καλύπτεται — καμία παράγραφος δεν χάνεται', () => {
  const source = textOf(120)
  const chunks = chunkText(source, { maxChars: 2000, overlapChars: 300 })
  const joined = chunks.map((c) => c.text).join('\n')
  for (let i = 0; i < 120; i++) {
    assert.ok(joined.includes(`(${i})`), `λείπει η παράγραφος ${i}`)
  }
})
