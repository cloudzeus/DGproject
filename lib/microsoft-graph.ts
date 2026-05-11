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

/**
 * Microsoft Teams channel post.
 *
 * Channel identifier format: "{teamId}/channels/{channelId}" — same shape produced
 * by Graph's getAllChannels / Teams deep links. We split it apart here so callers
 * can store a single string on the project.
 */
function splitChannelKey(channelKey: string): { teamId: string; channelId: string } | null {
  // Accept either "teamId/channels/channelId" or "teamId|channelId".
  const slash = channelKey.match(/^([^/]+)\/channels\/(.+)$/);
  if (slash) return { teamId: slash[1], channelId: slash[2] };
  const pipe = channelKey.split('|');
  if (pipe.length === 2 && pipe[0] && pipe[1]) return { teamId: pipe[0], channelId: pipe[1] };
  return null;
}

type ChannelMessageInput = { contentHtml: string; subject?: string };

export async function postTeamsChannelMessage(
  channelKey: string,
  message: ChannelMessageInput,
): Promise<string> {
  const parts = splitChannelKey(channelKey);
  if (!parts) throw new GraphError('Invalid teamsChannelId format. Expected "teamId/channels/channelId".');
  const { teamId, channelId } = parts;
  const body: Record<string, unknown> = {
    body: { contentType: 'html', content: message.contentHtml },
  };
  if (message.subject) body.subject = message.subject;
  const res = await graphFetch(
    `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
    { method: 'POST', body },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph postTeamsChannelMessage failed (${res.status}): ${text}`, res.status);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateTeamsChannelMessage(
  channelKey: string,
  messageId: string,
  message: ChannelMessageInput,
): Promise<void> {
  const parts = splitChannelKey(channelKey);
  if (!parts) throw new GraphError('Invalid teamsChannelId format.');
  const { teamId, channelId } = parts;
  const body: Record<string, unknown> = {
    body: { contentType: 'html', content: message.contentHtml },
  };
  if (message.subject) body.subject = message.subject;
  const res = await graphFetch(
    `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'PATCH', body },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph updateTeamsChannelMessage failed (${res.status}): ${text}`, res.status);
  }
}

/**
 * Teams disallows hard-deleting messages via Graph; we soft-delete by editing the body.
 */
export async function softDeleteTeamsChannelMessage(channelKey: string, messageId: string): Promise<void> {
  await updateTeamsChannelMessage(channelKey, messageId, {
    contentHtml: '<i style="color:#9E9E9E">Η εργασία διαγράφηκε από το A-Sisyphus.</i>',
  });
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

// ─────────────────────────────────────────────────────────────────────────
// Online meetings & transcripts
//
// These endpoints power the meeting-intelligence pipeline:
//   1. Create a Teams meeting tied to a project (for scheduled team syncs)
//   2. Pull transcripts after the meeting ends
//
// Required Graph application permissions (admin consent required):
//   - OnlineMeetings.ReadWrite.All        (createOnlineMeeting)
//   - OnlineMeetingTranscript.Read.All    (listTranscripts, getTranscriptContent)
// ─────────────────────────────────────────────────────────────────────────

export type OnlineMeetingInput = {
  /** Organizer's user principal name or id (the meeting is created on their behalf). */
  organizer: string;
  subject: string;
  startDateTime: Date;
  endDateTime: Date;
  /** Whether to record automatically (requires tenant policy + license). */
  recordAutomatically?: boolean;
  /** Whether transcription is allowed during the meeting. */
  allowTranscription?: boolean;
};

export type OnlineMeeting = {
  id: string;
  joinUrl: string;
  joinWebUrl: string | null;
  subject: string | null;
};

export async function createOnlineMeeting(input: OnlineMeetingInput): Promise<OnlineMeeting> {
  const organizerId = input.organizer.includes('@')
    ? await getUserObjectId(input.organizer)
    : input.organizer;

  const body: Record<string, unknown> = {
    subject: input.subject,
    startDateTime: input.startDateTime.toISOString(),
    endDateTime: input.endDateTime.toISOString(),
    allowMeetingChat: 'enabled',
    allowTeamworkReactions: true,
  };
  if (input.recordAutomatically) body.recordAutomatically = true;
  if (input.allowTranscription) body.allowTranscription = true;

  const res = await graphFetch(`/users/${organizerId}/onlineMeetings`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph createOnlineMeeting failed (${res.status}): ${text}`, res.status);
  }
  const data = (await res.json()) as {
    id: string;
    joinUrl: string;
    joinWebUrl?: string;
    subject?: string;
  };
  return {
    id: data.id,
    joinUrl: data.joinUrl,
    joinWebUrl: data.joinWebUrl ?? null,
    subject: data.subject ?? null,
  };
}

/** A transcript record returned by the Graph API. */
export type MeetingTranscriptMeta = {
  id: string;
  meetingId: string;
  createdDateTime: string;
  /** URL to fetch the transcript content. */
  transcriptContentUrl: string;
};

/**
 * List all transcripts that exist for a given onlineMeeting.
 * Most meetings will have one — but a long meeting may have several.
 */
export async function listMeetingTranscripts(
  organizer: string,
  meetingId: string,
): Promise<MeetingTranscriptMeta[]> {
  const organizerId = organizer.includes('@') ? await getUserObjectId(organizer) : organizer;
  const res = await graphFetch(
    `/users/${organizerId}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph listTranscripts failed (${res.status}): ${text}`, res.status);
  }
  const data = (await res.json()) as {
    value: Array<{ id: string; meetingId: string; createdDateTime: string; transcriptContentUrl: string }>;
  };
  return data.value;
}

/**
 * Download transcript content as VTT text. Graph returns it as text/vtt by default
 * but supports ?$format=text/vtt for explicitness.
 */
export async function getMeetingTranscriptVtt(
  organizer: string,
  meetingId: string,
  transcriptId: string,
): Promise<string> {
  const organizerId = organizer.includes('@') ? await getUserObjectId(organizer) : organizer;
  const token = await getAppToken();
  const url = `${GRAPH}/users/${organizerId}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content?$format=text/vtt`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph getTranscriptContent failed (${res.status}): ${text}`, res.status);
  }
  return await res.text();
}

/**
 * Resolve a Teams join URL to its onlineMeeting id (so we can then fetch transcripts).
 *
 * Tries two strategies in order:
 *   1. Direct $filter on JoinWebUrl  — works for canonical `teams.microsoft.com/l/meetup-join/…` URLs.
 *   2. $filter on VideoTeleconferenceId — works for the new `teams.microsoft.com/meet/{id}?p=…`
 *      "Teams Meet" instant-meeting URLs, where `{id}` is the numeric meeting code.
 *
 * NOTE: $filter on onlineMeetings requires the meeting to belong to the organizer
 * whose userId we pass.
 */
export async function getOnlineMeetingByJoinUrl(
  organizer: string,
  joinWebUrl: string,
): Promise<OnlineMeeting | null> {
  // Strategy 1: direct JoinWebUrl match
  const direct = await findOnlineMeeting(organizer, `JoinWebUrl eq '${joinWebUrl.replace(/'/g, "''")}'`);
  if (direct) return direct;

  // Strategy 2: parse the meet-link numeric id and filter by VideoTeleconferenceId
  const meetCode = parseTeamsMeetCode(joinWebUrl);
  if (meetCode) {
    const byCode = await findOnlineMeeting(
      organizer,
      `VideoTeleconferenceId eq '${meetCode.replace(/'/g, "''")}'`,
    );
    if (byCode) return byCode;
  }

  return null;
}

/** Extract the numeric meeting id from a Teams Meet URL: `…/meet/379735249717224?p=…`. */
function parseTeamsMeetCode(url: string): string | null {
  const m = url.match(/teams\.microsoft\.com\/meet\/(\d+)/i);
  return m ? m[1] : null;
}

async function findOnlineMeeting(
  organizer: string,
  filter: string,
): Promise<OnlineMeeting | null> {
  const organizerId = organizer.includes('@') ? await getUserObjectId(organizer) : organizer;
  const path = `/users/${organizerId}/onlineMeetings?$filter=${encodeURIComponent(filter)}`;
  const res = await graphFetch(path, { method: 'GET' });
  if (!res.ok) {
    // 404 / 400 on a single strategy just means "no match here"; surface other errors.
    if (res.status === 404 || res.status === 400) return null;
    const text = await res.text().catch(() => '');
    throw new GraphError(`Graph onlineMeetings $filter failed (${res.status}): ${text}`, res.status);
  }
  const data = (await res.json()) as {
    value?: Array<{ id: string; joinUrl: string; joinWebUrl?: string; subject?: string }>;
  };
  const m = data.value?.[0];
  if (!m) return null;
  return {
    id: m.id,
    joinUrl: m.joinUrl,
    joinWebUrl: m.joinWebUrl ?? null,
    subject: m.subject ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// VTT parser
// Teams transcripts come as WEBVTT with speaker tags. Format:
//
//     WEBVTT
//
//     00:00:01.520 --> 00:00:04.230
//     <v Γιάννης Κοζύρης>Καλημέρα σε όλους</v>
//
//     00:00:04.500 --> 00:00:09.110
//     <v Νίκος Μάλιακκας>Καλημέρα Γιάννη, ας ξεκινήσουμε με το report</v>
// ─────────────────────────────────────────────────────────────────────────

export type ParsedTranscriptSegment = {
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
};

const VTT_TIMESTAMP_RE =
  /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

function vttTimeToSec(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseVtt(vtt: string): ParsedTranscriptSegment[] {
  const lines = vtt.split(/\r?\n/);
  const segments: ParsedTranscriptSegment[] = [];

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(VTT_TIMESTAMP_RE);
    if (!m) {
      i++;
      continue;
    }
    const startSec = vttTimeToSec(m[1], m[2], m[3], m[4]);
    const endSec = vttTimeToSec(m[5], m[6], m[7], m[8]);

    // Collect text lines until next blank line
    const textLines: string[] = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    const rawText = textLines.join(' ').trim();
    const speakerMatch = rawText.match(/^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/);

    let speaker = 'Unknown';
    let text = rawText;
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      text = speakerMatch[2].replace(/<\/?v[^>]*>/g, '').trim();
    }

    if (text) segments.push({ speaker, startSec, endSec, text });
    i++;
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────
// Tenant-wide discovery: list all recent transcripts and recordings.
//
// Graph exposes two "getAll" functions on /communications/onlineMeetings
// that enumerate transcripts/recordings across an organizer's meetings:
//
//   GET /communications/onlineMeetings/getAllTranscripts(
//         meetingOrganizerUserId='{userId}',
//         startDateTime='{iso}',
//         endDateTime='{iso}'
//       )
//
// `userId` here MUST be the AAD object id (NOT a userPrincipalName / email).
// We resolve email → id via /users/{upn}?$select=id first.
//
// Required permissions:
//   - OnlineMeetingTranscript.Read.All  (transcripts)
//   - OnlineMeetingRecording.Read.All   (recordings)
// + per-organizer application access policy granted in Teams.
// ─────────────────────────────────────────────────────────────────────────

export type RecentTranscriptInfo = {
  transcriptId: string;
  meetingId: string;
  createdDateTime: string;
  transcriptContentUrl: string;
  meetingOrganizerUserId: string;
};

export type RecentRecordingInfo = {
  recordingId: string;
  meetingId: string;
  createdDateTime: string;
  recordingContentUrl: string;
  meetingOrganizerUserId: string;
};

/**
 * Resolve a userPrincipalName (email) to the AAD object id.
 * The `getAllTranscripts` function requires an object id, not a UPN.
 */
export async function getUserObjectId(upn: string): Promise<string> {
  const token = await getAppToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(upn)}?$select=id`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph user lookup failed (${res.status}): ${body}`, res.status);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function listAllTranscripts(
  organizerUpnOrId: string,
  startDateTime: Date,
  endDateTime: Date,
): Promise<RecentTranscriptInfo[]> {
  const organizerId = organizerUpnOrId.includes('@')
    ? await getUserObjectId(organizerUpnOrId)
    : organizerUpnOrId;

  // Graph v1.0 path: function lives under /users/{id}/onlineMeetings — NOT /communications.
  // Date params must be wrapped in single quotes inside the function call.
  const start = startDateTime.toISOString();
  const end = endDateTime.toISOString();
  // Note: dates are DateTimeOffset literals (no quotes), but userId IS a string literal (quoted).
  const params = `meetingOrganizerUserId='${organizerId}',startDateTime=${start},endDateTime=${end}`;
  const path = `/users/${organizerId}/onlineMeetings/getAllTranscripts(${params})`;

  const all: RecentTranscriptInfo[] = [];
  let url: string | null = `${GRAPH}${path}`;

  while (url) {
    const token = await getAppToken();
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GraphError(
        `Graph getAllTranscripts failed (${res.status}): ${body}`,
        res.status,
      );
    }
    const data = (await res.json()) as {
      value: Array<{
        id: string;
        meetingId: string;
        createdDateTime: string;
        transcriptContentUrl: string;
        meetingOrganizer?: { user?: { id: string } };
      }>;
      '@odata.nextLink'?: string;
    };
    for (const t of data.value ?? []) {
      all.push({
        transcriptId: t.id,
        meetingId: t.meetingId,
        createdDateTime: t.createdDateTime,
        transcriptContentUrl: t.transcriptContentUrl,
        meetingOrganizerUserId: t.meetingOrganizer?.user?.id ?? organizerId,
      });
    }
    url = data['@odata.nextLink'] ?? null;
  }

  return all;
}

export async function listAllRecordings(
  organizerUpnOrId: string,
  startDateTime: Date,
  endDateTime: Date,
): Promise<RecentRecordingInfo[]> {
  const organizerId = organizerUpnOrId.includes('@')
    ? await getUserObjectId(organizerUpnOrId)
    : organizerUpnOrId;

  const start = startDateTime.toISOString();
  const end = endDateTime.toISOString();
  // Note: dates are DateTimeOffset literals (no quotes), but userId IS a string literal (quoted).
  const params = `meetingOrganizerUserId='${organizerId}',startDateTime=${start},endDateTime=${end}`;
  const path = `/users/${organizerId}/onlineMeetings/getAllRecordings(${params})`;

  const all: RecentRecordingInfo[] = [];
  let url: string | null = `${GRAPH}${path}`;

  while (url) {
    const token = await getAppToken();
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GraphError(
        `Graph getAllRecordings failed (${res.status}): ${body}`,
        res.status,
      );
    }
    const data = (await res.json()) as {
      value: Array<{
        id: string;
        meetingId: string;
        createdDateTime: string;
        recordingContentUrl: string;
        meetingOrganizer?: { user?: { id: string } };
      }>;
      '@odata.nextLink'?: string;
    };
    for (const r of data.value ?? []) {
      all.push({
        recordingId: r.id,
        meetingId: r.meetingId,
        createdDateTime: r.createdDateTime,
        recordingContentUrl: r.recordingContentUrl,
        meetingOrganizerUserId: r.meetingOrganizer?.user?.id ?? organizerId,
      });
    }
    url = data['@odata.nextLink'] ?? null;
  }

  return all;
}

/**
 * Get an onlineMeeting by its id — used to enrich transcript/recording rows
 * with the meeting's subject, start/end times, and join URL.
 *
 * Accepts both userPrincipalName (email) and AAD object id as `organizerUpnOrId`.
 */
export async function getOnlineMeetingById(
  organizerUpnOrId: string,
  meetingId: string,
): Promise<OnlineMeeting & { subject: string | null; startDateTime: string | null; endDateTime: string | null }> {
  // Graph requires a GUID (not a UPN) in the /users/{id} segment for onlineMeetings.
  const organizerId = organizerUpnOrId.includes('@')
    ? await getUserObjectId(organizerUpnOrId)
    : organizerUpnOrId;
  const token = await getAppToken();
  const url = `${GRAPH}/users/${organizerId}/onlineMeetings/${encodeURIComponent(meetingId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph getOnlineMeetingById failed (${res.status}): ${body}`, res.status);
  }
  const m = (await res.json()) as {
    id: string;
    joinUrl: string;
    joinWebUrl?: string;
    subject?: string;
    startDateTime?: string;
    endDateTime?: string;
  };
  return {
    id: m.id,
    joinUrl: m.joinUrl,
    joinWebUrl: m.joinWebUrl ?? null,
    subject: m.subject ?? null,
    startDateTime: m.startDateTime ?? null,
    endDateTime: m.endDateTime ?? null,
  };
}
