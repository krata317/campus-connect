import type {
  CandidateEvaluation,
  EducationRecord,
  EligibilityCheck,
  ExperienceRecord,
  JobCriteria,
  ScoreType,
} from '@campusconnect/shared';
import { formatMonths, totalExperienceMonths } from '../lib/dates';

export interface EvaluationProfile {
  id: string;
  fullName: string;
  email: string;
  activeBacklogs: number | null;
  education: EducationRecord[];
  experiences: ExperienceRecord[];
  skills: { id: string; name: string }[];
}

const findEducation = (education: EducationRecord[], level: EducationRecord['level']): EducationRecord | null =>
  education.find((item) => item.level === level) ?? null;

const normalize = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

export const formatScore = (type: ScoreType | null, value: number | null, scale: number | null): string => {
  if (value === null) return 'Not provided';
  if (type === 'CGPA') return scale ? `${value} / ${scale} CGPA` : `${value} CGPA`;
  if (type === 'PERCENTAGE') return `${value}%`;
  return String(value);
};

const pass = (key: string, label: string, requirement: string, observed: string, detail: string | null = null): EligibilityCheck => ({
  key,
  label,
  status: 'PASS',
  requirement,
  observed,
  detail,
});

const fail = (key: string, label: string, requirement: string, observed: string, detail: string): EligibilityCheck => ({
  key,
  label,
  status: 'FAIL',
  requirement,
  observed,
  detail,
});

const missing = (key: string, label: string, requirement: string, observed: string, detail: string): EligibilityCheck => ({
  key,
  label,
  status: 'MISSING',
  requirement,
  observed,
  detail,
});

const skipped = (key: string, label: string): EligibilityCheck => ({
  key,
  label,
  status: 'SKIPPED',
  requirement: 'Not required for this role',
  observed: '—',
  detail: null,
});

export function evaluateCandidate(
  student: EvaluationProfile,
  criteria: JobCriteria,
  skillNames: Map<string, string>,
): CandidateEvaluation {
  const checks: EligibilityCheck[] = [];
  const class10 = findEducation(student.education, 'CLASS_10');
  const class12 = findEducation(student.education, 'CLASS_12');
  const undergrad = findEducation(student.education, 'UNDERGRAD');
  const experienceMonths = totalExperienceMonths(student.experiences);

  if (criteria.minClass10Percentage === null) {
    checks.push(skipped('class10', 'Class 10 percentage'));
  } else {
    const requirement = `At least ${criteria.minClass10Percentage}%`;
    if (!class10 || class10.scoreValue === null) {
      checks.push(missing('class10', 'Class 10 percentage', requirement, 'Not provided', 'Add your Class 10 percentage to your profile to be considered.'));
    } else if (class10.scoreValue >= criteria.minClass10Percentage) {
      checks.push(pass('class10', 'Class 10 percentage', requirement, `${class10.scoreValue}%`));
    } else {
      checks.push(
        fail('class10', 'Class 10 percentage', requirement, `${class10.scoreValue}%`, `Class 10 percentage is below the required ${criteria.minClass10Percentage}%.`),
      );
    }
  }

  if (criteria.minClass12Percentage === null) {
    checks.push(skipped('class12', 'Class 12 percentage'));
  } else {
    const requirement = `At least ${criteria.minClass12Percentage}%`;
    if (!class12 || class12.scoreValue === null) {
      checks.push(missing('class12', 'Class 12 percentage', requirement, 'Not provided', 'Add your Class 12 percentage to your profile to be considered.'));
    } else if (class12.scoreValue >= criteria.minClass12Percentage) {
      checks.push(pass('class12', 'Class 12 percentage', requirement, `${class12.scoreValue}%`));
    } else {
      checks.push(
        fail('class12', 'Class 12 percentage', requirement, `${class12.scoreValue}%`, `Class 12 percentage is below the required ${criteria.minClass12Percentage}%.`),
      );
    }
  }

  const undergradRequiredType = criteria.undergradScoreType;
  const undergradRequiredValue = criteria.minUndergradScore;

  if (undergradRequiredType === null || undergradRequiredValue === null) {
    checks.push(skipped('undergradScore', 'Undergraduate score'));
  } else {
    const requirement = `At least ${formatScore(undergradRequiredType, undergradRequiredValue, criteria.undergradScoreScale)}`;
    if (!undergrad || undergrad.scoreValue === null) {
      checks.push(missing('undergradScore', 'Undergraduate score', requirement, 'Not provided', 'Add your undergraduate score to your profile to be considered.'));
    } else if (undergrad.scoreType !== undergradRequiredType) {
      checks.push(
        missing(
          'undergradScore',
          'Undergraduate score',
          requirement,
          formatScore(undergrad.scoreType, undergrad.scoreValue, undergrad.scoreScale),
          `The employer asks for a ${undergradRequiredType === 'CGPA' ? 'CGPA' : 'percentage'} but your profile records a ${
            undergrad.scoreType === 'CGPA' ? 'CGPA' : 'percentage'
          }. The portal does not convert between score types, so this cannot be verified.`,
        ),
      );
    } else if (undergradRequiredType === 'CGPA' && undergrad.scoreScale !== criteria.undergradScoreScale) {
      checks.push(
        missing(
          'undergradScore',
          'Undergraduate score',
          requirement,
          formatScore(undergrad.scoreType, undergrad.scoreValue, undergrad.scoreScale),
          `Your CGPA is recorded on a ${undergrad.scoreScale ?? 'unknown'}-point scale and the employer asks for a ${
            criteria.undergradScoreScale ?? 'unknown'
          }-point scale. CGPA scales are not converted automatically.`,
        ),
      );
    } else if (undergrad.scoreValue >= undergradRequiredValue) {
      checks.push(pass('undergradScore', 'Undergraduate score', requirement, formatScore(undergrad.scoreType, undergrad.scoreValue, undergrad.scoreScale)));
    } else {
      checks.push(
        fail(
          'undergradScore',
          'Undergraduate score',
          requirement,
          formatScore(undergrad.scoreType, undergrad.scoreValue, undergrad.scoreScale),
          `Undergraduate score is below the required ${formatScore(undergradRequiredType, undergradRequiredValue, criteria.undergradScoreScale)}.`,
        ),
      );
    }
  }

  if (criteria.allowedDegrees.length === 0) {
    checks.push(skipped('degree', 'Degree'));
  } else {
    const requirement = `One of: ${criteria.allowedDegrees.join(', ')}`;
    if (!undergrad || !undergrad.degree) {
      checks.push(missing('degree', 'Degree', requirement, 'Not provided', 'Add your undergraduate degree to your profile to be considered.'));
    } else {
      const allowed = criteria.allowedDegrees.map(normalize);
      if (allowed.includes(normalize(undergrad.degree))) {
        checks.push(pass('degree', 'Degree', requirement, undergrad.degree));
      } else {
        checks.push(fail('degree', 'Degree', requirement, undergrad.degree, `Your degree (${undergrad.degree}) is not in the list of eligible degrees.`));
      }
    }
  }

  if (criteria.allowedBranches.length === 0) {
    checks.push(skipped('branch', 'Branch'));
  } else {
    const requirement = `One of: ${criteria.allowedBranches.join(', ')}`;
    if (!undergrad || !undergrad.branch) {
      checks.push(missing('branch', 'Branch', requirement, 'Not provided', 'Add your undergraduate branch to your profile to be considered.'));
    } else {
      const allowed = criteria.allowedBranches.map(normalize);
      if (allowed.includes(normalize(undergrad.branch))) {
        checks.push(pass('branch', 'Branch', requirement, undergrad.branch));
      } else {
        checks.push(fail('branch', 'Branch', requirement, undergrad.branch, `Your branch (${undergrad.branch}) is not in the list of eligible branches.`));
      }
    }
  }

  if (criteria.graduationYears.length === 0) {
    checks.push(skipped('graduationYear', 'Graduation year'));
  } else {
    const requirement = `One of: ${criteria.graduationYears.join(', ')}`;
    if (!undergrad || undergrad.passingYear === null) {
      checks.push(
        missing('graduationYear', 'Graduation year', requirement, 'Not provided', 'Add your expected graduation year to your profile to be considered.'),
      );
    } else if (criteria.graduationYears.includes(undergrad.passingYear)) {
      checks.push(pass('graduationYear', 'Graduation year', requirement, String(undergrad.passingYear)));
    } else {
      checks.push(
        fail('graduationYear', 'Graduation year', requirement, String(undergrad.passingYear), `Your graduation year (${undergrad.passingYear}) is not eligible for this role.`),
      );
    }
  }

  if (criteria.maxActiveBacklogs === null) {
    checks.push(skipped('backlogs', 'Active backlogs'));
  } else {
    const requirement = `At most ${criteria.maxActiveBacklogs}`;
    if (student.activeBacklogs === null) {
      checks.push(
        missing('backlogs', 'Active backlogs', requirement, 'Not provided', 'Record your active backlog count (enter 0 if you have none) to be considered.'),
      );
    } else if (student.activeBacklogs <= criteria.maxActiveBacklogs) {
      checks.push(pass('backlogs', 'Active backlogs', requirement, String(student.activeBacklogs)));
    } else {
      checks.push(
        fail(
          'backlogs',
          'Active backlogs',
          requirement,
          String(student.activeBacklogs),
          `You have ${student.activeBacklogs} active backlog(s); the role allows at most ${criteria.maxActiveBacklogs}.`,
        ),
      );
    }
  }

  if (criteria.minExperienceMonths === null) {
    checks.push(skipped('experience', 'Experience'));
  } else {
    const requirement = `At least ${formatMonths(criteria.minExperienceMonths)}`;
    if (experienceMonths >= criteria.minExperienceMonths) {
      checks.push(pass('experience', 'Experience', requirement, formatMonths(experienceMonths)));
    } else {
      checks.push(
        fail('experience', 'Experience', requirement, formatMonths(experienceMonths), `You have ${formatMonths(experienceMonths)} of recorded experience; ${formatMonths(criteria.minExperienceMonths)} is required.`),
      );
    }
  }

  const requiredNames = criteria.requiredSkillIds.map((id) => skillNames.get(id) ?? id);
  const studentSkillIds = new Set(student.skills.map((skill) => skill.id));

  const matchedRequired = criteria.requiredSkillIds.filter((id) => studentSkillIds.has(id));
  const missingRequired = criteria.requiredSkillIds.filter((id) => !studentSkillIds.has(id));
  const matchedOptional = criteria.optionalSkillIds.filter((id) => studentSkillIds.has(id));

  const matchedSkills = [...matchedRequired, ...matchedOptional].map((id) => skillNames.get(id) ?? id);
  const missingSkills = missingRequired.map((id) => skillNames.get(id) ?? id);

  if (criteria.requiredSkillIds.length === 0) {
    checks.push(skipped('skills', 'Skills'));
  } else {
    const requirement =
      criteria.skillMode === 'ALL'
        ? `All of: ${requiredNames.join(', ')}`
        : `Any of: ${requiredNames.join(', ')}`;

    if (criteria.skillMode === 'ALL') {
      if (missingRequired.length === 0) {
        checks.push(pass('skills', 'Skills', requirement, `All ${requiredNames.length} required skill(s) present`));
      } else {
        checks.push(
          fail('skills', 'Skills', requirement, `${matchedRequired.length}/${requiredNames.length} matched`, `Missing required skill(s): ${missingSkills.join(', ')}.`),
        );
      }
    } else if (matchedRequired.length > 0) {
      checks.push(pass('skills', 'Skills', requirement, `${matchedRequired.length} matching skill(s)`));
    } else {
      checks.push(
        fail('skills', 'Skills', requirement, 'No matching skills', `None of the required skills are on your profile (${requiredNames.join(', ')}).`),
      );
    }
  }

  const eligible = checks.every((item) => item.status === 'PASS' || item.status === 'SKIPPED');
  const reasons = checks
    .filter((item) => item.status === 'FAIL' || item.status === 'MISSING')
    .map((item) => item.detail ?? `${item.label}: ${item.observed}`);

  return {
    studentId: student.id,
    fullName: student.fullName,
    email: student.email,
    eligible,
    checks,
    matchedSkills,
    missingSkills,
    reasons,
    undergrad: undergrad
      ? {
          degree: undergrad.degree,
          branch: undergrad.branch,
          institution: undergrad.institution,
          passingYear: undergrad.passingYear,
          scoreType: undergrad.scoreType,
          scoreValue: undergrad.scoreValue,
          scoreScale: undergrad.scoreScale,
        }
      : null,
    class10Percentage: class10?.scoreValue ?? null,
    class12Percentage: class12?.scoreValue ?? null,
    activeBacklogs: student.activeBacklogs,
    experienceMonths,
    skills: student.skills.map((skill) => skill.name),
    shortlistStatus: null,
  };
}

export const buildSkillNameMap = (skills: { id: string; name: string }[]): Map<string, string> =>
  new Map(skills.map((skill) => [skill.id, skill.name]));
