import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UserType } from '@prisma/client';
import { notifyTaskStatusChange, type TaskStatusChangeParams } from './index';
import { sendMcpTaskStatusEmails } from './status-email';
import type { TrackedEmailOptions } from '@/lib/email-tracking';

const params: TaskStatusChangeParams = {
  taskId: 'task-1',
  projectId: 'project-1',
  actorId: 'actor',
  from: 'in_progress',
  to: 'review',
  approverId: 'approver',
  taskTitle: 'Test task',
  projectName: 'Test project',
  createdById: 'actor',
  ownerId: 'owner',
  assigneeIds: ['actor', 'agent', 'customer'],
  source: 'mcp',
};

function user(id: string, userType: UserType = 'employee', isAIAgent = false) {
  return { id, email: `${id}@example.com`, name: id, userType, isAIAgent };
}

test('MCP email includes the operator, dedupes stakeholders and excludes AI/customers', async () => {
  let queriedIds: string[] = [];
  const sent: TrackedEmailOptions[] = [];
  const result = await sendMcpTaskStatusEmails(params, {
    findRecipients: async (ids) => {
      queriedIds = ids;
      return [user('actor'), user('owner'), user('approver'), user('agent', 'employee', true), user('customer', 'customer')];
    },
    send: async (options) => { sent.push(options); return { id: '<mailgun-id>' }; },
  });

  assert.deepEqual(queriedIds, ['actor', 'owner', 'approver', 'agent', 'customer']);
  assert.deepEqual(sent.map((mail) => mail.to), ['actor@example.com', 'owner@example.com', 'approver@example.com']);
  assert.equal(result.sent, 3);
  assert.equal(result.failed, 0);
  assert.equal(sent[0].taskId, 'task-1');
  assert.equal(sent[0].projectId, 'project-1');
  assert.equal(sent[0].note, 'mcp_status');
  assert.match(sent[0].subject, /Αλλαγή κατάστασης/);
  assert.match(sent[0].html, /Η κατάσταση της εργασίας ενημερώθηκε/);
  assert.match(sent[0].html, /Σε εξέλιξη/);
  assert.match(sent[0].html, /Σε έλεγχο/);
  assert.doesNotMatch(sent[0].html, /MCP|μέσω MCP/);
});

test('unchanged status does not query recipients or send email', async () => {
  let calls = 0;
  const result = await sendMcpTaskStatusEmails({ ...params, to: params.from! }, {
    findRecipients: async () => { calls += 1; return []; },
    send: async () => { calls += 1; return { id: null }; },
  });
  assert.deepEqual(result, { sent: 0, failed: 0 });
  assert.equal(calls, 0);
});

test('one recipient failure does not block the remaining recipients', async () => {
  const attempted: string[] = [];
  const result = await sendMcpTaskStatusEmails({ ...params, approverId: null, assigneeIds: ['owner'] }, {
    findRecipients: async () => [user('actor'), user('owner')],
    send: async (options) => {
      attempted.push(String(options.to));
      if (options.to === 'actor@example.com') throw new Error('simulated send failure');
      return { id: '<mailgun-id>' };
    },
  });
  assert.deepEqual(attempted, ['actor@example.com', 'owner@example.com']);
  assert.deepEqual(result, { sent: 1, failed: 1 });
});

test('UI status changes do not trigger the MCP Mailgun hook', async () => {
  const calls: TaskStatusChangeParams[] = [];
  const dependencies = {
    sendMcpStatusEmails: async (input: TaskStatusChangeParams) => { calls.push(input); },
    propagateTicketStatus: async () => {},
  };
  const base = { ...params, source: undefined, approverId: null, to: 'backlog', assigneeIds: [] };

  await notifyTaskStatusChange(base, dependencies);
  assert.equal(calls.length, 0);

  await notifyTaskStatusChange({ ...base, source: 'mcp' }, dependencies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'mcp');
});
