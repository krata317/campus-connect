import { describe, expect, it } from 'vitest';
import {
  cn,
  employmentTypeLabel,
  formatDate,
  formatMonths,
  getCookie,
  relativeTime,
  scoreText,
  statusLabel,
  statusTone,
} from '@/lib/utils';

describe('scoreText', () => {
  it('distinguishes a percentage from a CGPA on a scale', () => {
    expect(scoreText('PERCENTAGE', 82.5, null)).toBe('82.5%');
    expect(scoreText('CGPA', 8.4, 10)).toBe('8.4 / 10 CGPA');
  });

  it('shows a CGPA without a scale rather than inventing one', () => {
    expect(scoreText('CGPA', 3.9, null)).toBe('3.9 CGPA');
  });

  it('renders a dash for a missing score instead of zero', () => {
    expect(scoreText('PERCENTAGE', null, null)).toBe('—');
  });
});

describe('formatMonths', () => {
  it('formats years and months together', () => {
    expect(formatMonths(15)).toBe('1 yr 3 mo');
    expect(formatMonths(24)).toBe('2 yr');
    expect(formatMonths(7)).toBe('7 mo');
  });

  it('treats zero and negative values as no experience', () => {
    expect(formatMonths(0)).toBe('0 months');
    expect(formatMonths(-3)).toBe('0 months');
  });
});

describe('statusLabel and statusTone', () => {
  it('maps every workflow status to a readable label', () => {
    expect(statusLabel('CHANGES_REQUESTED')).toBe('Changes requested');
    expect(statusLabel('PENDING')).toBe('Pending approval');
    expect(statusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });

  it('gives rejections a destructive tone and approvals a success tone', () => {
    expect(statusTone('REJECTED')).toBe('destructive');
    expect(statusTone('APPROVED')).toBe('success');
    expect(statusTone('UNKNOWN')).toBe('outline');
  });
});

describe('date helpers', () => {
  it('renders a dash for empty or invalid input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(relativeTime(undefined)).toBe('—');
  });

  it('describes recent timestamps relatively', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now');
    expect(relativeTime(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 min ago');
    expect(relativeTime(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())).toBe('3 h ago');
  });
});

describe('getCookie', () => {
  it('reads a cookie value and returns null when absent', () => {
    document.cookie = 'cc.csrf=abc123';
    expect(getCookie('cc.csrf')).toBe('abc123');
    expect(getCookie('missing')).toBeNull();
  });
});

describe('cn', () => {
  it('lets later Tailwind classes win over earlier conflicting ones', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });
});

describe('employmentTypeLabel', () => {
  it('turns an enum value into a readable label', () => {
    expect(employmentTypeLabel('FULL_TIME')).toBe('Full time');
    expect(employmentTypeLabel('INTERNSHIP')).toBe('Internship');
    expect(employmentTypeLabel(null)).toBe('—');
  });
});
