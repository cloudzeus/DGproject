/**
 * Smoke test: χτίζει και τα 5 dashboard builders με την πραγματική DB,
 * για έναν admin/manager χρήστη (isPrivileged: true) ΚΑΙ έναν member (isPrivileged: false).
 *   npx tsx scripts/test-dashboard.ts
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
  const { prisma } = await import('../lib/prisma')
  const { buildAttention } = await import('../lib/dashboard/attention')
  const { buildMyDay } = await import('../lib/dashboard/my-day')
  const { buildCapacity } = await import('../lib/dashboard/capacity')
  const { buildRadar } = await import('../lib/dashboard/radar')
  const { buildPulse } = await import('../lib/dashboard/pulse')

  const admin = await prisma.user.findFirst({
    where: { userType: 'employee', role: { in: ['admin', 'manager'] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: 'asc' },
  })
  assert.ok(admin, 'Δεν βρέθηκε admin/manager χρήστης στη DB')

  const member = await prisma.user.findFirst({
    where: { userType: 'employee', role: 'member' },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: 'asc' },
  })
  assert.ok(member, 'Δεν βρέθηκε member χρήστης στη DB')

  console.log(`admin: ${admin!.name ?? admin!.email} (${admin!.id})`)
  console.log(`member: ${member!.name ?? member!.email} (${member!.id})`)

  for (const [label, scope] of [
    ['admin (isPrivileged=true)', { userId: admin!.id, isPrivileged: true }] as const,
    ['member (isPrivileged=false)', { userId: member!.id, isPrivileged: false }] as const,
  ]) {
    console.log(`\n── ${label} ──`)

    const attention = await buildAttention(scope)
    console.log('attention items:', attention.length)
    JSON.stringify(attention)

    const myDay = await buildMyDay(scope)
    console.log(
      'myDay:',
      'today', myDay.today.length,
      'tomorrow', myDay.tomorrow.length,
      'inProgress', myDay.inProgress.length,
      'overdue', myDay.overdue.length,
    )
    JSON.stringify(myDay)

    const capacity = await buildCapacity(scope)
    console.log('capacity rows:', capacity.length)
    JSON.stringify(capacity)

    const radar = await buildRadar(scope)
    console.log('radar days:', radar.length)
    assert.equal(radar.length, 7)
    JSON.stringify(radar)

    const pulse = await buildPulse(scope)
    console.log('pulse kpis:', JSON.stringify(pulse.kpis))
    console.log(
      'pulse:',
      'pendingEmails', pulse.pendingEmails.length,
      'activity', pulse.activity.length,
      'hotProjects', pulse.hotProjects.length,
    )
    JSON.stringify(pulse)
  }

  console.log('\n✅ test-dashboard: όλα τα builders έτρεξαν (admin + member) και είναι JSON-safe')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
