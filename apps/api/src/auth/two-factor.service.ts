import { Inject, Injectable } from '@nestjs/common';
import QRCode from 'qrcode-svg';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../common/crypto.js';
import { apiError } from '../common/http-error.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import type { UserRow } from '../db/database.types.js';
import { decryptSecret, encryptSecret } from '../settings/crypto.js';
import { generateSecret, otpauthUrl, verifyTotp } from './totp.js';

/** How many recovery codes an activation hands out. */
const RECOVERY_CODES = 10;
/** Letters and digits that cannot be confused for one another when read aloud. */
const RECOVERY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export interface Enrolment {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

/**
 * The second factor of a login: enrolment, activation, removal and the check
 * itself.
 *
 * Recovery codes are hashed with sha256 rather than the password hasher. They
 * are tokens, not passwords: fifty bits of randomness this service generated,
 * never something a person chose, so there is nothing for a slow hash to
 * defend. Ten of them also have to be checked one after another on every
 * attempt, and a slow hash would turn that into a way to tie up the server.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  isEnabled(user: Pick<UserRow, 'totpSecret' | 'totpConfirmedAt'>): boolean {
    return user.totpSecret !== null && user.totpConfirmedAt !== null;
  }

  /**
   * Starts an enrolment. The secret is stored right away but stays unconfirmed,
   * so an enrolment that is never finished changes nothing about signing in.
   */
  async startEnrolment(user: UserRow, issuer: string): Promise<Enrolment> {
    if (this.isEnabled(user)) {
      throw apiError(409, 'two_factor_already_enabled', 'This account already has a second factor');
    }
    const secret = generateSecret();
    await this.db
      .updateTable('users')
      .set({ totpSecret: encryptSecret(secret, this.config.appSecret), totpConfirmedAt: null })
      .where('id', '=', user.id)
      .execute();
    const url = otpauthUrl({ secret, account: user.email, issuer });
    return { secret, otpauthUrl: url, qrSvg: this.qr(url) };
  }

  /** Confirms the enrolment with a code from the app and hands out recovery codes. */
  async activate(user: UserRow, code: string): Promise<string[]> {
    if (this.isEnabled(user)) {
      throw apiError(409, 'two_factor_already_enabled', 'This account already has a second factor');
    }
    if (!user.totpSecret) throw apiError(409, 'two_factor_not_started', 'Start the enrolment first');
    if (!verifyTotp(this.read(user.totpSecret), code, Date.now())) {
      throw apiError(400, 'invalid_code', 'That code does not match');
    }
    await this.db
      .updateTable('users')
      .set({ totpConfirmedAt: new Date() })
      .where('id', '=', user.id)
      .execute();
    return this.replaceRecoveryCodes(user.id);
  }

  /** Removes the second factor and every recovery code with it. */
  async disable(userId: number): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ totpSecret: null, totpConfirmedAt: null })
      .where('id', '=', userId)
      .execute();
    await this.db.deleteFrom('twoFactorRecoveryCodes').where('userId', '=', userId).execute();
  }

  /** True when the code is the app's current one, or an unused recovery code, which is then burned. */
  async check(user: UserRow, code: string): Promise<boolean> {
    if (!this.isEnabled(user) || !user.totpSecret) return false;
    if (verifyTotp(this.read(user.totpSecret), code, Date.now())) return true;
    return this.consumeRecoveryCode(user.id, code);
  }

  private async consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
    const hash = sha256Hex(code.trim().toLowerCase());
    const row = await this.db
      .selectFrom('twoFactorRecoveryCodes')
      .select('id')
      .where('userId', '=', userId)
      .where('codeHash', '=', hash)
      .where('usedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return false;
    const result = await this.db
      .updateTable('twoFactorRecoveryCodes')
      .set({ usedAt: new Date() })
      .where('id', '=', row.id)
      .where('usedAt', 'is', null)
      .executeTakeFirst();
    // A code used twice at the same moment is only accepted once.
    return Number(result.numUpdatedRows) === 1;
  }

  private async replaceRecoveryCodes(userId: number): Promise<string[]> {
    await this.db.deleteFrom('twoFactorRecoveryCodes').where('userId', '=', userId).execute();
    const codes = Array.from({ length: RECOVERY_CODES }, () => recoveryCode());
    await this.db
      .insertInto('twoFactorRecoveryCodes')
      .values(codes.map((code) => ({ userId, codeHash: sha256Hex(code), usedAt: null })))
      .execute();
    return codes;
  }

  private read(stored: string): string {
    return decryptSecret(stored, this.config.appSecret);
  }

  private qr(content: string): string {
    // No XML declaration: the portal inlines this into the page, not into a file.
    return new QRCode({ content, padding: 1, width: 200, height: 200, ecl: 'M', join: true })
      .svg()
      .replace(/^<\?xml[^>]*\?>\s*/, '');
  }
}

/** Ten characters in two groups, which is what a person can copy off paper without losing their place. */
function recoveryCode(): string {
  const bytes = randomBytes(10);
  const chars = [...bytes].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}
