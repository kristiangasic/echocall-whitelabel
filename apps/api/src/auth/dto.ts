import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z.string().min(10, 'Password must be at least 10 characters').max(200);
const tokenSchema = z.string().min(20).max(200);
const nameSchema = z.string().trim().max(100);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotDto = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetDto = z.infer<typeof resetSchema>;

export const acceptInviteSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
});
export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;
