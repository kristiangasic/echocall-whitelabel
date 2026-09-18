import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from './helpers.js';
import { migrateToLatest } from './migrator.js';
import { createTestDb, type TestDb } from './test-db.js';

describe('database', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.reset();
  });

  it('inserts a user and reads it back with defaults and a Date', async () => {
    const id = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      acceptedAt: new Date(),
      echocallCustomerId: null,
      firstName: null,
      lastName: null,
      language: 'de',
      lastLoginAt: null,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const row = await t.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.email).toBe('admin@example.com');
    expect(row.language).toBe('de');
    expect(row.status).toBe('active');
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('enforces the unique e-mail', async () => {
    const values = {
      email: 'dup@example.com',
      role: 'user' as const,
      status: 'invited' as const,
      acceptedAt: null,
      echocallCustomerId: 501,
      firstName: null,
      lastName: null,
      language: 'en' as const,
      lastLoginAt: null,
    };
    await insertReturningId(t.db, t.dialect, 'users', values);
    await expect(
      insertReturningId(t.db, t.dialect, 'users', { ...values, echocallCustomerId: 502 }),
    ).rejects.toThrow();
  });

  it('cascades sessions and tokens when a user is deleted', async () => {
    const userId = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'cascade@example.com',
      role: 'user',
      status: 'active',
      acceptedAt: new Date(),
      echocallCustomerId: 7,
      firstName: null,
      lastName: null,
      language: 'fr',
      lastLoginAt: null,
    });
    const expiresAt = new Date(Date.now() + 60_000);
    await t.db
      .insertInto('sessions')
      .values({ id: 'a'.repeat(64), userId, expiresAt, ip: '127.0.0.1', userAgent: 'vitest' })
      .execute();
    await insertReturningId(t.db, t.dialect, 'oneTimeTokens', {
      userId,
      purpose: 'invite',
      tokenHash: 'b'.repeat(64),
      expiresAt,
      usedAt: null,
    });
    await t.db.deleteFrom('users').where('id', '=', userId).execute();
    expect(await t.db.selectFrom('sessions').selectAll().execute()).toHaveLength(0);
    expect(await t.db.selectFrom('oneTimeTokens').selectAll().execute()).toHaveLength(0);
  });

  it('stores settings documents and audit entries', async () => {
    await t.db
      .insertInto('settings')
      .values({ key: 'branding', value: JSON.stringify({ name: 'Portal' }) })
      .execute();
    const setting = await t.db
      .selectFrom('settings')
      .selectAll()
      .where('key', '=', 'branding')
      .executeTakeFirstOrThrow();
    expect(JSON.parse(setting.value)).toEqual({ name: 'Portal' });

    const auditId = await insertReturningId(t.db, t.dialect, 'auditLog', {
      actorUserId: null,
      action: 'setup.completed',
      targetType: null,
      targetId: null,
      details: null,
      ip: null,
    });
    expect(auditId).toBeGreaterThan(0);
  });

  it('keeps a second factor with its user and drops it with them', async () => {
    const id = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'lena@example.com',
      role: 'user',
      status: 'active',
      acceptedAt: new Date(),
      echocallCustomerId: null,
      firstName: null,
      lastName: null,
      language: 'de',
      lastLoginAt: null,
    });

    const fresh = await t.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(fresh.totpSecret).toBeNull();
    expect(fresh.totpConfirmedAt).toBeNull();

    await t.db
      .updateTable('users')
      .set({ totpSecret: 'v1:envelope', totpConfirmedAt: new Date() })
      .where('id', '=', id)
      .execute();
    await t.db
      .insertInto('twoFactorRecoveryCodes')
      .values([
        { userId: id, codeHash: 'hash-1', usedAt: null },
        { userId: id, codeHash: 'hash-2', usedAt: null },
      ])
      .execute();

    const stored = await t.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(stored.totpSecret).toBe('v1:envelope');
    expect(stored.totpConfirmedAt).toBeInstanceOf(Date);

    await t.db.deleteFrom('users').where('id', '=', id).execute();
    const left = await t.db
      .selectFrom('twoFactorRecoveryCodes')
      .selectAll()
      .where('userId', '=', id)
      .execute();
    expect(left).toEqual([]);
  });

  it('empties every table on reset and is idempotent to migrate', async () => {
    await insertReturningId(t.db, t.dialect, 'users', {
      email: 'reset@example.com',
      role: 'admin',
      status: 'active',
      acceptedAt: new Date(),
      echocallCustomerId: null,
      firstName: null,
      lastName: null,
      language: 'de',
      lastLoginAt: null,
    });
    await t.reset();
    expect(await t.db.selectFrom('users').selectAll().execute()).toHaveLength(0);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
