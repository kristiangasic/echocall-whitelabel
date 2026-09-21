import { Module } from '@nestjs/common';
import { EchoCallModule } from '../echocall/echocall.module.js';
import { VoiceController } from './voice.controller.js';
import { VoiceService } from './voice.service.js';

@Module({
  imports: [EchoCallModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
