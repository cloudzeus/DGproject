import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseContractCoverage } from '../coverage'

const valid = {
  coverage: 'covered',
  confidence: 0.87,
  evidence: 'Παράδοση και παραμετροποίηση της εφαρμογής.',
  explanation: 'Το έργο περιγράφεται ρητά στη σύμβαση.',
}

test('parses valid contract coverage JSON', () => {
  assert.deepEqual(parseContractCoverage(JSON.stringify(valid)), valid)
})

test('accepts JSON inside markdown fences and numeric confidence', () => {
  const result = parseContractCoverage(`\`\`\`json\n${JSON.stringify({ ...valid, confidence: '0.5' })}\n\`\`\``)
  assert.equal(result.coverage, 'covered')
  assert.equal(result.confidence, 0.5)
})

test('covered and partial require evidence', () => {
  for (const coverage of ['covered', 'partial']) {
    assert.throws(
      () => parseContractCoverage(JSON.stringify({ ...valid, coverage, evidence: '  ' })),
      /αυτούσιο απόσπασμα/,
    )
  }
})

test('not_found and unclear may have null evidence', () => {
  for (const coverage of ['not_found', 'unclear']) {
    const result = parseContractCoverage(JSON.stringify({ ...valid, coverage, evidence: null }))
    assert.equal(result.coverage, coverage)
    assert.equal(result.evidence, null)
  }
})

test('rejects invalid coverage, confidence, JSON and explanation', () => {
  assert.throws(() => parseContractCoverage(JSON.stringify({ ...valid, coverage: 'yes' })), /βαθμό κάλυψης/)
  for (const confidence of [-0.1, 1.1, 'unknown']) {
    assert.throws(() => parseContractCoverage(JSON.stringify({ ...valid, confidence })), /βεβαιότητα/)
  }
  assert.throws(() => parseContractCoverage('{broken'), /έγκυρο JSON/)
  assert.throws(() => parseContractCoverage(JSON.stringify({ ...valid, explanation: '' })), /εξήγηση/)
})
