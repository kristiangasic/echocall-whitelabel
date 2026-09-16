import type { Language } from '../../settings/branding.js';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

export interface MailContext {
  productName: string;
  firstName: string | null;
  link: string;
}

export interface MailCopy {
  subject: string;
  greeting: string;
  paragraphs: string[];
  button: { label: string; url: string } | null;
  closing: string[];
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Picks a supported language, falling back to English. */
export function pickLanguage(language: string | null | undefined): Language {
  return language === 'de' || language === 'fr' || language === 'en' ? language : 'en';
}

/** Plain text plus a minimal HTML version (text and one button); no external assets, no third party names. */
export function renderMail(productName: string, copy: MailCopy): RenderedMail {
  const textParts = [copy.greeting, '', ...copy.paragraphs.flatMap((p) => [p, ''])];
  if (copy.button) textParts.push(copy.button.url, '');
  textParts.push(...copy.closing.flatMap((p) => [p, '']), productName);
  const text = textParts.join('\n').trimEnd() + '\n';

  const paragraph = (p: string) =>
    `<p style="margin:0 0 16px;font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">${escapeHtml(p)}</p>`;
  const button = copy.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(copy.button.url)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#1f2937;color:#ffffff;text-decoration:none;font:600 15px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${escapeHtml(copy.button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b7280;word-break:break-all">${escapeHtml(copy.button.url)}</p>`
    : '';
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6">` +
    `<div style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px">` +
    `<p style="margin:0 0 24px;font:700 18px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">${escapeHtml(productName)}</p>` +
    paragraph(copy.greeting) +
    copy.paragraphs.map(paragraph).join('') +
    button +
    copy.closing.map(paragraph).join('') +
    `</div></body></html>`;

  return { subject: copy.subject, text, html };
}
