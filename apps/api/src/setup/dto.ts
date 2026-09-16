import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from '../auth/dto.js';
import { LANGUAGES } from '../settings/branding.js';

export const setupAdminSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  language: z.enum(LANGUAGES).default('de'),
});
export type SetupAdminDto = z.infer<typeof setupAdminSchema>;
