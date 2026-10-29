import { Router } from 'express';
import type { Request } from 'express';
import type { AuthUser } from '@campusconnect/shared';
import { loginSchema, passwordResetCompleteSchema, passwordResetRequestSchema, studentRegisterSchema } from '@campusconnect/shared';
import { authService } from '../services/auth.service';
import { asyncHandler, parseBody } from '../lib/validation';
import { loginLimiter, registerLimiter, verificationLimiter } from '../middleware/rateLimit';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';

const establishSession = async (req: Request, user: AuthUser, rememberMe = false): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  // Only the identity and role are stored. The institute is re-resolved from the
  // database on every request by requireAuth, so a stale or tampered session
  // cannot point at another tenant.
  const ttlMs = rememberMe ? env.sessionRememberTtlMs : env.sessionTtlMs;
  req.session.userId = user.id;
  req.session.role = user.role;
  // Fixed at sign-in and never extended, so the choice made on the login form
  // is the lifetime the user actually gets.
  req.session.expiresAt = new Date(Date.now() + ttlMs).toISOString();
  req.session.cookie.maxAge = ttlMs;
  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
};

export const authRouter = Router();

authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: res.locals.csrfToken as string });
});

authRouter.post(
  '/register/student',
  registerLimiter,
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(studentRegisterSchema, req.body);
    const user = await authService.registerStudent({
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      dateOfBirth: body.dateOfBirth ?? null,
      instituteId: body.instituteId,
      studentCode: body.studentCode,
    });
    await establishSession(req, user);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const user = await authService.login({ identifier: body.identifier, password: body.password, role: body.role });
    await establishSession(req, user, body.rememberMe ?? false);
    res.json({ user, session: { expiresAt: req.session.expiresAt, rememberMe: body.rememberMe ?? false } });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.authUser });
  }),
);

/**
 * Always answers with the same message so the endpoint cannot be used to
 * discover which addresses have accounts.
 */
authRouter.post(
  '/password-reset/request',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(passwordResetRequestSchema, req.body);
    await authService.requestPasswordReset(body.email, body.role);
    res.json({
      ok: true,
      message: 'If that email belongs to an account, a password reset link is on its way.',
    });
  }),
);

authRouter.post(
  '/password-reset/complete',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(passwordResetCompleteSchema, req.body);
    await authService.completePasswordReset(body.token, body.password);
    res.json({ ok: true });
  }),
);
