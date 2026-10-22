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
  createdAt: string;
  updatedAt: string;
}

interface ProfileRow {
  student: StudentNode;
  education: EducationRecord[];
  experiences: ExperienceRecord[];
  skills: { id: string; name: string; active: boolean }[];
}

const PROFILE_QUERY = `MATCH (s:Student {id: $id})
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
           .linkedin, .github, .portfolio, .activeBacklogs, .createdAt, .updatedAt } AS student,
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
       education, experiences, skills`;

const cleanEducation = (rows: EducationRecord[] | null): EducationRecord[] => (rows ?? []).filter((item) => item && item.level);
const cleanExperiences = (rows: ExperienceRecord[] | null): ExperienceRecord[] => (rows ?? []).filter((item) => item && item.id);
const cleanSkills = (rows: { id: string; name: string }[] | null) => (rows ?? []).filter((item) => item && item.id);

export const studentRepository = {
  async getProfile(studentId: string): Promise<StudentProfile | null> {
    const row = await readOne<ProfileRow>(PROFILE_QUERY, { id: studentId });
    return row ? toProfile(row) : null;
  },

  async updateProfile(studentId: string, props: Record<string, unknown>): Promise<void> {
    await writeQuery('MATCH (s:Student {id: $id}) SET s += $props, s.updatedAt = $now', {
      id: studentId,
      props,
      now: nowIso(),
    });
  },

  async upsertEducation(studentId: string, level: EducationLevel, props: Record<string, unknown>): Promise<void> {
    const now = nowIso();
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       MERGE (s)-[:HAS_EDUCATION]->(e:Education {level: $level})
       ON CREATE SET e.id = $id, e.createdAt = $now
       SET e += $props, e.updatedAt = $now`,
      { studentId, level, id: newId('edu'), props, now },
    );
  },

  async deleteEducation(studentId: string, level: EducationLevel): Promise<boolean> {
    const rows = await writeQuery<{ removed: number }>(
      `MATCH (s:Student {id: $studentId})-[:HAS_EDUCATION]->(e:Education {level: $level})
       WITH e, count(e) AS removed
       DETACH DELETE e
       RETURN removed`,
      { studentId, level },
    );
    return (rows[0]?.removed ?? 0) > 0;
  },

  async addExperience(studentId: string, props: Record<string, unknown>): Promise<string> {
    const id = newId('exp');
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       CREATE (s)-[:HAS_EXPERIENCE]->(x:Experience {id: $id, createdAt: $now})
       SET x += $props`,
      { studentId, id, props, now: nowIso() },
    );
    return id;
  },

  async updateExperience(studentId: string, experienceId: string, props: Record<string, unknown>): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (s:Student {id: $studentId})-[:HAS_EXPERIENCE]->(x:Experience {id: $experienceId})
       SET x += $props, x.updatedAt = $now
       RETURN x.id AS id`,
      { studentId, experienceId, props, now: nowIso() },
    );
    return rows.length > 0;
  },

  async deleteExperience(studentId: string, experienceId: string): Promise<boolean> {
    const rows = await writeQuery<{ removed: number }>(
      `MATCH (s:Student {id: $studentId})-[:HAS_EXPERIENCE]->(x:Experience {id: $experienceId})
       WITH x, count(x) AS removed
       DETACH DELETE x
       RETURN removed`,
      { studentId, experienceId },
    );
    return (rows[0]?.removed ?? 0) > 0;
  },

  async setSkills(studentId: string, skillIds: string[]): Promise<void> {
    await writeQuery(
      `MATCH (s:Student {id: $studentId})
       OPTIONAL MATCH (s)-[r:HAS_SKILL]->(:Skill)
       DELETE r
       WITH DISTINCT s
       UNWIND $skillIds AS skillId
       MATCH (k:Skill {id: skillId})
       MERGE (s)-[:HAS_SKILL]->(k)`,
      { studentId, skillIds },
    );
  },

  async count(filters: { q: string }): Promise<number> {
    const row = await readOne<{ total: number }>(
      `MATCH (s:Student)
       WHERE ($q = '' OR toLower(s.fullName) CONTAINS $q OR toLower(s.email) CONTAINS $q)
       RETURN count(s) AS total`,
      { q: filters.q },
    );
    return row?.total ?? 0;
  },

  async list(filters: StudentListFilters): Promise<StudentListRow[]> {
    const skip = (filters.page - 1) * filters.pageSize;
    return readQuery<StudentListRow>(
      `MATCH (s:Student)
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
      { q: filters.q, skip, limit: filters.pageSize },
    );
  },

  async listForEvaluation(limit = 2000): Promise<EvaluationStudentRow[]> {
    const rows = await readQuery<EvaluationStudentRow>(
      `MATCH (s:Student)
       ${EVALUATION_PROJECTION}
       ORDER BY s.fullName ASC
       LIMIT toInteger($limit)`,
      { limit },
    );
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      activeBacklogs: row.activeBacklogs ?? null,
      education: cleanEducation(row.education),
      experiences: cleanExperiences(row.experiences),
      skills: cleanSkills(row.skills),
    }));
  },

  async getForEvaluation(studentId: string): Promise<EvaluationStudentRow | null> {
    const row = await readOne<EvaluationStudentRow>(
      `MATCH (s:Student {id: $studentId})
       ${EVALUATION_PROJECTION}`,
      { studentId },
    );
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      activeBacklogs: row.activeBacklogs ?? null,
      education: cleanEducation(row.education),
      experiences: cleanExperiences(row.experiences),
      skills: cleanSkills(row.skills),
    };
  },

  async shortlistHistory(studentId: string) {
    return readQuery<{
      roleId: string;
      roleTitle: string;
      requestId: string;
      requestTitle: string;
      companyName: string;
      status: string;
      shortlistedAt: string | null;
      dispatchedAt: string | null;
      notificationReadAt: string | null;
    }>(
      `MATCH (s:Student {id: $studentId})-[r:SHORTLISTED_FOR]->(j:JobRole)<-[:CONTAINS_ROLE]-(h:HiringRequest)<-[:SUBMITTED]-(c:Company)
       OPTIONAL MATCH (s)-[:RECEIVED]->(n:Notification)-[:ABOUT_ROLE]->(j)
       RETURN j.id AS roleId, j.title AS roleTitle, h.id AS requestId, h.title AS requestTitle, c.name AS companyName,
              r.status AS status, r.shortlistedAt AS shortlistedAt, r.dispatchedAt AS dispatchedAt, n.readAt AS notificationReadAt
       ORDER BY r.shortlistedAt DESC`,
      { studentId },
    );
  },
};
