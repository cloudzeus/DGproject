import { pseudonymize, depseudonymize } from './pseudonymize';
import { extractWithDeepSeek } from './providers/deepseek';
import { extractWithAzureOpenAI } from './providers/azure-openai';
import type {
  LlmProvider,
  MeetingInsights,
  ProjectContext,
  TranscriptSegment,
} from './types';

export type { LlmProvider, MeetingInsights, ProjectContext, TranscriptSegment } from './types';

/**
 * Top-level entrypoint for meeting transcript intelligence.
 *
 * Pipeline:
 *   1. Build pseudonym mapping seeded with project members (names → SPEAKER_*, emails → email_N@example.com)
 *   2. Pseudonymize transcript using the same mapping; mask phones/AFMs in transcript text
 *   3. Build prompt that contains ONLY pseudonym tokens — no real names or emails reach the LLM
 *   4. Call the selected provider
 *   5. De-pseudonymize the response (restore real names + emails)
 *
 * Provider selection: env var LLM_PROVIDER ∈ {deepseek, azure-openai}. Defaults to deepseek.
 */
export async function extractMeetingInsights(args: {
  transcriptSegments: TranscriptSegment[];
  projectContext: ProjectContext;
  meetingEndDate: Date;
  /** Override env. Useful for testing both providers from a single endpoint. */
  providerOverride?: LlmProvider;
}): Promise<{
  insights: MeetingInsights;
  pseudonymizedPreview: string;
}> {
  const provider = args.providerOverride ?? selectProvider();

  const { text, mapping, members } = pseudonymize(
    args.transcriptSegments,
    args.projectContext.members,
  );

  const insights = await callProvider(provider, {
    projectName: args.projectContext.projectName,
    projectDescription: args.projectContext.projectDescription ?? null,
    members,
    openTaskTitles: args.projectContext.openTaskTitles,
    pseudonymizedTranscript: text,
    meetingEndDate: args.meetingEndDate,
  });

  // Re-map SPEAKER_* and email_N@example.com tokens to real values everywhere they appear.
  const restored = depseudonymize(insights, mapping);

  return { insights: restored, pseudonymizedPreview: text };
}

function selectProvider(): LlmProvider {
  const v = (process.env.LLM_PROVIDER || 'deepseek').toLowerCase();
  if (v === 'deepseek' || v === 'azure-openai') return v;
  throw new Error(`Unknown LLM_PROVIDER=${v}. Expected: deepseek | azure-openai`);
}

async function callProvider(
  provider: LlmProvider,
  input: Parameters<typeof extractWithDeepSeek>[0],
): Promise<MeetingInsights> {
  switch (provider) {
    case 'deepseek':
      return extractWithDeepSeek(input);
    case 'azure-openai':
      return extractWithAzureOpenAI(input);
    case 'gemini':
      throw new Error('Gemini provider not yet implemented in POC.');
  }
}
