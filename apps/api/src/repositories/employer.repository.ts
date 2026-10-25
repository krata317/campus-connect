import { readOne, readQuery, withTransaction, writeQuery } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import type { EmployerApprovalStatus, ReviewEvent } from '@campusconnect/shared';

export interface CompanyRecord {
  id: string;
  name: string;
  website: string | null;
  contactPersonName: string;
  contactPhone: string;
  contactEmail: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployerAccountRecord {
  id: string;
  email: string;
  approvalStatus: EmployerApprovalStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface EmployerDetail {
  company: CompanyRecord;
  account: EmployerAccountRecord;
  reviewEvents: ReviewEvent[];
}

interface EmployerRow {
  company: CompanyRecord;
  account: EmployerAccountRecord;
  reviewEvents: (ReviewEvent | null)[];
}

const EMPLOYER_QUERY = `MATCH (c:Company {collegeId: $collegeId})-[:HAS_ACCOUNT]->(a:EmployerAccount {collegeId: $collegeId})
WHERE ($id IS NULL OR a.id = $id)
  AND ($status IS NULL OR a.approvalStatus = $status)
  AND ($q = '' OR toLower(c.name) CONTAINS $q OR toLower(a.email) CONTAINS $q)
OPTIONAL MATCH (a)-[:HAS_REVIEW_EVENT]->(ev:ReviewEvent)
WITH c, a, ev
ORDER BY ev.at DESC
RETURN c { .id, .name, .website, .contactPersonName, .contactPhone, .contactEmail, .description, .createdAt, .updatedAt } AS company,
       a { .id, .email, .approvalStatus, .reviewNote, .reviewedAt, .createdAt } AS account,
       collect(ev { .id, .action, .fromStatus, .toStatus, .note, .actorRole, .actorId, .at }) AS reviewEvents
ORDER BY company.name ASC`;

const mapEmployer = (row: EmployerRow): EmployerDetail => ({
  company: row.company,
  account: row.account,
  reviewEvents: (row.reviewEvents ?? []).filter((event): event is ReviewEvent => Boolean(event && event.id)),
});

export const employerRepository = {
  async register(
    input: {
      email: string;
      passwordHash: string;
      companyName: string;
      website: string | null;
      contactPersonName: string;
      contactPhone: string;
      companyEmail: string;
      description: string | null;
    },
    collegeId: string,
  ): Promise<{ employerId: string; companyId: string }> {
    const companyId = newId('cmp');
    const employerId = newId('emp');
    const now = nowIso();

    await withTransaction(async (tx) => {
      const result = await tx.run(
        `MATCH (college:College {id: $collegeId})
         CREATE (c:Company {
           id: $companyId, name: $companyName, website: $website, contactPersonName: $contactPersonName,
           contactPhone: $contactPhone, contactEmail: $companyEmail, description: $description,
           collegeId: $collegeId, createdAt: $now, updatedAt: $now
         })
         CREATE (a:EmployerAccount {
           id: $employerId, email: $email, passwordHash: $passwordHash, approvalStatus: 'PENDING',
           reviewNote: null, reviewedAt: null, collegeId: $collegeId, createdAt: $now
         })
         CREATE (c)-[:HAS_ACCOUNT]->(a)
         CREATE (c)-[:BELONGS_TO]->(college)
         CREATE (a)-[:BELONGS_TO]->(college)
         RETURN c.id AS id`,
        {
          collegeId,
          companyId,
          employerId,
          email: input.email,
          passwordHash: input.passwordHash,
          companyName: input.companyName,
          website: input.website,
          contactPersonName: input.contactPersonName,
          contactPhone: input.contactPhone,
          companyEmail: input.companyEmail,
          description: input.description,
          now,
        },
      );
      if (result.records.length === 0) {
        throw new Error('College not found');
      }
    });

    return { employerId, companyId };
  },

  async getDetail(employerId: string, collegeId: string): Promise<EmployerDetail | null> {
    const rows = await readQuery<EmployerRow>(EMPLOYER_QUERY, { id: employerId, status: null, q: '', collegeId });
    const mapped = rows.map(mapEmployer);
    return mapped[0] ?? null;
  },

  async list(params: { collegeId: string; status: EmployerApprovalStatus | null; q: string }): Promise<EmployerDetail[]> {
    const rows = await readQuery<EmployerRow>(EMPLOYER_QUERY, {
      id: null,
      status: params.status,
      q: params.q,
      collegeId: params.collegeId,
    });
    return rows.map(mapEmployer);
  },

  async countByStatus(collegeId: string, status: EmployerApprovalStatus): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (a:EmployerAccount {collegeId: $collegeId, approvalStatus: $status}) RETURN count(a) AS total',
      { collegeId, status },
    );
    return row?.total ?? 0;
  },

  async updateCompany(employerId: string, collegeId: string, props: Record<string, unknown>): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (c:Company {collegeId: $collegeId})-[:HAS_ACCOUNT]->(a:EmployerAccount {id: $employerId, collegeId: $collegeId})
       SET c += $props, c.updatedAt = $now
       RETURN c.id AS id`,
      { employerId, collegeId, props, now: nowIso() },
    );
    return rows.length > 0;
  },

  async setApprovalStatus(input: {
    employerId: string;
    collegeId: string;
    status: EmployerApprovalStatus;
    note: string | null;
    adminId: string;
  }): Promise<{ previousStatus: EmployerApprovalStatus; companyName: string } | null> {
    const now = nowIso();
    return withTransaction(async (tx) => {
      const result = await tx.run(
        `MATCH (c:Company {collegeId: $collegeId})-[:HAS_ACCOUNT]->(a:EmployerAccount {id: $employerId, collegeId: $collegeId})
         RETURN a.approvalStatus AS previousStatus, c.name AS companyName`,
        { employerId: input.employerId, collegeId: input.collegeId },
      );
      const record = result.records[0];
      if (!record) return null;
      const previousStatus = record.get('previousStatus') as EmployerApprovalStatus;
      const companyName = record.get('companyName') as string;

      await tx.run(
        `MATCH (a:EmployerAccount {id: $employerId, collegeId: $collegeId})
         SET a.approvalStatus = $status, a.reviewNote = $note, a.reviewedAt = $now, a.reviewedByAdminId = $adminId
         CREATE (ev:ReviewEvent {
           id: $eventId, action: $action, fromStatus: $previousStatus, toStatus: $status,
           note: $note, actorRole: 'ADMIN', actorId: $adminId, at: $now
         })
         CREATE (a)-[:HAS_REVIEW_EVENT]->(ev)`,
        {
          employerId: input.employerId,
          collegeId: input.collegeId,
          status: input.status,
          note: input.note,
          now,
          adminId: input.adminId,
          eventId: newId('rev'),
          action: input.status === 'APPROVED' ? 'EMPLOYER_APPROVED' : 'EMPLOYER_REJECTED',
          previousStatus,
        },
      );

      return { previousStatus, companyName };
    });
  },

  async getApprovalStatus(employerId: string, collegeId: string): Promise<EmployerApprovalStatus | null> {
    const row = await readOne<{ approvalStatus: EmployerApprovalStatus }>(
      'MATCH (a:EmployerAccount {id: $employerId, collegeId: $collegeId}) RETURN a.approvalStatus AS approvalStatus',
      { employerId, collegeId },
    );
    return row?.approvalStatus ?? null;
  },
};
