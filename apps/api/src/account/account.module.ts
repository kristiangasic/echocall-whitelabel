import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [AuthModule, AuditModule, EchoCallModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
