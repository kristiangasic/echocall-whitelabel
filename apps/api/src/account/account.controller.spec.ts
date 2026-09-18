import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../auth/auth.module.js';
import { SessionService } from '../auth/session.service.js';
import { sha256Hex } from '../common/crypto.js';
import {
  createResellerHubFake,
  type HubFakeCall,
  type HubFakeReply,
  RESELLER_PROFILE,
} from '../testing/hub-fake.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { type SignedInUser, signInAs } from '../testing/users.js';
import { AccountModule } from './account.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

const CUSTOMER_PROFILE = {
  id: 501,
  email: 'kunde@example.com',
  name: 'Kunde GmbH',
  role: 'user',
  avatarUrl: null,
  defaultLanguage: 'de',
  resellerId: 9,
  ownResellerId: null,
};
const USAGE = {
  period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' },
  voiceMinutesUsed: 12.5,
  chatSessionsUsed: 40,
};
const LIMITS = {
  accountStatus: 'active',
  balanceEur: 25,
  voiceMinutesRemaining: 87.5,
  chatConversationsRemaining: 160,
  plan: { name: 'Starter', voiceMinutesPerMonth: 100, chatConversationsPerMonth: 200 },
};
const PDF = Buffer.from('%PDF-1.4 invoice');
const INVOICE_ROUTE = (call: HubFakeCall): HubFakeReply =>
  call.headers.get('accept') === 'application/pdf'
    ? {
        binary: PDF,
        contentType: 'application/pdf',
        headers: { 'content-disposition': 'attachment; filename="INV-2026-014.pdf"' },
      }
    : { body: { pdfUrl: '/invoices/INV-2026-014.pdf' } };
const HUB_403 = {
  status: 403,
  body: { error: { code: 'forbidden', message: 'This customer does not belong to your reseller account' } },
};

describe('AccountController', () => {
  let t: TestApp;
  let user: SignedInUser;
  let admin: SignedInUser;

  beforeAll(async () => {
    const hub = createResellerHubFake({
      'GET /users/me': (call) =>
        call.headers.get('x-echocall-customer') === '501'
          ? { body: CUSTOMER_PROFILE }
          : { body: RESELLER_PROFILE },
      'GET /users/me/usage': { body: USAGE },
      'GET /users/me/limits': { body: LIMITS },
      'GET /billing/invoices/7/pdf': INVOICE_ROUTE,
    });
    t = await createTestApp([AuthModule, AccountModule], { hub });
    await t.db.reset();
    user = await signInAs(t, { email: 'user@example.com', role: 'user', echocallCustomerId: 501 });
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());

  it('shows the hub profile, usage and limits of the linked customer', async () => {
    const res = await api().get('/api/account/overview').set('Cookie', user.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profile: CUSTOMER_PROFILE, usage: USAGE, limits: LIMITS });
    const inCustomerContext = t.hub.calls
      .filter((call) => call.headers.get('x-echocall-customer') === '501')
      .map((call) => call.path)
      .sort();
    expect(inCustomerContext).toEqual(['/users/me', '/users/me/limits', '/users/me/usage']);
  });

  it('answers 409 for an account without a customer and 401 anonymously', async () => {
    expect((await api().get('/api/account/overview')).status).toBe(401);
    const res = await api().get('/api/account/overview').set('Cookie', admin.cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('customer_not_linked');
  });

  it('passes a hub refusal through with its status and code', async () => {
    t.hub.on('GET /users/me/limits', HUB_403);
    try {
      const res = await api().get('/api/account/overview').set('Cookie', user.cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    } finally {
      t.hub.on('GET /users/me/limits', { body: LIMITS });
    }
  });

  it('streams an invoice and keeps the hub link out of the answer', async () => {
    const res = await api()
      .get('/api/account/invoices/7/pdf')
      .set('Cookie', user.cookie)
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="INV-2026-014.pdf"');
    expect(Buffer.from(res.body)).toEqual(PDF);
    const call = t.hub.calls.findLast((c) => c.path === '/billing/invoices/7/pdf');
    expect(call?.headers.get('accept')).toBe('application/pdf');
    expect(call?.headers.get('x-echocall-customer')).toBe('501');
  });

  it('rejects an invoice id that is not a number', async () => {
    const res = await api().get('/api/account/invoices/7x/pdf').set('Cookie', user.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_id');
  });

  it('reports 502 when the hub answers with a link instead of the document', async () => {
    t.hub.on('GET /billing/invoices/7/pdf', { body: { pdfUrl: '/invoices/INV-2026-014.pdf' } });
    try {
      const res = await api().get('/api/account/invoices/7/pdf').set('Cookie', user.cookie);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('invoice_unavailable');
    } finally {
      t.hub.on('GET /billing/invoices/7/pdf', INVOICE_ROUTE);
    }
  });

  it('updates the profile and reflects it in the session', async () => {
    const empty = await api().patch('/api/account/profile').set('Cookie', user.cookie).set(XHR).send({});
    expect(empty.status).toBe(400);
    const res = await api()
      .patch('/api/account/profile')
      .set('Cookie', user.cookie)
      .set(XHR)
      .send({ firstName: '  Kai ', lastName: '', language: 'fr' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: user.id,
      email: 'user@example.com',
      role: 'user',
      firstName: 'Kai',
      lastName: null,
      language: 'fr',
      echocallCustomerId: 501,
      twoFactorEnabled: false,
      impersonator: null,
    });
    const me = await api().get('/api/auth/me').set('Cookie', user.cookie);
    expect(me.body).toMatchObject({ firstName: 'Kai', language: 'fr' });
  });

  // An operator looking at a customer's portal may read everything there and
  // change nothing, the account itself least of all.
  it('refuses a profile change made while viewing the portal as this customer', async () => {
    const sessions = t.moduleRef.get(SessionService, { strict: false });
    const { token } = await sessions.create(user.id);
    await t.db.db
      .updateTable('sessions')
      .set({ impersonatorId: admin.id })
      .where('id', '=', sha256Hex(token))
      .execute();

    const res = await api()
      .patch('/api/account/profile')
      .set('Cookie', `ecl_session=${token}`)
      .set(XHR)
      .send({ firstName: 'Nope' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('impersonation_read_only');
  });
});
