import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectReportAnalytics, type ProjectReportProject } from '../project-report-analytics';
import {
  buildProjectReportPromptDataset,
  createProjectReportPrompt,
  parseProjectReportNarrative,
} from '../project-report-ai';
import { buildProjectReportHtml } from '../project-report';

const NOW = new Date('2026-11-27T12:00:00.000Z');

function user(id: string, name: string, userType: 'employee' | 'customer', companyId: string | null, isAIAgent = false) {
  return {
    id,
    name,
    email: `${id}@example.com`,
    userType,
    companyId,
    companyName: userType === 'employee' ? 'DGSmart' : 'Acme',
    isAIAgent,
  };
}

const owner = user('u1', 'Μαρία Παπαδοπούλου', 'employee', 'dgsmart');
const customer = user('u2', 'Γιάννης Πελάτης', 'customer', 'c1');
const agent = user('u3', 'DGSmart AI', 'employee', 'dgsmart', true);

function makeTask(input: {
  id: string;
  title: string;
  createdAt: string;
  completedAt?: string;
  status?: string;
  creator?: typeof owner | typeof customer;
  withAI?: boolean;
}) {
  const status = input.status ?? 'done';
  return {
    id: input.id,
    title: input.title,
    description: `Πλήρης περιγραφή για ${input.title}`,
    status,
    priority: 'medium',
    visibility: 'shared',
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.completedAt ?? input.createdAt),
    startDate: new Date(input.createdAt),
    dueDate: new Date('2026-12-20T12:00:00.000Z'),
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    estimatedHours: 4,
    inProgressStartedAt: null,
    inProgressAccumulatedMs: 3_600_000n,
    isMilestone: false,
    generatedFromMeetingId: null,
    generatedFromProposalId: null,
    meetingSourceQuote: null,
    meetingSourceConfidence: null,
    proposalSourceQuote: null,
    proposalConfidence: null,
    aiBlockedReason: null,
    activeAIAgentId: input.withAI ? agent.id : null,
    creator: input.creator ?? owner,
    activeAIAgent: input.withAI ? agent : null,
    assignees: [{ user: owner }],
    tags: [{ name: 'portal' }],
    requirements: [],
    questions: [],
    comments: [{
      content: `Το ${input.title} προχώρησε σωστά.`,
      visibility: 'shared',
      createdAt: new Date(input.createdAt),
      author: owner,
    }],
    resolutions: input.withAI ? [{
      summary: 'Η λύση ολοκληρώθηκε και ελέγχθηκε.',
      changes: [],
      commits: [],
      testResults: { ok: true },
      artifacts: [],
      remainingIssues: null,
      status: 'approved',
      reviewFeedback: null,
      submittedAt: new Date(input.completedAt ?? input.createdAt),
      reviewedAt: new Date(input.completedAt ?? input.createdAt),
      agent,
    }] : [],
  };
}

const tasks = [
  makeTask({ id: 't1', title: 'Δημιουργία portal', createdAt: '2026-01-10T09:00:00.000Z', completedAt: '2026-01-20T09:00:00.000Z', creator: customer, withAI: true }),
  makeTask({ id: 't2', title: 'Σύνδεση λογαριασμών', createdAt: '2026-02-01T09:00:00.000Z', completedAt: '2026-02-05T09:00:00.000Z' }),
  makeTask({ id: 't3', title: 'Τελικός έλεγχος', createdAt: '2026-03-01T09:00:00.000Z', status: 'in_progress' }),
];

const project = {
  id: 'p1',
  name: 'Portal Acme',
  projectCode: 'PRJ-2026-001',
  description: 'Νέο portal για τον πελάτη Acme.',
  technologyStack: 'Next.js',
  status: 'active',
  color: '#0078D4',
  startDate: new Date('2026-01-01T09:00:00.000Z'),
  dueDate: new Date('2026-12-20T09:00:00.000Z'),
  progress: 67,
  createdAt: new Date('2026-01-01T09:00:00.000Z'),
  updatedAt: NOW,
  ownerId: owner.id,
  primaryCompanyId: 'c1',
  owner,
  primaryCompany: { id: 'c1', NAME: 'Acme' },
  members: [{ title: 'Υπεύθυνη έργου', responsibilities: 'Συντονισμός', user: owner }],
  tasks,
  activities: [
    { taskId: 't1', action: 'completed', targetType: 'task', metadata: null, createdAt: new Date('2026-01-20T09:00:00.000Z'), actor: owner },
    { taskId: 't2', action: 'completed', targetType: 'task', metadata: null, createdAt: new Date('2026-02-05T09:00:00.000Z'), actor: owner },
  ],
  meetings: [],
  emailMessages: [],
  proposalAnalyses: [],
} as unknown as ProjectReportProject;

test('analytics separate customer-opened tasks and calculate real closure time', () => {
  const analytics = buildProjectReportAnalytics(project, NOW);
  assert.equal(analytics.totalTasks, 3);
  assert.equal(analytics.completedTasks, 2);
  assert.equal(analytics.openTasks, 1);
  assert.equal(analytics.completionPercentage, 67);
  assert.equal(analytics.averageCloseDays, 7);
  assert.equal(analytics.medianCloseDays, 7);
  assert.equal(analytics.customer.openedTasks, 1);
  assert.equal(analytics.customer.completedTasks, 1);
  assert.equal(analytics.customer.averageCloseDays, 10);
  assert.equal(analytics.dgsmart.assignedTasks, 3);
  assert.equal(analytics.dgsmart.completedTasks, 2);
  assert.equal(analytics.dgsmart.aiAssignedTasks, 1);
  assert.equal(analytics.dgsmart.approvedResolutions, 1);
  assert.equal(analytics.users.find((item) => item.id === owner.id)?.assignedTasks, 3);
  assert.equal(analytics.monthly[0].opened, 1);
  assert.equal(analytics.monthly[0].closed, 1);
  assert.equal(analytics.monthly.length, 11);
});

test('prompt contains the complete relevant history but masks identifying names', () => {
  const analytics = buildProjectReportAnalytics(project, NOW);
  const dataset = buildProjectReportPromptDataset(project, analytics);
  assert.equal(dataset.tasks.length, 3);
  assert.equal(dataset.tasks[0].comments.length, 1);
  assert.equal(dataset.projectActivities.length, 2);

  const prompt = createProjectReportPrompt(project, analytics);
  assert.match(prompt.user, /Δημιουργία portal/);
  assert.match(prompt.user, /Σύνδεση λογαριασμών/);
  assert.match(prompt.user, /Τελικός έλεγχος/);
  assert.match(prompt.user, /CUSTOMER_COMPANY/);
  assert.match(prompt.user, /PERSON_1/);
  assert.match(prompt.user, /2026-01-10T09:00:00\.000Z/);
  assert.doesNotMatch(prompt.user, /Μαρία Παπαδοπούλου/);
  assert.doesNotMatch(prompt.user, /Portal Acme/);
  assert.doesNotMatch(prompt.user, /u1@example\.com/);
});

test('AI JSON parser accepts fenced output and keeps structured sections', () => {
  const parsed = parseProjectReportNarrative(`\`\`\`json
  {
    "headline": "Το έργο προχωρά με καθαρή πορεία",
    "executiveSummary": "Η ομάδα ολοκλήρωσε δύο εργασίες.",
    "journey": [{"date":"Ιανουάριος","title":"Έναρξη","text":"Ξεκίνησε το portal."}],
    "customerParagraph": "Ο πελάτης άνοιξε ένα task.",
    "teamParagraph": "Η PERSON_1 ολοκλήρωσε δύο tasks.",
    "dgsmartParagraph": "Η DGSmart συντόνισε την υλοποίηση.",
    "highlights": ["Δύο παραδοτέα ολοκληρώθηκαν"],
    "closingParagraph": "Συνεχίζουμε με τον τελικό έλεγχο."
  }
  \`\`\``);
  assert.equal(parsed.journey.length, 1);
  assert.equal(parsed.highlights[0], 'Δύο παραδοτέα ολοκληρώθηκαν');
  assert.match(parsed.teamParagraph, /PERSON_1/);
});

test('HTML report includes narrative, charts, customer, users and DGSmart', () => {
  const analytics = buildProjectReportAnalytics(project, NOW);
  const narrative = parseProjectReportNarrative(JSON.stringify({
    headline: 'Καθαρή πρόοδος',
    executiveSummary: 'Δύο εργασίες ολοκληρώθηκαν.',
    journey: [{ date: 'Ιανουάριος', title: 'Έναρξη', text: 'Το έργο ξεκίνησε.' }],
    customerParagraph: 'Ο πελάτης άνοιξε ένα task που έκλεισε σε δέκα ημέρες.',
    teamParagraph: 'Η ομάδα δούλεψε συντονισμένα.',
    dgsmartParagraph: 'Η DGSmart οδήγησε την υλοποίηση.',
    highlights: ['Δύο ολοκληρωμένες εργασίες'],
    closingParagraph: 'Απομένει ο τελικός έλεγχος.',
  }));
  const html = buildProjectReportHtml({
    project,
    analytics,
    narrative,
    aiGenerated: true,
  });
  assert.match(html, /Η πορεία του έργου, από την αρχή έως σήμερα/);
  assert.match(html, /Τι άνοιξε και τι έκλεισε κάθε μήνα/);
  assert.match(html, /Η συμμετοχή του πελάτη/);
  assert.match(html, /Η δουλειά της ομάδας, ανά χρήστη/);
  assert.match(html, /Η συνεισφορά της DGSmart/);
  assert.match(html, /Η αφήγηση παράχθηκε με AI/);
});
