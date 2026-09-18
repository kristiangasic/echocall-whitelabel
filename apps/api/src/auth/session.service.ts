import { Inject, Injectable } from '@nestjs/common';
import { randomToken, sha256Hex } from '../common/crypto.js';
import type { UserRow } from '../db/database.types.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';

export const SESSION_COOKIE = 'ecl_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SLIDE_BELOW_MS = 15 * 24 * 60 * 60 * 1000;

export type UserRole = 'admin' | 'user';

/**
 * The administrator behind a session that was opened as a customer. The e-mail
 * is null when that account has since been deleted; the session then still
 * knows it is not the customer's own and can only be ended.
 */
export interface Impersonator {
  id: number;
  email: string | null;
}

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  language: 'en' | 'de' | 'fr';
  echocallCustomerId: number | null;
  /** True once a second factor is enrolled and confirmed; the portal shows and offers it. */
  twoFactorEnabled: boolean;
  /** Set while an administrator is viewing the portal as this customer. */
  impersonator: Impersonator | null;
}

export type SessionUserSource = Pick<
  UserRow,
  | 'id'
  | 'email'
  | 'role'
  | 'firstName'
  | 'lastName'
  | 'language'
  | 'echocallCustomerId'
  | 'totpSecret'
  | 'totpConfirmedAt'
>;

export function toSessionUser(row: SessionUserSource, impersonator: Impersonator | null = null): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
    language: row.language,
    echocallCustomerId: row.echocallCustomerId,
    twoFactorEnabled: row.totpSecret !== null && row.totpConfirmedAt !== null,
    impersonator,
  };
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Creates a session and returns the raw cookie token; only its sha256 is stored. */
  async create(userId: number, meta: SessionMeta = {}): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.db
      .insertInto('sessions')
      .values({
        id: sha256Hex(token),
        userId,
        expiresAt,
        ip: meta.ip?.slice(0, 45) ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      })
      .execute();
    await this.db.deleteFrom('sessions').where('expiresAt', '<', new Date()).execute();
    return { token, expiresAt };
  }

  /** Resolves the user behind a cookie token; slides the expiry when fewer than 15 days remain. */
  async resolve(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const id = sha256Hex(token);
    const row = await this.db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.userId')
      .leftJoin('users as operator', 'operator.id', 'sessions.impersonatorId')
      .select([
        'sessions.expiresAt',
        'sessions.impersonatorId',
        'operator.email as impersonatorEmail',
        'users.id',
        'users.email',
        'users.role',
        'users.firstName',
        'users.lastName',
        'users.language',
        'users.echocallCustomerId',
        'users.totpSecret',
        'users.totpConfirmedAt',
        'users.status',
      ])
      .where('sessions.id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    const now = Date.now();
    if (row.expiresAt.getTime() < now) {
      await this.db.deleteFrom('sessions').where('id', '=', id).execute();
      return null;
    }
    if (row.status !== 'active') return null;
    if (row.expiresAt.getTime() - now < SLIDE_BELOW_MS) {
      await this.db
        .updateTable('sessions')
        .set({ expiresAt: new Date(now + SESSION_TTL_MS) })
        .where('id', '=', id)
        .execute();
    }
    const operator = row.impersonatorId;
    return toSessionUser(row, operator === null ? null : { id: operator, email: row.impersonatorEmail });
  }

  /**
   * Hands the session over to another user, keeping the cookie the browser
   * already holds. Pass the administrator id to open the session as a customer,
   * and null to hand it back.
   */
  async switchTo(token: string, userId: number, impersonatorId: number | null): Promise<void> {
    await this.db
      .updateTable('sessions')
      .set({ userId, impersonatorId })
      .where('id', '=', sha256Hex(token))
      .execute();
  }

  async revoke(token: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('id', '=', sha256Hex(token)).execute();
  }

  /** Ends every session of the user; pass the current cookie token to keep that one. */
  async revokeAllForUser(userId: number, exceptToken?: string): Promise<void> {
    let query = this.db.deleteFrom('sessions').where('userId', '=', userId);
    if (exceptToken !== undefined) query = query.where('id', '!=', sha256Hex(exceptToken));
    await query.execute();
  }
}
