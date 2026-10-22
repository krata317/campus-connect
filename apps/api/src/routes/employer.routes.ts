import { Router } from 'express';
import { z } from 'zod';
import { companyUpdateSchema, hiringRequestSubmitSchema } from '@campusconnect/shared';
import { employerService } from '../services/employer.service';
import { requestService } from '../services/request.service';
import { asyncHandler, parseBody } from '../lib/validation';
import { currentUser, requireApprovedEmployer, requireAuth, requireRole } from '../middleware/auth';
import { requestRepository } from '../repositories/request.repository';
import { notFound } from '../lib/errors';

const idParams = z.object({ id: z.string().min(1) });

type RequestBody = z.infer<typeof hiringRequestSubmitSchema>;

const toRequestInput = (body: RequestBody) => ({
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

export const employerRouter = Router();

employerRouter.use(requireAuth, requireRole('EMPLOYER'));

employerRouter.get(
  '/me/company',
  asyncHandler(async (req, res) => {
    const detail = await employerService.getMyCompany(currentUser(req).id);
    res.json(detail);
  }),
);

employerRouter.put(
  '/me/company',
  asyncHandler(async (req, res) => {
    const body = parseBody(companyUpdateSchema, req.body);
    const detail = await employerService.updateCompany(currentUser(req).id, {
      name: body.name,
      website: body.website ?? null,
      contactPersonName: body.contactPersonName,
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail,
      description: body.description ?? null,
    });
    res.json(detail);
  }),
);

employerRouter.get(
  '/me/requests',
  asyncHandler(async (req, res) => {
    const items = await requestService.list({ employerId: currentUser(req).id, status: null, q: '' });
    res.json({ items });
  }),
);

employerRouter.post(
  '/me/requests',
  requireApprovedEmployer,
  asyncHandler(async (req, res) => {
    const body = parseBody(hiringRequestSubmitSchema, req.body);
    const request = await requestService.create(currentUser(req).id, toRequestInput(body), body.submit);
    res.status(201).json({ request });
  }),
);

employerRouter.get(
  '/me/requests/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const employerId = currentUser(req).id;
    const owns = await requestRepository.belongsToEmployer(id, employerId);
    if (!owns) throw notFound('Hiring request not found');
    const request = await requestService.getById(id);
    res.json({ request });
  }),
);

employerRouter.put(
  '/me/requests/:id',
  requireApprovedEmployer,
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(hiringRequestSubmitSchema, req.body);
    const request = await requestService.update(currentUser(req).id, id, toRequestInput(body));
    res.json({ request });
  }),
);

employerRouter.post(
  '/me/requests/:id/submit',
  requireApprovedEmployer,
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const request = await requestService.submit(currentUser(req).id, id);
    res.json({ request });
  }),
);

employerRouter.delete(
  '/me/requests/:id',
  requireApprovedEmployer,
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    await requestService.remove(currentUser(req).id, id);
    res.status(204).end();
  }),
);
