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

// ─────────────────────────── Calendar sync ──────────────────────────

const DEFAULT_TZ = process.env.GRAPH_CALENDAR_TIMEZONE ?? 'Europe/Athens';

export type CalendarAttendee = { email: string; name?: string };

export type TaskCalendarEvent = {
  subject: string;
  bodyHtml: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  attendees: CalendarAttendee[];
  categories?: string[];
};

function toGraphLocalDateTime(d: Date, allDay: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  if (allDay) return `${y}-${m}-${day}T00:00:00`;
  return `${y}-${m}-${day}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function buildEventBody(event: TaskCalendarEvent) {
  return {
    subject: event.subject,
    body: { contentType: 'HTML', content: event.bodyHtml },
    start: { dateTime: toGraphLocalDateTime(event.startDate, event.isAllDay), timeZone: DEFAULT_TZ },
    end: { dateTime: toGraphLocalDateTime(event.endDate, event.isAllDay), timeZone: DEFAULT_TZ },
    isAllDay: event.isAllDay,
    isReminderOn: true,
    reminderMinutesBeforeStart: event.isAllDay ? 18 * 60 : 60,
    categories: event.categories,
    attendees: event.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: 'required',
    })),
  };
}

async function graphFetch(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<Response> {
  const token = await getAppToken();
  return fetch(`${GRAPH}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
}

export async function createCalendarEvent(
  organizer: string,
  event: TaskCalendarEvent,
): Promise<string> {
  const res = await graphFetch(`/users/${encodeURIComponent(organizer)}/events`, {
    method: 'POST',
    body: buildEventBody(event),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph create event failed (${res.status}): ${body}`, res.status);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateCalendarEvent(
  organizer: string,
  eventId: string,
  event: TaskCalendarEvent,
): Promise<void> {
  const res = await graphFetch(
    `/users/${encodeURIComponent(organizer)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: buildEventBody(event) },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph update event failed (${res.status}): ${body}`, res.status);
  }
}

export async function deleteCalendarEvent(organizer: string, eventId: string): Promise<void> {
  const res = await graphFetch(
    `/users/${encodeURIComponent(organizer)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph delete event failed (${res.status}): ${body}`, res.status);
  }
}

export type GraphUserPhoto = {
  buffer: Buffer;
  contentType: string;
};

export async function getUserPhoto(userKey: string): Promise<GraphUserPhoto | null> {
  const token = await getAppToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(userKey)}/photo/$value`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph photo failed (${res.status}): ${body}`, res.status);
  }
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

export type UserCalendarEvent = {
  id: string;
  subject: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location: string | null;
  organizerName: string | null;
  webLink: string | null;
  categories: string[];
};

export async function listUserCalendarEvents(
  userKey: string,
  startISO: string,
  endISO: string,
): Promise<UserCalendarEvent[]> {
  const token = await getAppToken();
  const select = ['id', 'subject', 'start', 'end', 'isAllDay', 'location', 'organizer', 'webLink', 'categories'].join(',');
  const url =
    `${GRAPH}/users/${encodeURIComponent(userKey)}/calendarView` +
    `?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}` +
    `&$select=${select}&$orderby=start/dateTime&$top=200`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: `outlook.timezone="${DEFAULT_TZ}"`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph calendarView failed (${res.status}): ${body}`, res.status);
  }
  const data = (await res.json()) as {
    value: Array<{
      id: string;
      subject: string | null;
      start: { dateTime: string };
      end: { dateTime: string };
      isAllDay: boolean;
      location: { displayName: string | null } | null;
      organizer: { emailAddress: { name: string | null } } | null;
      webLink: string | null;
      categories: string[] | null;
    }>;
  };

  return data.value.map((e) => ({
    id: e.id,
    subject: e.subject ?? '(no subject)',
    start: new Date(e.start.dateTime),
    end: new Date(e.end.dateTime),
    isAllDay: e.isAllDay,
    location: e.location?.displayName ?? null,
    organizerName: e.organizer?.emailAddress?.name ?? null,
    webLink: e.webLink,
    categories: e.categories ?? [],
  }));
}
