import { Controller, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../../audit/audit.service.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import { LoginService } from '../../auth/login.service.js';
import {
  SESSION_COOKIE,
  SessionService,
  type SessionUser,
  toSessionUser,
} from '../../auth/session.service.js';
import { apiError } from '../../common/http-error.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { DB } from '../../db/db.service.js';
import type { Db } from '../../db/dialect.js';
import { customerIdSchema } from '../customers/dto.js';

/**
 * Lets an operator look at the portal through the eyes of one customer.
 *
 * The session cookie the browser already holds is handed over to the customer
 * and remembers who opened it, so nothing in the portal has to know about a
 * second identity: every guard, every proxy call and the whole workspace run in
 * the customer's context, and only the way back reads the remembered id. The
 * session role is the customer's, which is what keeps the administration out of
 * reach while it lasts.
 */
@Controller()
export class ImpersonationController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly logins: LoginService,
    private readonly audit: AuditService,
  ) {}

  @Post('admin/customers/:id/impersonate')
  @Roles('admin')
  @HttpCode(200)
  async start(
    @Param('id', new ZodValidationPipe(customerIdSchema)) customerId: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<SessionUser> {
    // No check for a session that is already open as a customer: such a session
    // carries the customer's role, so the role guard has answered long before.
    const token = readToken(req);
    const target = await this.db
      .selectFrom('users')
      .selectAll()
      .where('echocallCustomerId', '=', customerId)
      .executeTakeFirst();
    if (!target) throw apiError(400, 'no_portal_login', 'This customer has no portal login to open');
    if (target.role !== 'user')
      throw apiError(400, 'cannot_impersonate_admin', 'Only customer logins can be opened this way');
    if (target.status !== 'active')
      throw apiError(400, 'login_not_active', 'This login cannot be opened until the customer has used it');
    await this.sessions.switchTo(token, target.id, actor.id);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'impersonation.start',
      targetType: 'customer',
      targetId: customerId,
      details: { userId: target.id, email: target.email },
      ip: req.ip,
    });
    return toSessionUser(target, { id: actor.id, email: actor.email });
  }

  /**
   * Hands the session back to the administrator who opened it. When that
   * account is gone the session cannot be handed to anyone, so it is ended.
   */
  @Post('auth/impersonation/stop')
  @HttpCode(200)
  async stop(
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const token = readToken(req);
    const operator = actor.impersonator;
    if (!operator) throw apiError(400, 'not_impersonating', 'This session was not opened by an operator');
    const admin = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', operator.id)
      .executeTakeFirst();
    if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
      await this.logins.endSession(req, res);
      throw apiError(401, 'session_ended', 'The operator account behind this session is gone; sign in again');
    }
    await this.sessions.switchTo(token, admin.id, null);
    await this.audit.record({
      actorUserId: admin.id,
      action: 'impersonation.stop',
      targetType: 'customer',
      targetId: actor.echocallCustomerId ?? actor.id,
      details: { userId: actor.id, email: actor.email },
      ip: req.ip,
    });
    return toSessionUser(admin);
  }
}

/** The cookie the session guard has already resolved; only a switch needs the raw value. */
function readToken(req: Request): string {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') throw apiError(401, 'unauthenticated', 'Sign in to continue');
  return token;
}
