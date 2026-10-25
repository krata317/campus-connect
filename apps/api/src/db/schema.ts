import { writeQuery } from './neo4j';

interface SchemaStatement {
  name: string;
  statement: string;
}

/**
 * Tenant model
 * ------------
 * `College` is the tenant root. Every account, skill, company, hiring request
 * and job role carries a `collegeId` property (so queries can be scoped with a
 * cheap property predicate) *and* a relationship to its College node (so the
 * ownership is explicit in the graph). Both are written in the same
 * transaction that creates the record.
 *
 *   (Admin)-[:ADMINISTERS]->(College)
 *   (Student)-[:BELONGS_TO]->(College)
 *   (EmployerAccount)-[:BELONGS_TO]->(College)
 *   (Company)-[:BELONGS_TO]->(College)
 *   (Skill)-[:BELONGS_TO]->(College)
 *   (HiringRequest)-[:BELONGS_TO]->(College)
 *   (JobRole)-[:BELONGS_TO]->(College)
 *
 * Notifications inherit their tenant through RECEIVED/ABOUT_ROLE, and the
 * dispatch transaction only ever links a student and a role from the same
 * college, so no extra relationship is required there.
 */

const constraints: SchemaStatement[] = [
  { name: 'college_id_unique', statement: 'CREATE CONSTRAINT college_id_unique IF NOT EXISTS FOR (n:College) REQUIRE n.id IS UNIQUE' },
  {
    name: 'college_slug_unique',
    statement: 'CREATE CONSTRAINT college_slug_unique IF NOT EXISTS FOR (n:College) REQUIRE n.slug IS UNIQUE',
  },
  { name: 'student_id_unique', statement: 'CREATE CONSTRAINT student_id_unique IF NOT EXISTS FOR (n:Student) REQUIRE n.id IS UNIQUE' },
  { name: 'student_email_unique', statement: 'CREATE CONSTRAINT student_email_unique IF NOT EXISTS FOR (n:Student) REQUIRE n.email IS UNIQUE' },
  { name: 'admin_id_unique', statement: 'CREATE CONSTRAINT admin_id_unique IF NOT EXISTS FOR (n:Admin) REQUIRE n.id IS UNIQUE' },
  { name: 'admin_email_unique', statement: 'CREATE CONSTRAINT admin_email_unique IF NOT EXISTS FOR (n:Admin) REQUIRE n.email IS UNIQUE' },
  { name: 'employer_id_unique', statement: 'CREATE CONSTRAINT employer_id_unique IF NOT EXISTS FOR (n:EmployerAccount) REQUIRE n.id IS UNIQUE' },
  {
    name: 'employer_email_unique',
    statement: 'CREATE CONSTRAINT employer_email_unique IF NOT EXISTS FOR (n:EmployerAccount) REQUIRE n.email IS UNIQUE',
  },
  { name: 'company_id_unique', statement: 'CREATE CONSTRAINT company_id_unique IF NOT EXISTS FOR (n:Company) REQUIRE n.id IS UNIQUE' },
  { name: 'skill_id_unique', statement: 'CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (n:Skill) REQUIRE n.id IS UNIQUE' },
  // Skill names are unique *per college*: two colleges may each catalogue
  // "Python" without colliding, but one college cannot hold it twice.
  {
    name: 'skill_college_namekey_unique',
    statement: 'CREATE CONSTRAINT skill_college_namekey_unique IF NOT EXISTS FOR (n:Skill) REQUIRE (n.collegeId, n.nameKey) IS UNIQUE',
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
    name: 'bootstrap_lock_id_unique',
    statement: 'CREATE CONSTRAINT bootstrap_lock_id_unique IF NOT EXISTS FOR (n:BootstrapLock) REQUIRE n.id IS UNIQUE',
  },
];

const indexes: SchemaStatement[] = [
  { name: 'college_slug_idx', statement: 'CREATE INDEX college_slug_idx IF NOT EXISTS FOR (n:College) ON (n.slug)' },
  { name: 'college_active_idx', statement: 'CREATE INDEX college_active_idx IF NOT EXISTS FOR (n:College) ON (n.active)' },
  { name: 'student_fullname_idx', statement: 'CREATE INDEX student_fullname_idx IF NOT EXISTS FOR (n:Student) ON (n.fullName)' },
  { name: 'student_created_idx', statement: 'CREATE INDEX student_created_idx IF NOT EXISTS FOR (n:Student) ON (n.createdAt)' },
  { name: 'student_college_idx', statement: 'CREATE INDEX student_college_idx IF NOT EXISTS FOR (n:Student) ON (n.collegeId)' },
  { name: 'admin_college_idx', statement: 'CREATE INDEX admin_college_idx IF NOT EXISTS FOR (n:Admin) ON (n.collegeId)' },
  {
    name: 'employer_college_idx',
    statement: 'CREATE INDEX employer_college_idx IF NOT EXISTS FOR (n:EmployerAccount) ON (n.collegeId)',
  },
  { name: 'company_college_idx', statement: 'CREATE INDEX company_college_idx IF NOT EXISTS FOR (n:Company) ON (n.collegeId)' },
  { name: 'skill_college_idx', statement: 'CREATE INDEX skill_college_idx IF NOT EXISTS FOR (n:Skill) ON (n.collegeId)' },
  { name: 'request_college_idx', statement: 'CREATE INDEX request_college_idx IF NOT EXISTS FOR (n:HiringRequest) ON (n.collegeId)' },
  { name: 'request_status_idx', statement: 'CREATE INDEX request_status_idx IF NOT EXISTS FOR (n:HiringRequest) ON (n.status)' },
  { name: 'role_college_idx', statement: 'CREATE INDEX role_college_idx IF NOT EXISTS FOR (n:JobRole) ON (n.collegeId)' },
  { name: 'role_status_idx', statement: 'CREATE INDEX role_status_idx IF NOT EXISTS FOR (n:JobRole) ON (n.status)' },
  { name: 'notification_created_idx', statement: 'CREATE INDEX notification_created_idx IF NOT EXISTS FOR (n:Notification) ON (n.createdAt)' },
  { name: 'employer_status_idx', statement: 'CREATE INDEX employer_status_idx IF NOT EXISTS FOR (n:EmployerAccount) ON (n.approvalStatus)' },
  { name: 'session_expiry_idx', statement: 'CREATE INDEX session_expiry_idx IF NOT EXISTS FOR (n:Session) ON (n.expiresAt)' },
  { name: 'skill_active_idx', statement: 'CREATE INDEX skill_active_idx IF NOT EXISTS FOR (n:Skill) ON (n.active)' },
];

/**
 * Constraints from the single-college version that no longer describe the
 * model. Dropping them is safe and idempotent: `DROP ... IF EXISTS` is a no-op
 * when the constraint was never created.
 */
const obsolete: SchemaStatement[] = [
  { name: 'skill_namekey_unique', statement: 'DROP CONSTRAINT skill_namekey_unique IF EXISTS' },
];

export async function initializeSchema(): Promise<{ constraints: string[]; indexes: string[] }> {
  for (const item of obsolete) {
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
