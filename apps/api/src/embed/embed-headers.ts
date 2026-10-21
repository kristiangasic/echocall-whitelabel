import type { NextFunction, Request, Response } from 'express';

/**
 * The embed surface skips the portal baseline because customer sites frame and
 * script it. Two of its headers still hold there: the answer names no server
 * software, and a browser takes every file as the type it is sent with. The
 * widget files arrive with their real types, so nothing they need is refused.
 */
export function embedHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.removeHeader('x-powered-by');
  res.setHeader('x-content-type-options', 'nosniff');
  next();
}
