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
      acceptedAt: null,
    });
  });

  it('issues a token that can be consumed exactly once for its purpose', async () => {
    const token = await tokens.issue(userId, 'invite', 60_000);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const stored = await t.db.selectFrom('oneTimeTokens').selectAll().executeTakeFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);
    expect(await tokens.consume(token, 'sign_in')).toBeNull();
    expect(await tokens.consume(token, 'invite')).toBe(userId);
    expect(await tokens.consume(token, 'invite')).toBeNull();
  });

  it('rejects expired and unknown tokens', async () => {
    const expired = await tokens.issue(userId, 'sign_in', -1000);
    expect(await tokens.consume(expired, 'sign_in')).toBeNull();
    expect(await tokens.consume('x'.repeat(43), 'sign_in')).toBeNull();
  });
  it('invalidates earlier tokens of the same purpose when a new one is issued', async () => {
    const first = await tokens.issue(userId, 'invite', 60_000);
    const other = await tokens.issue(userId, 'sign_in', 60_000);
    const second = await tokens.issue(userId, 'invite', 60_000);
    expect(await tokens.consume(first, 'invite')).toBeNull();
    expect(await tokens.consume(second, 'invite')).toBe(userId);
    expect(await tokens.consume(other, 'sign_in')).toBe(userId);
  });
});
