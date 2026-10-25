import { Router } from 'express';
import { z } from 'zod';
import {
  dispatchSchema,
  employerReviewSchema,
  paginationSchema,
  reviewDecisionSchema,
  skillCreateSchema,
  skillUpdateSchema,
  shortlistSchema,
} from '@campusconnect/shared';
import { adminService } from '../services/admin.service';
import { employerService } from '../services/employer.service';
import { requestService } from '../services/request.service';
import { shortlistService } from '../services/shortlist.service';
import { skillService } from '../services/skill.service';
import { asyncHandler, parseBody, parseQuery } from '../lib/validation';
import { currentCollegeId, currentUser, requireAuth, requireRole } from '../middleware/auth';

const idParams = z.object({ id: z.string().min(1) });
const roleParams = z.object({ roleId: z.string().min(1) });

const employerQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  q: z.string().trim().max(120).default(''),
});

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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await adminService.stats(currentCollegeId(req)));
  }),
);

adminRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    const query = parseQuery(paginationSchema.extend({ q: z.string().trim().max(120).default('') }), req.query);
    res.json(await adminService.listStudents(currentCollegeId(req), query));
  }),
);

adminRouter.get(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    res.json(await adminService.getStudentDetail(currentCollegeId(req), id));
  }),
);

adminRouter.get(
  '/students/:id/notifications',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    res.json(await adminService.studentNotifications(currentCollegeId(req), id));
  }),
);

adminRouter.get(
  '/employers',
  asyncHandler(async (req, res) => {
    const query = parseQuery(employerQuery, req.query);
    const items = await employerService.listEmployers({
      collegeId: currentCollegeId(req),
      status: query.status ?? null,
      q: query.q,
    });
    res.json({ items });
  }),
);

adminRouter.get(
  '/employers/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    res.json(await employerService.getEmployerDetail(id, currentCollegeId(req)));
  }),
);

adminRouter.post(
  '/employers/:id/review',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(employerReviewSchema, req.body);
    const detail = await employerService.review(currentUser(req).id, currentCollegeId(req), id, body.action, body.note ?? null);
    res.json(detail);
  }),
);

adminRouter.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const query = parseQuery(requestQuery, req.query);
    const items = await adminService.listRequests({
      collegeId: currentCollegeId(req),
      status: query.status ?? null,
      q: query.q,
    });
    res.json({ items });
  }),
);

adminRouter.get(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const request = await requestService.getById(id, currentCollegeId(req));
    res.json({ request });
  }),
);

adminRouter.post(
  '/requests/:id/review',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(reviewDecisionSchema, req.body);
    const request = await requestService.review(currentUser(req).id, currentCollegeId(req), id, body.action, body.note ?? null);
    res.json({ request });
  }),
);

adminRouter.get(
  '/roles/:roleId/candidates',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const query = parseQuery(candidateQuery, req.query);
    res.json(await shortlistService.getCandidates(roleId, currentCollegeId(req), query.eligibleOnly));
  }),
);

adminRouter.get(
  '/roles/:roleId/shortlist',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const items = await shortlistService.getShortlist(roleId, currentCollegeId(req));
    res.json({ items });
  }),
);

adminRouter.put(
  '/roles/:roleId/shortlist',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const body = parseBody(shortlistSchema, req.body);
    res.json(await shortlistService.saveShortlist(roleId, currentCollegeId(req), body.studentIds, currentUser(req).id));
  }),
);

adminRouter.post(
  '/roles/:roleId/dispatch',
  asyncHandler(async (req, res) => {
    const { roleId } = parseBody(roleParams, req.params);
    const body = parseBody(dispatchSchema, req.body);
    const result = await shortlistService.dispatch({
      roleId,
      collegeId: currentCollegeId(req),
      studentIds: body.studentIds,
      adminId: currentUser(req).id,
      message: body.message ?? null,
    });
    res.status(201).json(result);
  }),
);

adminRouter.get(
  '/dispatches',
  asyncHandler(async (req, res) => {
    res.json({ items: await adminService.listDispatches(currentCollegeId(req)) });
  }),
);

adminRouter.get(
  '/skills',
  asyncHandler(async (req, res) => {
    const query = parseQuery(z.object({ q: z.string().trim().max(120).default('') }), req.query);
    res.json({ items: await skillService.listForAdmin(currentCollegeId(req), query.q) });
  }),
);

adminRouter.post(
  '/skills',
  asyncHandler(async (req, res) => {
    const body = parseBody(skillCreateSchema, req.body);
    res.status(201).json({ skill: await skillService.create(currentCollegeId(req), body.name) });
  }),
);

adminRouter.patch(
  '/skills/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseBody(idParams, req.params);
    const body = parseBody(skillUpdateSchema, req.body);
    res.json({ skill: await skillService.update(currentCollegeId(req), id, body) });
  }),
);
