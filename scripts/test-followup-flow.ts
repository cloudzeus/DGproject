/**
 * Smoke: clarification → needs_info → public reply → status restore.
 *
 *   npx tsx scripts/test-followup-flow.ts --ticket <id> [--body "..."]
 *
 * Sets the ticket to needs_info (creating an outbound TicketMessage directly
 * via prisma — no session exists in a CLI), then POSTs a reporter reply to the
 * public reply endpoint and verifies the previous status was restored.
 * Requires a running dev server (npm run dev) on APP_URL or localhost:3000.
 */
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val
    }
  }
}
loadEnv()

async function main() {
  const args = process.argv.slice(2)
  const ti = args.indexOf('--ticket')
  const ticketId = ti !== -1 ? args[ti + 1] : undefined
  if (!ticketId || ticketId.startsWith('--')) {
    console.error('Usage: npx tsx scripts/test-followup-flow.ts --ticket <id> [--body "..."]')
    process.exit(1)
  }
  const bi = args.indexOf('--body')
  const replyBody =
    bi !== -1 && args[bi + 1]
      ? args[bi + 1]
      : 'Δοκιμαστική απάντηση πελάτη: επισυνάπτω τα στοιχεία που ζητήσατε.'

  const { prisma } = await import('../lib/prisma')

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, code: true, status: true, statusBeforeInfo: true, publicToken: true },
  })
  if (!ticket) {
    console.error(`Ticket ${ticketId} δεν βρέθηκε.`)
    process.exit(1)
  }
  console.log(`Ticket ${ticket.code} — status πριν: ${ticket.status}`)
  if (['closed', 'rejected', 'merged'].includes(ticket.status)) {
    console.error('Το ticket είναι κλειστό/απορριφθέν/συγχωνευμένο — διαλέξτε άλλο.')
    process.exit(1)
  }

  // 1) Outbound clarification + needs_info (directly via prisma — CLI has no session)
  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        direction: 'outbound',
        body: 'Smoke test: χρειαζόμαστε περισσότερα στοιχεία για να προχωρήσουμε.',
      },
    }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'needs_info',
        statusBeforeInfo: ticket.status,
        events: { create: { type: 'clarification_requested', payload: JSON.stringify({ via: 'smoke-test' }) } },
      },
    }),
  ])
  console.log(`→ needs_info (statusBeforeInfo=${ticket.status})`)

  // 2) Public reply via the HTTP endpoint
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const url = `${base}/api/tickets/${ticket.code}/reply?token=${ticket.publicToken}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: replyBody }),
    })
  } catch {
    console.error(`Ο dev server δεν αποκρίνεται στο ${base}. Ξεκινήστε \`npm run dev\` και ξανατρέξτε το script.`)
    await prisma.$disconnect()
    process.exit(1)
  }
  console.log(`POST ${url} → ${res.status} ${JSON.stringify(await res.json().catch(() => null))}`)

  // 3) Re-read and report
  const after = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    select: {
      status: true,
      statusBeforeInfo: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 4, select: { direction: true, body: true, createdAt: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 4, select: { type: true, createdAt: true } },
    },
  })
  console.log(`\nStatus μετά: ${after?.status} (statusBeforeInfo=${after?.statusBeforeInfo ?? 'null'})`)
  console.log(after?.status === ticket.status ? '✓ Το status επανήλθε στο αρχικό.' : '✗ Το status ΔΕΝ επανήλθε στο αρχικό!')
  console.log('\nΤελευταία μηνύματα:')
  for (const m of after?.messages ?? []) {
    console.log(`  [${m.direction}] ${m.createdAt.toISOString()} — ${m.body.slice(0, 80)}`)
  }
  console.log('\nΤελευταία events:')
  for (const e of after?.events ?? []) {
    console.log(`  ${e.type} @ ${e.createdAt.toISOString()}`)
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
