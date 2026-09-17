import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESELLER_PROFILE } from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { createUser } from '../testing/users.js';
import { SetupModule } from './setup.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('SetupController', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([SetupModule]);
    await t.db.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  it('reports that an administrator is needed, the hub status and the default branding', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      needsAdmin: true,
      hub: { ok: true, role: 'reseller', email: 'operator@example.com' },
      branding: { productName: 'Customer Portal', primaryColor: '#2563eb', defaultLanguage: 'de' },
    });
  });

  it('validates the administrator form', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/setup/admin')
      .set(XHR)
      .send({ email: 'not-an-email', password: 'short', language: 'xx' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'email',
      'language',
      'password',
    ]);
  });

  it('creates the administrator, records it and signs them in', async () => {
    const res = await request(t.app.getHttpServer()).post('/api/setup/admin').set(XHR).send({
      email: 'Owner@Example.com',
      password: 'correct horse battery',
      firstName: 'Olivia',
      language: 'en',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      email: 'owner@example.com',
      role: 'admin',
      firstName: 'Olivia',
      lastName: null,
      language: 'en',
      echocallCustomerId: null,
      impersonator: null,
    });
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^ecl_session=[A-Za-z0-9_-]{40,}; Path=\/; Expires=.*; HttpOnly; SameSite=Lax$/);

    const me = await request(t.app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie.split(';')[0]);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('owner@example.com');

    const audit = await t.db.db.selectFrom('auditLog').selectAll().execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: res.body.id,
      action: 'setup.admin_created',
      targetType: 'user',
      targetId: String(res.body.id),
    });
    expect(audit[0].details).not.toContain('correct horse');

    const status = await request(t.app.getHttpServer()).get('/api/setup/status');
    expect(status.body.needsAdmin).toBe(false);
  });

  it('refuses a second administrator through the setup route', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/setup/admin')
      .set(XHR)
      .send({ email: 'second@example.com', password: 'correct horse battery' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('setup_completed');
    const users = await t.db.db.selectFrom('users').select('email').execute();
    expect(users.map((u) => u.email)).toEqual(['owner@example.com']);
  });

  it('re-checks the key only while the first administrator is missing', async () => {
    await t.db.reset();
    const ok = await request(t.app.getHttpServer()).post('/api/setup/hub-check').set(XHR);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, role: 'reseller' });

    t.hub.on('GET /users/me', {
      status: 401,
      body: { error: { code: 'invalid_api_key', message: 'The API key is not valid' } },
    });
    const failed = await request(t.app.getHttpServer()).post('/api/setup/hub-check').set(XHR);
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ ok: false, error: { code: 'invalid_api_key' } });
    t.hub.on('GET /users/me', { body: RESELLER_PROFILE });

    await createUser(t, { email: 'admin@example.com', role: 'admin' });
    const closed = await request(t.app.getHttpServer()).post('/api/setup/hub-check').set(XHR);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('setup_completed');
  });
});
