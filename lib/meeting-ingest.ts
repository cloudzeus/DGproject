import { prisma } from '@/lib/prisma';
import {
  getOnlineMeetingById,
  listAllRecordings,
  listAllTranscripts,
} from '@/lib/microsoft-graph';

export type IngestResult = {
  organizerEmail: string;
  scanned: number;
  upserted: number;
  error?: string;
};

async function ingestOrganizer(
  organizerEmail: string,
  start: Date,
  end: Date,
): Promise<IngestResult> {
  let scanned = 0;
  let upserted = 0;
  try {
    const [transcripts, recordings] = await Promise.all([
      listAllTranscripts(organizerEmail, start, end).catch(() => []),
      listAllRecordings(organizerEmail, start, end).catch(() => []),
    ]);

    type Agg = {
      hasTranscript: boolean;
      hasRecording: boolean;
      transcriptCreatedAt?: string;
      recordingCreatedAt?: string;
      organizerGraphId?: string;
    };
    const byMeeting = new Map<string, Agg>();
    for (const t of transcripts) {
      const a = byMeeting.get(t.meetingId) ?? { hasTranscript: false, hasRecording: false };
      a.hasTranscript = true;
      a.transcriptCreatedAt = t.createdDateTime;
      a.organizerGraphId = t.meetingOrganizerUserId;
      byMeeting.set(t.meetingId, a);
    }
    for (const r of recordings) {
      const a = byMeeting.get(r.meetingId) ?? { hasTranscript: false, hasRecording: false };
      a.hasRecording = true;
      a.recordingCreatedAt = r.createdDateTime;
      a.organizerGraphId = a.organizerGraphId ?? r.meetingOrganizerUserId;
      byMeeting.set(r.meetingId, a);
    }

    scanned = byMeeting.size;

    for (const [meetingId, a] of byMeeting) {
      let subject: string | null = null;
      let startedAt: Date | null = null;
      let endedAt: Date | null = null;
      let joinWebUrl: string | null = null;
      try {
        const meta = await getOnlineMeetingById(organizerEmail, meetingId);
        subject = meta.subject ?? null;
        startedAt = meta.startDateTime ? new Date(meta.startDateTime) : null;
        endedAt = meta.endDateTime ? new Date(meta.endDateTime) : null;
        joinWebUrl = meta.joinWebUrl ?? null;
      } catch {
        // Metadata fetch can fail on policy/permissions — keep the row anyway.
      }

      await prisma.discoveredMeeting.upsert({
        where: { teamsMeetingId: meetingId },
        create: {
          teamsMeetingId: meetingId,
          organizerEmail,
          organizerGraphId: a.organizerGraphId,
          subject,
          startedAt,
          endedAt,
          joinWebUrl,
          hasTranscript: a.hasTranscript,
          hasRecording: a.hasRecording,
          transcriptCreatedAt: a.transcriptCreatedAt ? new Date(a.transcriptCreatedAt) : null,
          recordingCreatedAt: a.recordingCreatedAt ? new Date(a.recordingCreatedAt) : null,
        },
        update: {
          hasTranscript: a.hasTranscript,
          hasRecording: a.hasRecording,
          transcriptCreatedAt: a.transcriptCreatedAt ? new Date(a.transcriptCreatedAt) : undefined,
          recordingCreatedAt: a.recordingCreatedAt ? new Date(a.recordingCreatedAt) : undefined,
          subject: subject ?? undefined,
          startedAt: startedAt ?? undefined,
          endedAt: endedAt ?? undefined,
          joinWebUrl: joinWebUrl ?? undefined,
          organizerGraphId: a.organizerGraphId ?? undefined,
        },
      });
      upserted++;
    }

    return { organizerEmail, scanned, upserted };
  } catch (err) {
    return {
      organizerEmail,
      scanned,
      upserted,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function ingestAllUsers(daysBack = 7): Promise<{
  windowStart: string;
  windowEnd: string;
  results: IngestResult[];
}> {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);

  // "Connected" = users who have signed in via Azure AD (so we have an
  // azureAdId on file). Imported placeholder rows without a real Microsoft
  // login are skipped — Graph lookups for them would just 404.
  const users = await prisma.user.findMany({
    where: { azureAdId: { not: null } },
    select: { email: true },
  });

  const results: IngestResult[] = [];
  for (const u of users) {
    if (!u.email) continue;
    results.push(await ingestOrganizer(u.email, start, end));
  }
  return { windowStart: start.toISOString(), windowEnd: end.toISOString(), results };
}
