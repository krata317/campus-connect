import { writeQuery } from './neo4j';

interface SchemaStatement {
  name: string;
  statement: string;
}

/**
 * Graph model
 * -----------
 * `Institute` is the tenant root. Everything an institute owns carries an
 * `instituteId` property (cheap scoping predicate) *and* a relationship to the
 * Institute node (explicit ownership). Both are written in the same transaction
 * that creates the record.
 *
 *   (InstituteAdmin)-[:ADMINISTERS]->(Institute)
 *   (Student)-[:BELONGS_TO]->(Institute)
 *   (Skill)-[:BELONGS_TO]->(Institute)
 *   (HiringRequest)-[:SENT_TO]->(Institute)
 *
 * Recruiters are deliberately *not* affiliated with an institute. A recruiter
 * owns the requests it submits and may address requests to any institute:
 *
 *   (Recruiter)-[:SUBMITTED]->(HiringRequest)-[:CONTAINS_ROLE]->(JobRole)
 *
 * Pending registrations and password resets are short-lived verification
 * records; they store only hashes of the OTP and of the link token.
 */

const constraints: SchemaStatement[] = [
  { name: 'institute_id_unique', statement: 'CREATE CONSTRAINT institute_id_unique IF NOT EXISTS FOR (n:Institute) REQUIRE n.id IS UNIQUE' },
  {
    name: 'institute_aishe_unique',
    statement: 'CREATE CONSTRAINT institute_aishe_unique IF NOT EXISTS FOR (n:Institute) REQUIRE n.aisheCode IS UNIQUE',
  },
  {
    name: 'institute_admin_id_unique',
    statement: 'CREATE CONSTRAINT institute_admin_id_unique IF NOT EXISTS FOR (n:InstituteAdmin) REQUIRE n.id IS UNIQUE',
  },
  {
    name: 'institute_admin_email_unique',
    statement: 'CREATE CONSTRAINT institute_admin_email_unique IF NOT EXISTS FOR (n:InstituteAdmin) REQUIRE n.email IS UNIQUE',
  },
  {
    name: 'institute_admin_username_unique',
    statement: 'CREATE CONSTRAINT institute_admin_username_unique IF NOT EXISTS FOR (n:InstituteAdmin) REQUIRE n.username IS UNIQUE',
  },
  { name: 'student_id_unique', statement: 'CREATE CONSTRAINT student_id_unique IF NOT EXISTS FOR (n:Student) REQUIRE n.id IS UNIQUE' },
  { name: 'student_email_unique', statement: 'CREATE CONSTRAINT student_email_unique IF NOT EXISTS FOR (n:Student) REQUIRE n.email IS UNIQUE' },
  { name: 'recruiter_id_unique', statement: 'CREATE CONSTRAINT recruiter_id_unique IF NOT EXISTS FOR (n:Recruiter) REQUIRE n.id IS UNIQUE' },
  { name: 'recruiter_email_unique', statement: 'CREATE CONSTRAINT recruiter_email_unique IF NOT EXISTS FOR (n:Recruiter) REQUIRE n.email IS UNIQUE' },
  {
    name: 'recruiter_username_unique',
    statement: 'CREATE CONSTRAINT recruiter_username_unique IF NOT EXISTS FOR (n:Recruiter) REQUIRE n.username IS UNIQUE',
  },
  // Normalised company name uniqueness (trimmed, whitespace-collapsed, lower-cased).
  {
    name: 'recruiter_companykey_unique',
    statement: 'CREATE CONSTRAINT recruiter_companykey_unique IF NOT EXISTS FOR (n:Recruiter) REQUIRE n.companyNameKey IS UNIQUE',
  },
  { name: 'skill_id_unique', statement: 'CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (n:Skill) REQUIRE n.id IS UNIQUE' },
  // Skill names are unique *per institute*: two institutes may each catalogue
  // "Python" without colliding, but one institute cannot hold it twice.
  {
    name: 'skill_institute_namekey_unique',
    statement: 'CREATE CONSTRAINT skill_institute_namekey_unique IF NOT EXISTS FOR (n:Skill) REQUIRE (n.instituteId, n.nameKey) IS UNIQUE',
  },
  { name: 'education_id_unique', statement: 'CREATE CONSTRAINT education_id_unique IF NOT EXISTS FOR (n:Education) REQUIRE n.id IS UNIQUE' },
  { name: 'experience_id_unique', statement: 'CREATE CONSTRAINT experience_id_unique IF NOT EXISTS FOR (n:Experience) REQUIRE n.id IS UNIQUE' },
  {
    name: 'request_id_unique',
    statement: 'CREATE CONSTRAINT request_id_unique IF NOT EXISTS FOR (n:HiringRequest) REQUIRE n.id IS UNIQUE',
  },
  { name: 'role_id_unique', statement: 'CREATE CONSTRAINT role_id_unique IF NOT EXISTS FOR (n:JobRole) REQUIRE n.id IS UNIQUE' },
  {
    name: 'notification_id_unique',
    statement: 'CREATE CONSTRAINT notification_id_unique IF NOT EXISTS FOR (n:Notification) REQUIRE n.id IS UNIQUE',
  },
  {
    name: 'review_event_id_unique',
    statement: 'CREATE CONSTRAINT review_event_id_unique IF NOT EXISTS FOR (n:ReviewEvent) REQUIRE n.id IS UNIQUE',
  },
  { name: 'session_sid_unique', statement: 'CREATE CONSTRAINT session_sid_unique IF NOT EXISTS FOR (n:Session) REQUIRE n.sid IS UNIQUE' },
  {
    name: 'pending_registration_id_unique',
    statement: 'CREATE CONSTRAINT pending_registration_id_unique IF NOT EXISTS FOR (n:PendingRegistration) REQUIRE n.id IS UNIQUE',
  },
  // One live pending registration per institute code or per company name.
  {
    name: 'pending_registration_key_unique',
    statement: 'CREATE CONSTRAINT pending_registration_key_unique IF NOT EXISTS FOR (n:PendingRegistration) REQUIRE n.pendingKey IS UNIQUE',
  },
  {
    name: 'password_reset_token_unique',
    statement: 'CREATE CONSTRAINT password_reset_token_unique IF NOT EXISTS FOR (n:PasswordReset) REQUIRE n.tokenHash IS UNIQUE',
  },
  {
    name: 'bootstrap_lock_id_unique',
    statement: 'CREATE CONSTRAINT bootstrap_lock_id_unique IF NOT EXISTS FOR (n:BootstrapLock) REQUIRE n.id IS UNIQUE',
  },
];

const indexes: SchemaStatement[] = [
  { name: 'institute_active_idx', statement: 'CREATE INDEX institute_active_idx IF NOT EXISTS FOR (n:Institute) ON (n.active)' },
  { name: 'institute_name_idx', statement: 'CREATE INDEX institute_name_idx IF NOT EXISTS FOR (n:Institute) ON (n.name)' },
  { name: 'institute_state_idx', statement: 'CREATE INDEX institute_state_idx IF NOT EXISTS FOR (n:Institute) ON (n.state)' },
  { name: 'student_fullname_idx', statement: 'CREATE INDEX student_fullname_idx IF NOT EXISTS FOR (n:Student) ON (n.fullName)' },
  { name: 'student_created_idx', statement: 'CREATE INDEX student_created_idx IF NOT EXISTS FOR (n:Student) ON (n.createdAt)' },
  { name: 'student_institute_idx', statement: 'CREATE INDEX student_institute_idx IF NOT EXISTS FOR (n:Student) ON (n.instituteId)' },
  { name: 'admin_institute_idx', statement: 'CREATE INDEX admin_institute_idx IF NOT EXISTS FOR (n:InstituteAdmin) ON (n.instituteId)' },
  { name: 'skill_institute_idx', statement: 'CREATE INDEX skill_institute_idx IF NOT EXISTS FOR (n:Skill) ON (n.instituteId)' },
  { name: 'skill_active_idx', statement: 'CREATE INDEX skill_active_idx IF NOT EXISTS FOR (n:Skill) ON (n.active)' },
  { name: 'request_institute_idx', statement: 'CREATE INDEX request_institute_idx IF NOT EXISTS FOR (n:HiringRequest) ON (n.instituteId)' },
  { name: 'request_recruiter_idx', statement: 'CREATE INDEX request_recruiter_idx IF NOT EXISTS FOR (n:HiringRequest) ON (n.recruiterId)' },
  { name: 'request_status_idx', statement: 'CREATE INDEX request_status_idx IF NOT EXISTS FOR (n:HiringRequest) ON (n.status)' },
  { name: 'role_institute_idx', statement: 'CREATE INDEX role_institute_idx IF NOT EXISTS FOR (n:JobRole) ON (n.instituteId)' },
  { name: 'role_status_idx', statement: 'CREATE INDEX role_status_idx IF NOT EXISTS FOR (n:JobRole) ON (n.status)' },
  { name: 'notification_institute_idx', statement: 'CREATE INDEX notification_institute_idx IF NOT EXISTS FOR (n:Notification) ON (n.instituteId)' },
  { name: 'notification_created_idx', statement: 'CREATE INDEX notification_created_idx IF NOT EXISTS FOR (n:Notification) ON (n.createdAt)' },
  { name: 'pending_registration_email_idx', statement: 'CREATE INDEX pending_registration_email_idx IF NOT EXISTS FOR (n:PendingRegistration) ON (n.email)' },
  { name: 'pending_registration_token_idx', statement: 'CREATE INDEX pending_registration_token_idx IF NOT EXISTS FOR (n:PendingRegistration) ON (n.tokenHash)' },
  { name: 'password_reset_account_idx', statement: 'CREATE INDEX password_reset_account_idx IF NOT EXISTS FOR (n:PasswordReset) ON (n.accountId)' },
  { name: 'session_expiry_idx', statement: 'CREATE INDEX session_expiry_idx IF NOT EXISTS FOR (n:Session) ON (n.expiresAt)' },
];

/**
 * Constraints and indexes from the previous (college / employer) model. Dropping
 * them is safe and idempotent, and keeps `db:init` usable on a database created
 * by an older version.
 */
const obsolete: SchemaStatement[] = [
  { name: 'college_id_unique', statement: 'DROP CONSTRAINT college_id_unique IF EXISTS' },
  { name: 'college_slug_unique', statement: 'DROP CONSTRAINT college_slug_unique IF EXISTS' },
  { name: 'admin_id_unique', statement: 'DROP CONSTRAINT admin_id_unique IF EXISTS' },
  { name: 'admin_email_unique', statement: 'DROP CONSTRAINT admin_email_unique IF EXISTS' },
  { name: 'employer_id_unique', statement: 'DROP CONSTRAINT employer_id_unique IF EXISTS' },
  { name: 'employer_email_unique', statement: 'DROP CONSTRAINT employer_email_unique IF EXISTS' },
  { name: 'company_id_unique', statement: 'DROP CONSTRAINT company_id_unique IF EXISTS' },
  { name: 'skill_college_namekey_unique', statement: 'DROP CONSTRAINT skill_college_namekey_unique IF EXISTS' },
  { name: 'skill_namekey_unique', statement: 'DROP CONSTRAINT skill_namekey_unique IF EXISTS' },
];

const obsoleteIndexes: SchemaStatement[] = [
  { name: 'college_slug_idx', statement: 'DROP INDEX college_slug_idx IF EXISTS' },
  { name: 'college_active_idx', statement: 'DROP INDEX college_active_idx IF EXISTS' },
  { name: 'student_college_idx', statement: 'DROP INDEX student_college_idx IF EXISTS' },
  { name: 'admin_college_idx', statement: 'DROP INDEX admin_college_idx IF EXISTS' },
  { name: 'employer_college_idx', statement: 'DROP INDEX employer_college_idx IF EXISTS' },
  { name: 'company_college_idx', statement: 'DROP INDEX company_college_idx IF EXISTS' },
  { name: 'skill_college_idx', statement: 'DROP INDEX skill_college_idx IF EXISTS' },
  { name: 'request_college_idx', statement: 'DROP INDEX request_college_idx IF EXISTS' },
  { name: 'role_college_idx', statement: 'DROP INDEX role_college_idx IF EXISTS' },
  { name: 'employer_status_idx', statement: 'DROP INDEX employer_status_idx IF EXISTS' },
];

export async function initializeSchema(): Promise<{ constraints: string[]; indexes: string[] }> {
  for (const item of [...obsolete, ...obsoleteIndexes]) {
    await writeQuery(item.statement);
  }
  for (const constraint of constraints) {
    await writeQuery(constraint.statement);
  }
  for (const index of indexes) {
    await writeQuery(index.statement);
  }
  return {
    constraints: constraints.map((item) => item.name),
    indexes: indexes.map((item) => item.name),
  };
}
