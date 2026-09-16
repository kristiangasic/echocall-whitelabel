import { z } from 'zod';
import { emailSchema } from '../auth/dto.js';

export const smtpUpdateSchema = z.object({
  host: z.string().trim().min(1, 'Host is required').max(253),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(200).nullable().default(null),
  /** Omitted or empty keeps the stored password; null removes it. */
  pass: z.string().max(500).nullable().optional(),
  from: emailSchema,
});
export type SmtpUpdateDto = z.infer<typeof smtpUpdateSchema>;

export const smtpTestSchema = z.object({ to: emailSchema });
export type SmtpTestDto = z.infer<typeof smtpTestSchema>;
