export const MAIL_SENDER = Symbol('MAIL_SENDER');

export interface MailRecipient {
  email: string;
  language: string;
  firstName: string | null;
}

/** Transactional mail the portal sends; every method returns false when nothing could be sent. */
export interface MailSender {
  sendInvite(to: MailRecipient, link: string): Promise<boolean>;
  sendPasswordReset(to: MailRecipient, link: string): Promise<boolean>;
  sendSignInLink(to: MailRecipient, link: string): Promise<boolean>;
  sendRegistration(to: MailRecipient, link: string): Promise<boolean>;
}
