import { prisma } from './prisma';
import { parseVtt } from './microsoft-graph';
import { extractMeetingInsights, type MeetingInsights } from './llm';
import type { ActionItem } from './llm/types';
import type { Task, TaskPriority } from '@prisma/client';

/**
 * Meeting processing pipeline — extraction only, no task creation.
 *
 *   1. Persist initial MeetingNote (status: processing)
 *   2. Parse VTT, run pseudonymized LLM extraction
 *   3. Update MeetingNote with insights + status: ready
 *
 * Tasks are NOT auto-created. The admin reviews the extracted action items
 * on the meeting detail page and creates each task explicitly in the project
 * of their choice (via /api/meetings/[id]/create-task).
 *
 * Rationale: a single Teams meeting often covers multiple projects, and the
 * primary project picked at processing time is only one of them. Forcing
 * tasks into that project meant the admin had to clean up duplicates and move
 * tasks afterwards — which was strictly more work than just creating them
 * directly in the right project.
 *
 * Caller is responsible for providing the VTT (either pulled from Graph or
 * pasted manually). This module knows nothing about Graph itself.
 */

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

    // 4. Persist insights. Tasks are NOT auto-created — the admin picks per-item
    // project assignments on the meeting detail page.
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
        autoTasksCreated: 0,
        autoTasksNeedReview: 0,
        status: 'ready',
        processedAt: new Date(),
      },
    });

    return {
      meetingNoteId: meetingNote.id,
      insights,
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
