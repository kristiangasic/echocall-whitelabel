import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
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
  type ForgotDto,
  forgotSchema,
  type LoginDto,
  loginSchema,
  type ResetDto,
  resetSchema,
} from './dto.js';
import { PasswordService } from './password.service.js';
import { LoginService } from './login.service.js';
import { SessionService, type SessionUser } from './session.service.js';
import { TokenService } from './token.service.js';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly logins: LoginService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', body.email)
      .executeTakeFirst();
    const ok = await this.passwords.verify(user?.passwordHash ?? null, body.password);
    if (!user || !ok) throw apiError(401, 'invalid_credentials', 'E-mail or password is incorrect');
    if (user.status !== 'active') throw apiError(403, 'account_disabled', 'This account is disabled');
    return this.logins.startSession(user, req, res);
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

  /** Always answers 204 so the response does not reveal whether an account exists. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('forgot')
  @HttpCode(204)
  async forgot(@Body(new ZodValidationPipe(forgotSchema)) body: ForgotDto): Promise<void> {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'language', 'firstName'])
      .where('email', '=', body.email)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!user) return;
    const token = await this.tokens.issue(user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    const link = `${this.config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.sendPasswordReset(
      { email: user.email, language: user.language, firstName: user.firstName },
      link,
    );
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('reset')
  @HttpCode(204)
  async reset(@Body(new ZodValidationPipe(resetSchema)) body: ResetDto): Promise<void> {
    const userId = await this.tokens.consume(body.token, 'password_reset');
    const user = userId === null ? undefined : await this.findById(userId);
    if (!user || user.status !== 'active')
      throw apiError(400, 'invalid_token', 'This link is invalid or has expired');
    await this.db
      .updateTable('users')
      .set({ passwordHash: await this.passwords.hash(body.password), updatedAt: new Date() })
      .where('id', '=', user.id)
      .execute();
    await this.sessions.revokeAllForUser(user.id);
  }

  @Public()
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
    const changes = {
      passwordHash: await this.passwords.hash(body.password),
      status: 'active' as const,
      updatedAt: new Date(),
      ...(body.firstName === undefined ? {} : { firstName: body.firstName || null }),
      ...(body.lastName === undefined ? {} : { lastName: body.lastName || null }),
    };
    await this.db.updateTable('users').set(changes).where('id', '=', user.id).execute();
    const updated = await this.findById(user.id);
    if (!updated) throw apiError(400, 'invalid_token', 'This link is invalid or has expired');
    return this.logins.startSession(updated, req, res);
  }

  private findById(id: number): Promise<UserRow | undefined> {
    return this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  }
}
