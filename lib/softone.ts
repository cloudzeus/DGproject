import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';

const SESSION_FILE = path.join(process.cwd(), '.s1session.json');

/**
 * Read an env var supporting both naming conventions used in this project:
 *   - `S1_FOO`        (canonical / current code)
 *   - `SOFTONE_FOO`   (legacy / pre-existing .env entries)
 *
 * Returns the first non-empty value. This lets the same .env work whether
 * the SoftOne credentials were added before or after the unification.
 */
function s1Env(key: 'SERIAL' | 'USERNAME' | 'PASSWORD' | 'APP_ID' | 'COMPANY' | 'BRANCH' | 'MODULE' | 'REFID'): string | undefined {
  const aliases: Record<typeof key, string[]> = {
    SERIAL:   ['S1_SERIAL', 'SOFTONE_SERIAL', 'SOFTWARE_SERIAL'],
    USERNAME: ['S1_USERNAME', 'SOFTONE_USERNAME'],
    PASSWORD: ['S1_PASSWORD', 'SOFTONE_PASSWORD'],
    APP_ID:   ['S1_APP_ID', 'SOFTONE_APP_ID'],
    COMPANY:  ['S1_COMPANY', 'SOFTONE_COMPANY'],
    BRANCH:   ['S1_BRANCH', 'SOFTONE_BRANCH'],
    MODULE:   ['S1_MODULE', 'SOFTONE_MODULE'],
    REFID:    ['S1_REFID', 'SOFTONE_REFID'],
  } as const;
  for (const name of aliases[key]) {
    const v = process.env[name];
    if (v && v.trim()) return v;
  }
  return undefined;
}

function baseUrl(): string {
  const serial = s1Env('SERIAL');
  if (!serial) throw new Error('S1_SERIAL (or SOFTONE_SERIAL / SOFTWARE_SERIAL) is not set.');
  return `https://${serial}.oncloud.gr/s1services`;
}

function appId(): string {
  const id = s1Env('APP_ID');
  if (!id) throw new Error('S1_APP_ID (or SOFTONE_APP_ID) is not set.');
  return id;
}

export function softoneIsConfigured(): boolean {
  return Boolean(
    s1Env('SERIAL') &&
      s1Env('USERNAME') &&
      s1Env('PASSWORD') &&
      s1Env('APP_ID') &&
      s1Env('COMPANY') &&
      s1Env('BRANCH') &&
      s1Env('MODULE') &&
      s1Env('REFID'),
  );
}

/** List any required SoftOne env vars that are still missing — useful for clear setup errors. */
export function softoneMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!s1Env('SERIAL')) missing.push('S1_SERIAL or SOFTONE_SERIAL');
  if (!s1Env('USERNAME')) missing.push('S1_USERNAME or SOFTONE_USERNAME');
  if (!s1Env('PASSWORD')) missing.push('S1_PASSWORD or SOFTONE_PASSWORD');
  if (!s1Env('APP_ID')) missing.push('S1_APP_ID or SOFTONE_APP_ID');
  if (!s1Env('COMPANY')) missing.push('S1_COMPANY or SOFTONE_COMPANY');
  if (!s1Env('BRANCH')) missing.push('S1_BRANCH or SOFTONE_BRANCH');
  if (!s1Env('MODULE')) missing.push('S1_MODULE or SOFTONE_MODULE');
  if (!s1Env('REFID')) missing.push('S1_REFID or SOFTONE_REFID');
  return missing;
}

async function s1Fetch(body: object): Promise<any> {
  const res = await fetch(baseUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const buffer = await res.arrayBuffer();
  return JSON.parse(iconv.decode(Buffer.from(buffer), 'win1253'));
}

function loadSession(): string | null {
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (s.date === new Date().toISOString().slice(0, 10)) return s.clientID;
  } catch {}
  return null;
}

function saveSession(clientID: string) {
  try {
    fs.writeFileSync(
      SESSION_FILE,
      JSON.stringify({ clientID, date: new Date().toISOString().slice(0, 10) }),
    );
  } catch {
    // Non-fatal; the session will just be re-requested next time.
  }
}

async function authenticate(): Promise<string> {
  const login = await s1Fetch({
    SERVICE: 'Login',
    USERNAME: s1Env('USERNAME'),
    PASSWORD: s1Env('PASSWORD'),
    APPID: appId(),
    VERSION: '2',
  });
  if (!login.success) throw new Error(`SoftOne Login: ${login.error ?? 'unknown error'}`);

  const auth = await s1Fetch({
    service: 'authenticate',
    clientID: login.clientID,
    COMPANY: s1Env('COMPANY'),
    BRANCH: s1Env('BRANCH'),
    MODULE: s1Env('MODULE'),
    REFID: s1Env('REFID'),
    VERSION: '2',
  });
  if (!auth.success) throw new Error(`SoftOne Auth: ${auth.error ?? 'unknown error'}`);

  saveSession(auth.clientID);
  return auth.clientID;
}

async function getClientId(): Promise<string> {
  return loadSession() ?? authenticate();
}

export async function s1(service: string, params: Record<string, unknown> = {}): Promise<any> {
  const clientID = await getClientId();
  const data = await s1Fetch({ service, clientID, appId: appId(), VERSION: '2', ...params });
  if (!data.success && (data.errorcode === -101 || data.errorcode === -100)) {
    fs.rmSync(SESSION_FILE, { force: true });
    const newClientId = await authenticate();
    return s1Fetch({ service, clientID: newClientId, appId: appId(), VERSION: '2', ...params });
  }
  return data;
}

export type SoftOneStatus = {
  ok: boolean;
  clientId?: string;
  sessionCached: boolean;
  serial?: string;
  company?: string;
  error?: string;
};

export async function testSoftOneConnection(): Promise<SoftOneStatus> {
  const missing = softoneMissingEnvVars();
  if (missing.length > 0) {
    return {
      ok: false,
      sessionCached: false,
      error: `Λείπουν μεταβλητές περιβάλλοντος: ${missing.join(', ')}`,
    };
  }
  try {
    const cached = loadSession();
    const clientID = cached ?? (await authenticate());
    return {
      ok: true,
      clientId: clientID.slice(0, 8) + '…',
      sessionCached: Boolean(cached),
      serial: s1Env('SERIAL'),
      company: s1Env('COMPANY'),
    };
  } catch (e) {
    return {
      ok: false,
      sessionCached: false,
      error: e instanceof Error ? e.message : 'Unknown SoftOne error',
    };
  }
}

export function clearSoftOneSession(): void {
  try {
    fs.rmSync(SESSION_FILE, { force: true });
  } catch {}
}
