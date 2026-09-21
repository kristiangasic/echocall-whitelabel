import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { apiError } from '../common/http-error.js';
import { CROSS_SITE } from './decorators.js';

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cookie sessions are protected by requiring a custom header on every mutating request.
 * Browsers only add it from same-origin script, so a cross-site form post cannot pass.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return true;
    // A route meant for someone else's page carries no session to protect.
    if (this.reflector.getAllAndOverride<boolean>(CROSS_SITE, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const value = req.headers[CSRF_HEADER];
    if (typeof value === 'string' && value.toLowerCase() === CSRF_HEADER_VALUE.toLowerCase()) return true;
    throw apiError(403, 'csrf_header_missing', `Mutating requests must send the ${CSRF_HEADER_VALUE} header`);
  }
}
