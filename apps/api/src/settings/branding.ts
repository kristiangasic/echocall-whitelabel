import { z } from 'zod';

export const LANGUAGES = ['de', 'en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Everything the portal shows about its operator. Nothing in here is secret. */
export interface Branding {
  productName: string;
  logoDataUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  imprintUrl: string | null;
  privacyUrl: string | null;
  defaultLanguage: Language;
}

export type PublicBranding = Branding;

export const DEFAULT_BRANDING: Branding = {
  productName: 'Customer Portal',
  logoDataUrl: null,
  primaryColor: '#2563eb',
  supportEmail: null,
  imprintUrl: null,
  privacyUrl: null,
  defaultLanguage: 'de',
};

/** 200 KB of base64 keeps the logo small enough to inline into every page. */
const LOGO_MAX_CHARS = 200 * 1024;

export const brandingSchema = z.object({
  productName: z.string().trim().min(1, 'Product name is required').max(60),
  logoDataUrl: z
    .string()
    .regex(
      /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/,
      'Logo must be a PNG, JPEG, WebP or SVG image',
    )
    .max(LOGO_MAX_CHARS, 'Logo must be smaller than 200 KB')
    .nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a six digit hex value')
    .transform((value) => value.toLowerCase()),
  supportEmail: z.string().trim().toLowerCase().pipe(z.email()).nullable(),
  imprintUrl: z.url().max(500).nullable(),
  privacyUrl: z.url().max(500).nullable(),
  defaultLanguage: z.enum(LANGUAGES),
});

export type BrandingInput = z.input<typeof brandingSchema>;
