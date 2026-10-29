import { Router } from 'express';
import { z } from 'zod';
import {
  class10Schema,
  class12Schema,
  experienceSchema,
  paginationSchema,
  postgradSchema,
  profileUpdateSchema,
  skillSelectionSchema,
  undergradSchema,
} from '@campusconnect/shared';
import { studentService } from '../services/student.service';
import { asyncHandler, parseBody, parseQuery } from '../lib/validation';
import { currentInstituteId, currentUser, requireAuth, requireRole } from '../middleware/auth';
import { badRequest } from '../lib/errors';

const educationLevelSchema = z.object({
  level: z.enum(['CLASS_10', 'CLASS_12', 'UNDERGRAD', 'POSTGRAD']),
});

const notificationParamsSchema = z.object({ id: z.string().min(1) });

export const studentRouter = Router();

studentRouter.use(requireAuth, requireRole('STUDENT'));

studentRouter.get(
  '/me/profile',
  asyncHandler(async (req, res) => {
    const profile = await studentService.getProfile(currentUser(req).id, currentInstituteId(req));
    res.json({ profile });
  }),
);

studentRouter.put(
  '/me/profile',
  asyncHandler(async (req, res) => {
    const body = parseBody(profileUpdateSchema, req.body);
    const profile = await studentService.updateProfile(currentUser(req).id, currentInstituteId(req), {
      fullName: body.fullName,
      dateOfBirth: body.dateOfBirth ?? null,
      gender: body.gender ?? null,
      phone: body.phone ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      linkedin: body.linkedin ?? null,
      github: body.github ?? null,
      portfolio: body.portfolio ?? null,
      activeBacklogs: body.activeBacklogs,
    });
    res.json({ profile });
  }),
);

studentRouter.put(
  '/me/education/:level',
  asyncHandler(async (req, res) => {
    const { level } = parseBody(educationLevelSchema, req.params);
    const raw = req.body ?? {};

    let profile;
    if (level === 'CLASS_10') {
      profile = await studentService.upsertEducation(currentUser(req).id, currentInstituteId(req), level, parseBody(class10Schema, raw));
    } else if (level === 'CLASS_12') {
      profile = await studentService.upsertEducation(currentUser(req).id, currentInstituteId(req), level, parseBody(class12Schema, raw));
    } else if (level === 'UNDERGRAD') {
      profile = await studentService.upsertEducation(currentUser(req).id, currentInstituteId(req), level, parseBody(undergradSchema, raw));
    } else {
      profile = await studentService.upsertEducation(currentUser(req).id, currentInstituteId(req), level, parseBody(postgradSchema, raw));
    }

    res.json({ profile });
  }),
);

studentRouter.delete(
  '/me/education/:level',
  asyncHandler(async (req, res) => {
    const { level } = parseBody(educationLevelSchema, req.params);
    if (level === 'CLASS_10' || level === 'CLASS_12' || level === 'UNDERGRAD') {
      throw badRequest('Class 10, Class 12 and undergraduate records are required for placement eligibility. Update them instead of deleting.');
    }
    const profile = await studentService.deleteEducation(currentUser(req).id, currentInstituteId(req), level);
    res.json({ profile });
  }),
);

studentRouter.post(
  '/me/experiences',
  asyncHandler(async (req, res) => {
    const body = parseBody(experienceSchema, req.body);
    const profile = await studentService.addExperience(currentUser(req).id, currentInstituteId(req), body);
    res.status(201).json({ profile });
  }),
);

studentRouter.put(
  '/me/experiences/:id',
  asyncHandler(async (req, res) => {
    const body = parseBody(experienceSchema, req.body);
    const profile = await studentService.updateExperience(
      currentUser(req).id,
      currentInstituteId(req),
      req.params.id as string,
      body,
    );
    res.json({ profile });
  }),
);

studentRouter.delete(
  '/me/experiences/:id',
  asyncHandler(async (req, res) => {
    const profile = await studentService.deleteExperience(currentUser(req).id, currentInstituteId(req), req.params.id as string);
    res.json({ profile });
  }),
);

studentRouter.put(
  '/me/skills',
  asyncHandler(async (req, res) => {
    const body = parseBody(skillSelectionSchema, req.body);
    const profile = await studentService.setSkills(currentUser(req).id, currentInstituteId(req), body.skillIds);
    res.json({ profile });
  }),
);

studentRouter.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const dashboard = await studentService.dashboard(currentUser(req).id, currentInstituteId(req));
    res.json(dashboard);
  }),
);

studentRouter.get(
  '/me/notifications',
  asyncHandler(async (req, res) => {
    const query = parseQuery(paginationSchema, req.query);
    const result = await studentService.listNotifications(currentUser(req).id, currentInstituteId(req), query.page, query.pageSize);
    res.json(result);
  }),
);

studentRouter.post(
  '/me/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(notificationParamsSchema, req.params);
    await studentService.markNotificationRead(currentUser(req).id, currentInstituteId(req), id);
    res.json({ ok: true });
  }),
);

studentRouter.get(
  '/me/shortlists',
  asyncHandler(async (req, res) => {
    const items = await studentService.shortlistHistory(currentUser(req).id, currentInstituteId(req));
    res.json({ items });
  }),
);
