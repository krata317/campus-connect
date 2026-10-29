import { readOne, readQuery, withTransaction, writeQuery } from '../db/neo4j';
import { nowIso } from '../lib/ids';
import { conflict, notFound } from '../lib/errors';
import type { DispatchSummary, NotificationRecord } from '@campusconnect/shared';

export interface ShortlistEntry {
  studentId: string;
  fullName: string;
  email: string;
  emailNotifications: boolean;
  status: string;
  shortlistedAt: string | null;
  dispatchedAt: string | null;
  notificationId: string | null;
  readAt: string | null;
}

interface NotificationRow {
  notification: NotificationRecord;
}

export const notificationId = (roleId: string, studentId: string): string => `ntf_${roleId}_${studentId}`;

export const shortlistRepository = {
  async listForRole(roleId: string, instituteId: string): Promise<ShortlistEntry[]> {
    return readQuery<ShortlistEntry>(
      `MATCH (s:Student {instituteId: $instituteId})-[r:SHORTLISTED_FOR]->(:JobRole {id: $roleId, instituteId: $instituteId})
       OPTIONAL MATCH (s)-[:RECEIVED]->(n:Notification)-[:ABOUT_ROLE]->(:JobRole {id: $roleId})
       RETURN s.id AS studentId, s.fullName AS fullName, s.email AS email,
              coalesce(s.emailNotifications, true) AS emailNotifications,
              coalesce(r.status, 'DRAFT') AS status, r.shortlistedAt AS shortlistedAt,
              r.dispatchedAt AS dispatchedAt, n.id AS notificationId, n.readAt AS readAt
       ORDER BY s.fullName ASC`,
      { roleId, instituteId },
    );
  },

  async replaceShortlist(roleId: string, instituteId: string, studentIds: string[], adminId: string): Promise<number> {
    const now = nowIso();
    return withTransaction(async (tx) => {
      const roleCheck = await tx.run('MATCH (j:JobRole {id: $roleId, instituteId: $instituteId}) RETURN j.shortlistStatus AS status', {
        roleId,
        instituteId,
      });
      if (roleCheck.records.length === 0) {
        throw notFound('Job role not found');
      }
      if (roleCheck.records[0]?.get('status') === 'DISPATCHED') {
        throw conflict('This role has already been dispatched. The shortlist is locked.');
      }

      await tx.run(
        `MATCH (s:Student {instituteId: $instituteId})-[r:SHORTLISTED_FOR]->(j:JobRole {id: $roleId, instituteId: $instituteId})
         WHERE NOT s.id IN $studentIds
         DELETE r`,
        { roleId, instituteId, studentIds },
      );

      const result = await tx.run(
        `MATCH (j:JobRole {id: $roleId, instituteId: $instituteId})
         UNWIND $studentIds AS studentId
         MATCH (s:Student {id: studentId, instituteId: $instituteId})
         MERGE (s)-[r:SHORTLISTED_FOR]->(j)
         ON CREATE SET r.shortlistedAt = $now, r.adminId = $adminId
         SET r.status = 'DRAFT'
         RETURN count(r) AS total`,
        { roleId, instituteId, studentIds, now, adminId },
      );

      await tx.run(
        `MATCH (j:JobRole {id: $roleId, instituteId: $instituteId})
         SET j.shortlistStatus = CASE WHEN $count = 0 THEN 'NONE' ELSE 'DRAFT' END`,
        { roleId, instituteId, count: result.records[0]?.get('total') ?? 0 },
      );

      return Number(result.records[0]?.get('total') ?? 0);
    });
  },

  async dispatch(input: {
    roleId: string;
    instituteId: string;
    studentIds: string[];
    adminId: string;
    title: string;
    message: string;
  }): Promise<{ dispatched: number; recruiterName: string; roleTitle: string; requestId: string; instituteName: string }> {
    const now = nowIso();

    return withTransaction(async (tx) => {
      const context = await tx.run(
        `MATCH (rec:Recruiter)-[:SUBMITTED]->(h:HiringRequest {instituteId: $instituteId})-[:CONTAINS_ROLE]->(j:JobRole {id: $roleId, instituteId: $instituteId})
         MATCH (h)-[:SENT_TO]->(i:Institute)
         RETURN j.shortlistStatus AS shortlistStatus, j.title AS roleTitle, j.registrationUrl AS registrationUrl,
                h.id AS requestId, h.status AS requestStatus, rec.companyName AS recruiterName, i.name AS instituteName`,
        { roleId: input.roleId, instituteId: input.instituteId },
      );

      const record = context.records[0];
      if (!record) {
        throw notFound('Job role not found');
      }
      if (record.get('requestStatus') !== 'APPROVED') {
        throw conflict('Only approved hiring requests can be dispatched');
      }
      if (record.get('shortlistStatus') === 'DISPATCHED') {
        throw conflict('This role has already been dispatched. Notifications were not sent again.');
      }

      const recruiterName = record.get('recruiterName') as string;
      const roleTitle = record.get('roleTitle') as string;
      const requestId = record.get('requestId') as string;
      const instituteName = record.get('instituteName') as string;
      const registrationUrl = record.get('registrationUrl') as string;

      await tx.run(
        `MATCH (s:Student {instituteId: $instituteId})-[r:SHORTLISTED_FOR]->(j:JobRole {id: $roleId, instituteId: $instituteId})
         WHERE NOT s.id IN $studentIds
         DELETE r`,
        { roleId: input.roleId, instituteId: input.instituteId, studentIds: input.studentIds },
      );

      // The student MATCH includes instituteId, so a crafted student id from
      // another institute silently produces no relationship and no notification.
      const result = await tx.run(
        `MATCH (j:JobRole {id: $roleId, instituteId: $instituteId})
         UNWIND $studentIds AS studentId
         MATCH (s:Student {id: studentId, instituteId: $instituteId})
         MERGE (n:Notification {id: 'ntf_' + $roleId + '_' + studentId})
         ON CREATE SET n.type = 'SHORTLIST', n.title = $title, n.message = $message,
                       n.recruiterName = $recruiterName, n.roleTitle = $roleTitle,
                       n.registrationUrl = $registrationUrl, n.requestId = $requestId,
                       n.roleId = $roleId, n.instituteId = $instituteId, n.createdAt = $now, n.readAt = null,
                       n.status = 'DELIVERED', n.sentByAdminId = $adminId
         MERGE (s)-[:RECEIVED]->(n)
         MERGE (n)-[:ABOUT_ROLE]->(j)
         MERGE (s)-[r:SHORTLISTED_FOR]->(j)
         ON CREATE SET r.shortlistedAt = $now, r.adminId = $adminId
         SET r.status = 'DISPATCHED', r.dispatchedAt = $now
         RETURN count(n) AS dispatched`,
        {
          roleId: input.roleId,
          instituteId: input.instituteId,
          studentIds: input.studentIds,
          adminId: input.adminId,
          title: input.title,
          message: input.message,
          recruiterName,
          roleTitle,
          registrationUrl,
          requestId,
          now,
        },
      );

      await tx.run(
        `MATCH (j:JobRole {id: $roleId, instituteId: $instituteId})
         SET j.shortlistStatus = 'DISPATCHED', j.dispatchedAt = $now, j.updatedAt = $now`,
        { roleId: input.roleId, instituteId: input.instituteId, now },
      );

      return {
        dispatched: Number(result.records[0]?.get('dispatched') ?? 0),
        recruiterName,
        roleTitle,
        requestId,
        instituteName,
      };
    });
  },

  async listForStudent(studentId: string, instituteId: string, page: number, pageSize: number): Promise<NotificationRecord[]> {
    const skip = (page - 1) * pageSize;
    const rows = await readQuery<NotificationRow>(
      `MATCH (:Student {id: $studentId, instituteId: $instituteId})-[:RECEIVED]->(n:Notification)
       RETURN n { .id, .type, .title, .message, .recruiterName, .roleTitle, .registrationUrl,
                  .createdAt, .readAt, .roleId, .requestId } AS notification
       ORDER BY n.createdAt DESC
       SKIP toInteger($skip) LIMIT toInteger($limit)`,
      { studentId, instituteId, skip, limit: pageSize },
    );
    return rows.map((row) => ({
      ...row.notification,
      roleId: row.notification.roleId ?? '',
      requestId: row.notification.requestId ?? '',
      readAt: row.notification.readAt ?? null,
    }));
  },

  async recentForStudent(studentId: string, instituteId: string, limit: number): Promise<NotificationRecord[]> {
    return this.listForStudent(studentId, instituteId, 1, limit);
  },

  async countForStudent(studentId: string, instituteId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (:Student {id: $studentId, instituteId: $instituteId})-[:RECEIVED]->(n:Notification) RETURN count(n) AS total',
      { studentId, instituteId },
    );
    return row?.total ?? 0;
  },

  async countUnread(studentId: string, instituteId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (:Student {id: $studentId, instituteId: $instituteId})-[:RECEIVED]->(n:Notification) WHERE n.readAt IS NULL RETURN count(n) AS total',
      { studentId, instituteId },
    );
    return row?.total ?? 0;
  },

  async markRead(studentId: string, instituteId: string, notificationIdValue: string): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (:Student {id: $studentId, instituteId: $instituteId})-[:RECEIVED]->(n:Notification {id: $notificationId})
       SET n.readAt = coalesce(n.readAt, $now)
       RETURN n.id AS id`,
      { studentId, instituteId, notificationId: notificationIdValue, now: nowIso() },
    );
    return rows.length > 0;
  },

  async listDispatches(instituteId: string): Promise<DispatchSummary[]> {
    return readQuery<DispatchSummary>(
      `MATCH (rec:Recruiter)-[:SUBMITTED]->(h:HiringRequest {instituteId: $instituteId})-[:CONTAINS_ROLE]->(j:JobRole {instituteId: $instituteId})
       WHERE j.shortlistStatus = 'DISPATCHED'
       CALL {
         WITH j
         OPTIONAL MATCH (:Student)-[r:SHORTLISTED_FOR]->(j)
         RETURN count(r) AS recipientCount
       }
       CALL {
         WITH j
         OPTIONAL MATCH (n:Notification)-[:ABOUT_ROLE]->(j)
         RETURN count(n) AS notificationCount, count(n.readAt) AS readCount
       }
       RETURN j.id AS roleId, j.title AS roleTitle, h.id AS requestId, h.title AS requestTitle,
              rec.companyName AS recruiterName, j.dispatchedAt AS dispatchedAt,
              recipientCount, readCount
       ORDER BY j.dispatchedAt DESC`,
      { instituteId },
    );
  },

  async countDispatchedRoles(instituteId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      "MATCH (j:JobRole {instituteId: $instituteId, shortlistStatus: 'DISPATCHED'}) RETURN count(j) AS total",
      { instituteId },
    );
    return row?.total ?? 0;
  },

  async countNotifications(instituteId: string): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (n:Notification {instituteId: $instituteId}) RETURN count(n) AS total', {
      instituteId,
    });
    return row?.total ?? 0;
  },
};
