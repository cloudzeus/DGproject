import { NextRequest, NextResponse } from 'next/server';
import { ingestAllUsers } from '@/lib/meeting-ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron-triggered ingest of Teams transcripts/recordings across all connected
 * users. Protected via the CRON_SECRET env var: callers must pass it either as
 * Authorization: Bearer <secret> or ?secret=<secret>. Vercel Cron sends the
 * bearer header automatically when configured with the same secret.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ')
    ? auth.slice(7)
    : new URL(req.url).searchParams.get('secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const daysBack = Math.max(
    1,
    Math.min(30, Number(new URL(req.url).searchParams.get('daysBack') ?? 7)),
  );

  const summary = await ingestAllUsers(daysBack);
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
