import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes as base64url; the raw value goes to the client, only its hash is stored. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
