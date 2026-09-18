import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService, type SessionUser } from '../../auth/session.service.js';
import { inviteLink, signInLink } from '../../auth/links.js';
import { SIGN_IN_LINK_TTL_MS, TokenService } from '../../auth/token.service.js';
import { TwoFactorService } from '../../auth/two-factor.service.js';
import { apiError } from '../../common/http-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { UserRow, UserUpdate } from '../../db/database.types.js';
import { DB, DB_DIALECT } from '../../db/db.service.js';
import type { Db, DbDialect } from '../../db/dialect.js';
import { insertReturningId } from '../../db/helpers.js';
import { MAIL_SENDER, type MailRecipient, type MailSender } from '../../mail/mail-sender.js';
import type { InviteUserDto, UpdateUserDto } from './dto.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminUserRow {
  id: number;
  email: string;
  role: 'admin' | 'user';
  status: 'invited' | 'active' | 'disabled';
  firstName: string | null;
  lastName: string | null;
  language: 'en' | 'de' | 'fr';
  echocallCustomerId: number | null;
  /** Whether this login asks for a code from an authenticator app as well. */
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Who performs an administrative action, for the audit log. */
export interface ActionContext {
  /**
   * The administrator who acted, or null when the portal acted on its own for a
   * visitor, as it does for a self-service sign-up. The log then records the
   * action without an actor, which is what happened.
   */
  actor: SessionUser | null;
  ip?: string;
}

export interface InviteResult {
  user: AdminUserRow;
  /** Shown to the administrator so the invitation can be passed on when no mail server is configured. */
  inviteLink: string;
  mailSent: boolean;
}

export interface SignInLinkResult {
  /** Shown to the administrator, so a link can be passed on when no mail server is configured. */
  signInLink: string;
  mailSent: boolean;
}

/** The public shape of a portal login, shared with the customer service. */
export function toAdminRow(row: UserRow): AdminUserRow {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    firstName: row.firstName,
    lastName: row.lastName,
    language: row.language,
    echocallCustomerId: row.echocallCustomerId,
    twoFactorEnabled: row.totpSecret !== null && row.totpConfirmedAt !== null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function recipient(row: UserRow): MailRecipient {
  return { email: row.email, language: row.language, firstName: row.firstName };
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_DIALECT) private readonly dialect: DbDialect,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminUserRow[]> {
    const rows = await this.db
      .selectFrom('users')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(toAdminRow);
  }

  /**
   * Creates the login and issues its invitation. `sendMail: false` still returns
   * the link, for the operator who wants to hand it over another way.
   */
  async invite(
    input: InviteUserDto,
    ctx: ActionContext,
    opts: { sendMail?: boolean } = {},
  ): Promise<InviteResult> {
    await this.assertEmailFree(input.email);
    const echocallCustomerId = input.echocallCustomerId ?? null;
    if (echocallCustomerId !== null) await this.assertCustomerFree(echocallCustomerId, null);
    const id = await insertReturningId(this.db, this.dialect, 'users', {
      email: input.email,
      role: input.role,
      status: 'invited',
      acceptedAt: null,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      language: input.language,
      echocallCustomerId,
    });
    const user = await this.require(id);
    const { link, mailSent } = await this.sendInvite(user, opts.sendMail ?? true);
    await this.audit.record({
      actorUserId: ctx.actor?.id ?? null,
      action: 'users.invited',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, role: user.role, mailSent },
      ip: ctx.ip,
    });
    return { user: toAdminRow(user), inviteLink: link, mailSent };
  }

  /** Issues a new invitation link; earlier links stop working. A disabled account that never accepted becomes invited again. */
  async resendInvite(id: number, ctx: ActionContext): Promise<InviteResult> {
    let user = await this.require(id);
    if (user.status === 'active')
      throw apiError(409, 'already_active', 'This account has already accepted its invitation');
    if (user.status !== 'invited') {
      await this.db
        .updateTable('users')
        .set({ status: 'invited', updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      user = await this.require(id);
    }
    const { link, mailSent } = await this.sendInvite(user);
    await this.audit.record({
      actorUserId: ctx.actor?.id ?? null,
      action: 'users.invite_resent',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, mailSent },
      ip: ctx.ip,
    });
    return { user: toAdminRow(user), inviteLink: link, mailSent };
  }

  async update(id: number, patch: UpdateUserDto, ctx: ActionContext): Promise<AdminUserRow> {
    const user = await this.require(id);
    const self = user.id === ctx.actor?.id;
    if (self && (patch.status === 'disabled' || (patch.role !== undefined && patch.role !== 'admin')))
      throw apiError(409, 'cannot_change_self', 'You cannot disable or demote your own account');
    const role = patch.role ?? user.role;
    const echocallCustomerId =
      patch.echocallCustomerId === undefined ? user.echocallCustomerId : patch.echocallCustomerId;
    if (role === 'user' && echocallCustomerId === null)
      throw apiError(400, 'customer_required', 'Users need a customer id');
    if (echocallCustomerId !== null && echocallCustomerId !== user.echocallCustomerId)
      await this.assertCustomerFree(echocallCustomerId, id);
    if (patch.status === 'active' && user.status === 'invited')
      throw apiError(
        409,
        'invite_pending',
        'This account has not accepted its invitation yet; send the invitation again instead',
      );

    const changes: UserUpdate = { updatedAt: new Date() };
    if (patch.firstName !== undefined) changes.firstName = patch.firstName || null;
    if (patch.lastName !== undefined) changes.lastName = patch.lastName || null;
    if (patch.language !== undefined) changes.language = patch.language;
    if (patch.role !== undefined) changes.role = patch.role;
    if (patch.status !== undefined) changes.status = patch.status;
    if (patch.echocallCustomerId !== undefined) changes.echocallCustomerId = patch.echocallCustomerId;
    await this.db.updateTable('users').set(changes).where('id', '=', id).execute();
    if (patch.status === 'disabled') await this.sessions.revokeAllForUser(id);

    const changed = (Object.keys(patch) as (keyof UpdateUserDto)[]).filter((key) => patch[key] !== undefined);
    await this.audit.record({
      actorUserId: ctx.actor?.id ?? null,
      action: 'users.updated',
      targetType: 'user',
      targetId: id,
      details: { changed },
      ip: ctx.ip,
    });
    return toAdminRow(await this.require(id));
  }

  /**
   * Hands an active account a fresh way in. It is what an operator reaches for
   * when someone cannot receive their own link, so the link comes back either
   * way and can be passed on by hand.
   */
  async sendSignInLink(id: number, ctx: ActionContext): Promise<SignInLinkResult> {
    const user = await this.require(id);
    if (user.status !== 'active')
      throw apiError(409, 'user_not_active', 'Only active accounts can be sent a sign-in link');
    const token = await this.tokens.issue(user.id, 'sign_in', SIGN_IN_LINK_TTL_MS);
    const link = signInLink(this.config.appUrl, token);
    const mailSent = await this.mail.sendSignInLink(recipient(user), link);
    await this.audit.record({
      actorUserId: ctx.actor?.id ?? null,
      action: 'users.sign_in_link_sent',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, mailSent },
      ip: ctx.ip,
    });
    return { signInLink: link, mailSent };
  }

  /**
   * Clears the second factor of someone who can no longer produce a code and
   * has run out of recovery codes. Their own account is not included: an
   * operator who locked themselves out cannot be signed in to fix it, and
   * leaving the route open would turn a stolen session into a way around the
   * second factor.
   */
  async clearTwoFactor(id: number, ctx: ActionContext): Promise<void> {
    if (id === ctx.actor?.id)
      throw apiError(409, 'cannot_change_self', 'Remove your own second factor in your account');
    const user = await this.require(id);
    await this.twoFactor.disable(id);
    await this.audit.record({
      actorUserId: ctx.actor?.id ?? null,
      action: 'users.two_factor_cleared',
      targetType: 'user',
      targetId: id,
      details: { email: user.email },
      ip: ctx.ip,
    });
  }

  /** Sessions and one-time tokens go with the user; audit entries keep the id and lose the e-mail. */
  async remove(id: number, ctx: ActionContext): Promise<void> {
    if (id === ctx.actor?.id) throw apiError(409, 'cannot_delete_self', 'You cannot delete your own account');
    const user = await this.require(id);
    await this.db.deleteFrom('users').where('id', '=', id).execute();
    await this.audit.record({
      actorUserId: ctx.actor?.id ?? null,
      action: 'users.deleted',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, role: user.role },
      ip: ctx.ip,
    });
  }

  private async sendInvite(user: UserRow, sendMail = true): Promise<{ link: string; mailSent: boolean }> {
    const token = await this.tokens.issue(user.id, 'invite', INVITE_TTL_MS);
    const link = inviteLink(this.config.appUrl, token);
    const mailSent = sendMail ? await this.mail.sendInvite(recipient(user), link) : false;
    return { link, mailSent };
  }

  private async require(id: number): Promise<UserRow> {
    const row = await this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw apiError(404, 'user_not_found', 'This user does not exist');
    return row;
  }

  /** Every portal login owns its e-mail address; the customer service checks this before it calls the hub. */
  async assertEmailFree(email: string, exceptUserId: number | null = null): Promise<void> {
    let query = this.db.selectFrom('users').select('id').where('email', '=', email);
    if (exceptUserId !== null) query = query.where('id', '!=', exceptUserId);
    const row = await query.executeTakeFirst();
    if (row) throw apiError(409, 'email_taken', 'An account with this e-mail address already exists');
  }

  /** Every hub customer is linked to at most one portal account. */
  private async assertCustomerFree(customerId: number, exceptUserId: number | null): Promise<void> {
    let query = this.db.selectFrom('users').select('id').where('echocallCustomerId', '=', customerId);
    if (exceptUserId !== null) query = query.where('id', '!=', exceptUserId);
    const row = await query.executeTakeFirst();
    if (row) throw apiError(409, 'customer_taken', 'This customer is already linked to another account');
  }
}
