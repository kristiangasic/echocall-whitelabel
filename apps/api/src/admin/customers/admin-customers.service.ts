import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { SessionService } from '../../auth/session.service.js';
import { apiError, describeError } from '../../common/http-error.js';
import type { UserRow, UserUpdate } from '../../db/database.types.js';
import { DB } from '../../db/db.service.js';
import type { Db } from '../../db/dialect.js';
import { HubClientFactory } from '../../echocall/hub-client.factory.js';
import {
  type ActionContext,
  type AdminUserRow,
  AdminUsersService,
  toAdminRow,
} from '../users/admin-users.service.js';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto.js';

/** A new customer: the account in the hub plus the portal login that was invited for it. */
export interface CreateCustomerResult {
  /** Identifier of the customer in the hub, which is also the link on the portal login. */
  customerId: number;
  user: AdminUserRow;
  /** Shown to the operator so the invitation can be passed on when no mail server is configured. */
  inviteLink: string;
  mailSent: boolean;
}

/** The portal login of a customer, or null when the customer has none. */
export interface CustomerLoginResult {
  user: AdminUserRow | null;
}

/**
 * Customers live in the hub, their logins live in the portal, and every change
 * has to reach both. This service owns that pair: the hub is changed first,
 * because a hub failure must leave nothing behind, and the portal follows. When
 * only the second half fails the error names the customer id, so an operator can
 * repair the link by hand instead of losing the customer.
 */
@Injectable()
export class AdminCustomersService {
  private readonly logger = new Logger(AdminCustomersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly hub: HubClientFactory,
    private readonly users: AdminUsersService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateCustomerDto, ctx: ActionContext): Promise<CreateCustomerResult> {
    await this.users.assertEmailFree(input.email);
    const created = await this.hub.raw('POST', '/resellers/customers', {
      body: {
        email: input.email,
        ...optional('firstName', input.firstName),
        ...optional('lastName', input.lastName),
        ...optional('company', input.company),
        language: input.language,
        // The portal owns the login, so the hub must not mail a code of its own.
        sendPasswordEmail: false,
      },
    });
    const customerId = readCustomerId(created.body);
    const invite = await this.afterHub(customerId, () =>
      this.users.invite(
        {
          email: input.email,
          role: 'user',
          language: input.language,
          echocallCustomerId: customerId,
          ...optional('firstName', input.firstName),
          ...optional('lastName', input.lastName),
        },
        ctx,
        { sendMail: input.sendInvite },
      ),
    );
    await this.record(ctx, 'customers.created', customerId, {
      email: input.email,
      userId: invite.user.id,
      mailSent: invite.mailSent,
    });
    return { customerId, user: invite.user, inviteLink: invite.inviteLink, mailSent: invite.mailSent };
  }

  async update(
    customerId: number,
    patch: UpdateCustomerDto,
    ctx: ActionContext,
  ): Promise<CustomerLoginResult> {
    const login = await this.findLogin(customerId);
    if (patch.email !== undefined) await this.users.assertEmailFree(patch.email, login?.id ?? null);
    await this.hub.raw('PATCH', `/resellers/customers/${customerId}`, {
      body: {
        ...optional('email', patch.email),
        ...present('firstName', patch.firstName),
        ...present('lastName', patch.lastName),
        ...present('company', patch.company),
      },
    });
    const changes: UserUpdate = { updatedAt: new Date() };
    if (patch.email !== undefined) changes.email = patch.email;
    if (patch.firstName !== undefined) changes.firstName = patch.firstName || null;
    if (patch.lastName !== undefined) changes.lastName = patch.lastName || null;
    if (patch.language !== undefined) changes.language = patch.language;
    const user = await this.afterHub(customerId, () => this.applyToLogin(login, changes));
    await this.record(ctx, 'customers.updated', customerId, {
      changed: (Object.keys(patch) as (keyof UpdateCustomerDto)[]).filter((key) => patch[key] !== undefined),
    });
    return { user };
  }

  /** Locks the customer out of the hub and of the portal, and ends any portal session it holds. */
  async suspend(customerId: number, ctx: ActionContext): Promise<CustomerLoginResult> {
    const login = await this.findLogin(customerId);
    await this.hub.raw('PATCH', `/resellers/customers/${customerId}/suspend`, {});
    const user = await this.afterHub(customerId, async () => {
      const row = await this.applyToLogin(login, { status: 'disabled', updatedAt: new Date() });
      if (login) await this.sessions.revokeAllForUser(login.id);
      return row;
    });
    await this.record(ctx, 'customers.suspended', customerId, { userId: login?.id ?? null });
    return { user };
  }

  /** Lets the customer back in. A login that never set a password goes back to invited, not active. */
  async unsuspend(customerId: number, ctx: ActionContext): Promise<CustomerLoginResult> {
    const login = await this.findLogin(customerId);
    await this.hub.raw('PATCH', `/resellers/customers/${customerId}/unsuspend`, {});
    const status = login?.passwordHash === null ? 'invited' : 'active';
    const user = await this.afterHub(customerId, () =>
      this.applyToLogin(login, { status, updatedAt: new Date() }),
    );
    await this.record(ctx, 'customers.unsuspended', customerId, { userId: login?.id ?? null });
    return { user };
  }

  /** Removes the customer in the hub and the portal login with it; nothing is left to sign in with. */
  async remove(customerId: number, ctx: ActionContext): Promise<void> {
    const login = await this.findLogin(customerId);
    await this.hub.raw('DELETE', `/resellers/customers/${customerId}`, {});
    await this.afterHub(customerId, async () => {
      if (login) await this.db.deleteFrom('users').where('id', '=', login.id).execute();
    });
    await this.record(ctx, 'customers.deleted', customerId, { email: login?.email ?? null });
  }

  private async applyToLogin(login: UserRow | null, changes: UserUpdate): Promise<AdminUserRow | null> {
    if (!login) return null;
    await this.db.updateTable('users').set(changes).where('id', '=', login.id).execute();
    const row = await this.db.selectFrom('users').selectAll().where('id', '=', login.id).executeTakeFirst();
    return row ? toAdminRow(row) : null;
  }

  private async findLogin(customerId: number): Promise<UserRow | null> {
    const row = await this.db
      .selectFrom('users')
      .selectAll()
      .where('echocallCustomerId', '=', customerId)
      .executeTakeFirst();
    return row ?? null;
  }

  /**
   * Runs the portal half of an operation the hub has already carried out. A
   * failure here cannot be undone in the hub, so it is reported with the
   * customer id rather than as a plain 500.
   */
  private async afterHub<T>(customerId: number, step: () => Promise<T>): Promise<T> {
    try {
      return await step();
    } catch (error) {
      this.logger.error(`Portal half failed for customer ${customerId}: ${describeError(error)}`);
      throw apiError(
        500,
        'customer_half_done',
        'The customer was changed in the service, but the portal login was not. Check the customer and repair the link by hand.',
        { customerId },
      );
    }
  }

  private async record(
    ctx: ActionContext,
    action: string,
    customerId: number,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actorUserId: ctx.actor.id,
      action,
      targetType: 'customer',
      targetId: customerId,
      details,
      ip: ctx.ip,
    });
  }
}

/** Leaves a key out entirely when the value is empty; the hub treats absent and empty differently. */
function optional(key: string, value: string | undefined): Record<string, string> {
  return value ? { [key]: value } : {};
}

/** Passes a key on whenever the operator sent it, empty string included: that is how a field is cleared. */
function present(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}

/** The hub answers a created customer with its new user id; anything else is a broken contract. */
function readCustomerId(body: unknown): number {
  const id = (body as { userId?: unknown } | null)?.userId;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0)
    throw apiError(502, 'upstream_error', 'The service did not return a customer id');
  return id;
}
