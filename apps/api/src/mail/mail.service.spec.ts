import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db.js';
import { DEFAULT_BRANDING, LANGUAGES } from '../settings/branding.js';
import { SettingsService, type SmtpSettings } from '../settings/settings.service.js';
import { createMailbox } from '../testing/mailbox.js';
import { testConfig } from '../testing/test-app.js';
import { createSmtpTransport, MailService } from './mail.service.js';
import { renderInvite } from './templates/invite.js';
import { renderRegistration } from './templates/registration.js';
import { renderSignInLink } from './templates/sign-in-link.js';
import { renderTest } from './templates/test.js';

const ENV_SMTP = {
  SMTP_HOST: 'env.example.com',
  SMTP_PORT: '2525',
  SMTP_USER: 'env-user',
  SMTP_PASS: 'env-pass',
  SMTP_FROM: 'env@example.com',
};

describe('MailService', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.reset();
  });

  function service(env: Record<string, string> = {}) {
    const config = testConfig(env);
    const settings = new SettingsService(t.db, t.dialect, config);
    const mailbox = createMailbox();
    return { settings, mailbox, mail: new MailService(config, settings, mailbox.factory) };
  }

  it('reports false and throws mail_not_configured while no SMTP is set up', async () => {
    const { mail, mailbox } = service();
    expect(await mail.resolveSmtp()).toBeNull();
    expect(
      await mail.sendInvite({ email: 'a@example.com', language: 'de', firstName: null }, 'https://x/i'),
    ).toBe(false);
    await expect(mail.sendTest('a@example.com')).rejects.toMatchObject({ status: 409 });
    expect(mailbox.messages).toHaveLength(0);
  });

  it('sends through the environment settings with the product name as sender and the recipient language', async () => {
    const { mail, mailbox, settings } = service(ENV_SMTP);
    await settings.setBranding({ ...DEFAULT_BRANDING, productName: 'Acme "Portal"' });
    expect(await mail.resolveSmtp()).toEqual({
      source: 'env',
      smtp: {
        host: 'env.example.com',
        port: 2525,
        secure: false,
        user: 'env-user',
        pass: 'env-pass',
        from: 'env@example.com',
      },
    });

    const sent = await mail.sendInvite(
      { email: 'marie@example.com', language: 'fr', firstName: 'Marie' },
      'https://portal.example/accept-invite?token=abc',
    );
    expect(sent).toBe(true);
    expect(mailbox.messages).toHaveLength(1);
    const [message] = mailbox.messages;
    expect(message.smtp.host).toBe('env.example.com');
    expect(message.from).toBe(`"Acme 'Portal'" <env@example.com>`);
    expect(message.to).toBe('marie@example.com');
    expect(message.subject).toBe('Votre invitation à Acme "Portal"');
    expect(message.text).toContain('Bonjour Marie,');
    expect(message.text).toContain('https://portal.example/accept-invite?token=abc');
    expect(message.html).toContain('href="https://portal.example/accept-invite?token=abc"');
    expect(message.html).toContain('Acme &quot;Portal&quot;');
  });

  it('prefers the settings stored by the administrator and falls back to English for unknown languages', async () => {
    const { mail, mailbox, settings } = service(ENV_SMTP);
    const stored: SmtpSettings = {
      host: 'db.example.com',
      port: 465,
      secure: true,
      user: null,
      pass: null,
      from: 'db@example.com',
    };
    await settings.setSmtp(stored);
    expect(await mail.resolveSmtp()).toEqual({ source: 'settings', smtp: stored });

    await mail.sendSignInLink({ email: 'x@example.com', language: 'it', firstName: null }, 'https://x/r');
    expect(mailbox.messages[0].smtp.host).toBe('db.example.com');
    expect(mailbox.messages[0].subject).toBe('Your sign-in link for Customer Portal');
    expect(mailbox.messages[0].text).toContain('Hello,');

    // The test mail has no recipient on record, so it follows the portal default.
    await mail.sendTest('admin@example.com');
    expect(mailbox.messages[1].subject).toBe('Test message from Customer Portal');
  });

  it('returns false for transactional mail and 502 smtp_failed for the test mail when the server refuses', async () => {
    const { mail, mailbox } = service(ENV_SMTP);
    mailbox.fail(new Error('535 Authentication failed'));
    expect(
      await mail.sendInvite({ email: 'a@example.com', language: 'en', firstName: null }, 'https://x/i'),
    ).toBe(false);
    await expect(mail.sendTest('a@example.com')).rejects.toMatchObject({
      status: 502,
      response: { error: { code: 'smtp_failed', message: expect.stringContaining('535') } },
    });
  });

  it('builds a real SMTP transport from the settings', () => {
    const transport = createSmtpTransport({
      host: 'h',
      port: 587,
      secure: false,
      user: 'u',
      pass: 'p',
      from: 'a@b.co',
    });
    expect(typeof transport.sendMail).toBe('function');
  });
});

describe('mail templates', () => {
  it('never mention a third party product in any language', () => {
    const ctx = { productName: 'Acme Portal', firstName: 'Kim', link: 'https://x/l' };
    for (const language of LANGUAGES) {
      for (const mail of [
        renderInvite(language, ctx),
        renderSignInLink(language, ctx),
        renderRegistration(language, ctx),
        renderTest(language, 'Acme Portal'),
      ]) {
        for (const part of [mail.subject, mail.text, mail.html]) {
          expect(part).not.toMatch(/echocall|eleven/i);
          expect(part).toContain('Acme Portal');
        }
      }
    }
  });

  it('escapes user provided values in the HTML part only', () => {
    const mail = renderInvite('en', {
      productName: '<b>X</b>',
      firstName: "O'Neil",
      link: 'https://x/?a=1&b=2',
    });
    expect(mail.html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(mail.html).toContain('href="https://x/?a=1&amp;b=2"');
    expect(mail.text).toContain('https://x/?a=1&b=2');
    expect(mail.text).toContain("Hello O'Neil,");
  });
});
