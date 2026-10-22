import { Router } from 'express';
import { skillService } from '../services/skill.service';
import { asyncHandler } from '../lib/validation';
import { requireAuth } from '../middleware/auth';

export const skillRouter = Router();

skillRouter.use(requireAuth);

skillRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await skillService.listAll();
    res.json({ items });
  }),
);
