import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { apiError, describeError } from '../common/http-error.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { SettingsService, type SmtpSettings } from '../settings/settings.service.js';
import type { MailRecipient, MailSender } from './mail-sender.js';
import { renderInvite } from './templates/invite.js';
import { pickLanguage, type RenderedMail } from './templates/layout.js';
import { renderPasswordReset } from './templates/password-reset.js';
import { renderTest } from './templates/test.js';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export type MailTransportFactory = (smtp: SmtpSettings) => MailTransport;

/** Injection token for the transport factory; tests hand in a recording one. */
export const MAIL_TRANSPORT_FACTORY = Symbol('MAIL_TRANSPORT_FACTORY');

export interface ActiveSmtp {
  smtp: SmtpSettings;
  source: 'settings' | 'env';
}

export function createSmtpTransport(smtp: SmtpSettings): MailTransport {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Sends the portal's transactional mail through the SMTP settings from the database or the environment. */
@Injectable()
export class MailService implements MailSender {
  private readonly logger = new Logger(MailService.name);
  private readonly transportFor: MailTransportFactory;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    @Optional() @Inject(MAIL_TRANSPORT_FACTORY) transportFactory?: MailTransportFactory,
  ) {
    this.transportFor = transportFactory ?? createSmtpTransport;
  }

  /** Settings stored by the administrator win over the environment. */
  async resolveSmtp(): Promise<ActiveSmtp | null> {
    const stored = await this.settings.getSmtp();
    if (stored) return { smtp: stored, source: 'settings' };
    const env = this.config.smtp;
    if (!env) return null;
    return {
      source: 'env',
      smtp: {
        host: env.host,
        port: env.port,
        secure: env.secure,
        user: env.user ?? null,
        pass: env.pass ?? null,
        from: env.from,
      },
    };
  }

  async sendInvite(to: MailRecipient, link: string): Promise<boolean> {
    const productName = (await this.settings.getBranding()).productName;
    const mail = renderInvite(pickLanguage(to.language), { productName, firstName: to.firstName, link });
    return this.deliver(to.email, mail, 'invitation');
  }

  async sendPasswordReset(to: MailRecipient, link: string): Promise<boolean> {
    const productName = (await this.settings.getBranding()).productName;
    const mail = renderPasswordReset(pickLanguage(to.language), {
      productName,
      firstName: to.firstName,
      link,
    });
    return this.deliver(to.email, mail, 'password reset');
  }

  /** Throws 409 mail_not_configured or 502 smtp_failed so the admin page can show why. */
  async sendTest(to: string): Promise<void> {
    const active = await this.resolveSmtp();
    if (!active) throw apiError(409, 'mail_not_configured', 'Configure the e-mail server first');
    const branding = await this.settings.getBranding();
    const mail = renderTest(branding.defaultLanguage, branding.productName);
    try {
      await this.transportFor(active.smtp).sendMail(
        this.message(active.smtp, branding.productName, to, mail),
      );
    } catch (error) {
      this.logger.error(`Test mail to ${to} failed: ${describeError(error)}`);
      throw apiError(502, 'smtp_failed', `The e-mail server refused the message: ${errorMessage(error)}`);
    }
  }

  private async deliver(to: string, mail: RenderedMail, kind: string): Promise<boolean> {
    const active = await this.resolveSmtp();
    if (!active) {
      this.logger.warn(`Mail is not configured; ${kind} for ${to} was not sent`);
      return false;
    }
    const productName = (await this.settings.getBranding()).productName;
    try {
      await this.transportFor(active.smtp).sendMail(this.message(active.smtp, productName, to, mail));
      return true;
    } catch (error) {
      this.logger.error(`Sending ${kind} to ${to} failed: ${describeError(error)}`);
      return false;
    }
  }

  private message(smtp: SmtpSettings, productName: string, to: string, mail: RenderedMail): MailMessage {
    return {
      from: formatFrom(productName, smtp.from),
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    };
  }
}

/** "Display Name" <address>, with quotes in the name replaced so the header stays well formed. */
export function formatFrom(name: string, address: string): string {
  return `"${name.replaceAll('"', "'")}" <${address}>`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
