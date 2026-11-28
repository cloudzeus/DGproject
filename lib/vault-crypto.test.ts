import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Module from 'node:module';
import test from 'node:test';

// server-only is enforced by the Next.js build. The plain node:test runtime does
// not implement React's server-only export condition, so stub that marker only.
const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const vault = require('./vault-crypto') as typeof import('./vault-crypto');
moduleLoader._load = originalLoad;

const KEY = randomBytes(32).toString('base64');
const OTP_SECRET = randomBytes(32).toString('base64');
const CONTEXT = { projectId: 'project-1', secretId: 'secret-1' };

process.env.VAULT_ENCRYPTION_KEY = KEY;
process.env.VAULT_ENCRYPTION_KEY_VERSION = 'test-v1';
process.env.VAULT_OTP_SECRET = OTP_SECRET;

test('AES-256-GCM round trip preserves Unicode and multiline secrets', () => {
  const plaintext = 'mysql://χρήστης:p@ss@host/db\nconnectionTimeout=30';
  const encrypted = vault.encryptVaultValue(plaintext, CONTEXT);
  assert.equal(vault.decryptVaultValue(encrypted, CONTEXT), plaintext);
  assert.equal(encrypted.keyVersion, 'test-v1');
  assert.notEqual(encrypted.ciphertext, plaintext);
});

test('each encryption uses a fresh IV and ciphertext', () => {
  const first = vault.encryptVaultValue('same-value', CONTEXT);
  const second = vault.encryptVaultValue('same-value', CONTEXT);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test('ciphertext and authentication-tag tampering are rejected', () => {
  const encrypted = vault.encryptVaultValue('do-not-change', CONTEXT);
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  ciphertext[0] ^= 1;
  assert.throws(
    () => vault.decryptVaultValue({ ...encrypted, ciphertext: ciphertext.toString('base64') }, CONTEXT),
    /authentication failed/,
  );

  const tag = Buffer.from(encrypted.authTag, 'base64');
  tag[0] ^= 1;
  assert.throws(
    () => vault.decryptVaultValue({ ...encrypted, authTag: tag.toString('base64') }, CONTEXT),
    /authentication failed/,
  );
});

test('ciphertext cannot be replayed under another project or secret', () => {
  const encrypted = vault.encryptVaultValue('bound-to-context', CONTEXT);
  assert.throws(
    () => vault.decryptVaultValue(encrypted, { ...CONTEXT, projectId: 'project-2' }),
    /authentication failed/,
  );
  assert.throws(
    () => vault.decryptVaultValue(encrypted, { ...CONTEXT, secretId: 'secret-2' }),
    /authentication failed/,
  );
});

test('an unsupported key version cannot be decrypted', () => {
  const encrypted = vault.encryptVaultValue('versioned', CONTEXT);
  assert.throws(
    () => vault.decryptVaultValue({ ...encrypted, keyVersion: 'old-version' }, CONTEXT),
    /unsupported key version/,
  );
});

test('OTP generator returns exactly six numeric digits', () => {
  for (let i = 0; i < 100; i += 1) {
    assert.match(vault.generateVaultOtp(), /^\d{6}$/);
  }
});

test('OTP HMAC is deterministic and bound to challenge, secret and user', () => {
  const args = { code: '123456', challengeId: 'challenge-1', secretId: 'secret-1', userId: 'user-1' };
  const hash = vault.hashVaultOtp(args);
  assert.equal(hash, vault.hashVaultOtp(args));
  assert.equal(hash.length, 64);
  assert.notEqual(hash, vault.hashVaultOtp({ ...args, code: '123457' }));
  assert.notEqual(hash, vault.hashVaultOtp({ ...args, challengeId: 'challenge-2' }));
  assert.notEqual(hash, vault.hashVaultOtp({ ...args, secretId: 'secret-2' }));
  assert.notEqual(hash, vault.hashVaultOtp({ ...args, userId: 'user-2' }));
});

test('OTP comparison accepts only the identical HMAC', () => {
  const args = { code: '000000', challengeId: 'challenge-1', secretId: 'secret-1', userId: 'user-1' };
  const hash = vault.hashVaultOtp(args);
  assert.equal(vault.vaultOtpMatches(hash, hash), true);
  assert.equal(vault.vaultOtpMatches(hash, vault.hashVaultOtp({ ...args, code: '000001' })), false);
  assert.equal(vault.vaultOtpMatches('00', hash), false);
});

test('invalid encryption-key configuration fails closed', () => {
  const previous = process.env.VAULT_ENCRYPTION_KEY;
  process.env.VAULT_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
  assert.throws(() => vault.encryptVaultValue('secret', CONTEXT), /exactly 32 bytes/);
  process.env.VAULT_ENCRYPTION_KEY = previous;
});
