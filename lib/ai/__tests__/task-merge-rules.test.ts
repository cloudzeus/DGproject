import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectMergeParticipants,
  isTaskMergeApprover,
  mergedTaskStatus,
  mergedTrackedMs,
  normalizeTaskMergeGroups,
  stringArrayFromJson,
} from '../task-merge-rules'

test('μόνο το καθορισμένο email εγκρίνει, με case/whitespace normalization', () => {
  assert.equal(isTaskMergeApprover(' GKOZYRIS@DGSMART.GR '), true)
  assert.equal(isTaskMergeApprover('gkozyris@dgsmart.gr'), true)
  assert.equal(isTaskMergeApprover('other@dgsmart.gr'), false)
  assert.equal(isTaskMergeApprover(null), false)
  assert.equal(isTaskMergeApprover(undefined), false)
})

test('οι AI ομάδες κρατούν μόνο πραγματικά ids και απορρίπτουν ξένα ή overlapping groups', () => {
  const allowed = ['a', 'b', 'c', 'd']
  const value = {
    groups: [
      {
        primaryTaskId: 'a', taskIds: ['a', 'b'], title: 'Ενιαίο A',
        description: 'Πλήρης περιγραφή', rationale: 'Ίδιο deliverable', confidence: 0.9,
      },
      {
        primaryTaskId: 'b', taskIds: ['b', 'c'], title: 'Overlap',
        description: 'Δεν πρέπει να περάσει', rationale: 'Επικάλυψη', confidence: 0.8,
      },
      {
        primaryTaskId: 'c', taskIds: ['c', 'external'], title: 'Foreign',
        description: 'Δεν πρέπει να περάσει', rationale: 'Ξένο id', confidence: 0.8,
      },
      {
        primaryTaskId: 'c', taskIds: ['c', 'd'], title: 'Ενιαίο B',
        description: 'Έγκυρη περιγραφή', rationale: 'Ίδιο ερώτημα', confidence: 1.4,
      },
    ],
  }
  const groups = normalizeTaskMergeGroups(value, allowed)
  assert.deepEqual(groups.map((group) => group.taskIds), [['a', 'b'], ['c', 'd']])
  assert.equal(groups[1].confidence, 1)
})

test('AI group χωρίς δύο πραγματικά tasks ή χωρίς ουσιαστικό κείμενο απορρίπτεται', () => {
  const base = {
    primaryTaskId: 'a', title: 'Τίτλος', description: 'Περιγραφή', rationale: 'Αιτία', confidence: 0.5,
  }
  assert.deepEqual(normalizeTaskMergeGroups({ groups: [{ ...base, taskIds: ['a', 'unknown'] }] }, ['a']), [])
  assert.deepEqual(normalizeTaskMergeGroups({ groups: [{ ...base, taskIds: ['a', 'b'], rationale: ' ' }] }, ['a', 'b']), [])
  assert.deepEqual(normalizeTaskMergeGroups({ groups: [{ ...base, primaryTaskId: 'b', taskIds: ['a'] }] }, ['a', 'b']), [])
})

test('οι παραλήπτες περιλαμβάνουν creators, assignees και Q&A, με dedupe και χωρίς AI agents', () => {
  const creator = { id: 'u1', email: 'Creator@Example.com', name: 'Creator' }
  const executor = { id: 'u2', email: 'executor@example.com', name: 'Executor' }
  const ai = { id: 'ai', email: 'agent@example.com', name: 'AI', isAIAgent: true }
  const questioner = { id: 'u3', email: 'question@example.com', name: null }
  const participants = collectMergeParticipants([
    {
      creator,
      assignees: [{ user: { ...creator, email: 'creator@example.com' } }, { user: ai }],
      questions: [{ askedBy: questioner, askedTo: executor }],
    },
    {
      creator: executor,
      assignees: [{ user: executor }],
      questions: [],
    },
  ])
  assert.deepEqual(participants.map((person) => person.email), [
    'creator@example.com',
    'executor@example.com',
    'question@example.com',
  ])
  assert.equal(participants.some((person) => person.isAIAgent), false)
})

test('το merged status διατηρεί την πιο ενεργή κατάσταση', () => {
  assert.equal(mergedTaskStatus(['backlog', 'todo']), 'todo')
  assert.equal(mergedTaskStatus(['todo', 'in_progress', 'review']), 'review')
  assert.equal(mergedTaskStatus(['backlog', 'in_progress']), 'in_progress')
  assert.equal(mergedTaskStatus([]), 'backlog')
})

test('ο merged χρόνος αθροίζει accumulated και τρέχοντα timers', () => {
  const now = new Date('2026-11-27T12:00:00.000Z')
  const total = mergedTrackedMs([
    {
      status: 'in_progress',
      inProgressStartedAt: new Date('2026-11-27T11:30:00.000Z'),
      inProgressAccumulatedMs: 3_600_000n,
    },
    {
      status: 'todo',
      inProgressStartedAt: new Date('2026-11-27T10:00:00.000Z'),
      inProgressAccumulatedMs: 1_800_000,
    },
  ], now)
  assert.equal(total, 7_200_000)
})

test('τα JSON recipients γίνονται ασφαλώς string array', () => {
  assert.deepEqual(stringArrayFromJson(['a@example.com', 1, null, 'b@example.com']), ['a@example.com', 'b@example.com'])
  assert.deepEqual(stringArrayFromJson({ email: 'a@example.com' }), [])
})
