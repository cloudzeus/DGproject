import { NextResponse } from 'next/server';
import { syncSoftoneItems } from '@/lib/softone-items-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — SoftOne pagination can take a while

/**
 * Cron endpoint that refreshes the SoftOne ITEM catalog cache.
 *
 * Protected by `CRON_SECRET` env var — caller must send
 * `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
 *
 * Wire it up in Coolify (or any external cron) to hit:
 *   curl -fsSL -H "Authorization: Bearer $CRON_SECRET" \
 *     https://project.dgsmart.gr/api/cron/softone-items-sync
 *
 * Recommended cadence: every 4-6 hours.
 *
 * GET and POST both work — GET so a simple HTTP-pinger works without body,
 * POST so it can be POST-only in stricter setups.
 */
async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured (or too short — minimum 16 chars).' },
      { status: 500 },
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const url = new URL(request.url);
  const qsSecret = url.searchParams.get('secret') ?? '';

  if (bearer !== expected && qsSecret !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncSoftoneItems();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
