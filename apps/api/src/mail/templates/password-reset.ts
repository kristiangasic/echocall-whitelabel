import type { Language } from '../../settings/branding.js';
import { type MailContext, type RenderedMail, renderMail } from './layout.js';

const COPY: Record<Language, (ctx: MailContext) => Parameters<typeof renderMail>[1]> = {
  de: (ctx) => ({
    subject: `Passwort zurücksetzen für ${ctx.productName}`,
    greeting: ctx.firstName ? `Hallo ${ctx.firstName},` : 'Hallo,',
    paragraphs: [
      `Sie haben angefordert, Ihr Passwort für ${ctx.productName} zurückzusetzen. Über den folgenden Link legen Sie ein neues Passwort fest.`,
    ],
    button: { label: 'Neues Passwort festlegen', url: ctx.link },
    closing: [
      'Der Link ist eine Stunde gültig.',
      'Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail. Ihr Passwort bleibt unverändert.',
    ],
  }),
  en: (ctx) => ({
    subject: `Reset your password for ${ctx.productName}`,
    greeting: ctx.firstName ? `Hello ${ctx.firstName},` : 'Hello,',
    paragraphs: [
      `You asked to reset your password for ${ctx.productName}. Use the link below to choose a new one.`,
    ],
    button: { label: 'Choose a new password', url: ctx.link },
    closing: [
      'The link is valid for one hour.',
      'If you did not request this, ignore this e-mail. Your password stays unchanged.',
    ],
  }),
  fr: (ctx) => ({
    subject: `Réinitialiser votre mot de passe pour ${ctx.productName}`,
    greeting: ctx.firstName ? `Bonjour ${ctx.firstName},` : 'Bonjour,',
    paragraphs: [
      `Vous avez demandé à réinitialiser votre mot de passe pour ${ctx.productName}. Utilisez le lien ci-dessous pour en choisir un nouveau.`,
    ],
    button: { label: 'Choisir un nouveau mot de passe', url: ctx.link },
    closing: [
      'Le lien est valable une heure.',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail. Votre mot de passe reste inchangé.",
    ],
  }),
};

export function renderPasswordReset(language: Language, ctx: MailContext): RenderedMail {
  return renderMail(ctx.productName, COPY[language](ctx));
}
