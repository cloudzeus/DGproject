/**
 * Πελάτης του Google Gemini `generateContent` (REST v1beta), με όραση.
 *
 * Προσαρμογή από το damask (src/lib/gemini.ts). Δύο διαφορές:
 *   - Ρύθμιση από περιβάλλον, όχι από τη βάση — έτσι δουλεύουν όλοι οι άλλοι
 *     πάροχοι εδώ (lib/llm/providers/*, lib/proposals/llm.ts).
 *   - Χωρίς καταγραφή κόστους· η εφαρμογή δεν έχει τέτοιο μητρώο.
 *
 * ⚠ ΑΠΟΡΡΗΤΟ: εδώ φεύγουν ΕΙΚΟΝΕΣ σελίδων. Μια εικόνα δεν μασκάρεται — ό,τι
 * είναι τυπωμένο πάνω της (ΑΦΜ, IBAN, ονόματα, τιμές) το βλέπει η Google.
 * Η μάσκα εφαρμόζεται ΜΕΤΑ, στο κείμενο που γυρίζει, πριν πάει στο DeepSeek.
 * Γι' αυτό το OCR είναι ρητή επιλογή του χρήστη, όχι σιωπηλή προεπιλογή.
 */

import { fetchWithRetry } from './fetch-retry'
import { buildModelChain, tryModels } from './model-fallback'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'
const DEFAULT_FALLBACKS = ['gemini-2.5-flash-lite']

export type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } }

export type GeminiResult = {
  text: string
  /** Το μοντέλο που τελικά απάντησε — μπορεί να διαφέρει αν έγινε fallback. */
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/** «a, b , c» → ['a','b','c']. Κενές τιμές πέφτουν. */
export function parseFallbackModels(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function geminiGenerate(opts: {
  parts: GeminiPart[]
  systemInstruction?: string
  model?: string
  fallbackModels?: string[]
  temperature?: number
  maxOutputTokens?: number
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Λείπει το GEMINI_API_KEY — χωρίς αυτό δεν γίνεται OCR σε σαρωμένα αρχεία.')
  }
  if (opts.parts.length === 0) throw new Error('Gemini: δεν δόθηκε περιεχόμενο.')

  const primary = opts.model || process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL
  const fallbacks =
    opts.fallbackModels ??
    (process.env.GEMINI_FALLBACK_MODELS
      ? parseFallbackModels(process.env.GEMINI_FALLBACK_MODELS)
      : DEFAULT_FALLBACKS)

  const chain = buildModelChain(primary, fallbacks)
  const startedAt = Date.now()

  return tryModels(chain, async (model) => {
    try {
      const res = await fetchWithRetry(
        `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            ...(opts.systemInstruction
              ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
              : {}),
            contents: [{ role: 'user', parts: opts.parts }],
            generationConfig: {
              temperature: opts.temperature ?? 0.1,
              ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
            },
          }),
          cache: 'no-store',
        },
        { label: `gemini:${model}` },
      )

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false as const, error: new Error(`Gemini HTTP ${res.status}: ${detail.slice(0, 300)}`) }
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        promptFeedback?: { blockReason?: string }
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      }

      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      if (!text) {
        const blocked = data.promptFeedback?.blockReason
        return {
          ok: false as const,
          error: new Error(blocked ? `Gemini: το περιεχόμενο μπλοκαρίστηκε (${blocked}).` : 'Gemini: κενή απάντηση.'),
        }
      }

      return {
        ok: true as const,
        value: {
          text,
          model,
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          durationMs: Date.now() - startedAt,
        },
      }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err : new Error(String(err)) }
    }
  })
}
