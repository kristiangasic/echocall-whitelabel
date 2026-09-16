import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { EchoCallModule } from '../../echocall/echocall.module.js';
import { AdminOverviewController } from './admin-overview.controller.js';

@Module({
  imports: [AuthModule, EchoCallModule],
  controllers: [AdminOverviewController],
})
export class AdminOverviewModule {}
