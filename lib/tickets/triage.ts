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
Θα λάβεις ticket, το project προέλευσής του, το δηλωμένο τεχνολογικό stack, προηγούμενα tasks του ίδιου project, ενεργά projects, παρόμοια tasks, γνωσιακή βάση και φόρτο ομάδας.

Καθήκοντά σου:
1. Ξαναγράψε το αίτημα ΤΕΧΝΙΚΑ στα Ελληνικά με σαφή title και description.
2. Η description ΠΡΕΠΕΙ να ξεκινά με «Έργο προέλευσης: ΚΩΔΙΚΑΣ — ΟΝΟΜΑ» όταν δίνεται project προέλευσης. Αν δεν δίνεται, γράψε «Έργο προέλευσης: μη τεκμηριωμένο».
3. Χρησιμοποίησε το stack και τα προηγούμενα tasks ΜΟΝΟ του project προέλευσης ως τεκμηρίωση. Μην υποθέτεις WooCommerce, WordPress, Soft1/SoftOne, Next.js, PHP, SMTP plugin ή οποιαδήποτε άλλη τεχνολογία επειδή αναφέρεται σε γενικό context ή σε άλλο project. Τεχνολογία που δεν τεκμηριώνεται από ticket, stack ή προηγούμενα tasks χαρακτηρίζεται ρητά «μη τεκμηριωμένη υπόθεση» και δεν παρουσιάζεται ως γεγονός.
4. Διάκρινε τα ΑΝΕΞΑΡΤΗΤΑ ζητήματα του ticket. Χρησιμοποίησε ξεχωριστές ενότητες «Ζήτημα 1 — …», «Ζήτημα 2 — …» κ.ο.κ. Για κάθε ζήτημα γράψε ξεχωριστά: σύμπτωμα, πιθανές αιτίες ως υποθέσεις, βήματα αναπαραγωγής και προτεινόμενους ελέγχους/κατεύθυνση. Π.χ. μη συνεχής αρίθμηση παραγγελιών και διπλό confirmation email είναι ΔΥΟ ανεξάρτητα ζητήματα με δικούς τους ελέγχους, όχι μία κοινή αιτία. Μην τα ενοποιείς ούτε υποθέτεις ότι το ένα προκαλεί το άλλο.
5. Κατηγοριοποίησε: category ∈ bug|feature|support|question|billing|other, priority ∈ low|medium|high|urgent.
6. Πρότεινε project με suggestedProjectCode από τα ΕΝΕΡΓΑ ΕΡΓΑ, αλλιώς null. Προτίμησε το project προέλευσης αν ταιριάζει.
7. Πρότεινε suggestedAssigneeId από την ΟΜΑΔΑ, αλλιώς null, με βάση σχετική εμπειρία και μικρότερο φόρτο.
8. Δώσε σύντομο reasoning και confidence 0..1. Χαμήλωσε το confidence όταν λείπει project, stack ή τεχνική τεκμηρίωση.

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

  const projectContextSelect = {
    id: true,
    projectCode: true,
    name: true,
    description: true,
    technologyStack: true,
  } as const

  const [projects, employees, sourceProject] = await Promise.all([
    prisma.project.findMany({
      where: { status: { in: ['planning', 'active'] } },
      select: projectContextSelect,
      orderBy: { updatedAt: 'desc' },
      take: 40,
    }),
    prisma.user.findMany({
      where: { userType: 'employee', role: { in: ['admin', 'manager', 'member'] } },
      select: { id: true, name: true },
    }),
    ticket.source.defaultProjectId
      ? prisma.project.findUnique({ where: { id: ticket.source.defaultProjectId }, select: projectContextSelect })
      : Promise.resolve(null),
  ])
  const searchText = `${ticket.subject}\n${ticket.body}`
  const [similarTasks, kbEntries, loads, previousProjectTasks] = await Promise.all([
    findSimilarTasks(searchText),
    findKnowledgeEntries(searchText),
    getUserLoads(employees.map((e) => e.id)),
    ticket.source.defaultProjectId
      ? prisma.task.findMany({
          where: { projectId: ticket.source.defaultProjectId, mergedIntoId: null },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            tags: { select: { name: true }, take: 12 },
          },
          orderBy: { updatedAt: 'desc' },
          take: 25,
        })
      : Promise.resolve([]),
  ])
  const loadByUser = new Map(loads.map((l) => [l.userId, l]))
  const sourceProjectText = sourceProject
    ? `${sourceProject.projectCode ?? sourceProject.id} — ${maskPii(sourceProject.name)}
Περιγραφή: ${sourceProject.description ? maskPii(sourceProject.description).slice(0, 1200) : 'μη τεκμηριωμένη'}
Δηλωμένο stack: ${sourceProject.technologyStack ? maskPii(sourceProject.technologyStack).slice(0, 2500) : 'μη τεκμηριωμένο'}`
    : 'Δεν έχει οριστεί project προέλευσης — project και stack είναι μη τεκμηριωμένα.'

  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : 'άμεσα')
  const userMsg = `TICKET (πηγή: ${maskPii(ticket.source.name)}, σελίδα: ${maskPii(ticket.originUrl)}):
Θέμα: ${maskPii(ticket.subject)}
Κείμενο:
${maskPii(ticket.body).slice(0, 4000)}

PROJECT ΠΡΟΕΛΕΥΣΗΣ TICKET:
${sourceProjectText}

ΠΡΟΗΓΟΥΜΕΝΑ TASKS ΤΟΥ ΙΔΙΟΥ PROJECT:
${previousProjectTasks.map((t) => `- "${maskPii(t.title)}" (status=${t.status}, tags=${t.tags.map((tag) => maskPii(tag.name)).join(', ') || 'κανένα'})\n  ${t.description ? maskPii(t.description).slice(0, 800) : 'Χωρίς περιγραφή'}`).join('\n') || '(κανένα καταχωρισμένο προηγούμενο task)'}

ΕΝΕΡΓΑ ΕΡΓΑ:
${projects.map((p) => `- ${p.projectCode ?? p.id}: ${maskPii(p.name)}${p.description ? ` — ${maskPii(p.description).slice(0, 120)}` : ''}${p.technologyStack ? ` — stack: ${maskPii(p.technologyStack).slice(0, 250)}` : ''}`).join('\n') || '(κανένα)'}

ΠΑΡΟΜΟΙΑ TASKS ΑΠΟ ΟΛΑ ΤΑ PROJECT (όχι τεκμηρίωση stack για το project προέλευσης):
${similarTasks.map((t) => `- [${maskPii(t.projectName)}] "${maskPii(t.title)}" (status=${t.status}, assignees=${t.assignees.map((a) => `${a.name ?? '?'}#${a.userId}`).join(', ') || 'κανείς'})`).join('\n') || '(κανένα)'}

ΓΝΩΣΙΑΚΗ ΒΑΣΗ:
${kbEntries.map((k) => `- ${maskPii(k.title)}: ${maskPii(k.problem).slice(0, 150)} → ${maskPii(k.solution).slice(0, 150)}`).join('\n') || '(κενή)'}

ΟΜΑΔΑ (id, όνομα, ανοιχτά tasks, ώρες επόμενου 5ημέρου, πρώτο ελεύθερο slot):
${employees.map((e) => {
  const l = loadByUser.get(e.id)
  return `- ${e.id}: ${e.name ?? '(χωρίς όνομα)'} — ${l?.openTasks ?? 0} ανοιχτά, ${l?.busyHoursNext5Days ?? 0}h, ελεύθερος ${fmtDate(l?.nextFreeSlot ?? null)}`
}).join('\n')}

Απάντησε με το JSON. Τήρησε υποχρεωτικά την αναφορά στο project προέλευσης και τον διαχωρισμό ανεξάρτητων ζητημάτων.`

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
  const rawDescription = String(parsed.description ?? ticket.body).trim()
  const sourceLabel = sourceProject
    ? `${sourceProject.projectCode ?? sourceProject.id} — ${sourceProject.name}`
    : 'μη τεκμηριωμένο'
  const description = rawDescription.includes('Έργο προέλευσης:')
    ? rawDescription
    : `Έργο προέλευσης: ${sourceLabel}\n\n${rawDescription}`

  return {
    title: String(parsed.title ?? ticket.subject).slice(0, 200),
    description: description.slice(0, 8000),
    category,
    priority,
    projectId: project?.id ?? ticket.source.defaultProjectId ?? null,
    assigneeId: assignee?.id ?? null,
    reasoning: String(parsed.reasoning ?? '').slice(0, 4000),
    confidence,
  }
}
