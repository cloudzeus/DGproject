import { NextRequest, NextResponse } from 'next/server';
import { backupDatabase, pruneOldBackups } from '@/lib/db-backup';

/**
 * Cron-callable backup endpoint. Accepts both GET (Vercel Cron) and POST
 * (external schedulers like cron-job.org).
 *
 * Authentication — any one of:
 *   - Header `X-Backup-Token: <BACKUP_SECRET_TOKEN>` (recommended for external cron)
 *   - Header `Authorization: Bearer <CRON_SECRET>`   (Vercel Cron, automatic)
 *
 * Optional query: ?prune=14  → also remove backups older than 14 days.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const backupToken = process.env.BACKUP_SECRET_TOKEN;
  const cronSecret = process.env.CRON_SECRET;

  if (!backupToken && !cronSecret) {
    return NextResponse.json(
      { error: 'Neither BACKUP_SECRET_TOKEN nor CRON_SECRET is configured on the server.' },
      { status: 500 },
    );
  }

  const headerToken = req.headers.get('x-backup-token');
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const authorized =
    (backupToken && headerToken === backupToken) ||
    (cronSecret && bearerToken === cronSecret);

  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const pruneDays = url.searchParams.get('prune');

  const result = await backupDatabase();
  if (!result.ok) {
    console.error('[cron-backup] failed:', result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  let pruneSummary: object | null = null;
  if (pruneDays) {
    const days = Number(pruneDays);
    if (Number.isFinite(days) && days > 0) {
      const p = await pruneOldBackups(days);
      pruneSummary = {
        scannedFolders: p.scannedFolders,
        deletedFiles: p.deletedFiles.length,
        errors: p.errors,
      };
    }
  }

  console.log(`[cron-backup] ok ${result.path} ${result.sizeBytes}B ${result.durationMs}ms`);

  return NextResponse.json({
    ok: true,
    path: result.path,
    sizeBytes: result.sizeBytes,
    durationMs: result.durationMs,
    encrypted: result.encrypted,
    prune: pruneSummary,
  });
}

export const GET = handle;
export const POST = handle;
