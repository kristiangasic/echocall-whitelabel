import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError } from '../common/http-error.js';
import { IS_PUBLIC } from './decorators.js';
import type { AuthenticatedRequest } from './request.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/** Resolves the session cookie into req.user; answers 401 unless the route is @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]) === true;
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const user = typeof token === 'string' ? await this.sessions.resolve(token) : null;
    if (user) req.user = user;
    if (isPublic || user) return true;
    throw apiError(401, 'unauthenticated', 'Sign in to continue');
  }
}
