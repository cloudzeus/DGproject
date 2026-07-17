import { sendEmail } from '@/lib/mailgun'
import { emailLayout, metaTable, quote, appUrl } from '@/lib/email-templates'

// Reporter-facing ticket emails (Greek). All senders swallow errors —
// email failure must never break the ticket pipeline (spec §9).

type TicketEmailInput = {
  to: string
  reporterName?: string | null
  code: string
  subject: string
  publicToken: string
}

function statusUrl(publicToken: string): string {
  return appUrl(`/t/${publicToken}`)
}

async function safeSend(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendEmail({ to, subject, html })
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[tickets] email to ${to} failed:`, error)
    return { ok: false, error }
  }
}

export async function sendTicketReceivedEmail(input: TicketEmailInput) {
  const url = statusUrl(input.publicToken)
  const html = emailLayout({
    recipientName: input.reporterName,
    header: {
      kicker: { text: '🎫 Νέο αίτημα υποστήριξης', tone: 'info' },
      eyebrow: { text: input.code },
      title: input.subject,
    },
    body: `
      <p style="font-size:14px;line-height:1.6;">Λάβαμε το αίτημά σας και η ομάδα μας θα το εξετάσει άμεσα. Θα σας ενημερώνουμε με email για κάθε εξέλιξη.</p>
      ${metaTable([{ label: 'Κωδικός', value: input.code }])}`,
    actions: [{ label: 'Παρακολούθηση αιτήματος', url }],
    footerNote: 'Κρατήστε αυτό το email — περιέχει τον κωδικό και τον σύνδεσμο παρακολούθησης.',
  })
  return safeSend(input.to, `[${input.code}] Λάβαμε το αίτημά σας`, html)
}

export async function sendTicketStatusEmail(
  input: TicketEmailInput & { statusLabel: string; detail?: string }
) {
  const url = statusUrl(input.publicToken)
  const html = emailLayout({
    recipientName: input.reporterName,
    header: {
      kicker: { text: '🔄 Ενημέρωση αιτήματος', tone: 'info' },
      eyebrow: { text: input.code },
      title: input.subject,
    },
    body: `
      <p style="font-size:14px;line-height:1.6;">Η κατάσταση του αιτήματός σας άλλαξε σε: <b>${input.statusLabel}</b>.</p>
      ${input.detail ? quote({ body: input.detail, tone: 'info' }) : ''}`,
    actions: [{ label: 'Προβολή εξέλιξης', url }],
  })
  return safeSend(input.to, `[${input.code}] ${input.statusLabel}`, html)
}

export async function sendTicketResolvedEmail(input: TicketEmailInput) {
  const url = statusUrl(input.publicToken)
  const html = emailLayout({
    recipientName: input.reporterName,
    header: {
      kicker: { text: '✅ Ολοκληρώθηκε', tone: 'success' },
      eyebrow: { text: input.code },
      title: input.subject,
    },
    body: `<p style="font-size:14px;line-height:1.6;">Το αίτημά σας ολοκληρώθηκε. Αν το πρόβλημα επιμένει ή έχετε νέες ερωτήσεις, απαντήστε σε αυτό το email ή υποβάλετε νέο αίτημα.</p>`,
    actions: [{ label: 'Προβολή αιτήματος', url }],
    footerNote: 'Ευχαριστούμε για την επικοινωνία.',
  })
  return safeSend(input.to, `[${input.code}] Το αίτημά σας ολοκληρώθηκε`, html)
}

export async function sendTicketRejectedEmail(
  input: TicketEmailInput & { reason?: string | null }
) {
  const html = emailLayout({
    recipientName: input.reporterName,
    header: {
      kicker: { text: 'ℹ️ Ενημέρωση αιτήματος', tone: 'neutral' },
      eyebrow: { text: input.code },
      title: input.subject,
    },
    body: `
      <p style="font-size:14px;line-height:1.6;">Το αίτημά σας δεν μπορεί να προχωρήσει στην παρούσα μορφή.</p>
      ${input.reason ? quote({ body: input.reason, tone: 'warning', caption: 'Αιτιολογία' }) : ''}
      <p style="font-size:14px;line-height:1.6;">Αν πιστεύετε ότι πρόκειται για λάθος, υποβάλετε νέο αίτημα με περισσότερες λεπτομέρειες.</p>`,
  })
  return safeSend(input.to, `[${input.code}] Ενημέρωση για το αίτημά σας`, html)
}
