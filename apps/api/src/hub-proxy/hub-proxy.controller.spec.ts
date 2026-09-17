import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { createResellerHubFake } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { type SignedInUser, signInAs } from '../testing/users.js';
import { HubProxyModule } from './hub-proxy.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('HubProxyController', () => {
  let t: TestApp;
  const api = () => request(t.app.getHttpServer());
  let user: SignedInUser;
  let admin: SignedInUser;
  let unlinked: SignedInUser;
  const hub = createResellerHubFake({
    'GET /agents': { body: { data: [{ id: 'agent_1', name: 'Support' }] } },
    'POST /agents': (call) => ({ status: 201, body: { id: 'agent_2', echo: JSON.parse(call.body ?? '{}') } }),
    'GET /conversations': { body: { data: [], pagination: { page: 2 } } },
    'PATCH /notifications/read-all': { status: 204 },
    'GET /integrations/types': {
      body: {
        data: [
          {
            name: 'Zapier',
            description: 'Connect EchoCall to 5000+ apps through Zapier.',
            docsUrl: 'https://hub.echocall.de/docs/zapier',
          },
        ],
      },
    },
    'GET /billing/balance': {
      status: 402,
      body: { error: { code: 'insufficient_balance', message: 'Top up first' } },
    },
  });

  beforeAll(async () => {
    t = await createTestApp([AuthModule, HubProxyModule], { hub });
    await t.db.reset();
    user = await signInAs(t, { email: 'user@example.com', role: 'user' });
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    unlinked = await signInAs(t, {
      email: 'unlinked@example.com',
      role: 'user',
      echocallCustomerId: null,
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('forwards an allow-listed GET with query in the customer context', async () => {
    const before = hub.calls.length;
    const res = await api().get('/api/hub/conversations?status=open&page=2').set('Cookie', user.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pagination: { page: 2 } });
    const call = hub.calls[before];
    expect(call.path).toBe('/conversations?status=open&page=2');
    expect(call.headers.get('x-echocall-customer')).toBe('501');
  });

  it('lets the portal name stand in for the service in text the customer reads', async () => {
    const res = await api().get('/api/hub/integrations/types').set('Cookie', user.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data[0].description).toBe(
      'Connect Customer Portal to 5000+ apps through Zapier.',
    );
    expect(res.body.data[0].docsUrl).toBe('https://hub.echocall.de/docs/zapier');
  });

  it('forwards a POST body and returns the hub status verbatim', async () => {
    const res = await api()
      .post('/api/hub/agents')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({ name: 'Sales', language: 'de' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'agent_2', echo: { name: 'Sales', language: 'de' } });
  });

  it('passes hub error envelopes through with their status and code', async () => {
    const res = await api().get('/api/hub/billing/balance').set('Cookie', user.cookie);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('insufficient_balance');
  });

  it('answers 204 without a body', async () => {
    const res = await api()
      .patch('/api/hub/notifications/read-all')
      .set('Cookie', user.cookie)
      .set(XHR);
    expect(res.status).toBe(204);
  });

  it('hides everything outside the allow-list as 404', async () => {
    const res = await api().get('/api/hub/resellers/customers').set('Cookie', user.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(hub.calls.some((c) => c.path.startsWith('/resellers'))).toBe(false);
  });

  it('refuses admins: the proxy is the customer surface', async () => {
    const res = await api().get('/api/hub/agents').set('Cookie', admin.cookie);
    expect(res.status).toBe(403);
  });

  it('answers 409 for a user without a linked customer', async () => {
    const res = await api().get('/api/hub/agents').set('Cookie', unlinked.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('customer_not_linked');
  });

  it('requires a session', async () => {
    const res = await api().get('/api/hub/agents');
    expect(res.status).toBe(401);
  });

  it('requires the CSRF header on mutating calls', async () => {
    const res = await api().post('/api/hub/agents').set('Cookie', user.cookie).send({});
    expect(res.status).toBe(403);
  });
});
