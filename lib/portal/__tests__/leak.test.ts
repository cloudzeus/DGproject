/**
 * Integration test ενάντια στη ζωντανή βάση.
 *
 * Στήνει δύο εταιρίες με χωριστά έργα, εργασίες, σχόλια και tickets, και
 * επιβεβαιώνει ότι το scope της μιας δεν αγγίζει τίποτα της άλλης. Κάθε νέο
 * feature του portal πρέπει να συνεχίζει να το περνά.
 *
 * Τρέξε: npx tsx --env-file=.env --test lib/portal/__tests__/leak.test.ts
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { commentVisibilityFilter } from '@/lib/comments/visibility'
import { listSharedMeetings, getSharedMeeting } from '@/lib/portal/meetings'

const TAG = `leaktest-${process.pid}`

let aUserId = ''
let aProjectId = ''
let bProjectId = ''
let bTaskId = ''
let internalCommentId = ''
let sharedCommentId = ''
let aTicketCode = ''
let bTicketCode = ''
let sharedMeetingId = ''
let internalMeetingId = ''
let otherCompanyMeetingId = ''

before(async () => {
  const workspace = await prisma.workspace.findFirst({ select: { id: true } })
  const staff = await prisma.user.findFirst({
    where: { userType: 'employee' },
    select: { id: true },
  })
  assert.ok(workspace, 'χρειάζεται τουλάχιστον ένα workspace στη βάση')
  assert.ok(staff, 'χρειάζεται τουλάχιστον έναν employee στη βάση')

  const source = await prisma.ticketSource.findUnique({ where: { code: 'PORTAL' } })
  assert.ok(source, 'χρειάζεται το PORTAL TicketSource (scripts/seed-portal-source.ts)')

  const companyA = await prisma.company.create({ data: { NAME: `${TAG}-A`, SODTYPE: 13 } })
  const companyB = await prisma.company.create({ data: { NAME: `${TAG}-B`, SODTYPE: 13 } })

  const userA = await prisma.user.create({
    data: {
      email: `${TAG}-a@example.test`,
      name: 'Πελάτης Α',
      userType: 'customer',
      role: 'viewer',
      companyId: companyA.id,
    },
  })
  aUserId = userA.id

  // Επαφή χωρίς λογαριασμό — το email της πρέπει να μπαίνει στο scope.
  await prisma.contact.create({
    data: { companyId: companyA.id, name: 'Επαφή Α', email: `${TAG}-contact@example.test` },
  })

  const projectA = await prisma.project.create({
    data: {
      name: `${TAG}-projA`,
      workspaceId: workspace!.id,
      ownerId: staff!.id,
      primaryCompanyId: companyA.id,
      projectCode: `${TAG}-A`,
      color: '#0078D4',
      icon: 'L',
    },
  })
  aProjectId = projectA.id

  const projectB = await prisma.project.create({
    data: {
      name: `${TAG}-projB`,
      workspaceId: workspace!.id,
      ownerId: staff!.id,
      primaryCompanyId: companyB.id,
      projectCode: `${TAG}-B`,
      color: '#0078D4',
      icon: 'L',
    },
  })
  bProjectId = projectB.id

  const taskA = await prisma.task.create({
    data: { title: `${TAG}-taskA`, projectId: projectA.id, createdById: staff!.id },
  })
  const taskB = await prisma.task.create({
    data: { title: `${TAG}-taskB`, projectId: projectB.id, createdById: staff!.id },
  })
  bTaskId = taskB.id

  const internal = await prisma.comment.create({
    data: {
      taskId: taskA.id,
      authorId: staff!.id,
      content: `${TAG}-INTERNAL`,
      visibility: 'internal',
    },
  })
  internalCommentId = internal.id
  const shared = await prisma.comment.create({
    data: {
      taskId: taskA.id,
      authorId: staff!.id,
      content: `${TAG}-SHARED`,
      visibility: 'shared',
    },
  })
  sharedCommentId = shared.id

  aTicketCode = `${TAG}-TKT-A`
  bTicketCode = `${TAG}-TKT-B`
  await prisma.ticket.create({
    data: {
      code: aTicketCode,
      sourceId: source!.id,
      reporterEmail: `${TAG}-contact@example.test`,
      originUrl: 'test',
      subject: `${TAG}-subjA`,
      body: 'x',
    },
  })
  await prisma.ticket.create({
    data: {
      code: bTicketCode,
      sourceId: source!.id,
      reporterEmail: `${TAG}-b@example.test`,
      originUrl: 'test',
      subject: `${TAG}-subjB`,
      body: 'x',
    },
  })

  // ─── Πρακτικά συσκέψεων ───
  // Τρεις περιπτώσεις: δημοσιευμένο στο έργο A, ΑΔΗΜΟΣΙΕΥΤΟ στο έργο A, και
  // δημοσιευμένο στο έργο B (άλλη εταιρία). Ο πελάτης A πρέπει να δει ΜΟΝΟ το πρώτο.
  const meetingBase = {
    organizerId: staff!.id,
    startedAt: new Date(),
    endedAt: new Date(),
    durationSec: 600,
    status: 'ready' as const,
    summary: `${TAG}-SUMMARY`,
    decisions: [{ text: `${TAG}-DECISION-KEPT`, timestampSec: 1, participantEmails: [] }],
    risks: [{ text: `${TAG}-RISK-HIDDEN`, severity: 'high', ownerEmail: null }],
  }

  const sharedMeeting = await prisma.meetingNote.create({
    data: {
      ...meetingBase,
      projectId: projectA.id,
      subject: `${TAG}-meetingShared`,
      momVisibility: 'shared',
      // Η ομάδα ξετσέκαρε τα ρίσκα — η προεπιλογή της δημοσίευσης.
      momSharedInclude: { summary: true, riskIndexes: [] },
    },
  })
  sharedMeetingId = sharedMeeting.id

  const internalMeeting = await prisma.meetingNote.create({
    data: { ...meetingBase, projectId: projectA.id, subject: `${TAG}-meetingInternal` },
  })
  internalMeetingId = internalMeeting.id

  const otherMeeting = await prisma.meetingNote.create({
    data: {
      ...meetingBase,
      projectId: projectB.id,
      subject: `${TAG}-meetingOther`,
      momVisibility: 'shared',
    },
  })
  otherCompanyMeetingId = otherMeeting.id

  // Το έργο B συνδέεται στην εταιρία A ως ΥΠΕΡΓΟΛΑΒΟΣ — δεν πρέπει να το βλέπει.
  await prisma.projectCompany.create({
    data: { projectId: projectB.id, companyId: companyA.id, role: 'subcontractor' },
  })
})

after(async () => {
  await prisma.meetingNote.deleteMany({ where: { subject: { contains: TAG } } })
  await prisma.ticket.deleteMany({ where: { code: { contains: TAG } } })
  await prisma.comment.deleteMany({ where: { content: { contains: TAG } } })
  await prisma.projectCompany.deleteMany({ where: { project: { name: { contains: TAG } } } })
  await prisma.task.deleteMany({ where: { title: { contains: TAG } } })
  await prisma.project.deleteMany({ where: { name: { contains: TAG } } })
  await prisma.contact.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } })
  await prisma.company.deleteMany({ where: { NAME: { contains: TAG } } })
  await prisma.$disconnect()
})

test('το scope περιέχει μόνο το έργο της δικής του εταιρίας', async () => {
  const scope = await getPortalScope(aUserId)
  assert.ok(scope)
  assert.deepEqual(scope!.projectIds, [aProjectId])
})

test('έργο όπου η εταιρία είναι ΥΠΕΡΓΟΛΑΒΟΣ δεν μπαίνει στο scope', async () => {
  const scope = await getPortalScope(aUserId)
  assert.equal(scope!.projectIds.includes(bProjectId), false)
})

test('τα emails των επαφών μπαίνουν στο scope', async () => {
  const scope = await getPortalScope(aUserId)
  assert.equal(scope!.emails.includes(`${TAG}-contact@example.test`), true)
  assert.equal(scope!.emails.includes(`${TAG}-a@example.test`), true)
})

test('τα εσωτερικά σχόλια δεν επιστρέφονται στο portal query', async () => {
  const scope = await getPortalScope(aUserId)
  const comments = await prisma.comment.findMany({
    where: {
      ...commentVisibilityFilter('customer'),
      task: { projectId: { in: scope!.projectIds } },
    },
    select: { id: true },
  })
  assert.equal(comments.some((c) => c.id === internalCommentId), false)
  assert.equal(comments.some((c) => c.id === sharedCommentId), true)
})

test('η εργασία άλλης εταιρίας δεν είναι προσβάσιμη μέσω scope', async () => {
  const scope = await getPortalScope(aUserId)
  const task = await prisma.task.findUnique({
    where: { id: bTaskId },
    select: { projectId: true },
  })
  assert.equal(scope!.projectIds.includes(task!.projectId), false)
})

test('το ticket άλλης εταιρίας δεν ταιριάζει στο scope', async () => {
  const scope = await getPortalScope(aUserId)
  const tickets = await prisma.ticket.findMany({
    where: { reporterEmail: { in: scope!.emails }, code: { contains: TAG } },
    select: { code: true },
  })
  assert.deepEqual(
    tickets.map((t) => t.code),
    [aTicketCode],
  )
})

test('χρήστης χωρίς εταιρία δεν έχει scope', async () => {
  const orphan = await prisma.user.create({
    data: { email: `${TAG}-orphan@example.test`, userType: 'customer', role: 'viewer' },
  })
  assert.equal(await getPortalScope(orphan.id), null)
})

test('employee δεν έχει scope', async () => {
  const staff = await prisma.user.findFirst({
    where: { userType: 'employee' },
    select: { id: true },
  })
  assert.equal(await getPortalScope(staff!.id), null)
})

// ─── Πρακτικά συσκέψεων ──────────────────────────────────────────────────

test('μόνο τα ΔΗΜΟΣΙΕΥΜΕΝΑ πρακτικά του δικού του έργου επιστρέφονται', async () => {
  const scope = await getPortalScope(aUserId)
  const meetings = await listSharedMeetings(scope!)
  const ids = meetings.map((m) => m.id)

  assert.equal(ids.includes(sharedMeetingId), true, 'το δημοσιευμένο πρέπει να φαίνεται')
  assert.equal(ids.includes(internalMeetingId), false, 'το αδημοσίευτο ΔΕΝ πρέπει να φαίνεται')
  assert.equal(ids.includes(otherCompanyMeetingId), false, 'άλλης εταιρίας ΔΕΝ πρέπει να φαίνεται')
})

test('αδημοσίευτα πρακτικά δεν ανοίγουν ούτε με άμεσο id', async () => {
  const scope = await getPortalScope(aUserId)
  assert.equal(await getSharedMeeting(scope!, internalMeetingId), null)
})

test('πρακτικά άλλης εταιρίας δεν ανοίγουν ούτε με άμεσο id', async () => {
  const scope = await getPortalScope(aUserId)
  assert.equal(await getSharedMeeting(scope!, otherCompanyMeetingId), null)
})

test('το ξετσεκαρισμένο ρίσκο δεν φεύγει από τον server', async () => {
  const scope = await getPortalScope(aUserId)
  const meeting = await getSharedMeeting(scope!, sharedMeetingId)

  assert.ok(meeting, 'το δημοσιευμένο πρέπει να ανοίγει')
  assert.deepEqual(meeting.risks, [], 'τα ρίσκα ήταν ξετσέκαρα')
  assert.equal(meeting.counts.risks, 0)
  // Ό,τι κρατήθηκε πρέπει να είναι εκεί — αλλιώς το φίλτρο κόβει αδιακρίτως.
  assert.equal(meeting.decisions.length, 1)
  assert.equal(JSON.stringify(meeting).includes('RISK-HIDDEN'), false)
})
