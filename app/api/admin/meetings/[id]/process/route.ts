import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  getMeetingTranscriptVtt,
  listMeetingTranscripts,
} from '@/lib/microsoft-graph';
import { processMeeting } from '@/lib/meeting-pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Promote a DiscoveredMeeting into a MeetingNote attached to a project,
 * running the full LLM pipeline. Admin-only.
 *
 * Body: { projectId: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!body.projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const discovered = await prisma.discoveredMeeting.findUnique({ where: { id } });
  if (!discovered) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (discovered.promotedMeetingNoteId) {
    return NextResponse.json(
      { error: 'Already promoted', meetingNoteId: discovered.promotedMeetingNoteId },
      { status: 409 },
    );
  }

  const organizer = await prisma.user.findUnique({
    where: { email: discovered.organizerEmail },
    select: { id: true },
  });
  if (!organizer) {
    return NextResponse.json(
      { error: `Organizer ${discovered.organizerEmail} is not a fluent-pm user.` },
      { status: 400 },
    );
  }

  const transcripts = await listMeetingTranscripts(
    discovered.organizerEmail,
    discovered.teamsMeetingId,
  );
  if (!transcripts.length) {
    return NextResponse.json(
      { error: 'No transcripts found on Graph for this meeting.' },
      { status: 404 },
    );
  }
  const latest = transcripts.sort((a, b) =>
    b.createdDateTime.localeCompare(a.createdDateTime),
  )[0];

  const vtt = await getMeetingTranscriptVtt(
    discovered.organizerEmail,
    discovered.teamsMeetingId,
    latest.id,
  );

  const endedAt =
    discovered.endedAt ?? new Date(latest.createdDateTime);
  const startedAt =
    discovered.startedAt ?? new Date(endedAt.getTime() - 60 * 60 * 1000);

  const result = await processMeeting({
    projectId: body.projectId,
    organizerId: organizer.id,
    subject: discovered.subject ?? '(Teams meeting)',
    startedAt,
    endedAt,
    vtt,
    teamsMeetingId: discovered.teamsMeetingId,
    teamsJoinUrl: discovered.joinWebUrl ?? null,
    teamsTranscriptId: latest.id,
  });

  await prisma.discoveredMeeting.update({
    where: { id },
    data: { promotedMeetingNoteId: result.meetingNoteId, promotedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    meetingNoteId: result.meetingNoteId,
    actionItemsExtracted: result.insights.actionItems.length,
  });
}
