import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DAY_MS,
  isOpenTaskStatus,
  isStaleOpenTask,
  parseBillableHours,
  staleTaskCutoff,
} from '../task-lifecycle'

const now = new Date('2026-11-28T12:00:00.000Z')

test('stale cutoff is exactly 30 days and includes the boundary', () => {
  assert.equal(staleTaskCutoff(now).toISOString(), '2026-10-29T12:00:00.000Z')
  const createdAt = new Date(now.getTime() - 30 * DAY_MS)
  assert.equal(isStaleOpenTask({ createdAt, status: 'todo' }, now), true)
  assert.equal(isStaleOpenTask({ createdAt: new Date(createdAt.getTime() + 1), status: 'todo' }, now), false)
})

test('closed, cancelled and merged tasks are not stale open tasks', () => {
  const createdAt = new Date(now.getTime() - 60 * DAY_MS)
  assert.equal(isStaleOpenTask({ createdAt, status: 'done' }, now), false)
  assert.equal(isStaleOpenTask({ createdAt, status: 'cancelled' }, now), false)
  assert.equal(isStaleOpenTask({ createdAt, status: 'todo', mergedIntoId: 'primary' }, now), false)
  assert.equal(isStaleOpenTask({ createdAt, status: 'review', mergedIntoId: null }, now), true)
})

test('open status excludes both terminal states', () => {
  for (const status of ['backlog', 'todo', 'in_progress', 'review']) assert.equal(isOpenTaskStatus(status), true)
  for (const status of ['done', 'cancelled']) assert.equal(isOpenTaskStatus(status), false)
})

test('billable hours are optional and accept decimal comma values', () => {
  assert.equal(parseBillableHours(undefined), null)
  assert.equal(parseBillableHours(null), null)
  assert.equal(parseBillableHours(''), null)
  assert.equal(parseBillableHours('   '), null)
  assert.equal(parseBillableHours('2,5'), 2.5)
  assert.equal(parseBillableHours('1.235'), 1.24)
  assert.equal(parseBillableHours(0), 0)
})

test('billable hours reject invalid, negative and excessive values', () => {
  for (const value of [-1, '-0,5', 'abc', Number.NaN, Number.POSITIVE_INFINITY, 100001]) {
    assert.throws(() => parseBillableHours(value), /μη αρνητικός αριθμός/)
  }
})
