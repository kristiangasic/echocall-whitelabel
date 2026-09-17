import { Module } from '@nestjs/common';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { EmbedController } from './embed.controller.js';
import { WidgetCacheService } from './widget-cache.service.js';

@Module({
  imports: [EchoCallModule],
  controllers: [EmbedController],
  providers: [WidgetCacheService],
})
export class EmbedModule {}
