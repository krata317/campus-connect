import { describe, expect, it } from 'vitest';
import { collegeSlugSchema, normalizeCollegeSlug } from '@campusconnect/shared';

describe('college slug rules', () => {
  it('normalises a human-entered name into a stable tenant identifier', () => {
    expect(normalizeCollegeSlug('  Northfield Institute of Technology  ')).toBe('northfield-institute-of-technology');
    expect(normalizeCollegeSlug('Lakeside College — Main Campus')).toBe('lakeside-college-main-campus');
    expect(normalizeCollegeSlug('CSE/IT Block')).toBe('cse-it-block');
    expect(normalizeCollegeSlug('---Already---Dashed---')).toBe('already-dashed');
  });

  it('collapses runs of separators into a single hyphen', () => {
    expect(normalizeCollegeSlug('a   b')).toBe('a-b');
    expect(normalizeCollegeSlug('a---b')).toBe('a-b');
  });

  it('accepts a valid slug and returns the normalised value', () => {
    const parsed = collegeSlugSchema.parse('Northfield Institute');
    expect(parsed).toBe('northfield-institute');
  });

  it('rejects a slug that normalises to nothing usable', () => {
    expect(collegeSlugSchema.safeParse('---').success).toBe(false);
    expect(collegeSlugSchema.safeParse('!').success).toBe(false);
    expect(collegeSlugSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects a slug that is too long after normalisation', () => {
    expect(collegeSlugSchema.safeParse('a'.repeat(51)).success).toBe(false);
    expect(collegeSlugSchema.safeParse('a'.repeat(50)).success).toBe(true);
  });

  it('strips characters that would be unsafe in a URL or a query', () => {
    // The normalised value can never contain a quote, slash or whitespace.
    const parsed = collegeSlugSchema.parse("St. Mary's / Arts");
    expect(parsed).toBe('st-mary-s-arts');
    expect(parsed).toMatch(/^[a-z0-9-]+$/);
  });
});
