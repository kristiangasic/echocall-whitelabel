import type { Language } from '../../settings/branding.js';
import { type MailContext, type RenderedMail, renderMail } from './layout.js';

const COPY: Record<Language, (ctx: MailContext) => Parameters<typeof renderMail>[1]> = {
  en: (ctx) => ({
    subject: `Your sign-in link for ${ctx.productName}`,
    greeting: ctx.firstName ? `Hello ${ctx.firstName},` : 'Hello,',
    paragraphs: [`Use the link below to sign in to ${ctx.productName}. No password needed.`],
    button: { label: 'Sign in', url: ctx.link },
    closing: [
      'The link works once and is valid for fifteen minutes.',
      'If you did not ask for it, ignore this e-mail. Nobody can sign in with it but you.',
    ],
  }),
  de: (ctx) => ({
    subject: `Ihr Anmeldelink für ${ctx.productName}`,
    greeting: ctx.firstName ? `Hallo ${ctx.firstName},` : 'Hallo,',
    paragraphs: [`Über den folgenden Link melden Sie sich bei ${ctx.productName} an. Ganz ohne Passwort.`],
    button: { label: 'Anmelden', url: ctx.link },
    closing: [
      'Der Link funktioniert einmal und ist fünfzehn Minuten gültig.',
      'Falls Sie ihn nicht angefordert haben, ignorieren Sie diese E-Mail. Anmelden kann sich damit niemand außer Ihnen.',
    ],
  }),
  fr: (ctx) => ({
    subject: `Votre lien de connexion pour ${ctx.productName}`,
    greeting: ctx.firstName ? `Bonjour ${ctx.firstName},` : 'Bonjour,',
    paragraphs: [
      `Utilisez le lien ci-dessous pour vous connecter à ${ctx.productName}. Aucun mot de passe nécessaire.`,
    ],
    button: { label: 'Se connecter', url: ctx.link },
    closing: [
      'Le lien fonctionne une seule fois et reste valable quinze minutes.',
      "Si vous ne l'avez pas demandé, ignorez cet e-mail. Personne d'autre que vous ne peut s'en servir.",
    ],
  }),
};

export function renderSignInLink(language: Language, ctx: MailContext): RenderedMail {
  return renderMail(ctx.productName, COPY[language](ctx));
}
