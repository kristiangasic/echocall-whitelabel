import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from '../db/helpers.js';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { SessionService } from './session.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('SessionService', () => {
  let t: TestDb;
  let sessions: SessionService;
  let userId: number;

  beforeAll(async () => {
    t = await createTestDb();
    sessions = new SessionService(t.db);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.reset();
    userId = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'user@example.com',
      role: 'user',
      status: 'active',
      echocallCustomerId: 501,
      language: 'en',
    });
  });

  it('creates a session and resolves it to the user without exposing the token in the database', async () => {
    const { token, expiresAt } = await sessions.create(userId, { ip: '10.0.0.1', userAgent: 'vitest' });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    const user = await sessions.resolve(token);
    expect(user).toEqual({
      id: userId,
      email: 'user@example.com',
      role: 'user',
      firstName: null,
      lastName: null,
      language: 'en',
      echocallCustomerId: 501,
      twoFactorEnabled: false,
      impersonator: null,
    });
    const rows = await t.db.selectFrom('sessions').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].ip).toBe('10.0.0.1');
  });

  it('returns null for unknown or missing tokens', async () => {
    expect(await sessions.resolve(undefined)).toBeNull();
    expect(await sessions.resolve('nope')).toBeNull();
  });

  it('deletes an expired session on resolve', async () => {
    const { token } = await sessions.create(userId);
    await t.db
      .updateTable('sessions')
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .execute();
    expect(await sessions.resolve(token)).toBeNull();
    expect(await t.db.selectFrom('sessions').selectAll().execute()).toHaveLength(0);
  });

  it('slides the expiry when fewer than 15 days remain', async () => {
    const { token } = await sessions.create(userId);
    await t.db
      .updateTable('sessions')
      .set({ expiresAt: new Date(Date.now() + DAY_MS) })
      .execute();
    expect(await sessions.resolve(token)).not.toBeNull();
    const row = await t.db.selectFrom('sessions').select('expiresAt').executeTakeFirstOrThrow();
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
  });

  it('revokes one session or every session of a user', async () => {
    const a = await sessions.create(userId);
    const b = await sessions.create(userId);
    await sessions.revoke(a.token);
    expect(await sessions.resolve(a.token)).toBeNull();
    expect(await sessions.resolve(b.token)).not.toBeNull();
    await sessions.revokeAllForUser(userId);
    expect(await sessions.resolve(b.token)).toBeNull();
  });

  it('hands a session to another user and back, remembering who opened it', async () => {
    const operatorId = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'operator@example.com',
      role: 'admin',
      status: 'active',
      language: 'en',
    });
    const { token } = await sessions.create(operatorId);

    await sessions.switchTo(token, userId, operatorId);
    expect(await sessions.resolve(token)).toMatchObject({
      id: userId,
      impersonator: { id: operatorId, email: 'operator@example.com' },
    });

    await sessions.switchTo(token, operatorId, null);
    expect(await sessions.resolve(token)).toMatchObject({ id: operatorId, impersonator: null });
  });

  it('keeps the session apart from its operator once that account is gone', async () => {
    const operatorId = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'leaving@example.com',
      role: 'admin',
      status: 'active',
      language: 'en',
    });
    const { token } = await sessions.create(operatorId);
    await sessions.switchTo(token, userId, operatorId);

    await t.db.deleteFrom('users').where('id', '=', operatorId).execute();

    expect(await sessions.resolve(token)).toMatchObject({
      id: userId,
      impersonator: { id: operatorId, email: null },
    });
  });

  it('refuses sessions of users that are no longer active', async () => {
    const { token } = await sessions.create(userId);
    await t.db.updateTable('users').set({ status: 'disabled' }).where('id', '=', userId).execute();
    expect(await sessions.resolve(token)).toBeNull();
  });
});
