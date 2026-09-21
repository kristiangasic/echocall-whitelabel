import type { Language } from '../../settings/branding.js';
import { type MailContext, type RenderedMail, renderMail } from './layout.js';

const COPY: Record<Language, (ctx: MailContext) => Parameters<typeof renderMail>[1]> = {
  en: (ctx) => ({
    subject: `Confirm your address for ${ctx.brand.productName}`,
    greeting: ctx.firstName ? `Welcome ${ctx.firstName},` : 'Welcome,',
    paragraphs: [
      `Your account at ${ctx.brand.productName} is ready. One click on the link below confirms this address and opens it.`,
    ],
    button: { label: 'Open your account', url: ctx.link },
    closing: [
      'The link works once and is valid for seven days.',
      'If you did not sign up, ignore this e-mail. Without the link the account stays closed.',
    ],
  }),
  de: (ctx) => ({
    subject: `Bestätigen Sie Ihre Adresse für ${ctx.brand.productName}`,
    greeting: ctx.firstName ? `Willkommen ${ctx.firstName},` : 'Willkommen,',
    paragraphs: [
      `Ihr Konto bei ${ctx.brand.productName} steht bereit. Ein Klick auf den folgenden Link bestätigt diese Adresse und öffnet es.`,
    ],
    button: { label: 'Konto öffnen', url: ctx.link },
    closing: [
      'Der Link funktioniert einmal und ist sieben Tage gültig.',
      'Falls Sie sich nicht registriert haben, ignorieren Sie diese E-Mail. Ohne den Link bleibt das Konto geschlossen.',
    ],
  }),
  fr: (ctx) => ({
    subject: `Confirmez votre adresse pour ${ctx.brand.productName}`,
    greeting: ctx.firstName ? `Bienvenue ${ctx.firstName},` : 'Bienvenue,',
    paragraphs: [
      `Votre compte chez ${ctx.brand.productName} est prêt. Un clic sur le lien ci-dessous confirme cette adresse et l'ouvre.`,
    ],
    button: { label: 'Ouvrir votre compte', url: ctx.link },
    closing: [
      'Le lien fonctionne une seule fois et reste valable sept jours.',
      'Si vous ne vous êtes pas inscrit, ignorez cet e-mail. Sans le lien, le compte reste fermé.',
    ],
  }),
};

export function renderRegistration(language: Language, ctx: MailContext): RenderedMail {
  return renderMail(ctx.brand, COPY[language](ctx));
}
