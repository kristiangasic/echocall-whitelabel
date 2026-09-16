import type { MailMessage, MailTransportFactory } from '../mail/mail.service.js';
import type { SmtpSettings } from '../settings/settings.service.js';

export interface RecordedMail extends MailMessage {
  smtp: SmtpSettings;
}

export interface Mailbox {
  factory: MailTransportFactory;
  messages: RecordedMail[];
  /** Makes every following sendMail reject with the given error (null restores delivery). */
  fail(error: Error | null): void;
}

/** A transport factory that records messages instead of talking to an SMTP server. */
export function createMailbox(): Mailbox {
  const messages: RecordedMail[] = [];
  let failure: Error | null = null;
  return {
    messages,
    fail(error) {
      failure = error;
    },
    factory: (smtp) => ({
      async sendMail(message) {
        if (failure) throw failure;
        messages.push({ ...message, smtp });
        return { accepted: [message.to] };
      },
    }),
  };
}
