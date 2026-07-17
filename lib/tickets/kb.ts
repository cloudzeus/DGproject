import { prisma } from '@/lib/prisma'
import { maskPII } from '@/lib/tickets/mask'

/**
 * When a ticket's task completes, ask DeepSeek to draft a KnowledgeEntry
 * (problem/solution/tags) from the ticket + task + comments. The draft is
 * stored as a TicketEvent(kb_draft) — NOT as a KnowledgeEntry — until an
 * admin reviews and approves it via saveKnowledgeEntry (spec §4).
 *
 * PII: reporter identity is never sent; emails/phones in free text are masked.
 */
export async function generateKbDraft(ticketId: string): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  if (!apiKey) return

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subject: true,
      body: true,
      aiDescription: true,
      task: {
        select: {
          title: true,
          description: true,
          comments: { select: { content: true }, orderBy: { createdAt: 'asc' }, take: 20 },
        },
      },
    },
  })
  if (!ticket) return

  const userMsg = `ΑΡΧΙΚΟ ΑΙΤΗΜΑ ΠΕΛΑΤΗ:
${maskPII(ticket.subject)}
${maskPII(ticket.body).slice(0, 2000)}

ΤΕΧΝΙΚΗ ΑΝΑΛΥΣΗ:
${maskPII(ticket.aiDescription ?? '—').slice(0, 2000)}

ΕΡΓΑΣΙΑ ΠΟΥ ΟΛΟΚΛΗΡΩΘΗΚΕ:
${ticket.task ? `${ticket.task.title}\n${maskPII(ticket.task.description ?? '')}` : '—'}

ΣΧΟΛΙΑ ΟΜΑΔΑΣ ΚΑΤΑ ΤΗΝ ΕΠΙΛΥΣΗ:
${ticket.task?.comments.map((c) => `- ${maskPII(c.content).slice(0, 300)}`).join('\n') || '(κανένα)'}

Γράψε εγγραφή γνωσιακής βάσης στα Ελληνικά. JSON: {"title": string, "problem": string, "solution": string, "tags": string[]}`

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            'Είσαι τεχνικός συντάκτης γνωσιακής βάσης εταιρείας λογισμικού. Συμπυκνώνεις λυμένα tickets σε επαναχρησιμοποιήσιμη γνώση: σαφές πρόβλημα, ουσιαστική λύση, 3-8 λέξεις-κλειδιά. Απαντάς ΜΟΝΟ με JSON.',
        },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1024,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`DeepSeek KB draft error ${res.status}`)
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>

  const draft = {
    title: String(parsed.title ?? ticket.subject).slice(0, 190),
    problem: String(parsed.problem ?? '').slice(0, 4000),
    solution: String(parsed.solution ?? '').slice(0, 4000),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 10) : [],
  }

  await prisma.ticketEvent.create({
    data: { ticketId: ticket.id, type: 'kb_draft', payload: JSON.stringify(draft) },
  })
}
