import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNameMap,
  maskProposalPII,
  pseudonymizeNames,
  restoreNames,
} from '../mask'

/**
 * Η μάσκα είναι η πύλη προς την Κίνα. Ένα κενό εδώ δεν είναι κοσμητικό — είναι
 * διαρροή προσωπικών δεδομένων πελάτη σε τρίτη χώρα.
 *
 * Ελέγχεται και η αντίστροφη αστοχία: υπερβολικά επιθετική μάσκα που κρύβει
 * χρονολογίες και ποσά αχρηστεύει την ανάλυση.
 */

test('κρύβει email', () => {
  const out = maskProposalPII('Επικοινωνία: giannis@dgsmart.gr για λεπτομέρειες.')
  assert.ok(!out.includes('giannis@dgsmart.gr'))
  assert.ok(out.includes('[email]'))
})

test('κρύβει ελληνικά τηλέφωνα σε διάφορες μορφές', () => {
  for (const phone of ['210 1234567', '+30 210 123 4567', '6971234567', '(210) 123-4567']) {
    const out = maskProposalPII(`Τηλέφωνο ${phone} για ραντεβού.`)
    assert.ok(out.includes('[τηλέφωνο]'), `δεν κρύφτηκε: ${phone}`)
    assert.ok(!out.includes(phone), `διέρρευσε: ${phone}`)
  }
})

test('κρύβει ΑΦΜ, και όταν ακολουθεί στίξη', () => {
  for (const text of ['ΑΦΜ: 123456789, ΔΟΥ Παλλήνης.', 'ΑΦΜ 123456789.', 'ΑΦΜ 123456789 ΔΟΥ']) {
    const out = maskProposalPII(text)
    assert.ok(out.includes('[ΑΦΜ]'), `δεν κρύφτηκε: ${text}`)
    assert.ok(!out.includes('123456789'), `διέρρευσε: ${text}`)
  }
})

test('ΔΕΝ κρύβει εννιαψήφιο μέσα σε ποσό', () => {
  const out = maskProposalPII('Ποσό 45.123456789,00 ευρώ.')
  assert.ok(!out.includes('[ΑΦΜ]'), `ποσό μασκαρίστηκε ως ΑΦΜ: ${out}`)
})

test('κρύβει IBAN', () => {
  const out = maskProposalPII('Κατάθεση σε GR1601101250000000012300695.')
  assert.ok(out.includes('[IBAN]'))
  assert.ok(!out.includes('GR1601101250000000012300695'))
})

test('ΔΕΝ κρύβει χρονολογίες — μια πρόταση είναι γεμάτη από αυτές', () => {
  const out = maskProposalPII('Διάρκεια έργου 2026 - 2027, παράδοση σε 12 μήνες.')
  assert.ok(!out.includes('[τηλέφωνο]'), `χρονολογία μασκαρίστηκε: ${out}`)
  assert.ok(out.includes('2026'))
})

test('ΔΕΝ κρύβει ποσά — χρειάζονται για την εκτίμηση μεγέθους', () => {
  const out = maskProposalPII('Συνολικό κόστος 45.000,00 € πλέον ΦΠΑ.')
  assert.ok(out.includes('45.000,00'), `το ποσό χάθηκε: ${out}`)
})

test('τα ονόματα εταιρειών γίνονται ψευδώνυμα και επανέρχονται', () => {
  const map = buildNameMap(['ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ', 'DGsmart'])
  const masked = pseudonymizeNames('Ο ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ αναθέτει στη DGsmart το έργο.', map)

  assert.ok(!masked.includes('ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ'))
  assert.ok(!masked.includes('DGsmart'))

  const restored = restoreNames(masked, map)
  assert.equal(restored, 'Ο ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ αναθέτει στη DGsmart το έργο.')
})

test('το μακρύτερο όνομα αντικαθίσταται πρώτο', () => {
  // Χωρίς ταξινόμηση κατά μήκος, το «ΔΗΜΟΣ» θα έτρωγε το πρόθεμα του
  // «ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ» και θα άφηνε πίσω σκουπίδια.
  const map = buildNameMap(['ΔΗΜΟΣ', 'ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ'])
  const masked = pseudonymizeNames('Ο ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ υπογράφει.', map)
  assert.ok(!masked.includes('ΘΕΣΣΑΛΟΝΙΚΗΣ'), `έμεινε υπόλειμμα: ${masked}`)
})

test('πολύ σύντομα ονόματα αγνοούνται ώστε να μη σφαγιαστεί το κείμενο', () => {
  const map = buildNameMap(['ΑΒ', ''])
  assert.equal(map.size, 0)
})
