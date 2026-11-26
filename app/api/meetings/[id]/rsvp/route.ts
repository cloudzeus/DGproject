import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getEventAttendees } from '@/lib/microsoft-graph';
import { createNotifications } from '@/lib/notifications';

const RESPONSE_LABEL: Record<string, string> = {
  accepted: 'αποδέχθηκε',
  tentativelyAccepted: 'αποδέχθηκε με επιφύλαξη',
  declined: 'απέρριψε',
};

/**
 * POST /api/meetings/:id/rsvp
 *
 * Συγχρονίζει τα MeetingAttendee rows με το Graph responseStatus του event.
 * Για κάθε ΝΕΑ απάντηση (accept / tentative / decline) ειδοποιείται ο organizer
 * — αυτό είναι το «λαμβάνει αποδοχή» του χρήστη που έκλεισε τη σύσκεψη.
 * Επιστρέφει την τρέχουσα λίστα attendees για άμεσο re-render.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meeting = await prisma.meetingNote.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      projectId: true,
      teamsEventId: true,
      status: true,
      organizerId: true,
      organizer: { select: { email: true } },
      attendees: { select: { id: true, email: true, response: true } },
      project: {
        select: {
          ownerId: true,
          members: { select: { userId: true } },
        },
      },
    },
  });
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  const role = session.user.role;
  const isPriv = role === 'admin' || role === 'manager';
  const isMember =
    meeting.project.ownerId === session.user.id ||
    meeting.project.members.some((m) => m.userId === session.user.id);
  if (!isPriv && !isMember) {
    return NextResponse.json({ error: 'No access to this project' }, { status: 403 });
  }

  if (!meeting.teamsEventId) {
    return NextResponse.json(
      { error: 'Η σύσκεψη δεν έχει συνδεδεμένο calendar event (teamsEventId).' },
      { status: 400 },
    );
  }

  let graphAttendees;
  try {
    graphAttendees = await getEventAttendees(meeting.organizer.email, meeting.teamsEventId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[rsvp] graph fetch failed:', msg);
    return NextResponse.json({ error: `Graph: ${msg}` }, { status: 502 });
  }

  const previousByEmail = new Map(
    meeting.attendees.map((a) => [a.email.toLowerCase(), a.response]),
  );
  const newResponses: { email: string; name: string | null; response: string }[] = [];

  for (const ga of graphAttendees) {
    const email = ga.email.toLowerCase();
    const prev = previousByEmail.get(email);
    const respondedChanged = prev !== undefined && prev !== ga.response && ga.response !== 'none' && ga.response !== 'notResponded';
    await prisma.meetingAttendee.upsert({
      where: { meetingNoteId_email: { meetingNoteId: meeting.id, email: ga.email } },
      create: {
        meetingNoteId: meeting.id,
        email: ga.email,
        name: ga.name,
        response: ga.response,
        respondedAt: ga.response !== 'none' && ga.response !== 'notResponded' ? new Date() : null,
      },
      update: {
        name: ga.name,
        response: ga.response,
        ...(prev !== ga.response && ga.response !== 'none' && ga.response !== 'notResponded'
          ? { respondedAt: new Date() }
          : {}),
      },
    });
    if (respondedChanged) {
      newResponses.push({ email: ga.email, name: ga.name, response: ga.response });
    }
  }

  // Ειδοποίηση organizer για κάθε νέα απάντηση.
  if (newResponses.length > 0) {
    await createNotifications(
      newResponses.map((r) => ({
        userId: meeting.organizerId,
        title: 'Απάντηση πρόσκλησης σύσκεψης',
        message: `Ο/Η ${r.name ?? r.email} ${RESPONSE_LABEL[r.response] ?? r.response} τη σύσκεψη «${meeting.subject}».`,
        type: 'meeting' as const,
        link: `/projects/${meeting.projectId}`,
      })),
    );
  }

  const attendees = await prisma.meetingAttendee.findMany({
    where: { meetingNoteId: meeting.id },
    orderBy: { email: 'asc' },
    select: { id: true, email: true, name: true, response: true, respondedAt: true },
  });

  return NextResponse.json({
    ok: true,
    attendees,
    newResponses: newResponses.length,
  });
}
