import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from '../db/helpers.js';
import { encryptSecret } from '../settings/crypto.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { AuthModule } from './auth.module.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { generateSecret, totpCode } from './totp.js';
import { TwoFactorModule } from './two-factor.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };
const APP_SECRET = 's'.repeat(32);
const TOTP_SECRET = generateSecret();

/** Pulls the one-time token out of the link the portal mailed. */
function tokenFrom(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

describe('Sign-in links', () => {
  let t: TestApp;
  let settings: SettingsService;
  let nextIp = 1;

  function client() {
    const ip = `10.5.0.${nextIp++}`;
    return {
      post: (path: string) => request(t.app.getHttpServer()).post(path).set('X-Forwarded-For', ip).set(XHR),
      get: (path: string) => request(t.app.getHttpServer()).get(path).set('X-Forwarded-For', ip),
    };
  }

  /** Asks for a link and hands back the token it carried. */
  async function linkFor(email: string): Promise<string> {
    t.mail.sent.length = 0;
    await client().post('/api/auth/sign-in-link').send({ email }).expect(204);
    return tokenFrom(t.mail.sent[0].link);
  }

  beforeAll(async () => {
    t = await createTestApp([AuthModule, SettingsModule, TwoFactorModule]);
    settings = t.moduleRef.get(SettingsService);
    await t.db.reset();
    const hash = await new PasswordService().hash('correct horse battery');
    // Someone who signed up without ever choosing a password: the link is the only way in.
    await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'linkonly@example.com',
      role: 'user',
      status: 'active',
      echocallCustomerId: 31,
      passwordHash: null,
      language: 'en',
    });
    await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'both@example.com',
      role: 'admin',
      status: 'active',
      echocallCustomerId: null,
      passwordHash: hash,
      language: 'en',
    });
    await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'off@example.com',
      role: 'user',
      status: 'disabled',
      echocallCustomerId: 32,
      passwordHash: hash,
      language: 'en',
    });
    await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'guarded@example.com',
      role: 'user',
      status: 'active',
      echocallCustomerId: 33,
      passwordHash: hash,
      language: 'en',
      totpSecret: encryptSecret(TOTP_SECRET, APP_SECRET),
      totpConfirmedAt: new Date(),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await settings.setRegistration({ selfServiceEnabled: false, signInLinksEnabled: true });
    t.mail.sent.length = 0;
  });

  it('does not answer while the operator has links switched off', async () => {
    await settings.setRegistration({ selfServiceEnabled: false, signInLinksEnabled: false });

    const res = await client().post('/api/auth/sign-in-link').send({ email: 'both@example.com' }).expect(404);

    expect(res.body.error.code).toBe('sign_in_links_disabled');
    expect(t.mail.sent).toHaveLength(0);
  });

  it('mails a link to an account that exists', async () => {
    await client().post('/api/auth/sign-in-link').send({ email: 'both@example.com' }).expect(204);

    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0].kind).toBe('sign_in_link');
    expect(new URL(t.mail.sent[0].link).pathname).toBe('/sign-in');
  });

  it('answers the same for an address without an account, and sends nothing', async () => {
    await client().post('/api/auth/sign-in-link').send({ email: 'nobody@example.com' }).expect(204);
    await client().post('/api/auth/sign-in-link').send({ email: 'off@example.com' }).expect(204);

    expect(t.mail.sent).toHaveLength(0);
  });

  it('signs an account in that has no password at all', async () => {
    const token = await linkFor('linkonly@example.com');

    const res = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(200);

    expect(res.body).toMatchObject({ email: 'linkonly@example.com', role: 'user' });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    const me = await client().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.email).toBe('linkonly@example.com');
  });

  it('refuses the password of an account that has none', async () => {
    const res = await client()
      .post('/api/auth/login')
      .send({ email: 'linkonly@example.com', password: 'correct horse battery' })
      .expect(401);

    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('spends the link, so a second visit to the same one is refused', async () => {
    const token = await linkFor('both@example.com');
    await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(200);

    const again = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(400);

    expect(again.body.error.code).toBe('invalid_token');
  });

  it('replaces an earlier link when a second one is asked for', async () => {
    const first = await linkFor('both@example.com');
    const second = await linkFor('both@example.com');

    await client().post('/api/auth/sign-in-link/consume').send({ token: first }).expect(400);
    await client().post('/api/auth/sign-in-link/consume').send({ token: second }).expect(200);
  });

  it('still asks for the second factor of an account that has one', async () => {
    const token = await linkFor('guarded@example.com');

    const res = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(202);

    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.challenge).toBeTruthy();
    const done = await client()
      .post('/api/auth/2fa/verify')
      .send({ challenge: res.body.challenge, code: totpCode(TOTP_SECRET, Date.now()) })
      .expect(200);
    expect(done.body.email).toBe('guarded@example.com');
  });

  it('lets an invited account start without ever choosing a password', async () => {
    const id = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'fresh@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 34,
      language: 'en',
    });
    const token = await t.moduleRef.get(TokenService).issue(id, 'invite', 60_000);

    const res = await client().post('/api/auth/accept-invite').send({ token, firstName: 'Ada' }).expect(200);

    expect(res.body).toMatchObject({ email: 'fresh@example.com', firstName: 'Ada' });
    const row = await t.db.db
      .selectFrom('users')
      .select(['status', 'passwordHash'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'active', passwordHash: null });
  });

  it('asks for a password on an invitation while links are off', async () => {
    await settings.setRegistration({ selfServiceEnabled: false, signInLinksEnabled: false });
    const id = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'needs-password@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 35,
      language: 'en',
    });
    const token = await t.moduleRef.get(TokenService).issue(id, 'invite', 60_000);

    const res = await client().post('/api/auth/accept-invite').send({ token }).expect(400);

    expect(res.body.error.code).toBe('password_required');
    // A refused form must not spend the invitation.
    await settings.setRegistration({ selfServiceEnabled: false, signInLinksEnabled: true });
    await client().post('/api/auth/accept-invite').send({ token }).expect(200);
  });

  it('refuses a link once the operator has switched links off again', async () => {
    const token = await linkFor('both@example.com');
    await settings.setRegistration({ selfServiceEnabled: false, signInLinksEnabled: false });

    const res = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(404);

    expect(res.body.error.code).toBe('sign_in_links_disabled');
  });
});
