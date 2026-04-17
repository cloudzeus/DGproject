import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';

const SESSION_FILE = path.join(process.cwd(), '.s1session.json');

function baseUrl(): string {
  const serial = process.env.S1_SERIAL;
  if (!serial) throw new Error('S1_SERIAL is not set.');
  return `https://${serial}.oncloud.gr/s1services`;
}

function appId(): string {
  const id = process.env.S1_APP_ID;
  if (!id) throw new Error('S1_APP_ID is not set.');
  return id;
}

export function softoneIsConfigured(): boolean {
  return Boolean(
    process.env.S1_SERIAL &&
      process.env.S1_USERNAME &&
      process.env.S1_PASSWORD &&
      process.env.S1_APP_ID &&
      process.env.S1_COMPANY &&
      process.env.S1_BRANCH &&
      process.env.S1_MODULE &&
      process.env.S1_REFID,
  );
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
    USERNAME: process.env.S1_USERNAME,
    PASSWORD: process.env.S1_PASSWORD,
    APPID: appId(),
    VERSION: '2',
  });
  if (!login.success) throw new Error(`SoftOne Login: ${login.error ?? 'unknown error'}`);

  const auth = await s1Fetch({
    service: 'authenticate',
    clientID: login.clientID,
    COMPANY: process.env.S1_COMPANY,
    BRANCH: process.env.S1_BRANCH,
    MODULE: process.env.S1_MODULE,
    REFID: process.env.S1_REFID,
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
  if (!softoneIsConfigured()) {
    return {
      ok: false,
      sessionCached: false,
      error:
        'Λείπουν μεταβλητές περιβάλλοντος. Απαιτούνται: S1_SERIAL, S1_USERNAME, S1_PASSWORD, S1_APP_ID, S1_COMPANY, S1_BRANCH, S1_MODULE, S1_REFID.',
    };
  }
  try {
    const cached = loadSession();
    const clientID = cached ?? (await authenticate());
    return {
      ok: true,
      clientId: clientID.slice(0, 8) + '…',
      sessionCached: Boolean(cached),
      serial: process.env.S1_SERIAL,
      company: process.env.S1_COMPANY,
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
