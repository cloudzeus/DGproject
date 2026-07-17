'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { reporterRecipients, sendTicketClarificationEmail } from '@/lib/tickets/emails'

const OPEN_FOR_CLARIFICATION = ['new', 'analyzing', 'triaged', 'converted', 'resolved', 'needs_info'] as const

async function requireMember(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.userType === 'customer') throw new Error('Απαιτείται σύνδεση μέλους ομάδας.')
  return session.user.id
}

/** Στέλνει ερώτηση διευκρίνισης στον reporter και βάζει το ticket σε «Αναμονή πελάτη». */
export async function requestClarification(input: { ticketId: string; message: string }) {
  const userId = await requireMember()
  const message = input.message.trim().slice(0, 3000)
  if (message.length < 5) return { ok: false as const, error: 'Γράψτε το ερώτημα προς τον πελάτη.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (!OPEN_FOR_CLARIFICATION.includes(ticket.status as (typeof OPEN_FOR_CLARIFICATION)[number])) {
    return { ok: false as const, error: 'Το ticket δεν είναι ανοιχτό για διευκρινίσεις.' }
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId: ticket.id, direction: 'outbound', body: message, authorId: userId } }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(ticket.status !== 'needs_info' ? { statusBeforeInfo: ticket.status, status: 'needs_info' } : {}),
        events: { create: { type: 'clarification_requested', actorId: userId } },
      },
    }),
  ])

  for (const r of await reporterRecipients(ticket.id)) {
    await sendTicketClarificationEmail({ ...r, question: message })
  }

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${ticket.id}`)
  return { ok: true as const }
}

/** Νήμα + στοιχεία ticket για το task detail (read-only). */
export async function getTicketThreadForTask(taskId: string) {
  await requireMember()
  const ticket = await prisma.ticket.findUnique({
    where: { taskId },
    select: {
      id: true, code: true, status: true,
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, body: true, createdAt: true } },
    },
  })
  if (!ticket) return null
  return { ticketId: ticket.id, code: ticket.code, status: ticket.status, messages: ticket.messages }
}
