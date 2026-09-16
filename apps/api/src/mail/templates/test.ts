import type { Language } from '../../settings/branding.js';
import { type RenderedMail, renderMail } from './layout.js';

const COPY: Record<Language, (productName: string) => Parameters<typeof renderMail>[1]> = {
  de: (productName) => ({
    subject: `Testnachricht von ${productName}`,
    greeting: 'Hallo,',
    paragraphs: ['dies ist eine Testnachricht. Ihre E-Mail-Einstellungen funktionieren.'],
    button: null,
    closing: [],
  }),
  en: (productName) => ({
    subject: `Test message from ${productName}`,
    greeting: 'Hello,',
    paragraphs: ['this is a test message. Your e-mail settings work.'],
    button: null,
    closing: [],
  }),
  fr: (productName) => ({
    subject: `Message de test de ${productName}`,
    greeting: 'Bonjour,',
    paragraphs: ['ceci est un message de test. Vos paramètres e-mail fonctionnent.'],
    button: null,
    closing: [],
  }),
};

export function renderTest(language: Language, productName: string): RenderedMail {
  return renderMail(productName, COPY[language](productName));
}
