import { z } from 'zod';

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
