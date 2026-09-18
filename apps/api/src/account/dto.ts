import { z } from 'zod';
import { nameSchema } from '../auth/dto.js';
import { LANGUAGES } from '../settings/branding.js';

export const profileUpdateSchema = z
  .object({
    firstName: nameSchema.nullable().optional(),
    lastName: nameSchema.nullable().optional(),
    language: z.enum(LANGUAGES).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  });
export type ProfileUpdateDto = z.infer<typeof profileUpdateSchema>;
