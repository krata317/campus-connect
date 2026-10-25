import { readOne, readQuery, withTransaction } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import { emptyCriteria } from '@campusconnect/shared';
import type { HiringRequest, JobCriteria, JobRole, RequestStatus, ReviewEvent } from '@campusconnect/shared';
import type { ManagedTransaction } from 'neo4j-driver';

export interface RoleInput {
  title: string;
  description: string;
  location: string | null;
  employmentType: string | null;
  registrationUrl: string;
  criteria: JobCriteria;
}

interface RoleNode {
  id: string;
  title: string;
  description: string;
  location: string | null;
  employmentType: string | null;
  registrationUrl: string;
  criteriaJson: string;
  status: RequestStatus;
  shortlistStatus: JobRole['shortlistStatus'];
  dispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RoleRow {
  role: RoleNode;
  shortlistedCount: number;
}

interface RequestNode {
  id: string;
  title: string;
  assessmentInstructions: string | null;
  status: RequestStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RequestRow {
  request: RequestNode;
  companyId: string;
  companyName: string;
  reviewEvents: (ReviewEvent | null)[];
}

export interface RequestWithRoles extends HiringRequest {
  reviewEvents: ReviewEvent[];
}

export interface RoleContext {
  role: JobRole;
  request: RequestNode;
  company: { id: string; name: string };
}

const parseCriteria = (json: string | null): JobCriteria => {
  if (!json) return emptyCriteria();
  try {
    return { ...emptyCriteria(), ...(JSON.parse(json) as Partial<JobCriteria>) };
  } catch {
    return emptyCriteria();
  }
};

const mapRole = (row: RoleRow): JobRole => ({
  id: row.role.id,
  title: row.role.title,
  description: row.role.description,
  location: row.role.location ?? null,
  employmentType: (row.role.employmentType ?? null) as JobRole['employmentType'],
  registrationUrl: row.role.registrationUrl,
  criteria: parseCriteria(row.role.criteriaJson),
  status: row.role.status,
  shortlistStatus: row.role.shortlistStatus ?? 'NONE',
  shortlistedCount: row.shortlistedCount ?? 0,
  dispatchedAt: row.role.dispatchedAt ?? null,
  createdAt: row.role.createdAt,
  updatedAt: row.role.updatedAt,
});

const ROLE_QUERY = `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole {collegeId: $collegeId})
CALL {
  WITH j
  OPTIONAL MATCH (:Student)-[r:SHORTLISTED_FOR]->(j)
  RETURN count(r) AS shortlistedCount
}
RETURN j { .id, .title, .description, .location, .employmentType, .registrationUrl, .criteriaJson,
           .status, .shortlistStatus, .dispatchedAt, .createdAt, .updatedAt } AS role,
       shortlistedCount
ORDER BY j.createdAt ASC`;

const REQUEST_QUERY = `MATCH (c:Company {collegeId: $collegeId})-[:SUBMITTED]->(h:HiringRequest {collegeId: $collegeId})
WHERE ($id IS NULL OR h.id = $id)
  AND ($status IS NULL OR h.status = $status)
  AND ($q = '' OR toLower(h.title) CONTAINS $q OR toLower(c.name) CONTAINS $q)
  AND ($employerId IS NULL OR EXISTS { MATCH (c)-[:HAS_ACCOUNT]->(:EmployerAccount {id: $employerId, collegeId: $collegeId}) })
OPTIONAL MATCH (h)-[:HAS_REVIEW_EVENT]->(ev:ReviewEvent)
WITH c, h, ev
ORDER BY ev.at DESC
RETURN h { .id, .title, .assessmentInstructions, .status, .submittedAt, .reviewedAt, .reviewNote,
           .createdAt, .updatedAt } AS request,
       c.id AS companyId, c.name AS companyName,
       collect(ev { .id, .action, .fromStatus, .toStatus, .note, .actorRole, .actorId, .at }) AS reviewEvents
ORDER BY request.createdAt DESC`;

const cleanEvents = (rows: (ReviewEvent | null)[] | null): ReviewEvent[] =>
  (rows ?? []).filter((event): event is ReviewEvent => Boolean(event && event.id));

const toRequest = (row: RequestRow, roles: JobRole[]): RequestWithRoles => ({
  id: row.request.id,
  title: row.request.title,
  assessmentInstructions: row.request.assessmentInstructions ?? null,
  status: row.request.status,
  companyId: row.companyId,
  companyName: row.companyName,
  submittedAt: row.request.submittedAt ?? null,
  reviewedAt: row.request.reviewedAt ?? null,
  reviewNote: row.request.reviewNote ?? null,
  createdAt: row.request.createdAt,
  updatedAt: row.request.updatedAt,
  roles,
  reviewEvents: cleanEvents(row.reviewEvents),
});

async function writeRoles(
  tx: ManagedTransaction,
  requestId: string,
  collegeId: string,
  roles: RoleInput[],
  status: RequestStatus,
  now: string,
): Promise<void> {
  for (const role of roles) {
    const roleId = newId('rol');
    await tx.run(
      `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})
       MATCH (college:College {id: $collegeId})
       CREATE (j:JobRole {
         id: $roleId, title: $title, description: $description, location: $location,
         employmentType: $employmentType, registrationUrl: $registrationUrl, criteriaJson: $criteriaJson,
         status: $status, shortlistStatus: 'NONE', dispatchedAt: null, collegeId: $collegeId,
         createdAt: $now, updatedAt: $now
       })
       CREATE (h)-[:CONTAINS_ROLE]->(j)
       CREATE (j)-[:BELONGS_TO]->(college)`,
      {
        requestId,
        collegeId,
        roleId,
        title: role.title,
        description: role.description,
        location: role.location,
        employmentType: role.employmentType,
        registrationUrl: role.registrationUrl,
        criteriaJson: JSON.stringify(role.criteria),
        status,
        now,
      },
    );

    const required = role.criteria.requiredSkillIds.map((skillId) => ({ roleId, skillId }));
    const optional = role.criteria.optionalSkillIds.map((skillId) => ({ roleId, skillId }));

    if (required.length > 0) {
      await tx.run(
        `UNWIND $links AS link
         MATCH (j:JobRole {id: link.roleId, collegeId: $collegeId})
         MATCH (k:Skill {id: link.skillId, collegeId: $collegeId})
         MERGE (j)-[:REQUIRES_SKILL]->(k)`,
        { links: required, collegeId },
      );
    }
    if (optional.length > 0) {
      await tx.run(
        `UNWIND $links AS link
         MATCH (j:JobRole {id: link.roleId, collegeId: $collegeId})
         MATCH (k:Skill {id: link.skillId, collegeId: $collegeId})
         MERGE (j)-[:PREFERS_SKILL]->(k)`,
        { links: optional, collegeId },
      );
    }
  }
}

export const requestRepository = {
  async create(input: {
    employerId: string;
    collegeId: string;
    title: string;
    assessmentInstructions: string | null;
    roles: RoleInput[];
    status: RequestStatus;
  }): Promise<string> {
    const requestId = newId('req');
    const now = nowIso();
    const submittedAt = input.status === 'SUBMITTED' ? now : null;

    await withTransaction(async (tx) => {
      const result = await tx.run(
        `MATCH (c:Company {collegeId: $collegeId})-[:HAS_ACCOUNT]->(:EmployerAccount {id: $employerId, collegeId: $collegeId})
         MATCH (college:College {id: $collegeId})
         CREATE (h:HiringRequest {
           id: $requestId, title: $title, assessmentInstructions: $instructions, status: $status,
           submittedAt: $submittedAt, reviewedAt: null, reviewNote: null, collegeId: $collegeId,
           createdAt: $now, updatedAt: $now
         })
         CREATE (c)-[:SUBMITTED]->(h)
         CREATE (h)-[:BELONGS_TO]->(college)
         RETURN h.id AS id`,
        {
          employerId: input.employerId,
          collegeId: input.collegeId,
          requestId,
          title: input.title,
          instructions: input.assessmentInstructions,
          status: input.status,
          submittedAt,
          now,
        },
      );
      if (result.records.length === 0) {
        throw new Error('Employer company not found');
      }
      await writeRoles(tx, requestId, input.collegeId, input.roles, input.status, now);
    });

    return requestId;
  },

  async update(input: {
    requestId: string;
    collegeId: string;
    title: string;
    assessmentInstructions: string | null;
    roles: RoleInput[];
    status: RequestStatus;
  }): Promise<void> {
    const now = nowIso();
    await withTransaction(async (tx) => {
      await tx.run(
        'MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole) DETACH DELETE j',
        { requestId: input.requestId, collegeId: input.collegeId },
      );
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})
         SET h.title = $title, h.assessmentInstructions = $instructions, h.updatedAt = $now, h.status = $status,
             h.submittedAt = CASE WHEN $status = 'SUBMITTED' THEN $now ELSE h.submittedAt END,
             h.reviewNote = CASE WHEN $status = 'SUBMITTED' THEN null ELSE h.reviewNote END,
             h.reviewedAt = CASE WHEN $status = 'SUBMITTED' THEN null ELSE h.reviewedAt END`,
        {
          requestId: input.requestId,
          collegeId: input.collegeId,
          title: input.title,
          instructions: input.assessmentInstructions,
          now,
          status: input.status,
        },
      );
      await writeRoles(tx, input.requestId, input.collegeId, input.roles, input.status, now);
    });
  },

  async review(input: {
    requestId: string;
    collegeId: string;
    adminId: string;
    status: RequestStatus;
    previousStatus: RequestStatus;
    action: string;
    note: string | null;
  }): Promise<void> {
    const now = nowIso();
    await withTransaction(async (tx) => {
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})
         SET h.status = $status, h.reviewNote = $note, h.reviewedAt = $now, h.reviewedByAdminId = $adminId, h.updatedAt = $now
         CREATE (ev:ReviewEvent {
           id: $eventId, action: $action, fromStatus: $previousStatus, toStatus: $status,
           note: $note, actorRole: 'ADMIN', actorId: $adminId, at: $now
         })
         CREATE (h)-[:HAS_REVIEW_EVENT]->(ev)`,
        {
          requestId: input.requestId,
          collegeId: input.collegeId,
          status: input.status,
          note: input.note,
          now,
          adminId: input.adminId,
          eventId: newId('rev'),
          action: input.action,
          previousStatus: input.previousStatus,
        },
      );
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole)
         SET j.status = $status, j.updatedAt = $now`,
        { requestId: input.requestId, collegeId: input.collegeId, status: input.status, now },
      );
    });
  },

  async submit(input: { requestId: string; collegeId: string; employerId: string; previousStatus: RequestStatus }): Promise<void> {
    const now = nowIso();
    await withTransaction(async (tx) => {
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})
         SET h.status = 'SUBMITTED', h.submittedAt = $now, h.updatedAt = $now, h.reviewNote = null, h.reviewedAt = null
         CREATE (ev:ReviewEvent {
           id: $eventId, action: 'REQUEST_SUBMITTED', fromStatus: $previousStatus, toStatus: 'SUBMITTED',
           note: null, actorRole: 'EMPLOYER', actorId: $employerId, at: $now
         })
         CREATE (h)-[:HAS_REVIEW_EVENT]->(ev)`,
        {
          requestId: input.requestId,
          collegeId: input.collegeId,
          employerId: input.employerId,
          previousStatus: input.previousStatus,
          eventId: newId('rev'),
          now,
        },
      );
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole)
         SET j.status = 'SUBMITTED', j.updatedAt = $now`,
        { requestId: input.requestId, collegeId: input.collegeId, now },
      );
    });
  },

  async getById(requestId: string, collegeId: string): Promise<RequestWithRoles | null> {
    const rows = await readQuery<RequestRow>(REQUEST_QUERY, { id: requestId, employerId: null, status: null, q: '', collegeId });
    const row = rows[0];
    if (!row) return null;
    const roles = await readQuery<RoleRow>(ROLE_QUERY, { requestId, collegeId });
    return toRequest(row, roles.map(mapRole));
  },

  async list(params: {
    collegeId: string;
    employerId: string | null;
    status: RequestStatus | null;
    q: string;
  }): Promise<RequestWithRoles[]> {
    const rows = await readQuery<RequestRow>(REQUEST_QUERY, {
      id: null,
      employerId: params.employerId,
      status: params.status,
      q: params.q,
      collegeId: params.collegeId,
    });
    const requests: RequestWithRoles[] = [];
    for (const row of rows) {
      const roles = await readQuery<RoleRow>(ROLE_QUERY, { requestId: row.request.id, collegeId: params.collegeId });
      requests.push(toRequest(row, roles.map(mapRole)));
    }
    return requests;
  },

  async belongsToEmployer(requestId: string, employerId: string, collegeId: string): Promise<boolean> {
    const row = await readOne<{ id: string }>(
      `MATCH (c:Company {collegeId: $collegeId})-[:HAS_ACCOUNT]->(:EmployerAccount {id: $employerId, collegeId: $collegeId})
       MATCH (c)-[:SUBMITTED]->(h:HiringRequest {id: $requestId, collegeId: $collegeId})
       RETURN h.id AS id`,
      { requestId, employerId, collegeId },
    );
    return row !== null;
  },

  async getRoleContext(roleId: string, collegeId: string): Promise<RoleContext | null> {
    const row = await readOne<{
      role: RoleNode;
      request: RequestNode;
      company: { id: string; name: string };
      shortlistedCount: number;
    }>(
      `MATCH (c:Company {collegeId: $collegeId})-[:SUBMITTED]->(h:HiringRequest {collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole {id: $roleId, collegeId: $collegeId})
       CALL {
         WITH j
         OPTIONAL MATCH (:Student)-[r:SHORTLISTED_FOR]->(j)
         RETURN count(r) AS shortlistedCount
       }
       RETURN j { .id, .title, .description, .location, .employmentType, .registrationUrl, .criteriaJson,
                  .status, .shortlistStatus, .dispatchedAt, .createdAt, .updatedAt } AS role,
              h { .id, .title, .assessmentInstructions, .status, .submittedAt, .reviewedAt, .reviewNote,
                  .createdAt, .updatedAt } AS request,
              c { .id, .name } AS company,
              shortlistedCount`,
      { roleId, collegeId },
    );
    if (!row) return null;
    return {
      role: mapRole({ role: row.role, shortlistedCount: row.shortlistedCount }),
      request: row.request,
      company: row.company,
    };
  },

  async countByStatus(collegeId: string, status: RequestStatus): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (h:HiringRequest {collegeId: $collegeId, status: $status}) RETURN count(h) AS total',
      { collegeId, status },
    );
    return row?.total ?? 0;
  },

  async deleteDraft(requestId: string, collegeId: string): Promise<void> {
    await withTransaction(async (tx) => {
      await tx.run('MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole) DETACH DELETE j', {
        requestId,
        collegeId,
      });
      await tx.run('MATCH (h:HiringRequest {id: $requestId, collegeId: $collegeId}) DETACH DELETE h', { requestId, collegeId });
    });
  },

  async countRolesForRequest(requestId: string, collegeId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole) RETURN count(j) AS total',
      { requestId, collegeId },
    );
    return row?.total ?? 0;
  },

  async listRoleIdsForRequest(requestId: string, collegeId: string): Promise<string[]> {
    const rows = await readQuery<{ id: string }>(
      'MATCH (:HiringRequest {id: $requestId, collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole) RETURN j.id AS id',
      { requestId, collegeId },
    );
    return rows.map((row) => row.id);
  },
};
