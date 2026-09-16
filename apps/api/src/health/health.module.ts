import { Module } from '@nestjs/common';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [EchoCallModule],
  controllers: [HealthController],
})
export class HealthModule {}
