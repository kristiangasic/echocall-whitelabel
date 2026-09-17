import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { ImpersonationController } from './impersonation.controller.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ImpersonationController],
})
export class ImpersonationModule {}
