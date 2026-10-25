import { Router } from 'express';
import { skillService } from '../services/skill.service';
import { asyncHandler } from '../lib/validation';
import { currentCollegeId, requireAuth } from '../middleware/auth';

export const skillRouter = Router();

skillRouter.use(requireAuth);

/**
 * The catalogue visible to a signed-in user. Always the user's own college:
 * inactive skills are included so historical profile records still render.
 */
skillRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await skillService.listAll(currentCollegeId(req));
    res.json({ items });
  }),
);
