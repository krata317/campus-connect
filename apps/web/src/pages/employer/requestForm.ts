import type { HiringRequest, JobCriteria } from '@campusconnect/shared';

export interface RoleFormValues {
  title: string;
  description: string;
  location: string;
  employmentType: string;
  registrationUrl: string;
  minClass10Percentage: string;
  minClass12Percentage: string;
  undergradScoreType: string;
  minUndergradScore: string;
  undergradScoreScale: string;
  allowedDegrees: string;
  allowedBranches: string;
  graduationYears: string;
  maxActiveBacklogs: string;
  minExperienceMonths: string;
  skillMode: 'ALL' | 'ANY';
  requiredSkillIds: string[];
  optionalSkillIds: string[];
}

export interface RequestFormValues {
  title: string;
  assessmentInstructions: string;
  roles: RoleFormValues[];
}

const numToText = (value: number | null): string => (value === null || value === undefined ? '' : String(value));

export const emptyRole = (): RoleFormValues => ({
  title: '',
  description: '',
  location: '',
  employmentType: '',
  registrationUrl: '',
  minClass10Percentage: '',
  minClass12Percentage: '',
  undergradScoreType: '',
  minUndergradScore: '',
  undergradScoreScale: '',
  allowedDegrees: '',
  allowedBranches: '',
  graduationYears: '',
  maxActiveBacklogs: '',
  minExperienceMonths: '',
  skillMode: 'ALL',
  requiredSkillIds: [],
  optionalSkillIds: [],
});

export const emptyRequest = (): RequestFormValues => ({
  title: '',
  assessmentInstructions: '',
  roles: [emptyRole()],
});

const criteriaToValues = (criteria: JobCriteria): Omit<RoleFormValues, 'title' | 'description' | 'location' | 'employmentType' | 'registrationUrl'> => ({
  minClass10Percentage: numToText(criteria.minClass10Percentage),
  minClass12Percentage: numToText(criteria.minClass12Percentage),
  undergradScoreType: criteria.undergradScoreType ?? '',
  minUndergradScore: numToText(criteria.minUndergradScore),
  undergradScoreScale: numToText(criteria.undergradScoreScale),
  allowedDegrees: criteria.allowedDegrees.join(', '),
  allowedBranches: criteria.allowedBranches.join(', '),
  graduationYears: criteria.graduationYears.join(', '),
  maxActiveBacklogs: numToText(criteria.maxActiveBacklogs),
  minExperienceMonths: numToText(criteria.minExperienceMonths),
  skillMode: criteria.skillMode,
  requiredSkillIds: [...criteria.requiredSkillIds],
  optionalSkillIds: [...criteria.optionalSkillIds],
});

export const requestToValues = (request: HiringRequest): RequestFormValues => ({
  title: request.title,
  assessmentInstructions: request.assessmentInstructions ?? '',
  roles: request.roles.map((role) => ({
    title: role.title,
    description: role.description,
    location: role.location ?? '',
    employmentType: role.employmentType ?? '',
    registrationUrl: role.registrationUrl,
    ...criteriaToValues(role.criteria),
  })),
});

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const valuesToPayload = (values: RequestFormValues) => ({
  title: values.title,
  assessmentInstructions: values.assessmentInstructions.trim() === '' ? null : values.assessmentInstructions,
  roles: values.roles.map((role) => ({
    title: role.title,
    description: role.description,
    location: role.location.trim() === '' ? null : role.location,
    employmentType: role.employmentType === '' ? null : role.employmentType,
    registrationUrl: role.registrationUrl,
    criteria: {
      minClass10Percentage: numberOrNull(role.minClass10Percentage),
      minClass12Percentage: numberOrNull(role.minClass12Percentage),
      undergradScoreType: role.undergradScoreType === '' ? null : role.undergradScoreType,
      minUndergradScore: numberOrNull(role.minUndergradScore),
      undergradScoreScale: numberOrNull(role.undergradScoreScale),
      allowedDegrees: splitList(role.allowedDegrees),
      allowedBranches: splitList(role.allowedBranches),
      graduationYears: splitList(role.graduationYears)
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item)),
      maxActiveBacklogs: numberOrNull(role.maxActiveBacklogs),
      minExperienceMonths: numberOrNull(role.minExperienceMonths),
      skillMode: role.skillMode,
      requiredSkillIds: role.requiredSkillIds,
      optionalSkillIds: role.optionalSkillIds,
    },
  })),
});
