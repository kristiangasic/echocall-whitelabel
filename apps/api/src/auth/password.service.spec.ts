import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hash, 'correct horse battery')).toBe(true);
    expect(await service.verify(hash, 'wrong')).toBe(false);
  });

  it('produces a different hash for the same password (random salt)', async () => {
    expect(await service.hash('same')).not.toBe(await service.hash('same'));
  });

  it('answers false for accounts without a password and for corrupt hashes', async () => {
    expect(await service.verify(null, 'anything')).toBe(false);
    expect(await service.verify('not-a-hash', 'anything')).toBe(false);
  });
});
