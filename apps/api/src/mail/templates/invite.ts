import type { Language } from '../../settings/branding.js';
import { type MailContext, type RenderedMail, renderMail } from './layout.js';

const COPY: Record<Language, (ctx: MailContext) => Parameters<typeof renderMail>[1]> = {
  de: (ctx) => ({
    subject: `Ihre Einladung zu ${ctx.productName}`,
    greeting: ctx.firstName ? `Hallo ${ctx.firstName},` : 'Hallo,',
    paragraphs: [
      `Sie wurden zu ${ctx.productName} eingeladen. Über den folgenden Link legen Sie Ihr Passwort fest und melden sich an.`,
    ],
    button: { label: 'Einladung annehmen', url: ctx.link },
    closing: [
      'Der Link ist 7 Tage gültig.',
      'Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.',
    ],
  }),
  en: (ctx) => ({
    subject: `Your invitation to ${ctx.productName}`,
    greeting: ctx.firstName ? `Hello ${ctx.firstName},` : 'Hello,',
    paragraphs: [
      `You have been invited to ${ctx.productName}. Use the link below to choose your password and sign in.`,
    ],
    button: { label: 'Accept invitation', url: ctx.link },
    closing: [
      'The link is valid for 7 days.',
      'If you did not expect this invitation, you can ignore this e-mail.',
    ],
  }),
  fr: (ctx) => ({
    subject: `Votre invitation à ${ctx.productName}`,
    greeting: ctx.firstName ? `Bonjour ${ctx.firstName},` : 'Bonjour,',
    paragraphs: [
      `Vous avez été invité(e) à ${ctx.productName}. Utilisez le lien ci-dessous pour choisir votre mot de passe et vous connecter.`,
    ],
    button: { label: "Accepter l'invitation", url: ctx.link },
    closing: [
      'Le lien est valable 7 jours.',
      "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet e-mail.",
    ],
  }),
};

export function renderInvite(language: Language, ctx: MailContext): RenderedMail {
  return renderMail(ctx.productName, COPY[language](ctx));
}
