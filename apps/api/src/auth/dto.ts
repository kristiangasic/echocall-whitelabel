import { z } from 'zod';
import { isWeakPassword } from './weak-password.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .refine((value) => !isWeakPassword(value), 'Password is too easy to guess');
const tokenSchema = z.string().min(20).max(200);
export const nameSchema = z.string().trim().max(100);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotDto = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetDto = z.infer<typeof resetSchema>;

/**
 * The password is optional because an account may be opened without one: with
 * sign-in links on, the link in the mail is the credential. The endpoint refuses
 * an omitted password while links are off, where it would lock the account out.
 */
export const acceptInviteSchema = z.object({
  token: tokenSchema,
  password: passwordSchema.optional(),
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
});
export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;

export const signInLinkSchema = z.object({ email: emailSchema });
export type SignInLinkDto = z.infer<typeof signInLinkSchema>;

export const signInLinkConsumeSchema = z.object({ token: tokenSchema });
export type SignInLinkConsumeDto = z.infer<typeof signInLinkConsumeSchema>;

export const registerSchema = z.object({
  email: emailSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  company: z.string().trim().max(120).optional(),
  language: z.enum(['en', 'de', 'fr']).default('en'),
});
export type RegisterDto = z.infer<typeof registerSchema>;

/** A code from an authenticator app, or a recovery code, as it was typed. */
export const twoFactorCodeSchema = z.string().trim().min(6).max(20);

export const twoFactorActivateSchema = z.object({ code: twoFactorCodeSchema });
export type TwoFactorActivateDto = z.infer<typeof twoFactorActivateSchema>;

export const twoFactorVerifySchema = z.object({ challenge: tokenSchema, code: twoFactorCodeSchema });
export type TwoFactorVerifyDto = z.infer<typeof twoFactorVerifySchema>;

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'Password is required').max(200),
});
export type TwoFactorDisableDto = z.infer<typeof twoFactorDisableSchema>;
