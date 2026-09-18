import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminCustomersModule } from '../admin/customers/admin-customers.module.js';
import { AdminUsersModule } from '../admin/users/admin-users.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { createResellerHubFake, type HubFakeCall } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { RegistrationModule } from './registration.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('RegistrationController', () => {
  let t: TestApp;
  let settings: SettingsService;
  let nextIp = 1;
  /** Hub ids handed out in order, so a test can predict the id of what it created. */
  let nextCustomerId = 700;

  const hub = createResellerHubFake({
    'POST /resellers/customers': (call: HubFakeCall) => {
      const body = JSON.parse(call.body ?? '{}') as { email?: string };
      if (body.email === 'known@example.com')
        return {
          status: 400,
          body: { error: { code: 'validation_error', message: 'User with this email already exists' } },
        };
      return { status: 201, body: { userId: ++nextCustomerId, success: true } };
    },
  });

  /** Each test gets its own client address so the per-IP throttle does not leak between tests. */
  function client() {
    const ip = `10.4.0.${nextIp++}`;
    return {
      post: (path: string) => request(t.app.getHttpServer()).post(path).set('X-Forwarded-For', ip).set(XHR),
    };
  }

  beforeAll(async () => {
    t = await createTestApp(
      [AuthModule, SettingsModule, AdminUsersModule, AdminCustomersModule, RegistrationModule],
      {
        hub,
      },
    );
    settings = t.moduleRef.get(SettingsService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.db.reset();
    t.mail.sent.length = 0;
    await settings.setRegistration({ selfServiceEnabled: true });
  });

  it('refuses sign-ups while the operator has them switched off', async () => {
    await settings.setRegistration({ selfServiceEnabled: false });

    const res = await client().post('/api/auth/register').send({ email: 'a@example.com' }).expect(404);

    expect(res.body.error.code).toBe('registration_closed');
    expect(t.mail.sent).toHaveLength(0);
  });

  it('opens an account at the service and here, and mails the link', async () => {
    const res = await client()
      .post('/api/auth/register')
      .send({ email: 'new@example.com', firstName: 'Mara', company: 'Mara GmbH', language: 'fr' })
      .expect(202);

    expect(res.body).toEqual({ accepted: true });
    const created = hub.calls.filter((c) => c.method === 'POST' && c.path === '/resellers/customers');
    expect(created).toHaveLength(1);
    expect(JSON.parse(created[0].body ?? '{}')).toMatchObject({
      email: 'new@example.com',
      firstName: 'Mara',
      company: 'Mara GmbH',
      language: 'fr',
      // The visitor signs in here; the service must not mail a code of its own.
      sendPasswordEmail: false,
      hubLoginEnabled: false,
    });

    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0].kind).toBe('registration');
    expect(t.mail.sent[0].to).toEqual({ email: 'new@example.com', language: 'fr', firstName: 'Mara' });
    expect(new URL(t.mail.sent[0].link).pathname).toBe('/accept-invite');

    const row = await t.db.db
      .selectFrom('users')
      .select(['role', 'status', 'acceptedAt', 'language'])
      .where('email', '=', 'new@example.com')
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ role: 'user', status: 'invited', acceptedAt: null, language: 'fr' });
  });

  it('answers the same for an address that already has an account, and creates nothing', async () => {
    await client().post('/api/auth/register').send({ email: 'twice@example.com' }).expect(202);
    t.mail.sent.length = 0;
    const before = hub.calls.length;

    const res = await client().post('/api/auth/register').send({ email: 'twice@example.com' }).expect(202);

    expect(res.body).toEqual({ accepted: true });
    expect(hub.calls).toHaveLength(before);
    expect(t.mail.sent).toHaveLength(0);
  });

  it('answers the same when the service refuses the address', async () => {
    const res = await client().post('/api/auth/register').send({ email: 'known@example.com' }).expect(202);

    expect(res.body).toEqual({ accepted: true });
    expect(t.mail.sent).toHaveLength(0);
    const row = await t.db.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'known@example.com')
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('records the sign-up without an actor, because nobody at the portal acted', async () => {
    await client().post('/api/auth/register').send({ email: 'logged@example.com' }).expect(202);

    const entries = await t.db.db
      .selectFrom('auditLog')
      .select(['action', 'actorUserId'])
      .where('action', '=', 'auth.registered')
      .execute();
    expect(entries).toHaveLength(1);
    expect(entries[0].actorUserId).toBeNull();
  });

  it('refuses an address that is not one', async () => {
    await client().post('/api/auth/register').send({ email: 'not-an-address' }).expect(400);
    expect(t.mail.sent).toHaveLength(0);
  });
});
