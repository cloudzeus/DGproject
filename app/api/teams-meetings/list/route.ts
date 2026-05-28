import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  getOnlineMeetingById,
  listAllRecordings,
  listAllTranscripts,
} from '@/lib/microsoft-graph';

/**
 * GET /api/teams-meetings/list?daysBack=30&organizer=user@example.com
 *
 * Lists all Teams meetings for the given organizer that have a transcript
 * and/or a recording available, within the past `daysBack` days. Each row is
 * enriched with subject / start / end pulled via /onlineMeetings/{id}.
 *
 * Also annotates each row with `alreadyProcessedMeetingNoteId` if we have
 * already imported this meeting into fluent-pm (so the UI can show
 * "View notes" instead of "Process").
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysBack = Math.max(1, Math.min(180, Number(url.searchParams.get('daysBack') ?? 30)));
  const organizerParam = url.searchParams.get('organizer');
  const allMode = !organizerParam || organizerParam === '*';
  const organizer = organizerParam && !allMode ? organizerParam : session.user.email;

  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);

  // "All organizers" mode reads from the DiscoveredMeeting cache populated by
  // the background ingest. Avoids fan-out Graph calls. Admin role required.
  if (allMode) {
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden — admin role required for all-organizer view' },
        { status: 403 },
      );
    }
    const since = start;
    const discovered = await prisma.discoveredMeeting.findMany({
      where: {
        OR: [{ startedAt: { gte: since } }, { discoveredAt: { gte: since } }],
      },
      orderBy: [{ startedAt: 'desc' }, { discoveredAt: 'desc' }],
      take: 500,
    });
    const promotedIds = discovered
      .map((d) => d.promotedMeetingNoteId)
      .filter((x): x is string => Boolean(x));
    const notes = promotedIds.length
      ? await prisma.meetingNote.findMany({
          where: { id: { in: promotedIds } },
          select: { id: true, projectId: true, status: true, project: { select: { name: true } } },
        })
      : [];
    const noteById = new Map(notes.map((n) => [n.id, n]));
    const meetings = discovered.map((d) => {
      const note = d.promotedMeetingNoteId ? noteById.get(d.promotedMeetingNoteId) : null;
      return {
        meetingId: d.teamsMeetingId,
        organizerEmail: d.organizerEmail,
        subject: d.subject,
        startDateTime: d.startedAt?.toISOString() ?? null,
        endDateTime: d.endedAt?.toISOString() ?? null,
        joinWebUrl: d.joinWebUrl,
        hasTranscript: d.hasTranscript,
        hasRecording: d.hasRecording,
        transcriptCreatedAt: d.transcriptCreatedAt?.toISOString() ?? null,
        recordingCreatedAt: d.recordingCreatedAt?.toISOString() ?? null,
        alreadyProcessedMeetingNoteId: note?.status === 'ready' ? note.id : null,
        alreadyProcessedProjectId: note?.status === 'ready' ? note.projectId : null,
        scheduledMeetingNoteId: null,
        linkedProjectId: note?.projectId ?? null,
        linkedProjectName: note?.project.name ?? null,
      };
    });
    return NextResponse.json({
      meetings,
      organizer: '*',
      mode: 'all',
      range: { start: start.toISOString(), end: end.toISOString() },
      counts: {
        total: meetings.length,
        transcripts: meetings.filter((m) => m.hasTranscript).length,
        recordings: meetings.filter((m) => m.hasRecording).length,
      },
      policyWarning: null,
    });
  }

  try {
    // Fetch transcripts + recordings in parallel
    const [transcripts, recordings] = await Promise.all([
      listAllTranscripts(organizer, start, end).catch((err) => {
        console.warn('[teams-meetings] listAllTranscripts failed:', err.message);
        return [];
      }),
      listAllRecordings(organizer, start, end).catch((err) => {
        console.warn('[teams-meetings] listAllRecordings failed:', err.message);
        return [];
      }),
    ]);

    // Group both into a map keyed by meetingId so each meeting shows once.
    type Row = ReturnType<typeof emptyRow>;

    const rows = new Map<string, Row>();

    for (const t of transcripts) {
      const r = rows.get(t.meetingId) ?? emptyRow(t.meetingId);
      r.hasTranscript = true;
      r.transcriptCreatedAt = t.createdDateTime;
      rows.set(t.meetingId, r);
    }
    for (const rec of recordings) {
      const r = rows.get(rec.meetingId) ?? emptyRow(rec.meetingId);
      r.hasRecording = true;
      r.recordingCreatedAt = rec.createdDateTime;
      rows.set(rec.meetingId, r);
    }

    // Enrich each row with meeting metadata (subject, times). Done sequentially
    // to avoid Graph throttling; for tenants with many meetings consider batching.
    // We surface ONE policy-error warning to the UI instead of N — the cause is
    // the same for every meeting.
    let policyWarning: string | null = null;
    for (const [meetingId, row] of rows) {
      try {
        const meta = await getOnlineMeetingById(organizer, meetingId);
        row.subject = meta.subject;
        row.startDateTime = meta.startDateTime;
        row.endDateTime = meta.endDateTime;
        row.joinWebUrl = meta.joinWebUrl;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('No application access policy')) {
          policyWarning = msg;
        }
        console.warn(`[teams-meetings] meta fetch failed for ${meetingId}:`, msg);
      }
    }

    // Annotate with any existing MeetingNote rows. Two kinds:
    //  - `scheduled`: pre-linked from the project's Schedule Meeting flow. The
    //    UI should auto-target this project on processing.
    //  - `ready`/etc: already processed, UI shows "view notes".
    const meetingIds = Array.from(rows.keys());
    if (meetingIds.length > 0) {
      const existing = await prisma.meetingNote.findMany({
        where: { teamsMeetingId: { in: meetingIds } },
        select: {
          id: true,
          teamsMeetingId: true,
          projectId: true,
          status: true,
          project: { select: { name: true } },
        },
      });
      for (const e of existing) {
        if (!e.teamsMeetingId) continue;
        const row = rows.get(e.teamsMeetingId);
        if (!row) continue;
        row.linkedProjectId = e.projectId;
        row.linkedProjectName = e.project.name;
        if (e.status === 'ready') {
          row.alreadyProcessedMeetingNoteId = e.id;
          row.alreadyProcessedProjectId = e.projectId;
        } else if (e.status === 'scheduled') {
          row.scheduledMeetingNoteId = e.id;
        }
      }
    }

    const result = Array.from(rows.values()).sort((a, b) => {
      const aT = a.startDateTime ?? a.transcriptCreatedAt ?? '';
      const bT = b.startDateTime ?? b.transcriptCreatedAt ?? '';
      return bT.localeCompare(aT);
    });

    return NextResponse.json({
      meetings: result,
      organizer,
      range: { start: start.toISOString(), end: end.toISOString() },
      counts: { total: result.length, transcripts: transcripts.length, recordings: recordings.length },
      policyWarning,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function emptyRow(meetingId: string) {
  return {
    meetingId,
    subject: null as string | null,
    startDateTime: null as string | null,
    endDateTime: null as string | null,
    joinWebUrl: null as string | null,
    hasTranscript: false,
    hasRecording: false,
    transcriptCreatedAt: null as string | null,
    recordingCreatedAt: null as string | null,
    alreadyProcessedMeetingNoteId: null as string | null,
    alreadyProcessedProjectId: null as string | null,
    // Pre-linked from the Schedule Meeting flow — the user picked the project
    // up-front, so we should target it automatically when they hit Process.
    scheduledMeetingNoteId: null as string | null,
    linkedProjectId: null as string | null,
    linkedProjectName: null as string | null,
  };
}
