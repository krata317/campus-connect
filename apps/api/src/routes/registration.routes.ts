import { Router } from 'express';
import { z } from 'zod';
import {
  instituteRegisterCompleteSchema,
  instituteRegisterStartSchema,
  otpVerifySchema,
  recruiterRegisterCompleteSchema,
  recruiterRegisterStartSchema,
  resendOtpSchema,
} from '@campusconnect/shared';
import { registrationService } from '../services/registration.service';
import { asyncHandler, parseBody, parseQuery } from '../lib/validation';
import { registerLimiter, verificationLimiter } from '../middleware/rateLimit';
import { findInstitution, searchInstitutions } from '../data/aishe';

const tokenQuery = z.object({ token: z.string().trim().min(20, 'This link is not valid') });

export const registrationRouter = Router();

/** Public AISHE lookup so the form can show the official record while typing. */
registrationRouter.get(
  '/institutions/lookup',
  asyncHandler(async (req, res) => {
    const query = parseQuery(z.object({ code: z.string().trim().max(20).default('') }), req.query);
    const institution = findInstitution(query.code);
    res.json({ institution });
  }),
);

registrationRouter.get(
  '/institutions/search',
  asyncHandler(async (req, res) => {
    const query = parseQuery(z.object({ q: z.string().trim().max(120).default('') }), req.query);
    res.json({ items: searchInstitutions(query.q, 8) });
  }),
);

registrationRouter.post(
  '/institute/start',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(instituteRegisterStartSchema, req.body);
    const result = await registrationService.startInstitute({ aisheCode: body.aisheCode, email: body.email });
    res.status(201).json(result);
  }),
);

registrationRouter.post(
  '/institute/verify',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(otpVerifySchema, req.body);
    res.json(await registrationService.verifyOtp(body));
  }),
);

registrationRouter.post(
  '/institute/resend',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(resendOtpSchema, req.body);
    res.json(await registrationService.resendOtp(body));
  }),
);

registrationRouter.post(
  '/recruiter/start',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(recruiterRegisterStartSchema, req.body);
    const result = await registrationService.startRecruiter({ companyName: body.companyName, email: body.email });
    res.status(201).json(result);
  }),
);

registrationRouter.post(
  '/recruiter/verify',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(otpVerifySchema, req.body);
    res.json(await registrationService.verifyOtp(body));
  }),
);

registrationRouter.post(
  '/recruiter/resend',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(resendOtpSchema, req.body);
    res.json(await registrationService.resendOtp(body));
  }),
);

/** Reads the link without consuming it, so the form can render. */
registrationRouter.get(
  '/link',
  asyncHandler(async (req, res) => {
    const query = parseQuery(tokenQuery, req.query);
    res.json(await registrationService.getLinkInfo(query.token));
  }),
);

registrationRouter.post(
  '/institute/complete',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(instituteRegisterCompleteSchema, req.body);
    const result = await registrationService.completeInstitute({
      token: body.token,
      fullName: body.fullName,
      username: body.username,
      password: body.password,
      contactPhone: body.contactPhone ?? null,
      website: body.website ?? null,
    });
    res.status(201).json(result);
  }),
);

registrationRouter.post(
  '/recruiter/complete',
  verificationLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(recruiterRegisterCompleteSchema, req.body);
    const result = await registrationService.completeRecruiter({
      token: body.token,
      contactPersonName: body.contactPersonName,
      contactPhone: body.contactPhone,
      username: body.username,
      password: body.password,
      website: body.website ?? null,
      description: body.description ?? null,
    });
    res.status(201).json(result);
  }),
);
