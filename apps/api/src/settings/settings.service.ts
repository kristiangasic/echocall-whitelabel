import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { DB, DB_DIALECT } from '../db/db.service.js';
import type { Db, DbDialect } from '../db/dialect.js';
import { type Branding, DEFAULT_BRANDING } from './branding.js';
import { DEFAULT_REGISTRATION, type RegistrationSettings } from './registration.js';
import { decryptSecret, encryptSecret } from './crypto.js';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  /** Sender address; the display name is the branding's product name. */
  from: string;
}

interface StoredSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  passEncrypted: string | null;
  from: string;
}

const KEYS = { branding: 'branding', smtp: 'smtp', registration: 'registration' } as const;

/** Key-value settings in the database; secrets are encrypted with APP_SECRET before they are stored. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_DIALECT) private readonly dialect: DbDialect,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Stored values on top of the defaults, so fields added later still have a value. */
  async getBranding(): Promise<Branding> {
    const stored = await this.read<Partial<Branding>>(KEYS.branding);
    return { ...DEFAULT_BRANDING, ...stored };
  }

  setBranding(branding: Branding): Promise<void> {
    return this.write(KEYS.branding, branding);
  }

  /** Stored flags on top of the defaults, so a portal that predates them stays closed. */
  async getRegistration(): Promise<RegistrationSettings> {
    const stored = await this.read<Partial<RegistrationSettings>>(KEYS.registration);
    return { ...DEFAULT_REGISTRATION, ...stored };
  }

  setRegistration(registration: RegistrationSettings): Promise<void> {
    return this.write(KEYS.registration, registration);
  }

  async getSmtp(): Promise<SmtpSettings | null> {
    const stored = await this.read<StoredSmtp>(KEYS.smtp);
    if (!stored) return null;
    let pass: string | null = null;
    if (stored.passEncrypted) {
      try {
        pass = decryptSecret(stored.passEncrypted, this.config.appSecret);
      } catch {
        this.logger.error(
          'Stored SMTP password cannot be decrypted; was APP_SECRET changed? Enter it again.',
        );
      }
    }
    return {
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      user: stored.user,
      pass,
      from: stored.from,
    };
  }

  async setSmtp(smtp: SmtpSettings | null): Promise<void> {
    if (smtp === null) {
      await this.db.deleteFrom('settings').where('key', '=', KEYS.smtp).execute();
      return;
    }
    const stored: StoredSmtp = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      passEncrypted: smtp.pass ? encryptSecret(smtp.pass, this.config.appSecret) : null,
      from: smtp.from,
    };
    await this.write(KEYS.smtp, stored);
  }

  private async read<T>(key: string): Promise<T | null> {
    const row = await this.db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      this.logger.error(`Setting ${key} holds invalid JSON and is ignored`);
      return null;
    }
  }

  private async write(key: string, value: unknown): Promise<void> {
    const row = { key, value: JSON.stringify(value), updatedAt: new Date() };
    const insert = this.db.insertInto('settings').values(row);
    if (this.dialect === 'postgres') {
      await insert
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: row.value, updatedAt: row.updatedAt }))
        .execute();
      return;
    }
    await insert.onDuplicateKeyUpdate({ value: row.value, updatedAt: row.updatedAt }).execute();
  }
}
