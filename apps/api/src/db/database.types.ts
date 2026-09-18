import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface UsersTable {
  id: Generated<number>;
  email: string;
  /** When the invitation was accepted; null while it is still open. */
  acceptedAt: Date | null;
  role: 'admin' | 'user';
  /** Customer id in the hub for role user; null for admins. */
  echocallCustomerId: number | null;
  firstName: string | null;
  lastName: string | null;
  language: 'en' | 'de' | 'fr';
  status: 'invited' | 'active' | 'disabled';
  lastLoginAt: Date | null;
  /** The encrypted TOTP secret, or null when the account has no second factor. */
  totpSecret: string | null;
  /** Set when the first correct code proved the secret arrived; null while enrolling. */
  totpConfirmedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface TwoFactorRecoveryCodesTable {
  id: Generated<number>;
  userId: number;
  /** Hashed like a password; the plain code is shown once and never stored. */
  codeHash: string;
  usedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface SessionsTable {
  /** sha256 of the cookie token. */
  id: string;
  userId: number;
  /** The administrator who opened this session as the customer; null for an ordinary login. */
  impersonatorId: Generated<number | null>;
  expiresAt: Date;
  createdAt: Generated<Date>;
  ip: string | null;
  userAgent: string | null;
}

export interface OneTimeTokensTable {
  id: Generated<number>;
  userId: number;
  purpose: 'invite' | 'sign_in' | 'two_factor_challenge';
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  /** Wrong guesses against this token; a second factor challenge burns after a few. */
  attempts: Generated<number>;
  createdAt: Generated<Date>;
}

export interface SettingsTable {
  key: string;
  /** JSON document. */
  value: string;
  updatedAt: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<number>;
  actorUserId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  /** JSON, never contains secrets. */
  details: string | null;
  ip: string | null;
  createdAt: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  oneTimeTokens: OneTimeTokensTable;
  twoFactorRecoveryCodes: TwoFactorRecoveryCodesTable;
  settings: SettingsTable;
  auditLog: AuditLogTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
