import { writeQuery } from './neo4j';

interface ConstraintDefinition {
  name: string;
  statement: string;
}

const constraints: ConstraintDefinition[] = [
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
  { name: 'skill_namekey_unique', statement: 'CREATE CONSTRAINT skill_namekey_unique IF NOT EXISTS FOR (n:Skill) REQUIRE n.nameKey IS UNIQUE' },
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

const indexes: ConstraintDefinition[] = [
  { name: 'student_fullname_idx', statement: 'CREATE INDEX student_fullname_idx IF NOT EXISTS FOR (n:Student) ON (n.fullName)' },
  { name: 'student_created_idx', statement: 'CREATE INDEX student_created_idx IF NOT EXISTS FOR (n:Student) ON (n.createdAt)' },
  { name: 'request_status_idx', statement: 'CREATE INDEX request_status_idx IF NOT EXISTS FOR (n:HiringRequest) ON (n.status)' },
  { name: 'role_status_idx', statement: 'CREATE INDEX role_status_idx IF NOT EXISTS FOR (n:JobRole) ON (n.status)' },
  { name: 'notification_created_idx', statement: 'CREATE INDEX notification_created_idx IF NOT EXISTS FOR (n:Notification) ON (n.createdAt)' },
  { name: 'employer_status_idx', statement: 'CREATE INDEX employer_status_idx IF NOT EXISTS FOR (n:EmployerAccount) ON (n.approvalStatus)' },
  { name: 'session_expiry_idx', statement: 'CREATE INDEX session_expiry_idx IF NOT EXISTS FOR (n:Session) ON (n.expiresAt)' },
  { name: 'skill_active_idx', statement: 'CREATE INDEX skill_active_idx IF NOT EXISTS FOR (n:Skill) ON (n.active)' },
];

export async function initializeSchema(): Promise<{ constraints: string[]; indexes: string[] }> {
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
