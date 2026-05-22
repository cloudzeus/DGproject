// Microsoft Graph mail integration. Separate from the NextAuth Azure provider
// because we need incremental consent — base sign-in stays scope-minimal, and
// the user opts into Mail.Read / Mail.Send via /api/mail/connect/* only if they
// want the inbox feature. Refresh tokens are stored per-user in
// `UserMailConnection` and rotated transparently here.

import { prisma } from '@/lib/prisma';

const TENANT_ID = process.env.TENANT_ID ?? 'common';
const CLIENT_ID = process.env.APPLICATION_ID ?? '';
const CLIENT_SECRET = process.env.CLIENT_SECRET_VALUE ?? '';

// Granted scopes for the mail connection. Mail.Read is for ingest; Mail.Send
// lets the app compose & send mail on the user's behalf (from /projects, task
// detail, and question threads). Outbound mail always carries the routing tag
// in a hidden footer so replies route themselves back to the right project.
export const MAIL_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
] as const;

export function getMailRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? '';
  return `${base}/api/mail/connect/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getMailRedirectUri(),
    response_mode: 'query',
    scope: MAIL_SCOPES.join(' '),
    state,
    // prompt=consent forces the consent screen so users see Mail.Read/Send
    // even if they previously granted base sign-in scopes only.
    prompt: 'consent',
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        ...body,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token endpoint ${res.status}: ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getMailRedirectUri(),
    scope: MAIL_SCOPES.join(' '),
  });
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MAIL_SCOPES.join(' '),
  });
}

// Extract tenant + object id from the id_token without verifying signature —
// we trust the response only because we just exchanged it server-side over TLS.
export function decodeIdTokenClaims(idToken: string): { tid?: string; oid?: string; email?: string } {
  try {
    const payload = idToken.split('.')[1];
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// Returns a valid (refreshed if needed) access token for the user's mailbox.
// Throws if the user has no connection or the refresh failed.
export async function getMailAccessToken(userId: string): Promise<string> {
  const conn = await prisma.userMailConnection.findUnique({ where: { userId } });
  if (!conn) throw new Error('Mailbox not connected');

  // Refresh ~2 minutes before expiry to avoid edge-case 401s.
  if (conn.expiresAt.getTime() - Date.now() > 2 * 60 * 1000) {
    return conn.accessToken;
  }

  const fresh = await refreshTokens(conn.refreshToken);
  const expiresAt = new Date(Date.now() + fresh.expires_in * 1000);
  await prisma.userMailConnection.update({
    where: { userId },
    data: {
      accessToken: fresh.access_token,
      // Microsoft rotates refresh tokens — always persist the new one.
      refreshToken: fresh.refresh_token ?? conn.refreshToken,
      scopes: fresh.scope,
      expiresAt,
    },
  });
  return fresh.access_token;
}

// ─── Graph API wrappers ───────────────────────────────────────────────────

export type GraphMessage = {
  id: string;
  conversationId: string;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  body?: { contentType: 'html' | 'text'; content: string };
  from: { emailAddress: { name?: string; address: string } };
  toRecipients: { emailAddress: { name?: string; address: string } }[];
  ccRecipients?: { emailAddress: { name?: string; address: string } }[];
  receivedDateTime: string;
};

async function graphFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  }
  // sendMail returns 202 with no body
  if (res.status === 202 || res.status === 204) return null;
  return res.json();
}

// Search the user's mailbox for messages containing `query` (typically the
// project tag prefix). Graph's $search returns relevance-ranked results — for
// our use case we re-sort client-side by receivedDateTime.
export async function searchMessages(
  userId: string,
  query: string,
  opts: { top?: number } = {},
): Promise<GraphMessage[]> {
  const token = await getMailAccessToken(userId);
  const top = Math.min(opts.top ?? 50, 100);
  const params = new URLSearchParams({
    $search: `"${query}"`,
    $top: String(top),
    $select:
      'id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime',
  });
  const data = await graphFetch(token, `/me/messages?${params}`);
  return (data?.value ?? []) as GraphMessage[];
}

export async function getMessage(userId: string, messageId: string): Promise<GraphMessage> {
  const token = await getMailAccessToken(userId);
  return (await graphFetch(token, `/me/messages/${messageId}`)) as GraphMessage;
}

// Sends an HTML email from the user's mailbox via Graph. Always saves a copy
// to Sent Items so the user has a normal Outlook record of what we sent.
export async function sendMail(
  userId: string,
  msg: {
    subject: string;
    bodyHtml: string;
    to: string[];
    cc?: string[];
  },
): Promise<void> {
  const token = await getMailAccessToken(userId);
  await graphFetch(token, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: 'HTML', content: msg.bodyHtml },
        toRecipients: msg.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: (msg.cc ?? []).map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
}

