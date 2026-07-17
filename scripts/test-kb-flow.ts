/**
 * Smoke test: resolution → KB draft regeneration.
 *
 *   npx tsx scripts/test-kb-flow.ts --ticket <id> [--solution "..."]
 *
 * Sets resolutionSummary on the ticket, runs generateKbDraft, then prints
 * the newest TicketEvent(kb_draft) payload so you can verify the draft's
 * "solution" reflects the recorded resolution.
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
    console.error('Usage: npx tsx scripts/test-kb-flow.ts --ticket <id> [--solution "..."]')
    process.exit(1)
  }
  const si = args.indexOf('--solution')
  const solution =
    si !== -1 && args[si + 1]
      ? args[si + 1]
      : 'Δοκιμαστική λύση: καθαρίστηκε η cache του Next.js και έγινε redeploy.'

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY is not set — generateKbDraft would no-op. Aborting.')
    process.exit(1)
  }

  const { prisma } = await import('../lib/prisma')
  const { generateKbDraft } = await import('../lib/tickets/kb')

  await prisma.ticket.update({ where: { id: ticketId }, data: { resolutionSummary: solution } })
  console.log('resolutionSummary set. Generating KB draft…')
  await generateKbDraft(ticketId)

  const event = await prisma.ticketEvent.findFirst({
    where: { ticketId, type: 'kb_draft' },
    orderBy: { createdAt: 'desc' },
  })
  console.log(JSON.stringify(event ? JSON.parse(event.payload ?? '{}') : null, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
