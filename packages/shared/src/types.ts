export type Role = 'STUDENT' | 'ADMIN' | 'EMPLOYER';

/**
 * Every account, skill, hiring request and notification belongs to exactly one
 * College. The college is the tenant boundary for the whole application.
 */
export interface College {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The minimal college identity attached to an authenticated session. */
export interface CollegeSummary {
  id: string;
  name: string;
  slug: string;
}

export type EducationLevel = 'CLASS_10' | 'CLASS_12' | 'UNDERGRAD' | 'POSTGRAD';

export type ScoreType = 'PERCENTAGE' | 'CGPA';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type EmployerApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

export type ShortlistStatus = 'NONE' | 'DRAFT' | 'DISPATCHED';

export type SkillMode = 'ALL' | 'ANY';

export type EmploymentType = 'FULL_TIME' | 'INTERNSHIP' | 'PART_TIME' | 'CONTRACT';

export type EligibilityCheckStatus = 'PASS' | 'FAIL' | 'MISSING' | 'SKIPPED';

export type NotificationType = 'SHORTLIST';

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
  companyId: string;
  companyName: string;
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
  companyName: string;
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

export interface EmployerCompany {
  company: {
    id: string;
    name: string;
    website: string | null;
    contactPersonName: string;
    contactPhone: string;
    contactEmail: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
  account: {
    id: string;
    email: string;
    approvalStatus: EmployerApprovalStatus;
    reviewNote: string | null;
    reviewedAt: string | null;
  };
  reviewEvents: ReviewEvent[];
}

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  displayName: string;
  /** The college this account belongs to. Resolved from the database on every request. */
  college: CollegeSummary | null;
  employerApprovalStatus?: EmployerApprovalStatus;
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

export interface AdminStats {
  students: number;
  skills: number;
  pendingEmployers: number;
  approvedEmployers: number;
  requestsAwaitingReview: number;
  approvedRequests: number;
  notificationsSent: number;
  dispatches: number;
}

export interface AdminStudentListItem {
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
  companyName: string;
  dispatchedAt: string | null;
  recipientCount: number;
  readCount: number;
}
