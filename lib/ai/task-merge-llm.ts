import { maskTaskMergePii, normalizeTaskMergeGroups, type TaskMergeGroup } from './task-merge-rules'

export type MergeLlmTask = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  questions: Array<{ question: string; answer: string | null }>
}

type LlmMeta = {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
}

type ChatJsonResult = { value: unknown; meta: LlmMeta }

async function callChatJson(input: {
  system: string
  user: string
  maxTokens: number
}): Promise<ChatJsonResult> {
  const provider = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase()
  const deepseek = provider === 'deepseek'
  if (!deepseek && provider !== 'azure-openai') {
    throw new Error(`Μη υποστηριζόμενος LLM_PROVIDER: ${provider}`)
  }

  const apiKey = deepseek ? process.env.DEEPSEEK_API_KEY : process.env.AZURE_OPENAI_API_KEY
  if (!apiKey) throw new Error(deepseek ? 'Λείπει το DEEPSEEK_API_KEY.' : 'Λείπει το AZURE_OPENAI_API_KEY.')

  const model = deepseek
    ? process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    : process.env.AZURE_OPENAI_DEPLOYMENT || ''
  const endpoint = deepseek
    ? process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
    : `${(process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, '')}/openai/deployments/${model}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview'}`
  if (!deepseek && (!process.env.AZURE_OPENAI_ENDPOINT || !model)) {
    throw new Error('Λείπουν AZURE_OPENAI_ENDPOINT ή AZURE_OPENAI_DEPLOYMENT.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'api-key': apiKey },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: input.maxTokens,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`AI σφάλμα ${response.status}: ${detail.slice(0, 400)}`)
  }
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const raw = data.choices?.[0]?.message?.content ?? ''
  if (!raw) throw new Error('Το AI επέστρεψε κενή απάντηση.')
  let value: unknown
  try {
    value = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    throw new Error('Το AI δεν επέστρεψε έγκυρο JSON.')
  }
  return {
    value,
    meta: {
      provider,
      model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  }
}

function taskPayload(tasks: MergeLlmTask[]): string {
  return tasks.map((task) => {
    const questions = task.questions.slice(0, 12).map((q) => ({
      question: maskTaskMergePii(q.question).slice(0, 700),
      answer: q.answer ? maskTaskMergePii(q.answer).slice(0, 700) : null,
    }))
    return JSON.stringify({
      id: task.id,
      title: maskTaskMergePii(task.title).slice(0, 250),
      description: maskTaskMergePii(task.description ?? '').slice(0, 1800),
      status: task.status,
      priority: task.priority,
      questions,
    })
  }).join('\n')
}

export async function proposeTaskMerges(tasks: MergeLlmTask[]): Promise<{ groups: TaskMergeGroup[]; meta: LlmMeta }> {
  const result = await callChatJson({
    maxTokens: 4096,
    system: `Είσαι προσεκτικός τεχνικός project analyst. Εντοπίζεις μόνο tasks που εκφράζουν την ίδια πραγματική εργασία ή το ίδιο ερώτημα/αίτημα και μπορούν να γίνουν ένα χωρίς απώλεια διαφορετικού deliverable.
Μην συγχωνεύεις tasks μόνο επειδή ανήκουν στην ίδια κατηγορία, μοιάζουν λεκτικά ή αφορούν το ίδιο module. Αν υπάρχει αμφιβολία, μην προτείνεις ομάδα. Λάβε υπόψη τίτλους, περιγραφές, ερωτήματα και απαντήσεις. Πρότεινε έως 4 ομάδες των 2–6 tasks, χωρίς επικάλυψη.
Για κάθε ομάδα επίλεξε ως primaryTaskId το πληρέστερο/κύριο υπάρχον task. Δώσε νέο ενιαίο ελληνικό title, πλήρη ελληνική description που διατηρεί όλες τις ουσιώδεις απαιτήσεις, σαφές rationale και confidence 0..1.
Απάντησε αυστηρά με JSON: {"groups":[{"primaryTaskId":"id","taskIds":["id","id"],"title":"...","description":"...","rationale":"...","confidence":0.0}]}. Αν καμία ομάδα δεν είναι ασφαλής, επέστρεψε {"groups":[]}.`,
    user: `Ανάλυσε τα ακόλουθα tasks του ίδιου project. Χρησιμοποίησε μόνο τα ids που σου δίνονται:\n${taskPayload(tasks)}`,
  })
  return { groups: normalizeTaskMergeGroups(result.value, tasks.map((t) => t.id)), meta: result.meta }
}

export async function explainAcceptedTaskMerge(input: {
  title: string
  description: string
  rationale: string
  tasks: MergeLlmTask[]
}): Promise<{ explanation: string; meta: LlmMeta }> {
  const result = await callChatJson({
    maxTokens: 1800,
    system: `Γράφεις σαφή ελληνική επεξήγηση προς τους συμμετέχοντες μετά από ΕΓΚΕΚΡΙΜΕΝΗ συγχώνευση tasks. Εξήγησε τι ενοποιήθηκε, γιατί, ποιο είναι το ενιαίο αποτέλεσμα και ποια είναι τα πρακτικά επόμενα βήματα. Ανέφερε ότι ερωτήματα, σχόλια, αρχεία, αναθέσεις και καταχωρισμένος χρόνος διατηρούνται στο κύριο task. Μην επινοείς ολοκληρώσεις, ιδιοκτήτες ή ημερομηνίες. Χρησιμοποίησε 3–5 σύντομες παραγράφους με επικεφαλίδες κειμένου, χωρίς Markdown και χωρίς προσωπικά δεδομένα.
Απάντησε αυστηρά με JSON: {"explanation":"..."}.`,
    user: `Νέος τίτλος: ${maskTaskMergePii(input.title)}\nΝέα περιγραφή: ${maskTaskMergePii(input.description)}\nΑιτιολόγηση έγκρισης: ${maskTaskMergePii(input.rationale)}\nΑρχικά tasks:\n${taskPayload(input.tasks)}`,
  })
  const explanation = result.value && typeof result.value === 'object'
    ? (result.value as { explanation?: unknown }).explanation
    : null
  if (typeof explanation !== 'string' || !explanation.trim()) throw new Error('Το AI δεν δημιούργησε επεξήγηση.')
  return { explanation: explanation.trim().slice(0, 16_000), meta: result.meta }
}
