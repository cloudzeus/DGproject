import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { renderMom } from '@/lib/meeting-mom';
import type { ActionItem, Decision, Risk, OpenQuestion } from '@/lib/llm/types';

/**
 * GET /api/meetings/:id/mom-preview
 *
 * Returns the rendered MoM HTML for in-app preview or download. Sends an HTML
 * Content-Type so admins can save the response directly as a self-contained
 * .html file (`?download=1` switches to attachment disposition).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: meetingNoteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const m = await prisma.meetingNote.findUnique({
    where: { id: meetingNoteId },
    include: {
      organizer: { select: { name: true, email: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
  if (!m) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  const rendered = renderMom({
    meetingId: m.id,
    subject: m.subject,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    durationSec: m.durationSec,
    organizer: { name: m.organizer.name, email: m.organizer.email },
    project: { id: m.project.id, name: m.project.name, color: m.project.color },
    summary: m.summary,
    decisions: ((m.decisions ?? []) as unknown as Decision[]) ?? [],
    actionItems: ((m.actionItems ?? []) as unknown as ActionItem[]) ?? [],
    risks: ((m.risks ?? []) as unknown as Risk[]) ?? [],
    openQuestions: ((m.openQuestions ?? []) as unknown as OpenQuestion[]) ?? [],
  });

  const url = new URL(req.url);
  const download = url.searchParams.get('download') === '1';

  const filename = `MoM-${m.subject.replace(/[^a-zA-Z0-9α-ωΑ-Ω-]/g, '_')}-${m.startedAt
    .toISOString()
    .slice(0, 10)}.html`;

  return new NextResponse(rendered.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...(download ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
    },
  });
}
