export type Role = 'admin' | 'user';
export type Language = 'de' | 'en' | 'fr';
export const LANGUAGES: readonly Language[] = ['de', 'en', 'fr'];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** The signed-in user as GET /api/auth/me returns it. */
export interface SessionUser {
  id: number;
  email: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  language: Language;
  echocallCustomerId: number | null;
}

export interface Branding {
  productName: string;
  logoDataUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  imprintUrl: string | null;
  privacyUrl: string | null;
  defaultLanguage: Language;
}

export interface HubStatus {
  ok: boolean;
  checkedAt: string;
  role?: string;
  email?: string | null;
  error?: { code: string; message: string };
}

export interface SetupStatus {
  needsAdmin: boolean;
  hub: HubStatus;
  branding: Branding;
}

/** Error envelope every API route answers with. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
