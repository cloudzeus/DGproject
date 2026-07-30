/**
 * Κλήση JSON προς το DeepSeek για την ανάλυση πρότασης.
 *
 * Ξεχωριστό από το lib/llm/providers/deepseek.ts επίτηδες: εκείνο είναι
 * δεμένο με τη δομή των πρακτικών συσκέψεων (MeetingInsights) και δεν έχει
 * νόημα να γενικευτεί για χάρη ενός δεύτερου καλούντος. Μοιράζονται τις ίδιες
 * μεταβλητές περιβάλλοντος και την ίδια πολιτική απορρήτου.
 *
 * Η είσοδος πρέπει να είναι ΗΔΗ μασκαρισμένη — ό,τι φτάνει εδώ φεύγει Κίνα.
 */

export type JsonChatResult = {
  raw: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export async function callProposalLlm(args: {
  system: string
  user: string
  maxTokens?: number
  signal?: AbortSignal
}): Promise<JsonChatResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  if (!apiKey) throw new Error('Λείπει το DEEPSEEK_API_KEY από το περιβάλλον.')

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  const startedAt = Date.now()

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: args.maxTokens ?? 8192,
    }),
    cache: 'no-store',
    signal: args.signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`DeepSeek σφάλμα ${res.status}: ${body.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  return {
    raw: data.choices?.[0]?.message?.content ?? '',
    provider: 'deepseek',
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - startedAt,
  }
}
