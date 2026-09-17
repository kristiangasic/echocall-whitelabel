import { Body, Controller, Delete, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { apiError } from '../common/http-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import type { UserRow } from '../db/database.types.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import { SettingsService } from '../settings/settings.service.js';
import { CurrentUser } from './decorators.js';
import {
  type TwoFactorActivateDto,
  twoFactorActivateSchema,
  type TwoFactorDisableDto,
  twoFactorDisableSchema,
} from './dto.js';
import { PasswordService } from './password.service.js';
import type { SessionUser } from './session.service.js';
import { type Enrolment, TwoFactorService } from './two-factor.service.js';

/** Enrolling, confirming and removing the second factor of one's own login. */
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly twoFactor: TwoFactorService,
    private readonly passwords: PasswordService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Post('setup')
  @HttpCode(200)
  async setup(@CurrentUser() user: SessionUser): Promise<Enrolment> {
    const row = await this.load(user);
    const branding = await this.settings.getBranding();
    return this.twoFactor.startEnrolment(row, branding.productName);
  }

  @Post('activate')
  @HttpCode(200)
  async activate(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(twoFactorActivateSchema)) body: TwoFactorActivateDto,
    @Req() req: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    const row = await this.load(user);
    const recoveryCodes = await this.twoFactor.activate(row, body.code);
    await this.audit.record({
      actorUserId: user.id,
      action: 'account.two_factor_enabled',
      targetType: 'user',
      targetId: user.id,
      ip: req.ip,
    });
    return { recoveryCodes };
  }

  @Delete()
  @HttpCode(204)
  async disable(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(twoFactorDisableSchema)) body: TwoFactorDisableDto,
    @Req() req: Request,
  ): Promise<void> {
    const row = await this.load(user);
    if (!(await this.passwords.verify(row.passwordHash, body.password))) {
      throw apiError(403, 'invalid_password', 'The password is incorrect');
    }
    await this.twoFactor.disable(user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'account.two_factor_disabled',
      targetType: 'user',
      targetId: user.id,
      ip: req.ip,
    });
  }

  /**
   * An operator viewing the portal as a customer must not touch the customer's
   * second factor: enrolling one there would leave the operator holding the
   * customer's key.
   */
  private async load(user: SessionUser): Promise<UserRow> {
    if (user.impersonator) {
      throw apiError(
        403,
        'impersonation_read_only',
        'While viewing the portal as a customer you cannot change this account',
      );
    }
    return this.db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow();
  }
}
