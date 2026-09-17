import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../../auth/auth.module.js';
import { createResellerHubFake } from '../../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../../testing/test-app.js';
import { type SignedInUser, signInAs } from '../../testing/users.js';
import { AdminHubProxyModule } from './admin-hub-proxy.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('AdminHubProxyController', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  let admin: SignedInUser;
  let user: SignedInUser;
  const hub = createResellerHubFake({
    'GET /resellers/customers': {
      body: {
        data: [{ id: 501, email: 'customer@example.com' }],
        pagination: { page: 2, perPage: 25, total: 1 },
      },
    },
    'POST /resellers/customers': (call) => ({
      status: 201,
      body: { data: { id: 777, echo: JSON.parse(call.body ?? '{}') } },
    }),
    'GET /resellers/settings': {
      body: { data: { companyName: 'EchoCall Partner GmbH', supportEmail: 'support@example.com' } },
    },
    'PATCH /resellers/customers/42/suspend': { status: 204 },
    'GET /resellers/stats': {
      status: 403,
      body: { error: { code: 'forbidden', message: 'Reseller keys only' } },
    },
  });

  beforeAll(async () => {
    t = await createTestApp([AuthModule, AdminHubProxyModule], { hub });
    await t.db.reset();
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    user = await signInAs(t, { email: 'user@example.com', role: 'user' });
  });

  afterAll(async () => {
    await t.close();
  });

  it('forwards an allow-listed GET with its query and sends no act-as header', async () => {
    const before = hub.calls.length;
    const res = await api()
      .get('/api/admin/hub/resellers/customers?page=2&perPage=25')
      .set('Cookie', admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, perPage: 25, total: 1 });
    const call = hub.calls[before];
    expect(call.path).toBe('/resellers/customers?page=2&perPage=25');
    expect(call.headers.get('x-echocall-customer')).toBeNull();
  });

  it('leaves the name of the service alone: the operator holds that contract', async () => {
    const res = await api().get('/api/admin/hub/resellers/settings').set('Cookie', admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.companyName).toBe('EchoCall Partner GmbH');
  });

  it('forwards a POST body and returns the hub status verbatim', async () => {
    const res = await api()
      .post('/api/admin/hub/resellers/customers')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({ email: 'new@example.com', language: 'de' });

    expect(res.status).toBe(201);
    expect(res.body.data.echo).toEqual({ email: 'new@example.com', language: 'de' });
  });

  it('answers 204 without a body', async () => {
    const res = await api()
      .patch('/api/admin/hub/resellers/customers/42/suspend')
      .set('Cookie', admin.cookie)
      .set(XHR);

    expect(res.status).toBe(204);
  });

  it('passes a hub error envelope through with its status and code', async () => {
    const res = await api().get('/api/admin/hub/resellers/stats').set('Cookie', admin.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('hides everything outside the allow-list as 404', async () => {
    const before = hub.calls.length;
    const res = await api().get('/api/admin/hub/agents').set('Cookie', admin.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(hub.calls.length).toBe(before);
  });

  it('refuses a path that tries to climb out of the reseller group', async () => {
    const res = await api().get('/api/admin/hub/resellers/..%2fagents').set('Cookie', admin.cookie);

    expect(res.status).toBe(404);
  });

  it('refuses customers: the operator proxy is the admin surface', async () => {
    const res = await api().get('/api/admin/hub/resellers/customers').set('Cookie', user.cookie);

    expect(res.status).toBe(403);
  });

  it('requires a session', async () => {
    const res = await api().get('/api/admin/hub/resellers/customers');

    expect(res.status).toBe(401);
  });

  it('requires the CSRF header on mutating calls', async () => {
    const res = await api()
      .post('/api/admin/hub/resellers/customers')
      .set('Cookie', admin.cookie)
      .send({ email: 'nope@example.com' });

    expect(res.status).toBe(403);
  });
});
