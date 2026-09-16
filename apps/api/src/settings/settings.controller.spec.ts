import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { type SignedInUser, signInAs } from '../testing/users.js';
import { DEFAULT_BRANDING } from './branding.js';
import { SettingsModule } from './settings.module.js';
import { SettingsService } from './settings.service.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('SettingsController', () => {
  let t: TestApp;
  let admin: SignedInUser;
  let user: SignedInUser;

  beforeAll(async () => {
    t = await createTestApp([AuthModule, SettingsModule]);
    await t.db.reset();
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    user = await signInAs(t, { email: 'user@example.com', role: 'user' });
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  it('serves the public branding to anyone and the admin routes to administrators only', async () => {
    const pub = await api().get('/api/settings/public');
    expect(pub.status).toBe(200);
    expect(pub.body).toEqual(DEFAULT_BRANDING);

    expect((await api().get('/api/admin/settings/branding')).status).toBe(401);
    expect((await api().get('/api/admin/settings/branding').set('Cookie', user.cookie)).status).toBe(403);
    expect((await api().get('/api/admin/audit').set('Cookie', user.cookie)).status).toBe(403);
    const own = await api().get('/api/admin/settings/branding').set('Cookie', admin.cookie);
    expect(own.status).toBe(200);
    expect(own.body).toEqual(DEFAULT_BRANDING);
  });

  it('validates and stores the branding, including a large logo, and records the change', async () => {
    const bad = await api()
      .put('/api/admin/settings/branding')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({ ...DEFAULT_BRANDING, primaryColor: 'blue', logoDataUrl: 'data:text/html;base64,AAAA' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'logoDataUrl',
      'primaryColor',
    ]);

    const logo = 'data:image/png;base64,' + 'A'.repeat(150 * 1024);
    const ok = await api().put('/api/admin/settings/branding').set('Cookie', admin.cookie).set(XHR).send({
      productName: '  Acme Portal ',
      logoDataUrl: logo,
      primaryColor: '#FF8800',
      supportEmail: 'Help@Acme.example',
      imprintUrl: 'https://acme.example/imprint',
      privacyUrl: null,
      defaultLanguage: 'fr',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      productName: 'Acme Portal',
      logoDataUrl: logo,
      primaryColor: '#ff8800',
      supportEmail: 'help@acme.example',
      imprintUrl: 'https://acme.example/imprint',
      privacyUrl: null,
      defaultLanguage: 'fr',
    });
    expect((await api().get('/api/settings/public')).body.productName).toBe('Acme Portal');

    const audit = await api().get('/api/admin/audit').set('Cookie', admin.cookie);
    expect(audit.status).toBe(200);
    expect(audit.body.meta).toEqual({ page: 1, limit: 50, total: 1 });
    expect(audit.body.data[0]).toMatchObject({
      actorUserId: admin.id,
      actorEmail: 'admin@example.com',
      action: 'settings.branding_updated',
      details: {
        changed: [
          'productName',
          'logoDataUrl',
          'primaryColor',
          'supportEmail',
          'imprintUrl',
          'defaultLanguage',
        ],
      },
    });
    expect((await api().get('/api/admin/audit?limit=0').set('Cookie', admin.cookie)).status).toBe(400);
  });

  it('manages the SMTP settings without ever returning the password', async () => {
    const empty = await api().get('/api/admin/settings/smtp').set('Cookie', admin.cookie);
    expect(empty.body).toEqual({
      configured: false,
      source: null,
      host: null,
      port: null,
      secure: false,
      user: null,
      from: null,
      hasPassword: false,
    });

    const saved = await api()
      .put('/api/admin/settings/smtp')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({
        host: 'smtp.acme.example',
        port: '587',
        secure: false,
        user: 'mailer',
        pass: 'top-secret',
        from: 'Portal@Acme.example',
      });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      configured: true,
      source: 'settings',
      host: 'smtp.acme.example',
      port: 587,
      secure: false,
      user: 'mailer',
      from: 'portal@acme.example',
      hasPassword: true,
    });
    expect(JSON.stringify(saved.body)).not.toContain('top-secret');

    const settings = t.moduleRef.get(SettingsService, { strict: false });
    const kept = await api()
      .put('/api/admin/settings/smtp')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({
        host: 'smtp.acme.example',
        port: 465,
        secure: true,
        user: 'mailer',
        pass: '',
        from: 'portal@acme.example',
      });
    expect(kept.body).toMatchObject({ port: 465, secure: true, hasPassword: true });
    expect((await settings.getSmtp())?.pass).toBe('top-secret');

    const cleared = await api()
      .put('/api/admin/settings/smtp')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({
        host: 'smtp.acme.example',
        port: 465,
        secure: true,
        user: null,
        pass: null,
        from: 'portal@acme.example',
      });
    expect(cleared.body).toMatchObject({ user: null, hasPassword: false });

    const audit = await api().get('/api/admin/audit?limit=5').set('Cookie', admin.cookie);
    expect(audit.body.data[0]).toMatchObject({
      action: 'settings.smtp_updated',
      details: { host: 'smtp.acme.example' },
    });
    expect(JSON.stringify(audit.body)).not.toContain('top-secret');
  });

  it('sends a test mail through the active settings and reports server failures', async () => {
    const sent = await api()
      .post('/api/admin/settings/smtp/test')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({ to: 'me@acme.example' });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ sent: true });
    expect(t.mailbox.messages).toHaveLength(1);
    expect(t.mailbox.messages[0]).toMatchObject({
      to: 'me@acme.example',
      from: '"Acme Portal" <portal@acme.example>',
      subject: 'Message de test de Acme Portal',
      smtp: { host: 'smtp.acme.example', port: 465 },
    });

    t.mailbox.fail(new Error('Connection refused'));
    const failed = await api()
      .post('/api/admin/settings/smtp/test')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({ to: 'me@acme.example' });
    expect(failed.status).toBe(502);
    expect(failed.body.error).toMatchObject({
      code: 'smtp_failed',
      message: expect.stringContaining('Connection refused'),
    });
    t.mailbox.fail(null);
  });

  it('removes the stored SMTP settings', async () => {
    const res = await api().delete('/api/admin/settings/smtp').set('Cookie', admin.cookie).set(XHR);
    expect(res.status).toBe(204);
    expect((await api().get('/api/admin/settings/smtp').set('Cookie', admin.cookie)).body.configured).toBe(
      false,
    );
    const test = await api()
      .post('/api/admin/settings/smtp/test')
      .set('Cookie', admin.cookie)
      .set(XHR)
      .send({ to: 'me@acme.example' });
    expect(test.status).toBe(409);
    expect(test.body.error.code).toBe('mail_not_configured');
  });
});
