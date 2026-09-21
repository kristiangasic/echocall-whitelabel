import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { apiError, describeError } from '../common/http-error.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { SettingsService, type SmtpSettings } from '../settings/settings.service.js';
import type { MailRecipient, MailSender } from './mail-sender.js';
import { renderInvite } from './templates/invite.js';
import { type MailBrand, mailLogo, pickLanguage, type RenderedMail } from './templates/layout.js';
import { renderRegistration } from './templates/registration.js';
import { renderSignInLink } from './templates/sign-in-link.js';
import { renderTest } from './templates/test.js';

/** A picture that travels inside the message, named so the body can show it. */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
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
    const brand = await this.brand();
    const mail = renderInvite(pickLanguage(to.language), { brand, firstName: to.firstName, link });
    return this.deliver(to.email, mail, 'invitation');
  }

  async sendSignInLink(to: MailRecipient, link: string): Promise<boolean> {
    const brand = await this.brand();
    const mail = renderSignInLink(pickLanguage(to.language), {
      brand,
      firstName: to.firstName,
      link,
    });
    return this.deliver(to.email, mail, 'sign-in link');
  }

  async sendRegistration(to: MailRecipient, link: string): Promise<boolean> {
    const brand = await this.brand();
    const mail = renderRegistration(pickLanguage(to.language), {
      brand,
      firstName: to.firstName,
      link,
    });
    return this.deliver(to.email, mail, 'registration');
  }

  /** Throws 409 mail_not_configured or 502 smtp_failed so the admin page can show why. */
  async sendTest(to: string): Promise<void> {
    const active = await this.resolveSmtp();
    if (!active) throw apiError(409, 'mail_not_configured', 'Configure the e-mail server first');
    const branding = await this.settings.getBranding();
    const mail = renderTest(branding.defaultLanguage, branding);
    try {
      await this.transportFor(active.smtp).sendMail(this.message(active.smtp, branding, to, mail));
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
    const brand = await this.brand();
    try {
      await this.transportFor(active.smtp).sendMail(this.message(active.smtp, brand, to, mail));
      return true;
    } catch (error) {
      this.logger.error(`Sending ${kind} to ${to} failed: ${describeError(error)}`);
      return false;
    }
  }

  /** Everything a mail shows of the portal it comes from. */
  private async brand(): Promise<MailBrand> {
    const { productName, logoDataUrl, primaryColor } = await this.settings.getBranding();
    return { productName, logoDataUrl, primaryColor };
  }

  private message(smtp: SmtpSettings, brand: MailBrand, to: string, mail: RenderedMail): MailMessage {
    const logo = mailLogo(brand.logoDataUrl);
    return {
      from: formatFrom(brand.productName, smtp.from),
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(logo === null ? {} : { attachments: [logo] }),
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
