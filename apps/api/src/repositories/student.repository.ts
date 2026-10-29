import { readOne, readQuery, writeQuery } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import type { EducationLevel, EducationRecord, ExperienceRecord, StudentProfile } from '@campusconnect/shared';

interface StudentNode {
  id: string;
  fullName: string;
  email: string;
  dateOfBirth: string | null;
  gender: StudentProfile['gender'];
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
}

interface ProfileRow {
  student: StudentNode;
  education: EducationRecord[];
  experiences: ExperienceRecord[];
  skills: { id: string; name: string; active: boolean }[];
}

// Every student query is scoped by instituteId. Callers pass the tenant resolved
// from the authenticated session, so an id alone is never enough to reach a
// student from another institute.
const PROFILE_QUERY = `MATCH (s:Student {id: $id, instituteId: $instituteId})
CALL {
  WITH s
  OPTIONAL MATCH (s)-[:HAS_EDUCATION]->(e:Education)
  RETURN collect(e { .id, .level, .board, .stream, .degree, .branch, .institution, .passingYear, .scoreType, .scoreValue, .scoreScale }) AS education
}
CALL {
  WITH s
  OPTIONAL MATCH (s)-[:HAS_EXPERIENCE]->(x:Experience)
  RETURN collect(x { .id, .organization, .jobTitle, .startDate, .endDate, .isCurrent, .description }) AS experiences
}
CALL {
  WITH s
  OPTIONAL MATCH (s)-[:HAS_SKILL]->(k:Skill)
  RETURN collect(k { .id, .name, .active }) AS skills
}
RETURN s { .id, .fullName, .email, .dateOfBirth, .gender, .phone, .city, .state,
           .linkedin, .github, .portfolio, .activeBacklogs, .emailNotifications,
           .createdAt, .updatedAt } AS student,
       education, experiences, skills`;

const toProfile = (row: ProfileRow): StudentProfile => ({
  id: row.student.id,
  fullName: row.student.fullName,
  email: row.student.email,
  dateOfBirth: row.student.dateOfBirth ?? null,
  gender: row.student.gender ?? null,
  phone: row.student.phone ?? null,
  city: row.student.city ?? null,
  state: row.student.state ?? null,
  linkedin: row.student.linkedin ?? null,
  github: row.student.github ?? null,
  portfolio: row.student.portfolio ?? null,
  activeBacklogs: row.student.activeBacklogs ?? null,
  emailNotifications: row.student.emailNotifications !== false,
  createdAt: row.student.createdAt,
  updatedAt: row.student.updatedAt,
  education: (row.education ?? []).filter((item) => item && item.level),
  experiences: (row.experiences ?? []).filter((item) => item && item.id),
  skills: (row.skills ?? []).filter((item) => item && item.id),
});

export interface StudentListFilters {
  q: string;
  page: number;
  pageSize: number;
}

export interface StudentListRow {
  student: {
    id: string;
    fullName: string;
    email: string;
    city: string | null;
    state: string | null;
    activeBacklogs: number | null;
    createdAt: string;
  };
  undergrad: {
    degree: string | null;
    branch: string | null;
    passingYear: number | null;
    scoreType: string | null;
    scoreValue: number | null;
    scoreScale: number | null;
  } | null;
  skillCount: number;
}

export interface EvaluationStudentRow {
  id: string;
  fullName: string;
  email: string;
  activeBacklogs: number | null;
  emailNotifications: boolean;
  education: EducationRecord[];
  experiences: ExperienceRecord[];
  skills: { id: string; name: string }[];
}

const EVALUATION_PROJECTION = `CALL {
  WITH s
  OPTIONAL MATCH (s)-[:HAS_EDUCATION]->(e:Education)
  RETURN collect(e { .id, .level, .board, .stream, .degree, .branch, .institution, .passingYear, .scoreType, .scoreValue, .scoreScale }) AS education
}
CALL {
  WITH s
  OPTIONAL MATCH (s)-[:HAS_EXPERIENCE]->(x:Experience)
  RETURN collect(x { .id, .organization, .jobTitle, .startDate, .endDate, .isCurrent, .description }) AS experiences
}
CALL {
  WITH s
  OPTIONAL MATCH (s)-[:HAS_SKILL]->(k:Skill)
  RETURN collect(k { .id, .name }) AS skills
}
RETURN s.id AS id, s.fullName AS fullName, s.email AS email, s.activeBacklogs AS activeBacklogs,
       s.emailNotifications AS emailNotifications, education, experiences, skills`;

const cleanEducation = (rows: EducationRecord[] | null): EducationRecord[] => (rows ?? []).filter((item) => item && item.level);
const cleanExperiences = (rows: ExperienceRecord[] | null): ExperienceRecord[] => (rows ?? []).filter((item) => item && item.id);
const cleanSkills = (rows: { id: string; name: string }[] | null) => (rows ?? []).filter((item) => item && item.id);

const mapEvaluation = (row: EvaluationStudentRow): EvaluationStudentRow => ({
  id: row.id,
  fullName: row.fullName,
  email: row.email,
  activeBacklogs: row.activeBacklogs ?? null,
  emailNotifications: row.emailNotifications !== false,
  education: cleanEducation(row.education),
  experiences: cleanExperiences(row.experiences),
  skills: cleanSkills(row.skills),
});

export const studentRepository = {
  async getProfile(studentId: string, instituteId: string): Promise<StudentProfile | null> {
    const row = await readOne<ProfileRow>(PROFILE_QUERY, { id: studentId, instituteId });
    return row ? toProfile(row) : null;
  },

  async findByEmail(email: string): Promise<{ id: string; instituteId: string; fullName: string } | null> {
    return readOne<{ id: string; instituteId: string; fullName: string }>(
      'MATCH (s:Student {email: $email}) RETURN s.id AS id, s.instituteId AS instituteId, s.fullName AS fullName',
      { email },
    );
  },

  /** Creates a student inside one institute and links it to that institute. */
  async create(input: {
    fullName: string;
    email: string;
    passwordHash: string;
    dateOfBirth: string | null;
    instituteId: string;
  }): Promise<string | null> {
    const id = newId('stu');
    const now = nowIso();
    const rows = await writeQuery<{ id: string }>(
      `MATCH (i:Institute {id: $instituteId, active: true})
       CREATE (s:Student {
         id: $id, fullName: $fullName, email: $email, passwordHash: $passwordHash,
         dateOfBirth: $dateOfBirth, instituteId: $instituteId, emailNotifications: true,
         createdAt: $now, updatedAt: $now
       })
       CREATE (s)-[:BELONGS_TO]->(i)
       RETURN s.id AS id`,
      {
        id,
        fullName: input.fullName,
        email: input.email,
        passwordHash: input.passwordHash,
        dateOfBirth: input.dateOfBirth,
        instituteId: input.instituteId,
        now,
      },
    );
    return rows[0]?.id ?? null;
  },

  async updateProfile(studentId: string, instituteId: string, props: Record<string, unknown>): Promise<void> {
    await writeQuery('MATCH (s:Student {id: $id, instituteId: $instituteId}) SET s += $props, s.updatedAt = $now', {
      id: studentId,
      instituteId,
      props,
      now: nowIso(),
    });
  },

  async upsertEducation(studentId: string, instituteId: string, level: EducationLevel, props: Record<string, unknown>): Promise<void> {
    const now = nowIso();
    await writeQuery(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})
       MERGE (s)-[:HAS_EDUCATION]->(e:Education {level: $level})
       ON CREATE SET e.id = $id, e.createdAt = $now
       SET e += $props, e.updatedAt = $now`,
      { studentId, instituteId, level, id: newId('edu'), props, now },
    );
  },

  async deleteEducation(studentId: string, instituteId: string, level: EducationLevel): Promise<boolean> {
    const rows = await writeQuery<{ removed: number }>(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})-[:HAS_EDUCATION]->(e:Education {level: $level})
       WITH e, count(e) AS removed
       DETACH DELETE e
       RETURN removed`,
      { studentId, instituteId, level },
    );
    return (rows[0]?.removed ?? 0) > 0;
  },

  async addExperience(studentId: string, instituteId: string, props: Record<string, unknown>): Promise<string> {
    const id = newId('exp');
    await writeQuery(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})
       CREATE (s)-[:HAS_EXPERIENCE]->(x:Experience {id: $id, createdAt: $now})
       SET x += $props`,
      { studentId, instituteId, id, props, now: nowIso() },
    );
    return id;
  },

  async updateExperience(
    studentId: string,
    instituteId: string,
    experienceId: string,
    props: Record<string, unknown>,
  ): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})-[:HAS_EXPERIENCE]->(x:Experience {id: $experienceId})
       SET x += $props, x.updatedAt = $now
       RETURN x.id AS id`,
      { studentId, instituteId, experienceId, props, now: nowIso() },
    );
    return rows.length > 0;
  },

  async deleteExperience(studentId: string, instituteId: string, experienceId: string): Promise<boolean> {
    const rows = await writeQuery<{ removed: number }>(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})-[:HAS_EXPERIENCE]->(x:Experience {id: $experienceId})
       WITH x, count(x) AS removed
       DETACH DELETE x
       RETURN removed`,
      { studentId, instituteId, experienceId },
    );
    return (rows[0]?.removed ?? 0) > 0;
  },

  /**
   * Only skills from the student's own institute can be attached, which stops a
   * crafted payload from linking a student to another institute's catalogue.
   */
  async setSkills(studentId: string, instituteId: string, skillIds: string[]): Promise<number> {
    const rows = await writeQuery<{ linked: number }>(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})
       OPTIONAL MATCH (s)-[r:HAS_SKILL]->(:Skill)
       DELETE r
       WITH DISTINCT s
       UNWIND $skillIds AS skillId
       MATCH (k:Skill {id: skillId, instituteId: $instituteId})
       MERGE (s)-[:HAS_SKILL]->(k)
       RETURN count(k) AS linked`,
      { studentId, instituteId, skillIds },
    );
    return Number(rows[0]?.linked ?? 0);
  },

  async count(instituteId: string, filters: { q: string }): Promise<number> {
    const row = await readOne<{ total: number }>(
      `MATCH (s:Student {instituteId: $instituteId})
       WHERE ($q = '' OR toLower(s.fullName) CONTAINS $q OR toLower(s.email) CONTAINS $q)
       RETURN count(s) AS total`,
      { instituteId, q: filters.q },
    );
    return row?.total ?? 0;
  },

  async list(instituteId: string, filters: StudentListFilters): Promise<StudentListRow[]> {
    const skip = (filters.page - 1) * filters.pageSize;
    return readQuery<StudentListRow>(
      `MATCH (s:Student {instituteId: $instituteId})
       WHERE ($q = '' OR toLower(s.fullName) CONTAINS $q OR toLower(s.email) CONTAINS $q)
       CALL {
         WITH s
         OPTIONAL MATCH (s)-[:HAS_EDUCATION]->(e:Education {level: 'UNDERGRAD'})
         RETURN e
       }
       CALL {
         WITH s
         OPTIONAL MATCH (s)-[:HAS_SKILL]->(k:Skill)
         RETURN count(k) AS skillCount
       }
       RETURN s { .id, .fullName, .email, .city, .state, .activeBacklogs, .createdAt } AS student,
              e { .degree, .branch, .passingYear, .scoreType, .scoreValue, .scoreScale } AS undergrad,
              skillCount
       ORDER BY s.fullName ASC
       SKIP toInteger($skip) LIMIT toInteger($limit)`,
      { instituteId, q: filters.q, skip, limit: filters.pageSize },
    );
  },

  async listForEvaluation(instituteId: string, limit = 2000): Promise<EvaluationStudentRow[]> {
    const rows = await readQuery<EvaluationStudentRow>(
      `MATCH (s:Student {instituteId: $instituteId})
       ${EVALUATION_PROJECTION}
       ORDER BY s.fullName ASC
       LIMIT toInteger($limit)`,
      { instituteId, limit },
    );
    return rows.map(mapEvaluation);
  },

  async getForEvaluation(studentId: string, instituteId: string): Promise<EvaluationStudentRow | null> {
    const row = await readOne<EvaluationStudentRow>(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})
       ${EVALUATION_PROJECTION}`,
      { studentId, instituteId },
    );
    return row ? mapEvaluation(row) : null;
  },

  async shortlistHistory(studentId: string, instituteId: string) {
    return readQuery<{
      roleId: string;
      roleTitle: string;
      requestId: string;
      requestTitle: string;
      recruiterName: string | null;
      status: string;
      shortlistedAt: string | null;
      dispatchedAt: string | null;
      notificationReadAt: string | null;
    }>(
      `MATCH (s:Student {id: $studentId, instituteId: $instituteId})-[r:SHORTLISTED_FOR]->(j:JobRole)<-[:CONTAINS_ROLE]-(h:HiringRequest)<-[:SUBMITTED]-(rec)
       OPTIONAL MATCH (s)-[:RECEIVED]->(n:Notification)-[:ABOUT_ROLE]->(j)
       RETURN j.id AS roleId, j.title AS roleTitle, h.id AS requestId, h.title AS requestTitle,
              rec.companyName AS recruiterName,
              r.status AS status, r.shortlistedAt AS shortlistedAt, r.dispatchedAt AS dispatchedAt, n.readAt AS notificationReadAt
       ORDER BY r.shortlistedAt DESC`,
      { studentId, instituteId },
    );
  },
};
