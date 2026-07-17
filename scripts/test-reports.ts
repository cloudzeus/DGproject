/**
 * Smoke test: χτίζει και τα 5 reports με την πραγματική DB.
 *   npx tsx scripts/test-reports.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (process.env[m[1]] === undefined) process.env[m[1]] = val
    }
  }
}
loadEnv()

async function main() {
  const { resolveRange } = await import('../lib/reports/shared')
  const { buildOverviewReport } = await import('../lib/reports/overview')
  const { buildProjectsReport } = await import('../lib/reports/projects')
  const { buildTasksReport } = await import('../lib/reports/tasks')
  const { buildTicketsReport } = await import('../lib/reports/tickets')
  const { buildUsersReport } = await import('../lib/reports/users')

  const { range, prev } = resolveRange({ period: '90d' })
  const scope = { range, prev, userId: '', isPrivileged: true }

  const overview = await buildOverviewReport(scope)
  console.log('overview:', JSON.stringify(overview.kpis))
  assert.ok(overview.taskCompletionsByDay.length > 0)

  const projects = await buildProjectsReport(scope)
  console.log('projects rows:', projects.rows.length)
  assert.ok(projects.rows.length > 0)
  // JSON-serializable (κανένα BigInt/Date leak)
  JSON.stringify(projects)

  const tasks = await buildTasksReport(scope)
  console.log('tasks aging:', tasks.aging.length, 'throughput weeks:', tasks.throughputByWeek.length)
  JSON.stringify(tasks)

  const tickets = await buildTicketsReport(scope)
  console.log('tickets total:', tickets.volume.total, 'toTriage n:', tickets.times.toTriage.n)
  JSON.stringify(tickets)

  const users = await buildUsersReport(scope)
  console.log('users rows:', users.rows.length)
  JSON.stringify(users)

  console.log('✅ test-reports: όλα τα builders έτρεξαν και είναι JSON-safe')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
