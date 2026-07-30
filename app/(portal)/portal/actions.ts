'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPortalScope, type PortalScope } from '@/lib/portal/scope'
import { taskVisibilityFilter } from '@/lib/tasks/visibility'
import { nextTicketCode } from '@/lib/tickets/codes'
import { sendTicketReceivedEmail } from '@/lib/tickets/emails'
import { checkRateLimit } from '@/lib/tickets/source-auth'

/**
 * Κάθε write του portal ξεκινά από εδώ. Χωρίς scope, καμία εγγραφή — και το
 * scope είναι ΤΟ σημείο ελέγχου πρόσβασης, όχι το id που στέλνει ο client.
 */
async function requirePortal(): Promise<{
  userId: string
  email: string
  name: string | null
  scope: PortalScope
}> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Απαιτείται σύνδεση.')
  const scope = await getPortalScope(session.user.id)
  if (!scope) throw new Error('Ο λογαριασμός δεν έχει συνδεθεί με εταιρία.')
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    scope,
  }
}

export async function createPortalTicket(input: { subject: string; body: string }) {
  // Το scope δεν χρειάζεται εδώ — αρκεί ότι το requirePortal πέτυχε.
  const { email, name } = await requirePortal()

  const subject = input.subject.trim().slice(0, 200)
  const body = input.body.trim().slice(0, 5000)
  if (subject.length < 3) return { ok: false as const, error: 'Το θέμα είναι πολύ σύντομο.' }
  if (body.length < 10) return { ok: false as const, error: 'Η περιγραφή είναι πολύ σύντομη.' }

  if (!checkRateLimit(`portal:${email}`, 10, 3_600_000)) {
    return { ok: false as const, error: 'Πολλά αιτήματα σε σύντομο διάστημα. Δοκιμάστε αργότερα.' }
  }

  const source = await prisma.ticketSource.findUnique({ where: { code: 'PORTAL' } })
  if (!source?.active) {
    return { ok: false as const, error: 'Η υποβολή αιτημάτων είναι προσωρινά ανενεργή.' }
  }

  // Ίδιος έλεγχος διπλότυπων με το /api/tickets: ίδιο θέμα, ίδιος αποστολέας, 10'.
  const duplicate = await prisma.ticket.findFirst({
    where: {
      reporterEmail: email,
      subject,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
  })
  if (duplicate) return { ok: true as const, id: duplicate.id, duplicate: true }

  // Retry: το nextTicketCode μπορεί να συγκρουστεί στο unique code.
  let ticket: { id: string; code: string; publicToken: string } | null = null
  for (let attempt = 0; attempt < 3 && !ticket; attempt++) {
    try {
      ticket = await prisma.ticket.create({
        data: {
          code: await nextTicketCode(),
          sourceId: source.id,
          // ΠΟΤΕ από τη φόρμα — μόνο από το session. Δεν υπάρχει πεδίο να πλαστογραφηθεί.
          reporterEmail: email,
          reporterName: name,
          originUrl: 'portal',
          subject,
          body,
          events: { create: { type: 'created', payload: JSON.stringify({ origin: 'portal' }) } },
        },
        select: { id: true, code: true, publicToken: true },
      })
    } catch (err: unknown) {
      const isUnique =
        typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
      if (!isUnique || attempt === 2) throw err
    }
  }
  if (!ticket) return { ok: false as const, error: 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' }

  // Fire-and-forget, όπως το /api/tickets: κανένα από τα δύο δεν μπλοκάρει την απάντηση.
  void sendTicketReceivedEmail({
    to: email,
    reporterName: name,
    code: ticket.code,
    subject,
    publicToken: ticket.publicToken,
  })
  void import('@/lib/tickets/triage')
    .then((m) => m.analyzeTicket(ticket!.id))
    .catch((err) => console.error('[portal] analyze kick failed:', err))

  revalidatePath('/portal/tickets')
  revalidatePath('/portal')
  return { ok: true as const, id: ticket.id }
}

export async function replyToPortalTicket(ticketId: string, body: string) {
  const { scope } = await requirePortal()
  const text = body.trim().slice(0, 3000)
  if (!text) return { ok: false as const, error: 'Το μήνυμα είναι κενό.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, statusBeforeInfo: true, reporterEmail: true },
  })
  // Ο έλεγχος πρόσβασης είναι το scope, όχι το id που έφτασε από τον client.
  if (!ticket || !scope.emails.includes(ticket.reporterEmail.trim().toLowerCase())) {
    return { ok: false as const, error: 'Δεν βρέθηκε το αίτημα.' }
  }
  if (['closed', 'rejected', 'merged'].includes(ticket.status)) {
    return { ok: false as const, error: 'Το αίτημα έχει κλείσει.' }
  }
  if (!checkRateLimit(`portal-reply:${ticket.id}`, 10, 3_600_000)) {
    return { ok: false as const, error: 'Πολλές απαντήσεις σε σύντομο διάστημα.' }
  }

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, direction: 'inbound', body: text },
    }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        // Ίδια συμπεριφορά με το /api/tickets/[code]/reply: απάντηση σε
        // needs_info ξεμπλοκάρει το ticket στην προηγούμενη κατάστασή του.
        ...(ticket.status === 'needs_info'
          ? { status: ticket.statusBeforeInfo ?? 'converted', statusBeforeInfo: null }
          : {}),
        events: { create: { type: 'reporter_replied' } },
      },
    }),
  ])

  revalidatePath(`/portal/tickets/${ticket.id}`)
  revalidatePath('/portal')
  return { ok: true as const }
}

export async function addPortalComment(taskId: string, content: string) {
  const { userId, scope } = await requirePortal()
  const text = content.trim().slice(0, 5000)
  if (!text) return { ok: false as const, error: 'Το σχόλιο είναι κενό.' }

  // Η εργασία πρέπει να είναι ΚΑΙ ορατή ΚΑΙ σε έργο του scope. Χωρίς τον πρώτο
  // έλεγχο, ένα id εσωτερικής εργασίας θα δεχόταν σχόλιο που ο πελάτης δεν
  // μπορεί καν να δει.
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...taskVisibilityFilter('customer') },
    select: { projectId: true },
  })
  if (!task || !scope.projectIds.includes(task.projectId)) {
    return { ok: false as const, error: 'Δεν βρέθηκε η εργασία.' }
  }

  await prisma.comment.create({
    data: {
      taskId,
      authorId: userId,
      content: text,
      // Ο πελάτης δεν μπορεί να γράψει κρυφό σχόλιο.
      visibility: 'shared',
    },
  })

  revalidatePath(`/portal/projects/${task.projectId}`)
  return { ok: true as const }
}

export async function answerPortalQuestion(questionId: string, answer: string) {
  const { userId, scope } = await requirePortal()
  const text = answer.trim().slice(0, 5000)
  if (!text) return { ok: false as const, error: 'Η απάντηση είναι κενή.' }

  const question = await prisma.taskQuestion.findFirst({
    where: { id: questionId, task: taskVisibilityFilter('customer') },
    select: { id: true, askedToId: true, answer: true, task: { select: { projectId: true } } },
  })
  // Διπλός έλεγχος: η ερώτηση απευθύνεται σε ΕΜΕΝΑ ΚΑΙ το έργο είναι στο scope.
  // Το πρώτο αρκεί λογικά, αλλά το δεύτερο κρατά τον κανόνα ίδιο με τα υπόλοιπα
  // write paths — αν κάποτε αλλάξει το μοντέλο ερωτήσεων, δεν ξεχνιέται.
  if (
    !question ||
    question.askedToId !== userId ||
    !scope.projectIds.includes(question.task.projectId)
  ) {
    return { ok: false as const, error: 'Δεν βρέθηκε η ερώτηση.' }
  }
  if (question.answer) return { ok: false as const, error: 'Η ερώτηση έχει ήδη απαντηθεί.' }

  await prisma.taskQuestion.update({
    where: { id: questionId },
    data: { answer: text, answeredAt: new Date() },
  })

  revalidatePath(`/portal/projects/${question.task.projectId}`)
  revalidatePath('/portal')
  return { ok: true as const }
}

/**
 * Επαφές της ΔΙΚΗΣ ΤΟΥ εταιρίας, διαχειριζόμενες από τον πελάτη.
 *
 * Ο πελάτης ξέρει καλύτερα από εμάς ποιος στην εταιρία του χειρίζεται τι, οπότε
 * τις συντηρεί ο ίδιος. Το `companyId` έρχεται ΠΑΝΤΑ από το scope, ποτέ από τον
 * client — αλλιώς ένα αυθαίρετο id θα του επέτρεπε να γράψει επαφές σε ξένη
 * εταιρία.
 *
 * Δεν μπορεί να δώσει πρόσβαση στο portal: το `userId` της επαφής μένει
 * αποκλειστικά στους διαχειριστές μας.
 */
export type PortalContactInput = {
  name: string
  position?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  isPrimary?: boolean
}

const trim = (v: string | null | undefined) => (v ?? '').trim().slice(0, 200) || null

export async function addPortalContact(input: PortalContactInput) {
  const { scope } = await requirePortal()
  const name = input.name.trim()
  if (name.length < 2) return { ok: false as const, error: 'Το όνομα είναι πολύ σύντομο.' }

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { companyId: scope.companyId }, data: { isPrimary: false } })
    }
    await tx.contact.create({
      data: {
        companyId: scope.companyId,
        name,
        position: trim(input.position),
        email: trim(input.email)?.toLowerCase() ?? null,
        phone: trim(input.phone),
        mobile: trim(input.mobile),
        isPrimary: Boolean(input.isPrimary),
      },
    })
  })

  revalidatePath('/portal/contacts')
  return { ok: true as const }
}

export async function updatePortalContact(contactId: string, input: PortalContactInput) {
  const { scope } = await requirePortal()
  const name = input.name.trim()
  if (name.length < 2) return { ok: false as const, error: 'Το όνομα είναι πολύ σύντομο.' }

  // Η επαφή πρέπει να ανήκει στη ΔΙΚΗ ΤΟΥ εταιρία — ο έλεγχος είναι το scope.
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: scope.companyId },
    select: { id: true },
  })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({
        where: { companyId: scope.companyId, id: { not: contactId } },
        data: { isPrimary: false },
      })
    }
    await tx.contact.update({
      where: { id: contactId },
      data: {
        name,
        position: trim(input.position),
        email: trim(input.email)?.toLowerCase() ?? null,
        phone: trim(input.phone),
        mobile: trim(input.mobile),
        isPrimary: Boolean(input.isPrimary),
      },
    })
  })

  revalidatePath('/portal/contacts')
  return { ok: true as const }
}

export async function deletePortalContact(contactId: string) {
  const { scope } = await requirePortal()
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: scope.companyId },
    select: { id: true, userId: true },
  })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  // Επαφή με λογαριασμό portal δεν διαγράφεται από εδώ — θα άφηνε χρήστη χωρίς
  // εγγραφή επαφής και είναι απόφαση των διαχειριστών μας.
  if (contact.userId) {
    return { ok: false as const, error: 'Η επαφή έχει λογαριασμό. Επικοινωνήστε μαζί μας για αφαίρεση.' }
  }

  await prisma.contact.delete({ where: { id: contactId } })
  revalidatePath('/portal/contacts')
  return { ok: true as const }
}
