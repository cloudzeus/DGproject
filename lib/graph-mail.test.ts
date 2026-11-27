import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMailFromAddress,
  isApplicationMailMode,
  sendMail,
  sendMailWithAttachments,
} from './graph-mail';

const ENV_KEYS = [
  'TENANT_ID',
  'APPLICATION_ID',
  'CLIENT_SECRET_VALUE',
  'MICROSOFT_MAIL_SEND_MODE',
  'SHARED_MAILBOX_ADDRESS',
] as const;

function configureApplicationMode(t: TestContext, mailbox: string | null = 'connect@dgsoft.gr') {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
  }
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
  if (mailbox === null) delete process.env.SHARED_MAILBOX_ADDRESS;
  else process.env.SHARED_MAILBOX_ADDRESS = mailbox;
}

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(t: TestContext, responder: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tokenResponse(): Response {
  return json({ access_token: 'application-token', expires_in: 3600 });
}

test('application mode gets a client-credentials token and sends from the tenant mailbox', async (t) => {
  configureApplicationMode(t);
  const calls = mockFetch(t, ({ url }) => {
    if (url.includes('login.microsoftonline.com')) return tokenResponse();
    return new Response(null, { status: 202 });
  });

  assert.equal(isApplicationMailMode(), true);
  assert.equal(getMailFromAddress('user@example.com'), 'connect@dgsoft.gr');
  await sendMail('ignored-user-id', {
    subject: 'Test subject',
    bodyHtml: '<p>Test body</p>',
    to: ['recipient@example.com'],
    cc: ['copy@example.com'],
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].url,
    'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token',
  );
  const tokenBody = new URLSearchParams(String(calls[0].init?.body));
  assert.equal(tokenBody.get('client_id'), 'test-client');
  assert.equal(tokenBody.get('grant_type'), 'client_credentials');
  assert.equal(tokenBody.get('scope'), 'https://graph.microsoft.com/.default');

  assert.equal(
    calls[1].url,
    'https://graph.microsoft.com/v1.0/users/connect%40dgsoft.gr/sendMail',
  );
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal(calls[1].init?.headers && (calls[1].init.headers as Record<string, string>).Authorization, 'Bearer application-token');
  const payload = JSON.parse(String(calls[1].init?.body));
  assert.equal(payload.saveToSentItems, true);
  assert.equal(payload.message.subject, 'Test subject');
  assert.deepEqual(payload.message.toRecipients, [
    { emailAddress: { address: 'recipient@example.com' } },
  ]);
  assert.deepEqual(payload.message.ccRecipients, [
    { emailAddress: { address: 'copy@example.com' } },
  ]);
});

test('application mode creates, attaches and sends a draft in the tenant mailbox', async (t) => {
  configureApplicationMode(t);
  const calls = mockFetch(t, ({ url }) => {
    if (url.includes('login.microsoftonline.com')) return tokenResponse();
    if (url.endsWith('/messages')) return json({ id: 'draft-1' }, 201);
    if (url.endsWith('/attachments')) return json({ id: 'attachment-1' }, 201);
    return new Response(null, { status: 202 });
  });

  await sendMailWithAttachments(
    'ignored-user-id',
    {
      subject: 'Attachment test',
      bodyHtml: '<p>With attachment</p>',
      to: ['recipient@example.com'],
    },
    [{ name: 'answer.txt', contentType: 'text/plain', contentBase64: 'YW5zd2Vy' }],
  );

  const graphCalls = calls.filter(({ url }) => url.startsWith('https://graph.microsoft.com/'));
  assert.deepEqual(graphCalls.map(({ url }) => url), [
    'https://graph.microsoft.com/v1.0/users/connect%40dgsoft.gr/messages',
    'https://graph.microsoft.com/v1.0/users/connect%40dgsoft.gr/messages/draft-1/attachments',
    'https://graph.microsoft.com/v1.0/users/connect%40dgsoft.gr/messages/draft-1/send',
  ]);
  const attachment = JSON.parse(String(graphCalls[1].init?.body));
  assert.equal(attachment['@odata.type'], '#microsoft.graph.fileAttachment');
  assert.equal(attachment.name, 'answer.txt');
  assert.equal(attachment.contentBytes, 'YW5zd2Vy');
});

test('application mode fails before any network request when the tenant mailbox is missing', async (t) => {
  configureApplicationMode(t, null);
  const calls = mockFetch(t, () => new Response(null, { status: 500 }));

  await assert.rejects(
    sendMail('ignored-user-id', {
      subject: 'Must not send',
      bodyHtml: '<p>No mailbox configured</p>',
      to: ['recipient@example.com'],
    }),
    /SHARED_MAILBOX_ADDRESS is required/,
  );
  assert.equal(calls.length, 0);
});

test('delegated mode remains the default and keeps the user sender address', (t) => {
  configureApplicationMode(t);
  delete process.env.MICROSOFT_MAIL_SEND_MODE;

  assert.equal(isApplicationMailMode(), false);
  assert.equal(getMailFromAddress('user@example.com'), 'user@example.com');
});
