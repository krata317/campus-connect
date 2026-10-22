import { describe, expect, it } from 'vitest';
import type { RequestStatus } from '@campusconnect/shared';
import { canEdit, canSubmit, requiresNote, resolveReviewTransition, statusText } from '../../src/services/requestWorkflow';

const ALL_STATUSES: RequestStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'];

describe('resolveReviewTransition', () => {
  it('approves a submitted request', () => {
    const result = resolveReviewTransition('APPROVE', 'SUBMITTED');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transition.to).toBe('APPROVED');
      expect(result.transition.event).toBe('REQUEST_APPROVED');
    }
  });

  it('rejects a submitted or changes-requested request', () => {
    expect(resolveReviewTransition('REJECT', 'SUBMITTED').ok).toBe(true);
    expect(resolveReviewTransition('REJECT', 'CHANGES_REQUESTED').ok).toBe(true);
  });

  it('returns a submitted request for changes', () => {
    const result = resolveReviewTransition('REQUEST_CHANGES', 'SUBMITTED');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transition.to).toBe('CHANGES_REQUESTED');
  });

  it('refuses to approve a request that has already been approved', () => {
    const result = resolveReviewTransition('APPROVE', 'APPROVED');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('already been approved');
  });

  it('refuses to approve or request changes on a draft that was never submitted', () => {
    expect(resolveReviewTransition('APPROVE', 'DRAFT').ok).toBe(false);
    expect(resolveReviewTransition('REQUEST_CHANGES', 'DRAFT').ok).toBe(false);
  });

  it('refuses to review a rejected request', () => {
    expect(resolveReviewTransition('APPROVE', 'REJECTED').ok).toBe(false);
    expect(resolveReviewTransition('REJECT', 'REJECTED').ok).toBe(false);
  });

  it('only ever allows transitions into a legal next state', () => {
    const allowedTargets = new Set<RequestStatus>(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']);

    for (const status of ALL_STATUSES) {
      for (const action of ['APPROVE', 'REJECT', 'REQUEST_CHANGES'] as const) {
        const result = resolveReviewTransition(action, status);
        if (result.ok) {
          expect(allowedTargets.has(result.transition.to)).toBe(true);
          expect(result.transition.allowedFrom).toContain(status);
        }
      }
    }
  });
});

describe('canEdit / canSubmit', () => {
  it('allows edits only while a request is a draft or has been returned for changes', () => {
    expect(canEdit('DRAFT')).toBe(true);
    expect(canEdit('CHANGES_REQUESTED')).toBe(true);
    expect(canEdit('SUBMITTED')).toBe(false);
    expect(canEdit('APPROVED')).toBe(false);
    expect(canEdit('REJECTED')).toBe(false);
  });

  it('allows submission only from a draft or a changes-requested state', () => {
    expect(canSubmit('DRAFT')).toBe(true);
    expect(canSubmit('CHANGES_REQUESTED')).toBe(true);
    expect(canSubmit('SUBMITTED')).toBe(false);
    expect(canSubmit('APPROVED')).toBe(false);
  });
});

describe('requiresNote', () => {
  it('requires a note for rejections and change requests but not for approvals', () => {
    expect(requiresNote('APPROVE')).toBe(false);
    expect(requiresNote('REJECT')).toBe(true);
    expect(requiresNote('REQUEST_CHANGES')).toBe(true);
  });
});

describe('statusText', () => {
  it('renders a human readable label for every status', () => {
    expect(statusText('DRAFT')).toBe('draft');
    expect(statusText('CHANGES_REQUESTED')).toBe('changes requested');
    expect(statusText('REJECTED')).toBe('rejected');
  });
});
