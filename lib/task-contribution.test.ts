import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeCompletionActivities,
  latestCompletionActivities,
} from './task-contribution';

const at = (value: string) => new Date(value);

test('completion credit is deduped per actor and task, keeping the latest event', () => {
  const activities = [
    { action: 'completed', taskId: 't1', actorId: 'requester', createdAt: at('2026-01-01T09:00:00Z') },
    { action: 'completed', taskId: 't1', actorId: 'requester', createdAt: at('2026-01-03T09:00:00Z') },
    { action: 'completed', taskId: 't1', actorId: 'implementer', createdAt: at('2026-01-02T09:00:00Z') },
    { action: 'completed', taskId: 't2', actorId: 'implementer', createdAt: at('2026-01-04T09:00:00Z') },
    { action: 'updated', taskId: 't2', actorId: 'requester', createdAt: at('2026-01-05T09:00:00Z') },
    { action: 'completed', taskId: null, actorId: 'requester', createdAt: at('2026-01-05T09:00:00Z') },
  ];

  const result = dedupeCompletionActivities(activities);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((item) => [item.actorId, item.taskId, item.createdAt.toISOString()]),
    [
      ['implementer', 't1', '2026-01-02T09:00:00.000Z'],
      ['requester', 't1', '2026-01-03T09:00:00.000Z'],
      ['implementer', 't2', '2026-01-04T09:00:00.000Z'],
    ],
  );
});

test('latest completion selects one actual actor per task and accepts actor relation payloads', () => {
  const activities = [
    { action: 'completed', taskId: 't1', actor: { id: 'u1' }, createdAt: at('2026-01-01T09:00:00Z') },
    { action: 'completed', taskId: 't1', actor: { id: 'u2' }, createdAt: at('2026-01-02T09:00:00Z') },
    { action: 'completed', taskId: 't2', actor: { id: 'u1' }, createdAt: at('2026-01-03T09:00:00Z') },
  ];

  const result = latestCompletionActivities(activities);
  assert.deepEqual(
    result.map((item) => [item.taskId, item.actor.id]),
    [['t1', 'u2'], ['t2', 'u1']],
  );
});
