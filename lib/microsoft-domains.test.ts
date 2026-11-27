import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMicrosoftTenantDomains,
  isMicrosoftDomainIncluded,
  isMicrosoftEmailIncluded,
} from './microsoft-domains';

function setDomains(t: TestContext, value: string | undefined) {
  const previous = process.env.MICROSOFT_TENANT_DOMAINS;
  t.after(() => {
    if (previous === undefined) delete process.env.MICROSOFT_TENANT_DOMAINS;
    else process.env.MICROSOFT_TENANT_DOMAINS = previous;
  });
  if (value === undefined) delete process.env.MICROSOFT_TENANT_DOMAINS;
  else process.env.MICROSOFT_TENANT_DOMAINS = value;
}

test('normalizes and deduplicates the two company domains', (t) => {
  setDomains(t, ' DGSmart.gr, @dgsoft.gr, dgsmart.gr ');
  assert.deepEqual(getMicrosoftTenantDomains(), ['dgsmart.gr', 'dgsoft.gr']);
  assert.equal(isMicrosoftDomainIncluded('DGSOFT.GR'), true);
  assert.equal(isMicrosoftDomainIncluded('example.com'), false);
});

test('accepts users from both domains regardless of email casing', (t) => {
  setDomains(t, 'dgsmart.gr,dgsoft.gr');
  assert.equal(isMicrosoftEmailIncluded('person@dgsmart.gr'), true);
  assert.equal(isMicrosoftEmailIncluded('PERSON@DGSOFT.GR'), true);
  assert.equal(isMicrosoftEmailIncluded('person@example.com'), false);
});

test('rejects malformed Microsoft identities', (t) => {
  setDomains(t, 'dgsmart.gr,dgsoft.gr');
  assert.equal(isMicrosoftEmailIncluded('missing-at-sign'), false);
  assert.equal(isMicrosoftEmailIncluded('@dgsmart.gr'), false);
  assert.equal(isMicrosoftEmailIncluded('person@'), false);
});

test('empty configuration preserves access for every tenant domain', (t) => {
  setDomains(t, undefined);
  assert.deepEqual(getMicrosoftTenantDomains(), []);
  assert.equal(isMicrosoftEmailIncluded('person@any-tenant-domain.gr'), true);
});
