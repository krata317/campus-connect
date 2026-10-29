import { Router } from 'express';
import { notificationPreferenceSchema } from '@campusconnect/shared';
import { accountRepository } from '../repositories/account.repository';
import { asyncHandler, parseBody } from '../lib/validation';
import { currentUser, requireAuth } from '../middleware/auth';
import { notFound } from '../lib/errors';

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
