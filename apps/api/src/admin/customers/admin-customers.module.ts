import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { EchoCallModule } from '../../echocall/echocall.module.js';
import { AdminUsersModule } from '../users/admin-users.module.js';
import { AdminCustomersController } from './admin-customers.controller.js';
import { AdminCustomersService } from './admin-customers.service.js';

@Module({
  imports: [AuthModule, AuditModule, EchoCallModule, AdminUsersModule],
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
  exports: [AdminCustomersService],
})
export class AdminCustomersModule {}
