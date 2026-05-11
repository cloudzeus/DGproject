import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  getOnlineMeetingByJoinUrl,
  scheduleTeamsMeeting,
} from '@/lib/microsoft-graph';

/**
 * POST /api/projects/:id/schedule-meeting
 *
 * Body:
 *   {
 *     "subject":          "Weekly sync",
 *     "startDateTime":    "2026-05-13T10:00:00Z",
 *     "endDateTime":      "2026-05-13T11:00:00Z",
 *     "organizerUpn":     "user@dgsmart.gr",    // AAD UPN, may differ from session email
 *     "memberEmails":     ["proj-member@x.com", ...],  // optional, pre-checked project members
 *     "externalEmails":   ["client@y.com", ...],       // optional, free-form external attendees
 *     "bodyHtml":         "<p>Agenda…</p>"      // optional invite body
 *   }
 *
 * Result:
 *   {
 *     "meetingNoteId": "cuid",  // pre-created with status='scheduled'
 *     "joinUrl": "https://teams.microsoft.com/...",
 *     "eventId": "{Graph event id}"
 *   }
 *
 * The Teams meeting + calendar invites are created in a SINGLE Graph call
 * (`POST /events` with isOnlineMeeting=true). A MeetingNote is then persisted
 * with status='scheduled' so later transcript pulls auto-link to this project.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as {
    subject?: string;
    startDateTime?: string;
    endDateTime?: string;
    organizerUpn?: string;
    memberEmails?: string[];
    externalEmails?: string[];
    bodyHtml?: string;
  };

  // Basic validation
  if (!body.subject?.trim()) return NextResponse.json({ error: 'subject required' }, { status: 400 });
  if (!body.startDateTime || !body.endDateTime) {
    return NextResponse.json({ error: 'startDateTime + endDateTime required' }, { status: 400 });
  }
  const start = new Date(body.startDateTime);
  const end = new Date(body.endDateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: 'endDateTime must be after startDateTime' }, { status: 400 });
  }

  // Resolve project + permissions
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { user: { select: { id: true, email: true, name: true } } } },
      owner: { select: { id: true, email: true, name: true } },
    },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const isPriv = session.user.role === 'admin' || session.user.role === 'manager';
  const isMember =
    project.owner.email === session.user.email ||
    project.members.some((m) => m.user.email === session.user.email);
  if (!isPriv && !isMember) {
    return NextResponse.json({ error: 'No access to this project' }, { status: 403 });
  }

  // Resolve session user → DB row → organizer info
  const sessionUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!sessionUser) {
    return NextResponse.json({ error: 'Session user not in DB' }, { status: 400 });
  }

  // Resolve organizer UPN — defaults to session email if not provided.
  const organizerUpn = body.organizerUpn?.trim() || session.user.email;

  // Combine attendees: only include checked project members (whose emails are
  // in body.memberEmails) + external emails. Dedupe + drop the organizer.
  const memberEmailsSet = new Set((body.memberEmails ?? []).map((e) => e.toLowerCase().trim()));
  const memberAttendees = [project.owner, ...project.members.map((m) => m.user)]
    .filter((u) => memberEmailsSet.has(u.email.toLowerCase()))
    .map((u) => ({ email: u.email, name: u.name ?? u.email }));

  const externalAttendees = (body.externalEmails ?? [])
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.includes('@'))
    .map((email) => ({ email, name: null }));

  const allAttendees = dedupeByEmail([...memberAttendees, ...externalAttendees]).filter(
    (a) => a.email.toLowerCase() !== organizerUpn.toLowerCase(),
  );

  try {
    // Step 1: Graph creates calendar event + Teams meeting + sends invites
    const scheduled = await scheduleTeamsMeeting({
      organizer: organizerUpn,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      startDateTime: start,
      endDateTime: end,
      attendees: allAttendees,
      allowTranscription: true,
      recordAutomatically: false,
    });

    // Step 2: try to resolve the Graph onlineMeeting id from the joinUrl
    // so later transcript pulls can find it. The lookup may fail (different
    // Graph quirks) but the rest of the flow still works.
    let onlineMeetingId: string | null = null;
    if (scheduled.joinUrl) {
      try {
        const m = await getOnlineMeetingByJoinUrl(organizerUpn, scheduled.joinUrl);
        onlineMeetingId = m?.id ?? null;
      } catch {
        // Non-fatal: the meeting was created. We'll resolve the id when the
        // transcript is pulled later.
      }
    }

    // Step 3: persist as scheduled MeetingNote
    const meetingNote = await prisma.meetingNote.create({
      data: {
        projectId,
        organizerId: sessionUser.id,
        teamsMeetingId: onlineMeetingId,
        teamsJoinUrl: scheduled.joinUrl,
        subject: body.subject,
        startedAt: start,
        endedAt: end,
        durationSec: Math.round((end.getTime() - start.getTime()) / 1000),
        status: 'scheduled',
      },
    });

    return NextResponse.json({
      meetingNoteId: meetingNote.id,
      joinUrl: scheduled.joinUrl,
      webLink: scheduled.webLink,
      eventId: scheduled.eventId,
      onlineMeetingId,
      attendeeCount: allAttendees.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[schedule-meeting] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function dedupeByEmail<T extends { email: string }>(items: T[]): T[] {
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
