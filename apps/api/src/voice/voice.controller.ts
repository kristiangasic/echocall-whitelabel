import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import { type TestCall, VoiceService } from './voice.service.js';

/** A sample never changes for one voice in one language, so let it be cached. */
const SAMPLE_CACHE = 'private, max-age=86400';

/**
 * Hearing a voice before choosing it, and calling an agent to hear it answer.
 *
 * Both run through the portal, so the browser never learns where the speech
 * comes from: the sample arrives as audio from this domain, and the call runs
 * over a websocket on this domain.
 */
@Controller('voice')
@Roles('user')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Get('voices/:voiceId/sample')
  async sample(
    @CurrentUser() user: SessionUser,
    @Param('voiceId') voiceId: string,
    @Query('language') language: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const sample = await this.voice.sample(user, voiceId, language || undefined);
    res.setHeader('cache-control', SAMPLE_CACHE);
    res.setHeader('content-language', sample.language);
    res.type(sample.contentType);
    res.send(sample.audio);
  }

  @Post('agents/:agentId/call')
  call(@CurrentUser() user: SessionUser, @Param('agentId') agentId: string): Promise<TestCall> {
    return this.voice.testCall(user, agentId);
  }
}
