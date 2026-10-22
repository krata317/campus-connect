import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export const CSRF_COOKIE = 'cc.csrf';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const cookieOptions = {
  httpOnly: false,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
  path: '/',
};

export const ensureCsrfToken: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing === 'string' && existing.length >= 32) {
    res.locals.csrfToken = existing;
    next();
    return;
  }
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, { ...cookieOptions, maxAge: env.sessionTtlMs });
  res.locals.csrfToken = token;
  next();
};

export const verifyCsrf: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');

  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string' || cookieToken.length !== headerToken.length) {
    next(new AppError(403, 'FORBIDDEN', 'Your security token is missing or expired. Reload the page and try again.'));
    return;
  }

  const matches = timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  if (!matches) {
    next(new AppError(403, 'FORBIDDEN', 'Your security token is invalid. Reload the page and try again.'));
    return;
  }

  next();
};
