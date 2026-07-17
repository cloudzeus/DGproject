import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getUserLoads } from '@/lib/task-scheduling'
import { TICKET_STATUS_LABEL } from '@/lib/tickets/status-labels'
import { TicketDetailClient } from './ticket-detail-client'

export const dynamic = 'force-dynamic'

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user?.id || (role !== 'admin' && role !== 'manager')) redirect('/dashboard')

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      source: { select: { name: true, defaultProjectId: true } },
      events: { orderBy: { createdAt: 'asc' } },
      attachments: true,
      messages: { orderBy: { createdAt: 'asc' } },
      task: { select: { id: true, title: true, status: true, projectId: true, project: { select: { name: true } } } },
    },
  })
  if (!ticket) notFound()

  const [projects, employees] = await Promise.all([
    prisma.project.findMany({
      where: { status: { in: ['planning', 'active'] } },
      select: { id: true, name: true, projectCode: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { userType: 'employee', role: { in: ['admin', 'manager', 'member'] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const loads = await getUserLoads(employees.map((e) => e.id))
  const loadMap = new Map(loads.map((l) => [l.userId, l]))
  const fmtSlot = new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const users = employees.map((e) => {
    const l = loadMap.get(e.id)
    return {
      id: e.id,
      name: e.name ?? e.email,
      hint: l
        ? `${l.openTasks} ανοιχτά · ${l.busyHoursNext5Days}h/5ημ · ${l.nextFreeSlot ? `ελεύθερος ${fmtSlot.format(l.nextFreeSlot)}` : 'πλήρης'}`
        : '',
    }
  })

  const events = ticket.events.map((e) => {
    let payload: Record<string, unknown> | null = null
    try {
      payload = e.payload ? JSON.parse(e.payload) : null
    } catch {}
    return { id: e.id, type: e.type, payload, createdAt: e.createdAt.toISOString() }
  })

  const kbDraftEvent = [...ticket.events].reverse().find((e) => e.type === 'kb_draft')
  let kbDraft: {
    title: string
    problem: string
    solution: string
    tags: string[]
    categoryId?: string | null
    newCategoryName?: string | null
  } | null = null
  if (kbDraftEvent?.payload && ticket.status === 'resolved') {
    try {
      kbDraft = JSON.parse(kbDraftEvent.payload)
    } catch {}
  }
  const kbSaved = await prisma.knowledgeEntry.findUnique({ where: { ticketId: ticket.id }, select: { id: true, title: true } })
  const helpCategories = await prisma.helpCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/tickets" className="text-sm text-fluent-blue-600 hover:underline">← Όλα τα tickets</Link>
      <TicketDetailClient
        ticket={{
          id: ticket.id,
          code: ticket.code,
          status: ticket.status,
          statusLabel: TICKET_STATUS_LABEL[ticket.status],
          subject: ticket.subject,
          body: ticket.body,
          reporterEmail: ticket.reporterEmail,
          reporterName: ticket.reporterName,
          originUrl: ticket.originUrl,
          sourceName: ticket.source.name,
          createdAt: ticket.createdAt.toISOString(),
          aiTitle: ticket.aiTitle,
          aiDescription: ticket.aiDescription,
          aiCategory: ticket.aiCategory,
          aiPriority: ticket.aiPriority,
          aiSuggestedProjectId: ticket.aiSuggestedProjectId ?? ticket.source.defaultProjectId,
          aiSuggestedAssigneeId: ticket.aiSuggestedAssigneeId,
          aiReasoning: ticket.aiReasoning,
          aiConfidence: ticket.aiConfidence,
          aiError: ticket.aiError,
          resolutionSummary: ticket.resolutionSummary,
          task: ticket.task
            ? { id: ticket.task.id, title: ticket.task.title, status: ticket.task.status, projectId: ticket.task.projectId, projectName: ticket.task.project.name }
            : null,
        }}
        attachments={ticket.attachments.map((a) => ({ id: a.id, name: a.name, url: a.url, mimeType: a.mimeType }))}
        messages={ticket.messages.map((m) => ({ id: m.id, direction: m.direction, body: m.body, createdAt: m.createdAt.toISOString() }))}
        projects={projects}
        users={users}
        events={events}
        kbDraft={kbDraft}
        kbSaved={kbSaved ? { id: kbSaved.id, title: kbSaved.title } : null}
        helpCategories={helpCategories}
      />
    </div>
  )
}
