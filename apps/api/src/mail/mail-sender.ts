import { Injectable, Logger } from '@nestjs/common';

export const MAIL_SENDER = Symbol('MAIL_SENDER');

export interface MailRecipient {
  email: string;
  language: string;
  firstName: string | null;
}

export interface MailSender {
  /** Returns false when no mail could be sent (mail not configured or transport failure). */
  sendPasswordReset(to: MailRecipient, link: string): Promise<boolean>;
}

/** Default until SMTP is configured; never logs the link because it is a credential. */
@Injectable()
export class NoopMailSender implements MailSender {
  private readonly logger = new Logger(NoopMailSender.name);

  async sendPasswordReset(to: MailRecipient): Promise<boolean> {
    this.logger.warn(`Mail is not configured; password reset for ${to.email} was not sent`);
    return false;
  }
}
