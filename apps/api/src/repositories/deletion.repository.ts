import type { ManagedTransaction } from 'neo4j-driver';
import { withTransaction } from '../db/neo4j';
import { nowIso } from '../lib/ids';

/**
 * Permanent account deletion.
 *
 * Each public method runs inside a single write transaction, so an account is
 * either fully deleted or left exactly as it was. Nothing here sends email or
 * talks to the network: the caller verifies the password and sends the goodbye
 * message *before* calling in, so a mail failure can abort before anything is
 * removed.
 *
 * Deleted accounts keep a minimal tombstone (`DeletedStudent`, `DeletedRecruiter`,
 * `DeletedInstitute`) with only an id, the tenant id where relevant, and
 * `deletedAt`. The tombstone keeps historical relationships intact — a shortlist
 * still points at the role, a hiring request still belongs to somebody — while
 * every `MATCH (x:Student)` / `(x:Recruiter)` / `(x:Institute)` in the rest of the
 * codebase stops seeing it, which is what removes the account from active lists
 * without touching a single read query.
 */

const STUDENT_PERSONAL_PROPERTIES = [
  'fullName',
  'email',
  'passwordHash',
  'dateOfBirth',
  'gender',
  'phone',
  'city',
  'state',
  'linkedin',
  'github',
  'portfolio',
  'activeBacklogs',
  'emailNotifications',
  'createdAt',
  'updatedAt',
];

const RECRUITER_PERSONAL_PROPERTIES = [
  'email',
  'username',
  'passwordHash',
  'companyName',
  'companyNameKey',
  'website',
  'contactPersonName',
  'contactPhone',
  'description',
  'emailNotifications',
  'createdAt',
  'updatedAt',
];

const INSTITUTE_CONFIG_PROPERTIES = [
  'name',
  'aisheCode',
  'state',
  'district',
  'website',
  'contactEmail',
  'contactPhone',
  'active',
  'studentCodeHash',
  'studentCodeUpdatedAt',
  'createdAt',
  'updatedAt',
];

const removeList = (alias: string, properties: string[]): string =>
  properties.map((property) => `REMOVE ${alias}.${property}`).join('\n');

/** Removes the sessions, reset tokens and pending registrations of accounts that no longer exist. */
async function purgeCredentials(tx: ManagedTransaction, accountIds: string[], emails: (string | null)[]): Promise<void> {
  if (accountIds.length > 0) {
    await tx.run('MATCH (s:Session) WHERE s.userId IN $ids DELETE s', { ids: accountIds });
    await tx.run('MATCH (r:PasswordReset) WHERE r.accountId IN $ids DELETE r', { ids: accountIds });
  }
  const addresses = emails.filter((email): email is string => Boolean(email));
  if (addresses.length > 0) {
    await tx.run('MATCH (p:PendingRegistration) WHERE p.email IN $emails DELETE p', { emails: addresses });
  }
}

export const deletionRepository = {
  /**
   * Deletes one student: profile, education, experience, notifications and skill
   * links go; the shortlist relationship stays so the institute keeps an accurate
   * dispatch history.
   */
  async deleteStudent(studentId: string, instituteId: string): Promise<boolean> {
    const now = nowIso();
    return withTransaction(async (tx) => {
      const found = await tx.run('MATCH (s:Student {id: $studentId, instituteId: $instituteId}) RETURN s.email AS email', {
        studentId,
        instituteId,
      });
      if (found.records.length === 0) return false;
      const email = (found.records[0]?.get('email') as string | null) ?? null;

      await tx.run(
        `MATCH (s:Student {id: $studentId, instituteId: $instituteId})
         OPTIONAL MATCH (s)-[:HAS_EDUCATION|HAS_EXPERIENCE]->(child)
         WITH child WHERE child IS NOT NULL
         DETACH DELETE child`,
        { studentId, instituteId },
      );
      await tx.run(
        `MATCH (s:Student {id: $studentId, instituteId: $instituteId})-[:RECEIVED]->(n:Notification)
         DETACH DELETE n`,
        { studentId, instituteId },
      );
      await tx.run(
        `MATCH (s:Student {id: $studentId, instituteId: $instituteId})-[link:HAS_SKILL]->(:Skill)
         DELETE link`,
        { studentId, instituteId },
      );
      // Relabelling last: every statement above still needs the :Student label.
      await tx.run(
        `MATCH (s:Student {id: $studentId, instituteId: $instituteId})
         SET s:DeletedStudent
         REMOVE s:Student
         ${removeList('s', STUDENT_PERSONAL_PROPERTIES)}
         SET s.deletedAt = $now`,
        { studentId, instituteId, now },
      );

      await purgeCredentials(tx, [studentId], email ? [email] : []);
      return true;
    });
  },

  /**
   * Deletes a recruiter account. Their hiring requests are kept — institutes and
   * students still need the history — but the request pages become read-only
   * because the recruiter node is no longer a `Recruiter`.
   */
  async deleteRecruiter(recruiterId: string): Promise<boolean> {
    const now = nowIso();
    return withTransaction(async (tx) => {
      const found = await tx.run('MATCH (r:Recruiter {id: $recruiterId}) RETURN r.email AS email', { recruiterId });
      if (found.records.length === 0) return false;
      const email = (found.records[0]?.get('email') as string | null) ?? null;

      await tx.run(
        `MATCH (r:Recruiter {id: $recruiterId})
         SET r:DeletedRecruiter
         REMOVE r:Recruiter
         ${removeList('r', RECRUITER_PERSONAL_PROPERTIES)}
         SET r.deletedAt = $now`,
        { recruiterId, now },
      );

      await purgeCredentials(tx, [recruiterId], email ? [email] : []);
      return true;
    });
  },

  /**
   * Deletes an institute, its administrator accounts, every student it holds and
   * its skill catalogue, in one transaction. Hiring requests stay so recruiters
   * keep their history.
   */
  async deleteInstitute(instituteId: string): Promise<boolean> {
    const now = nowIso();
    return withTransaction(async (tx) => {
      const found = await tx.run('MATCH (i:Institute {id: $instituteId}) RETURN i.id AS id', { instituteId });
      if (found.records.length === 0) return false;

      // Two label-scoped reads so the instituteId indexes are used.
      const students = await tx.run('MATCH (a:Student {instituteId: $instituteId}) RETURN a.id AS id, a.email AS email', {
        instituteId,
      });
      const admins = await tx.run(
        'MATCH (a:InstituteAdmin {instituteId: $instituteId}) RETURN a.id AS id, a.email AS email',
        { instituteId },
      );
      const accountRows = [...students.records, ...admins.records];
      const accountIds = accountRows.map((record) => record.get('id') as string);
      const emails = accountRows.map((record) => record.get('email') as string | null);

      await tx.run(
        `MATCH (s:Student {instituteId: $instituteId})
         OPTIONAL MATCH (s)-[:HAS_EDUCATION|HAS_EXPERIENCE]->(child)
         WITH child WHERE child IS NOT NULL
         DETACH DELETE child`,
        { instituteId },
      );
      await tx.run(
        `MATCH (s:Student {instituteId: $instituteId})-[:RECEIVED]->(n:Notification)
         DETACH DELETE n`,
        { instituteId },
      );
      await tx.run(
        `MATCH (s:Student {instituteId: $instituteId})-[link:HAS_SKILL]->(:Skill)
         DELETE link`,
        { instituteId },
      );
      await tx.run(
        `MATCH (s:Student {instituteId: $instituteId})
         SET s:DeletedStudent
         REMOVE s:Student
         ${removeList('s', STUDENT_PERSONAL_PROPERTIES)}
         SET s.deletedAt = $now`,
        { instituteId, now },
      );

      // Administrator accounts have no historical value: remove them outright.
      await tx.run('MATCH (a:InstituteAdmin {instituteId: $instituteId}) DETACH DELETE a', { instituteId });
      await tx.run('MATCH (n:Notification {instituteId: $instituteId}) DETACH DELETE n', { instituteId });
      // The skill catalogue is institute configuration, so it goes too. Historical
      // roles keep their criteria JSON; the skill ids simply stop resolving.
      await tx.run('MATCH (k:Skill {instituteId: $instituteId}) DETACH DELETE k', { instituteId });

      await tx.run(
        `MATCH (i:Institute {id: $instituteId})
         SET i:DeletedInstitute
         REMOVE i:Institute
         ${removeList('i', INSTITUTE_CONFIG_PROPERTIES)}
         SET i.deletedAt = $now`,
        { instituteId, now },
      );

      await purgeCredentials(tx, accountIds, emails);
      return true;
    });
  },
};
