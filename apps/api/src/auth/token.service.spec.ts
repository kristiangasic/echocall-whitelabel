import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from '../db/helpers.js';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  let t: TestDb;
  let tokens: TokenService;
  let userId: number;

  beforeAll(async () => {
    t = await createTestDb();
    tokens = new TokenService(t.db);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.reset();
    userId = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'invited@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 7,
      language: 'de',
    });
  });

  it('issues a token that can be consumed exactly once for its purpose', async () => {
    const token = await tokens.issue(userId, 'invite', 60_000);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const stored = await t.db.selectFrom('oneTimeTokens').selectAll().executeTakeFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);
    expect(await tokens.consume(token, 'password_reset')).toBeNull();
    expect(await tokens.consume(token, 'invite')).toBe(userId);
    expect(await tokens.consume(token, 'invite')).toBeNull();
  });

  it('rejects expired and unknown tokens', async () => {
    const expired = await tokens.issue(userId, 'password_reset', -1000);
    expect(await tokens.consume(expired, 'password_reset')).toBeNull();
    expect(await tokens.consume('x'.repeat(43), 'password_reset')).toBeNull();
  });
});
