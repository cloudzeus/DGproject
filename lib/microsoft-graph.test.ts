import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { getTenantInfo, listTenantUsers } from './microsoft-graph';

function configureGraph(t: TestContext) {
  const keys = [
    'TENANT_ID',
    'APPLICATION_ID',
    'CLIENT_SECRET_VALUE',
    'MICROSOFT_TENANT_DOMAINS',
  ] as const;
  const previous = new Map<string, string | undefined>();
  for (const key of keys) previous.set(key, process.env[key]);
  t.after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.TENANT_ID = 'test-tenant';
  process.env.APPLICATION_ID = 'test-client';
  process.env.CLIENT_SECRET_VALUE = 'test-secret';
  process.env.MICROSOFT_TENANT_DOMAINS = 'dgsmart.gr,dgsoft.gr';
}

test('Directory exposes both company domains and excludes other-domain or disabled users', async (t) => {
  configureGraph(t);
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('login.microsoftonline.com')) {
      return Response.json({ access_token: 'test-token', expires_in: 3600 });
    }
    if (url.includes('/organization?')) {
      return Response.json({
        value: [{
          displayName: 'Test tenant',
          verifiedDomains: [
            { name: 'dgsoft.gr', isDefault: true },
            { name: 'dgsmart.gr', isDefault: false },
            { name: 'other-domain.gr', isDefault: false },
          ],
        }],
      });
    }
    if (url.includes('/users?')) {
      return Response.json({
        value: [
          {
            id: 'user-dgsmart',
            displayName: 'DG Smart User',
            userPrincipalName: 'person@dgsmart.gr',
            mail: null,
            jobTitle: null,
            department: null,
            officeLocation: null,
            accountEnabled: true,
          },
          {
            id: 'user-dgsoft',
            displayName: 'DG Soft User',
            userPrincipalName: 'person@dgsoft.gr',
            mail: null,
            jobTitle: null,
            department: null,
            officeLocation: null,
            accountEnabled: true,
          },
          {
            id: 'user-other',
            displayName: 'Other Domain User',
            userPrincipalName: 'person@other-domain.gr',
            mail: null,
            jobTitle: null,
            department: null,
            officeLocation: null,
            accountEnabled: true,
          },
          {
            id: 'user-disabled',
            displayName: 'Disabled User',
            userPrincipalName: 'disabled@dgsoft.gr',
            mail: null,
            jobTitle: null,
            department: null,
            officeLocation: null,
            accountEnabled: false,
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const tenant = await getTenantInfo();
  assert.equal(tenant?.displayName, 'Test tenant');
  assert.equal(tenant?.defaultDomain, 'dgsoft.gr');
  assert.deepEqual(tenant?.domains, ['dgsoft.gr', 'dgsmart.gr']);

  const users = await listTenantUsers();
  assert.deepEqual(users.map((user) => user.email), ['person@dgsmart.gr', 'person@dgsoft.gr']);
});
