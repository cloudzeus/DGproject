import { prisma } from '@/lib/prisma'
import { createNotifications } from '@/lib/notifications'
import { getUserLoads } from '@/lib/task-scheduling'
import { findSimilarTasks, findKnowledgeEntries } from '@/lib/tickets/similar'

/**
 * DeepSeek-powered ticket triage (spec §4):
 * rewrites the ticket technically (Greek), classifies it, and suggests a
 * project + assignee based on active projects, similar tasks, the knowledge
 * base and current user load.
 *
 * GDPR: the reporter's email/name are NEVER sent to the LLM, and emails/
 * phone-like strings inside the body are masked (DeepSeek hosts in China —
 * same policy as lib/llm/providers/deepseek.ts).
 *
 * Never throws — on failure the ticket lands in `triaged` with aiError set,
 * so admins can always triage manually. Notifications go out either way.
 */
export async function analyzeTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { source: { select: { name: true, defaultProjectId: true } } },
  })
  if (!ticket) return
  if (!['new', 'analyzing', 'triaged'].includes(ticket.status)) return

  await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'analyzing' } })

  try {
    const suggestion = await runLlmTriage(ticket)
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'triaged',
        aiTitle: suggestion.title,
        aiDescription: suggestion.description,
        aiCategory: suggestion.category,
        aiPriority: suggestion.priority,
        aiSuggestedProjectId: suggestion.projectId,
        aiSuggestedAssigneeId: suggestion.assigneeId,
        aiReasoning: suggestion.reasoning,
        aiConfidence: suggestion.confidence,
        aiError: null,
        events: { create: { type: 'analyzed', payload: JSON.stringify({ confidence: suggestion.confidence }) } },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[tickets] triage failed for ${ticket.code}:`, message)
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'triaged',
        aiError: message.slice(0, 2000),
        events: { create: { type: 'analyzed', payload: JSON.stringify({ error: message.slice(0, 500) }) } },
      },
    })
  }

  await notifyTriagers(ticketId)
}

async function notifyTriagers(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { code: true, subject: true } })
  if (!ticket) return
  const triagers = await prisma.user.findMany({
    where: { role: { in: ['admin', 'manager'] }, userType: 'employee' },
    select: { id: true },
  })
  await createNotifications(
    triagers.map((u) => ({
      userId: u.id,
      type: 'ticket' as const,
      title: `Νέο ticket ${ticket.code}`,
      message: `«${ticket.subject}» — έτοιμο για αξιολόγηση και ανάθεση.`,
      link: `/tickets/${ticketId}`,
    }))
  )
}

// ─── LLM call ─────────────────────────────────────────────────────────

type TriageSuggestion = {
  title: string
  description: string
  category: 'bug' | 'feature' | 'support' | 'question' | 'billing' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  projectId: string | null
  assigneeId: string | null
  reasoning: string
  confidence: number
}

const CATEGORIES = ['bug', 'feature', 'support', 'question', 'billing', 'other'] as const
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

/** Mask emails and phone-like sequences so no reporter PII reaches the LLM. */
function maskPii(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\d\s\-()]{8,}\d)/g, '[τηλέφωνο]')
}

const SYSTEM_PROMPT = `Είσαι ο τεχνικός αναλυτής του helpdesk της DGsmart, ελληνικής εταιρείας custom λογισμικού.
Δραστηριότητες της DGsmart: ανάπτυξη custom εφαρμογών (Next.js/React, Prisma/MySQL), διασυνδέσεις με το ERP SoftOne (Soft1 Web Services, oncloud.gr), ηλεκτρονικά καταστήματα WooCommerce, εργαλεία συμμόρφωσης GDPR, συστήματα project management, ενσωματώσεις Microsoft 365 (Outlook, Teams, SharePoint).

Θα λάβεις ένα ticket υποστήριξης από πελάτη, μαζί με: τα ενεργά έργα, παρόμοια παλαιότερα tasks, σχετικές εγγραφές από τη γνωσιακή βάση, και τον τρέχοντα φόρτο των μελών της ομάδας.

Καθήκοντά σου:
1. Ξαναγράψε το αίτημα ΤΕΧΝΙΚΑ στα Ελληνικά: σαφής τίτλος (title) και τεχνική περιγραφή (description) με πιθανή αιτία, βήματα αναπαραγωγής αν προκύπτουν, και προτεινόμενη κατεύθυνση διερεύνησης.
2. Κατηγοριοποίησε: category ∈ bug|feature|support|question|billing|other, priority ∈ low|medium|high|urgent.
3. Πρότεινε το καταλληλότερο έργο (suggestedProjectCode από τη λίστα, αλλιώς null) — προτίμησε το προεπιλεγμένο έργο της πηγής αν ταιριάζει.
4. Πρότεινε χρέωση (suggestedAssigneeId από τη λίστα, αλλιώς null): προτίμησε όποιον έχει δουλέψει σε παρόμοια tasks ΚΑΙ έχει τον μικρότερο φόρτο.
5. Εξήγησε σύντομα το σκεπτικό (reasoning) και δώσε confidence 0..1.

Απάντησε ΑΥΣΤΗΡΑ με JSON:
{"title": string, "description": string, "category": string, "priority": string, "suggestedProjectCode": string|null, "suggestedAssigneeId": string|null, "reasoning": string, "confidence": number}`

async function runLlmTriage(ticket: {
  id: string
  subject: string
  body: string
  originUrl: string
  source: { name: string; defaultProjectId: string | null }
}): Promise<TriageSuggestion> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set')

  // Context: projects, similar tasks, KB, user load
  const [projects, employees] = await Promise.all([
    prisma.project.findMany({
      where: { status: { in: ['planning', 'active'] } },
      select: { id: true, projectCode: true, name: true, description: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    }),
    prisma.user.findMany({
      where: { userType: 'employee', role: { in: ['admin', 'manager', 'member'] } },
      select: { id: true, name: true },
    }),
  ])
  const searchText = `${ticket.subject}\n${ticket.body}`
  const [similarTasks, kbEntries, loads] = await Promise.all([
    findSimilarTasks(searchText),
    findKnowledgeEntries(searchText),
    getUserLoads(employees.map((e) => e.id)),
  ])
  const loadByUser = new Map(loads.map((l) => [l.userId, l]))
  const defaultProject = projects.find((p) => p.id === ticket.source.defaultProjectId)

  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : 'άμεσα')
  const userMsg = `TICKET (πηγή: ${ticket.source.name}, σελίδα: ${maskPii(ticket.originUrl)}):
Θέμα: ${maskPii(ticket.subject)}
Κείμενο:
${maskPii(ticket.body).slice(0, 4000)}

ΠΡΟΕΠΙΛΕΓΜΕΝΟ ΕΡΓΟ ΠΗΓΗΣ: ${defaultProject ? `${defaultProject.projectCode ?? defaultProject.id} — ${defaultProject.name}` : '(κανένα)'}

ΕΝΕΡΓΑ ΕΡΓΑ:
${projects.map((p) => `- ${p.projectCode ?? p.id}: ${p.name}${p.description ? ` — ${p.description.slice(0, 120)}` : ''}`).join('\n') || '(κανένα)'}

ΠΑΡΟΜΟΙΑ TASKS:
${similarTasks.map((t) => `- [${t.projectName}] "${t.title}" (status=${t.status}, assignees=${t.assignees.map((a) => `${a.name ?? '?'}#${a.userId}`).join(', ') || 'κανείς'})`).join('\n') || '(κανένα)'}

ΓΝΩΣΙΑΚΗ ΒΑΣΗ:
${kbEntries.map((k) => `- ${k.title}: ${k.problem.slice(0, 150)} → ${k.solution.slice(0, 150)}`).join('\n') || '(κενή)'}

ΟΜΑΔΑ (id, όνομα, ανοιχτά tasks, ώρες επόμενου 5ημέρου, πρώτο ελεύθερο slot):
${employees.map((e) => {
  const l = loadByUser.get(e.id)
  return `- ${e.id}: ${e.name ?? '(χωρίς όνομα)'} — ${l?.openTasks ?? 0} ανοιχτά, ${l?.busyHoursNext5Days ?? 0}h, ελεύθερος ${fmtDate(l?.nextFreeSlot ?? null)}`
}).join('\n')}

Απάντησε με το JSON.`

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2048,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`DeepSeek error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>

  // Validate + resolve
  const category = CATEGORIES.includes(parsed.category as never) ? (parsed.category as TriageSuggestion['category']) : 'other'
  const priority = PRIORITIES.includes(parsed.priority as never) ? (parsed.priority as TriageSuggestion['priority']) : 'medium'
  const projectCode = typeof parsed.suggestedProjectCode === 'string' ? parsed.suggestedProjectCode : null
  const project = projectCode ? projects.find((p) => p.projectCode === projectCode || p.id === projectCode) : undefined
  const assigneeIdRaw = typeof parsed.suggestedAssigneeId === 'string' ? parsed.suggestedAssigneeId : null
  const assignee = assigneeIdRaw ? employees.find((e) => e.id === assigneeIdRaw) : undefined
  const confidence = typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5

  return {
    title: String(parsed.title ?? ticket.subject).slice(0, 200),
    description: String(parsed.description ?? ticket.body).slice(0, 8000),
    category,
    priority,
    projectId: project?.id ?? ticket.source.defaultProjectId ?? null,
    assigneeId: assignee?.id ?? null,
    reasoning: String(parsed.reasoning ?? '').slice(0, 4000),
    confidence,
  }
}
