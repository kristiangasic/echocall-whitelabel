import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../../auth/auth.module.js';
import { createResellerHubFake, type HubFakeCall } from '../../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../../testing/test-app.js';
import { type SignedInUser, signInAs } from '../../testing/users.js';
import { AdminUsersModule } from '../users/admin-users.module.js';
import { AdminCustomersModule } from './admin-customers.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('AdminCustomersController', () => {
  let t: TestApp;
  let admin: SignedInUser;
  let user: SignedInUser;
  let asAdmin: Record<string, string>;
  /** Hub ids handed out in order, so a spec can predict the id of the customer it creates. */
  let nextCustomerId = 900;

  const hub = createResellerHubFake({
    'POST /resellers/customers': (call: HubFakeCall) => {
      const body = JSON.parse(call.body ?? '{}') as { email?: string };
      if (body.email === 'rejected@example.com')
        return {
          status: 400,
          body: { error: { code: 'validation_error', message: 'User with this email already exists' } },
        };
      return { status: 201, body: { userId: ++nextCustomerId, success: true } };
    },
    'PATCH /resellers/customers/901': { body: { success: true } },
    'PATCH /resellers/customers/901/suspend': { body: { success: true } },
    'PATCH /resellers/customers/901/unsuspend': { body: { success: true } },
    'DELETE /resellers/customers/901': { status: 204 },
  });

  beforeAll(async () => {
    t = await createTestApp([AuthModule, AdminUsersModule, AdminCustomersModule], { hub });
    await t.db.reset();
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    user = await signInAs(t, {
      email: 'taken@example.com',
      role: 'user',
      echocallCustomerId: 501,
      passwordHash: '$argon2id$placeholder',
    });
    asAdmin = { Cookie: admin.cookie, ...XHR };
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());
  const hubCalls = (method: string, path: string) =>
    hub.calls.filter((call) => call.method === method && call.path === path);
  const users = () => api().get('/api/admin/users').set('Cookie', admin.cookie);
  const lastAudit = async () =>
    (await api().get('/api/admin/audit').set('Cookie', admin.cookie)).body.data[0] as Record<string, unknown>;

  it('is reserved for administrators', async () => {
    expect((await api().post('/api/admin/customers').set(XHR).send({ email: 'a@example.com' })).status).toBe(
      401,
    );
    const asUser = await api()
      .post('/api/admin/customers')
      .set({ Cookie: user.cookie, ...XHR })
      .send({ email: 'a@example.com' });
    expect(asUser.status).toBe(403);
  });

  it('rejects an e-mail that already has a portal login before it calls the hub', async () => {
    const before = hub.calls.length;
    const res = await api().post('/api/admin/customers').set(asAdmin).send({ email: 'TAKEN@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
    expect(hub.calls.length).toBe(before);
  });

  it('creates the customer once, keeps the returned id and invites the login', async () => {
    const res = await api().post('/api/admin/customers').set(asAdmin).send({
      email: 'New@Example.com',
      firstName: 'Nina',
      company: 'Nina GmbH',
      language: 'fr',
    });

    expect(res.status).toBe(201);
    expect(res.body.customerId).toBe(901);
    expect(res.body.user).toMatchObject({
      email: 'new@example.com',
      role: 'user',
      status: 'invited',
      firstName: 'Nina',
      language: 'fr',
      echocallCustomerId: 901,
    });
    expect(res.body.mailSent).toBe(true);

    const calls = hubCalls('POST', '/resellers/customers');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({
      email: 'new@example.com',
      firstName: 'Nina',
      company: 'Nina GmbH',
      language: 'fr',
      sendPasswordEmail: false,
    });
    expect(calls[0].headers.get('x-echocall-customer')).toBeNull();

    expect(t.mail.sent.at(-1)).toMatchObject({ kind: 'invite', link: res.body.inviteLink });
    expect(await lastAudit()).toMatchObject({
      action: 'customers.created',
      targetType: 'customer',
      targetId: '901',
    });
  });

  it('leaves the portal untouched when the hub refuses the customer', async () => {
    const before = (await users()).body.data.length;
    const res = await api().post('/api/admin/customers').set(asAdmin).send({ email: 'rejected@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect((await users()).body.data).toHaveLength(before);
  });

  it('returns the invitation link without mailing it when the operator asks for that', async () => {
    const before = t.mail.sent.length;
    const res = await api()
      .post('/api/admin/customers')
      .set(asAdmin)
      .send({ email: 'quiet@example.com', sendInvite: false });

    expect(res.status).toBe(201);
    expect(res.body.mailSent).toBe(false);
    expect(res.body.inviteLink).toContain('/accept-invite?token=');
    expect(t.mail.sent).toHaveLength(before);
  });

  it('mirrors an edit onto the portal login', async () => {
    const res = await api()
      .patch('/api/admin/customers/901')
      .set(asAdmin)
      .send({ firstName: '', lastName: 'Bauer', language: 'de' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ firstName: null, lastName: 'Bauer', language: 'de' });
    expect(JSON.parse(hubCalls('PATCH', '/resellers/customers/901')[0].body ?? '{}')).toEqual({
      firstName: '',
      lastName: 'Bauer',
    });
  });

  it('suspends in the hub and in the portal, and lets the customer back in again', async () => {
    const suspended = await api().post('/api/admin/customers/901/suspend').set(asAdmin);
    expect(suspended.status).toBe(200);
    expect(suspended.body.user.status).toBe('disabled');
    expect(hubCalls('PATCH', '/resellers/customers/901/suspend')).toHaveLength(1);

    const back = await api().post('/api/admin/customers/901/unsuspend').set(asAdmin);
    expect(back.status).toBe(200);
    // The invitation was never accepted, so the login goes back to invited, not active.
    expect(back.body.user.status).toBe('invited');
    expect(hubCalls('PATCH', '/resellers/customers/901/unsuspend')).toHaveLength(1);
  });

  it('deletes the hub customer and its portal login together', async () => {
    const res = await api().delete('/api/admin/customers/901').set(asAdmin);

    expect(res.status).toBe(204);
    expect(hubCalls('DELETE', '/resellers/customers/901')).toHaveLength(1);
    const emails = (await users()).body.data.map((row: { email: string }) => row.email);
    expect(emails).not.toContain('new@example.com');
    expect(await lastAudit()).toMatchObject({ action: 'customers.deleted', targetId: '901' });
  });

  it('refuses an id that is not a customer id', async () => {
    const res = await api().post('/api/admin/customers/abc/suspend').set(asAdmin);

    expect(res.status).toBe(400);
  });
});
