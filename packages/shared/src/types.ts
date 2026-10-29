export type Role = 'STUDENT' | 'RECRUITER' | 'INSTITUTE_ADMIN';

/**
 * An institute is the tenant boundary: its administrator, students, skills,
 * hiring requests and notifications all belong to exactly one institute.
 * The name, state and district are authoritative copies of the AISHE dataset.
 */
export interface Institute {
  id: string;
  aisheCode: string;
  name: string;
  state: string;
  district: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The minimal institute identity attached to an authenticated session. */
export interface InstituteSummary {
  id: string;
  name: string;
  aisheCode: string;
  state: string;
  district: string;
}

export type EducationLevel = 'CLASS_10' | 'CLASS_12' | 'UNDERGRAD' | 'POSTGRAD';

export type ScoreType = 'PERCENTAGE' | 'CGPA';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

export type ShortlistStatus = 'NONE' | 'DRAFT' | 'DISPATCHED';

export type SkillMode = 'ALL' | 'ANY';

export type EmploymentType = 'FULL_TIME' | 'INTERNSHIP' | 'PART_TIME' | 'CONTRACT';

export type EligibilityCheckStatus = 'PASS' | 'FAIL' | 'MISSING' | 'SKIPPED';

export type NotificationType = 'SHORTLIST';

export type RegistrationType = 'INSTITUTE' | 'RECRUITER';

export interface EducationRecord {
  id: string;
  level: EducationLevel;
  board: string | null;
  stream: string | null;
  degree: string | null;
  branch: string | null;
  institution: string | null;
  passingYear: number | null;
  scoreType: ScoreType | null;
  scoreValue: number | null;
  scoreScale: number | null;
}

export interface ExperienceRecord {
  id: string;
  organization: string;
  jobTitle: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface SkillSummary {
  id: string;
  name: string;
  active: boolean;
}

export interface StudentProfile {
  id: string;
  fullName: string;
  email: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  activeBacklogs: number | null;
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
  education: EducationRecord[];
  experiences: ExperienceRecord[];
  skills: SkillSummary[];
}

export interface JobCriteria {
  minClass10Percentage: number | null;
  minClass12Percentage: number | null;
  undergradScoreType: ScoreType | null;
  minUndergradScore: number | null;
  undergradScoreScale: number | null;
  allowedDegrees: string[];
  allowedBranches: string[];
  graduationYears: number[];
  maxActiveBacklogs: number | null;
  minExperienceMonths: number | null;
  skillMode: SkillMode;
  requiredSkillIds: string[];
  optionalSkillIds: string[];
}

export interface JobRole {
  id: string;
  title: string;
  description: string;
  location: string | null;
  employmentType: EmploymentType | null;
  registrationUrl: string;
  criteria: JobCriteria;
  status: RequestStatus;
  shortlistStatus: ShortlistStatus;
  shortlistedCount: number;
  dispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorRole: string;
  actorId: string;
  at: string;
}

export interface HiringRequest {
  id: string;
  title: string;
  assessmentInstructions: string | null;
  status: RequestStatus;
  /** The recruiter who submitted the request. */
  recruiterId: string;
  recruiterName: string;
  /** The institute the request was sent to. */
  instituteId: string;
  instituteName: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  roles: JobRole[];
  reviewEvents?: ReviewEvent[];
}

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  recruiterName: string;
  roleTitle: string;
  registrationUrl: string;
  createdAt: string;
  readAt: string | null;
  roleId: string;
  requestId: string;
}

export interface EligibilityCheck {
  key: string;
  label: string;
  status: EligibilityCheckStatus;
  requirement: string;
  observed: string;
  detail: string | null;
}

export interface CandidateEvaluation {
  studentId: string;
  fullName: string;
  email: string;
  eligible: boolean;
  checks: EligibilityCheck[];
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  undergrad: {
    degree: string | null;
    branch: string | null;
    institution: string | null;
    passingYear: number | null;
    scoreType: ScoreType | null;
    scoreValue: number | null;
    scoreScale: number | null;
  } | null;
  class10Percentage: number | null;
  class12Percentage: number | null;
  activeBacklogs: number | null;
  experienceMonths: number;
  skills: string[];
  shortlistStatus: ShortlistStatus | null;
}

/** The recruiter's own company details. A recruiter has no institute affiliation. */
export interface RecruiterProfile {
  id: string;
  email: string;
  companyName: string;
  website: string | null;
  contactPersonName: string;
  contactPhone: string;
  description: string | null;
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  displayName: string;
  username?: string;
  /** The institute this account belongs to. Resolved from the database on every request. */
  institute: InstituteSummary | null;
  emailNotifications: boolean;
}

export interface ProfileCompletion {
  percent: number;
  completed: number;
  total: number;
  missing: string[];
}

export interface StudentDashboard {
  profile: StudentProfile;
  completion: ProfileCompletion;
  unreadNotifications: number;
  recentNotifications: NotificationRecord[];
  totalNotifications: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InstituteStats {
  students: number;
  skills: number;
  requestsAwaitingReview: number;
  approvedRequests: number;
  notificationsSent: number;
  dispatches: number;
}

export interface InstituteStudentListItem {
  id: string;
  fullName: string;
  email: string;
  city: string | null;
  state: string | null;
  activeBacklogs: number | null;
  createdAt: string;
  undergradDegree: string | null;
  undergradBranch: string | null;
  undergradPassingYear: number | null;
  undergradScoreType: ScoreType | null;
  undergradScoreValue: number | null;
  undergradScoreScale: number | null;
  skillCount: number;
}

export interface DispatchSummary {
  roleId: string;
  roleTitle: string;
  requestId: string;
  requestTitle: string;
  recruiterName: string;
  dispatchedAt: string | null;
  recipientCount: number;
  readCount: number;
}

/** Returned by the AISHE lookup so the form can show the official record. */
export interface InstitutionLookup {
  aisheCode: string;
  name: string;
  state: string;
  district: string;
}

export interface RegistrationStartResult {
  pendingId: string;
  email: string;
  expiresAt: string;
  /** Present for institute registrations so the form can show the official record. */
  institution?: InstitutionLookup;
}

export interface RegistrationLinkInfo {
  type: RegistrationType;
  email: string;
  instituteName?: string;
  instituteState?: string;
  instituteDistrict?: string;
  aisheCode?: string;
  companyName?: string;
  expiresAt: string;
}

export interface StudentCodeView {
  /** Only shown immediately after generation or rotation; the server stores a hash. */
  code: string | null;
  updatedAt: string | null;
}
