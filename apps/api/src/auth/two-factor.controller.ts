import { Body, Controller, Delete, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { apiError } from '../common/http-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import type { UserRow } from '../db/database.types.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import { SettingsService } from '../settings/settings.service.js';
import { CurrentUser, Public } from './decorators.js';
import { LoginService } from './login.service.js';
import { TokenService } from './token.service.js';
import {
  type TwoFactorActivateDto,
  twoFactorActivateSchema,
  type TwoFactorDisableDto,
  twoFactorDisableSchema,
  type TwoFactorVerifyDto,
  twoFactorVerifySchema,
} from './dto.js';
import type { SessionUser } from './session.service.js';
import { type Enrolment, TwoFactorService } from './two-factor.service.js';

/** Enrolling, confirming and removing the second factor of one's own login. */
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly twoFactor: TwoFactorService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    private readonly logins: LoginService,
  ) {}

  /**
   * The second step of a sign-in. The challenge stands in for the link that
   * was already spent, so this route is public; what guards it is the
   * challenge itself, which expires, burns after a few wrong guesses, and is
   * spent the moment it works.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodValidationPipe(twoFactorVerifySchema)) body: TwoFactorVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const open = await this.tokens.open(body.challenge, 'two_factor_challenge');
    if (!open) throw apiError(401, 'invalid_challenge', 'Sign in again to get a new code prompt');
    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', open.userId)
      .executeTakeFirst();
    if (!user || user.status !== 'active') {
      await this.tokens.spend(open.id);
      throw apiError(403, 'account_disabled', 'This account is disabled');
    }
    if (!(await this.twoFactor.check(user, body.code))) {
      await this.tokens.countFailure(open.id);
      throw apiError(401, 'invalid_code', 'That code does not match');
    }
    if (!(await this.tokens.spend(open.id))) {
      throw apiError(401, 'invalid_challenge', 'Sign in again to get a new code prompt');
    }
    return this.logins.startSession(user, req, res);
  }

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
    // The portal has no password to ask for here, so the factor itself is the
    // proof: whoever turns it off can still produce a code or a recovery code.
    if (!(await this.twoFactor.check(row, body.code))) {
      throw apiError(403, 'invalid_code', 'That code does not match');
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
