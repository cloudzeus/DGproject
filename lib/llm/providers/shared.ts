import type { MeetingInsights } from '../types';

/**
 * Hand-rolled validator for the LLM's JSON response. We don't use Zod here to
 * avoid adding a new dependency for the POC; replace with Zod when promoting
 * past spike stage.
 */
export function parseInsightsJson(raw: string): Omit<MeetingInsights, 'meta'> {
  let cleaned = raw.trim();

  // Some providers wrap in ```json ... ``` fences despite instructions.
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `LLM did not return valid JSON. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  if (!isObject(json)) {
    throw new Error('LLM JSON root is not an object.');
  }

  const summary = typeof json.summary === 'string' ? json.summary : '';

  const decisions = ensureArray(json.decisions).map((d) => {
    const o = isObject(d) ? d : {};
    return {
      text: str(o.text),
      timestampSec: num(o.timestampSec),
      participantEmails: ensureArray(o.participantEmails).map(str).filter(Boolean),
    };
  });

  const actionItems = ensureArray(json.actionItems).map((a) => {
    const o = isObject(a) ? a : {};
    return {
      title: str(o.title),
      description: str(o.description),
      assigneeEmail: nullableStr(o.assigneeEmail),
      dueDate: nullableStr(o.dueDate),
      priority: priority(o.priority),
      confidence: clamp01(num(o.confidence)),
      sourceQuote: str(o.sourceQuote),
      sourceTimestampSec: num(o.sourceTimestampSec),
    };
  });

  const risks = ensureArray(json.risks).map((r) => {
    const o = isObject(r) ? r : {};
    return {
      text: str(o.text),
      severity: severity(o.severity),
      ownerEmail: nullableStr(o.ownerEmail),
    };
  });

  const openQuestions = ensureArray(json.openQuestions).map((q) => {
    const o = isObject(q) ? q : {};
    return {
      question: str(o.question),
      askedToEmail: nullableStr(o.askedToEmail),
      askedByEmail: nullableStr(o.askedByEmail),
    };
  });

  return { summary, decisions, actionItems, risks, openQuestions };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function ensureArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function nullableStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  return typeof v === 'string' ? v : null;
}
function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function priority(v: unknown): 'low' | 'medium' | 'high' | 'urgent' {
  const s = String(v).toLowerCase();
  if (s === 'urgent' || s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}
function severity(v: unknown): 'low' | 'medium' | 'high' {
  const s = String(v).toLowerCase();
  if (s === 'low' || s === 'medium' || s === 'high') return s;
  return 'medium';
}
