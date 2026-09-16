import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto.js';

const SECRET = 's'.repeat(32);

describe('settings crypto', () => {
  it('round-trips a secret and never stores it in the clear', () => {
    const blob = encryptSecret('hunter2 with ünïcödé', SECRET);
    expect(blob).toMatch(/^v1:[A-Za-z0-9+/=]+$/);
    expect(blob).not.toContain('hunter2');
    expect(decryptSecret(blob, SECRET)).toBe('hunter2 with ünïcödé');
  });

  it('uses a fresh nonce for every call', () => {
    expect(encryptSecret('same', SECRET)).not.toBe(encryptSecret('same', SECRET));
  });

  it('rejects a changed app secret, tampered data and unknown formats', () => {
    const blob = encryptSecret('hunter2', SECRET);
    expect(() => decryptSecret(blob, 't'.repeat(32))).toThrow();
    const [, payload] = blob.split(':');
    const bytes = Buffer.from(payload, 'base64');
    bytes[bytes.length - 1] ^= 0x01;
    expect(() => decryptSecret(`v1:${bytes.toString('base64')}`, SECRET)).toThrow();
    expect(() => decryptSecret('v0:abc', SECRET)).toThrow('Unsupported secret format');
    expect(() => decryptSecret('v1:AAAA', SECRET)).toThrow('too short');
  });
});
