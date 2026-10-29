import { Router } from 'express';
import { z } from 'zod';
import { hiringRequestCreateSchema, hiringRequestUpdateSchema, recruiterProfileSchema } from '@campusconnect/shared';
import { recruiterService } from '../services/recruiter.service';
import { requestService } from '../services/request.service';
import { asyncHandler, parseBody } from '../lib/validation';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';

const idParams = z.object({ id: z.string().min(1) });

type CreateBody = z.infer<typeof hiringRequestCreateSchema>;
type UpdateBody = z.infer<typeof hiringRequestUpdateSchema>;

const toRequestInput = (body: CreateBody | UpdateBody) => ({
  title: body.title,
  assessmentInstructions: body.assessmentInstructions ?? null,
  roles: body.roles.map((role) => ({
    title: role.title,
    description: role.description,
    location: role.location ?? null,
    employmentType: role.employmentType ?? null,
    registrationUrl: role.registrationUrl,
    criteria: role.criteria,
  })),
});

export const recruiterRouter = Router();

recruiterRouter.use(requireAuth, requireRole('RECRUITER'));

recruiterRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json(await recruiterService.getProfile(currentUser(req).id));
  }),
);

recruiterRouter.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const body = parseBody(recruiterProfileSchema, req.body);
    const profile = await recruiterService.updateProfile(currentUser(req).id, {
      companyName: body.companyName,
      website: body.website ?? null,
      contactPersonName: body.contactPersonName,
      contactPhone: body.contactPhone,
      description: body.description ?? null,
    });
    res.json(profile);
  }),
);

recruiterRouter.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const items = await requestService.listForRecruiter(currentUser(req).id, null);
    res.json({ items });
  }),
);

recruiterRouter.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const body = parseBody(hiringRequestCreateSchema, req.body);
    const request = await requestService.create(
      currentUser(req).id,
      { ...toRequestInput(body), instituteId: body.instituteId },
      body.submit,
    );
    res.status(201).json({ request });
  }),
);

recruiterRouter.get(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const request = await requestService.getForRecruiter(id, currentUser(req).id);
    res.json({ request });
  }),
);

recruiterRouter.put(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(hiringRequestUpdateSchema, req.body);
    const request = await requestService.update(currentUser(req).id, id, toRequestInput(body));
    res.json({ request });
  }),
);

recruiterRouter.post(
  '/requests/:id/submit',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const request = await requestService.submit(currentUser(req).id, id);
    res.json({ request });
  }),
);

recruiterRouter.delete(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    await requestService.remove(currentUser(req).id, id);
    res.status(204).end();
  }),
);
