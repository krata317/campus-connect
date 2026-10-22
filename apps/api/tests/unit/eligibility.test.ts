import { describe, expect, it } from 'vitest';
import { emptyCriteria } from '@campusconnect/shared';
import type { EducationRecord, ExperienceRecord, JobCriteria, ScoreType } from '@campusconnect/shared';
import { buildSkillNameMap, evaluateCandidate, type EvaluationProfile } from '../../src/services/eligibility.service';

const education = (overrides: Partial<EducationRecord> & Pick<EducationRecord, 'level'>): EducationRecord => ({
  id: `edu_${overrides.level}`,
  board: null,
  stream: null,
  degree: null,
  branch: null,
  institution: null,
  passingYear: null,
  scoreType: 'PERCENTAGE' as ScoreType,
  scoreValue: null,
  scoreScale: null,
  ...overrides,
});

const experience = (startDate: string, endDate: string | null, isCurrent = false): ExperienceRecord => ({
  id: `exp_${startDate}`,
  organization: 'Acme',
  jobTitle: 'Intern',
  startDate,
  endDate,
  isCurrent,
  description: null,
});

const student = (overrides: Partial<EvaluationProfile> = {}): EvaluationProfile => ({
  id: 'stu_1',
  fullName: 'Asha Verma',
  email: 'asha@example.edu',
  activeBacklogs: 0,
  education: [],
  experiences: [],
  skills: [],
  ...overrides,
});

const criteria = (overrides: Partial<JobCriteria> = {}): JobCriteria => ({ ...emptyCriteria(), ...overrides });

const checkFor = (result: ReturnType<typeof evaluateCandidate>, key: string) => {
  const found = result.checks.find((item) => item.key === key);
  if (!found) throw new Error(`No check produced for key "${key}"`);
  return found;
};

describe('evaluateCandidate — baseline behaviour', () => {
  it('skips every check and marks the candidate eligible when the role has no criteria', () => {
    const result = evaluateCandidate(student(), criteria(), new Map());

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks.every((item) => item.status === 'SKIPPED')).toBe(true);
  });

  it('returns a check for every supported criterion so the admin can see the full picture', () => {
    const result = evaluateCandidate(student(), criteria(), new Map());
    const keys = result.checks.map((item) => item.key);

    expect(keys).toEqual([
      'class10',
      'class12',
      'undergradScore',
      'degree',
      'branch',
      'graduationYear',
      'backlogs',
      'experience',
      'skills',
    ]);
  });
});

describe('evaluateCandidate — missing data never auto-qualifies', () => {
  it('reports MISSING (not PASS) when a required Class 10 percentage is absent', () => {
    const result = evaluateCandidate(student(), criteria({ minClass10Percentage: 60 }), new Map());
    const check = checkFor(result, 'class10');

    expect(check.status).toBe('MISSING');
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain('Class 10');
  });

  it('reports MISSING when the Class 10 record exists but has no score', () => {
    const result = evaluateCandidate(
      student({ education: [education({ level: 'CLASS_10', scoreValue: null })] }),
      criteria({ minClass10Percentage: 60 }),
      new Map(),
    );

    expect(checkFor(result, 'class10').status).toBe('MISSING');
  });

  it('reports MISSING when the undergraduate record is missing entirely', () => {
    const result = evaluateCandidate(student(), criteria({ allowedDegrees: ['B.Tech'] }), new Map());

    expect(checkFor(result, 'degree').status).toBe('MISSING');
    expect(result.eligible).toBe(false);
  });

  it('distinguishes an unknown backlog count from a genuine zero', () => {
    const unknown = evaluateCandidate(student({ activeBacklogs: null }), criteria({ maxActiveBacklogs: 0 }), new Map());
    const zero = evaluateCandidate(student({ activeBacklogs: 0 }), criteria({ maxActiveBacklogs: 0 }), new Map());

    expect(checkFor(unknown, 'backlogs').status).toBe('MISSING');
    expect(unknown.eligible).toBe(false);

    expect(checkFor(zero, 'backlogs').status).toBe('PASS');
    expect(zero.eligible).toBe(true);
  });
});

describe('evaluateCandidate — score thresholds', () => {
  it('passes a Class 10 percentage exactly on the threshold', () => {
    const result = evaluateCandidate(
      student({ education: [education({ level: 'CLASS_10', scoreValue: 60 })] }),
      criteria({ minClass10Percentage: 60 }),
      new Map(),
    );

    expect(checkFor(result, 'class10').status).toBe('PASS');
  });

  it('fails a Class 12 percentage below the threshold and explains the gap', () => {
    const result = evaluateCandidate(
      student({ education: [education({ level: 'CLASS_12', scoreValue: 54.5 })] }),
      criteria({ minClass12Percentage: 60 }),
      new Map(),
    );

    const check = checkFor(result, 'class12');
    expect(check.status).toBe('FAIL');
    expect(check.observed).toBe('54.5%');
    expect(check.detail).toContain('below the required 60%');
  });

  it('fails an undergraduate CGPA below the threshold on a matching scale', () => {
    const result = evaluateCandidate(
      student({
        education: [education({ level: 'UNDERGRAD', scoreType: 'CGPA', scoreValue: 6.4, scoreScale: 10 })],
      }),
      criteria({ undergradScoreType: 'CGPA', minUndergradScore: 7, undergradScoreScale: 10 }),
      new Map(),
    );

    const check = checkFor(result, 'undergradScore');
    expect(check.status).toBe('FAIL');
    expect(check.observed).toBe('6.4 / 10 CGPA');
  });
});

describe('evaluateCandidate — no cross-unit score comparison', () => {
  it('reports MISSING instead of comparing a percentage against a CGPA requirement', () => {
    const result = evaluateCandidate(
      student({
        education: [education({ level: 'UNDERGRAD', scoreType: 'PERCENTAGE', scoreValue: 82, scoreScale: null })],
      }),
      criteria({ undergradScoreType: 'CGPA', minUndergradScore: 7, undergradScoreScale: 10 }),
      new Map(),
    );

    const check = checkFor(result, 'undergradScore');
    expect(check.status).toBe('MISSING');
    expect(check.detail).toContain('does not convert');
    expect(result.eligible).toBe(false);
  });

  it('reports MISSING instead of comparing a CGPA against a percentage requirement', () => {
    const result = evaluateCandidate(
      student({
        education: [education({ level: 'UNDERGRAD', scoreType: 'CGPA', scoreValue: 8.2, scoreScale: 10 })],
      }),
      criteria({ undergradScoreType: 'PERCENTAGE', minUndergradScore: 70 }),
      new Map(),
    );

    expect(checkFor(result, 'undergradScore').status).toBe('MISSING');
  });

  it('reports MISSING when CGPA scales differ, even if the number would pass', () => {
    const result = evaluateCandidate(
      student({
        education: [education({ level: 'UNDERGRAD', scoreType: 'CGPA', scoreValue: 3.9, scoreScale: 4 })],
      }),
      criteria({ undergradScoreType: 'CGPA', minUndergradScore: 3.5, undergradScoreScale: 10 }),
      new Map(),
    );

    const check = checkFor(result, 'undergradScore');
    expect(check.status).toBe('MISSING');
    expect(check.detail).toContain('not converted automatically');
  });
});

describe('evaluateCandidate — categorical criteria', () => {
  it('matches degrees and branches case-insensitively', () => {
    const result = evaluateCandidate(
      student({ education: [education({ level: 'UNDERGRAD', degree: 'b.tech', branch: 'Computer Science' })] }),
      criteria({ allowedDegrees: ['B.Tech'], allowedBranches: ['computer science'] }),
      new Map(),
    );

    expect(checkFor(result, 'degree').status).toBe('PASS');
    expect(checkFor(result, 'branch').status).toBe('PASS');
  });

  it('fails a degree that is not on the allowed list', () => {
    const result = evaluateCandidate(
      student({ education: [education({ level: 'UNDERGRAD', degree: 'B.Com' })] }),
      criteria({ allowedDegrees: ['B.Tech'] }),
      new Map(),
    );

    const check = checkFor(result, 'degree');
    expect(check.status).toBe('FAIL');
    expect(check.detail).toContain('B.Com');
  });

  it('accepts a graduation year inside the allowed list and rejects one outside it', () => {
    const profile = student({ education: [education({ level: 'UNDERGRAD', passingYear: 2026 })] });

    expect(checkFor(evaluateCandidate(profile, criteria({ graduationYears: [2025, 2026] }), new Map()), 'graduationYear').status).toBe('PASS');
    expect(checkFor(evaluateCandidate(profile, criteria({ graduationYears: [2024] }), new Map()), 'graduationYear').status).toBe('FAIL');
  });
});

describe('evaluateCandidate — experience', () => {
  it('passes a zero-month requirement with no recorded experience', () => {
    const result = evaluateCandidate(student(), criteria({ minExperienceMonths: 0 }), new Map());

    expect(checkFor(result, 'experience').status).toBe('PASS');
    expect(result.experienceMonths).toBe(0);
  });

  it('fails when recorded experience is below the requirement', () => {
    const result = evaluateCandidate(
      student({ experiences: [experience('2024-01', '2024-04')] }),
      criteria({ minExperienceMonths: 12 }),
      new Map(),
    );

    const check = checkFor(result, 'experience');
    expect(check.status).toBe('FAIL');
    expect(result.experienceMonths).toBe(4);
    expect(check.detail).toContain('4 months');
  });

  it('counts overlapping roles once', () => {
    const result = evaluateCandidate(
      student({
        experiences: [experience('2023-01', '2023-12'), experience('2023-06', '2024-03')],
      }),
      criteria({ minExperienceMonths: 1 }),
      new Map(),
    );

    // Jan 2023 through Mar 2024 inclusive = 15 distinct months.
    expect(result.experienceMonths).toBe(15);
  });
});

describe('evaluateCandidate — skills', () => {
  const names = buildSkillNameMap([
    { id: 'sk_js', name: 'JavaScript' },
    { id: 'sk_sql', name: 'SQL' },
    { id: 'sk_go', name: 'Go' },
  ]);

  it('requires every skill in ALL mode', () => {
    const result = evaluateCandidate(
      student({ skills: [{ id: 'sk_js', name: 'JavaScript' }] }),
      criteria({ skillMode: 'ALL', requiredSkillIds: ['sk_js', 'sk_sql'] }),
      names,
    );

    const check = checkFor(result, 'skills');
    expect(check.status).toBe('FAIL');
    expect(result.matchedSkills).toEqual(['JavaScript']);
    expect(result.missingSkills).toEqual(['SQL']);
    expect(check.detail).toContain('SQL');
  });

  it('passes when every required skill is present in ALL mode', () => {
    const result = evaluateCandidate(
      student({
        skills: [
          { id: 'sk_js', name: 'JavaScript' },
          { id: 'sk_sql', name: 'SQL' },
        ],
      }),
      criteria({ skillMode: 'ALL', requiredSkillIds: ['sk_js', 'sk_sql'] }),
      names,
    );

    expect(checkFor(result, 'skills').status).toBe('PASS');
    expect(result.missingSkills).toEqual([]);
  });

  it('accepts a single match in ANY mode', () => {
    const result = evaluateCandidate(
      student({ skills: [{ id: 'sk_sql', name: 'SQL' }] }),
      criteria({ skillMode: 'ANY', requiredSkillIds: ['sk_js', 'sk_sql'] }),
      names,
    );

    expect(checkFor(result, 'skills').status).toBe('PASS');
    expect(result.eligible).toBe(true);
  });

  it('reports optional skills separately from required ones', () => {
    const result = evaluateCandidate(
      student({
        skills: [
          { id: 'sk_js', name: 'JavaScript' },
          { id: 'sk_go', name: 'Go' },
        ],
      }),
      criteria({ skillMode: 'ALL', requiredSkillIds: ['sk_js'], optionalSkillIds: ['sk_go', 'sk_sql'] }),
      names,
    );

    expect(result.matchedSkills).toEqual(['JavaScript', 'Go']);
    expect(result.missingSkills).toEqual([]);
    expect(result.eligible).toBe(true);
  });

  it('skips the skills check when no skills are required', () => {
    const result = evaluateCandidate(student(), criteria(), names);
    expect(checkFor(result, 'skills').status).toBe('SKIPPED');
  });
});

describe('evaluateCandidate — explainability', () => {
  it('collects one reason per failed or missing check and none for passing checks', () => {
    const result = evaluateCandidate(
      student({
        activeBacklogs: 2,
        education: [
          education({ level: 'CLASS_10', scoreValue: 80 }),
          education({ level: 'UNDERGRAD', degree: 'B.Tech', branch: 'IT', passingYear: 2026, scoreValue: 7.5, scoreScale: 10, scoreType: 'CGPA' }),
        ],
      }),
      criteria({ minClass10Percentage: 60, maxActiveBacklogs: 0, graduationYears: [2025] }),
      new Map(),
    );

    expect(result.eligible).toBe(false);
    // class10 passes, graduation year fails, backlogs fail -> exactly two reasons.
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.some((reason) => reason.includes('backlog'))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('graduation year'))).toBe(true);
  });

  it('never marks a candidate eligible while a check is MISSING', () => {
    const result = evaluateCandidate(
      student({ education: [education({ level: 'CLASS_10', scoreValue: 90 })] }),
      criteria({ minClass10Percentage: 60, minClass12Percentage: 60 }),
      new Map(),
    );

    expect(checkFor(result, 'class10').status).toBe('PASS');
    expect(checkFor(result, 'class12').status).toBe('MISSING');
    expect(result.eligible).toBe(false);
  });
});
