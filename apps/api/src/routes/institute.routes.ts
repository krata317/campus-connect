import { Router } from 'express';
import { z } from 'zod';
import {
  dispatchSchema,
  instituteProfileSchema,
  paginationSchema,
  reviewDecisionSchema,
  shortlistSchema,
  skillCreateSchema,
  skillUpdateSchema,
} from '@campusconnect/shared';
import { instituteService } from '../services/institute.service';
import { instituteAdminService } from '../services/instituteAdmin.service';
import { requestService } from '../services/request.service';
import { shortlistService } from '../services/shortlist.service';
import { skillService } from '../services/skill.service';
import { asyncHandler, parseBody, parseQuery } from '../lib/validation';
import { currentInstituteId, currentUser, requireAuth, requireRole } from '../middleware/auth';

const idParams = z.object({ id: z.string().min(1) });
const roleParams = z.object({ roleId: z.string().min(1) });

const requestQuery = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED']).optional(),
  q: z.string().trim().max(120).default(''),
});

const candidateQuery = z.object({
  eligibleOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value !== 'false'),
});

/** Public: the student registration form needs the list of registered institutes. */
export const institutePublicRouter = Router();

institutePublicRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await instituteService.listPublic();
    res.json({ items });
  }),
);

/**
 * Active skills of one institute. A recruiter needs this to build the criteria
 * for a request addressed to that institute; it exposes no private data.
 */
institutePublicRouter.get(
  '/:id/skills',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const items = await skillService.listActive(id);
    res.json({ items: items.map((skill) => ({ id: skill.id, name: skill.name })) });
  }),
);

/** Everything below requires a signed-in institute administrator. */
export const instituteRouter = Router();

instituteRouter.use(requireAuth, requireRole('INSTITUTE_ADMIN'));

instituteRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await instituteAdminService.stats(currentInstituteId(req)));
  }),
);

instituteRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json(await instituteService.getSettings(currentInstituteId(req)));
  }),
);

instituteRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = parseBody(instituteProfileSchema, req.body);
    const settings = await instituteService.updateProfile(currentInstituteId(req), {
      website: body.website ?? null,
      contactEmail: body.contactEmail ?? null,
      contactPhone: body.contactPhone ?? null,
    });
    res.json(settings);
  }),
);

/** Returns the new code once; only its hash is stored. */
instituteRouter.post(
  '/settings/student-code',
  asyncHandler(async (req, res) => {
    const result = await instituteService.rotateStudentCode(currentInstituteId(req));
    res.json(result);
  }),
);

instituteRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    const query = parseQuery(paginationSchema.extend({ q: z.string().trim().max(120).default('') }), req.query);
    res.json(await instituteAdminService.listStudents(currentInstituteId(req), query));
  }),
);

instituteRouter.get(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    res.json(await instituteAdminService.getStudentDetail(currentInstituteId(req), id));
  }),
);

instituteRouter.get(
  '/students/:id/notifications',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    res.json(await instituteAdminService.studentNotifications(currentInstituteId(req), id));
  }),
);

instituteRouter.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const query = parseQuery(requestQuery, req.query);
    const items = await instituteAdminService.listRequests(currentInstituteId(req), {
      status: query.status ?? null,
      q: query.q,
    });
    res.json({ items });
  }),
);

instituteRouter.get(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const request = await requestService.getForInstitute(id, currentInstituteId(req));
    res.json({ request });
  }),
);

instituteRouter.post(
  '/requests/:id/review',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(reviewDecisionSchema, req.body);
    const request = await requestService.review(currentUser(req).id, currentInstituteId(req), id, body.action, body.note ?? null);
    res.json({ request });
  }),
);

instituteRouter.get(
  '/roles/:roleId/candidates',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const query = parseQuery(candidateQuery, req.query);
    res.json(await shortlistService.getCandidates(roleId, currentInstituteId(req), query.eligibleOnly));
  }),
);

instituteRouter.get(
  '/roles/:roleId/shortlist',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const items = await shortlistService.getShortlist(roleId, currentInstituteId(req));
    res.json({ items });
  }),
);

instituteRouter.put(
  '/roles/:roleId/shortlist',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const body = parseBody(shortlistSchema, req.body);
    res.json(await shortlistService.saveShortlist(roleId, currentInstituteId(req), body.studentIds, currentUser(req).id));
  }),
);

instituteRouter.post(
  '/roles/:roleId/dispatch',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const body = parseBody(dispatchSchema, req.body);
    const result = await shortlistService.dispatch({
      roleId,
      instituteId: currentInstituteId(req),
      studentIds: body.studentIds,
      adminId: currentUser(req).id,
      message: body.message ?? null,
    });
    res.status(201).json(result);
  }),
);

instituteRouter.get(
  '/dispatches',
  asyncHandler(async (req, res) => {
    res.json({ items: await instituteAdminService.listDispatches(currentInstituteId(req)) });
  }),
);

instituteRouter.get(
  '/skills',
  asyncHandler(async (req, res) => {
    const query = parseQuery(z.object({ q: z.string().trim().max(120).default('') }), req.query);
    res.json({ items: await skillService.listForAdmin(currentInstituteId(req), query.q) });
  }),
);

instituteRouter.post(
  '/skills',
  asyncHandler(async (req, res) => {
    const body = parseBody(skillCreateSchema, req.body);
    res.status(201).json({ skill: await skillService.create(currentInstituteId(req), body.name) });
  }),
);

instituteRouter.patch(
  '/skills/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(skillUpdateSchema, req.body);
    res.json({ skill: await skillService.update(currentInstituteId(req), id, body) });
  }),
);
