import { Module } from '@nestjs/common';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { EmbedApiController } from './embed-api.controller.js';
import { EmbedController } from './embed.controller.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WidgetCacheService } from './widget-cache.service.js';

@Module({
  imports: [EchoCallModule, SettingsModule],
  controllers: [EmbedController, EmbedApiController],
  providers: [WidgetCacheService],
})
export class EmbedModule {}
