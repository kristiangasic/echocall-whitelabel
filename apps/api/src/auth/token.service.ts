import { Inject, Injectable } from '@nestjs/common';
import { randomToken, sha256Hex } from '../common/crypto.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';

export type TokenPurpose = 'invite' | 'password_reset' | 'two_factor_challenge';

/**
 * Wrong guesses a challenge survives. Someone who already has the password is
 * one six digit code away from a session, so the token has to run out long
 * before guessing does.
 */
export const MAX_TOKEN_ATTEMPTS = 3;

/** One-time tokens for invitations and password resets. The raw token is returned once; only its sha256 is stored. */
@Injectable()
export class TokenService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Issues a fresh token; earlier unused tokens of the same purpose for this user stop working. */
  async issue(userId: number, purpose: TokenPurpose, ttlMs: number): Promise<string> {
    const token = randomToken();
    await this.db
      .updateTable('oneTimeTokens')
      .set({ usedAt: new Date() })
      .where('userId', '=', userId)
      .where('purpose', '=', purpose)
      .where('usedAt', 'is', null)
      .execute();
    await this.db
      .insertInto('oneTimeTokens')
      .values({ userId, purpose, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + ttlMs) })
      .execute();
    return token;
  }

  /**
   * Reads a token without spending it, for a step that may be attempted more
   * than once. Returns null under the same conditions as consume, and also
   * once too many wrong guesses have been made against it.
   */
  async open(token: string, purpose: TokenPurpose): Promise<{ id: number; userId: number } | null> {
    const row = await this.db
      .selectFrom('oneTimeTokens')
      .select(['id', 'userId', 'expiresAt', 'usedAt', 'attempts'])
      .where('tokenHash', '=', sha256Hex(token))
      .where('purpose', '=', purpose)
      .executeTakeFirst();
    if (!row || row.usedAt !== null || row.expiresAt.getTime() < Date.now()) return null;
    if (row.attempts >= MAX_TOKEN_ATTEMPTS) return null;
    return { id: row.id, userId: row.userId };
  }

  /** Counts a wrong guess and burns the token once it has had too many. */
  async countFailure(id: number): Promise<void> {
    await this.db
      .updateTable('oneTimeTokens')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('id', '=', id)
      .where('usedAt', 'is', null)
      .execute();
    await this.db
      .updateTable('oneTimeTokens')
      .set({ usedAt: new Date() })
      .where('id', '=', id)
      .where('usedAt', 'is', null)
      .where('attempts', '>=', MAX_TOKEN_ATTEMPTS)
      .execute();
  }

  /** Spends a token that was read with open; false when someone else got there first. */
  async spend(id: number): Promise<boolean> {
    const result = await this.db
      .updateTable('oneTimeTokens')
      .set({ usedAt: new Date() })
      .where('id', '=', id)
      .where('usedAt', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  /** Marks the token used and returns its user id; null when unknown, expired, used or of another purpose. */
  async consume(token: string, purpose: TokenPurpose): Promise<number | null> {
    const row = await this.db
      .selectFrom('oneTimeTokens')
      .select(['id', 'userId', 'expiresAt', 'usedAt'])
      .where('tokenHash', '=', sha256Hex(token))
      .where('purpose', '=', purpose)
      .executeTakeFirst();
    if (!row || row.usedAt !== null || row.expiresAt.getTime() < Date.now()) return null;
    const result = await this.db
      .updateTable('oneTimeTokens')
      .set({ usedAt: new Date() })
      .where('id', '=', row.id)
      .where('usedAt', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1 ? row.userId : null;
  }
}
