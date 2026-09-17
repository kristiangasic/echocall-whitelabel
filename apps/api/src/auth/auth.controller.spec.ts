import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../common/crypto.js';
import { insertReturningId } from '../db/helpers.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { encryptSecret } from '../settings/crypto.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AuthModule } from './auth.module.js';
import { TwoFactorModule } from './two-factor.module.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { generateSecret, totpCode } from './totp.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };
const PASSWORD = 'correct horse battery';
const APP_SECRET = 's'.repeat(32);
const TOTP_SECRET = generateSecret();

describe('AuthController', () => {
  let t: TestApp;
  let nextIp = 1;
  let twoFactorUserId: number;

  /** Each test gets its own client address so the per-IP throttle does not leak between tests. */
  function client() {
    const ip = `10.1.0.${nextIp++}`;
    const server = t.app.getHttpServer();
    return {
      post: (path: string) => request(server).post(path).set('X-Forwarded-For', ip).set(XHR),
      get: (path: string) => request(server).get(path).set('X-Forwarded-For', ip),
    };
  }

  beforeAll(async () => {
    t = await createTestApp([AuthModule, SettingsModule, TwoFactorModule]);
    const hash = await new PasswordService().hash(PASSWORD);
    for (const user of [
      {
        email: 'admin@example.com',
        role: 'admin' as const,
        status: 'active' as const,
        echocallCustomerId: null,
      },
      { email: 'off@example.com', role: 'user' as const, status: 'disabled' as const, echocallCustomerId: 9 },
    ]) {
      await insertReturningId(t.db.db, t.db.dialect, 'users', {
        ...user,
        passwordHash: hash,
        language: 'de',
      });
    }
    twoFactorUserId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'guarded@example.com',
      role: 'user',
      status: 'active',
      echocallCustomerId: 12,
      passwordHash: hash,
      language: 'de',
      totpSecret: encryptSecret(TOTP_SECRET, APP_SECRET),
      totpConfirmedAt: new Date(),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('refuses mutating requests without the XHR header, even on public routes', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(403);
    expect(res.body.error.code).toBe('csrf_header_missing');
  });

  it('logs in, serves /me from the cookie and logs out', async () => {
    const c = client();
    const login = await c
      .post('/api/auth/login')
      .send({ email: '  Admin@Example.com ', password: PASSWORD })
      .expect(200);
    expect(login.body).toEqual({
      id: expect.any(Number),
      email: 'admin@example.com',
      role: 'admin',
      firstName: null,
      lastName: null,
      language: 'de',
      echocallCustomerId: null,
      twoFactorEnabled: false,
      impersonator: null,
    });
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toMatch(/^ecl_session=[A-Za-z0-9_-]{40,}; Path=\/; Expires=.*; HttpOnly; SameSite=Lax$/);

    const me = await c.get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.email).toBe('admin@example.com');
    const user = await t.db.db
      .selectFrom('users')
      .select('lastLoginAt')
      .where('email', '=', 'admin@example.com')
      .executeTakeFirstOrThrow();
    expect(user.lastLoginAt).toBeInstanceOf(Date);

    const logout = await c.post('/api/auth/logout').set('Cookie', cookie).expect(204);
    expect(logout.headers['set-cookie'][0]).toMatch(/^ecl_session=;/);
    const after = await c.get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(after.body.error.code).toBe('unauthenticated');
  });

  describe('with a second factor', () => {
    /** The password step, which for this account ends in a challenge rather than a session. */
    async function firstStep(c = client()) {
      const res = await c
        .post('/api/auth/login')
        .send({ email: 'guarded@example.com', password: PASSWORD })
        .expect(202);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.body.challenge).toEqual(expect.any(String));
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      return { c, challenge: res.body.challenge as string };
    }

    it('answers the password with a challenge and no session', async () => {
      const { c, challenge } = await firstStep();
      const me = await c.get('/api/auth/me').expect(401);
      expect(me.body.error.code).toBe('unauthenticated');

      const verify = await c
        .post('/api/auth/2fa/verify')
        .send({ challenge, code: totpCode(TOTP_SECRET, Date.now()) })
        .expect(200);
      expect(verify.body.email).toBe('guarded@example.com');
      expect(verify.body.twoFactorEnabled).toBe(true);
      const cookie = verify.headers['set-cookie'][0];
      const after = await c.get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(after.body.email).toBe('guarded@example.com');
    });

    it('starts no session on a wrong code, and burns the challenge after too many tries', async () => {
      const { c, challenge } = await firstStep();
      const wrong = await c.post('/api/auth/2fa/verify').send({ challenge, code: '000000' }).expect(401);
      expect(wrong.body.error.code).toBe('invalid_code');
      expect(wrong.headers['set-cookie']).toBeUndefined();

      // The code is still typed wrong twice more, then the challenge is spent
      // and even the right code no longer helps.
      await c.post('/api/auth/2fa/verify').send({ challenge, code: '000000' }).expect(401);
      await c.post('/api/auth/2fa/verify').send({ challenge, code: '000000' }).expect(401);
      const spent = await c
        .post('/api/auth/2fa/verify')
        .send({ challenge, code: totpCode(TOTP_SECRET, Date.now()) })
        .expect(401);
      expect(spent.body.error.code).toBe('invalid_challenge');
    });

    it('refuses a challenge that has expired', async () => {
      const { c, challenge } = await firstStep();
      await t.db.db
        .updateTable('oneTimeTokens')
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where('userId', '=', twoFactorUserId)
        .where('purpose', '=', 'two_factor_challenge')
        .execute();
      const res = await c
        .post('/api/auth/2fa/verify')
        .send({ challenge, code: totpCode(TOTP_SECRET, Date.now()) })
        .expect(401);
      expect(res.body.error.code).toBe('invalid_challenge');
    });

    it('takes a recovery code once and not twice', async () => {
      await t.db.db.deleteFrom('twoFactorRecoveryCodes').where('userId', '=', twoFactorUserId).execute();
      await t.db.db
        .insertInto('twoFactorRecoveryCodes')
        .values({ userId: twoFactorUserId, codeHash: sha256Hex('abcde-fghij'), usedAt: null })
        .execute();

      const first = await firstStep();
      const used = await first.c
        .post('/api/auth/2fa/verify')
        .send({ challenge: first.challenge, code: 'ABCDE-FGHIJ' })
        .expect(200);
      expect(used.headers['set-cookie'][0]).toMatch(/^ecl_session=/);

      const second = await firstStep();
      const again = await second.c
        .post('/api/auth/2fa/verify')
        .send({ challenge: second.challenge, code: 'abcde-fghij' })
        .expect(401);
      expect(again.body.error.code).toBe('invalid_code');
    });

    it('stamps the sign-in only once the second factor is in', async () => {
      await t.db.db
        .updateTable('users')
        .set({ lastLoginAt: null })
        .where('id', '=', twoFactorUserId)
        .execute();
      const { c, challenge } = await firstStep();
      const between = await t.db.db
        .selectFrom('users')
        .select('lastLoginAt')
        .where('id', '=', twoFactorUserId)
        .executeTakeFirstOrThrow();
      expect(between.lastLoginAt).toBeNull();

      await c
        .post('/api/auth/2fa/verify')
        .send({ challenge, code: totpCode(TOTP_SECRET, Date.now()) })
        .expect(200);
      const after = await t.db.db
        .selectFrom('users')
        .select('lastLoginAt')
        .where('id', '=', twoFactorUserId)
        .executeTakeFirstOrThrow();
      expect(after.lastLoginAt).toBeInstanceOf(Date);
    });
  });

  it('distinguishes wrong passwords from disabled accounts but never reveals unknown e-mails', async () => {
    const c = client();
    const wrong = await c
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong' })
      .expect(401);
    expect(wrong.body.error.code).toBe('invalid_credentials');
    const unknown = await c
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' })
      .expect(401);
    expect(unknown.body.error.code).toBe('invalid_credentials');
    const disabled = await c
      .post('/api/auth/login')
      .send({ email: 'off@example.com', password: PASSWORD })
      .expect(403);
    expect(disabled.body.error.code).toBe('account_disabled');
    const disabledWrong = await c
      .post('/api/auth/login')
      .send({ email: 'off@example.com', password: 'wrong' })
      .expect(401);
    expect(disabledWrong.body.error.code).toBe('invalid_credentials');
  });

  it('validates the body with field details', async () => {
    const res = await client().post('/api/auth/login').send({ email: 'x' }).expect(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    );
  });

  it('rate limits login attempts per client address', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) {
      await c.post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong' }).expect(401);
    }
    const blocked = await c
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong' })
      .expect(429);
    expect(blocked.body.error.code).toBe('too_many_requests');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('answers unknown API routes with the error envelope', async () => {
    const res = await client().get('/api/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('runs the forgot and reset flow and revokes existing sessions', async () => {
    const c = client();
    const login = await c
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(200);
    const oldCookie = login.headers['set-cookie'][0];

    await c.post('/api/auth/forgot').send({ email: 'nobody@example.com' }).expect(204);
    expect(t.mail.sent).toHaveLength(0);
    await c.post('/api/auth/forgot').send({ email: 'ADMIN@example.com' }).expect(204);
    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0].to).toEqual({ email: 'admin@example.com', language: 'de', firstName: null });
    const link = new URL(t.mail.sent[0].link);
    expect(link.origin + link.pathname).toBe('http://localhost:3000/reset-password');
    const token = link.searchParams.get('token') ?? '';

    const bogus = await c
      .post('/api/auth/reset')
      .send({ token: 'x'.repeat(43), password: 'new password 123' })
      .expect(400);
    expect(bogus.body.error.code).toBe('invalid_token');
    await c.post('/api/auth/reset').send({ token, password: 'new password 123' }).expect(204);
    await c.post('/api/auth/reset').send({ token, password: 'another password' }).expect(400);

    await c.get('/api/auth/me').set('Cookie', oldCookie).expect(401);
    await client()
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD })
      .expect(401);
    await client()
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'new password 123' })
      .expect(200);
  });

  it('activates an invited account through the invitation token and signs the user in', async () => {
    const c = client();
    const userId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'new@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 42,
      language: 'fr',
    });
    const token = await t.moduleRef.get(TokenService).issue(userId, 'invite', 60_000);

    const short = await c.post('/api/auth/accept-invite').send({ token, password: 'short' }).expect(400);
    expect(short.body.error.code).toBe('validation_error');

    const accepted = await c
      .post('/api/auth/accept-invite')
      .send({ token, password: 'welcome aboard 1', firstName: ' Ada ', lastName: 'Lovelace' })
      .expect(200);
    expect(accepted.body).toMatchObject({
      id: userId,
      email: 'new@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'user',
      echocallCustomerId: 42,
    });
    const cookie = accepted.headers['set-cookie'][0];
    await c.get('/api/auth/me').set('Cookie', cookie).expect(200);

    // Accepting the invitation is the user's first sign-in, and the user list says so.
    const row = await t.db.db
      .selectFrom('users')
      .select('lastLoginAt')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(row.lastLoginAt).not.toBeNull();

    const reuse = await c
      .post('/api/auth/accept-invite')
      .send({ token, password: 'welcome aboard 1' })
      .expect(400);
    expect(reuse.body.error.code).toBe('invalid_token');
    await client()
      .post('/api/auth/login')
      .send({ email: 'new@example.com', password: 'welcome aboard 1' })
      .expect(200);
  });
});
