import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const KEY = 'eck_live_' + 'a'.repeat(64);
const base = {
  APP_URL: 'https://portal.example.com',
  APP_SECRET: 's'.repeat(32),
  DATABASE_URL: 'postgres://light:secret@db:5432/light',
  ECHOCALL_API_KEY: KEY,
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const c = loadEnv({ ...base });
    expect(c.nodeEnv).toBe('development');
    expect(c.port).toBe(3000);
    expect(c.database).toEqual({ url: 'postgres://light:secret@db:5432/light', ssl: 'disable' });
    expect(c.cookieSecure).toBe(true);
    expect(c.trustProxy).toBe(1);
    expect(c.echocall.apiUrl).toBe('https://hub.echocall.de/api/v1');
    expect(c.echocall.apiKey).toBe(KEY);
    expect(c.smtp).toBeNull();
    expect(c.webDistDir).toBeNull();
  });

  it('accepts every supported database scheme and rejects others', () => {
    for (const url of ['postgresql://a:b@h/d', 'mysql://a:b@h/d', 'mariadb://a:b@h/d']) {
      expect(loadEnv({ ...base, DATABASE_URL: url }).database.url).toBe(url);
    }
    expect(() => loadEnv({ ...base, DATABASE_URL: 'sqlite://file.db' })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, DATABASE_SSL: 'yes' })).toThrow(/DATABASE_SSL/);
    expect(loadEnv({ ...base, DATABASE_SSL: 'no-verify' }).database.ssl).toBe('no-verify');
  });

  it('turns cookieSecure off for a plain http URL unless forced', () => {
    expect(loadEnv({ ...base, APP_URL: 'http://localhost:3000' }).cookieSecure).toBe(false);
    expect(loadEnv({ ...base, APP_URL: 'http://localhost:3000', COOKIE_SECURE: 'true' }).cookieSecure).toBe(
      true,
    );
    expect(loadEnv({ ...base, COOKIE_SECURE: '0' }).cookieSecure).toBe(false);
  });

  it('rejects a malformed API key and a short secret with readable messages', () => {
    expect(() => loadEnv({ ...base, ECHOCALL_API_KEY: 'nope' })).toThrow(/ECHOCALL_API_KEY/);
    expect(() => loadEnv({ ...base, APP_SECRET: 'short' })).toThrow(/APP_SECRET/);
    expect(() => loadEnv({})).toThrow(/Invalid configuration:\n(.*\n)*APP_URL/);
  });

  it('reads SMTP only when a host is given', () => {
    const c = loadEnv({ ...base, SMTP_HOST: 'mail.example.com', SMTP_FROM: 'Portal <no-reply@example.com>' });
    expect(c.smtp).toEqual({
      host: 'mail.example.com',
      port: 587,
      secure: false,
      user: undefined,
      pass: undefined,
      from: 'Portal <no-reply@example.com>',
    });
    const withDefaults = loadEnv({
      ...base,
      SMTP_HOST: 'mail.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: '1',
    });
    expect(withDefaults.smtp).toMatchObject({ port: 465, secure: true, from: 'no-reply@portal.example.com' });
  });

  it('strips a trailing slash from the app URL and the hub URL', () => {
    const c = loadEnv({
      ...base,
      APP_URL: 'https://portal.example.com/',
      ECHOCALL_API_URL: 'https://hub.test/api/v1/',
    });
    expect(c.appUrl).toBe('https://portal.example.com');
    expect(c.echocall.apiUrl).toBe('https://hub.test/api/v1');
  });
});
