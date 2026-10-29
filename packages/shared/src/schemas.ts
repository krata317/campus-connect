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

// ---------------------------------------------------------------------------
// Accounts and sign-in
// ---------------------------------------------------------------------------

export const roleSchema = z.enum(['STUDENT', 'RECRUITER', 'INSTITUTE_ADMIN']);

/**
 * Sign-in accepts an email address or a username. Students only have an email;
 * institute administrators and recruiters also choose a username.
 */
export const loginSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or username is required' })
    .trim()
    .min(1, 'Email or username is required')
    .max(254, 'Email or username is too long'),
  password: z.string().min(1, 'Password is required'),
  role: roleSchema.optional(),
  // "Remember me": the session lasts 7 days instead of the default 10 minutes.
  rememberMe: z.boolean().optional(),
});

export const usernameSchema = z
  .string({ required_error: 'Username is required' })
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/, 'Use lowercase letters, numbers, dots, underscores or hyphens');

/** AISHE codes look like "C-6560" or "U-0456"; the server normalises the rest. */
export const aisheCodeSchema = z
  .string({ required_error: 'AISHE code is required' })
  .trim()
  .min(3, 'AISHE code is required')
  .max(20, 'AISHE code is too long')
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
  .refine((value) => /^[A-Z]-?\d{1,6}$/.test(value), 'Enter a valid AISHE code, for example C-6560');

/**
 * Company names are compared after trimming, collapsing repeated whitespace and
 * lower-casing. Punctuation is preserved, so "Acme Pvt. Ltd." and "Acme Pvt Ltd"
 * are treated as different names.
 */
export const normalizeCompanyName = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const companyNameKey = (value: string): string => normalizeCompanyName(value).toLowerCase();

export const companyNameSchema = z
  .string({ required_error: 'Company name is required' })
  .trim()
  .min(2, 'Company name must be at least 2 characters')
  .max(160, 'Company name must be at most 160 characters')
  .transform(normalizeCompanyName);

// ---------------------------------------------------------------------------
// Two-step registration (OTP, then a single-use link)
// ---------------------------------------------------------------------------

export const instituteRegisterStartSchema = z.object({
  aisheCode: aisheCodeSchema,
  email: emailSchema,
});

export const recruiterRegisterStartSchema = z.object({
  companyName: companyNameSchema,
  email: emailSchema,
});

export const otpVerifySchema = z.object({
  pendingId: z.string().trim().min(1, 'Missing registration reference'),
  code: z
    .string({ required_error: 'Enter the 6-digit code' })
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
});

export const resendOtpSchema = z.object({
  pendingId: z.string().trim().min(1, 'Missing registration reference'),
});

export const instituteRegisterCompleteSchema = z.object({
  token: z.string().trim().min(20, 'This registration link is not valid'),
  fullName: nameSchema,
  username: usernameSchema,
  password: passwordSchema,
  contactPhone: optionalText('Contact phone', 30),
  website: optionalHttpUrlSchema,
});

export const recruiterRegisterCompleteSchema = z.object({
  token: z.string().trim().min(20, 'This registration link is not valid'),
  contactPersonName: nameSchema,
  contactPhone: requiredText('Contact phone', 30),
  username: usernameSchema,
  password: passwordSchema,
  website: optionalHttpUrlSchema,
  description: optionalText('Company description', 2000),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
  // The account type is required so a reset can never land on a different
  // account that happens to share the same email address.
  role: roleSchema,
});

export const passwordResetCompleteSchema = z.object({
  token: z.string().trim().min(20, 'This reset link is not valid'),
  password: passwordSchema,
});

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------

export const studentRegisterSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  dateOfBirth: optionalText('Date of birth', 10),
  instituteId: z.string().trim().min(1, 'Select your institute'),
  studentCode: z
    .string({ required_error: 'Institute student code is required' })
    .trim()
    .min(1, 'Institute student code is required')
    .max(64, 'Institute student code is too long'),
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

export const notificationPreferenceSchema = z.object({
  emailNotifications: z.boolean({ required_error: 'Choose whether to receive optional emails' }),
});

/**
 * Confirms a self-service account deletion. The account is always taken from the
 * session, never from the body, so this payload cannot name somebody else.
 */
export const deleteAccountSchema = z.object({
  password: z.string({ required_error: 'Enter your password to confirm' }).min(1, 'Enter your password to confirm'),
  confirm: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE in capitals to confirm' }),
  }),
});

export const instituteProfileSchema = z.object({
  website: optionalHttpUrlSchema,
  contactEmail: z.preprocess(blankToNull, emailSchema.nullable()),
  contactPhone: optionalText('Contact phone', 30),
});

export const recruiterProfileSchema = z.object({
  companyName: companyNameSchema,
  website: optionalHttpUrlSchema,
  contactPersonName: nameSchema,
  contactPhone: requiredText('Contact phone', 30),
  description: optionalText('Company description', 2000),
});

// ---------------------------------------------------------------------------
// Student profile records
// ---------------------------------------------------------------------------

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

export const class10Schema = z.object({
  board: requiredText('Board', 120),
  passingYear: passingYearSchema,
  scoreValue: requiredNumber(0, 100, 'Percentage'),
});

export const class12Schema = z.object({
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

// ---------------------------------------------------------------------------
// Hiring requests
// ---------------------------------------------------------------------------

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

/** A new request must name the institute it is addressed to. */
export const hiringRequestCreateSchema = hiringRequestSchema.extend({
  instituteId: z.string().trim().min(1, 'Choose the institute this request is for'),
  submit: z.boolean().default(false),
});

/** Editing an existing request cannot move it to another institute. */
export const hiringRequestUpdateSchema = hiringRequestSchema.extend({
  submit: z.boolean().default(false),
});

export const reviewDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
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
