import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertReturningId } from '../db/helpers.js';
import { SettingsModule } from '../settings/settings.module.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { AuthModule } from './auth.module.js';
import { TokenService } from './token.service.js';
import { TwoFactorModule } from './two-factor.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

/** Pulls the one-time token out of the link the portal mailed. */
function tokenFrom(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

/**
 * The link is the whole credential in this portal, so this spec is about the
 * token itself: where it points, how long it lives, and how thoroughly it is
 * spent. Who is let in and who is turned away is in the controller spec.
 */
describe('Sign-in links', () => {
  let t: TestApp;
  let nextIp = 1;
  let userId: number;

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
    await t.db.reset();
    userId = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'reader@example.com',
      role: 'user',
      status: 'active',
      echocallCustomerId: 31,
      language: 'fr',
      firstName: 'Amélie',
      acceptedAt: new Date(),
    });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.mail.sent.length = 0;
  });

  it('mails a link to the sign-in page, in the language of the account', async () => {
    await client().post('/api/auth/sign-in-link').send({ email: 'reader@example.com' }).expect(204);

    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0].kind).toBe('sign_in_link');
    expect(t.mail.sent[0].to).toEqual({
      email: 'reader@example.com',
      language: 'fr',
      firstName: 'Amélie',
    });
    const link = new URL(t.mail.sent[0].link);
    expect(link.origin + link.pathname).toBe('http://localhost:3000/sign-in');
    expect(link.searchParams.get('token')).toBeTruthy();
  });

  it('spends the link, so a second visit to the same one is refused', async () => {
    const token = await linkFor('reader@example.com');
    await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(200);

    const again = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(400);

    expect(again.body.error.code).toBe('invalid_token');
  });

  it('replaces an earlier link when a second one is asked for', async () => {
    const first = await linkFor('reader@example.com');
    const second = await linkFor('reader@example.com');

    await client().post('/api/auth/sign-in-link/consume').send({ token: first }).expect(400);
    await client().post('/api/auth/sign-in-link/consume').send({ token: second }).expect(200);
  });

  it('refuses a link that sat in the inbox for too long', async () => {
    const token = await linkFor('reader@example.com');
    await t.db.db
      .updateTable('oneTimeTokens')
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where('userId', '=', userId)
      .where('purpose', '=', 'sign_in')
      .execute();

    const res = await client().post('/api/auth/sign-in-link/consume').send({ token }).expect(400);

    expect(res.body.error.code).toBe('invalid_token');
  });

  it('keeps only the hash of the link, never the link itself', async () => {
    const token = await linkFor('reader@example.com');

    const row = await t.db.db
      .selectFrom('oneTimeTokens')
      .select(['tokenHash', 'purpose'])
      .where('userId', '=', userId)
      .where('usedAt', 'is', null)
      .executeTakeFirstOrThrow();
    expect(row.purpose).toBe('sign_in');
    expect(row.tokenHash).not.toBe(token);
  });

  it('lets an invited account start without ever choosing anything', async () => {
    const id = await insertReturningId(t.db.db, t.db.dialect, 'users', {
      email: 'fresh@example.com',
      role: 'user',
      status: 'invited',
      echocallCustomerId: 34,
      language: 'en',
      acceptedAt: null,
    });
    const token = await t.moduleRef.get(TokenService).issue(id, 'invite', 60_000);

    const res = await client().post('/api/auth/accept-invite').send({ token, firstName: 'Ada' }).expect(200);

    expect(res.body).toMatchObject({ email: 'fresh@example.com', firstName: 'Ada' });
    const row = await t.db.db
      .selectFrom('users')
      .select(['status', 'acceptedAt'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('active');
    expect(row.acceptedAt).toBeInstanceOf(Date);

    // From here the account uses the same links as everyone else.
    const next = await linkFor('fresh@example.com');
    await client().post('/api/auth/sign-in-link/consume').send({ token: next }).expect(200);
  });
});
