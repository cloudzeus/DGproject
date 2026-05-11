import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processMeeting } from '@/lib/meeting-pipeline';

/**
 * POC endpoint — accept a VTT transcript directly and run the full pipeline:
 * persist MeetingNote + auto-create tasks by confidence tier.
 *
 * Bypasses Microsoft Graph entirely. Useful for:
 *   - Testing with a manually-downloaded transcript from Teams Recording UI
 *   - Testing while Graph permissions are still being provisioned
 *
 * POST body:
 *   {
 *     "projectId":   "cuid",
 *     "vtt":         "WEBVTT\n…",
 *     "subject":     "optional meeting subject",
 *     "startedAt":   "ISO date (optional, defaults to 1h before endedAt)",
 *     "endedAt":     "ISO date (optional, defaults to now)"
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      projectId?: string;
      vtt?: string;
      subject?: string;
      startedAt?: string;
      endedAt?: string;
    };

    if (!body.projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    if (!body.vtt) return NextResponse.json({ error: 'vtt required' }, { status: 400 });

    const organizer = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!organizer) return NextResponse.json({ error: 'Session user not in DB' }, { status: 401 });

    const endedAt = body.endedAt ? new Date(body.endedAt) : new Date();
    const startedAt = body.startedAt
      ? new Date(body.startedAt)
      : new Date(endedAt.getTime() - 60 * 60 * 1000);

    const result = await processMeeting({
      projectId: body.projectId,
      organizerId: organizer.id,
      subject: body.subject ?? '(manual upload)',
      startedAt,
      endedAt,
      vtt: body.vtt,
    });

    return NextResponse.json({
      meetingNoteId: result.meetingNoteId,
      actionItemsExtracted: result.insights.actionItems.length,
      insights: result.insights,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meetings/poc-vtt] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
