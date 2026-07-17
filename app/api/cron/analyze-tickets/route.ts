import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzeTicket } from '@/lib/tickets/triage'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Sweeper for tickets stuck in new/analyzing (e.g. the fire-and-forget kick
 * died with the process). Retries up to 3 times per ticket, counted via
 * `analyzed` events carrying an error payload. Auth: CRON_SECRET as
 * Authorization: Bearer <secret> or ?secret=<secret> (same pattern as
 * /api/cron/ingest-meetings).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : new URL(req.url).searchParams.get('secret')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stuck = await prisma.ticket.findMany({
    where: {
      status: { in: ['new', 'analyzing'] },
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    select: { id: true, code: true, _count: { select: { events: { where: { type: 'analyzed' } } } } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  let processed = 0
  const skipped: string[] = []
  for (const t of stuck) {
    if (t._count.events >= 3) {
      skipped.push(t.code)
      continue
    }
    await analyzeTicket(t.id) // never throws
    processed++
  }

  return NextResponse.json({ processed, skipped })
}
