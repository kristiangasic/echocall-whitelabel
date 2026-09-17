import { Module } from '@nestjs/common';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { HubProxyController } from './hub-proxy.controller.js';

@Module({
  imports: [EchoCallModule],
  controllers: [HubProxyController],
})
export class HubProxyModule {}
