import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountModule } from '../../account/account.module.js';
import { AuditModule } from '../../audit/audit.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { SessionService } from '../../auth/session.service.js';
import { HubProxyModule } from '../../hub-proxy/hub-proxy.module.js';
import { createResellerHubFake } from '../../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../../testing/test-app.js';
import { createUser, signInAs } from '../../testing/users.js';
import { AdminUsersModule } from '../users/admin-users.module.js';
import { ImpersonationModule } from './impersonation.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

/** The customer that has a portal login, and the one that never accepted the invitation. */
const LINKED_CUSTOMER = 501;
const INVITED_CUSTOMER = 502;
const UNLINKED_CUSTOMER = 503;

describe('ImpersonationController', () => {
  let t: TestApp;
  let adminId: number;
  let customerId: number;

  const hub = createResellerHubFake({
    'GET /agents': { body: { data: [{ id: 'agent_1', name: 'Support' }] } },
  });

  beforeAll(async () => {
    t = await createTestApp(
      [AuthModule, AuditModule, AdminUsersModule, ImpersonationModule, AccountModule, HubProxyModule],
      { hub },
    );
    await t.db.reset();
    adminId = (await signInAs(t, { email: 'operator@example.com', role: 'admin' })).id;
    customerId = await createUser(t, {
      email: 'customer@example.com',
      role: 'user',
      echocallCustomerId: LINKED_CUSTOMER,
      acceptedAt: new Date(),
    });
    await createUser(t, {
      email: 'invited@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: INVITED_CUSTOMER,
    });
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  /** A fresh session for one account; every spec gets its own so they cannot disturb each other. */
  async function sessionOf(userId: number): Promise<string> {
    const sessions = t.moduleRef.get(SessionService, { strict: false });
    const { token } = await sessions.create(userId);
    return `ecl_session=${token}`;
  }

  /** Opens a session as the linked customer and returns the cookie it now carries. */
  async function impersonate(operator = adminId): Promise<string> {
    const cookie = await sessionOf(operator);
    const res = await api()
      .post(`/api/admin/customers/${LINKED_CUSTOMER}/impersonate`)
      .set({ Cookie: cookie, ...XHR });
    expect(res.status).toBe(200);
    return cookie;
  }

  async function auditActions(): Promise<string[]> {
    const res = await api()
      .get('/api/admin/audit')
      .set('Cookie', await sessionOf(adminId));
    return (res.body.data as { action: string }[]).map((row) => row.action);
  }

  it('is reserved for administrators', async () => {
    const asCustomer = await sessionOf(customerId);
    const res = await api()
      .post(`/api/admin/customers/${LINKED_CUSTOMER}/impersonate`)
      .set({ Cookie: asCustomer, ...XHR });

    expect(res.status).toBe(403);
  });

  it('hands the session to the customer and records who opened it', async () => {
    const cookie = await sessionOf(adminId);

    const started = await api()
      .post(`/api/admin/customers/${LINKED_CUSTOMER}/impersonate`)
      .set({ Cookie: cookie, ...XHR });

    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({
      id: customerId,
      email: 'customer@example.com',
      role: 'user',
      echocallCustomerId: LINKED_CUSTOMER,
      impersonator: { id: adminId, email: 'operator@example.com' },
    });
    const me = await api().get('/api/auth/me').set('Cookie', cookie);
    expect(me.body).toMatchObject({
      id: customerId,
      impersonator: { id: adminId, email: 'operator@example.com' },
    });
    expect(await auditActions()).toContain('impersonation.start');
  });

  it('runs hub calls in the customer context while it lasts', async () => {
    const cookie = await impersonate();
    const before = hub.calls.length;

    const res = await api().get('/api/hub/agents').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(hub.calls[before]?.headers.get('x-echocall-customer')).toBe(String(LINKED_CUSTOMER));
  });

  it('keeps the administration out of reach while it lasts', async () => {
    const cookie = await impersonate();

    expect((await api().get('/api/admin/users').set('Cookie', cookie)).status).toBe(403);
    expect((await api().get('/api/admin/audit').set('Cookie', cookie)).status).toBe(403);
  });

  it('never lets the operator change the customer account', async () => {
    const cookie = await impersonate();

    const profile = await api()
      .patch('/api/account/profile')
      .set({ Cookie: cookie, ...XHR })
      .send({ firstName: 'Renamed' });

    expect(profile.status).toBe(403);
    expect(profile.body.error.code).toBe('impersonation_read_only');
  });

  it('refuses to open a second customer on top of the first', async () => {
    const cookie = await impersonate();

    const again = await api()
      .post(`/api/admin/customers/${LINKED_CUSTOMER}/impersonate`)
      .set({ Cookie: cookie, ...XHR });

    // The session is the customer's now, so the guard answers before the check does.
    expect(again.status).toBe(403);
  });

  it('hands the session back to the operator and records that too', async () => {
    const cookie = await impersonate();

    const stopped = await api()
      .post('/api/auth/impersonation/stop')
      .set({ Cookie: cookie, ...XHR });

    expect(stopped.status).toBe(200);
    expect(stopped.body).toMatchObject({
      id: adminId,
      email: 'operator@example.com',
      role: 'admin',
      impersonator: null,
    });
    const me = await api().get('/api/auth/me').set('Cookie', cookie);
    expect(me.body).toMatchObject({ id: adminId, role: 'admin', impersonator: null });
    expect((await api().get('/api/admin/users').set('Cookie', cookie)).status).toBe(200);
    expect(await auditActions()).toContain('impersonation.stop');
  });

  it('ends the session instead of handing it to an operator that is gone', async () => {
    const leaving = await createUser(t, { email: 'leaving@example.com', role: 'admin' });
    const cookie = await impersonate(leaving);
    await t.db.db.deleteFrom('users').where('id', '=', leaving).execute();

    const stopped = await api()
      .post('/api/auth/impersonation/stop')
      .set({ Cookie: cookie, ...XHR });

    expect(stopped.status).toBe(401);
    expect(stopped.body.error.code).toBe('session_ended');
    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('answers a plain session that there is nothing to go back to', async () => {
    const res = await api()
      .post('/api/auth/impersonation/stop')
      .set({ Cookie: await sessionOf(customerId), ...XHR });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('not_impersonating');
  });

  it('opens only customers that have a login they have already used', async () => {
    const cookie = await sessionOf(adminId);

    const invited = await api()
      .post(`/api/admin/customers/${INVITED_CUSTOMER}/impersonate`)
      .set({ Cookie: cookie, ...XHR });
    const unlinked = await api()
      .post(`/api/admin/customers/${UNLINKED_CUSTOMER}/impersonate`)
      .set({ Cookie: cookie, ...XHR });

    expect(invited.status).toBe(400);
    expect(invited.body.error.code).toBe('login_not_active');
    expect(unlinked.status).toBe(400);
    expect(unlinked.body.error.code).toBe('no_portal_login');
  });

  it('never opens another administrator', async () => {
    const other = 504;
    await createUser(t, { email: 'second-admin@example.com', role: 'admin', echocallCustomerId: other });

    const res = await api()
      .post(`/api/admin/customers/${other}/impersonate`)
      .set({ Cookie: await sessionOf(adminId), ...XHR });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('cannot_impersonate_admin');
  });
});
