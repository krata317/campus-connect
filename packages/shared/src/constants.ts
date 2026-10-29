/**
 * Copy shown wherever a historical record points at an account that has since
 * been deleted. The API returns `null` names plus a `*Deleted` flag; the UI
 * renders these strings so every surface says the same thing.
 */
export const DELETED_ACCOUNT_NOTICE = {
  STUDENT: 'This student no longer exists on the platform.',
  RECRUITER: 'This recruiter no longer exists on the platform.',
  INSTITUTE: 'This institute no longer exists on the platform.',
} as const;
