import { prisma } from '@/lib/prisma'
import { sendTicketStatusEmail, sendTicketResolvedEmail, reporterRecipients } from '@/lib/tickets/emails'
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
        reporterName: true, publicToken: true, createdAt: true, resolutionSummary: true,
        events: { where: { type: 'task_status' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })
    if (!ticket || (ticket.status !== 'converted' && ticket.status !== 'needs_info')) return

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
        data: { status: 'resolved', resolvedAt, statusBeforeInfo: null },
      })
      const recipients = await reporterRecipients(ticket.id)
      for (const r of recipients) {
        await sendTicketResolvedEmail({
          ...r,
          resolutionTime: formatDurationGr(ticket.createdAt, resolvedAt),
          // Αν ο resolver έχει ήδη καταγράψει λύση (π.χ. από τη σελίδα ticket),
          // στείλ' την με το email ολοκλήρωσης.
          solution: ticket.resolutionSummary,
        })
      }
      void import('@/lib/tickets/kb')
        .then((m) => m.generateKbDraft(ticket.id))
        .catch((e) => console.error('[tickets] kb draft failed:', e))
      return
    }

    // While needs_info the customer is being asked something — skip the
    // intermediate progress emails (they'd be noise mid-clarification).
    const email = STATUS_EMAIL[newStatus]
    if (email && ticket.status === 'converted') {
      const recipients = await reporterRecipients(ticket.id)
      for (const r of recipients) {
        await sendTicketStatusEmail({
          ...r,
          statusLabel: email.label,
          detail: email.detail,
        })
      }
    }
  } catch (e) {
    console.error('[tickets] status propagation failed:', e)
  }
}
