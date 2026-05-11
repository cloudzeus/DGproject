/**
 * Provider-agnostic types for meeting transcript intelligence.
 *
 * Same shape regardless of LLM backend (DeepSeek / Azure OpenAI / Gemini).
 * Adapters in ./providers/ are responsible for prompting and parsing into
 * this canonical shape.
 */

export type LlmProvider = 'deepseek' | 'azure-openai' | 'gemini';

/** Project context passed to the LLM so it can resolve assignees and stay on topic. */
export type ProjectContext = {
  projectName: string;
  projectDescription?: string | null;
  members: Array<{
    /** Real email — used for assignee resolution AFTER de-pseudonymization. */
    email: string;
    /** Display name as it appears in meetings. */
    name: string;
  }>;
  /** Optional list of recent open task titles, helps LLM avoid duplicate suggestions. */
  openTaskTitles?: string[];
};

/** Single transcript line/segment as parsed from VTT. */
export type TranscriptSegment = {
  /** Pseudonymized speaker name when sent to LLM (e.g. "SPEAKER_A"). */
  speaker: string;
  /** Seconds from meeting start. */
  startSec: number;
  endSec: number;
  text: string;
};

export type ActionItem = {
  title: string;
  description: string;
  /** Email of the assignee, resolved against ProjectContext.members. null if unclear. */
  assigneeEmail: string | null;
  /** ISO date (YYYY-MM-DD) or null. Resolved relative to meeting end date. */
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** 0-1 — how confident the model is this was actually agreed. */
  confidence: number;
  /** Verbatim quote from transcript that supports this action item. */
  sourceQuote: string;
  /** Seconds offset where the source quote appears. */
  sourceTimestampSec: number;
};

export type Decision = {
  text: string;
  /** Seconds offset where the decision was made. */
  timestampSec: number;
  /** Emails of people who participated in / agreed to the decision. */
  participantEmails: string[];
};

export type Risk = {
  text: string;
  severity: 'low' | 'medium' | 'high';
  /** Email of the person who should own / mitigate this. null if unclear. */
  ownerEmail: string | null;
};

export type OpenQuestion = {
  question: string;
  /** Email of the person best positioned to answer. */
  askedToEmail: string | null;
  /** Email of who raised it. */
  askedByEmail: string | null;
};

export type MeetingInsights = {
  summary: string;
  decisions: Decision[];
  actionItems: ActionItem[];
  risks: Risk[];
  openQuestions: OpenQuestion[];
  /** Provider-reported token counts and model name, for cost tracking in POC. */
  meta: {
    provider: LlmProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
};

// NOTE: The provider-facing input type is now `BuildPromptInput` from ./prompt.ts.
// It holds only pseudonymized data so no PII reaches the LLM. The previous
// `ExtractInput` shape (with raw `ProjectContext`) was removed to prevent leaks.
