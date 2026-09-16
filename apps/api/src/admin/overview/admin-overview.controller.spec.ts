import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../../auth/auth.module.js';
import { RESELLER_PROFILE } from '../../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../../testing/test-app.js';
import { createUser, type SignedInUser, signInAs } from '../../testing/users.js';
import { AdminOverviewModule } from './admin-overview.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('AdminOverviewController', () => {
  let t: TestApp;
  let admin: SignedInUser;
  let user: SignedInUser;

  beforeAll(async () => {
    t = await createTestApp([AuthModule, AdminOverviewModule]);
    await t.db.reset();
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    user = await signInAs(t, { email: 'user@example.com', role: 'user', echocallCustomerId: 501 });
    await createUser(t, {
      email: 'invited@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 502,
    });
    await createUser(t, {
      email: 'gone@example.com',
      role: 'user',
      status: 'disabled',
      echocallCustomerId: 503,
    });
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  it('is reserved for administrators', async () => {
    expect((await api().get('/api/admin/overview')).status).toBe(401);
    expect((await api().get('/api/admin/overview').set('Cookie', user.cookie)).status).toBe(403);
  });

  it('reports the hub status and the account counts', async () => {
    const res = await api().get('/api/admin/overview').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      hub: { ok: true, checkedAt: expect.any(String), role: 'reseller', email: 'operator@example.com' },
      users: { total: 4, admins: 1, users: 3, active: 2, invited: 1, disabled: 1 },
    });
  });

  it('re-checks the key on demand and reports the outcome', async () => {
    t.hub.on('GET /users/me', {
      status: 403,
      body: { error: { code: 'no_active_subscription', message: 'The subscription is not active' } },
    });
    const failed = await api().post('/api/admin/overview/hub-check').set('Cookie', admin.cookie).set(XHR);
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ ok: false, error: { code: 'no_active_subscription' } });
    expect((await api().get('/api/admin/overview').set('Cookie', admin.cookie)).body.hub.ok).toBe(false);

    t.hub.on('GET /users/me', { body: RESELLER_PROFILE });
    const recovered = await api().post('/api/admin/overview/hub-check').set('Cookie', admin.cookie).set(XHR);
    expect(recovered.body).toMatchObject({ ok: true, email: 'operator@example.com' });
  });
});
