import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from './request.js';
import type { SessionUser, UserRole } from './session.service.js';

export const IS_PUBLIC = 'ecl:isPublic';
export const ROLES = 'ecl:roles';
export const CROSS_SITE = 'ecl:crossSite';

/** Marks a route as reachable without a session. Mutating routes still need the CSRF header. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Marks a route that a page on someone else's site is meant to call, such as
 * the chat widget's own calls. The header the CSRF guard asks for protects
 * cookie sessions, and such a route carries none: it reads no session and acts
 * for nobody, so demanding the header would only break the widget.
 */
export const CrossSite = (): MethodDecorator & ClassDecorator => SetMetadata(CROSS_SITE, true);

/** Restricts a route to the given roles; combine with the session guard, which runs first. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES, roles);

/** Injects the resolved SessionUser of the current request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
