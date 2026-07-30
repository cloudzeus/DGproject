/**
 * Integration test ενάντια στη ζωντανή βάση, με ψεύτικο μοντέλο.
 *
 * Η επαναδημιουργία είναι η μόνη λειτουργία που ΑΝΤΙΚΑΘΙΣΤΑ δουλειά αντί να
 * προσθέτει. Τρία πράγματα πρέπει να ισχύουν, και κανένα δεν φαίνεται στην
 * οθόνη αν σπάσει:
 *
 *   1. Το αρχικό δεν χάνεται — μένει σε `replaced` με τη διευκρίνιση πάνω του.
 *   2. Τα παιδιά δείχνουν πίσω στο αρχικό, αλλιώς η ιχνηλασία σπάει.
 *   3. Η ανάθεση επιβιώνει: την έβαλε άνθρωπος, δεν την πρότεινε το μοντέλο.
 *
 * Τρέξε:  npm test regenerate
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { findQuoteWindow, regenerateProposalItem } from '@/lib/proposals/regenerate'
import { persistItems } from '@/lib/proposals/analyze'
import type { ExtractedItem } from '@/lib/proposals/types'

const TAG = `regen-${process.pid}`

let staffId = ''
let projectId = ''
let analysisId = ''
let itemId = ''

/** Ψεύτικο μοντέλο: γυρίζει όσα αντικείμενα του ζητήσουμε. */
function fakeLlm(items: Array<Partial<ExtractedItem> & { title: string }>) {
  return async () => ({
    raw: JSON.stringify({
      summary: '',
      items: items.map((i) => ({
        kind: i.kind ?? 'step',
        title: i.title,
        description: i.description ?? '',
        sourceQuote: i.sourceQuote ?? 'απόσπασμα',
        confidence: i.confidence ?? 0.9,
        suggestedOffsetDays: i.suggestedOffsetDays ?? null,
        estimatedHours: i.estimatedHours ?? null,
        priority: i.priority ?? null,
        requirementCategory: null,
      })),
    }),
    provider: 'fake',
    model: 'fake',
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
  })
}

before(async () => {
  const workspace = await prisma.workspace.findFirst({ select: { id: true } })
  const staff = await prisma.user.findFirst({ where: { userType: 'employee' }, select: { id: true } })
  assert.ok(workspace && staff, 'χρειάζεται workspace και employee στη βάση')
  staffId = staff.id

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: `${TAG}-Έργο`,
      color: '#0078D4',
      icon: 'Rocket',
      ownerId: staff.id,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
  projectId = project.id

  const analysis = await prisma.proposalAnalysis.create({
    data: {
      projectId: project.id,
      fileName: 'προσφορά.pdf',
      mimeType: 'application/pdf',
      extractedText: 'Η εγκατάσταση περιλαμβάνει μελέτη, καλωδίωση και παραμετροποίηση του συστήματος.',
      charCount: 82,
      status: 'ready',
      createdById: staff.id,
    },
  })
  analysisId = analysis.id

  const item = await prisma.proposalItem.create({
    data: {
      analysisId: analysis.id,
      kind: 'step',
      title: `${TAG}-Εγκατάσταση`,
      description: 'Εγκατάσταση συστήματος',
      sourceQuote: 'Η εγκατάσταση περιλαμβάνει μελέτη, καλωδίωση και παραμετροποίηση',
      confidence: 0.8,
      order: 3,
      visibility: 'internal',
      assigneeId: staff.id,
    },
  })
  itemId = item.id
})

after(async () => {
  await prisma.proposalItem.deleteMany({ where: { analysisId } })
  await prisma.proposalAnalysis.deleteMany({ where: { projectId } })
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.$disconnect()
})

test('πολύ σύντομη διευκρίνιση απορρίπτεται πριν καν κληθεί το μοντέλο', async () => {
  let called = false
  await assert.rejects(
    regenerateProposalItem({
      itemId,
      clarification: 'ναι',
      call: async () => {
        called = true
        throw new Error('δεν έπρεπε να κληθεί')
      },
    }),
    /πιο αναλυτικά/,
  )
  assert.equal(called, false)
})

test('μία διευκρίνιση σπάει ένα βήμα σε τρία', async () => {
  const result = await regenerateProposalItem({
    itemId,
    clarification: 'Αυτό είναι τρία ξεχωριστά βήματα: μελέτη, καλωδίωση, παραμετροποίηση.',
    call: fakeLlm([
      { title: `${TAG}-Μελέτη` },
      { title: `${TAG}-Καλωδίωση` },
      { title: `${TAG}-Παραμετροποίηση` },
    ]),
  })

  assert.equal(result.created, 3)
  assert.equal(result.titles.length, 3)
})

test('το αρχικό μένει στη βάση ως αντικατεστημένο, με τη διευκρίνιση πάνω του', async () => {
  const original = await prisma.proposalItem.findUnique({ where: { id: itemId } })
  assert.ok(original, 'το αρχικό ΔΕΝ πρέπει να σβηστεί')
  assert.equal(original.status, 'replaced')
  assert.match(original.clarification ?? '', /τρία ξεχωριστά βήματα/)
})

test('τα παιδιά δείχνουν πίσω στο αρχικό και μπαίνουν στη θέση του', async () => {
  const children = await prisma.proposalItem.findMany({
    where: { regeneratedFromId: itemId },
    orderBy: { order: 'asc' },
  })

  assert.equal(children.length, 3)
  assert.deepEqual(children.map((c) => c.order), [3, 4, 5], 'ξεκινούν από τη σειρά του αρχικού')
  assert.ok(children.every((c) => c.status === 'draft'))
})

test('η ανάθεση και η ορατότητα επιβιώνουν — τις έβαλε άνθρωπος', async () => {
  const children = await prisma.proposalItem.findMany({ where: { regeneratedFromId: itemId } })
  assert.ok(children.every((c) => c.assigneeId === staffId), 'χάθηκε η ανάθεση')
  assert.ok(children.every((c) => c.visibility === 'internal'), 'χάθηκε η ορατότητα')
})

test('αντικείμενο που έχει ήδη αντικατασταθεί δεν ξαναφτιάχνεται', async () => {
  await assert.rejects(
    regenerateProposalItem({
      itemId,
      clarification: 'κάτι άλλο εντελώς διαφορετικό',
      call: fakeLlm([{ title: 'ό,τι να ναι' }]),
    }),
    /έχει ήδη αντικατασταθεί/i,
  )
})

test('νέα ανάλυση ΔΕΝ σβήνει ό,τι προέκυψε από διευκρίνιση', async () => {
  // Χωρίς αυτό, το κουμπί «νέα ανάλυση» θα έσβηνε την ανθρώπινη γνώση και θα
  // ξαναέφερνε ακριβώς το βήμα που ο χρήστης μόλις διόρθωσε.
  const fresh: ExtractedItem[] = [
    {
      kind: 'step',
      title: `${TAG}-Νέο από ανάλυση`,
      description: '',
      sourceQuote: 'απόσπασμα',
      confidence: 0.9,
      suggestedOffsetDays: null,
      estimatedHours: null,
      priority: null,
      requirementCategory: null,
    },
  ]
  await persistItems(analysisId, fresh)

  const survivors = await prisma.proposalItem.findMany({ where: { analysisId } })
  const titles = survivors.map((s) => s.title)

  assert.ok(titles.includes(`${TAG}-Μελέτη`), 'χάθηκε παιδί διευκρίνισης')
  assert.ok(titles.includes(`${TAG}-Καλωδίωση`))
  assert.ok(titles.includes(`${TAG}-Παραμετροποίηση`))
  assert.ok(titles.includes(`${TAG}-Εγκατάσταση`), 'χάθηκε το αντικατεστημένο αρχικό')
  assert.ok(titles.includes(`${TAG}-Νέο από ανάλυση`))
})

// ── καθαρή συνάρτηση ──

test('το παράθυρο πλαισίου κόβεται γύρω από το απόσπασμα', () => {
  const text = 'Α'.repeat(5000) + 'ΤΟ ΑΠΟΣΠΑΣΜΑ ΠΟΥ ΨΑΧΝΟΥΜΕ ΕΔΩ ΜΕΣΑ' + 'Β'.repeat(5000)
  const window = findQuoteWindow(text, 'ΤΟ ΑΠΟΣΠΑΣΜΑ ΠΟΥ ΨΑΧΝΟΥΜΕ ΕΔΩ ΜΕΣΑ', 1000)

  assert.ok(window.includes('ΤΟ ΑΠΟΣΠΑΣΜΑ'))
  assert.ok(window.length < text.length)
  assert.ok(window.includes('Α'), 'πρέπει να κρατά και το κείμενο πριν')
  assert.ok(window.includes('Β'), 'πρέπει να κρατά και το κείμενο μετά')
})

test('μικρό κείμενο επιστρέφεται ολόκληρο', () => {
  assert.equal(findQuoteWindow('σύντομο κείμενο', null, 1000), 'σύντομο κείμενο')
})

test('απόσπασμα που δεν βρίσκεται δίνει την αρχή του εγγράφου', () => {
  // Γίνεται όταν το μοντέλο παρέφρασε ελαφρά, ή όταν το κείμενο ήρθε από OCR.
  const text = 'ΑΡΧΗ ΤΟΥ ΕΓΓΡΑΦΟΥ ' + 'x'.repeat(9000)
  const window = findQuoteWindow(text, 'κάτι που δεν υπάρχει πουθενά μέσα', 1000)
  assert.ok(window.startsWith('ΑΡΧΗ ΤΟΥ ΕΓΓΡΑΦΟΥ'))
  assert.equal(window.length, 2000)
})
