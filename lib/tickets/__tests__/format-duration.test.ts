import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDurationGr } from '../format-duration'

const at = (iso: string) => new Date(iso)

test('minutes only', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T10:45:00Z')), '45 λεπτά')
})

test('single minute floor', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T10:00:20Z')), '1 λεπτό')
})

test('hours and minutes', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T13:20:00Z')), '3 ώρες 20 λεπτά')
})

test('one hour singular', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T11:00:00Z')), '1 ώρα')
})

test('days and hours — minutes dropped (two largest units)', () => {
  assert.equal(formatDurationGr(at('2026-07-15T08:00:00Z'), at('2026-07-17T12:30:00Z')), '2 ημέρες 4 ώρες')
})

test('one day singular', () => {
  assert.equal(formatDurationGr(at('2026-07-16T10:00:00Z'), at('2026-07-17T10:00:00Z')), '1 ημέρα')
})

test('negative/zero clamps to 1 λεπτό', () => {
  assert.equal(formatDurationGr(at('2026-07-17T10:00:00Z'), at('2026-07-17T09:00:00Z')), '1 λεπτό')
})
