import { Module } from '@nestjs/common';
import { AdminCustomersModule } from '../admin/customers/admin-customers.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RegistrationController } from './registration.controller.js';

/**
 * Sign-up sits in its own module rather than in the auth module: it needs the
 * customer service, which already depends on auth, and one of the two would
 * otherwise have to reach back into the other.
 */
@Module({
  imports: [AuthModule, AuditModule, AdminCustomersModule],
  controllers: [RegistrationController],
})
export class RegistrationModule {}
