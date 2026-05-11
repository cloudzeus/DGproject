/**
 * MySQL → gzip → (optional AES-256-GCM) → Bunny Storage backup pipeline.
 *
 * Designed to be callable from:
 *   - scripts/backup-database.ts        (manual / system cron)
 *   - app/api/admin/backup-database     (HTTP-triggered cron)
 *   - tests
 *
 * Backups land at  `backups/db/<env>/<YYYY-MM-DD>/db-<timestamp>.sql.gz[.enc]`
 * inside the configured BUNNY_STORAGE_ZONE.
 *
 * SECURITY: backups contain sensitive data. DO NOT serve them via a public CDN
 * Pull Zone. Recommended: a dedicated Bunny Storage Zone for backups with no
 * Pull Zone attached. If you must reuse the existing zone, set
 * BACKUP_ENCRYPTION_KEY so files are encrypted at rest.
 */

import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import axios from 'axios';

export type BackupResult = {
  ok: true;
  path: string;             // path inside the Bunny storage zone
  sizeBytes: number;
  durationMs: number;
  encrypted: boolean;
  tableCount: number;
} | {
  ok: false;
  error: string;
  durationMs: number;
};

export type BackupOptions = {
  /** Subfolder under "backups/db/" — defaults to NODE_ENV. */
  envLabel?: string;
  /** When true, encrypt with AES-256-GCM using BACKUP_ENCRYPTION_KEY. Defaults to true if key is set. */
  encrypt?: boolean;
  /** mysqldump --single-transaction (default: true; safe for InnoDB without table locks). */
  singleTransaction?: boolean;
};

type ParsedDb = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

/** Parse the MySQL connection URL Prisma uses. */
function parseDatabaseUrl(url: string): ParsedDb {
  // mysql://user:pass@host:port/dbname?params
  const u = new URL(url);
  if (u.protocol !== 'mysql:' && u.protocol !== 'mysqls:') {
    throw new Error(`Unsupported DATABASE_URL protocol: ${u.protocol}`);
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '').split('?')[0],
  };
}

/**
 * Run mysqldump and return a Readable stream of the SQL bytes.
 * Uses MYSQL_PWD env var so the password is not in argv (visible to `ps`).
 */
function spawnMysqldump(db: ParsedDb, opts: BackupOptions) {
  const args = [
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--user=${db.user}`,
    '--default-character-set=utf8mb4',
    '--set-gtid-purged=OFF',
    '--no-tablespaces',           // avoids needing PROCESS privilege on managed DBs
    '--routines',                 // include stored procedures
    '--triggers',
    '--events',
    '--add-drop-table',
    '--quick',                    // stream rows, don't buffer entire table in RAM
    '--lock-tables=false',
  ];
  if (opts.singleTransaction !== false) args.push('--single-transaction');
  args.push(db.database);

  // Allow overriding the binary so we can avoid known issues like mysqldump 9.x
  // querying INFORMATION_SCHEMA.LIBRARIES against an 8.0 server. Set
  // MYSQLDUMP_BIN=/opt/homebrew/opt/mysql-client@8.0/bin/mysqldump on macOS.
  const binary = process.env.MYSQLDUMP_BIN || 'mysqldump';

  const child = spawn(binary, args, {
    env: { ...process.env, MYSQL_PWD: db.password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

/**
 * AES-256-GCM transform. Output framing:
 *   [16 bytes salt][12 bytes iv][16 bytes auth tag][... ciphertext ...]
 * Key derived from passphrase via scrypt (N=16384, r=8, p=1).
 *
 * To decrypt: see /scripts/restore-database.ts in MEETINGS_SOFTONE_SETUP.md
 * (or use: openssl enc -d ... not directly — this uses node crypto framing).
 */
function makeEncryptor(passphrase: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const pass = new PassThrough();
  // First emit salt + iv (we'll emit auth tag at end, prepended in a final buffer)
  pass.write(salt);
  pass.write(iv);

  // We'll write a placeholder for auth tag and replace at finalization via buffering.
  // Simpler: accumulate ciphertext and emit it after auth tag becomes available.
  const chunks: Buffer[] = [];
  cipher.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  cipher.on('end', () => {
    const tag = cipher.getAuthTag();
    pass.write(tag);
    for (const c of chunks) pass.write(c);
    pass.end();
  });

  // input → cipher (we expose `cipher` as the writable end)
  return { writable: cipher, readable: pass };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function backupDatabase(opts: BackupOptions = {}): Promise<BackupResult> {
  const start = Date.now();

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set.');
    }
    if (!process.env.BUNNY_ACCESS_KEY || !process.env.BUNNY_STORAGE_ZONE) {
      throw new Error('Bunny storage not configured (BUNNY_ACCESS_KEY, BUNNY_STORAGE_ZONE).');
    }

    const db = parseDatabaseUrl(process.env.DATABASE_URL);
    const passphrase = process.env.BACKUP_ENCRYPTION_KEY;
    const wantEncryption = opts.encrypt ?? Boolean(passphrase);
    if (wantEncryption && !passphrase) {
      throw new Error('encrypt=true but BACKUP_ENCRYPTION_KEY is not set.');
    }

    const dump = spawnMysqldump(db, opts);
    const gzip = createGzip({ level: 6 });

    // dump stdout → gzip → (optional encrypt) → buffer
    let pipeline: NodeJS.ReadableStream = dump.stdout!.pipe(gzip);

    if (wantEncryption && passphrase) {
      const { writable, readable } = makeEncryptor(passphrase);
      pipeline.pipe(writable);
      pipeline = readable;
    }

    // Collect stderr to give a useful error if dump fails
    const stderrChunks: Buffer[] = [];
    dump.stderr!.on('data', (c) => stderrChunks.push(c));

    const dataPromise = streamToBuffer(pipeline);
    const exitPromise = new Promise<number>((resolve) => dump.on('close', resolve));

    const [data, exitCode] = await Promise.all([dataPromise, exitPromise]);

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8').slice(0, 500);
      throw new Error(`mysqldump exited ${exitCode}: ${stderr}`);
    }

    const ts = new Date();
    const yyyyMmDd = ts.toISOString().slice(0, 10);
    const isoStamp = ts.toISOString().replace(/[:.]/g, '-');
    const envLabel = opts.envLabel ?? process.env.NODE_ENV ?? 'unknown';
    const ext = wantEncryption ? 'sql.gz.enc' : 'sql.gz';
    const filename = `db-${isoStamp}.${ext}`;
    const folder = `backups/db/${envLabel}/${yyyyMmDd}`;
    const uploadPath = `${folder}/${filename}`;

    // Prefer a dedicated backup zone (no public CDN attached). Falls back to the
    // shared zone with a warning logged.
    const zone = process.env.BUNNY_BACKUP_STORAGE_ZONE ?? process.env.BUNNY_STORAGE_ZONE!;
    const host = process.env.BUNNY_STORAGE_API_HOST ?? 'storage.bunnycdn.com';

    if (!process.env.BUNNY_BACKUP_STORAGE_ZONE) {
      console.warn(
        `[backup] WARNING: BUNNY_BACKUP_STORAGE_ZONE not set — uploading to the shared zone "${zone}". ` +
          `If this zone has a public Pull Zone, the backup may be accessible via the public CDN URL. ` +
          `Recommended: create a dedicated Storage Zone for backups with no Pull Zone.`,
      );
    }

    await axios.put(`https://${host}/${zone}/${uploadPath}`, data, {
      headers: {
        AccessKey: process.env.BUNNY_ACCESS_KEY!,
        'Content-Type': wantEncryption ? 'application/octet-stream' : 'application/gzip',
      },
      maxBodyLength: Infinity,
    });

    return {
      ok: true,
      path: uploadPath,
      sizeBytes: data.length,
      durationMs: Date.now() - start,
      encrypted: wantEncryption,
      // Rough heuristic: count CREATE TABLE lines after decompression.
      // We can't easily count without decompressing; leave 0 for now.
      tableCount: 0,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Retention — delete backup files older than N days.
//
// Lists files in the day-folders under backups/db/<env>/ and removes any whose
// folder date is older than retentionDays. Returns the list of deleted paths.
// ─────────────────────────────────────────────────────────────────────────

type BunnyListEntry = {
  ObjectName: string;
  Path: string;
  IsDirectory: boolean;
  LastChanged: string;
};

export type RetentionResult = {
  scannedFolders: number;
  deletedFiles: string[];
  errors: string[];
};

export async function pruneOldBackups(retentionDays: number, envLabel?: string): Promise<RetentionResult> {
  const zone = process.env.BUNNY_BACKUP_STORAGE_ZONE ?? process.env.BUNNY_STORAGE_ZONE!;
  const accessKey = process.env.BUNNY_ACCESS_KEY!;
  const host = process.env.BUNNY_STORAGE_API_HOST ?? 'storage.bunnycdn.com';
  const env = envLabel ?? process.env.NODE_ENV ?? 'unknown';

  const baseDir = `backups/db/${env}/`;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result: RetentionResult = { scannedFolders: 0, deletedFiles: [], errors: [] };

  // Bunny Storage list endpoint
  const listUrl = `https://${host}/${zone}/${baseDir}`;
  let entries: BunnyListEntry[];
  try {
    const res = await axios.get(listUrl, { headers: { AccessKey: accessKey } });
    entries = (res.data as BunnyListEntry[]) ?? [];
  } catch (err) {
    result.errors.push(`list ${baseDir}: ${(err as Error).message}`);
    return result;
  }

  for (const dayFolder of entries) {
    if (!dayFolder.IsDirectory) continue;
    result.scannedFolders += 1;

    // Folder name is YYYY-MM-DD
    const folderDate = Date.parse(dayFolder.ObjectName);
    if (Number.isNaN(folderDate) || folderDate >= cutoff) continue;

    // List files inside this old folder
    const dayUrl = `https://${host}/${zone}/${baseDir}${dayFolder.ObjectName}/`;
    let dayFiles: BunnyListEntry[];
    try {
      const r = await axios.get(dayUrl, { headers: { AccessKey: accessKey } });
      dayFiles = (r.data as BunnyListEntry[]) ?? [];
    } catch (err) {
      result.errors.push(`list ${dayFolder.ObjectName}: ${(err as Error).message}`);
      continue;
    }

    for (const f of dayFiles) {
      if (f.IsDirectory) continue;
      const fileUrl = `https://${host}/${zone}/${baseDir}${dayFolder.ObjectName}/${f.ObjectName}`;
      try {
        await axios.delete(fileUrl, { headers: { AccessKey: accessKey } });
        result.deletedFiles.push(`${baseDir}${dayFolder.ObjectName}/${f.ObjectName}`);
      } catch (err) {
        result.errors.push(`delete ${f.ObjectName}: ${(err as Error).message}`);
      }
    }
  }

  return result;
}
