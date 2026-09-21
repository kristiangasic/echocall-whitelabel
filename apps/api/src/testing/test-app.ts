import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { JSON_BODY_LIMIT } from '../common/http.js';
import { type AppConfig, APP_CONFIG, loadEnv } from '../config/env.js';
import { DB, DB_DIALECT } from '../db/db.service.js';
import { EMBED_TRPC_PATH, embedRawBody } from '../embed/widget-body.js';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { HUB_FETCH } from '../echocall/hub-client.factory.js';
import { MAIL_TRANSPORT_FACTORY } from '../mail/mail.service.js';
import { MAIL_SENDER, type MailRecipient, type MailSender } from '../mail/mail-sender.js';
import { createResellerHubFake, type HubFake } from './hub-fake.js';
import { createMailbox, type Mailbox } from './mailbox.js';

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

export type CapturedMail = {
  kind: 'invite' | 'sign_in_link' | 'registration';
  to: MailRecipient;
  link: string;
};

/** Stands in for MAIL_SENDER in specs that only need to know what would have been sent. */
export class CapturingMailSender implements MailSender {
  readonly sent: CapturedMail[] = [];

  async sendInvite(to: MailRecipient, link: string): Promise<boolean> {
    this.sent.push({ kind: 'invite', to, link });
    return true;
  }

  async sendSignInLink(to: MailRecipient, link: string): Promise<boolean> {
    this.sent.push({ kind: 'sign_in_link', to, link });
    return true;
  }

  async sendRegistration(to: MailRecipient, link: string): Promise<boolean> {
    this.sent.push({ kind: 'registration', to, link });
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
  mailbox?: Mailbox;
}

/** Global module that stands in for ConfigModule, DbModule, the hub network and the SMTP server in specs. */
export function createTestInfraModule(opts: TestInfraOptions): DynamicModule {
  const hub = opts.hub ?? createResellerHubFake();
  const mailbox = opts.mailbox ?? createMailbox();
  return {
    module: TestInfraModule,
    global: true,
    providers: [
      { provide: DB, useValue: opts.db.db },
      { provide: DB_DIALECT, useValue: opts.db.dialect },
      { provide: APP_CONFIG, useValue: opts.config ?? testConfig() },
      { provide: MAIL_SENDER, useValue: opts.mail ?? new CapturingMailSender() },
      { provide: HUB_FETCH, useValue: hub.fetch },
      { provide: MAIL_TRANSPORT_FACTORY, useValue: mailbox.factory },
    ],
    exports: [DB, DB_DIALECT, APP_CONFIG, MAIL_SENDER, HUB_FETCH, MAIL_TRANSPORT_FACTORY],
  };
}

export interface TestApp {
  app: NestExpressApplication;
  moduleRef: TestingModule;
  db: TestDb;
  /** MAIL_SENDER stand-in; modules that import MailModule use the real MailService with the mailbox instead. */
  mail: CapturingMailSender;
  hub: HubFake;
  /** Messages the real MailService handed to its transport. */
  mailbox: Mailbox;
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
  const mailbox = createMailbox();
  const moduleRef = await Test.createTestingModule({
    imports: [createTestInfraModule({ db, config: options.config, mail, hub, mailbox }), ...modules],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  app.set('trust proxy', 1);
  app.use(EMBED_TRPC_PATH, embedRawBody(JSON_BODY_LIMIT));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz', 'embed/{*path}'] });
  await app.init();
  return {
    app,
    moduleRef,
    db,
    mail,
    hub,
    mailbox,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
