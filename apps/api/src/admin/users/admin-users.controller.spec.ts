import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthModule } from '../../auth/auth.module.js';
import { createTestApp, type TestApp } from '../../testing/test-app.js';
import { type SignedInUser, signInAs } from '../../testing/users.js';
import { AdminUsersModule } from './admin-users.module.js';

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('AdminUsersController', () => {
  let t: TestApp;
  let admin: SignedInUser;
  let user: SignedInUser;
  let asAdmin: Record<string, string>;

  beforeAll(async () => {
    t = await createTestApp([AuthModule, AdminUsersModule]);
    await t.db.reset();
    admin = await signInAs(t, { email: 'admin@example.com', role: 'admin' });
    user = await signInAs(t, { email: 'user@example.com', role: 'user', echocallCustomerId: 501 });
    asAdmin = { Cookie: admin.cookie, ...XHR };
  });

  afterAll(async () => {
    await t.close();
  });

  const api = () => request(t.app.getHttpServer());
  const tokenOf = (link: string) => new URL(link).searchParams.get('token') ?? '';
  const lastAudit = async () =>
    (await api().get('/api/admin/audit').set('Cookie', admin.cookie)).body.data[0] as Record<string, unknown>;
  const acceptInvite = (token: string) => api().post('/api/auth/accept-invite').set(XHR).send({ token });

  it('is reserved for administrators and lists every account without secrets', async () => {
    expect((await api().get('/api/admin/users')).status).toBe(401);
    expect((await api().get('/api/admin/users').set('Cookie', user.cookie)).status).toBe(403);
    const list = await api().get('/api/admin/users').set('Cookie', admin.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { email: string }) => row.email)).toEqual([
      'admin@example.com',
      'user@example.com',
    ]);
    expect(Object.keys(list.body.data[0]).sort()).toEqual([
      'createdAt',
      'echocallCustomerId',
      'email',
      'firstName',
      'id',
      'language',
      'lastLoginAt',
      'lastName',
      'role',
      'status',
      'twoFactorEnabled',
    ]);
    expect(list.body.data[0].twoFactorEnabled).toBe(false);
  });

  it('validates invitations: customer id for users, unique e-mail and unique customer', async () => {
    const noCustomer = await api()
      .post('/api/admin/users/invite')
      .set(asAdmin)
      .send({ email: 'x@example.com', role: 'user' });
    expect(noCustomer.status).toBe(400);
    expect(noCustomer.body.error.details[0].path).toBe('echocallCustomerId');

    const taken = await api()
      .post('/api/admin/users/invite')
      .set(asAdmin)
      .send({ email: 'USER@example.com', role: 'user', echocallCustomerId: 777 });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('email_taken');

    const customerTaken = await api()
      .post('/api/admin/users/invite')
      .set(asAdmin)
      .send({ email: 'other@example.com', role: 'user', echocallCustomerId: 501 });
    expect(customerTaken.status).toBe(409);
    expect(customerTaken.body.error.code).toBe('customer_taken');
    expect(t.mail.sent).toHaveLength(0);
  });

  it('invites a user, mails the link, records it without the token and lets the invitee accept', async () => {
    const res = await api().post('/api/admin/users/invite').set(asAdmin).send({
      email: 'Neu@Example.com',
      role: 'user',
      firstName: 'Nina',
      language: 'fr',
      echocallCustomerId: 601,
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'neu@example.com',
      role: 'user',
      status: 'invited',
      firstName: 'Nina',
      lastName: null,
      language: 'fr',
      echocallCustomerId: 601,
    });
    expect(res.body.mailSent).toBe(true);
    expect(t.mail.sent.at(-1)).toEqual({
      kind: 'invite',
      to: { email: 'neu@example.com', language: 'fr', firstName: 'Nina' },
      link: res.body.inviteLink,
    });
    const link = new URL(res.body.inviteLink);
    expect(link.origin + link.pathname).toBe('http://localhost:3000/accept-invite');

    const audit = await lastAudit();
    expect(audit).toMatchObject({
      action: 'users.invited',
      actorEmail: 'admin@example.com',
      targetType: 'user',
      targetId: String(res.body.user.id),
      details: { email: 'neu@example.com', role: 'user', mailSent: true },
    });
    expect(JSON.stringify(audit)).not.toContain(tokenOf(res.body.inviteLink));

    const accepted = await acceptInvite(tokenOf(res.body.inviteLink));
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ email: 'neu@example.com', role: 'user', echocallCustomerId: 601 });
  });

  it('resends an invitation with a fresh link and invalidates the old one', async () => {
    const first = await api()
      .post('/api/admin/users/invite')
      .set(asAdmin)
      .send({ email: 'pending@example.com', role: 'admin' });
    expect(first.status).toBe(201);
    const id = first.body.user.id as number;

    const again = await api().post(`/api/admin/users/${id}/resend-invite`).set(asAdmin);
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(id);
    expect(again.body.inviteLink).not.toBe(first.body.inviteLink);
    expect(t.mail.sent.at(-1)?.link).toBe(again.body.inviteLink);
    expect((await lastAudit()).action).toBe('users.invite_resent');

    expect((await acceptInvite(tokenOf(first.body.inviteLink))).status).toBe(400);
    expect((await acceptInvite(tokenOf(again.body.inviteLink))).status).toBe(200);

    const active = await api().post(`/api/admin/users/${id}/resend-invite`).set(asAdmin);
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe('already_active');
  });

  it('updates a user and keeps the acting administrator from locking themselves out', async () => {
    const ok = await api()
      .patch(`/api/admin/users/${user.id}`)
      .set(asAdmin)
      .send({ firstName: 'Uwe', lastName: '', language: 'de' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      id: user.id,
      firstName: 'Uwe',
      lastName: null,
      language: 'de',
      status: 'active',
      echocallCustomerId: 501,
    });
    expect(await lastAudit()).toMatchObject({
      action: 'users.updated',
      targetId: String(user.id),
      details: { changed: ['firstName', 'lastName', 'language'] },
    });

    const self = await api().patch(`/api/admin/users/${admin.id}`).set(asAdmin).send({ status: 'disabled' });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('cannot_change_self');
    const demote = await api()
      .patch(`/api/admin/users/${admin.id}`)
      .set(asAdmin)
      .send({ role: 'user', echocallCustomerId: 900 });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe('cannot_change_self');
    const rename = await api().patch(`/api/admin/users/${admin.id}`).set(asAdmin).send({ firstName: 'Root' });
    expect(rename.status).toBe(200);

    const noCustomer = await api()
      .patch(`/api/admin/users/${user.id}`)
      .set(asAdmin)
      .send({ echocallCustomerId: null });
    expect(noCustomer.status).toBe(400);
    expect(noCustomer.body.error.code).toBe('customer_required');
    const customerTaken = await api()
      .patch(`/api/admin/users/${user.id}`)
      .set(asAdmin)
      .send({ echocallCustomerId: 601 });
    expect(customerTaken.status).toBe(409);
    expect(customerTaken.body.error.code).toBe('customer_taken');

    expect((await api().patch(`/api/admin/users/${user.id}`).set(asAdmin).send({})).status).toBe(400);
    expect((await api().patch('/api/admin/users/abc').set(asAdmin).send({ language: 'en' })).status).toBe(
      400,
    );
    const missing = await api().patch('/api/admin/users/999999').set(asAdmin).send({ language: 'en' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('user_not_found');
  });

  it('revokes the sessions of a disabled user and refuses to activate a pending invitation', async () => {
    const victim = await signInAs(t, {
      email: 'disable-me@example.com',
      role: 'user',
      echocallCustomerId: 502,
    });
    expect((await api().get('/api/auth/me').set('Cookie', victim.cookie)).status).toBe(200);

    const off = await api().patch(`/api/admin/users/${victim.id}`).set(asAdmin).send({ status: 'disabled' });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe('disabled');
    expect((await api().get('/api/auth/me').set('Cookie', victim.cookie)).status).toBe(401);

    const invited = await api()
      .post('/api/admin/users/invite')
      .set(asAdmin)
      .send({ email: 'never@example.com', role: 'admin' });
    const early = await api()
      .patch(`/api/admin/users/${invited.body.user.id}`)
      .set(asAdmin)
      .send({ status: 'active' });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('invite_pending');
  });

  it('sends a sign-in link for active accounts only', async () => {
    const res = await api().post(`/api/admin/users/${user.id}/sign-in-link`).set(asAdmin);
    expect(res.status).toBe(200);
    expect(res.body.mailSent).toBe(true);
    expect(t.mail.sent.at(-1)).toMatchObject({
      kind: 'sign_in_link',
      to: { email: 'user@example.com' },
      link: res.body.signInLink,
    });
    const link = new URL(res.body.signInLink);
    expect(link.origin + link.pathname).toBe('http://localhost:3000/sign-in');
    expect(await lastAudit()).toMatchObject({
      action: 'users.sign_in_link_sent',
      targetId: String(user.id),
      details: { email: 'user@example.com', mailSent: true },
    });

    // An account that has not accepted its invitation is sent that invitation
    // again, not a sign-in link, so this route turns it away.
    const invited = await api()
      .post('/api/admin/users/invite')
      .set(asAdmin)
      .send({ email: 'link-pending@example.com', role: 'admin' });
    const pending = await api().post(`/api/admin/users/${invited.body.user.id}/sign-in-link`).set(asAdmin);
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('user_not_active');
  });

  it('clears a second factor for a locked-out account, but never for the acting administrator', async () => {
    // The state a locked-out account is in: a confirmed secret and the
    // recovery codes that were handed out with it.
    await t.db.db
      .updateTable('users')
      .set({ totpSecret: 'v1:stored-envelope', totpConfirmedAt: new Date() })
      .where('id', '=', user.id)
      .execute();
    await t.db.db
      .insertInto('twoFactorRecoveryCodes')
      .values({ userId: user.id, codeHash: 'hash', usedAt: null })
      .execute();

    const listed = await api().get('/api/admin/users').set(asAdmin);
    expect(listed.body.data.find((row: { id: number }) => row.id === user.id).twoFactorEnabled).toBe(true);

    const self = await api().delete(`/api/admin/users/${admin.id}/two-factor`).set(asAdmin);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('cannot_change_self');

    expect((await api().delete(`/api/admin/users/${user.id}/two-factor`).set(asAdmin)).status).toBe(204);
    const after = await api().get('/api/admin/users').set(asAdmin);
    expect(after.body.data.find((row: { id: number }) => row.id === user.id).twoFactorEnabled).toBe(false);
    expect(
      await t.db.db.selectFrom('twoFactorRecoveryCodes').select('id').where('userId', '=', user.id).execute(),
    ).toEqual([]);
    expect(await lastAudit()).toMatchObject({
      action: 'users.two_factor_cleared',
      targetId: String(user.id),
      details: { email: 'user@example.com' },
    });

    expect((await api().delete('/api/admin/users/9999/two-factor').set(asAdmin)).status).toBe(404);
    expect(
      (await api().delete(`/api/admin/users/${admin.id}/two-factor`).set('Cookie', user.cookie)).status,
    ).toBe(403);
  });

  it('deletes a user but never the acting administrator', async () => {
    const self = await api().delete(`/api/admin/users/${admin.id}`).set(asAdmin);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('cannot_delete_self');

    expect((await api().delete(`/api/admin/users/${user.id}`).set(asAdmin)).status).toBe(204);
    expect((await api().get('/api/auth/me').set('Cookie', user.cookie)).status).toBe(401);
    const list = await api().get('/api/admin/users').set('Cookie', admin.cookie);
    expect(list.body.data.map((row: { email: string }) => row.email)).not.toContain('user@example.com');
    expect((await api().delete(`/api/admin/users/${user.id}`).set(asAdmin)).status).toBe(404);
    expect(await lastAudit()).toMatchObject({
      action: 'users.deleted',
      targetId: String(user.id),
      details: { email: 'user@example.com', role: 'user' },
    });
  });
});
