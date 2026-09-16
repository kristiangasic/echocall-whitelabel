import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { createResellerHubFake, RESELLER_PROFILE } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { type SignedInUser, signInAs } from '../testing/users.js';
import { AccountModule } from './account.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };
const PASSWORD = 'first password 123';

const CUSTOMER_PROFILE = {
  id: 501,
  email: 'kunde@example.com',
  name: 'Kunde GmbH',
  role: 'user',
  avatarUrl: null,
  defaultLanguage: 'de',
  resellerId: 9,
  ownResellerId: null,
};
const USAGE = {
  period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' },
  voiceMinutesUsed: 12.5,
  chatSessionsUsed: 40,
};
const LIMITS = {
  accountStatus: 'active',
  balanceEur: 25,
  voiceMinutesRemaining: 87.5,
  chatConversationsRemaining: 160,
  plan: { name: 'Starter', voiceMinutesPerMonth: 100, chatConversationsPerMonth: 200 },
};
const HUB_403 = {
  status: 403,
  body: { error: { code: 'forbidden', message: 'This customer does not belong to your reseller account' } },
};

describe('AccountController', () => {
  let t: TestApp;
  let user: SignedInUser;
  let admin: SignedInUser;

  beforeAll(async () => {
    const hub = createResellerHubFake({
      'GET /users/me': (call) =>
        call.headers.get('x-echocall-customer') === '501'
          ? { body: CUSTOMER_PROFILE }
          : { body: RESELLER_PROFILE },
      'GET /users/me/usage': { body: USAGE },
      'GET /users/me/limits': { body: LIMITS },
    });
    t = await createTestApp([AuthModule, AccountModule], { hub });
    await t.db.reset();
    const passwords = t.moduleRef.get(PasswordService, { strict: false });
    user = await signInAs(t, {
      email: 'user@example.com',
      role: 'user',
      echocallCustomerId: 501,
      passwordHash: await passwords.hash(PASSWORD),
    });
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  it('shows the hub profile, usage and limits of the linked customer', async () => {
    const res = await api().get('/api/account/overview').set('Cookie', user.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profile: CUSTOMER_PROFILE, usage: USAGE, limits: LIMITS });
    const inCustomerContext = t.hub.calls
      .filter((call) => call.headers.get('x-echocall-customer') === '501')
      .map((call) => call.path)
      .sort();
    expect(inCustomerContext).toEqual(['/users/me', '/users/me/limits', '/users/me/usage']);
  });

  it('answers 409 for an account without a customer and 401 anonymously', async () => {
    expect((await api().get('/api/account/overview')).status).toBe(401);
    const res = await api().get('/api/account/overview').set('Cookie', admin.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('customer_not_linked');
  });

  it('passes a hub refusal through with its status and code', async () => {
    t.hub.on('GET /users/me/limits', HUB_403);
    try {
      const res = await api().get('/api/account/overview').set('Cookie', user.cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    } finally {
      t.hub.on('GET /users/me/limits', { body: LIMITS });
    }
  });

  it('updates the profile and reflects it in the session', async () => {
    const empty = await api().patch('/api/account/profile').set('Cookie', user.cookie).set(XHR).send({});
    expect(empty.status).toBe(400);
    const res = await api()
      .patch('/api/account/profile')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({ firstName: '  Kai ', lastName: '', language: 'fr' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.id,
      email: 'user@example.com',
      role: 'user',
      firstName: 'Kai',
      lastName: null,
      language: 'fr',
      echocallCustomerId: 501,
    });
    const me = await api().get('/api/auth/me').set('Cookie', user.cookie);
    expect(me.body).toMatchObject({ firstName: 'Kai', language: 'fr' });
  });

  it('changes the password and signs out every other session', async () => {
    const sessions = t.moduleRef.get(SessionService, { strict: false });
    const other = `ecl_session=${(await sessions.create(user.id)).token}`;
    expect((await api().get('/api/auth/me').set('Cookie', other)).status).toBe(200);

    const weak = await api()
      .post('/api/account/password')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details[0].path).toBe('newPassword');
    const wrong = await api()
      .post('/api/account/password')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({ currentPassword: 'not it', newPassword: 'second password 456' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('invalid_current_password');
    expect((await api().get('/api/auth/me').set('Cookie', other)).status).toBe(200);

    const ok = await api()
      .post('/api/account/password')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({ currentPassword: PASSWORD, newPassword: 'second password 456' });
    expect(ok.status).toBe(204);
    expect((await api().get('/api/auth/me').set('Cookie', other)).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Cookie', user.cookie)).status).toBe(200);

    const login = await api()
      .post('/api/auth/login')
      .set(XHR)
      .send({ email: 'user@example.com', password: 'second password 456' });
    expect(login.status).toBe(200);
    const audit = await api().get('/api/admin/audit').set('Cookie', admin.cookie);
    expect(audit.body.data[0]).toMatchObject({
      action: 'account.password_changed',
      actorEmail: 'user@example.com',
      targetId: String(user.id),
    });
  });
});
