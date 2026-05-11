import { prisma } from './prisma';
import { parseVtt } from './microsoft-graph';
import { extractMeetingInsights, type MeetingInsights } from './llm';
import type { ActionItem } from './llm/types';
import type { Task, TaskPriority } from '@prisma/client';

/**
 * Meeting processing pipeline — orchestrates the full flow:
 *
 *   1. Persist initial MeetingNote (status: processing)
 *   2. Parse VTT, run pseudonymized LLM extraction
 *   3. Update MeetingNote with insights + status: ready
 *   4. Auto-create tasks based on confidence tiers:
 *        confidence ≥ 0.85  → Task status="todo", auto-assigned, no review flag
 *        0.6 ≤ conf < 0.85 → Task status="backlog", needsReview=true, owner = meeting organizer
 *        confidence < 0.6  → ignored (left only on MeetingNote.actionItems for human inspection)
 *
 * Caller is responsible for providing the VTT (either pulled from Graph or
 * pasted manually). This module knows nothing about Graph itself.
 */

const HIGH_CONFIDENCE = 0.85;
const MIN_CONFIDENCE = 0.6;

export type ProcessMeetingInput = {
  projectId: string;
  organizerId: string;
  subject: string;
  startedAt: Date;
  endedAt: Date;
  vtt: string;
  teamsMeetingId?: string | null;
  teamsJoinUrl?: string | null;
  teamsTranscriptId?: string | null;
};

export type ProcessMeetingResult = {
  meetingNoteId: string;
  insights: MeetingInsights;
  createdTaskIds: string[];
  reviewTaskIds: string[];
  skippedLowConfidenceCount: number;
};

export async function processMeeting(input: ProcessMeetingInput): Promise<ProcessMeetingResult> {
  // 1. Load project context (members + open task titles for duplicate avoidance)
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      members: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      tasks: {
        where: { status: { in: ['todo', 'in_progress', 'review', 'backlog'] } },
        select: { title: true },
        take: 50,
      },
    },
  });
  if (!project) throw new Error(`Project ${input.projectId} not found`);

  const members = uniqByEmail([
    { email: project.owner.email, name: project.owner.name ?? project.owner.email, id: project.owner.id },
    ...project.members.map((m) => ({
      email: m.user.email,
      name: m.user.name ?? m.user.email,
      id: m.user.id,
    })),
  ]);

  const segments = parseVtt(input.vtt);
  if (!segments.length) {
    throw new Error('VTT parsed to zero segments. Cannot extract insights.');
  }

  const durationSec = Math.round(segments[segments.length - 1].endSec);

  // 2. Create MeetingNote in processing state
  const meetingNote = await prisma.meetingNote.create({
    data: {
      projectId: input.projectId,
      organizerId: input.organizerId,
      teamsMeetingId: input.teamsMeetingId ?? null,
      teamsJoinUrl: input.teamsJoinUrl ?? null,
      teamsTranscriptId: input.teamsTranscriptId ?? null,
      subject: input.subject,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationSec,
      transcriptVtt: input.vtt,
      status: 'processing',
    },
  });

  try {
    // 3. Run LLM extraction
    const { insights } = await extractMeetingInsights({
      transcriptSegments: segments,
      projectContext: {
        projectName: project.name,
        projectDescription: project.description,
        members: members.map((m) => ({ email: m.email, name: m.name })),
        openTaskTitles: project.tasks.map((t) => t.title),
      },
      meetingEndDate: input.endedAt,
    });

    // 4. Decide which action items become tasks (by confidence tier)
    const memberByEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
    const createdTaskIds: string[] = [];
    const reviewTaskIds: string[] = [];
    let skipped = 0;

    for (const action of insights.actionItems) {
      const tier = classifyConfidence(action.confidence);
      if (tier === 'skip') {
        skipped += 1;
        continue;
      }

      const task = await createTaskFromAction({
        action,
        tier,
        projectId: input.projectId,
        organizerId: input.organizerId,
        meetingNoteId: meetingNote.id,
        memberByEmail,
      });

      if (tier === 'auto') createdTaskIds.push(task.id);
      else reviewTaskIds.push(task.id);
    }

    // Open questions → TaskQuestion rows on the most-recently-created auto-task,
    // OR as standalone notification when there's no matching task. For POC we
    // only log them on the MeetingNote (they're stored in insights.openQuestions).

    // 5. Finalize MeetingNote
    await prisma.meetingNote.update({
      where: { id: meetingNote.id },
      data: {
        summary: insights.summary,
        decisions: insights.decisions as unknown as object,
        actionItems: insights.actionItems as unknown as object,
        risks: insights.risks as unknown as object,
        openQuestions: insights.openQuestions as unknown as object,
        llmProvider: insights.meta.provider,
        llmModel: insights.meta.model,
        llmInputTokens: insights.meta.inputTokens,
        llmOutputTokens: insights.meta.outputTokens,
        llmDurationMs: insights.meta.durationMs,
        autoTasksCreated: createdTaskIds.length,
        autoTasksNeedReview: reviewTaskIds.length,
        status: 'ready',
        processedAt: new Date(),
      },
    });

    return {
      meetingNoteId: meetingNote.id,
      insights,
      createdTaskIds,
      reviewTaskIds,
      skippedLowConfidenceCount: skipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.meetingNote.update({
      where: { id: meetingNote.id },
      data: { status: 'failed', errorMessage: message },
    });
    throw err;
  }
}

type ConfidenceTier = 'auto' | 'review' | 'skip';

function classifyConfidence(c: number): ConfidenceTier {
  if (c >= HIGH_CONFIDENCE) return 'auto';
  if (c >= MIN_CONFIDENCE) return 'review';
  return 'skip';
}

async function createTaskFromAction(args: {
  action: ActionItem;
  tier: 'auto' | 'review';
  projectId: string;
  organizerId: string;
  meetingNoteId: string;
  memberByEmail: Map<string, { id: string; email: string; name: string }>;
}): Promise<Task> {
  const { action, tier, projectId, organizerId, meetingNoteId, memberByEmail } = args;

  const assignee = action.assigneeEmail
    ? memberByEmail.get(action.assigneeEmail.toLowerCase())
    : null;

  // Auto tier with assignee → todo. Review tier OR no assignee → backlog (organizer triages).
  const status = tier === 'auto' && assignee ? 'todo' : 'backlog';
  const dueDate = action.dueDate ? safeDate(action.dueDate) : null;
  const priority = normalizePriority(action.priority);

  const task = await prisma.task.create({
    data: {
      projectId,
      title: action.title.slice(0, 255),
      description: action.description,
      status,
      priority,
      dueDate,
      createdById: organizerId,
      generatedFromMeetingId: meetingNoteId,
      meetingSourceConfidence: action.confidence,
      meetingSourceQuote: action.sourceQuote,
      meetingNeedsReview: tier === 'review',
      assignees: assignee
        ? {
            create: [{ userId: assignee.id }],
          }
        : undefined,
    },
  });

  return task;
}

function normalizePriority(p: ActionItem['priority']): TaskPriority {
  if (p === 'low' || p === 'medium' || p === 'high' || p === 'urgent') return p;
  return 'medium';
}

function safeDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function uniqByEmail<T extends { email: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.email.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
