import { prisma } from './prisma';

const MAILGUN_KEYS = [
  'mailgun.apiKey',
  'mailgun.domain',
  'mailgun.region',
  'mailgun.fromEmail',
  'mailgun.fromName',
] as const;

export type MailgunRegion = 'us' | 'eu';

export type MailgunConfig = {
  apiKey: string;
  domain: string;
  region: MailgunRegion;
  fromEmail: string;
  fromName: string | null;
  // Whether the API key was sourced from DB vs env (admins should know if env is overriding their UI input)
  source: {
    apiKey: 'db' | 'env' | 'none';
    domain: 'db' | 'env' | 'none';
    region: 'db' | 'env' | 'default';
    fromEmail: 'db' | 'env' | 'derived' | 'none';
    fromName: 'db' | 'env' | 'none';
  };
};

export async function getSettings(keys: readonly string[]): Promise<Record<string, string | null>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = null;
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSettings(values: Record<string, string | null>): Promise<void> {
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  await prisma.$transaction(
    entries.map(([key, value]) =>
      value === null
        ? // deleteMany succeeds whether or not the row exists — safe inside a transaction
          prisma.appSetting.deleteMany({ where: { key } })
        : prisma.appSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          }),
    ),
  );
}

export async function getMailgunConfig(): Promise<MailgunConfig> {
  const stored = await getSettings(MAILGUN_KEYS);

  const dbApiKey = stored['mailgun.apiKey'];
  const dbDomain = stored['mailgun.domain'];
  const dbRegion = stored['mailgun.region'];
  const dbFromEmail = stored['mailgun.fromEmail'];
  const dbFromName = stored['mailgun.fromName'];

  const envApiKey = process.env.MAILGUN_API_KEY ?? '';
  const envDomain = process.env.MAILGUN_DOMAIN ?? '';
  const envRegionRaw = (process.env.MAILGUN_REGION ?? '').toLowerCase();
  const envRegion: MailgunRegion | null =
    envRegionRaw === 'eu' ? 'eu' : envRegionRaw === 'us' ? 'us' : null;
  const envFromEmail = process.env.MAILGUN_FROM ?? '';
  const envFromName = process.env.MAILGUN_FROM_NAME ?? '';

  const apiKey = dbApiKey ?? envApiKey;
  const domain = dbDomain ?? envDomain;
  const region: MailgunRegion =
    dbRegion === 'eu' ? 'eu' : dbRegion === 'us' ? 'us' : envRegion ?? 'us';
  const fromEmail =
    dbFromEmail && dbFromEmail.length > 0
      ? dbFromEmail
      : envFromEmail && envFromEmail.length > 0
      ? envFromEmail
      : domain
      ? `noreply@${domain}`
      : '';
  const fromName = dbFromName ?? (envFromName.length > 0 ? envFromName : null);

  return {
    apiKey,
    domain,
    region,
    fromEmail,
    fromName,
    source: {
      apiKey: dbApiKey ? 'db' : envApiKey ? 'env' : 'none',
      domain: dbDomain ? 'db' : envDomain ? 'env' : 'none',
      region: dbRegion === 'eu' || dbRegion === 'us' ? 'db' : envRegion ? 'env' : 'default',
      fromEmail:
        dbFromEmail && dbFromEmail.length > 0
          ? 'db'
          : envFromEmail && envFromEmail.length > 0
          ? 'env'
          : domain
          ? 'derived'
          : 'none',
      fromName: dbFromName ? 'db' : envFromName ? 'env' : 'none',
    },
  };
}

export type MailgunUpdateInput = {
  apiKey?: string | null; // null = clear DB override; undefined = leave as-is
  domain?: string | null;
  region?: MailgunRegion;
  fromEmail?: string | null;
  fromName?: string | null;
};

export async function updateMailgunSettings(input: MailgunUpdateInput): Promise<void> {
  const updates: Record<string, string | null> = {};
  if (input.apiKey !== undefined) {
    updates['mailgun.apiKey'] = input.apiKey && input.apiKey.length > 0 ? input.apiKey : null;
  }
  if (input.domain !== undefined) {
    updates['mailgun.domain'] = input.domain && input.domain.length > 0 ? input.domain : null;
  }
  if (input.region !== undefined) {
    updates['mailgun.region'] = input.region;
  }
  if (input.fromEmail !== undefined) {
    updates['mailgun.fromEmail'] = input.fromEmail && input.fromEmail.length > 0 ? input.fromEmail : null;
  }
  if (input.fromName !== undefined) {
    updates['mailgun.fromName'] = input.fromName && input.fromName.length > 0 ? input.fromName : null;
  }
  if (Object.keys(updates).length === 0) return;
  await setSettings(updates);
}
