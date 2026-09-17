import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService, type SessionUser } from '../../auth/session.service.js';
import { TokenService } from '../../auth/token.service.js';
import { apiError } from '../../common/http-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { UserRow, UserUpdate } from '../../db/database.types.js';
import { DB, DB_DIALECT } from '../../db/db.service.js';
import type { Db, DbDialect } from '../../db/dialect.js';
import { insertReturningId } from '../../db/helpers.js';
import { MAIL_SENDER, type MailRecipient, type MailSender } from '../../mail/mail-sender.js';
import type { InviteUserDto, UpdateUserDto } from './dto.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface AdminUserRow {
  id: number;
  email: string;
  role: 'admin' | 'user';
  status: 'invited' | 'active' | 'disabled';
  firstName: string | null;
  lastName: string | null;
  language: 'de' | 'en' | 'fr';
  echocallCustomerId: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Who performs an administrative action, for the audit log. */
export interface ActionContext {
  actor: SessionUser;
  ip?: string;
}

export interface InviteResult {
  user: AdminUserRow;
  /** Shown to the administrator so the invitation can be passed on when no mail server is configured. */
  inviteLink: string;
  mailSent: boolean;
}

export interface PasswordResetResult {
  resetLink: string;
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
      passwordHash: null,
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      language: input.language,
      echocallCustomerId,
    });
    const user = await this.require(id);
    const { link, mailSent } = await this.sendInvite(user, opts.sendMail ?? true);
    await this.audit.record({
      actorUserId: ctx.actor.id,
      action: 'users.invited',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, role: user.role, mailSent },
      ip: ctx.ip,
    });
    return { user: toAdminRow(user), inviteLink: link, mailSent };
  }

  /** Issues a new invitation link; earlier links stop working. A disabled account without a password becomes invited again. */
  async resendInvite(id: number, ctx: ActionContext): Promise<InviteResult> {
    let user = await this.require(id);
    if (user.passwordHash !== null)
      throw apiError(409, 'already_active', 'This account has already set a password');
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
      actorUserId: ctx.actor.id,
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
    const self = user.id === ctx.actor.id;
    if (self && (patch.status === 'disabled' || (patch.role !== undefined && patch.role !== 'admin')))
      throw apiError(409, 'cannot_change_self', 'You cannot disable or demote your own account');
    const role = patch.role ?? user.role;
    const echocallCustomerId =
      patch.echocallCustomerId === undefined ? user.echocallCustomerId : patch.echocallCustomerId;
    if (role === 'user' && echocallCustomerId === null)
      throw apiError(400, 'customer_required', 'Users need a customer id');
    if (echocallCustomerId !== null && echocallCustomerId !== user.echocallCustomerId)
      await this.assertCustomerFree(echocallCustomerId, id);
    if (patch.status === 'active' && user.passwordHash === null)
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
      actorUserId: ctx.actor.id,
      action: 'users.updated',
      targetType: 'user',
      targetId: id,
      details: { changed },
      ip: ctx.ip,
    });
    return toAdminRow(await this.require(id));
  }

  async sendPasswordReset(id: number, ctx: ActionContext): Promise<PasswordResetResult> {
    const user = await this.require(id);
    if (user.status !== 'active' || user.passwordHash === null)
      throw apiError(409, 'user_not_active', 'Only active accounts can reset their password');
    const token = await this.tokens.issue(user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    const link = `${this.config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const mailSent = await this.mail.sendPasswordReset(recipient(user), link);
    await this.audit.record({
      actorUserId: ctx.actor.id,
      action: 'users.password_reset_sent',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, mailSent },
      ip: ctx.ip,
    });
    return { resetLink: link, mailSent };
  }

  /** Sessions and one-time tokens go with the user; audit entries keep the id and lose the e-mail. */
  async remove(id: number, ctx: ActionContext): Promise<void> {
    if (id === ctx.actor.id) throw apiError(409, 'cannot_delete_self', 'You cannot delete your own account');
    const user = await this.require(id);
    await this.db.deleteFrom('users').where('id', '=', id).execute();
    await this.audit.record({
      actorUserId: ctx.actor.id,
      action: 'users.deleted',
      targetType: 'user',
      targetId: id,
      details: { email: user.email, role: user.role },
      ip: ctx.ip,
    });
  }

  private async sendInvite(user: UserRow, sendMail = true): Promise<{ link: string; mailSent: boolean }> {
    const token = await this.tokens.issue(user.id, 'invite', INVITE_TTL_MS);
    const link = `${this.config.appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
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
