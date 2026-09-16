import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Derives the 256 bit data key from APP_SECRET; the salt and info pin it to this use. */
function dataKey(appSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', appSecret, 'ecl-settings', 'secret-v1', 32));
}

/** AES-256-GCM; returns "v1:" + base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string, appSecret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', dataKey(appSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
}

/** Inverse of encryptSecret; throws when the blob was tampered with or the secret changed. */
export function decryptSecret(blob: string, appSecret: string): string {
  const [version, payload] = blob.split(':');
  if (version !== VERSION || !payload) throw new Error('Unsupported secret format');
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length < IV_BYTES + TAG_BYTES) throw new Error('Secret blob is too short');
  const iv = bytes.subarray(0, IV_BYTES);
  const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = bytes.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', dataKey(appSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
