import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { EchoCallModule } from '../../echocall/echocall.module.js';
import { AdminInvoicesController } from './admin-invoices.controller.js';

@Module({
  imports: [AuthModule, EchoCallModule],
  controllers: [AdminInvoicesController],
})
export class AdminInvoicesModule {}
