import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators.js';
import { SESSION_COOKIE, type SessionUser } from '../auth/session.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type AccountOverview, AccountService } from './account.service.js';
import {
  type PasswordChangeDto,
  passwordChangeSchema,
  type ProfileUpdateDto,
  profileUpdateSchema,
} from './dto.js';

/** The signed-in user's own account; open to every role. */
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('overview')
  overview(@CurrentUser() user: SessionUser): Promise<AccountOverview> {
    return this.account.overview(user);
  }

  @Patch('profile')
  profile(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(profileUpdateSchema)) body: ProfileUpdateDto,
  ): Promise<SessionUser> {
    return this.account.updateProfile(user, body);
  }

  @Post('password')
  @HttpCode(204)
  password(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: PasswordChangeDto,
    @Req() req: Request,
  ): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    return this.account.changePassword(user, body, typeof token === 'string' ? token : undefined, req.ip);
  }
}
