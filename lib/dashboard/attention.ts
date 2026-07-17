import { prisma } from '@/lib/prisma'
import type { AttentionItem, DashScope } from './types'

const HOUR = 3_600_000

function ageH(from: Date, now: Date): number {
  return Math.max(0, Math.round(((now.getTime() - from.getTime()) / HOUR) * 10) / 10)
}

export async function buildAttention(scope: DashScope): Promise<AttentionItem[]> {
  const now = scope.now ?? new Date()
  const { userId, isPrivileged } = scope
  const items: AttentionItem[] = []

  const [newTickets, needsInfo, reviewTasks, unresolved, kbTickets, questions, meetingReview] = await Promise.all([
    isPrivileged
      ? prisma.ticket.findMany({
          where: { status: { in: ['new', 'analyzing'] } },
          select: { id: true, code: true, subject: true, createdAt: true },
          orderBy: { createdAt: 'asc' }, take: 10,
        })
      : Promise.resolve([]),
    isPrivileged
      ? prisma.ticket.findMany({
          where: { status: 'needs_info' },
          select: {
            id: true, code: true, subject: true,
            // Δεν υπάρχει authorType στο TicketMessage — μόνο direction ('inbound'/'outbound').
            // 'inbound' = πελάτης → ομάδα, άρα ισοδυναμεί με "τελευταία απάντηση από τον πελάτη".
            messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true, createdAt: true } },
          },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: {
        status: 'review',
        project: { approverId: { not: null }, OR: [{ approverId: userId }, { ownerId: userId }] },
      },
      select: { id: true, title: true, updatedAt: true, project: { select: { name: true } } },
      orderBy: { updatedAt: 'asc' }, take: 10,
    }),
    prisma.ticket.findMany({
      where: {
        resolutionSummary: null,
        status: { in: ['converted', 'resolved'] },
        task: {
          status: 'done',
          ...(isPrivileged ? {} : { assignees: { some: { userId } } }),
        },
      },
      select: { id: true, code: true, subject: true, taskId: true, task: { select: { completedAt: true } } },
      take: 10,
    }),
    isPrivileged
      ? prisma.ticket.findMany({
          where: { status: { in: ['resolved', 'closed'] }, events: { some: { type: 'kb_draft' } } },
          select: { id: true, code: true, subject: true, resolvedAt: true },
          orderBy: { resolvedAt: 'desc' }, take: 10,
        })
      : Promise.resolve([]),
    prisma.taskQuestion.findMany({
      where: { askedToId: userId, answeredAt: null },
      select: { id: true, question: true, createdAt: true, taskId: true, task: { select: { title: true } } },
      orderBy: { createdAt: 'asc' }, take: 10,
    }),
    isPrivileged
      ? prisma.task.findMany({
          where: { meetingNeedsReview: true, status: { not: 'done' } },
          select: { id: true, title: true, createdAt: true, project: { select: { name: true } } },
          take: 10,
        })
      : Promise.resolve([]),
  ])

  for (const t of newTickets) {
    items.push({
      kind: 'ticket_new', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'Νέο ticket χωρίς triage', href: `/tickets/${t.id}`,
      ageHours: ageH(t.createdAt, now), action: 'open', taskId: null,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  for (const t of needsInfo) {
    const last = t.messages[0]
    // Μόνο όταν η τελευταία κουβέντα είναι του πελάτη (μας περιμένει).
    if (!last || last.direction !== 'inbound') continue
    items.push({
      kind: 'ticket_reply', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'Ο πελάτης απάντησε — περιμένει', href: `/tickets/${t.id}`,
      ageHours: ageH(last.createdAt, now), action: 'open', taskId: null,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  for (const t of reviewTasks) {
    items.push({
      kind: 'approval', id: t.id, title: t.title,
      subtitle: `${t.project.name} · περιμένει έγκριση`, href: `/board?task=${t.id}`,
      ageHours: ageH(t.updatedAt, now), action: 'approve', taskId: t.id, ticket: null,
    })
  }
  for (const t of unresolved) {
    items.push({
      kind: 'missing_resolution', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'Ολοκληρώθηκε χωρίς καταγεγραμμένη λύση', href: `/tickets/${t.id}`,
      ageHours: t.task?.completedAt ? ageH(t.task.completedAt, now) : 0,
      action: 'write_resolution', taskId: t.taskId,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  const kbApproved = new Set(
    (await prisma.knowledgeEntry.findMany({
      where: { ticketId: { in: kbTickets.map((t) => t.id) } }, select: { ticketId: true },
    })).map((e) => e.ticketId),
  )
  for (const t of kbTickets.filter((t) => !kbApproved.has(t.id))) {
    items.push({
      kind: 'kb_draft', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'KB draft προς έγκριση', href: `/tickets/${t.id}`,
      ageHours: t.resolvedAt ? ageH(t.resolvedAt, now) : 0, action: 'open', taskId: null,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  for (const q of questions) {
    items.push({
      kind: 'question', id: q.id, title: q.task.title,
      subtitle: `Ερώτηση: ${q.question.slice(0, 80)}`, href: `/board?task=${q.taskId}`,
      ageHours: ageH(q.createdAt, now), action: 'open', taskId: q.taskId, ticket: null,
    })
  }
  for (const t of meetingReview) {
    items.push({
      kind: 'meeting_review', id: t.id, title: t.title,
      subtitle: `${t.project.name} · AI task από meeting — θέλει έλεγχο`, href: `/board?task=${t.id}`,
      ageHours: ageH(t.createdAt, now), action: 'open', taskId: t.id, ticket: null,
    })
  }

  // Πιο «γερασμένα» πρώτα, με ελαφρύ boost στα tickets.
  const weight = (i: AttentionItem) =>
    i.ageHours + (i.kind === 'ticket_new' || i.kind === 'ticket_reply' ? 6 : 0)
  return items.sort((a, b) => weight(b) - weight(a)).slice(0, 15)
}
