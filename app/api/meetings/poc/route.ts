import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  getMeetingTranscriptVtt,
  getOnlineMeetingByJoinUrl,
  listMeetingTranscripts,
} from '@/lib/microsoft-graph';
import { processMeeting } from '@/lib/meeting-pipeline';

/**
 * POC endpoint that does the full Graph → LLM → persist → auto-tasks flow.
 *
 * Pulls the transcript from Microsoft Teams via Graph API, runs it through the
 * meeting-pipeline, and creates Tasks per the confidence tiers.
 *
 * POST body:
 *   {
 *     "projectId":  "cuid",
 *     "meetingId":  "Graph onlineMeeting id"     // either this…
 *     "joinWebUrl": "https://teams.microsoft.com/…"  // …or this
 *     "organizer":  "user@example.com"           // optional, defaults to session user
 *     "subject":    "optional override"
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
      meetingId?: string;
      joinWebUrl?: string;
      organizer?: string;
      subject?: string;
    };

    if (!body.projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    if (!body.meetingId && !body.joinWebUrl) {
      return NextResponse.json(
        { error: 'Either meetingId or joinWebUrl is required' },
        { status: 400 },
      );
    }

    const organizerEmail = body.organizer || session.user.email;
    const organizer = await prisma.user.findUnique({
      where: { email: organizerEmail },
      select: { id: true },
    });
    if (!organizer) {
      return NextResponse.json(
        { error: `Organizer ${organizerEmail} not in fluent-pm DB. Add them first.` },
        { status: 400 },
      );
    }

    // Resolve meetingId from URL if needed
    let meetingId = body.meetingId;
    if (!meetingId) {
      const m = await getOnlineMeetingByJoinUrl(organizerEmail, body.joinWebUrl!);
      if (!m) {
        return NextResponse.json(
          { error: `No onlineMeeting found for joinWebUrl under organizer ${organizerEmail}` },
          { status: 404 },
        );
      }
      meetingId = m.id;
    }

    // Find most recent transcript
    const transcripts = await listMeetingTranscripts(organizerEmail, meetingId);
    if (!transcripts.length) {
      return NextResponse.json(
        { error: 'No transcripts found. Was transcription enabled during the meeting?' },
        { status: 404 },
      );
    }
    const latest = transcripts.sort((a, b) =>
      b.createdDateTime.localeCompare(a.createdDateTime),
    )[0];

    const vtt = await getMeetingTranscriptVtt(organizerEmail, meetingId, latest.id);

    const endedAt = new Date(latest.createdDateTime);
    const startedAt = new Date(endedAt.getTime() - 60 * 60 * 1000); // best-effort fallback

    const result = await processMeeting({
      projectId: body.projectId,
      organizerId: organizer.id,
      subject: body.subject ?? '(Teams meeting)',
      startedAt,
      endedAt,
      vtt,
      teamsMeetingId: meetingId,
      teamsJoinUrl: body.joinWebUrl ?? null,
      teamsTranscriptId: latest.id,
    });

    return NextResponse.json({
      meetingNoteId: result.meetingNoteId,
      autoTasksCreated: result.createdTaskIds.length,
      reviewTasksCreated: result.reviewTaskIds.length,
      skippedLowConfidence: result.skippedLowConfidenceCount,
      insights: result.insights,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meetings/poc] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
