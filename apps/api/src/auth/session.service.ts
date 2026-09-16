import { Inject, Injectable } from '@nestjs/common';
import { randomToken, sha256Hex } from '../common/crypto.js';
import type { UserRow } from '../db/database.types.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';

export const SESSION_COOKIE = 'ecl_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SLIDE_BELOW_MS = 15 * 24 * 60 * 60 * 1000;

export type UserRole = 'admin' | 'user';

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  language: 'de' | 'en' | 'fr';
  echocallCustomerId: number | null;
}

export type SessionUserSource = Pick<
  UserRow,
  'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'language' | 'echocallCustomerId'
>;

export function toSessionUser(row: SessionUserSource): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
    language: row.language,
    echocallCustomerId: row.echocallCustomerId,
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
      .select([
        'sessions.expiresAt',
        'users.id',
        'users.email',
        'users.role',
        'users.firstName',
        'users.lastName',
        'users.language',
        'users.echocallCustomerId',
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
    return toSessionUser(row);
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
