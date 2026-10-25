import { z } from 'zod';
import type { JobCriteria } from './types';

export const CURRENT_YEAR = new Date().getFullYear();
export const MIN_YEAR = 1950;
export const MAX_YEAR = CURRENT_YEAR + 10;

export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email must be at most 254 characters')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const nameSchema = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name must be at most 120 characters');

export const requiredText = (label: string, max = 200) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const optionalText = (label: string, max = 200) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `${label} must be at most ${max} characters`).nullable().optional(),
  );

export const httpUrlSchema = z
  .string({ required_error: 'URL is required' })
  .trim()
  .min(1, 'URL is required')
  .max(500, 'URL must be at most 500 characters')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a full URL starting with http:// or https://');

export const optionalHttpUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  httpUrlSchema.nullable().optional(),
);

const blankToNull = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

export const nullableNumber = (min: number, max: number, label: string) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`)
      .nullable(),
  );

export const requiredNumber = (min: number, max: number, label: string) =>
  z.coerce
    .number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

export const passingYearSchema = requiredNumber(MIN_YEAR, MAX_YEAR, 'Passing year').int('Passing year must be a whole year');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['STUDENT', 'ADMIN', 'EMPLOYER']).optional(),
});

/**
 * Turns a human-entered college name or identifier into a stable tenant slug.
 * Used by the bootstrap command, the API and the registration form so all three
 * agree on what a slug looks like.
 */
export const normalizeCollegeSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const collegeSlugSchema = z
  .string({ required_error: 'College identifier is required' })
  .trim()
  .min(1, 'College identifier is required')
  .max(80, 'College identifier must be at most 80 characters')
  .transform(normalizeCollegeSlug)
  .refine((value) => value.length >= 2, 'College identifier must be at least 2 characters')
  .refine((value) => value.length <= 50, 'College identifier must be at most 50 characters')
  .refine(
    (value) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(value),
    'Use lowercase letters, numbers and hyphens, starting and ending with a letter or number',
  );

export const collegeCreateSchema = z.object({
  name: requiredText('College name', 160),
  slug: collegeSlugSchema,
  website: optionalHttpUrlSchema,
  contactEmail: z.preprocess(blankToNull, emailSchema.nullable()),
  contactPhone: optionalText('Contact phone', 30),
});

export const studentRegisterSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  dateOfBirth: optionalText('Date of birth', 10),
  collegeSlug: collegeSlugSchema,
});

export const employerRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  companyName: requiredText('Company name', 160),
  website: optionalHttpUrlSchema,
  contactPersonName: requiredText('Contact person name', 120),
  contactPhone: requiredText('Contact phone', 30),
  companyEmail: emailSchema,
  description: optionalText('Company description', 2000),
  collegeSlug: collegeSlugSchema,
});

export const profileUpdateSchema = z.object({
  fullName: nameSchema,
  dateOfBirth: optionalText('Date of birth', 10),
  gender: z.preprocess(blankToNull, z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).nullable()),
  phone: optionalText('Phone number', 30),
  city: optionalText('City', 80),
  state: optionalText('State', 80),
  linkedin: optionalHttpUrlSchema,
  github: optionalHttpUrlSchema,
  portfolio: optionalHttpUrlSchema,
  activeBacklogs: nullableNumber(0, 60, 'Active backlogs'),
});

const scoreFields = {
  scoreType: z.enum(['PERCENTAGE', 'CGPA'], { required_error: 'Score type is required' }),
  scoreValue: requiredNumber(0, 1000, 'Score value'),
  scoreScale: nullableNumber(1, 100, 'Score scale'),
};

const scoreRefinement = (data: { scoreType: 'PERCENTAGE' | 'CGPA'; scoreValue: number; scoreScale: number | null }, ctx: z.RefinementCtx) => {
  if (data.scoreType === 'PERCENTAGE') {
    if (data.scoreValue > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scoreValue'], message: 'A percentage cannot be greater than 100' });
    }
    return;
  }
  if (data.scoreScale === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scoreScale'], message: 'A CGPA scale is required when the score type is CGPA' });
    return;
  }
  if (data.scoreValue > data.scoreScale) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scoreValue'],
      message: `A CGPA of ${data.scoreValue} is not possible on a ${data.scoreScale}-point scale`,
    });
  }
};

export const class10Schema = z
  .object({
    board: requiredText('Board', 120),
    passingYear: passingYearSchema,
    scoreValue: requiredNumber(0, 100, 'Percentage'),
  });

export const class12Schema = z
  .object({
    board: requiredText('Board', 120),
    stream: requiredText('Stream', 80),
    passingYear: passingYearSchema,
    scoreValue: requiredNumber(0, 100, 'Percentage'),
  });

export const undergradSchema = z
  .object({
    degree: requiredText('Degree', 120),
    branch: requiredText('Branch', 120),
    institution: requiredText('Institution', 160),
    passingYear: passingYearSchema,
    ...scoreFields,
  })
  .superRefine(scoreRefinement);

export const postgradSchema = undergradSchema;

/** `YYYY-MM` with a real calendar month. */
const monthString = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM with a month between 01 and 12');

export const experienceSchema = z
  .object({
    organization: requiredText('Organization', 160),
    jobTitle: requiredText('Job title', 120),
    startDate: monthString('Start date'),
    endDate: z.preprocess(blankToNull, monthString('End date').nullable()),
    isCurrent: z.boolean().default(false),
    description: optionalText('Description', 2000),
  })
  .superRefine((data, ctx) => {
    if (!data.isCurrent && !data.endDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Provide an end date or mark the role as current' });
    }
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date cannot be before the start date' });
    }
  });

export const skillSelectionSchema = z.object({
  skillIds: z.array(z.string().min(1)).max(60, 'Select at most 60 skills'),
});

export const jobCriteriaSchema = z
  .object({
    minClass10Percentage: nullableNumber(0, 100, 'Minimum Class 10 percentage'),
    minClass12Percentage: nullableNumber(0, 100, 'Minimum Class 12 percentage'),
    undergradScoreType: z.preprocess(blankToNull, z.enum(['PERCENTAGE', 'CGPA']).nullable()),
    minUndergradScore: nullableNumber(0, 1000, 'Minimum undergraduate score'),
    undergradScoreScale: nullableNumber(1, 100, 'Undergraduate score scale'),
    allowedDegrees: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    allowedBranches: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    graduationYears: z.array(z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR)).max(15).default([]),
    maxActiveBacklogs: nullableNumber(0, 60, 'Maximum active backlogs'),
    minExperienceMonths: nullableNumber(0, 600, 'Minimum experience'),
    skillMode: z.enum(['ALL', 'ANY']).default('ALL'),
    requiredSkillIds: z.array(z.string().min(1)).max(30).default([]),
    optionalSkillIds: z.array(z.string().min(1)).max(30).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.undergradScoreType === null && data.minUndergradScore !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['undergradScoreType'],
        message: 'Choose a score type for the undergraduate requirement',
      });
    }
    if (data.undergradScoreType === 'CGPA') {
      if (data.undergradScoreScale === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['undergradScoreScale'], message: 'A CGPA scale is required' });
      } else if (data.minUndergradScore !== null && data.minUndergradScore > data.undergradScoreScale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['minUndergradScore'],
          message: `Minimum CGPA cannot exceed the ${data.undergradScoreScale}-point scale`,
        });
      }
    }
    if (data.undergradScoreType === 'PERCENTAGE' && data.minUndergradScore !== null && data.minUndergradScore > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minUndergradScore'], message: 'A percentage cannot exceed 100' });
    }
    const overlap = data.requiredSkillIds.filter((id) => data.optionalSkillIds.includes(id));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['optionalSkillIds'],
        message: 'A skill cannot be both required and preferred',
      });
    }
  });

export const jobRoleSchema = z.object({
  title: requiredText('Job title', 140),
  description: requiredText('Job description', 5000),
  location: optionalText('Location', 160),
  employmentType: z.preprocess(blankToNull, z.enum(['FULL_TIME', 'INTERNSHIP', 'PART_TIME', 'CONTRACT']).nullable()),
  registrationUrl: httpUrlSchema,
  criteria: jobCriteriaSchema,
});

export const hiringRequestSchema = z.object({
  title: requiredText('Request title', 160),
  assessmentInstructions: optionalText('Assessment instructions', 2000),
  roles: z.array(jobRoleSchema).min(1, 'Add at least one job role').max(10, 'A request can contain at most 10 roles'),
});

export const hiringRequestSubmitSchema = hiringRequestSchema.extend({
  submit: z.boolean().default(false),
});

export const companyUpdateSchema = z.object({
  name: requiredText('Company name', 160),
  website: optionalHttpUrlSchema,
  contactPersonName: requiredText('Contact person name', 120),
  contactPhone: requiredText('Contact phone', 30),
  contactEmail: emailSchema,
  description: optionalText('Company description', 2000),
});

export const reviewDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
  note: optionalText('Note', 1000),
});

export const employerReviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: optionalText('Note', 1000),
});

export const shortlistSchema = z.object({
  studentIds: z.array(z.string().min(1)).max(500),
});

export const dispatchSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, 'Select at least one student').max(500),
  message: optionalText('Message', 2000),
});

export const skillCreateSchema = z.object({
  name: z
    .string({ required_error: 'Skill name is required' })
    .trim()
    .min(2, 'Skill name must be at least 2 characters')
    .max(60, 'Skill name must be at most 60 characters'),
});

export const skillUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Skill name must be at least 2 characters').max(60, 'Skill name must be at most 60 characters').optional(),
  active: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const emptyCriteria = (): JobCriteria => ({
  minClass10Percentage: null,
  minClass12Percentage: null,
  undergradScoreType: null,
  minUndergradScore: null,
  undergradScoreScale: null,
  allowedDegrees: [],
  allowedBranches: [],
  graduationYears: [],
  maxActiveBacklogs: null,
  minExperienceMonths: null,
  skillMode: 'ALL',
  requiredSkillIds: [],
  optionalSkillIds: [],
});
