'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { syncTaskCalendar } from '@/lib/task-calendar-sync'
import { notifyTaskAssignment } from '@/lib/notifications'
import { normalizeToBusinessHours } from '@/lib/business-hours'
import { getUserLoads } from '@/lib/task-scheduling'
import { sendTicketStatusEmail, sendTicketRejectedEmail } from '@/lib/tickets/emails'
import { analyzeTicket } from '@/lib/tickets/triage'
import { formatDurationGr } from '@/lib/tickets/format-duration'
import type { TaskPriority, TicketCategory } from '@prisma/client'

// Ticket triage is an admin/manager surface (spec §6).
async function requireTriager(): Promise<string> {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user?.id || (role !== 'admin' && role !== 'manager')) {
    throw new Error('Δεν έχετε δικαίωμα διαχείρισης tickets.')
  }
  return session.user.id
}

/** Persist admin edits to the AI panel (title/description/category/priority). */
export async function updateTicketAi(input: {
  ticketId: string
  title: string
  description: string
  category: TicketCategory
  priority: TaskPriority
}) {
  const actorId = await requireTriager()
  await prisma.ticket.update({
    where: { id: input.ticketId },
    data: {
      aiTitle: input.title.slice(0, 200),
      aiDescription: input.description.slice(0, 8000),
      aiCategory: input.category,
      aiPriority: input.priority,
      events: { create: { type: 'note', actorId, payload: JSON.stringify({ edited: 'ai_fields' }) } },
    },
  })
  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true as const }
}

export async function convertTicketToTask(input: {
  ticketId: string
  projectId: string
  assigneeId: string | null
  title: string
  description: string
  priority: TaskPriority
  estimatedHours?: number | null
}) {
  const actorId = await requireTriager()

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, code: true, status: true, subject: true, reporterEmail: true, reporterName: true, publicToken: true, originUrl: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (ticket.status === 'converted' || ticket.status === 'resolved' || ticket.status === 'closed') {
    return { ok: false as const, error: 'Το ticket έχει ήδη ανατεθεί.' }
  }
  const title = input.title.trim()
  if (title.length < 2) return { ok: false as const, error: 'Ο τίτλος είναι πολύ σύντομος.' }
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
  if (!project) return { ok: false as const, error: 'Το έργο δεν βρέθηκε.' }

  // Auto-slot: first free ≥1h business-hours gap of the assignee (or today 09:00+).
  const hours = input.estimatedHours && input.estimatedHours > 0 ? input.estimatedHours : 1
  let startDate = normalizeToBusinessHours(new Date())
  if (input.assigneeId) {
    const [load] = await getUserLoads([input.assigneeId])
    if (load?.nextFreeSlot) startDate = load.nextFreeSlot
  }
  const dueDate = new Date(startDate.getTime() + hours * 3_600_000)

  const maxOrder = await prisma.task.aggregate({ where: { projectId: input.projectId }, _max: { order: true } })

  const task = await prisma.task.create({
    data: {
      projectId: input.projectId,
      title,
      description: `${input.description.trim()}\n\n---\nΑπό ticket ${ticket.code} (${ticket.reporterEmail})\nΣελίδα: ${ticket.originUrl.slice(0, 500)}`,
      status: 'todo',
      priority: input.priority,
      startDate,
      dueDate,
      estimatedHours: hours,
      order: (maxOrder._max.order ?? -1) + 1,
      createdById: actorId,
      assignees: input.assigneeId ? { create: [{ userId: input.assigneeId }] } : undefined,
    },
    select: { id: true },
  })

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'converted',
      taskId: task.id,
      events: { create: { type: 'converted', actorId, payload: JSON.stringify({ taskId: task.id, projectId: input.projectId }) } },
    },
  })

  try {
    await syncTaskCalendar(task.id)
  } catch (e) {
    console.warn('[tickets] calendar sync failed for converted task', e)
  }
  if (input.assigneeId) {
    await notifyTaskAssignment(task.id, [input.assigneeId], actorId)
  }
  await sendTicketStatusEmail({
    to: ticket.reporterEmail,
    reporterName: ticket.reporterName,
    code: ticket.code,
    subject: ticket.subject,
    publicToken: ticket.publicToken,
    statusLabel: 'Σε επεξεργασία',
    detail: 'Το αίτημά σας ανατέθηκε στην ομάδα μας και μπήκε στον προγραμματισμό εργασιών.',
  })

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${ticket.id}`)
  revalidatePath('/board')
  return { ok: true as const, taskId: task.id }
}

export async function rejectTicket(input: { ticketId: string; reason: string; notifyReporter: boolean }) {
  const actorId = await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, code: true, status: true, subject: true, reporterEmail: true, reporterName: true, publicToken: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (['converted', 'resolved', 'closed'].includes(ticket.status)) {
    return { ok: false as const, error: 'Το ticket έχει ήδη προχωρήσει.' }
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'rejected',
      events: { create: { type: 'rejected', actorId, payload: JSON.stringify({ reason: input.reason.slice(0, 1000) }) } },
    },
  })
  if (input.notifyReporter) {
    await sendTicketRejectedEmail({
      to: ticket.reporterEmail,
      reporterName: ticket.reporterName,
      code: ticket.code,
      subject: ticket.subject,
      publicToken: ticket.publicToken,
      reason: input.reason || null,
    })
  }
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true as const }
}

/**
 * Approve the KB draft: persist a KnowledgeEntry, close the ticket, email the
 * reporter. Entries feed the triage context of future tickets (spec §4).
 */
export async function saveKnowledgeEntry(input: {
  ticketId: string
  title: string
  problem: string
  solution: string
  tags: string[]
}) {
  const actorId = await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true, code: true, status: true, subject: true, reporterEmail: true, reporterName: true,
      publicToken: true, taskId: true, aiCategory: true, createdAt: true, resolvedAt: true,
      task: { select: { projectId: true } },
    },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (ticket.status !== 'resolved') return { ok: false as const, error: 'Το ticket δεν είναι σε κατάσταση «Ολοκληρώθηκε».' }
  if (!input.title.trim() || !input.solution.trim()) return { ok: false as const, error: 'Συμπληρώστε τίτλο και λύση.' }

  await prisma.knowledgeEntry.create({
    data: {
      ticketId: ticket.id,
      taskId: ticket.taskId,
      projectId: ticket.task?.projectId ?? null,
      title: input.title.trim().slice(0, 190),
      problem: input.problem.trim().slice(0, 8000),
      solution: input.solution.trim().slice(0, 8000),
      tags: JSON.stringify(input.tags.slice(0, 20)),
      category: ticket.aiCategory,
      approvedById: actorId,
    },
  })
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'closed',
      events: { create: { type: 'closed', actorId } },
    },
  })
  await sendTicketStatusEmail({
    to: ticket.reporterEmail,
    reporterName: ticket.reporterName,
    code: ticket.code,
    subject: ticket.subject,
    publicToken: ticket.publicToken,
    statusLabel: 'Το αίτημα έκλεισε',
    detail: 'Το αίτημά σας ολοκληρώθηκε και αρχειοθετήθηκε. Ευχαριστούμε για την επικοινωνία.',
    resolutionTime: formatDurationGr(ticket.createdAt, ticket.resolvedAt ?? new Date()),
  })

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true as const }
}

export async function reanalyzeTicket(ticketId: string) {
  await requireTriager()
  await prisma.ticket.update({ where: { id: ticketId }, data: { aiError: null } })
  await analyzeTicket(ticketId)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true as const }
}
