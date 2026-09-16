import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { type AppConfig, APP_CONFIG, loadEnv } from '../config/env.js';
import { DB, DB_DIALECT } from '../db/db.service.js';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { HUB_FETCH } from '../echocall/hub-client.factory.js';
import { MAIL_SENDER, type MailRecipient, type MailSender } from '../mail/mail-sender.js';
import { createResellerHubFake, type HubFake } from './hub-fake.js';

export const TEST_API_KEY = 'eck_live_' + 'a'.repeat(64);

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadEnv({
    APP_URL: 'http://localhost:3000',
    APP_SECRET: 's'.repeat(32),
    DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
    ECHOCALL_API_KEY: TEST_API_KEY,
    ...overrides,
  });
}

export class CapturingMailSender implements MailSender {
  readonly sent: Array<{ kind: 'password_reset'; to: MailRecipient; link: string }> = [];

  async sendPasswordReset(to: MailRecipient, link: string): Promise<boolean> {
    this.sent.push({ kind: 'password_reset', to, link });
    return true;
  }
}

@Module({})
class TestInfraModule {}

export interface TestInfraOptions {
  db: TestDb;
  config?: AppConfig;
  mail?: MailSender;
  hub?: HubFake;
}

/** Global module that stands in for ConfigModule, DbModule, MailModule and the hub network in specs. */
export function createTestInfraModule(opts: TestInfraOptions): DynamicModule {
  const hub = opts.hub ?? createResellerHubFake();
  return {
    module: TestInfraModule,
    global: true,
    providers: [
      { provide: DB, useValue: opts.db.db },
      { provide: DB_DIALECT, useValue: opts.db.dialect },
      { provide: APP_CONFIG, useValue: opts.config ?? testConfig() },
      { provide: MAIL_SENDER, useValue: opts.mail ?? new CapturingMailSender() },
      { provide: HUB_FETCH, useValue: hub.fetch },
    ],
    exports: [DB, DB_DIALECT, APP_CONFIG, MAIL_SENDER, HUB_FETCH],
  };
}

export interface TestApp {
  app: NestExpressApplication;
  moduleRef: TestingModule;
  db: TestDb;
  mail: CapturingMailSender;
  hub: HubFake;
  /** Closes the Nest app and the database pool. */
  close(): Promise<void>;
}

export interface TestAppOptions {
  config?: AppConfig;
  /** Fake hub; defaults to one that recognises the test key as a reseller. */
  hub?: HubFake;
}

/** Boots the given feature modules the way main.ts does (cookies, api prefix, trust proxy) against the test database. */
export async function createTestApp(
  modules: Array<Type | DynamicModule>,
  options: TestAppOptions = {},
): Promise<TestApp> {
  const db = await createTestDb();
  const mail = new CapturingMailSender();
  const hub = options.hub ?? createResellerHubFake();
  const moduleRef = await Test.createTestingModule({
    imports: [createTestInfraModule({ db, config: options.config, mail, hub }), ...modules],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
  await app.init();
  return {
    app,
    moduleRef,
    db,
    mail,
    hub,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
