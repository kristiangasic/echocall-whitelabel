import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../common/crypto.js';
import { insertReturningId } from '../db/helpers.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { encryptSecret } from '../settings/crypto.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AuthModule } from './auth.module.js';
import { TwoFactorModule } from './two-factor.module.js';
import { TokenService } from './token.service.js';
import { generateSecret, totpCode } from './totp.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };
const APP_SECRET = 's'.repeat(32);
const TOTP_SECRET = generateSecret();

/** Pulls the one-time token out of the link the portal mailed. */
function tokenFrom(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

describe('AuthController', () => {
  let t: TestApp;
  let nextIp = 1;
  let twoFactorUserId: number;
  let disabledUserId: number;

  /** Each test gets its own client address so the per-IP throttle does not leak between tests. */
  function client() {
    const ip = `10.1.0.${nextIp++}`;
    const server = t.app.getHttpServer();
    return {
      post: (path: string) => request(server).post(path).set('X-Forwarded-For', ip).set(XHR),
      get: (path: string) => request(server).get(path).set('X-Forwarded-For', ip),
    };
  }

  /** Asks for a link the way the sign-in page does and hands back the token it carried. */
  async function linkFor(email: string): Promise<string> {
    t.mail.sent.length = 0;
    await client().post('/api/auth/sign-in-link').send({ email }).expect(204);
    return tokenFrom(t.mail.sent[0].link);
  }

  beforeAll(async () => {
    t = await createTestApp([AuthModule, SettingsModule, TwoFactorModule]);
    await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      echocallCustomerId: null,
      language: 'de',
      acceptedAt: new Date(),
    });
    disabledUserId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'off@example.com',
      role: 'user',
      status: 'disabled',
      echocallCustomerId: 9,
      language: 'de',
      acceptedAt: new Date(),
    });
    twoFactorUserId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'guarded@example.com',
      role: 'user',
      status: 'active',
      echocallCustomerId: 12,
      language: 'de',
      acceptedAt: new Date(),
      totpSecret: encryptSecret(TOTP_SECRET, APP_SECRET),
      totpConfirmedAt: new Date(),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('refuses mutating requests without the XHR header, even on public routes', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/auth/sign-in-link')
      .send({ email: 'admin@example.com' })
      .expect(403);
    expect(res.body.error.code).toBe('csrf_header_missing');
  });

  it('signs in through a mailed link, serves /me from the cookie and logs out', async () => {
    const c = client();
    const token = await linkFor('  Admin@Example.com ');
    expect(t.mail.sent[0].to).toEqual({ email: 'admin@example.com', language: 'de', firstName: null });

    const signIn = await c.post('/api/auth/sign-in-link/consume').send({ token }).expect(200);
    expect(signIn.body).toEqual({
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
    const cookie = signIn.headers['set-cookie'][0];
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
    /** The link step, which for this account ends in a challenge rather than a session. */
    async function firstStep(c = client()) {
      const token = await linkFor('guarded@example.com');
      const res = await c.post('/api/auth/sign-in-link/consume').send({ token }).expect(202);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.body.challenge).toEqual(expect.any(String));
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      return { c, challenge: res.body.challenge as string };
    }

    it('answers the link with a challenge and no session', async () => {
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

  it('says nothing about addresses it has no account for, and mails them nothing', async () => {
    t.mail.sent.length = 0;
    await client().post('/api/auth/sign-in-link').send({ email: 'nobody@example.com' }).expect(204);
    await client().post('/api/auth/sign-in-link').send({ email: 'off@example.com' }).expect(204);

    expect(t.mail.sent).toHaveLength(0);
  });

  it('turns a disabled account away even when it still holds a link', async () => {
    const token = await t.moduleRef.get(TokenService).issue(disabledUserId, 'sign_in', 60_000);

    const res = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(403);

    expect(res.body.error.code).toBe('account_disabled');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('validates the body with field details', async () => {
    const res = await client().post('/api/auth/sign-in-link').send({ email: 'x' }).expect(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
  });

  it('rate limits link requests per client address', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) {
      await c.post('/api/auth/sign-in-link').send({ email: 'nobody@example.com' }).expect(204);
    }
    const blocked = await c.post('/api/auth/sign-in-link').send({ email: 'nobody@example.com' }).expect(429);
    expect(blocked.body.error.code).toBe('too_many_requests');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('answers unknown API routes with the error envelope', async () => {
    const res = await client().get('/api/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('activates an invited account through the invitation token and signs the user in', async () => {
    const c = client();
    const userId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'new@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 42,
      language: 'fr',
      acceptedAt: null,
    });
    const token = await t.moduleRef.get(TokenService).issue(userId, 'invite', 60_000);

    const accepted = await c
      .post('/api/auth/accept-invite')
      .send({ token, firstName: ' Ada ', lastName: 'Lovelace' })
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
      .select(['status', 'lastLoginAt', 'acceptedAt'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('active');
    expect(row.lastLoginAt).not.toBeNull();
    expect(row.acceptedAt).toBeInstanceOf(Date);

    const reuse = await c.post('/api/auth/accept-invite').send({ token }).expect(400);
    expect(reuse.body.error.code).toBe('invalid_token');
  });

  it('refuses an invitation token at the sign-in route, and spends nothing doing so', async () => {
    const c = client();
    const userId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'mixed@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 43,
      language: 'de',
      acceptedAt: null,
    });
    const invite = await t.moduleRef.get(TokenService).issue(userId, 'invite', 60_000);

    const wrongRoute = await c.post('/api/auth/sign-in-link/consume').send({ token: invite }).expect(400);
    expect(wrongRoute.body.error.code).toBe('invalid_token');

    await c.post('/api/auth/accept-invite').send({ token: invite }).expect(200);
  });

  describe('the audit log', () => {
    /** Its own account, because the entries are counted against what this one did. */
    const LEDGER = 'ledger@example.com';
    let ledgerId: number;

    beforeAll(async () => {
      ledgerId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
        email: LEDGER,
        role: 'user',
        status: 'active',
        echocallCustomerId: 77,
        language: 'de',
        acceptedAt: new Date(),
      });
    });

    async function entries(action: string) {
      return t.db.db.selectFrom('auditLog').selectAll().where('action', '=', action).execute();
    }

    it('records a sign-in with the account that was let in', async () => {
      const before = (await entries('auth.signed_in')).length;
      const token = await linkFor(LEDGER);
      await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(200);
      const rows = await entries('auth.signed_in');
      expect(rows).toHaveLength(before + 1);
      expect(rows.at(-1)).toMatchObject({
        action: 'auth.signed_in',
        targetType: 'user',
        actorUserId: ledgerId,
      });
    });

    it('records a refused sign-in with the address and the reason, never the token', async () => {
      const token = await t.moduleRef.get(TokenService).issue(disabledUserId, 'sign_in', 60_000);
      await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(403);

      const rows = await entries('auth.sign_in_failed');
      const details = rows.map((row) => String(row.details));
      expect(details.some((row) => row.includes('account_disabled') && row.includes('off@example.com'))).toBe(
        true,
      );
      expect(details.join(' ')).not.toContain(token);
    });
  });
});
