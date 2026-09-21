import type { Language } from '../../settings/branding.js';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/** What the operator has made the portal look like, as far as a mail can show it. */
export interface MailBrand {
  productName: string;
  logoDataUrl: string | null;
  primaryColor: string;
}

export interface MailContext {
  brand: MailBrand;
  firstName: string | null;
  link: string;
}

/** The name a logo is attached under, so the mail body can point at it. */
export const LOGO_CID = 'portal-logo';

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

/**
 * A logo travels with the message instead of being written into it: mail
 * programs refuse to show a picture that is part of the HTML, and one loaded
 * from a server would tell that server who opened the mail and when.
 */
export interface MailLogo {
  content: Buffer;
  contentType: string;
  cid: string;
  filename: string;
}

/**
 * The formats a mail program draws. A drawing is left out on purpose: most of
 * them refuse to render one, and an empty frame says less than the name does.
 */
const LOGO_TYPES: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
};

/** The logo as something that can be attached to a message, if there is one. */
export function mailLogo(logoDataUrl: string | null): MailLogo | null {
  if (logoDataUrl === null) return null;
  const match = /^data:image\/([a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(logoDataUrl);
  if (match === null) return null;
  const extension = LOGO_TYPES[match[1]];
  if (extension === undefined) return null;
  return {
    content: Buffer.from(match[2], 'base64'),
    contentType: `image/${match[1]}`,
    cid: LOGO_CID,
    filename: `logo.${extension}`,
  };
}

/**
 * Black or white, whichever can be read on the given colour. The weights are
 * the ones the web contrast rules use for how bright each channel looks.
 */
export function readableOn(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex === null) return '#ffffff';
  const value = parseInt(hex[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const part = channel / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.36 ? '#111827' : '#ffffff';
}

/** Plain text plus a minimal HTML version (text, the logo and one button); no external assets, no third party names. */
export function renderMail(brand: MailBrand, copy: MailCopy): RenderedMail {
  const textParts = [copy.greeting, '', ...copy.paragraphs.flatMap((p) => [p, ''])];
  if (copy.button) textParts.push(copy.button.url, '');
  textParts.push(...copy.closing.flatMap((p) => [p, '']), brand.productName);
  const text = textParts.join('\n').trimEnd() + '\n';

  const paragraph = (p: string) =>
    `<p style="margin:0 0 16px;font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">${escapeHtml(p)}</p>`;
  const button = copy.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(copy.button.url)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:${escapeHtml(brand.primaryColor)};color:${readableOn(brand.primaryColor)};text-decoration:none;font:600 15px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${escapeHtml(copy.button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b7280;word-break:break-all">${escapeHtml(copy.button.url)}</p>`
    : '';
  // A mail program that hides pictures shows the alt text, so the name is in
  // the picture as well as beside it.
  const heading =
    mailLogo(brand.logoDataUrl) === null
      ? `<p style="margin:0 0 24px;font:700 18px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">${escapeHtml(brand.productName)}</p>`
      : `<p style="margin:0 0 24px"><img src="cid:${LOGO_CID}" alt="${escapeHtml(brand.productName)}" height="40" style="max-height:40px;max-width:220px;border:0;display:block" /></p>`;
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6">` +
    `<div style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px;border-top:4px solid ${escapeHtml(brand.primaryColor)}">` +
    heading +
    paragraph(copy.greeting) +
    copy.paragraphs.map(paragraph).join('') +
    button +
    copy.closing.map(paragraph).join('') +
    `</div></body></html>`;

  return { subject: copy.subject, text, html };
}
