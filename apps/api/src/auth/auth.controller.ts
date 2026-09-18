import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { apiError } from '../common/http-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import type { UserRow } from '../db/database.types.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import { MAIL_SENDER, type MailSender } from '../mail/mail-sender.js';
import { CurrentUser, Public } from './decorators.js';
import {
  type AcceptInviteDto,
  acceptInviteSchema,
  type SignInLinkConsumeDto,
  signInLinkConsumeSchema,
  type SignInLinkDto,
  signInLinkSchema,
} from './dto.js';
import { signInLink } from './links.js';
import { LoginService } from './login.service.js';
import { type SessionUser } from './session.service.js';
import { SIGN_IN_LINK_TTL_MS, TokenService } from './token.service.js';
import { TwoFactorService } from './two-factor.service.js';

/** Long enough to reach for a phone, short enough that an unattended browser does not stay one step from a session. */
const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** What a link answers with when the account has a second factor. */
export interface TwoFactorChallenge {
  challenge: string;
  expiresAt: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly tokens: TokenService,
    private readonly logins: LoginService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Asks for a link by mail. The answer is 204 whatever happened, so it never
   * says which addresses have an account here.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('sign-in-link')
  @HttpCode(204)
  async requestSignInLink(@Body(new ZodValidationPipe(signInLinkSchema)) body: SignInLinkDto): Promise<void> {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'language', 'firstName'])
      .where('email', '=', body.email)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!user) return;
    const token = await this.tokens.issue(user.id, 'sign_in', SIGN_IN_LINK_TTL_MS);
    await this.mail.sendSignInLink(
      { email: user.email, language: user.language, firstName: user.firstName },
      signInLink(this.config.appUrl, token),
    );
  }

  /** Spends a link from the mail. A second factor is still asked for. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('sign-in-link/consume')
  @HttpCode(200)
  async consumeSignInLink(
    @Body(new ZodValidationPipe(signInLinkConsumeSchema)) body: SignInLinkConsumeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser | TwoFactorChallenge> {
    const userId = await this.tokens.consume(body.token, 'sign_in');
    const user = userId === null ? undefined : await this.findById(userId);
    if (!user) throw apiError(400, 'invalid_token', 'This link is invalid or has expired');
    if (user.status !== 'active') {
      await this.recordRefusal(user.email, user.id, `account_${user.status}`, req);
      throw apiError(403, 'account_disabled', 'This account is disabled');
    }
    return this.admit(user, req, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logins.endSession(req, res);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const userId = await this.tokens.consume(body.token, 'invite');
    const user = userId === null ? undefined : await this.findById(userId);
    if (!user || user.status !== 'invited')
      throw apiError(400, 'invalid_token', 'This link is invalid or has expired');
    await this.db
      .updateTable('users')
      .set({
        status: 'active' as const,
        acceptedAt: new Date(),
        updatedAt: new Date(),
        ...(body.firstName === undefined ? {} : { firstName: body.firstName || null }),
        ...(body.lastName === undefined ? {} : { lastName: body.lastName || null }),
      })
      .where('id', '=', user.id)
      .execute();
    const updated = await this.findById(user.id);
    if (!updated) throw apiError(400, 'invalid_token', 'This link is invalid or has expired');
    return this.logins.startSession(updated, req, res);
  }

  /**
   * The last step of the way in: an account with a second factor gets a short
   * lived challenge instead of a session.
   */
  private async admit(user: UserRow, req: Request, res: Response): Promise<SessionUser | TwoFactorChallenge> {
    if (this.twoFactor.isEnabled(user)) {
      const challenge = await this.tokens.issue(user.id, 'two_factor_challenge', TWO_FACTOR_CHALLENGE_TTL_MS);
      res.status(202);
      return { challenge, expiresAt: new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS).toISOString() };
    }
    return this.logins.startSession(user, req, res);
  }

  /** One refused sign-in, for an operator watching a series of them. */
  private recordRefusal(email: string, userId: number | null, reason: string, req: Request): Promise<void> {
    return this.audit.record({
      actorUserId: userId,
      action: 'auth.sign_in_failed',
      targetType: 'user',
      targetId: userId ?? undefined,
      details: { email, reason },
      ip: req.ip,
    });
  }

  private findById(id: number): Promise<UserRow | undefined> {
    return this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  }
}
