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
  recruiterId: string;
  instituteId: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RequestRow {
  request: RequestNode;
  recruiterName: string;
  instituteName: string;
  reviewEvents: (ReviewEvent | null)[];
}

export interface RequestWithRoles extends HiringRequest {
  reviewEvents: ReviewEvent[];
}

export interface RoleContext {
  role: JobRole;
  request: RequestNode;
  recruiter: { id: string; name: string };
  institute: { id: string; name: string };
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

const ROLE_QUERY = `MATCH (h:HiringRequest {id: $requestId})-[:CONTAINS_ROLE]->(j:JobRole)
WHERE j.instituteId = $instituteId
CALL {
  WITH j
  OPTIONAL MATCH (:Student)-[r:SHORTLISTED_FOR]->(j)
  RETURN count(r) AS shortlistedCount
}
RETURN j { .id, .title, .description, .location, .employmentType, .registrationUrl, .criteriaJson,
           .status, .shortlistStatus, .dispatchedAt, .createdAt, .updatedAt } AS role,
       shortlistedCount
ORDER BY j.createdAt ASC`;

const REQUEST_BASE = `MATCH (rec:Recruiter)-[:SUBMITTED]->(h:HiringRequest)
MATCH (h)-[:SENT_TO]->(i:Institute)`;

const REQUEST_RETURN = `OPTIONAL MATCH (h)-[:HAS_REVIEW_EVENT]->(ev:ReviewEvent)
WITH h, rec, i, ev
ORDER BY ev.at DESC
RETURN h { .id, .title, .assessmentInstructions, .status, .recruiterId, .instituteId,
           .submittedAt, .reviewedAt, .reviewNote, .createdAt, .updatedAt } AS request,
       rec.companyName AS recruiterName, i.name AS instituteName,
       collect(ev { .id, .action, .fromStatus, .toStatus, .note, .actorRole, .actorId, .at }) AS reviewEvents
ORDER BY request.createdAt DESC`;

const cleanEvents = (rows: (ReviewEvent | null)[] | null): ReviewEvent[] =>
  (rows ?? []).filter((event): event is ReviewEvent => Boolean(event && event.id));

const toRequest = (row: RequestRow, roles: JobRole[]): RequestWithRoles => ({
  id: row.request.id,
  title: row.request.title,
  assessmentInstructions: row.request.assessmentInstructions ?? null,
  status: row.request.status,
  recruiterId: row.request.recruiterId,
  recruiterName: row.recruiterName,
  instituteId: row.request.instituteId,
  instituteName: row.instituteName,
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
  instituteId: string,
  roles: RoleInput[],
  status: RequestStatus,
  now: string,
): Promise<void> {
  for (const role of roles) {
    const roleId = newId('rol');
    await tx.run(
      `MATCH (h:HiringRequest {id: $requestId})
       MATCH (i:Institute {id: $instituteId})
       CREATE (j:JobRole {
         id: $roleId, title: $title, description: $description, location: $location,
         employmentType: $employmentType, registrationUrl: $registrationUrl, criteriaJson: $criteriaJson,
         status: $status, shortlistStatus: 'NONE', dispatchedAt: null, instituteId: $instituteId,
         createdAt: $now, updatedAt: $now
       })
       CREATE (h)-[:CONTAINS_ROLE]->(j)
       CREATE (j)-[:BELONGS_TO]->(i)`,
      {
        requestId,
        instituteId,
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
         MATCH (j:JobRole {id: link.roleId, instituteId: $instituteId})
         MATCH (k:Skill {id: link.skillId, instituteId: $instituteId})
         MERGE (j)-[:REQUIRES_SKILL]->(k)`,
        { links: required, instituteId },
      );
    }
    if (optional.length > 0) {
      await tx.run(
        `UNWIND $links AS link
         MATCH (j:JobRole {id: link.roleId, instituteId: $instituteId})
         MATCH (k:Skill {id: link.skillId, instituteId: $instituteId})
         MERGE (j)-[:PREFERS_SKILL]->(k)`,
        { links: optional, instituteId },
      );
    }
  }
}

export const requestRepository = {
  /** A recruiter addresses a new request to one institute of their choosing. */
  async create(input: {
    recruiterId: string;
    instituteId: string;
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
        `MATCH (rec:Recruiter {id: $recruiterId})
         MATCH (i:Institute {id: $instituteId, active: true})
         CREATE (h:HiringRequest {
           id: $requestId, title: $title, assessmentInstructions: $instructions, status: $status,
           recruiterId: $recruiterId, instituteId: $instituteId,
           submittedAt: $submittedAt, reviewedAt: null, reviewNote: null,
           createdAt: $now, updatedAt: $now
         })
         CREATE (rec)-[:SUBMITTED]->(h)
         CREATE (h)-[:SENT_TO]->(i)
         RETURN h.id AS id`,
        {
          recruiterId: input.recruiterId,
          instituteId: input.instituteId,
          requestId,
          title: input.title,
          instructions: input.assessmentInstructions,
          status: input.status,
          submittedAt,
          now,
        },
      );
      if (result.records.length === 0) {
        throw new Error('Recruiter or institute not found');
      }
      await writeRoles(tx, requestId, input.instituteId, input.roles, input.status, now);
    });

    return requestId;
  },

  async update(input: {
    requestId: string;
    recruiterId: string;
    title: string;
    assessmentInstructions: string | null;
    roles: RoleInput[];
    status: RequestStatus;
  }): Promise<void> {
    const now = nowIso();
    await withTransaction(async (tx) => {
      const owned = await tx.run(
        'MATCH (h:HiringRequest {id: $requestId, recruiterId: $recruiterId}) RETURN h.instituteId AS instituteId',
        { requestId: input.requestId, recruiterId: input.recruiterId },
      );
      const record = owned.records[0];
      if (!record) throw new Error('Hiring request not found');
      const instituteId = record.get('instituteId') as string;

      await tx.run('MATCH (h:HiringRequest {id: $requestId})-[:CONTAINS_ROLE]->(j:JobRole) DETACH DELETE j', {
        requestId: input.requestId,
      });
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId})
         SET h.title = $title, h.assessmentInstructions = $instructions, h.updatedAt = $now, h.status = $status,
             h.submittedAt = CASE WHEN $status = 'SUBMITTED' THEN $now ELSE h.submittedAt END,
             h.reviewNote = CASE WHEN $status = 'SUBMITTED' THEN null ELSE h.reviewNote END,
             h.reviewedAt = CASE WHEN $status = 'SUBMITTED' THEN null ELSE h.reviewedAt END`,
        {
          requestId: input.requestId,
          title: input.title,
          instructions: input.assessmentInstructions,
          now,
          status: input.status,
        },
      );
      await writeRoles(tx, input.requestId, instituteId, input.roles, input.status, now);
    });
  },

  async review(input: {
    requestId: string;
    instituteId: string;
    adminId: string;
    status: RequestStatus;
    previousStatus: RequestStatus;
    action: string;
    note: string | null;
  }): Promise<void> {
    const now = nowIso();
    await withTransaction(async (tx) => {
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, instituteId: $instituteId})
         SET h.status = $status, h.reviewNote = $note, h.reviewedAt = $now, h.reviewedByAdminId = $adminId, h.updatedAt = $now
         CREATE (ev:ReviewEvent {
           id: $eventId, action: $action, fromStatus: $previousStatus, toStatus: $status,
           note: $note, actorRole: 'INSTITUTE_ADMIN', actorId: $adminId, at: $now
         })
         CREATE (h)-[:HAS_REVIEW_EVENT]->(ev)`,
        {
          requestId: input.requestId,
          instituteId: input.instituteId,
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
        `MATCH (h:HiringRequest {id: $requestId})-[:CONTAINS_ROLE]->(j:JobRole)
         SET j.status = $status, j.updatedAt = $now`,
        { requestId: input.requestId, status: input.status, now },
      );
    });
  },

  async submit(input: { requestId: string; recruiterId: string; previousStatus: RequestStatus }): Promise<void> {
    const now = nowIso();
    await withTransaction(async (tx) => {
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId, recruiterId: $recruiterId})
         SET h.status = 'SUBMITTED', h.submittedAt = $now, h.updatedAt = $now, h.reviewNote = null, h.reviewedAt = null
         CREATE (ev:ReviewEvent {
           id: $eventId, action: 'REQUEST_SUBMITTED', fromStatus: $previousStatus, toStatus: 'SUBMITTED',
           note: null, actorRole: 'RECRUITER', actorId: $recruiterId, at: $now
         })
         CREATE (h)-[:HAS_REVIEW_EVENT]->(ev)`,
        {
          requestId: input.requestId,
          recruiterId: input.recruiterId,
          previousStatus: input.previousStatus,
          eventId: newId('rev'),
          now,
        },
      );
      await tx.run(
        `MATCH (h:HiringRequest {id: $requestId})-[:CONTAINS_ROLE]->(j:JobRole)
         SET j.status = 'SUBMITTED', j.updatedAt = $now`,
        { requestId: input.requestId, now },
      );
    });
  },

  async getForInstitute(requestId: string, instituteId: string): Promise<RequestWithRoles | null> {
    const rows = await readQuery<RequestRow>(`${REQUEST_BASE} WHERE h.id = $id AND h.instituteId = $instituteId ${REQUEST_RETURN}`, {
      id: requestId,
      instituteId,
    });
    const row = rows[0];
    if (!row) return null;
    const roles = await readQuery<RoleRow>(ROLE_QUERY, { requestId, instituteId });
    return toRequest(row, roles.map(mapRole));
  },

  async getForRecruiter(requestId: string, recruiterId: string): Promise<RequestWithRoles | null> {
    const rows = await readQuery<RequestRow>(`${REQUEST_BASE} WHERE h.id = $id AND h.recruiterId = $recruiterId ${REQUEST_RETURN}`, {
      id: requestId,
      recruiterId,
    });
    const row = rows[0];
    if (!row) return null;
    const roles = await readQuery<RoleRow>(ROLE_QUERY, { requestId, instituteId: row.request.instituteId });
    return toRequest(row, roles.map(mapRole));
  },

  async listForInstitute(instituteId: string, filters: { status: RequestStatus | null; q: string }): Promise<RequestWithRoles[]> {
    const rows = await readQuery<RequestRow>(
      `${REQUEST_BASE}
       WHERE h.instituteId = $instituteId
         AND ($status IS NULL OR h.status = $status)
         AND ($q = '' OR toLower(h.title) CONTAINS $q OR toLower(rec.companyName) CONTAINS $q)
       ${REQUEST_RETURN}`,
      { instituteId, status: filters.status, q: filters.q },
    );
    return Promise.all(
      rows.map(async (row) => {
        const roles = await readQuery<RoleRow>(ROLE_QUERY, { requestId: row.request.id, instituteId });
        return toRequest(row, roles.map(mapRole));
      }),
    );
  },

  async listForRecruiter(recruiterId: string, filters: { status: RequestStatus | null }): Promise<RequestWithRoles[]> {
    const rows = await readQuery<RequestRow>(
      `${REQUEST_BASE}
       WHERE h.recruiterId = $recruiterId
         AND ($status IS NULL OR h.status = $status)
       ${REQUEST_RETURN}`,
      { recruiterId, status: filters.status },
    );
    return Promise.all(
      rows.map(async (row) => {
        const roles = await readQuery<RoleRow>(ROLE_QUERY, { requestId: row.request.id, instituteId: row.request.instituteId });
        return toRequest(row, roles.map(mapRole));
      }),
    );
  },

  async getRoleContext(roleId: string, instituteId: string): Promise<RoleContext | null> {
    const row = await readOne<{
      role: RoleNode;
      request: RequestNode;
      recruiter: { id: string; name: string };
      institute: { id: string; name: string };
      shortlistedCount: number;
    }>(
      `MATCH (rec:Recruiter)-[:SUBMITTED]->(h:HiringRequest {instituteId: $instituteId})-[:CONTAINS_ROLE]->(j:JobRole {id: $roleId, instituteId: $instituteId})
       MATCH (h)-[:SENT_TO]->(i:Institute)
       CALL {
         WITH j
         OPTIONAL MATCH (:Student)-[r:SHORTLISTED_FOR]->(j)
         RETURN count(r) AS shortlistedCount
       }
       RETURN j { .id, .title, .description, .location, .employmentType, .registrationUrl, .criteriaJson,
                  .status, .shortlistStatus, .dispatchedAt, .createdAt, .updatedAt } AS role,
              h { .id, .title, .assessmentInstructions, .status, .recruiterId, .instituteId,
                  .submittedAt, .reviewedAt, .reviewNote, .createdAt, .updatedAt } AS request,
              rec { .id, name: rec.companyName } AS recruiter,
              i { .id, .name } AS institute,
              shortlistedCount`,
      { roleId, instituteId },
    );
    if (!row) return null;
    return {
      role: mapRole({ role: row.role, shortlistedCount: row.shortlistedCount }),
      request: row.request,
      recruiter: row.recruiter,
      institute: row.institute,
    };
  },

  async countForInstitute(instituteId: string, status: RequestStatus): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (h:HiringRequest {instituteId: $instituteId, status: $status}) RETURN count(h) AS total',
      { instituteId, status },
    );
    return row?.total ?? 0;
  },

  async deleteDraft(requestId: string, recruiterId: string): Promise<boolean> {
    return withTransaction(async (tx) => {
      const owned = await tx.run('MATCH (h:HiringRequest {id: $requestId, recruiterId: $recruiterId}) RETURN h.id AS id', {
        requestId,
        recruiterId,
      });
      if (owned.records.length === 0) return false;
      await tx.run('MATCH (h:HiringRequest {id: $requestId})-[:CONTAINS_ROLE]->(j:JobRole) DETACH DELETE j', { requestId });
      await tx.run('MATCH (h:HiringRequest {id: $requestId}) DETACH DELETE h', { requestId });
      return true;
    });
  },

  async countRolesForRequest(requestId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (:HiringRequest {id: $requestId})-[:CONTAINS_ROLE]->(j:JobRole) RETURN count(j) AS total',
      { requestId },
    );
    return row?.total ?? 0;
  },
};
