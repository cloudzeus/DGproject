import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { ActionItem } from '@/lib/llm/types';

/**
 * POST /api/meetings/:id/create-task
 *
 * Create a Task in a chosen project from one of a meeting's extracted action
 * items. Powers the "add tasks to additional projects" flow on the meeting
 * detail page — a single Teams meeting often spans multiple projects, and the
 * initial auto-creation only puts tasks under one primary project.
 *
 * Body:
 *   {
 *     "actionItemIndex": 0,   // position in MeetingNote.actionItems JSON array
 *     "projectId":       "cuid"
 *   }
 *
 * The endpoint:
 *   - Reads the action item from the JSON snapshot stored on MeetingNote
 *   - Resolves the action item's assigneeEmail against the target project's members
 *   - Creates a Task in projectId with the full provenance (generatedFromMeetingId,
 *     meetingSourceConfidence, meetingSourceQuote)
 *
 * Idempotency note: we DO create duplicates if called twice for the same
 * (meeting, actionItemIndex, projectId). That's intentional — duplicate
 * prevention is the admin's call from the UI.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: meetingId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as { actionItemIndex?: number; projectId?: string };
  if (typeof body.actionItemIndex !== 'number' || body.actionItemIndex < 0) {
    return NextResponse.json({ error: 'actionItemIndex (number) is required' }, { status: 400 });
  }
  if (!body.projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  // Load the meeting + verify the action item exists
  const meeting = await prisma.meetingNote.findUnique({
    where: { id: meetingId },
    select: { id: true, organizerId: true, actionItems: true },
  });
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  const items = (meeting.actionItems ?? []) as unknown as ActionItem[];
  if (!Array.isArray(items) || body.actionItemIndex >= items.length) {
    return NextResponse.json(
      { error: `actionItemIndex ${body.actionItemIndex} out of range (${items.length} items)` },
      { status: 400 },
    );
  }
  const action = items[body.actionItemIndex];

  // Verify the project exists + caller has access
  const project = await prisma.project.findUnique({
    where: { id: body.projectId },
    include: {
      owner: { select: { id: true, email: true } },
      members: { include: { user: { select: { id: true, email: true } } } },
    },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const isPriv = session.user.role === 'admin' || session.user.role === 'manager';
  const isOwnerOrMember =
    project.owner.email === session.user.email ||
    project.members.some((m) => m.user.email === session.user.email);
  if (!isPriv && !isOwnerOrMember) {
    return NextResponse.json({ error: 'No access to this project' }, { status: 403 });
  }

  // Resolve assignee against THIS project's members (the assigneeEmail in the
  // action item was originally matched against the primary project — for a
  // different target project we re-check membership).
  const assigneeEmail = action.assigneeEmail?.toLowerCase();
  const assignee = assigneeEmail
    ? [project.owner, ...project.members.map((m) => m.user)].find(
        (u) => u.email.toLowerCase() === assigneeEmail,
      ) ?? null
    : null;

  const status = assignee && action.confidence >= 0.85 ? 'todo' : 'backlog';
  const needsReview = action.confidence < 0.85;

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: action.title.slice(0, 255),
      description: action.description,
      status,
      priority: normalizePriority(action.priority),
      dueDate: action.dueDate ? safeDate(action.dueDate) : null,
      createdById: meeting.organizerId,
      generatedFromMeetingId: meetingId,
      meetingSourceConfidence: action.confidence,
      meetingSourceQuote: action.sourceQuote,
      meetingNeedsReview: needsReview,
      assignees: assignee ? { create: [{ userId: assignee.id }] } : undefined,
    },
  });

  return NextResponse.json({ ok: true, task: { id: task.id, status: task.status, projectId: task.projectId } });
}

function normalizePriority(p: ActionItem['priority']) {
  if (p === 'low' || p === 'medium' || p === 'high' || p === 'urgent') return p;
  return 'medium' as const;
}

function safeDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
