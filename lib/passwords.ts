import { randomBytes } from 'crypto';

// Visually-unambiguous charset (no 0/O/1/l/I).
const ALPHA_LOWER = 'abcdefghjkmnpqrstuvwxyz';
const ALPHA_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*';
const CHARSET = ALPHA_LOWER + ALPHA_UPPER + DIGITS + SYMBOLS;

/**
 * Generates a cryptographically random temporary password using rejection sampling
 * to keep the distribution uniform across the charset.
 */
export function generateTempPassword(length = 12): string {
  if (length < 8) length = 8;

  const max = 256 - (256 % CHARSET.length); // largest multiple of charset that fits in a byte
  const out: string[] = [];

  // Loop until we have enough characters; oversample buffer to reduce iterations.
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const v = buf[i];
      if (v < max) out.push(CHARSET[v % CHARSET.length]);
    }
  }

  // Guarantee at least one of each category by replacing positions if missing.
  const have = {
    lower: /[a-z]/.test(out.join('')),
    upper: /[A-Z]/.test(out.join('')),
    digit: /[0-9]/.test(out.join('')),
    symbol: new RegExp(`[${SYMBOLS.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}]`).test(out.join('')),
  };
  const missing: string[] = [];
  if (!have.lower) missing.push(ALPHA_LOWER);
  if (!have.upper) missing.push(ALPHA_UPPER);
  if (!have.digit) missing.push(DIGITS);
  if (!have.symbol) missing.push(SYMBOLS);
  if (missing.length) {
    const fillBuf = randomBytes(missing.length * 2);
    let posBuf = randomBytes(missing.length * 2);
    let pi = 0;
    for (let i = 0; i < missing.length; i++) {
      const set = missing[i];
      const ch = set[fillBuf[i] % set.length];
      // pick a position to overwrite
      let pos = posBuf[pi++] % out.length;
      if (pi >= posBuf.length) {
        posBuf = randomBytes(missing.length * 2);
        pi = 0;
      }
      out[pos] = ch;
    }
  }

  return out.join('');
}
