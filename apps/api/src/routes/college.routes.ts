import { Router } from 'express';
import { collegeService } from '../services/college.service';
import { asyncHandler } from '../lib/validation';

export const collegeRouter = Router();

/**
 * Public: the registration form needs to know which colleges exist.
 * Only active colleges are returned, and only their name and slug — no
 * contact details, counts or internal identifiers beyond the slug.
 */
collegeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await collegeService.listPublic();
    res.json({ items });
  }),
);
