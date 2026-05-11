import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/meetings/:id
 *
 * Returns a single MeetingNote with full transcript + insights + linked tasks.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meeting = await prisma.meetingNote.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
      generatedTasks: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          meetingSourceConfidence: true,
          meetingNeedsReview: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ meeting });
}

/**
 * DELETE /api/meetings/:id
 *
 * Removes the MeetingNote. Linked tasks keep their generatedFromMeetingId set
 * to NULL (ON DELETE SET NULL on the FK). They stay in the project — deleting
 * a meeting must not silently delete tasks the team is already working on.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.meetingNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
