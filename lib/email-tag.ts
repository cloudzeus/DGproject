// Deterministic email tag used to route inbound replies back to the correct
// project (and optionally task) without an LLM lookup.
//
// Format: [FPM:p=<projectCode>;t=<taskId>]
//   - `p=` is the human-readable Project.projectCode (e.g. PRJ-2026-001), so a
//     user can easily paste it into an Outlook subject when starting a thread.
//   - `t=` is the Task.id (cuid) — never typed by a human; only appended when
//     the app itself sends or matches a task-specific reply.
//   - Always present on outbound mail sent via the app, and on the user-typed
//     subject of any new thread started from Outlook.
//   - Inbound mail is matched against it via Graph $search="FPM:p=" plus a
//     conversationId fallback for replies that strip the tag.

const TAG_RE = /\[FPM:p=([A-Za-z0-9_\-]+)(?:;t=([A-Za-z0-9_-]+))?\]/;

export type EmailTag = { projectCode: string; taskId: string | null };

export function buildEmailTag(projectCode: string, taskId?: string | null): string {
  return taskId ? `[FPM:p=${projectCode};t=${taskId}]` : `[FPM:p=${projectCode}]`;
}

export function parseEmailTag(text: string | null | undefined): EmailTag | null {
  if (!text) return null;
  const m = text.match(TAG_RE);
  if (!m) return null;
  return { projectCode: m[1], taskId: m[2] ?? null };
}

// HTML footer the user can leave on outbound mail without it being visually
// distracting. Picking up the tag from the visible body is fine too, but we
// hide it in a small grey footer so customers don't see "[FPM:p=...]" in the
// reply.
export function buildHiddenTagFooter(projectCode: string, taskId?: string | null): string {
  const tag = buildEmailTag(projectCode, taskId);
  return `<div style="color:#bbb;font-size:11px;margin-top:24px">${tag}</div>`;
}
