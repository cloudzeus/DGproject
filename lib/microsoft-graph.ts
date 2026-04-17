const GRAPH = 'https://graph.microsoft.com/v1.0';

let cachedToken: { token: string; expiresAt: number } | null = null;

export type TenantUser = {
  id: string;
  displayName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
};

export class GraphError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export function graphIsConfigured(): boolean {
  return Boolean(
    process.env.TENANT_ID && process.env.APPLICATION_ID && process.env.CLIENT_SECRET_VALUE,
  );
}

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.APPLICATION_ID;
  const clientSecret = process.env.CLIENT_SECRET_VALUE;
  if (!tenantId || !clientId || !clientSecret) {
    throw new GraphError('Missing TENANT_ID / APPLICATION_ID / CLIENT_SECRET_VALUE.');
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Azure token error (${res.status}): ${body}`, res.status);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function getTenantInfo(): Promise<{ displayName: string; defaultDomain: string | null } | null> {
  try {
    const token = await getAppToken();
    const res = await fetch(`${GRAPH}/organization?$select=displayName,verifiedDomains`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      value: Array<{ displayName: string; verifiedDomains: Array<{ name: string; isDefault: boolean }> }>;
    };
    const org = data.value?.[0];
    if (!org) return null;
    const def = org.verifiedDomains?.find((d) => d.isDefault)?.name ?? org.verifiedDomains?.[0]?.name ?? null;
    return { displayName: org.displayName, defaultDomain: def };
  } catch {
    return null;
  }
}

export async function listTenantUsers(): Promise<TenantUser[]> {
  const token = await getAppToken();
  const select = [
    'id',
    'displayName',
    'userPrincipalName',
    'mail',
    'jobTitle',
    'department',
    'officeLocation',
    'accountEnabled',
  ].join(',');

  const users: TenantUser[] = [];
  let url: string | null = `${GRAPH}/users?$select=${select}&$top=100&$orderby=displayName`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GraphError(`Graph /users error (${res.status}): ${body}`, res.status);
    }
    const data = (await res.json()) as {
      value: Array<{
        id: string;
        displayName: string | null;
        userPrincipalName: string;
        mail: string | null;
        jobTitle: string | null;
        department: string | null;
        officeLocation: string | null;
        accountEnabled: boolean;
      }>;
      '@odata.nextLink'?: string;
    };
    for (const u of data.value) {
      if (u.accountEnabled === false) continue;
      const email = (u.mail ?? u.userPrincipalName ?? '').toLowerCase();
      if (!email) continue;
      users.push({
        id: u.id,
        displayName: u.displayName ?? email,
        email,
        jobTitle: u.jobTitle,
        department: u.department,
        officeLocation: u.officeLocation,
      });
    }
    url = data['@odata.nextLink'] ?? null;
  }

  return users;
}
