import { Router } from 'express';
import { skillService } from '../services/skill.service';
import { asyncHandler } from '../lib/validation';
import { currentInstituteId, requireAuth } from '../middleware/auth';

export const skillRouter = Router();

skillRouter.use(requireAuth);

/**
 * The catalogue visible to a signed-in student. Always their own institute;
 * inactive skills are included so historical profile records still render.
 */
skillRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await skillService.listAll(currentInstituteId(req));
    res.json({ items });
  }),
);
