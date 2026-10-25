import { readOne, readQuery, withTransaction, writeQuery } from '../db/neo4j';
import { nowIso } from '../lib/ids';
import { conflict, notFound } from '../lib/errors';
import type { DispatchSummary, NotificationRecord } from '@campusconnect/shared';

export interface ShortlistEntry {
  studentId: string;
  fullName: string;
  email: string;
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
  async listForRole(roleId: string, collegeId: string): Promise<ShortlistEntry[]> {
    return readQuery<ShortlistEntry>(
      `MATCH (s:Student {collegeId: $collegeId})-[r:SHORTLISTED_FOR]->(:JobRole {id: $roleId, collegeId: $collegeId})
       OPTIONAL MATCH (s)-[:RECEIVED]->(n:Notification)-[:ABOUT_ROLE]->(:JobRole {id: $roleId, collegeId: $collegeId})
       RETURN s.id AS studentId, s.fullName AS fullName, s.email AS email,
              coalesce(r.status, 'DRAFT') AS status, r.shortlistedAt AS shortlistedAt,
              r.dispatchedAt AS dispatchedAt, n.id AS notificationId, n.readAt AS readAt
       ORDER BY s.fullName ASC`,
      { roleId, collegeId },
    );
  },

  async replaceShortlist(roleId: string, collegeId: string, studentIds: string[], adminId: string): Promise<number> {
    const now = nowIso();
    return withTransaction(async (tx) => {
      const roleCheck = await tx.run('MATCH (j:JobRole {id: $roleId, collegeId: $collegeId}) RETURN j.shortlistStatus AS status', {
        roleId,
        collegeId,
      });
      if (roleCheck.records.length === 0) {
        throw notFound('Job role not found');
      }
      if (roleCheck.records[0]?.get('status') === 'DISPATCHED') {
        throw conflict('This role has already been dispatched. The shortlist is locked.');
      }

      await tx.run(
        `MATCH (s:Student {collegeId: $collegeId})-[r:SHORTLISTED_FOR]->(j:JobRole {id: $roleId, collegeId: $collegeId})
         WHERE NOT s.id IN $studentIds
         DELETE r`,
        { roleId, collegeId, studentIds },
      );

      const result = await tx.run(
        `MATCH (j:JobRole {id: $roleId, collegeId: $collegeId})
         UNWIND $studentIds AS studentId
         MATCH (s:Student {id: studentId, collegeId: $collegeId})
         MERGE (s)-[r:SHORTLISTED_FOR]->(j)
         ON CREATE SET r.shortlistedAt = $now, r.adminId = $adminId
         SET r.status = 'DRAFT'
         RETURN count(r) AS total`,
        { roleId, collegeId, studentIds, now, adminId },
      );

      await tx.run(
        `MATCH (j:JobRole {id: $roleId, collegeId: $collegeId})
         SET j.shortlistStatus = CASE WHEN $count = 0 THEN 'NONE' ELSE 'DRAFT' END`,
        {
          roleId,
          collegeId,
          count: result.records[0]?.get('total') ?? 0,
        },
      );

      return Number(result.records[0]?.get('total') ?? 0);
    });
  },

  async dispatch(input: {
    roleId: string;
    collegeId: string;
    studentIds: string[];
    adminId: string;
    title: string;
    message: string;
  }): Promise<{ dispatched: number; companyName: string; roleTitle: string; requestId: string }> {
    const now = nowIso();

    return withTransaction(async (tx) => {
      const context = await tx.run(
        `MATCH (c:Company {collegeId: $collegeId})-[:SUBMITTED]->(h:HiringRequest {collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole {id: $roleId, collegeId: $collegeId})
         RETURN j.shortlistStatus AS shortlistStatus, j.title AS roleTitle, j.registrationUrl AS registrationUrl,
                h.id AS requestId, h.status AS requestStatus, c.name AS companyName`,
        { roleId: input.roleId, collegeId: input.collegeId },
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

      const companyName = record.get('companyName') as string;
      const roleTitle = record.get('roleTitle') as string;
      const requestId = record.get('requestId') as string;
      const registrationUrl = record.get('registrationUrl') as string;

      await tx.run(
        `MATCH (s:Student {collegeId: $collegeId})-[r:SHORTLISTED_FOR]->(j:JobRole {id: $roleId, collegeId: $collegeId})
         WHERE NOT s.id IN $studentIds
         DELETE r`,
        { roleId: input.roleId, collegeId: input.collegeId, studentIds: input.studentIds },
      );

      // The student MATCH includes collegeId, so a crafted student id from
      // another tenant silently produces no relationship and no notification.
      const result = await tx.run(
        `MATCH (j:JobRole {id: $roleId, collegeId: $collegeId})
         UNWIND $studentIds AS studentId
         MATCH (s:Student {id: studentId, collegeId: $collegeId})
         MERGE (n:Notification {id: 'ntf_' + $roleId + '_' + studentId})
         ON CREATE SET n.type = 'SHORTLIST', n.title = $title, n.message = $message,
                       n.companyName = $companyName, n.roleTitle = $roleTitle,
                       n.registrationUrl = $registrationUrl, n.requestId = $requestId,
                       n.roleId = $roleId, n.collegeId = $collegeId, n.createdAt = $now, n.readAt = null,
                       n.status = 'DELIVERED', n.sentByAdminId = $adminId
         MERGE (s)-[:RECEIVED]->(n)
         MERGE (n)-[:ABOUT_ROLE]->(j)
         MERGE (s)-[r:SHORTLISTED_FOR]->(j)
         ON CREATE SET r.shortlistedAt = $now, r.adminId = $adminId
         SET r.status = 'DISPATCHED', r.dispatchedAt = $now
         RETURN count(n) AS dispatched`,
        {
          roleId: input.roleId,
          collegeId: input.collegeId,
          studentIds: input.studentIds,
          adminId: input.adminId,
          title: input.title,
          message: input.message,
          companyName,
          roleTitle,
          registrationUrl,
          requestId,
          now,
        },
      );

      await tx.run(
        `MATCH (j:JobRole {id: $roleId, collegeId: $collegeId})
         SET j.shortlistStatus = 'DISPATCHED', j.dispatchedAt = $now, j.updatedAt = $now`,
        { roleId: input.roleId, collegeId: input.collegeId, now },
      );

      return {
        dispatched: Number(result.records[0]?.get('dispatched') ?? 0),
        companyName,
        roleTitle,
        requestId,
      };
    });
  },

  async listForStudent(studentId: string, collegeId: string, page: number, pageSize: number): Promise<NotificationRecord[]> {
    const skip = (page - 1) * pageSize;
    const rows = await readQuery<NotificationRow>(
      `MATCH (:Student {id: $studentId, collegeId: $collegeId})-[:RECEIVED]->(n:Notification)
       RETURN n { .id, .type, .title, .message, .companyName, .roleTitle, .registrationUrl,
                  .createdAt, .readAt, .roleId } AS notification
       ORDER BY n.createdAt DESC
       SKIP toInteger($skip) LIMIT toInteger($limit)`,
      { studentId, collegeId, skip, limit: pageSize },
    );
    return rows.map((row) => ({ ...row.notification, roleId: row.notification.roleId ?? '', readAt: row.notification.readAt ?? null }));
  },

  async recentForStudent(studentId: string, collegeId: string, limit: number): Promise<NotificationRecord[]> {
    return this.listForStudent(studentId, collegeId, 1, limit);
  },

  async countForStudent(studentId: string, collegeId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (:Student {id: $studentId, collegeId: $collegeId})-[:RECEIVED]->(n:Notification) RETURN count(n) AS total',
      { studentId, collegeId },
    );
    return row?.total ?? 0;
  },

  async countUnread(studentId: string, collegeId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      'MATCH (:Student {id: $studentId, collegeId: $collegeId})-[:RECEIVED]->(n:Notification) WHERE n.readAt IS NULL RETURN count(n) AS total',
      { studentId, collegeId },
    );
    return row?.total ?? 0;
  },

  async markRead(studentId: string, collegeId: string, notificationIdValue: string): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (:Student {id: $studentId, collegeId: $collegeId})-[:RECEIVED]->(n:Notification {id: $notificationId})
       SET n.readAt = coalesce(n.readAt, $now)
       RETURN n.id AS id`,
      { studentId, collegeId, notificationId: notificationIdValue, now: nowIso() },
    );
    return rows.length > 0;
  },

  async listDispatches(collegeId: string): Promise<DispatchSummary[]> {
    const rows = await readQuery<{
      roleId: string;
      roleTitle: string;
      requestId: string;
      requestTitle: string;
      companyName: string;
      dispatchedAt: string | null;
      recipientCount: number;
      readCount: number;
    }>(
      `MATCH (c:Company {collegeId: $collegeId})-[:SUBMITTED]->(h:HiringRequest {collegeId: $collegeId})-[:CONTAINS_ROLE]->(j:JobRole {collegeId: $collegeId})
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
              c.name AS companyName, j.dispatchedAt AS dispatchedAt,
              recipientCount, readCount
       ORDER BY j.dispatchedAt DESC`,
      { collegeId },
    );
    return rows;
  },

  async countDispatchedRoles(collegeId: string): Promise<number> {
    const row = await readOne<{ total: number }>(
      "MATCH (j:JobRole {collegeId: $collegeId, shortlistStatus: 'DISPATCHED'}) RETURN count(j) AS total",
      { collegeId },
    );
    return row?.total ?? 0;
  },

  async countNotifications(collegeId: string): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (n:Notification {collegeId: $collegeId}) RETURN count(n) AS total', {
      collegeId,
    });
    return row?.total ?? 0;
  },
};
