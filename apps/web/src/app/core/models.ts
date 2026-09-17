export type Role = 'admin' | 'user';
export type Language = 'de' | 'en' | 'fr';
export const LANGUAGES: readonly Language[] = ['de', 'en', 'fr'];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export type UserStatus = 'invited' | 'active' | 'disabled';

/**
 * The operator who opened a session as one of their customers. The e-mail is
 * null when that operator account has since been deleted.
 */
export interface Impersonator {
  id: number;
  email: string | null;
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
  /** True once this login is protected by a second factor. */
  twoFactorEnabled?: boolean;
  /** Set while an operator is viewing the portal as this customer. */
  impersonator?: Impersonator | null;
}

/** What the password step answers with when the account asks for a second factor. */
export interface TwoFactorChallenge {
  challenge: string;
  expiresAt: string;
}

/** Either the portal is open, or it wants the code from the authenticator app. */
export type LoginResult =
  { kind: 'session'; user: SessionUser } | { kind: 'challenge'; challenge: TwoFactorChallenge };

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
  /** ISO timestamp of the last check, empty before the first one. */
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

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

/* Admin */

export interface UserCounts {
  total: number;
  admins: number;
  users: number;
  active: number;
  invited: number;
  disabled: number;
}

export interface AdminOverview {
  hub: HubStatus;
  users: UserCounts;
}

export interface AdminUser {
  id: number;
  email: string;
  role: Role;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  language: Language;
  echocallCustomerId: number | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface InviteInput {
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  language: Language;
  echocallCustomerId?: number;
}

export interface UserUpdate {
  firstName?: string | null;
  lastName?: string | null;
  language?: Language;
  role?: Role;
  status?: 'active' | 'disabled';
  echocallCustomerId?: number | null;
}

export interface InviteResult {
  user: AdminUser;
  inviteLink: string;
  mailSent: boolean;
}

export interface PasswordResetResult {
  resetLink: string;
  mailSent: boolean;
}

/** A new customer: the account in the service plus the portal login invited for it. */
export interface CreateCustomerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  language: Language;
  sendInvite: boolean;
}

export interface CreateCustomerResult {
  customerId: number;
  user: AdminUser;
  inviteLink: string;
  mailSent: boolean;
}

/** An empty string clears the field; a field that is left out stays as it is. */
export interface UpdateCustomerInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  language?: Language;
}

/** What a customer change did to the portal login, null when the customer has none. */
export interface CustomerLoginResult {
  user: AdminUser | null;
}

export interface AuditEntry {
  id: number;
  actorUserId: number | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface SmtpView {
  configured: boolean;
  source: 'settings' | 'env' | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  from: string | null;
  hasPassword: boolean;
}

export interface SmtpInput {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  /** Omitted or empty keeps the stored password; null removes it. */
  pass?: string | null;
  from: string;
}

/* Customer */

export interface HubProfile {
  id: number;
  role: string;
  email?: string | null;
  name?: string | null;
  defaultLanguage?: string | null;
}

export interface HubUsage {
  period: { from?: string; to?: string };
  voiceMinutesUsed: number;
  chatSessionsUsed: number;
}

export interface HubLimits {
  accountStatus: string | null;
  balanceEur: number;
  voiceMinutesRemaining?: number;
  chatConversationsRemaining?: number;
  plan?: {
    name?: string;
    voiceMinutesPerMonth?: number | null;
    chatConversationsPerMonth?: number | null;
  } | null;
}

export interface AccountOverview {
  profile: HubProfile;
  usage: HubUsage;
  limits: HubLimits;
}
