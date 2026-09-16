import { z } from 'zod';
import { emailSchema, nameSchema } from '../../auth/dto.js';
import { LANGUAGES } from '../../settings/branding.js';

const roleSchema = z.enum(['admin', 'user']);
const customerIdSchema = z.number().int().positive();

export const inviteUserSchema = z
  .object({
    email: emailSchema,
    role: roleSchema,
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    language: z.enum(LANGUAGES).default('de'),
    /** Customer id in the hub; required for role user, ignored for administrators. */
    echocallCustomerId: customerIdSchema.optional(),
  })
  .refine((value) => value.role !== 'user' || value.echocallCustomerId !== undefined, {
    path: ['echocallCustomerId'],
    message: 'A customer id is required for users',
  });
export type InviteUserDto = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z
  .object({
    firstName: nameSchema.nullable().optional(),
    lastName: nameSchema.nullable().optional(),
    language: z.enum(LANGUAGES).optional(),
    role: roleSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    echocallCustomerId: customerIdSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const userIdSchema = z.coerce.number().int().positive();
