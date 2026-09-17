import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { DB } from '../db/db.service.js';
import type { Db } from '../db/dialect.js';
import {
  SESSION_COOKIE,
  SessionService,
  type SessionUser,
  type SessionUserSource,
  toSessionUser,
} from './session.service.js';

/** Starts and ends browser sessions: creates the server-side session and sets or clears the cookie. */
@Injectable()
export class LoginService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every way into the portal on one's own credentials comes through here, so
   * this is where the last sign-in is stamped and written to the audit log:
   * accepting an invitation is a first sign-in the same way the login form is.
   * An operator opening a customer's portal does not pass here, and leaves an
   * impersonation entry instead.
   */
  async startSession(user: SessionUserSource, req: Request, res: Response): Promise<SessionUser> {
    const { token, expiresAt } = await this.sessions.create(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    await this.db.updateTable('users').set({ lastLoginAt: new Date() }).where('id', '=', user.id).execute();
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.signed_in',
      targetType: 'user',
      targetId: user.id,
      ip: req.ip,
    });
    return toSessionUser(user);
  }

  async endSession(req: Request, res: Response): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.sessions.revoke(token);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions() {
    return { httpOnly: true, sameSite: 'lax' as const, secure: this.config.cookieSecure, path: '/' };
  }
}
