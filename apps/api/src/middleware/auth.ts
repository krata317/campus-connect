import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@campusconnect/shared';
import { authService } from '../services/auth.service';
import { forbidden, unauthorized } from '../lib/errors';

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const { userId, role } = req.session;

  if (!userId || !role) {
    next(unauthorized());
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

export const requireApprovedEmployer: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.authUser || req.authUser.role !== 'EMPLOYER') {
    next(forbidden('Only recruiter accounts can access this area'));
    return;
  }
  if (req.authUser.employerApprovalStatus !== 'APPROVED') {
    next(
      forbidden(
        'Your recruiter account is waiting for college approval. You can review your company profile, but hiring requests stay locked until an administrator approves the account.',
      ),
    );
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
export const currentCollegeId = (req: Request): string => {
  const user = currentUser(req);
  if (!user.college) {
    throw forbidden('This account is not linked to a college. Ask your placement cell to check the setup.');
  }
  return user.college.id;
};
