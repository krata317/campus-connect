import { Router } from 'express';
import type { Request } from 'express';
import type { AuthUser } from '@campusconnect/shared';
import { loginSchema, employerRegisterSchema, studentRegisterSchema } from '@campusconnect/shared';
import { authService } from '../services/auth.service';
import { asyncHandler, parseBody } from '../lib/validation';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';

const establishSession = async (req: Request, user: AuthUser): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.userId = user.id;
  req.session.role = user.role;
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
  asyncHandler(async (req, res) => {
    const body = parseBody(studentRegisterSchema, req.body);
    const user = await authService.registerStudent({
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      dateOfBirth: body.dateOfBirth ?? null,
    });
    await establishSession(req, user);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  '/register/employer',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(employerRegisterSchema, req.body);
    const user = await authService.registerEmployer({
      email: body.email,
      password: body.password,
      companyName: body.companyName,
      website: body.website ?? null,
      contactPersonName: body.contactPersonName,
      contactPhone: body.contactPhone,
      companyEmail: body.companyEmail,
      description: body.description ?? null,
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
    const user = await authService.login({ email: body.email, password: body.password, role: body.role });
    await establishSession(req, user);
    res.json({ user });
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
