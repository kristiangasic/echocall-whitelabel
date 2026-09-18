import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import type { SessionUser } from '../../auth/session.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  type AdminUserRow,
  AdminUsersService,
  type InviteResult,
  type SignInLinkResult,
} from './admin-users.service.js';
import {
  type InviteUserDto,
  inviteUserSchema,
  type UpdateUserDto,
  updateUserSchema,
  userIdSchema,
} from './dto.js';

const idPipe = () => new ZodValidationPipe(userIdSchema);

@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  async list(): Promise<{ data: AdminUserRow[] }> {
    return { data: await this.users.list() };
  }

  @Post('invite')
  @HttpCode(201)
  invite(
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserDto,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<InviteResult> {
    return this.users.invite(body, { actor, ip: req.ip });
  }

  @Post(':id/resend-invite')
  @HttpCode(200)
  resendInvite(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<InviteResult> {
    return this.users.resendInvite(id, { actor, ip: req.ip });
  }

  @Patch(':id')
  update(
    @Param('id', idPipe()) id: number,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<AdminUserRow> {
    return this.users.update(id, body, { actor, ip: req.ip });
  }

  @Post(':id/sign-in-link')
  @HttpCode(200)
  sendSignInLink(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<SignInLinkResult> {
    return this.users.sendSignInLink(id, { actor, ip: req.ip });
  }

  @Delete(':id/two-factor')
  @HttpCode(204)
  clearTwoFactor(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.users.clearTwoFactor(id, { actor, ip: req.ip });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.users.remove(id, { actor, ip: req.ip });
  }
}
