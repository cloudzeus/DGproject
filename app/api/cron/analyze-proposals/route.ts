/**
 * Sweeper για αναλύσεις που κόλλησαν.
 *
 * Το fire-and-forget κλωτσάει την ανάλυση χωρίς να την περιμένει· αν πεθάνει η
 * διεργασία στη μέση, η γραμμή μένει σε `analyzing` για πάντα. Εδώ ξαναπιάνεται.
 *
 * Ίδια αυθεντικοποίηση με το /api/cron/analyze-tickets: CRON_SECRET ως
 * Authorization: Bearer <secret> ή ?secret=<secret>.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { STUCK_AFTER_MS, runProposalAnalysis } from '@/lib/proposals/analyze'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.startsWith('Bearer ')
    ? auth.slice(7)
    : new URL(req.url).searchParams.get('secret')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stuck = await prisma.proposalAnalysis.findMany({
    where: {
      status: { in: ['pending', 'analyzing'] },
      updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 5,
  })

  for (const a of stuck) {
    await runProposalAnalysis(a.id) // ποτέ δεν πετάει
  }

  return NextResponse.json({ processed: stuck.length })
}
