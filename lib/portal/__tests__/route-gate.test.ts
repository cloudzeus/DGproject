import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateRedirect } from '../route-gate'

test('ο πελάτης γυρίζει στο /portal από κάθε employee route', () => {
  for (const p of ['/dashboard', '/projects', '/projects/abc', '/admin/users', '/reports', '/board', '/tickets', '/team', '/catalog']) {
    assert.equal(gateRedirect(p, 'customer', 'viewer'), '/portal', `απέτυχε για ${p}`)
  }
})

test('ο πελάτης περνά στα /portal routes', () => {
  assert.equal(gateRedirect('/portal', 'customer', 'viewer'), null)
  assert.equal(gateRedirect('/portal/tickets/abc', 'customer', 'viewer'), null)
  assert.equal(gateRedirect('/portal/projects', 'customer', 'viewer'), null)
})

test('κοινές σελίδες λογαριασμού επιτρέπονται στον πελάτη', () => {
  assert.equal(gateRedirect('/profile', 'customer', 'viewer'), null)
  assert.equal(gateRedirect('/auth/change-password', 'customer', 'viewer'), null)
})

test('η ομάδα γυρίζει στο /dashboard από /portal', () => {
  assert.equal(gateRedirect('/portal', 'employee', 'member'), '/dashboard')
  assert.equal(gateRedirect('/portal/projects', 'supplier', 'viewer'), '/dashboard')
})

test('το /admin παραμένει admin-only', () => {
  assert.equal(gateRedirect('/admin/users', 'employee', 'member'), '/dashboard')
  assert.equal(gateRedirect('/admin/users', 'employee', 'manager'), '/dashboard')
  assert.equal(gateRedirect('/admin/users', 'employee', 'admin'), null)
})

test('η ομάδα περνά στα κανονικά routes', () => {
  assert.equal(gateRedirect('/dashboard', 'employee', 'member'), null)
  assert.equal(gateRedirect('/projects/abc', 'employee', 'viewer'), null)
})

test('άγνωστος userType αντιμετωπίζεται ως πελάτης (fail-closed)', () => {
  assert.equal(gateRedirect('/dashboard', undefined, 'member'), '/portal')
  assert.equal(gateRedirect('/dashboard', 'nonsense', 'admin'), '/portal')
  // Ακόμα και με role=admin: άγνωστος τύπος δεν παίρνει πρόσβαση διαχειριστή.
  assert.equal(gateRedirect('/admin/users', 'nonsense', 'admin'), '/portal')
})

test('το /portal δεν ανακατευθύνεται στον εαυτό του', () => {
  // Θα ήταν βρόχος ανακατεύθυνσης.
  assert.notEqual(gateRedirect('/portal', 'customer', 'viewer'), '/portal')
})

test('path που αρχίζει με /portal αλλά δεν είναι segment δεν περνά', () => {
  // "/portalx" ΔΕΝ είναι μέσα στο portal — prefix match θα το άφηνε να περάσει.
  assert.equal(gateRedirect('/portalx', 'customer', 'viewer'), '/portal')
})
