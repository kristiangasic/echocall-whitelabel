import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from '../db/helpers.js';
import { SettingsModule } from '../settings/settings.module.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { signInAs } from '../testing/users.js';
import { AuthModule } from './auth.module.js';
import { TwoFactorModule } from './two-factor.module.js';
import { totpCode } from './totp.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('TwoFactorController', () => {
  let t: TestApp;
  let userId: number;
  let cookie: string;
  let nextIp = 1;

  function client() {
    const ip = `10.4.0.${nextIp++}`;
    const server = t.app.getHttpServer();
    return {
      post: (path: string) => request(server).post(path).set('X-Forwarded-For', ip).set(XHR),
      delete: (path: string) => request(server).delete(path).set('X-Forwarded-For', ip).set(XHR),
      get: (path: string) => request(server).get(path).set('X-Forwarded-For', ip),
    };
  }

  /** The secret the portal handed out, as the user's authenticator would hold it. */
  async function enrol(): Promise<string> {
    const res = await client().post('/api/auth/2fa/setup').set('Cookie', cookie).expect(200);
    return res.body.secret;
  }

  beforeAll(async () => {
    t = await createTestApp([AuthModule, SettingsModule, TwoFactorModule]);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.db.reset();
    const signedIn = await signInAs(t, {
      email: 'lena@example.com',
      role: 'admin',
      echocallCustomerId: null,
      language: 'de',
    });
    userId = signedIn.id;
    cookie = signedIn.cookie;
  });

  it('refuses enrolment without a session', async () => {
    const res = await client().post('/api/auth/2fa/setup').expect(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('hands out a secret, its QR code and the link an app can scan', async () => {
    const res = await client().post('/api/auth/2fa/setup').set('Cookie', cookie).expect(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.body.otpauthUrl).toContain(`secret=${res.body.secret}`);
    expect(res.body.otpauthUrl).toContain('lena%40example.com');
    expect(res.body.qrSvg.startsWith('<svg')).toBe(true);

    // Nothing counts until a code proves the secret arrived.
    const me = await client().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.twoFactorEnabled).toBe(false);
  });

  it('never stores the secret in the clear', async () => {
    const secret = await enrol();
    const row = await t.db.db
      .selectFrom('users')
      .select(['totpSecret', 'totpConfirmedAt'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(row.totpSecret).not.toBeNull();
    expect(row.totpSecret).not.toContain(secret);
    expect(row.totpSecret?.startsWith('v1:')).toBe(true);
    expect(row.totpConfirmedAt).toBeNull();
  });

  it('refuses a wrong code and leaves the account without a second factor', async () => {
    await enrol();
    const res = await client()
      .post('/api/auth/2fa/activate')
      .set('Cookie', cookie)
      .send({ code: '000000' })
      .expect(400);
    expect(res.body.error.code).toBe('invalid_code');

    const me = await client().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.twoFactorEnabled).toBe(false);
  });

  it('activates on the current code, returns recovery codes once and records it', async () => {
    const secret = await enrol();
    const res = await client()
      .post('/api/auth/2fa/activate')
      .set('Cookie', cookie)
      .send({ code: totpCode(secret, Date.now()) })
      .expect(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    for (const code of res.body.recoveryCodes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);

    const me = await client().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.twoFactorEnabled).toBe(true);

    const stored = await t.db.db
      .selectFrom('twoFactorRecoveryCodes')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    expect(stored).toHaveLength(10);
    for (const row of stored) {
      expect(res.body.recoveryCodes).not.toContain(row.codeHash);
      expect(row.usedAt).toBeNull();
    }

    const audit = await t.db.db.selectFrom('auditLog').selectAll().execute();
    expect(audit.map((row) => row.action)).toContain('account.two_factor_enabled');
  });

  it('refuses a second enrolment while one is in force', async () => {
    const secret = await enrol();
    await client()
      .post('/api/auth/2fa/activate')
      .set('Cookie', cookie)
      .send({ code: totpCode(secret, Date.now()) })
      .expect(200);

    const again = await client().post('/api/auth/2fa/setup').set('Cookie', cookie).expect(409);
    expect(again.body.error.code).toBe('two_factor_already_enabled');
  });

  // An operator who could enrol a second factor while viewing the portal as a
  // customer would walk away holding that customer's key.
  it('refuses every change while an operator is viewing the portal as this account', async () => {
    const operatorId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'operator@example.com',
      role: 'admin',
      status: 'active',
      echocallCustomerId: null,
      firstName: null,
      lastName: null,
      language: 'de',
      acceptedAt: new Date(),
    });
    await t.db.db
      .updateTable('sessions')
      .set({ impersonatorId: operatorId })
      .where('userId', '=', userId)
      .execute();

    const setup = await client().post('/api/auth/2fa/setup').set('Cookie', cookie).expect(403);
    expect(setup.body.error.code).toBe('impersonation_read_only');
    const activate = await client()
      .post('/api/auth/2fa/activate')
      .set('Cookie', cookie)
      .send({ code: '123456' })
      .expect(403);
    expect(activate.body.error.code).toBe('impersonation_read_only');
    const remove = await client()
      .delete('/api/auth/2fa')
      .set('Cookie', cookie)
      .send({ code: '123456' })
      .expect(403);
    expect(remove.body.error.code).toBe('impersonation_read_only');
  });

  // There is no password to ask for, so the factor itself is what proves the
  // person switching it off is the one who set it up.
  it('switches the second factor off only against a current code', async () => {
    const secret = await enrol();
    await client()
      .post('/api/auth/2fa/activate')
      .set('Cookie', cookie)
      .send({ code: totpCode(secret, Date.now()) })
      .expect(200);

    const wrong = await client()
      .delete('/api/auth/2fa')
      .set('Cookie', cookie)
      .send({ code: '000000' })
      .expect(403);
    expect(wrong.body.error.code).toBe('invalid_code');

    await client()
      .delete('/api/auth/2fa')
      .set('Cookie', cookie)
      .send({ code: totpCode(secret, Date.now()) })
      .expect(204);

    const me = await client().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.twoFactorEnabled).toBe(false);
    const left = await t.db.db
      .selectFrom('twoFactorRecoveryCodes')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    expect(left).toEqual([]);
    const audit = await t.db.db.selectFrom('auditLog').select('action').execute();
    expect(audit.map((row) => row.action)).toContain('account.two_factor_disabled');
  });
});
