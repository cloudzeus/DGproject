import { prisma } from '@/lib/prisma'
import { sendTicketStatusEmail, sendTicketResolvedEmail } from '@/lib/tickets/emails'
import { formatDurationGr } from '@/lib/tickets/format-duration'

// Reporter-facing labels/details per interesting task status.
const STATUS_EMAIL: Record<string, { label: string; detail: string }> = {
  in_progress: { label: 'Ξεκίνησε η επεξεργασία', detail: 'Η ομάδα μας ξεκίνησε να δουλεύει πάνω στο αίτημά σας.' },
  review: { label: 'Σε έλεγχο ποιότητας', detail: 'Η εργασία ολοκληρώθηκε και βρίσκεται σε τελικό έλεγχο.' },
}

/**
 * Mirror a linked task's status change onto its ticket (spec §4):
 * TicketEvent(task_status) + reporter email; on done → ticket resolved and a
 * KB draft is generated (fire-and-forget). No-ops for tasks without a ticket.
 * Never throws — called from the notification consolidation path.
 */
export async function propagateTicketStatus(taskId: string, newStatus: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { taskId },
      select: {
        id: true, code: true, status: true, subject: true, reporterEmail: true,
        reporterName: true, publicToken: true, createdAt: true,
        events: { where: { type: 'task_status' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!ticket || ticket.status !== 'converted') return

    // Debounce: skip if the latest task_status event already carries this status.
    const last = ticket.events[0]
    if (last?.payload) {
      try {
        if (JSON.parse(last.payload)?.status === newStatus) return
      } catch {}
    }

    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'task_status', payload: JSON.stringify({ status: newStatus }) },
    })

    if (newStatus === 'done') {
      const resolvedAt = new Date()
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'resolved', resolvedAt },
      })
      await sendTicketResolvedEmail({
        to: ticket.reporterEmail,
        reporterName: ticket.reporterName,
        code: ticket.code,
        subject: ticket.subject,
        publicToken: ticket.publicToken,
        resolutionTime: formatDurationGr(ticket.createdAt, resolvedAt),
      })
      void import('@/lib/tickets/kb')
        .then((m) => m.generateKbDraft(ticket.id))
        .catch((e) => console.error('[tickets] kb draft failed:', e))
      return
    }

    const email = STATUS_EMAIL[newStatus]
    if (email) {
      await sendTicketStatusEmail({
        to: ticket.reporterEmail,
        reporterName: ticket.reporterName,
        code: ticket.code,
        subject: ticket.subject,
        publicToken: ticket.publicToken,
        statusLabel: email.label,
        detail: email.detail,
      })
    }
  } catch (e) {
    console.error('[tickets] status propagation failed:', e)
  }
}
