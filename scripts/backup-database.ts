/**
 * Manual / system-cron entry point for database backups.
 *
 * Usage:
 *   npx tsx scripts/backup-database.ts                 # backup only
 *   npx tsx scripts/backup-database.ts --prune 14      # backup + prune backups older than 14 days
 *   RETENTION_DAYS=30 npx tsx scripts/backup-database.ts --prune
 *
 * Exits with code 0 on success, non-zero on failure (so cron sees failures).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

// Dynamic import so env vars are populated BEFORE the bunnycdn module
// captures process.env.BUNNY_STORAGE_API_HOST at module-init time.
async function main() {
  const { backupDatabase, pruneOldBackups } = await import('../lib/db-backup');
  const args = process.argv.slice(2);
  const pruneIdx = args.indexOf('--prune');
  const wantPrune = pruneIdx !== -1;
  const retentionDays = wantPrune
    ? Number(args[pruneIdx + 1] ?? process.env.RETENTION_DAYS ?? 14)
    : null;

  console.log(`[backup] starting (encryption=${Boolean(process.env.BACKUP_ENCRYPTION_KEY)})`);
  const result = await backupDatabase();

  if (!result.ok) {
    console.error(`[backup] ❌ ${result.error}  (${result.durationMs}ms)`);
    process.exit(1);
  }

  const mb = (result.sizeBytes / 1024 / 1024).toFixed(2);
  console.log(
    `[backup] ✅ ${result.path}  ${mb} MB  ${result.durationMs}ms${
      result.encrypted ? '  encrypted' : '  UNENCRYPTED'
    }`,
  );

  if (wantPrune && retentionDays && retentionDays > 0) {
    console.log(`[prune] removing backups older than ${retentionDays} days…`);
    const pruneResult = await pruneOldBackups(retentionDays);
    console.log(
      `[prune] scanned ${pruneResult.scannedFolders} folders, deleted ${pruneResult.deletedFiles.length} files`,
    );
    if (pruneResult.errors.length > 0) {
      console.warn(`[prune] ⚠ ${pruneResult.errors.length} errors:`);
      pruneResult.errors.forEach((e) => console.warn(`  - ${e}`));
    }
  }
}

main().catch((err) => {
  console.error('[backup] fatal:', err);
  process.exit(1);
});
