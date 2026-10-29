import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@campusconnect/shared';
import { authService } from '../services/auth.service';
import { forbidden, unauthorized } from '../lib/errors';

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const { userId, role, expiresAt } = req.session;

  if (!userId || !role) {
    next(unauthorized());
    return;
  }

  // The session store already refuses to load an expired session, but the
  // expiry is checked again here so a protected endpoint can never be reached
  // with a stale cookie even if the store behaviour changes.
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    req.session.destroy(() => undefined);
    next(unauthorized('Your session has expired. Please sign in again.'));
    return;
  }

  authService
    .loadUser(role, userId)
    .then((user) => {
      if (!user) {
        req.session.destroy(() => undefined);
        next(unauthorized('Your session is no longer valid. Please sign in again.'));
        return;
      }
      req.authUser = user;
      next();
    })
    .catch(next);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      next(forbidden('Your account type cannot access this area'));
      return;
    }
    next();
  };

export const currentUser = (req: Request) => {
  if (!req.authUser) throw unauthorized();
  return req.authUser;
};

/**
 * The tenant id used by every repository call. It comes from the session user
 * (reloaded from the graph on each request), never from a header, query
 * parameter or request body.
 */
export const currentInstituteId = (req: Request): string => {
  const user = currentUser(req);
  if (!user.institute) {
    throw forbidden('This account is not linked to an institute.');
  }
  return user.institute.id;
};
