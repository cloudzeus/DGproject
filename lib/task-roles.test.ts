import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveRequesterUsers, uniqueTasksById, uniqueUserIds } from './task-roles';

test('task roles preserve multiple people and remove duplicate ids', () => {
  assert.deepEqual(uniqueUserIds(['u1', 'u2'], ['u2', 'u3'], ['', ' u1 ']), ['u1', 'u2', 'u3']);
});

test('explicit requesters replace the legacy creator fallback', () => {
  const creator = { id: 'creator' };
  assert.deepEqual(effectiveRequesterUsers(creator, []), [creator]);
  assert.deepEqual(
    effectiveRequesterUsers(creator, [{ user: { id: 'r1' } }, { user: { id: 'r2' } }]),
    [{ id: 'r1' }, { id: 'r2' }],
  );
});

test('legacy and explicit request relations do not double-count tasks', () => {
  const tasks = uniqueTasksById([{ id: 't1', value: 1 }], [{ id: 't1', value: 2 }, { id: 't2', value: 3 }]);
  assert.equal(tasks.length, 2);
  assert.equal(tasks.find((task) => task.id === 't1')?.value, 2);
});
