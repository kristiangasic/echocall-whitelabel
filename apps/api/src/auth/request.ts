import type { Request } from 'express';
import type { SessionUser } from './session.service.js';

export interface AuthenticatedRequest extends Request {
  /** Set by SessionGuard when the session cookie resolves to an active user. */
  user?: SessionUser;
}
