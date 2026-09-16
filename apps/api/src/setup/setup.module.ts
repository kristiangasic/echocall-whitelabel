import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';

@Module({
  imports: [AuthModule, AuditModule, EchoCallModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
