import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TICKET_PUBLIC_STATUS_LABEL, publicEventLabel } from '@/lib/tickets/status-labels'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 })

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket || ticket.publicToken !== token) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const events = ticket.events
    .map((e) => {
      let payload: Record<string, unknown> | null = null
      try {
        payload = e.payload ? JSON.parse(e.payload) : null
      } catch {}
      const label = publicEventLabel(e.type, payload)
      return label ? { label, at: e.createdAt } : null
    })
    .filter(Boolean)

  return NextResponse.json({
    code: ticket.code,
    status: ticket.status,
    statusLabel: TICKET_PUBLIC_STATUS_LABEL[ticket.status],
    subject: ticket.subject,
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt,
    events,
  })
}
