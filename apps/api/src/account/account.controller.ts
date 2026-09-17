import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators.js';
import { SESSION_COOKIE, type SessionUser } from '../auth/session.service.js';
import { apiError } from '../common/http-error.js';
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

  /** Streams one invoice; the hub link behind it is never handed to the browser. */
  @Get('invoices/:id/pdf')
  async invoicePdf(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!/^[0-9]+$/.test(id)) throw apiError(400, 'invalid_id', 'The invoice id must be a number');
    const invoice = await this.account.invoicePdf(user, Number(id));
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${invoice.filename}"`);
    res.setHeader('cache-control', 'private, no-store');
    res.send(invoice.content);
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
