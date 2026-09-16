import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from '../db/helpers.js';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  let t: TestDb;
  let audit: AuditService;

  beforeAll(async () => {
    t = await createTestDb();
    audit = new AuditService(t.db);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.reset();
  });

  it('stores an event with the actor, target, details and address, and lists it newest first', async () => {
    const adminId = await insertReturningId(t.db, t.dialect, 'users', {
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      language: 'de',
    });
    await audit.record({ actorUserId: null, action: 'setup.started' });
    await audit.record({
      actorUserId: adminId,
      action: 'users.invited',
      targetType: 'user',
      targetId: 42,
      details: { email: 'new@example.com', role: 'user' },
      ip: '10.0.0.1',
    });

    const page = await audit.list(1, 50);
    expect(page.meta).toEqual({ page: 1, limit: 50, total: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.data[0]).toMatchObject({
      actorUserId: adminId,
      actorEmail: 'admin@example.com',
      action: 'users.invited',
      targetType: 'user',
      targetId: '42',
      details: { email: 'new@example.com', role: 'user' },
      ip: '10.0.0.1',
    });
    expect(Date.parse(page.data[0].createdAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(page.data[1]).toMatchObject({
      actorUserId: null,
      actorEmail: null,
      action: 'setup.started',
      targetType: null,
      targetId: null,
      details: null,
      ip: null,
    });
  });

  it('pages through the log', async () => {
    for (let i = 0; i < 5; i++) await audit.record({ actorUserId: null, action: `event.${i}` });
    const second = await audit.list(2, 2);
    expect(second.meta).toEqual({ page: 2, limit: 2, total: 5 });
    expect(second.data.map((row) => row.action)).toEqual(['event.2', 'event.1']);
    const last = await audit.list(3, 2);
    expect(last.data.map((row) => row.action)).toEqual(['event.0']);
  });
});
