import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FILE_BYTES, extractProposalText, isSupportedProposalFile, normalizeWhitespace } from '../extract'

/**
 * Η εξαγωγή επιστρέφει αποτέλεσμα αντί να πετάει, και ο λόγος έχει σημασία:
 * το `no-text` ΔΕΝ είναι σφάλμα — είναι η ένδειξη ότι το αρχείο είναι σαρωμένο
 * και πρέπει να περάσει από οπτική αναγνώριση. Αν αυτός ο διαχωρισμός σπάσει,
 * κάθε σαρωμένο PDF θα απορρίπτεται ξανά αντί να διαβάζεται.
 */

test('δέχεται PDF και DOCX, από mimeType ή από επέκταση', () => {
  assert.equal(isSupportedProposalFile('application/pdf', 'x.bin'), true)
  assert.equal(isSupportedProposalFile('application/octet-stream', 'πρόταση.pdf'), true)
  assert.equal(isSupportedProposalFile('application/octet-stream', 'πρόταση.docx'), true)
  assert.equal(isSupportedProposalFile('image/png', 'σάρωση.png'), false)
  assert.equal(isSupportedProposalFile('application/vnd.ms-excel', 'κόστος.xls'), false)
})

test('αρχείο πάνω από το όριο απορρίπτεται πριν καν διαβαστεί', async () => {
  const huge = Buffer.alloc(MAX_FILE_BYTES + 1)
  const out = await extractProposalText(huge, 'application/pdf', 'μεγάλο.pdf')
  assert.equal(out.ok, false)
  assert.equal(out.ok === false && out.reason, 'too-large')
})

test('μη υποστηριζόμενος τύπος δίνει reason=unsupported', async () => {
  const out = await extractProposalText(Buffer.from('κάτι'), 'image/png', 'σάρωση.png')
  assert.equal(out.ok, false)
  assert.equal(out.ok === false && out.reason, 'unsupported')
})

test('χαλασμένο PDF δίνει reason=failed, ΟΧΙ no-text', async () => {
  // Σημασία: το failed δεν ενεργοποιεί OCR. Ένα σπασμένο αρχείο δεν γίνεται
  // καλύτερο περνώντας το από μοντέλο όρασης — γίνεται μόνο ακριβότερο.
  const out = await extractProposalText(Buffer.from('δεν είναι PDF'), 'application/pdf', 'χαλασμένο.pdf')
  assert.equal(out.ok, false)
  assert.equal(out.ok === false && out.reason, 'failed')
})

test('η κανονικοποίηση μαζεύει κενά και κενές γραμμές', () => {
  assert.equal(normalizeWhitespace('Α   Β\r\n\r\n\r\n\r\nΓ'), 'Α Β\n\nΓ')
  assert.equal(normalizeWhitespace('  \n  ΦΑΣΗ 1  \n  '), 'ΦΑΣΗ 1')
})
