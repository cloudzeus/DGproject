import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ingestAllUsers } from '@/lib/meeting-ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status'); // 'unassigned' | 'promoted' | null (all)
  const organizer = url.searchParams.get('organizer');
  const daysBack = Math.max(1, Math.min(180, Number(url.searchParams.get('daysBack') ?? 30)));
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    OR: [{ startedAt: { gte: since } }, { discoveredAt: { gte: since } }],
  };
  if (organizer) where.organizerEmail = organizer;
  if (status === 'unassigned') where.promotedMeetingNoteId = null;
  if (status === 'promoted') where.promotedMeetingNoteId = { not: null };

  const rows = await prisma.discoveredMeeting.findMany({
    where,
    orderBy: [{ startedAt: 'desc' }, { discoveredAt: 'desc' }],
    take: 500,
  });

  // Enrich with the linked MeetingNote (subject/project) when promoted.
  const promotedIds = rows
    .map((r) => r.promotedMeetingNoteId)
    .filter((x): x is string => Boolean(x));
  const notes = promotedIds.length
    ? await prisma.meetingNote.findMany({
        where: { id: { in: promotedIds } },
        select: { id: true, projectId: true, status: true, project: { select: { name: true } } },
      })
    : [];
  const noteById = new Map(notes.map((n) => [n.id, n]));

  return NextResponse.json({
    meetings: rows.map((r) => ({
      ...r,
      promotedNote: r.promotedMeetingNoteId
        ? noteById.get(r.promotedMeetingNoteId) ?? null
        : null,
    })),
  });
}

/**
 * POST /api/admin/meetings  — trigger an on-demand ingest (same logic as the
 * cron route, but gated by admin role instead of CRON_SECRET).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    daysBack?: number;
    scope?: 'fluent-pm' | 'tenant';
  };
  const daysBack = Math.max(1, Math.min(180, Number(body.daysBack ?? 7)));
  const summary = await ingestAllUsers(daysBack, { scope: body.scope });
  const totals = summary.results.reduce(
    (acc, r) => {
      acc.scanned += r.scanned;
      acc.upserted += r.upserted;
      if (r.error) acc.errors++;
      return acc;
    },
    { scanned: 0, upserted: 0, errors: 0 },
  );
  return NextResponse.json({ ok: true, totals, ...summary });
}
