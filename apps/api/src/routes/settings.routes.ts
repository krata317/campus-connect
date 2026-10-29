import { Router } from 'express';
import { deleteAccountSchema, notificationPreferenceSchema } from '@campusconnect/shared';
import { accountRepository } from '../repositories/account.repository';
import { accountDeletionService } from '../services/accountDeletion.service';
import { asyncHandler, parseBody } from '../lib/validation';
import { currentUser, requireAuth } from '../middleware/auth';
import { verificationLimiter } from '../middleware/rateLimit';
import { notFound } from '../lib/errors';
import { env } from '../config/env';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

/** Notification preference for the signed-in account (all three roles). */
settingsRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const account = await accountRepository.findById(user.role, user.id);
    if (!account) throw notFound('Account not found');
    res.json({ emailNotifications: account.emailNotifications });
  }),
);

settingsRouter.patch(
  '/notifications',
  asyncHandler(async (req, res) => {
    const body = parseBody(notificationPreferenceSchema, req.body);
    const user = currentUser(req);
    const updated = await accountRepository.setEmailNotifications(user.role, user.id, body.emailNotifications);
    if (!updated) throw notFound('Account not found');
    res.json({ emailNotifications: body.emailNotifications });
  }),
);

/**
 * Deletes the signed-in account.
 *
 * The account comes from the session — the body carries only the password and
 * the typed confirmation — so there is no id here that a caller could swap for
 * somebody else's. Rate limited because it verifies a password.
 */
settingsRouter.post(
  '/delete-account',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(deleteAccountSchema, req.body);
    const user = currentUser(req);

    await accountDeletionService.deleteOwnAccount(user, body.password);

    // The service already removed every stored session for the account; this
    // clears the cookie in the caller's browser so nothing stale is left behind.
    await new Promise<void>((resolve) => {
      req.session.destroy(() => resolve());
    });
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
    res.status(204).end();
  }),
);
