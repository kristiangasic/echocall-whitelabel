import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiError } from '../common/http-error.js';
import { ROLES } from './decorators.js';
import type { AuthenticatedRequest } from './request.js';
import type { UserRole } from './session.service.js';

/** Enforces @Roles(); runs after SessionGuard so req.user is already resolved. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user && roles.includes(user.role)) return true;
    throw apiError(403, 'forbidden', 'You do not have access to this resource');
  }
}
