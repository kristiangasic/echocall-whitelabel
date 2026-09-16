import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

// OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  /** Verifies against a stored hash; a missing hash still costs one verification so timing does not reveal accounts. */
  async verify(hash: string | null, password: string): Promise<boolean> {
    if (hash === null) {
      await argon2.verify(await this.getDummyHash(), password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hash('no-account-placeholder');
    return this.dummyHash;
  }
}
