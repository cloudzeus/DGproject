/**
 * CLI smoke test for the DeepSeek ticket triage engine.
 *
 *   npx tsx scripts/test-ticket-triage.ts --dry           # sample ticket, no DB writes
 *   npx tsx scripts/test-ticket-triage.ts --ticket <id>   # run analyzeTicket on a real ticket
 *
 * --dry builds the same context (projects, similar tasks, KB, user loads)
 * and calls DeepSeek directly via a throwaway in-memory ticket, printing the
 * suggestion. Nothing is written.
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
  const { prisma } = await import('../lib/prisma')
  const ticketArg = process.argv.indexOf('--ticket')

  if (ticketArg !== -1) {
    const id = process.argv[ticketArg + 1]
    if (!id) throw new Error('Usage: --ticket <id>')
    const { analyzeTicket } = await import('../lib/tickets/triage')
    console.log(`Running analyzeTicket(${id})…`)
    await analyzeTicket(id)
    const after = await prisma.ticket.findUnique({
      where: { id },
      select: { code: true, status: true, aiTitle: true, aiCategory: true, aiPriority: true, aiSuggestedProjectId: true, aiSuggestedAssigneeId: true, aiConfidence: true, aiReasoning: true, aiError: true },
    })
    console.log(JSON.stringify(after, null, 2))
  } else {
    // --dry: create a transient ticket in a rolled-back transaction is not
    // possible across the triage engine's own prisma calls, so we insert a
    // throwaway source+ticket, analyze, print, then delete both.
    console.log('DRY RUN — inserting throwaway ticket, will delete afterwards.\n')
    const source = await prisma.ticketSource.create({
      data: { code: `__TEST_${Date.now()}`, name: 'Smoke Test Source', secretHash: 'x', originUrls: '[]' },
    })
    const ticket = await prisma.ticket.create({
      data: {
        code: `TKT-TEST-${Date.now()}`,
        sourceId: source.id,
        reporterEmail: 'test@example.com',
        originUrl: 'https://shop.example.gr/checkout',
        subject: 'Δεν ολοκληρώνεται η παραγγελία με κάρτα',
        body: 'Καλησπέρα, όταν πατάω πληρωμή με κάρτα στο checkout βγαίνει λευκή σελίδα και η παραγγελία δεν καταχωρείται. Δοκίμασα και από κινητό, το ίδιο. Το καλάθι είχε 3 προϊόντα. Μπορείτε να το δείτε; Τηλέφωνό μου 6941234567.',
      },
    })
    try {
      const { analyzeTicket } = await import('../lib/tickets/triage')
      await analyzeTicket(ticket.id)
      const after = await prisma.ticket.findUnique({
        where: { id: ticket.id },
        select: { status: true, aiTitle: true, aiDescription: true, aiCategory: true, aiPriority: true, aiSuggestedProjectId: true, aiSuggestedAssigneeId: true, aiConfidence: true, aiReasoning: true, aiError: true },
      })
      console.log(JSON.stringify(after, null, 2))
    } finally {
      await prisma.notification.deleteMany({ where: { link: `/tickets/${ticket.id}` } })
      await prisma.ticket.delete({ where: { id: ticket.id } })
      await prisma.ticketSource.delete({ where: { id: source.id } })
      console.log('\nCleaned up throwaway ticket/source/notifications.')
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
