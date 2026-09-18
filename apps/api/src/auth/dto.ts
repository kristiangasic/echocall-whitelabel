import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const tokenSchema = z.string().min(20).max(200);
export const nameSchema = z.string().trim().max(100);

/**
 * An invitation only asks for a name. The portal has no passwords at all: the
 * link in the mail is the credential, here and at every later sign-in.
 */
export const acceptInviteSchema = z.object({
  token: tokenSchema,
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

/** Removing the second factor asks for one last code, the way enrolling asked for the first. */
export const twoFactorDisableSchema = z.object({ code: twoFactorCodeSchema });
export type TwoFactorDisableDto = z.infer<typeof twoFactorDisableSchema>;
