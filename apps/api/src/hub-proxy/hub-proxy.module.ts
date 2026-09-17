import { Module } from '@nestjs/common';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { HubProxyController } from './hub-proxy.controller.js';

@Module({
  imports: [EchoCallModule, SettingsModule],
  controllers: [HubProxyController],
})
export class HubProxyModule {}
