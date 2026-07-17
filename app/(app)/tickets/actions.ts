'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { syncTaskCalendar } from '@/lib/task-calendar-sync'
import { notifyTaskAssignment } from '@/lib/notifications'
import { normalizeToBusinessHours } from '@/lib/business-hours'
import { getUserLoads } from '@/lib/task-scheduling'
import { sendTicketStatusEmail, sendTicketRejectedEmail, sendTicketMergedEmail, reporterRecipients } from '@/lib/tickets/emails'
import { analyzeTicket } from '@/lib/tickets/triage'
import { formatDurationGr } from '@/lib/tickets/format-duration'
import { resolveHelpCategory } from '@/lib/knowledge/help-category'
import type { TaskPriority, TicketCategory, TicketStatus } from '@prisma/client'

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
    select: {
      id: true, code: true, status: true, subject: true, reporterEmail: true, reporterName: true, publicToken: true, originUrl: true,
      attachments: { select: { name: true, size: true, mimeType: true, url: true } },
    },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (['converted', 'resolved', 'closed', 'rejected', 'merged'].includes(ticket.status)) {
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

  if (ticket.attachments.length > 0) {
    await prisma.attachment.createMany({
      data: ticket.attachments.map((a) => ({
        taskId: task.id,
        projectId: input.projectId,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        url: a.url,
        source: 'local' as const,
        uploadedById: actorId,
      })),
    })
  }

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
  for (const r of await reporterRecipients(ticket.id)) {
    await sendTicketStatusEmail({
      ...r,
      statusLabel: 'Σε επεξεργασία',
      detail: 'Το αίτημά σας ανατέθηκε στην ομάδα μας και μπήκε στον προγραμματισμό εργασιών.',
    })
  }

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
    for (const r of await reporterRecipients(ticket.id)) {
      await sendTicketRejectedEmail({
        ...r,
        reason: input.reason || null,
      })
    }
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
  helpCategoryId?: string | null
  newCategoryName?: string | null
}) {
  const actorId = await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true, code: true, status: true, subject: true, reporterEmail: true, reporterName: true,
      publicToken: true, taskId: true, aiCategory: true, createdAt: true, resolvedAt: true, sourceId: true,
      task: { select: { projectId: true } },
    },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (ticket.status !== 'resolved') return { ok: false as const, error: 'Το ticket δεν είναι σε κατάσταση «Ολοκληρώθηκε».' }
  if (!input.title.trim() || !input.solution.trim()) return { ok: false as const, error: 'Συμπληρώστε τίτλο και λύση.' }

  const helpCategoryId = await resolveHelpCategory({ categoryId: input.helpCategoryId, newName: input.newCategoryName })

  await prisma.knowledgeEntry.create({
    data: {
      helpCategoryId,
      ticketId: ticket.id,
      taskId: ticket.taskId,
      sourceId: ticket.sourceId,
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
  for (const r of await reporterRecipients(ticket.id)) {
    await sendTicketStatusEmail({
      ...r,
      statusLabel: 'Το αίτημα έκλεισε',
      detail: 'Το αίτημά σας ολοκληρώθηκε και αρχειοθετήθηκε. Ευχαριστούμε για την επικοινωνία.',
      resolutionTime: formatDurationGr(ticket.createdAt, ticket.resolvedAt ?? new Date()),
    })
  }

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

/** Αναθέτει μηχανικό: σε υπάρχον task αντικαθιστά τους assignees, αλλιώς convert με τα AI στοιχεία. */
export async function assignTicketEngineer(input: { ticketId: string; userId: string }) {
  const actorId = await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true, status: true, taskId: true, subject: true,
      aiTitle: true, aiDescription: true, aiPriority: true, aiSuggestedProjectId: true,
      source: { select: { defaultProjectId: true } },
    },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (['rejected', 'merged', 'closed'].includes(ticket.status)) {
    return { ok: false as const, error: 'Το ticket δεν είναι ενεργό.' }
  }

  if (ticket.taskId) {
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: ticket.taskId } }),
      prisma.taskAssignee.create({ data: { taskId: ticket.taskId, userId: input.userId } }),
    ])
    await notifyTaskAssignment(ticket.taskId, [input.userId], actorId)
    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'note', actorId, payload: JSON.stringify({ assigned: input.userId }) },
    })
    revalidatePath('/tickets')
    revalidatePath(`/tickets/${ticket.id}`)
    return { ok: true as const }
  }

  const projectId = ticket.aiSuggestedProjectId ?? ticket.source.defaultProjectId
  if (!projectId) return { ok: false as const, error: 'Δεν υπάρχει προτεινόμενο έργο — ανοίξτε το ticket για πλήρη ανάθεση.' }
  return convertTicketToTask({
    ticketId: ticket.id,
    projectId,
    assigneeId: input.userId,
    title: ticket.aiTitle ?? ticket.subject,
    description: ticket.aiDescription ?? '',
    priority: ticket.aiPriority ?? 'medium',
  })
}

/** Bulk μεταβάσεις: reject (new/analyzing/triaged/needs_info) ή close (resolved). Αγνοεί τα μη επιτρεπτά. */
export async function bulkUpdateTicketStatus(input: { ticketIds: string[]; action: 'reject' | 'close' }) {
  const actorId = await requireTriager()
  const allowedFrom: TicketStatus[] = input.action === 'reject' ? ['new', 'analyzing', 'triaged', 'needs_info'] : ['resolved']
  const to: TicketStatus = input.action === 'reject' ? 'rejected' : 'closed'
  const targets = await prisma.ticket.findMany({
    where: { id: { in: input.ticketIds.slice(0, 50) }, status: { in: allowedFrom } },
    select: { id: true },
  })
  for (const t of targets) {
    await prisma.ticket.update({
      where: { id: t.id },
      data: { status: to, events: { create: { type: to === 'rejected' ? 'rejected' : 'closed', actorId } } },
    })
  }
  revalidatePath('/tickets')
  return { ok: true as const, updated: targets.length, skipped: input.ticketIds.length - targets.length }
}

/** Συγχώνευση: τα secondaries γίνονται merged, μηνύματα/αρχεία μεταφέρονται στο primary, reporters ενημερώνονται. */
export async function mergeTickets(input: { primaryId: string; secondaryIds: string[] }) {
  const actorId = await requireTriager()
  const ids = input.secondaryIds.filter((id) => id !== input.primaryId).slice(0, 20)
  if (ids.length === 0) return { ok: false as const, error: 'Επιλέξτε τουλάχιστον δύο tickets.' }

  const primary = await prisma.ticket.findUnique({
    where: { id: input.primaryId },
    select: { id: true, code: true, status: true, sourceId: true },
  })
  if (!primary || ['closed', 'rejected', 'merged'].includes(primary.status)) {
    return { ok: false as const, error: 'Το κύριο ticket δεν είναι ανοιχτό.' }
  }
  const secondaries = await prisma.ticket.findMany({
    where: { id: { in: ids }, sourceId: primary.sourceId, status: { notIn: ['closed', 'rejected', 'merged'] } },
    select: { id: true, code: true, reporterEmail: true, reporterName: true, subject: true, publicToken: true },
  })
  if (secondaries.length === 0) return { ok: false as const, error: 'Κανένα επιλέξιμο ticket για συγχώνευση (ίδια πηγή, ανοιχτό).' }

  for (const s of secondaries) {
    await prisma.$transaction([
      // Flatten merge chains: re-point existing children of the secondary to the
      // new primary so their reporters stay in the fan-out and /t follows the live ticket.
      prisma.ticket.updateMany({ where: { mergedIntoId: s.id }, data: { mergedIntoId: primary.id } }),
      prisma.ticketMessage.updateMany({ where: { ticketId: s.id }, data: { ticketId: primary.id } }),
      prisma.ticketAttachment.updateMany({ where: { ticketId: s.id }, data: { ticketId: primary.id } }),
      prisma.ticket.update({
        where: { id: s.id },
        data: {
          status: 'merged', mergedIntoId: primary.id,
          events: { create: { type: 'merged', actorId, payload: JSON.stringify({ into: primary.code }) } },
        },
      }),
      prisma.ticketEvent.create({
        data: { ticketId: primary.id, type: 'absorbed', actorId, payload: JSON.stringify({ from: s.code }) },
      }),
    ])
    await sendTicketMergedEmail({
      to: s.reporterEmail, reporterName: s.reporterName, code: s.code, subject: s.subject,
      publicToken: s.publicToken, primaryCode: primary.code,
    })
  }

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${primary.id}`)
  return { ok: true as const, merged: secondaries.length }
}

/** Lazy ιστορικό για το expandable row του table. */
export async function getTicketHistory(ticketId: string) {
  await requireTriager()
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      aiTitle: true, aiCategory: true, aiPriority: true, aiConfidence: true,
      events: { orderBy: { createdAt: 'asc' }, select: { id: true, type: true, payload: true, createdAt: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, body: true, createdAt: true } },
      attachments: { select: { id: true, name: true, url: true } },
    },
  })
  if (!ticket) return null
  return ticket
}
