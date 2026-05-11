import { buildExtractionPrompt, type BuildPromptInput } from '../prompt';
import type { MeetingInsights } from '../types';
import { parseInsightsJson } from './shared';

/**
 * DeepSeek adapter — uses the OpenAI-compatible /chat/completions endpoint.
 * Docs: https://api-docs.deepseek.com/
 *
 * Privacy note: DeepSeek hosts in China. The input must already be fully
 * pseudonymized — neither real names nor real emails reach this function.
 */
export async function extractWithDeepSeek(input: BuildPromptInput): Promise<MeetingInsights> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set in environment.');
  }

  const { system, user } = buildExtractionPrompt(input);
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const startedAt = Date.now();

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4096,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepSeek error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const raw = data.choices?.[0]?.message?.content ?? '';
  const parsed = parseInsightsJson(raw);

  return {
    ...parsed,
    meta: {
      provider: 'deepseek',
      model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    },
  };
}
