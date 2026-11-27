import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTrackedEmail, summarizeMailgunTracking, type TrackedEmailOptions } from './email-tracking';
import type { MailgunEvent } from './mailgun';

const options: TrackedEmailOptions = {
  to: 'person@example.com',
  subject: 'Status update',
  html: '<p>Task changed</p>',
  projectId: 'project-1',
  taskId: 'task-1',
  questionId: 'question-1',
  userId: 'operator-1',
  note: 'question',
};

test('tracked send enables Mailgun tracking and stores its normalized message id', async () => {
  let sendOptions: Record<string, unknown> = {};
  let audit: Record<string, unknown> = {};
  const result = await sendTrackedEmail(options, {
    send: async (input) => {
      sendOptions = { ...input };
      return { id: '<message@dgsmart.gr>' };
    },
    getFromAddress: async () => 'DGSMART PROJECTS <pms@dgsmart.gr>',
    createRecord: async (data) => { audit = { ...data }; },
    now: () => new Date('2026-11-27T10:00:00.000Z'),
  });

  assert.equal(result.id, '<message@dgsmart.gr>');
  assert.equal(sendOptions.tracking, true);
  assert.equal(audit.mailgunMessageId, 'message@dgsmart.gr');
  assert.equal(audit.questionId, 'question-1');
  assert.equal(audit.taskId, 'task-1');
  assert.equal(audit.fromAddress, 'DGSMART PROJECTS <pms@dgsmart.gr>');
  assert.equal(audit.appliedNote, 'question');
  assert.equal(audit.status, 'sent');
});

test('failed tracked send is audited and still reported as a failure', async () => {
  let audit: Record<string, unknown> = {};
  await assert.rejects(sendTrackedEmail(options, {
    send: async () => { throw new Error('Mailbox unavailable'); },
    getFromAddress: async () => 'pms@dgsmart.gr',
    createRecord: async (data) => { audit = { ...data }; },
  }), /Mailbox unavailable/);
  assert.equal(audit.status, 'failed');
  assert.equal(audit.deliveryError, 'Mailbox unavailable');
  assert.equal(audit.mailgunMessageId, null);
});

const current = {
  status: 'sent' as const,
  deliveredAt: null,
  openedAt: null,
  openCount: 0,
  lastOpenedAt: null,
  deliveryError: null,
};

function event(eventName: 'delivered' | 'opened' | 'failed', timestamp: number, recipient = 'person@example.com'): MailgunEvent {
  return { event: eventName, timestamp, recipient, message: {} };
}

test('Mailgun delivered/opened events produce real badge timestamps', () => {
  const delivered = summarizeMailgunTracking([
    event('delivered', 100),
    event('delivered', 100, 'other@example.com'),
  ], 'Person <person@example.com>', current);
  assert.equal(delivered.deliveredAt?.toISOString(), new Date(100000).toISOString());
  assert.equal(delivered.openedAt, null);

  const opened = summarizeMailgunTracking([
    event('delivered', 100),
    event('opened', 200),
    event('opened', 300),
  ], 'person@example.com', delivered);
  assert.equal(opened.openedAt?.toISOString(), new Date(200000).toISOString());
  assert.equal(opened.lastOpenedAt?.toISOString(), new Date(300000).toISOString());
  assert.equal(opened.openCount, 2);
});

test('Mailgun failed event marks delivery as failed', () => {
  const failed = summarizeMailgunTracking([event('failed', 100)], 'person@example.com', current);
  assert.equal(failed.status, 'failed');
  assert.match(failed.deliveryError ?? '', /Mailgun delivery failed/);
});
