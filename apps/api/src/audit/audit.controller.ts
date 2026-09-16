import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type AuditRow, AuditService, type Page } from './audit.service.js';
import { type AuditQueryDto, auditQuerySchema } from './dto.js';

@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles('admin')
  @Get()
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryDto): Promise<Page<AuditRow>> {
    return this.audit.list(query.page, query.limit);
  }
}
