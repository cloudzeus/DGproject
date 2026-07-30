/**
 * Integration test ενάντια στη ζωντανή βάση.
 *
 * Δύο πράγματα ελέγχονται εδώ που δεν πιάνονται με καθαρές συναρτήσεις:
 *
 *   1. **Η μετατροπή γράφει ό,τι πρέπει και μία φορά.** Διπλό πάτημα του
 *      κουμπιού δεν διπλασιάζει τις εργασίες.
 *   2. **Τίποτα από την πρόταση δεν διαρρέει στον πελάτη.** Το απόσπασμα
 *      προέλευσης περιέχει τιμές· μια εσωτερική εργασία δεν εμφανίζεται στο
 *      χρονοδιάγραμμα του portal.
 *
 * Τρέξε:
 *   set -a; . ./.env; set +a
 *   npx ts-node -r tsconfig-paths/register lib/proposals/__tests__/convert.test.ts
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { getPortalScope } from '@/lib/portal/scope'
import { listMilestones } from '@/lib/portal/timeline'
import { convertProposalItems } from '@/lib/proposals/convert'
import { persistItems } from '@/lib/proposals/analyze'
import type { ExtractedItem } from '@/lib/proposals/types'

const TAG = `proposaltest-${process.pid}`
const PROJECT_START = new Date('2026-09-01T00:00:00.000Z')
/** Το απόσπασμα κουβαλά τιμή — ακριβώς αυτό που δεν πρέπει να δει ο πελάτης. */
const SECRET_QUOTE = `${TAG}-ΤΙΜΗ-45000-ΕΥΡΩ`

let staffId = ''
let customerId = ''
let companyId = ''
let projectId = ''
let analysisId = ''
let stepId = ''
let milestoneId = ''
let internalStepId = ''
let requirementId = ''

before(async () => {
  const workspace = await prisma.workspace.findFirst({ select: { id: true } })
  const staff = await prisma.user.findFirst({ where: { userType: 'employee' }, select: { id: true } })
  assert.ok(workspace, 'χρειάζεται τουλάχιστον ένα workspace στη βάση')
  assert.ok(staff, 'χρειάζεται τουλάχιστον έναν employee στη βάση')
  staffId = staff.id

  const company = await prisma.company.create({ data: { NAME: `${TAG}-Πελάτης`, SODTYPE: 13 } })
  companyId = company.id

  const customer = await prisma.user.create({
    data: {
      email: `${TAG}@example.test`,
      name: 'Πελάτης Πρότασης',
      userType: 'customer',
      role: 'viewer',
      companyId: company.id,
    },
  })
  customerId = customer.id

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: `${TAG}-Έργο`,
      color: '#0078D4',
      icon: 'Rocket',
      ownerId: staff.id,
      primaryCompanyId: company.id,
      startDate: PROJECT_START,
    },
  })
  projectId = project.id

  const analysis = await prisma.proposalAnalysis.create({
    data: {
      projectId: project.id,
      fileName: 'προσφορά.pdf',
      mimeType: 'application/pdf',
      extractedText: 'κείμενο πρότασης',
      charCount: 16,
      status: 'ready',
      createdById: staff.id,
    },
  })
  analysisId = analysis.id

  const step = await prisma.proposalItem.create({
    data: {
      analysisId: analysis.id,
      kind: 'step',
      title: `${TAG}-Εγκατάσταση`,
      description: 'Εγκατάσταση και παραμετροποίηση',
      // Χωρίς ρητή ημερομηνία: πρέπει να υπολογιστεί από την έναρξη του έργου.
      suggestedOffsetDays: 21,
      estimatedHours: 40,
      priority: 'high',
      sourceQuote: SECRET_QUOTE,
      confidence: 0.9,
      order: 0,
      assigneeId: staff.id,
    },
  })
  stepId = step.id

  const milestone = await prisma.proposalItem.create({
    data: {
      analysisId: analysis.id,
      kind: 'milestone',
      title: `${TAG}-Παράδοση Α φάσης`,
      suggestedDueDate: new Date('2026-10-15T15:00:00.000Z'),
      sourceQuote: SECRET_QUOTE,
      confidence: 0.95,
      order: 0,
      assigneeId: staff.id,
    },
  })
  milestoneId = milestone.id

  const internalStep = await prisma.proposalItem.create({
    data: {
      analysisId: analysis.id,
      kind: 'milestone',
      title: `${TAG}-Εσωτερικό ορόσημο`,
      suggestedDueDate: new Date('2026-10-20T15:00:00.000Z'),
      visibility: 'internal',
      sourceQuote: SECRET_QUOTE,
      confidence: 0.8,
      order: 1,
    },
  })
  internalStepId = internalStep.id

  const requirement = await prisma.proposalItem.create({
    data: {
      analysisId: analysis.id,
      kind: 'requirement',
      title: `${TAG}-Διαθεσιμότητα 99.5%`,
      requirementCategory: 'τεχνική',
      sourceQuote: SECRET_QUOTE,
      confidence: 1,
      order: 0,
    },
  })
  requirementId = requirement.id
})

after(async () => {
  await prisma.notification.deleteMany({ where: { link: `/projects/${projectId}` } })
  await prisma.taskAssignee.deleteMany({ where: { task: { projectId } } })
  await prisma.taskRequirement.deleteMany({ where: { requirement: { projectId } } })
  await prisma.projectRequirement.deleteMany({ where: { projectId } })
  await prisma.proposalItem.deleteMany({ where: { analysisId } })
  await prisma.proposalAnalysis.deleteMany({ where: { projectId } })
  await prisma.activity.deleteMany({ where: { projectId } })
  await prisma.task.deleteMany({ where: { projectId } })
  await prisma.project.deleteMany({ where: { id: projectId } })
  await prisma.user.deleteMany({ where: { id: customerId } })
  await prisma.company.deleteMany({ where: { id: companyId } })
  await prisma.$disconnect()
})

test('η μετατροπή φτιάχνει εργασίες και απαιτήσεις, το καθένα στο σωστό μοντέλο', async () => {
  const result = await convertProposalItems({
    analysisId,
    itemIds: [stepId, milestoneId, internalStepId, requirementId],
    actorId: staffId,
  })

  assert.equal(result.tasksCreated, 3, 'τρία βήματα/ορόσημα πρέπει να γίνουν εργασίες')
  assert.equal(result.requirementsCreated, 1, 'η απαίτηση ΔΕΝ γίνεται εργασία')
  assert.equal(result.skipped, 0)
  assert.equal(result.notified, 1, 'δύο εργασίες στο ίδιο άτομο → ΕΝΑ ειδοποιημένο άτομο')

  const tasks = await prisma.task.findMany({ where: { projectId } })
  assert.equal(tasks.length, 3)
  assert.ok(tasks.every((t) => t.status === 'todo'))
  assert.ok(
    tasks.every((t) => t.generatedFromProposalId === analysisId),
    'κάθε εργασία πρέπει να δείχνει από ποια ανάλυση γεννήθηκε',
  )
  assert.ok(
    tasks.every((t) => !t.addToCalendar && !t.addToTeams),
    'το πλάνο δεν είναι ραντεβού — κανένα Outlook/Teams',
  )
})

test('το ορόσημο σημαδεύεται ως ορόσημο, το βήμα όχι', async () => {
  const tasks = await prisma.task.findMany({ where: { projectId } })
  const step = tasks.find((t) => t.title.endsWith('Εγκατάσταση'))
  const milestone = tasks.find((t) => t.title.endsWith('Παράδοση Α φάσης'))

  assert.equal(step?.isMilestone, false)
  assert.equal(milestone?.isMilestone, true)
})

test('η μετατόπιση σε μέρες γίνεται ημερομηνία από την έναρξη του έργου', async () => {
  const step = await prisma.task.findFirst({ where: { projectId, title: { endsWith: 'Εγκατάσταση' } } })
  assert.ok(step?.dueDate, 'το +21 μέρες έπρεπε να δώσει προθεσμία')

  const expected = new Date(PROJECT_START)
  expected.setDate(expected.getDate() + 21)
  assert.equal(step.dueDate.toISOString().slice(0, 10), expected.toISOString().slice(0, 10))
})

test('η απαίτηση παίρνει κωδικό REQ-001 και δείχνει πίσω στην ανάλυση', async () => {
  const requirements = await prisma.projectRequirement.findMany({ where: { projectId } })
  assert.equal(requirements.length, 1)
  assert.equal(requirements[0].code, 'REQ-001')
  assert.equal(requirements[0].status, 'open')
  assert.equal(requirements[0].category, 'τεχνική')
  assert.equal(requirements[0].sourceAnalysisId, analysisId)
})

test('δεύτερο πάτημα δεν διπλασιάζει τίποτα', async () => {
  const again = await convertProposalItems({
    analysisId,
    itemIds: [stepId, milestoneId, internalStepId, requirementId],
    actorId: staffId,
  })

  assert.equal(again.tasksCreated, 0)
  assert.equal(again.requirementsCreated, 0)
  assert.equal(again.skipped, 4, 'και τα τέσσερα είχαν ήδη μετατραπεί')

  assert.equal(await prisma.task.count({ where: { projectId } }), 3)
  assert.equal(await prisma.projectRequirement.count({ where: { projectId } }), 1)
})

test('τα μετατραπέντα αντικείμενα δείχνουν τι έγιναν', async () => {
  const items = await prisma.proposalItem.findMany({ where: { analysisId } })
  assert.ok(items.every((i) => i.status === 'converted'))

  const req = items.find((i) => i.id === requirementId)
  assert.ok(req?.convertedRequirementId, 'η απαίτηση πρέπει να δείχνει σε ProjectRequirement')
  assert.equal(req?.convertedTaskId, null, 'η απαίτηση ΔΕΝ είναι εργασία')

  const step = items.find((i) => i.id === stepId)
  assert.ok(step?.convertedTaskId, 'το βήμα πρέπει να δείχνει σε Task')
})

test('η ανάθεση περνά στην εργασία', async () => {
  const assignees = await prisma.taskAssignee.findMany({
    where: { task: { projectId } },
    select: { userId: true, task: { select: { title: true } } },
  })

  assert.equal(assignees.length, 2, 'δύο από τα τρία αντικείμενα είχαν ανάδοχο')
  assert.ok(assignees.every((a) => a.userId === staffId))
  assert.equal(
    assignees.some((a) => a.task.title.endsWith('Εσωτερικό ορόσημο')),
    false,
    'το αντικείμενο χωρίς ανάδοχο δεν πρέπει να πάρει',
  )
})

test('μία συγκεντρωτική ειδοποίηση ανά άτομο, όχι μία ανά εργασία', async () => {
  // Δύο εργασίες στο ίδιο άτομο με ένα κλικ. Δύο χτυπήματα στο κουδουνάκι για
  // μία πράξη του χρήστη είναι θόρυβος, και ο επόμενος τα αγνοεί όλα.
  const notifications = await prisma.notification.findMany({
    where: { userId: staffId, type: 'assignment', link: `/projects/${projectId}` },
  })

  assert.equal(notifications.length, 1)
  assert.match(notifications[0].title, /2 εργασίες/)
  assert.match(notifications[0].message, new RegExp(TAG))
})

test('ΔΙΑΡΡΟΗ: το απόσπασμα της πρότασης δεν φτάνει ποτέ στο portal', async () => {
  const scope = await getPortalScope(customerId)
  assert.ok(scope, 'ο πελάτης πρέπει να έχει scope στο έργο του')

  const milestones = await listMilestones(scope)
  const serialized = JSON.stringify(milestones)

  assert.equal(
    serialized.includes(SECRET_QUOTE),
    false,
    'το απόσπασμα περιέχει τιμή — δεν επιτρέπεται να φύγει προς τον πελάτη',
  )
})

test('ΔΙΑΡΡΟΗ: το εσωτερικό ορόσημο δεν εμφανίζεται στο χρονοδιάγραμμα του πελάτη', async () => {
  const scope = await getPortalScope(customerId)
  const titles = (await listMilestones(scope!)).map((m) => m.title)

  assert.ok(
    titles.some((t) => t.endsWith('Παράδοση Α φάσης')),
    'το κοινόχρηστο ορόσημο πρέπει να φαίνεται — αλλιώς το φίλτρο κόβει αδιακρίτως',
  )
  assert.equal(
    titles.some((t) => t.endsWith('Εσωτερικό ορόσημο')),
    false,
    'το εσωτερικό ορόσημο διέρρευσε στον πελάτη',
  )
})

test('νέα ανάλυση δεν σβήνει ό,τι πείραξε ο άνθρωπος', async () => {
  const manual = await prisma.proposalItem.create({
    data: { analysisId, kind: 'step', title: `${TAG}-Χειροκίνητο`, manual: true, order: 9 },
  })
  const rejected = await prisma.proposalItem.create({
    data: { analysisId, kind: 'step', title: `${TAG}-Απορριφθέν`, status: 'rejected', order: 8 },
  })
  const draft = await prisma.proposalItem.create({
    data: { analysisId, kind: 'step', title: `${TAG}-Παλιό προσχέδιο`, order: 7 },
  })

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

  const survivors = await prisma.proposalItem.findMany({ where: { analysisId }, select: { id: true, title: true } })
  const titles = survivors.map((s) => s.title)

  assert.ok(titles.includes(`${TAG}-Χειροκίνητο`), 'το χειροκίνητο πρέπει να επιβιώσει')
  assert.ok(titles.includes(`${TAG}-Απορριφθέν`), 'το απορριφθέν πρέπει να επιβιώσει, αλλιώς επανεμφανίζεται')
  assert.ok(titles.includes(`${TAG}-Εγκατάσταση`), 'τα μετατραπέντα πρέπει να επιβιώσουν')
  assert.equal(
    titles.includes(`${TAG}-Παλιό προσχέδιο`),
    false,
    'το ανέγγιχτο προσχέδιο του μοντέλου αντικαθίσταται',
  )
  assert.ok(titles.includes(`${TAG}-Νέο από ανάλυση`), 'το νέο αποτέλεσμα πρέπει να γράφτηκε')

  await prisma.proposalItem.deleteMany({ where: { id: { in: [manual.id, rejected.id, draft.id] } } })
})
