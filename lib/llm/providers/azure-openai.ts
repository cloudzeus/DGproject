import { buildExtractionPrompt, type BuildPromptInput } from '../prompt';
import type { MeetingInsights } from '../types';
import { parseInsightsJson } from './shared';

/**
 * Azure OpenAI Service adapter — drop-in replacement for DeepSeek when GDPR
 * residency or enterprise compliance demands EU-hosted processing.
 *
 * Required env:
 *   AZURE_OPENAI_ENDPOINT     e.g. https://my-resource.openai.azure.com
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_DEPLOYMENT   the deployment name (e.g. "gpt-4o-mini")
 *   AZURE_OPENAI_API_VERSION  defaults to "2024-08-01-preview"
 */
export async function extractWithAzureOpenAI(input: BuildPromptInput): Promise<MeetingInsights> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      'Azure OpenAI not configured: set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT.',
    );
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const { system, user } = buildExtractionPrompt(input);
  const startedAt = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
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
    throw new Error(`Azure OpenAI error ${res.status}: ${body}`);
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
      provider: 'azure-openai',
      model: deployment,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    },
  };
}
