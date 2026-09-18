import { z } from 'zod';
import { emailSchema, nameSchema } from '../../auth/dto.js';
import { LANGUAGES } from '../../settings/branding.js';

const companySchema = z.string().trim().max(200);

/**
 * A new customer of the portal: one account in the hub and one portal login for
 * it. An empty name or company is simply not sent on.
 */
export const createCustomerSchema = z.object({
  email: emailSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  company: companySchema.optional(),
  language: z.enum(LANGUAGES).default('en'),
  /** Whether the invitation is mailed right away. The link is returned either way. */
  sendInvite: z.boolean().default(true),
});
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

/**
 * What an operator may change about a customer. An empty string clears the
 * field, which is why none of these are nullable: the hub only accepts strings.
 */
export const updateCustomerSchema = z
  .object({
    email: emailSchema.optional(),
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    company: companySchema.optional(),
    language: z.enum(LANGUAGES).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

export const customerIdSchema = z.coerce.number().int().positive();
