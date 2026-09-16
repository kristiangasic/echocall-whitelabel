import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
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
    private readonly sessions: SessionService,
  ) {}

  async startSession(user: SessionUserSource, req: Request, res: Response): Promise<SessionUser> {
    const { token, expiresAt } = await this.sessions.create(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
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
