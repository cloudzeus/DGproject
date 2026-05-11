import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { refreshMomDeliveries } from '@/lib/mom-sender';

/**
 * POST /api/meetings/:id/refresh-deliveries
 *
 * Polls Mailgun's events API for each pending MomDelivery on this meeting
 * and updates open/delivery status. Returns a per-recipient diff.
 *
 * Mailgun events have a propagation delay (typically 30s-2min for delivery,
 * and opens depend on when the recipient opens). This endpoint is meant to be
 * triggered manually from the UI, or via a recurring cron job.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: meetingNoteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await refreshMomDeliveries(meetingNoteId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
