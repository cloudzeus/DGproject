// app/(app)/tickets/resolution-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/tickets/source-auth'
import { maskPII } from '@/lib/tickets/mask'

// Resolution capture is open to every authenticated team member — the person
// completing the task is usually NOT a triager (spec §1).
async function requireUser(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.userType === 'customer') {
    throw new Error('Απαιτείται σύνδεση μέλους ομάδας.')
  }
  return session.user.id
}

/**
 * Rewrite the resolver's free-text solution clearly in Greek via DeepSeek.
 * Keeps all technical facts, invents nothing, masks PII. Rate-limited per user.
 * The caller keeps the original text — a failure here never loses user input.
 */
export async function polishSolution(input: { ticketId: string; text: string }) {
  const userId = await requireUser()
  const text = maskPII(input.text.trim()).slice(0, 4000)
  if (text.length < 10) {
    return { ok: false as const, error: 'Γράψτε πρώτα μια σύντομη περιγραφή της λύσης.' }
  }
  if (!checkRateLimit(`polish:${userId}`, 20, 3_600_000)) {
    return { ok: false as const, error: 'Πολλές κλήσεις AI αυτή την ώρα — δοκιμάστε αργότερα.' }
  }
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  if (!apiKey) return { ok: false as const, error: 'Η βελτίωση με AI δεν είναι διαθέσιμη.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { subject: true, aiDescription: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'Είσαι τεχνικός συντάκτης. Ξαναγράφεις περιγραφές λύσεων σε καθαρά, δομημένα Ελληνικά για γνωσιακή βάση. Κρατάς ΟΛΑ τα τεχνικά στοιχεία (ονόματα αρχείων, ρυθμίσεις, βήματα), δεν προσθέτεις βήματα που δεν αναφέρονται, δεν εφευρίσκεις αιτίες. Απαντάς ΜΟΝΟ με το βελτιωμένο κείμενο, χωρίς εισαγωγή ή σχόλια.',
          },
          {
            role: 'user',
            content: `ΘΕΜΑ TICKET: ${maskPII(ticket.subject)}\nΤΕΧΝΙΚΗ ΑΝΑΛΥΣΗ: ${maskPII(ticket.aiDescription ?? '—').slice(0, 1500)}\n\nΚΕΙΜΕΝΟ ΛΥΣΗΣ ΠΡΟΣ ΒΕΛΤΙΩΣΗ:\n${text}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`)
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    const polished = (data.choices?.[0]?.message?.content ?? '').trim().slice(0, 4000)
    if (!polished) throw new Error('empty completion')
    return { ok: true as const, text: polished }
  } catch (err) {
    console.error('[tickets] polishSolution failed:', err)
    return { ok: false as const, error: 'Η βελτίωση απέτυχε — το κείμενό σας δεν χάθηκε.' }
  }
}

/**
 * Persist the resolver's solution on the ticket and (re)generate the KB draft
 * from it, unless an approved KnowledgeEntry already exists (spec §2).
 */
export async function saveResolution(input: { ticketId: string; text: string }) {
  const userId = await requireUser()
  const text = input.text.trim().slice(0, 4000)
  if (!text) return { ok: false as const, error: 'Γράψτε τη λύση πριν την αποθήκευση.' }

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  })
  if (!ticket) return { ok: false as const, error: 'Το ticket δεν βρέθηκε.' }
  if (ticket.status !== 'converted' && ticket.status !== 'resolved') {
    return { ok: false as const, error: 'Η λύση καταγράφεται μόνο σε tickets με εργασία σε εξέλιξη ή ολοκληρωμένη.' }
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      resolutionSummary: text,
      events: { create: { type: 'resolution_written', actorId: userId } },
    },
  })

  const approved = await prisma.knowledgeEntry.findUnique({ where: { ticketId: ticket.id }, select: { id: true } })
  if (!approved && ticket.status === 'resolved') {
    void import('@/lib/tickets/kb')
      .then((m) => m.generateKbDraft(ticket.id))
      .catch((e) => console.error('[tickets] kb draft regen failed:', e))
  }

  // Ενημέρωση πελάτη με τη λύση (μόνο όταν το ticket έχει ήδη επιλυθεί —
  // αλλιώς η λύση θα σταλεί με το email ολοκλήρωσης του propagate).
  if (ticket.status === 'resolved') {
    try {
      const { sendTicketResolvedEmail, reporterRecipients } = await import('@/lib/tickets/emails')
      for (const r of await reporterRecipients(ticket.id)) {
        await sendTicketResolvedEmail({ ...r, solution: text })
      }
      await prisma.ticketEvent.create({
        data: { ticketId: ticket.id, type: 'emailed', actorId: userId, payload: JSON.stringify({ kind: 'solution' }) },
      })
    } catch (e) {
      console.error('[tickets] solution email failed:', e)
    }
  }

  revalidatePath(`/tickets/${input.ticketId}`)
  return { ok: true as const }
}

/**
 * Called by task UIs right after a task is marked done: should we prompt
 * this user for a solution? Returns ticket info only when a linked ticket
 * exists and has no solution yet.
 */
export async function getResolutionPromptInfo(taskId: string) {
  await requireUser()
  const ticket = await prisma.ticket.findUnique({
    where: { taskId },
    select: {
      id: true, code: true, subject: true, status: true, resolutionSummary: true,
      task: { select: { status: true } },
    },
  })
  if (!ticket || ticket.resolutionSummary) return null
  if (ticket.status !== 'converted' && ticket.status !== 'resolved') return null
  // Prompt μόνο όταν το task έχει πράγματι ολοκληρωθεί — οι callers (edit modal
  // close, drag σε done) δεν ξέρουν πάντα το τρέχον status.
  if (ticket.task?.status !== 'done') return null
  return { ticketId: ticket.id, code: ticket.code, subject: ticket.subject }
}
