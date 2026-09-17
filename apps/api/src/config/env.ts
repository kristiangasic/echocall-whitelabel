import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.url().transform((u) => u.replace(/\/+$/, '')),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  DATABASE_URL: z
    .string()
    .regex(
      /^(postgres|postgresql|mysql|mariadb):\/\//,
      'DATABASE_URL must start with postgres://, postgresql://, mysql:// or mariadb://',
    ),
  DATABASE_SSL: z
    .enum(['disable', 'require', 'no-verify'], {
      error: 'DATABASE_SSL must be disable, require or no-verify',
    })
    .default('disable'),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  ECHOCALL_API_URL: z.url().default('https://hub.echocall.de/api/v1'),
  ECHOCALL_API_KEY: z
    .string()
    .regex(/^eck_(live|test)_[a-f0-9]{64}$/, 'ECHOCALL_API_KEY must look like eck_live_<64 hex characters>'),
  ECHOCALL_WIDGET_URL: z.url().default('https://cdn.echocall.de'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  WEB_DIST_DIR: z.string().optional(),
});

export type DbSslMode = 'disable' | 'require' | 'no-verify';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  /** Public URL of the portal without a trailing slash. */
  appUrl: string;
  /** Signs session cookies and encrypts stored secrets; at least 32 characters. */
  appSecret: string;
  database: { url: string; ssl: DbSslMode };
  /** Defaults to true when the app URL uses https. */
  cookieSecure: boolean;
  trustProxy: number;
  echocall: { apiUrl: string; apiKey: string; widgetUrl: string };
  smtp: SmtpConfig | null;
  /** Serve the Angular build from this directory when set. */
  webDistDir: string | null;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Reads and validates the process environment. Throws one error that lists
 * every problem, so a misconfigured deployment fails fast with a readable message.
 */
export function loadEnv(source: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    appUrl: e.APP_URL,
    appSecret: e.APP_SECRET,
    database: { url: e.DATABASE_URL, ssl: e.DATABASE_SSL },
    cookieSecure: e.COOKIE_SECURE ?? e.APP_URL.startsWith('https://'),
    trustProxy: e.TRUST_PROXY,
    echocall: {
      apiUrl: e.ECHOCALL_API_URL.replace(/\/+$/, ''),
      apiKey: e.ECHOCALL_API_KEY,
      widgetUrl: e.ECHOCALL_WIDGET_URL.replace(/\/+$/, ''),
    },
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          user: e.SMTP_USER,
          pass: e.SMTP_PASS,
          from: e.SMTP_FROM ?? `no-reply@${new URL(e.APP_URL).hostname}`,
        }
      : null,
    webDistDir: e.WEB_DIST_DIR ?? null,
  };
}
