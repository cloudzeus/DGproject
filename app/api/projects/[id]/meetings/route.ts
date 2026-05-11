import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/projects/:id/meetings
 *
 * Returns all MeetingNotes for the project, newest first. Excludes the raw VTT
 * to keep the payload small — fetch /api/meetings/:id for the full transcript.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meetings = await prisma.meetingNote.findMany({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      subject: true,
      startedAt: true,
      endedAt: true,
      durationSec: true,
      summary: true,
      status: true,
      autoTasksCreated: true,
      autoTasksNeedReview: true,
      llmProvider: true,
      llmModel: true,
      llmInputTokens: true,
      llmOutputTokens: true,
      processedAt: true,
      organizer: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ meetings });
}
