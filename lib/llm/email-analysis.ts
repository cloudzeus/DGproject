// DeepSeek-backed analysis of a project email. Returns a structured proposed
// action that the user reviews and confirms before any task is touched.
//
// The prompt deliberately limits the model's authority on existing tasks to
// "append a note" rather than full-field edits — safer when an automated
// pipeline misreads the email. New tasks get full fields.

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignees: { name: string }[];
};

type EmailInput = {
  subject: string;
  from: string;
  to: string[];
  receivedAt: string;
  body: string;
};

export type EmailAnalysisResult = {
  action: 'create_task' | 'update_task' | 'attach_only' | 'ignore';
  summary: string;
  // For action=create_task
  newTask?: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueDate: string | null; // ISO date or null
  };
  // For action=update_task
  targetTaskId?: string;
  appendNote?: string;
};

const SYSTEM_PROMPT = `You are an assistant analyzing emails for a project management system.
Your job: given an email and the project's open tasks, return ONE of these actions in strict JSON:

- "create_task": this email describes new work that should become a task. Provide newTask.{title, description, priority, dueDate}.
- "update_task": this email continues / progresses work on one of the existing tasks. Provide targetTaskId + appendNote.
- "attach_only": this is project communication worth keeping (FYI, status update, confirmation) but doesn't need a task change. No extra fields.
- "ignore": the email is irrelevant noise (newsletter, automated bounce). Provide a one-line summary explaining why.

Rules:
- ALWAYS include a "summary" field (one sentence, Greek).
- Be conservative: prefer "attach_only" over "create_task" when in doubt.
- Priority: urgent (blocker / customer-impacting), high (clear deliverable with date), medium (default), low (FYI work).
- dueDate must be ISO 8601 (YYYY-MM-DD) or null. Never guess a date — leave null if no explicit date.
- targetTaskId must be one of the provided task IDs verbatim.
- Output ONLY JSON. No prose, no markdown fences.`;

export async function analyzeProjectEmail(args: {
  email: EmailInput;
  projectName: string;
  openTasks: Task[];
}): Promise<EmailAnalysisResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const taskList = args.openTasks.length === 0
    ? '(no open tasks)'
    : args.openTasks
        .map(
          (t) =>
            `- ${t.id}: "${t.title}" [status=${t.status}, priority=${t.priority}, assignees=${
              t.assignees.map((a) => a.name).join(', ') || 'none'
            }, due=${t.dueDate?.toISOString().slice(0, 10) ?? 'none'}]`,
        )
        .join('\n');

  const userMsg = `PROJECT: ${args.projectName}

OPEN TASKS:
${taskList}

EMAIL:
From: ${args.email.from}
To: ${args.email.to.join(', ')}
Received: ${args.email.receivedAt}
Subject: ${args.email.subject}

Body:
${args.email.body.slice(0, 6000)}

Return strict JSON.`;

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
      max_tokens: 1024,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as EmailAnalysisResult;

  // Defensive: ensure action is one of the allowed values; default to attach_only.
  const validActions = ['create_task', 'update_task', 'attach_only', 'ignore'] as const;
  if (!validActions.includes(parsed.action)) parsed.action = 'attach_only';
  return parsed;
}
