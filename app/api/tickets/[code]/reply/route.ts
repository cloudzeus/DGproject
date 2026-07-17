import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/tickets/source-auth'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 })

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    select: { id: true, publicToken: true, status: true, statusBeforeInfo: true, subject: true, code: true, taskId: true },
  })
  if (!ticket || ticket.publicToken !== token) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (['closed', 'rejected', 'merged'].includes(ticket.status)) {
    return NextResponse.json({ error: 'ticket_closed' }, { status: 409 })
  }
  if (!checkRateLimit(`reply:${ticket.id}`, 10, 3_600_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: string
  try {
    const json = (await req.json()) as { body?: unknown }
    body = String(json.body ?? '').trim().slice(0, 3000)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 422 })
  }
  if (!body) return NextResponse.json({ error: 'empty_body' }, { status: 422 })

  await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId: ticket.id, direction: 'inbound', body } }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(ticket.status === 'needs_info'
          ? { status: ticket.statusBeforeInfo ?? 'converted', statusBeforeInfo: null }
          : {}),
        events: { create: { type: 'reporter_replied' } },
      },
    }),
  ])

  // Ειδοποίηση ομάδας: assignees του task, αλλιώς όλοι οι admin/manager.
  let userIds: string[] = []
  if (ticket.taskId) {
    const assignees = await prisma.taskAssignee.findMany({ where: { taskId: ticket.taskId }, select: { userId: true } })
    userIds = assignees.map((a) => a.userId)
  }
  if (userIds.length === 0) {
    const managers = await prisma.user.findMany({ where: { role: { in: ['admin', 'manager'] } }, select: { id: true } })
    userIds = managers.map((u) => u.id)
  }
  await createNotifications(
    userIds.map((userId) => ({
      userId,
      title: `Απάντηση πελάτη — ${ticket.code}`,
      message: body.slice(0, 140),
      type: 'ticket' as const,
      link: `/tickets/${ticket.id}`,
    }))
  )

  return NextResponse.json({ ok: true })
}
