import type { RequestStatus } from '@campusconnect/shared';

export type ReviewAction = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export interface ReviewTransition {
  allowedFrom: RequestStatus[];
  to: RequestStatus;
  event: string;
  label: string;
}

export const REVIEW_TRANSITIONS: Record<ReviewAction, ReviewTransition> = {
  APPROVE: { allowedFrom: ['SUBMITTED'], to: 'APPROVED', event: 'REQUEST_APPROVED', label: 'approved' },
  REJECT: { allowedFrom: ['SUBMITTED', 'CHANGES_REQUESTED'], to: 'REJECTED', event: 'REQUEST_REJECTED', label: 'rejected' },
  REQUEST_CHANGES: {
    allowedFrom: ['SUBMITTED'],
    to: 'CHANGES_REQUESTED',
    event: 'REQUEST_CHANGES_REQUESTED',
    label: 'returned for changes',
  },
};

export const EDITABLE_STATUSES: RequestStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];
export const SUBMITTABLE_STATUSES: RequestStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];

export const statusText = (status: RequestStatus): string => status.toLowerCase().replace('_', ' ');

export const requiresNote = (action: ReviewAction): boolean => action !== 'APPROVE';

export function resolveReviewTransition(
  action: ReviewAction,
  current: RequestStatus,
): { ok: true; transition: ReviewTransition } | { ok: false; reason: string } {
  const transition = REVIEW_TRANSITIONS[action];
  if (!transition) {
    return { ok: false, reason: 'Unknown review action' };
  }
  if (current === transition.to) {
    return { ok: false, reason: `This request has already been ${transition.label}.` };
  }
  if (!transition.allowedFrom.includes(current)) {
    return { ok: false, reason: `A request that is ${statusText(current)} cannot be ${transition.label}.` };
  }
  return { ok: true, transition };
}

export function canEdit(status: RequestStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function canSubmit(status: RequestStatus): boolean {
  return SUBMITTABLE_STATUSES.includes(status);
}
