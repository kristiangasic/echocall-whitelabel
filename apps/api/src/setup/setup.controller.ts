import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { Public } from '../auth/decorators.js';
import { apiError } from '../common/http-error.js';
import { LoginService } from '../auth/login.service.js';
import type { SessionUser } from '../auth/session.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type HubStatus, HubStatusService } from '../echocall/hub-status.service.js';
import type { PublicBranding } from '../settings/branding.js';
import { SettingsService } from '../settings/settings.service.js';
import { type SetupAdminDto, setupAdminSchema } from './dto.js';
import { SetupService } from './setup.service.js';

export interface SetupStatus {
  needsAdmin: boolean;
  hub: HubStatus;
  branding: PublicBranding;
}

@Controller('setup')
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly hubStatus: HubStatusService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly login: LoginService,
  ) {}

  @Public()
  @Get('status')
  async status(): Promise<SetupStatus> {
    return {
      needsAdmin: await this.setup.needsAdmin(),
      hub: this.hubStatus.current(),
      branding: await this.settings.getBranding(),
    };
  }

  /** First-run only: re-checks the API key so the setup page can show the outcome without waiting. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('hub-check')
  @HttpCode(200)
  async hubCheck(): Promise<HubStatus> {
    if (!(await this.setup.needsAdmin())) {
      throw apiError(409, 'setup_completed', 'The administrator account already exists');
    }
    return this.hubStatus.refresh();
  }

  /** First-run only: creates the administrator and signs them in. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('admin')
  @HttpCode(201)
  async createAdmin(
    @Body(new ZodValidationPipe(setupAdminSchema)) body: SetupAdminDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const user = await this.setup.createFirstAdmin(body);
    await this.audit.record({
      actorUserId: user.id,
      action: 'setup.admin_created',
      targetType: 'user',
      targetId: user.id,
      details: { email: user.email },
      ip: req.ip,
    });
    return this.login.startSession(user, req, res);
  }
}
