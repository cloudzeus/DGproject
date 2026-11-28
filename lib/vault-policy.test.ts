import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageVaultSecret, canRevealVaultValue, requiresVaultOtp, type VaultActor } from './vault-policy';

const owner: VaultActor = { id: 'owner', role: 'member', userType: 'employee' };
const admin: VaultActor = { id: 'admin', role: 'admin', userType: 'employee' };
const member: VaultActor = { id: 'member', role: 'member', userType: 'employee' };
const manager: VaultActor = { id: 'manager', role: 'manager', userType: 'employee' };
const customer: VaultActor = { id: 'customer', role: 'viewer', userType: 'customer' };
const supplier: VaultActor = { id: 'supplier', role: 'viewer', userType: 'supplier' };

test('the secret creator can manage and reveal their own secret', () => {
  assert.equal(canManageVaultSecret(owner, 'owner'), true);
  assert.equal(canRevealVaultValue(owner, 'owner', false), true);
});

test('admins and managers cannot bypass personal vault ownership', () => {
  for (const actor of [admin, manager]) {
    assert.equal(canManageVaultSecret(actor, 'owner'), false);
    assert.equal(canRevealVaultValue(actor, 'owner', false), false);
    assert.equal(canRevealVaultValue(actor, 'owner', true), true);
  }
});

test('an internal participant reveals a shared secret but cannot manage it', () => {
  assert.equal(canRevealVaultValue(member, 'owner', false), false);
  assert.equal(canRevealVaultValue(member, 'owner', true), true);
  assert.equal(canManageVaultSecret(member, 'owner'), false);
});

test('customers can manage and reveal their own secrets', () => {
  assert.equal(canManageVaultSecret(customer, 'customer'), true);
  assert.equal(canRevealVaultValue(customer, 'customer', false), true);
});

test('customers and suppliers can reveal secrets explicitly shared with them', () => {
  for (const actor of [customer, supplier]) {
    assert.equal(canRevealVaultValue(actor, 'owner', false), false);
    assert.equal(canRevealVaultValue(actor, 'owner', true), true);
    assert.equal(canManageVaultSecret(actor, 'owner'), false);
  }
});

test('only secrets owned by someone else require OTP', () => {
  assert.equal(requiresVaultOtp(owner, 'owner'), false);
  assert.equal(requiresVaultOtp(customer, 'customer'), false);
  for (const actor of [admin, manager, member, customer, supplier]) {
    assert.equal(requiresVaultOtp(actor, 'owner'), true);
  }
});
