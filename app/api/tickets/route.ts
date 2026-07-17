import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTicketSource, isOriginAllowed, checkRateLimit } from '@/lib/tickets/source-auth'
import { nextTicketCode } from '@/lib/tickets/codes'
import { sendTicketReceivedEmail } from '@/lib/tickets/emails'
import { appUrl } from '@/lib/email-templates'
import { sniffImage } from '@/lib/tickets/image-sniff'
import { uploadFileToCDN } from '@/lib/bunnycdn'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Ticket-Project, X-Ticket-Key',
    Vary: 'Origin',
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers })

  const auth = await verifyTicketSource(
    req.headers.get('x-ticket-project'),
    req.headers.get('x-ticket-key'),
    origin
  )
  if (!auth.ok) return json({ error: auth.error }, auth.status)
  const source = auth.source

  const contentType = req.headers.get('content-type') ?? ''
  let body: Record<string, unknown>
  let files: File[] = []
  if (contentType.includes('multipart/form-data')) {
    let fd: FormData
    try { fd = await req.formData() } catch { return json({ error: 'invalid_form' }, 422) }
    // Strict coercion: a File in a text field must not become "[object File]"
    const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '')
    body = {
      subject: text(fd.get('subject')), body: text(fd.get('body')),
      reporterEmail: text(fd.get('reporterEmail')), reporterName: text(fd.get('reporterName')),
      originUrl: text(fd.get('originUrl')),
    }
    files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  } else {
    try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 422) }
  }

  const subject = String(body.subject ?? '').trim()
  const text = String(body.body ?? '').trim()
  const reporterEmail = String(body.reporterEmail ?? '').trim().toLowerCase()
  const reporterName = body.reporterName ? String(body.reporterName).trim().slice(0, 120) : null
  const originUrl = String(body.originUrl ?? '').trim().slice(0, 2000)

  if (!subject || subject.length > 200) return json({ error: 'invalid_subject' }, 422)
  if (!text || text.length > 5000) return json({ error: 'invalid_body' }, 422)
  if (!EMAIL_RE.test(reporterEmail)) return json({ error: 'invalid_email' }, 422)

  // Cheap file checks (File.size only — no buffering) before rate limits
  const MAX_FILES = 3, MAX_FILE_BYTES = 5 * 1024 * 1024, MAX_TOTAL_BYTES = 15 * 1024 * 1024
  if (files.length > MAX_FILES) return json({ error: 'too_many_files' }, 422)
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) return json({ error: 'files_too_large' }, 413)
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return json({ error: 'file_too_large' }, 413)
  }

  // Rate limits: per source and per reporter email (spec §5)
  if (!checkRateLimit(`src:${source.id}`, 60, 3_600_000)) return json({ error: 'rate_limited' }, 429)
  if (!checkRateLimit(`email:${reporterEmail}`, 10, 3_600_000)) return json({ error: 'rate_limited' }, 429)

  // Buffer + magic-byte sniff only after rate limits — rate-limited callers
  // must not be able to make the server buffer up to 15MB per request.
  const checked: { buffer: Buffer; name: string; mime: string; ext: string; size: number }[] = []
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer())
    const sniff = sniffImage(buffer)
    if (!sniff) return json({ error: 'invalid_file_type' }, 422)
    checked.push({ buffer, name: f.name.replace(/[^\w.\-]+/g, '_').slice(0, 120), mime: sniff.mime, ext: sniff.ext, size: f.size })
  }

  // Dedup: same source+email+subject within 10 minutes returns the existing ticket
  const existing = await prisma.ticket.findFirst({
    where: {
      sourceId: source.id,
      reporterEmail,
      subject,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { code: true, publicToken: true },
  })
  if (existing) {
    return json(
      { code: existing.code, publicToken: existing.publicToken, statusUrl: appUrl(`/t/${existing.publicToken}`), duplicate: true },
      200
    )
  }

  // Create with retry — nextTicketCode can race on the unique code
  let ticket: { id: string; code: string; publicToken: string } | null = null
  for (let attempt = 0; attempt < 3 && !ticket; attempt++) {
    try {
      const code = await nextTicketCode()
      ticket = await prisma.ticket.create({
        data: {
          code,
          sourceId: source.id,
          reporterEmail,
          reporterName,
          originUrl,
          subject,
          body: text,
          events: { create: { type: 'created', payload: JSON.stringify({ origin: originUrl }) } },
        },
        select: { id: true, code: true, publicToken: true },
      })
    } catch (err: unknown) {
      const isUniqueViolation = typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
      if (!isUniqueViolation || attempt === 2) throw err
    }
  }
  if (!ticket) return json({ error: 'internal' }, 500)

  // Best-effort attachment uploads — a failed upload never fails the submission.
  let attachmentCount = 0
  for (const f of checked) {
    try {
      const uploaded = await uploadFileToCDN({
        file: f.buffer,
        filename: `${randomUUID()}.${f.ext}`,
        folder: `tickets/${ticket.code}`,
        contentType: f.mime,
      })
      await prisma.ticketAttachment.create({
        data: { ticketId: ticket.id, name: f.name, size: f.size, mimeType: f.mime, url: uploaded.url },
      })
      attachmentCount++
    } catch (err) {
      console.error('[tickets] attachment upload failed:', err)
      await prisma.ticketEvent.create({
        data: { ticketId: ticket.id, type: 'note', payload: JSON.stringify({ upload_failed: f.name }) },
      }).catch(() => {})
    }
  }

  // Fire-and-forget: confirmation email + LLM triage. Neither blocks the response.
  void sendTicketReceivedEmail({
    to: reporterEmail,
    reporterName,
    code: ticket.code,
    subject,
    publicToken: ticket.publicToken,
  })
  void import('@/lib/tickets/triage')
    .then((m) => m.analyzeTicket(ticket!.id))
    .catch((err) => console.error('[tickets] analyze kick failed:', err))

  return json(
    { code: ticket.code, publicToken: ticket.publicToken, statusUrl: appUrl(`/t/${ticket.publicToken}`), attachments: attachmentCount },
    201
  )
}
