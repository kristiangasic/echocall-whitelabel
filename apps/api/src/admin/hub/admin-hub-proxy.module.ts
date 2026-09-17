import { Module } from '@nestjs/common';
import { EchoCallModule } from '../../echocall/echocall.module.js';
import { AdminHubProxyController } from './admin-hub-proxy.controller.js';

@Module({
  imports: [EchoCallModule],
  controllers: [AdminHubProxyController],
})
export class AdminHubProxyModule {}
