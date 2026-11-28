import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class VaultCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultCryptoError';
  }
}

export type VaultEncryptionContext = {
  projectId: string;
  secretId: string;
};

export type EncryptedVaultValue = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
};

function getEncryptionKey(): Buffer {
  const encoded = process.env.VAULT_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new VaultCryptoError('VAULT_ENCRYPTION_KEY is not configured');
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new VaultCryptoError('VAULT_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

function getKeyVersion(): string {
  const version = process.env.VAULT_ENCRYPTION_KEY_VERSION?.trim() || 'v1';
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(version)) {
    throw new VaultCryptoError('VAULT_ENCRYPTION_KEY_VERSION is invalid');
  }
  return version;
}

function getOtpPepper(): Buffer {
  const configured = process.env.VAULT_OTP_SECRET?.trim();
  if (configured) {
    const pepper = Buffer.from(configured, 'utf8');
    if (pepper.length < 32) {
      throw new VaultCryptoError('VAULT_OTP_SECRET must contain at least 32 bytes');
    }
    return createHash('sha256').update(pepper).digest();
  }

  // A separate OTP secret is recommended. Deriving a domain-separated key from
  // the vault key keeps the fallback safe without ever storing the OTP itself.
  return createHmac('sha256', getEncryptionKey()).update('a-sisyphus:vault:otp:v1').digest();
}

function aad({ projectId, secretId }: VaultEncryptionContext): Buffer {
  return Buffer.from(`a-sisyphus:vault:v1:${projectId}:${secretId}`, 'utf8');
}

export function encryptVaultValue(
  plaintext: string,
  context: VaultEncryptionContext,
): EncryptedVaultValue {
  if (!plaintext) throw new VaultCryptoError('Cannot encrypt an empty vault value');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(aad(context), { plaintextLength: Buffer.byteLength(plaintext, 'utf8') });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: getKeyVersion(),
  };
}

export function decryptVaultValue(
  encrypted: EncryptedVaultValue,
  context: VaultEncryptionContext,
): string {
  if (encrypted.keyVersion !== getKeyVersion()) {
    throw new VaultCryptoError('The vault value uses an unsupported key version');
  }

  try {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new VaultCryptoError('Invalid vault encryption envelope');
    }

    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad(context));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]);
    const value = plaintext.toString('utf8');
    plaintext.fill(0);
    return value;
  } catch (error) {
    if (error instanceof VaultCryptoError) throw error;
    throw new VaultCryptoError('Vault value authentication failed');
  }
}

export function generateVaultOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashVaultOtp(args: {
  code: string;
  challengeId: string;
  secretId: string;
  userId: string;
}): string {
  return createHmac('sha256', getOtpPepper())
    .update(`${args.challengeId}:${args.secretId}:${args.userId}:${args.code}`)
    .digest('hex');
}

export function vaultOtpMatches(expectedHash: string, actualHash: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
