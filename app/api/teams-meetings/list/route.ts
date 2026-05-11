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
  const organizer = url.searchParams.get('organizer') ?? session.user.email;

  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);

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
    type Row = {
      meetingId: string;
      subject: string | null;
      startDateTime: string | null;
      endDateTime: string | null;
      joinWebUrl: string | null;
      hasTranscript: boolean;
      hasRecording: boolean;
      transcriptCreatedAt: string | null;
      recordingCreatedAt: string | null;
      alreadyProcessedMeetingNoteId: string | null;
      alreadyProcessedProjectId: string | null;
    };

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
    for (const [meetingId, row] of rows) {
      try {
        const meta = await getOnlineMeetingById(organizer, meetingId);
        row.subject = meta.subject;
        row.startDateTime = meta.startDateTime;
        row.endDateTime = meta.endDateTime;
        row.joinWebUrl = meta.joinWebUrl;
      } catch (err) {
        // Leave subject/times null if we can't fetch them — the row is still useful.
        console.warn(`[teams-meetings] meta fetch failed for ${meetingId}:`, (err as Error).message);
      }
    }

    // Annotate with any already-imported MeetingNote rows so the UI can route
    // straight to the existing notes instead of re-processing.
    const meetingIds = Array.from(rows.keys());
    if (meetingIds.length > 0) {
      const existing = await prisma.meetingNote.findMany({
        where: { teamsMeetingId: { in: meetingIds } },
        select: { id: true, teamsMeetingId: true, projectId: true },
      });
      for (const e of existing) {
        if (!e.teamsMeetingId) continue;
        const row = rows.get(e.teamsMeetingId);
        if (row) {
          row.alreadyProcessedMeetingNoteId = e.id;
          row.alreadyProcessedProjectId = e.projectId;
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function emptyRow(meetingId: string) {
  return {
    meetingId,
    subject: null,
    startDateTime: null,
    endDateTime: null,
    joinWebUrl: null,
    hasTranscript: false,
    hasRecording: false,
    transcriptCreatedAt: null,
    recordingCreatedAt: null,
    alreadyProcessedMeetingNoteId: null,
    alreadyProcessedProjectId: null,
  };
}
