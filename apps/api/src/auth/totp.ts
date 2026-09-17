import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 6238 default: a new code every 30 seconds. */
export const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/**
 * One step in each direction, so a phone whose clock drifts by a few seconds
 * and a person who starts typing just before the code rolls over both get in.
 * Wider than that and a code stays usable long after it left the screen.
 */
const DEFAULT_WINDOW_STEPS = 1;

/** RFC 4648 base32 without padding, which is what authenticator apps read. */
function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/[\s=]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Secret is not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function base32Encode(bytes: Buffer): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

/** 160 bits, the size RFC 4226 recommends, written as 32 base32 characters. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code an authenticator shows for this secret at this moment. */
export function totpCode(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * True when the code belongs to this secret right now. Anything that is not a
 * code of the right shape is rejected without throwing, because this runs on
 * whatever a login form sent.
 */
export function verifyTotp(
  secret: string,
  code: string,
  atMs: number,
  windowSteps: number = DEFAULT_WINDOW_STEPS,
): boolean {
  const cleaned = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const given = Buffer.from(cleaned, 'utf8');
  let matched = false;
  for (let step = -windowSteps; step <= windowSteps; step += 1) {
    const expected = Buffer.from(totpCode(secret, atMs + step * STEP_SECONDS * 1000), 'utf8');
    // No early exit: every candidate is compared, so the answer takes the same
    // time whether the first or the last one matched.
    if (timingSafeEqual(expected, given)) matched = true;
  }
  return matched;
}

/** The URL behind the QR code an authenticator scans. */
export function otpauthUrl(params: { secret: string; account: string; issuer: string }): string {
  const issuer = encodeURIComponent(params.issuer);
  const label = `${issuer}:${encodeURIComponent(params.account)}`;
  return (
    `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}` +
    `&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  );
}
