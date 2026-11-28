import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCustomerAnalytics, type CustomerAnalyticsProject, type CustomerAnalyticsTask } from './customer-analytics'

const range = { from: new Date('2026-11-01T00:00:00.000Z'), to: new Date('2026-11-30T23:59:59.999Z') }
const prev = { from: new Date('2026-10-01T00:00:00.000Z'), to: new Date('2026-10-31T23:59:59.999Z') }
const now = new Date('2026-11-28T12:00:00.000Z')

function task(input: Omit<Partial<CustomerAnalyticsTask>, 'createdAt'> & { createdAt: string }): CustomerAnalyticsTask {
  return {
    status: 'todo',
    dueDate: null,
    completedAt: null,
    estimatedHours: null,
    billableHours: null,
    inProgressAccumulatedMs: 0n,
    inProgressStartedAt: null,
    ...input,
    createdAt: new Date(input.createdAt),
  }
}

function project(id: string, companyId: string | null, tasks: CustomerAnalyticsTask[]): CustomerAnalyticsProject {
  return {
    id,
    name: `Έργο ${id}`,
    color: '#0078D4',
    status: 'active',
    primaryCompany: companyId ? { id: companyId, NAME: companyId === 'c1' ? 'Acme' : 'Beta', ISACTIVE: 1 } : null,
    tasks,
  }
}

test('customer analytics separate period flow, on-time completion and billable hours', () => {
  const report = buildCustomerAnalytics([
    project('p1', 'c1', [
      task({ createdAt: '2026-11-02T09:00:00.000Z', status: 'done', completedAt: new Date('2026-11-05T09:00:00.000Z'), dueDate: new Date('2026-11-06T00:00:00.000Z'), estimatedHours: 8, billableHours: 4.5, inProgressAccumulatedMs: 7_200_000n }),
      task({ createdAt: '2026-10-15T09:00:00.000Z', status: 'done', completedAt: new Date('2026-11-10T09:00:00.000Z'), dueDate: new Date('2026-11-08T00:00:00.000Z'), billableHours: 2 }),
      task({ createdAt: '2026-11-12T09:00:00.000Z', dueDate: new Date('2026-11-20T00:00:00.000Z'), estimatedHours: 3 }),
    ]),
    project('p2', 'c2', [
      task({ createdAt: '2026-10-03T09:00:00.000Z', status: 'done', completedAt: new Date('2026-10-08T09:00:00.000Z') }),
    ]),
  ], range, prev, now)

  const acme = report.rows.find((row) => row.id === 'c1')!
  assert.equal(acme.createdInPeriod, 2)
  assert.equal(acme.completedInPeriod, 2)
  assert.equal(acme.completedPreviousPeriod, 0)
  assert.equal(acme.netFlow, 0)
  assert.equal(acme.open, 1)
  assert.equal(acme.overdue, 1)
  assert.equal(acme.onTimePct, 50)
  assert.equal(acme.onTimeN, 2)
  assert.equal(acme.billableHours, 6.5)
  assert.equal(acme.trackedHours, 2)
  assert.equal(acme.estimatedHours, 11)
  assert.equal(report.summary.customers, 2)
  assert.equal(report.summary.activeProjects, 2)
  assert.equal(report.summary.completedInPeriod, 2)
  assert.equal(report.summary.onTimePct, 50)
})

test('cancelled and unassigned tasks stay out of customer KPI and empty customers are safe', () => {
  const report = buildCustomerAnalytics([
    project('p1', 'c1', [
      task({ createdAt: '2026-11-02T09:00:00.000Z', status: 'cancelled', completedAt: new Date('2026-11-04T09:00:00.000Z'), billableHours: 10 }),
    ]),
    project('p2', null, [task({ createdAt: '2026-11-02T09:00:00.000Z', status: 'done', completedAt: new Date('2026-11-04T09:00:00.000Z') })]),
  ], range, prev, now)

  assert.equal(report.rows.length, 1)
  assert.equal(report.rows[0].total, 0)
  assert.equal(report.rows[0].completionPct, 0)
  assert.equal(report.rows[0].completedInPeriod, 0)
  assert.equal(report.rows[0].onTimePct, null)
  assert.equal(report.rows[0].avgCycleHours, null)
  assert.equal(report.summary.billableHours, 0)
  assert.equal(report.summary.completedDelta, null)
  assert.equal(report.weeklyCompletions.every((week) => week.count === 0), true)
})

test('customer summary aggregates actual completions instead of requester or assignee counts', () => {
  const report = buildCustomerAnalytics([
    project('p1', 'c1', [task({ createdAt: '2026-11-01T09:00:00.000Z', status: 'done', completedAt: new Date('2026-11-03T09:00:00.000Z') })]),
    project('p2', 'c1', [task({ createdAt: '2026-11-02T09:00:00.000Z', status: 'done', completedAt: new Date('2026-11-04T09:00:00.000Z') })]),
  ], range, prev, now)

  assert.equal(report.rows[0].totalProjects, 2)
  assert.equal(report.rows[0].projects.length, 2)
  assert.equal(report.summary.completedInPeriod, 2)
  assert.equal(report.summary.createdInPeriod, 2)
  assert.equal(report.weeklyCompletions.reduce((sum, week) => sum + week.count, 0), 2)
})
