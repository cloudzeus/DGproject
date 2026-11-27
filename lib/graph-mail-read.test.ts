import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMailFromAddress,
  getMessage,
  isApplicationMailReadMode,
  searchMessages,
} from './graph-mail';

const ENV_KEYS = [
  'TENANT_ID',
  'APPLICATION_ID',
  'CLIENT_SECRET_VALUE',
  'MICROSOFT_MAIL_SEND_MODE',
  'SHARED_MAILBOX_ADDRESS',
  'MICROSOFT_MAIL_READ_MODE',
  'MICROSOFT_PROJECT_MAILBOX_ADDRESS',
] as const;

function configureMailModes(t: TestContext, projectMailbox: string | null = 'pms@dgsmart.gr') {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) previous.set(key, process.env[key]);
  t.after(() => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.TENANT_ID = 'test-tenant';
  process.env.APPLICATION_ID = 'test-client';
  process.env.CLIENT_SECRET_VALUE = 'test-secret';
  process.env.MICROSOFT_MAIL_SEND_MODE = 'application';
  process.env.SHARED_MAILBOX_ADDRESS = 'connect@dgsoft.gr';
  process.env.MICROSOFT_MAIL_READ_MODE = 'application';
  if (projectMailbox === null) delete process.env.MICROSOFT_PROJECT_MAILBOX_ADDRESS;
  else process.env.MICROSOFT_PROJECT_MAILBOX_ADDRESS = projectMailbox;
}

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(t: TestContext): FetchCall[] {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    if (call.url.includes('login.microsoftonline.com')) {
      return Response.json({ access_token: 'application-token', expires_in: 3600 });
    }
    if (call.url.includes('/messages?')) {
      return Response.json({ value: [] });
    }
    return Response.json({ id: 'message/1', subject: 'Project message' });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return calls;
}

test('application read mode searches and reads only the dedicated project mailbox', async (t) => {
  configureMailModes(t);
  const calls = mockFetch(t);

  assert.equal(isApplicationMailReadMode(), true);
  assert.equal(getMailFromAddress('user@example.com'), 'connect@dgsoft.gr');
  await searchMessages('ignored-user-id', 'FPM:p=PRJ-2026-001', { top: 25 });
  await getMessage('ignored-user-id', 'message/1');

  const graphCalls = calls.filter(({ url }) => url.startsWith('https://graph.microsoft.com/'));
  assert.equal(graphCalls.length, 2);
  const searchUrl = new URL(graphCalls[0].url);
  assert.equal(
    `${searchUrl.origin}${searchUrl.pathname}`,
    'https://graph.microsoft.com/v1.0/users/pms%40dgsmart.gr/messages',
  );
  assert.equal(searchUrl.searchParams.get('$search'), '"FPM:p=PRJ-2026-001"');
  assert.equal(searchUrl.searchParams.get('$top'), '25');
  assert.equal(
    graphCalls[1].url,
    'https://graph.microsoft.com/v1.0/users/pms%40dgsmart.gr/messages/message%2F1',
  );
  for (const call of graphCalls) {
    assert.equal((call.init?.headers as Record<string, string>).Authorization, 'Bearer application-token');
  }
});

test('application read mode fails before network access without a project mailbox', async (t) => {
  configureMailModes(t, null);
  const calls = mockFetch(t);

  await assert.rejects(
    searchMessages('ignored-user-id', 'FPM:p=PRJ-2026-001'),
    /MICROSOFT_PROJECT_MAILBOX_ADDRESS is required/,
  );
  assert.equal(calls.length, 0);
});

test('delegated read remains the default', (t) => {
  configureMailModes(t);
  delete process.env.MICROSOFT_MAIL_READ_MODE;
  assert.equal(isApplicationMailReadMode(), false);
});
