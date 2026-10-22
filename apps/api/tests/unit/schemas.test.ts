import { describe, expect, it } from 'vitest';
import {
  class10Schema,
  dispatchSchema,
  emailSchema,
  experienceSchema,
  httpUrlSchema,
  jobCriteriaSchema,
  passwordSchema,
  reviewDecisionSchema,
  undergradSchema,
} from '@campusconnect/shared';

/** Collects the field paths that failed validation, for readable assertions. */
const errorPaths = (result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }): string[] =>
  result.success || !result.error ? [] : result.error.issues.map((issue) => issue.path.join('.'));

describe('emailSchema', () => {
  it('normalises the address to lower case and trims it', () => {
    const result = emailSchema.safeParse('  Asha.Verma@Example.EDU  ');

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('asha.verma@example.edu');
  });

  it('rejects a malformed address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
  });

  it('accepts an 8 character password', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
  });

  it('rejects passwords longer than 72 characters (bcrypt truncation limit)', () => {
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
  });
});

describe('httpUrlSchema', () => {
  it('accepts http and https URLs', () => {
    expect(httpUrlSchema.safeParse('https://careers.example.com/apply').success).toBe(true);
    expect(httpUrlSchema.safeParse('http://careers.example.com/apply').success).toBe(true);
  });

  it('rejects non-http protocols and relative paths', () => {
    expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(httpUrlSchema.safeParse('ftp://example.com').success).toBe(false);
    expect(httpUrlSchema.safeParse('/apply/here').success).toBe(false);
    expect(httpUrlSchema.safeParse('example.com').success).toBe(false);
  });
});

describe('undergradSchema score rules', () => {
  const base = { degree: 'B.Tech', branch: 'CSE', institution: 'NIT', passingYear: 2026 };

  it('accepts a percentage within range', () => {
    expect(undergradSchema.safeParse({ ...base, scoreType: 'PERCENTAGE', scoreValue: 82, scoreScale: null }).success).toBe(true);
  });

  it('rejects a percentage above 100', () => {
    const result = undergradSchema.safeParse({ ...base, scoreType: 'PERCENTAGE', scoreValue: 120, scoreScale: null });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('scoreValue');
  });

  it('requires a scale for a CGPA score', () => {
    const result = undergradSchema.safeParse({ ...base, scoreType: 'CGPA', scoreValue: 8.2, scoreScale: null });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('scoreScale');
  });

  it('rejects a CGPA that exceeds its own scale', () => {
    const result = undergradSchema.safeParse({ ...base, scoreType: 'CGPA', scoreValue: 9.4, scoreScale: 4 });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('scoreValue');
  });

  it('ignores unknown keys so the UI can post a wider form payload', () => {
    const result = undergradSchema.safeParse({
      ...base,
      scoreType: 'CGPA',
      scoreValue: 8.2,
      scoreScale: 10,
      confirmPassword: 'irrelevant',
    });

    expect(result.success).toBe(true);
  });
});

describe('class10Schema', () => {
  it('requires a board and a passing year', () => {
    const result = class10Schema.safeParse({ board: '', passingYear: 2018, scoreValue: 88 });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('board');
  });

  it('rejects a percentage above 100', () => {
    expect(class10Schema.safeParse({ board: 'CBSE', passingYear: 2018, scoreValue: 101 }).success).toBe(false);
  });
});

describe('experienceSchema', () => {
  const base = { organization: 'Acme', jobTitle: 'Intern', startDate: '2023-01' };

  it('requires an end date when the role is not current', () => {
    const result = experienceSchema.safeParse({ ...base, endDate: null, isCurrent: false });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('endDate');
  });

  it('accepts an open-ended role when marked as current', () => {
    expect(experienceSchema.safeParse({ ...base, endDate: null, isCurrent: true }).success).toBe(true);
  });

  it('rejects an end date earlier than the start date', () => {
    const result = experienceSchema.safeParse({ ...base, endDate: '2022-12', isCurrent: false });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('endDate');
  });

  it('rejects a malformed month', () => {
    expect(experienceSchema.safeParse({ ...base, startDate: '2023-13', endDate: '2023-14', isCurrent: false }).success).toBe(false);
  });
});

describe('jobCriteriaSchema', () => {
  it('applies sensible defaults for an otherwise empty criteria payload', () => {
    const result = jobCriteriaSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skillMode).toBe('ALL');
      expect(result.data.allowedDegrees).toEqual([]);
      expect(result.data.minClass10Percentage).toBeNull();
    }
  });

  it('rejects a minimum score without a score type', () => {
    const result = jobCriteriaSchema.safeParse({ minUndergradScore: 70 });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('undergradScoreType');
  });

  it('rejects a CGPA requirement without a scale', () => {
    const result = jobCriteriaSchema.safeParse({ undergradScoreType: 'CGPA', minUndergradScore: 7 });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('undergradScoreScale');
  });

  it('rejects a minimum CGPA larger than the scale', () => {
    const result = jobCriteriaSchema.safeParse({ undergradScoreType: 'CGPA', minUndergradScore: 9, undergradScoreScale: 4 });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('minUndergradScore');
  });

  it('rejects a percentage requirement above 100', () => {
    const result = jobCriteriaSchema.safeParse({ undergradScoreType: 'PERCENTAGE', minUndergradScore: 120 });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('minUndergradScore');
  });

  it('rejects a skill listed as both required and preferred', () => {
    const result = jobCriteriaSchema.safeParse({ requiredSkillIds: ['sk_1'], optionalSkillIds: ['sk_1'] });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('optionalSkillIds');
  });
});

describe('dispatchSchema', () => {
  it('requires at least one selected student', () => {
    expect(dispatchSchema.safeParse({ studentIds: [] }).success).toBe(false);
    expect(dispatchSchema.safeParse({ studentIds: ['stu_1'] }).success).toBe(true);
  });
});

describe('reviewDecisionSchema', () => {
  it('accepts only the three review actions', () => {
    expect(reviewDecisionSchema.safeParse({ action: 'APPROVE' }).success).toBe(true);
    expect(reviewDecisionSchema.safeParse({ action: 'DELETE' }).success).toBe(false);
  });
});
