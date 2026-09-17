import type { components } from '@echocall/light-api-client';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService, type SessionUser, toSessionUser } from '../auth/session.service.js';
import { apiError } from '../common/http-error.js';
import type { UserUpdate } from '../db/database.types.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import { HubClientFactory } from '../echocall/hub-client.factory.js';
import type { PasswordChangeDto, ProfileUpdateDto } from './dto.js';

export type HubProfile = components['schemas']['UserProfile'];
export type HubUsage = components['schemas']['UsageSummary'];
export type HubLimits = components['schemas']['Limits'];

/** What the hub knows about the customer behind the signed-in user. */
export interface AccountOverview {
  profile: HubProfile;
  usage: HubUsage;
  limits: HubLimits;
}

/** One rendered invoice, ready to be handed to the browser. */
export interface InvoiceDocument {
  filename: string;
  content: Buffer;
}

/** Filenames the portal is willing to echo back into a Content-Disposition header. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,120}\.pdf$/;

@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly hub: HubClientFactory,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /** Every hub request runs in the customer's context; hub refusals keep their status and code. */
  async overview(user: SessionUser): Promise<AccountOverview> {
    if (user.echocallCustomerId === null)
      throw apiError(409, 'customer_not_linked', 'This account is not linked to a customer yet');
    const client = this.hub.forCustomer(user.echocallCustomerId);
    const [profile, usage, limits] = await Promise.all([
      this.hub.call(() => client.GET('/users/me')),
      this.hub.call(() => client.GET('/users/me/usage')),
      this.hub.call(() => client.GET('/users/me/limits')),
    ]);
    return { profile, usage, limits };
  }

  /**
   * Downloads one invoice as a PDF. The hub only hands the bytes to a request
   * that asks for them; the link it returns otherwise needs a hub session, which
   * the portal deliberately never has.
   */
  async invoicePdf(user: SessionUser, invoiceId: number): Promise<InvoiceDocument> {
    if (user.echocallCustomerId === null)
      throw apiError(409, 'customer_not_linked', 'This account is not linked to a customer yet');
    const result = await this.hub.raw('GET', `/billing/invoices/${invoiceId}/pdf`, {
      customerId: user.echocallCustomerId,
      accept: 'binary',
      headers: { accept: 'application/pdf' },
    });
    if (!result.contentType?.startsWith('application/pdf'))
      throw apiError(502, 'invoice_unavailable', 'The invoice document is not available right now');
    return {
      filename: filenameOf(result.headers) ?? `invoice-${invoiceId}.pdf`,
      content: result.body as Buffer,
    };
  }

  async updateProfile(user: SessionUser, patch: ProfileUpdateDto): Promise<SessionUser> {
    assertOwnAccount(user);
    const changes: UserUpdate = { updatedAt: new Date() };
    if (patch.firstName !== undefined) changes.firstName = patch.firstName || null;
    if (patch.lastName !== undefined) changes.lastName = patch.lastName || null;
    if (patch.language !== undefined) changes.language = patch.language;
    await this.db.updateTable('users').set(changes).where('id', '=', user.id).execute();
    const row = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    return toSessionUser(row);
  }

  /** Changes the password and signs out every other session of the user. */
  async changePassword(
    user: SessionUser,
    input: PasswordChangeDto,
    currentSessionToken: string | undefined,
    ip: string | undefined,
  ): Promise<void> {
    assertOwnAccount(user);
    const row = await this.db
      .selectFrom('users')
      .select('passwordHash')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    if (!(await this.passwords.verify(row.passwordHash, input.currentPassword)))
      throw apiError(400, 'invalid_current_password', 'The current password is incorrect');
    await this.db
      .updateTable('users')
      .set({ passwordHash: await this.passwords.hash(input.newPassword), updatedAt: new Date() })
      .where('id', '=', user.id)
      .execute();
    await this.sessions.revokeAllForUser(user.id, currentSessionToken);
    await this.audit.record({
      actorUserId: user.id,
      action: 'account.password_changed',
      targetType: 'user',
      targetId: user.id,
      ip,
    });
  }
}

/**
 * An operator viewing the portal as a customer may look at everything, but the
 * account itself stays the customer's own: no password, name or language of
 * theirs is ever changed by someone else.
 */
function assertOwnAccount(user: SessionUser): void {
  if (user.impersonator)
    throw apiError(
      403,
      'impersonation_read_only',
      'While viewing the portal as a customer you cannot change this account',
    );
}

/** The filename the hub suggested, when it is one the portal can safely repeat. */
function filenameOf(headers: Headers): string | null {
  const match = /filename="([^"]+)"/.exec(headers.get('content-disposition') ?? '');
  const name = match?.[1];
  return name && SAFE_FILENAME.test(name) ? name : null;
}
