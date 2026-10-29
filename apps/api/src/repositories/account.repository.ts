import { readOne, readQuery, writeQuery } from '../db/neo4j';
import { nowIso } from '../lib/ids';
import type { Role } from '@campusconnect/shared';

export interface AccountRow {
  id: string;
  kind: Role;
  email: string;
  username: string | null;
  passwordHash: string;
  displayName: string;
  emailNotifications: boolean;
  instituteId: string | null;
  instituteName: string | null;
  instituteAisheCode: string | null;
  instituteState: string | null;
  instituteDistrict: string | null;
}

interface RawRow {
  id: string;
  email: string;
  username: string | null;
  passwordHash: string;
  displayName: string | null;
  emailNotifications: boolean | null;
  institute: { id: string; name: string; aisheCode: string; state: string; district: string } | null;
}

const LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  INSTITUTE_ADMIN: 'InstituteAdmin',
  RECRUITER: 'Recruiter',
};

const PROJECTION = `a.id AS id, a.email AS email, a.username AS username, a.passwordHash AS passwordHash,
  coalesce(a.fullName, a.contactPersonName, a.email) AS displayName,
  a.emailNotifications AS emailNotifications,
  i { .id, .name, .aisheCode, .state, .district } AS institute`;

/** Only students and institute administrators belong to an institute. */
const INSTITUTE_LINK: Record<Role, string> = {
  STUDENT: 'OPTIONAL MATCH (a)-[:BELONGS_TO]->(i:Institute)',
  INSTITUTE_ADMIN: 'OPTIONAL MATCH (a)-[:ADMINISTERS]->(i:Institute)',
  RECRUITER: 'OPTIONAL MATCH (i:Institute) WHERE false',
};

const toAccount = (kind: Role, row: RawRow): AccountRow => ({
  id: row.id,
  kind,
  email: row.email,
  username: row.username ?? null,
  passwordHash: row.passwordHash,
  displayName: row.displayName ?? row.email,
  emailNotifications: row.emailNotifications !== false,
  instituteId: row.institute?.id ?? null,
  instituteName: row.institute?.name ?? null,
  instituteAisheCode: row.institute?.aisheCode ?? null,
  instituteState: row.institute?.state ?? null,
  instituteDistrict: row.institute?.district ?? null,
});

async function queryKind(kind: Role, predicate: string, params: Record<string, unknown>): Promise<AccountRow[]> {
  const label = LABELS[kind];
  const rows = await readQuery<RawRow>(
    `MATCH (a:${label})
     WHERE ${predicate}
     ${INSTITUTE_LINK[kind]}
     RETURN ${PROJECTION}`,
    params,
  );
  return rows.map((row) => toAccount(kind, row));
}

export const accountRepository = {
  /** All accounts using this email address (normally zero or one). */
  async findByEmail(email: string): Promise<AccountRow[]> {
    const results = await Promise.all(
      (Object.keys(LABELS) as Role[]).map((kind) => queryKind(kind, 'a.email = $email', { email })),
    );
    return results.flat();
  },

  /** Institute administrators and recruiters may sign in with a username. */
  async findByUsername(username: string): Promise<AccountRow[]> {
    const results = await Promise.all([
      queryKind('INSTITUTE_ADMIN', 'a.username = $username', { username }),
      queryKind('RECRUITER', 'a.username = $username', { username }),
    ]);
    return results.flat();
  },

  async findById(kind: Role, id: string): Promise<AccountRow | null> {
    const rows = await queryKind(kind, 'a.id = $id', { id });
    return rows[0] ?? null;
  },

  /** True when the email is used by any account type. */
  async emailExists(email: string): Promise<boolean> {
    const row = await readOne<{ total: number }>(
      `RETURN COUNT { MATCH (:Student {email: $email}) }
            + COUNT { MATCH (:InstituteAdmin {email: $email}) }
            + COUNT { MATCH (:Recruiter {email: $email}) } AS total`,
      { email },
    );
    return (row?.total ?? 0) > 0;
  },

  async usernameExists(username: string): Promise<boolean> {
    const row = await readOne<{ total: number }>(
      `RETURN COUNT { MATCH (:InstituteAdmin {username: $username}) }
            + COUNT { MATCH (:Recruiter {username: $username}) } AS total`,
      { username },
    );
    return (row?.total ?? 0) > 0;
  },

  async setEmailNotifications(kind: Role, id: string, enabled: boolean): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (a:${LABELS[kind]} {id: $id}) SET a.emailNotifications = $enabled, a.updatedAt = $now RETURN a.id AS id`,
      { id, enabled, now: nowIso() },
    );
    return rows.length > 0;
  },

  async setPassword(kind: Role, id: string, passwordHash: string): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (a:${LABELS[kind]} {id: $id}) SET a.passwordHash = $passwordHash, a.updatedAt = $now RETURN a.id AS id`,
      { id, passwordHash, now: nowIso() },
    );
    return rows.length > 0;
  },

  async updateAdminProfile(adminId: string, fullName: string): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      'MATCH (a:InstituteAdmin {id: $id}) SET a.fullName = $fullName, a.updatedAt = $now RETURN a.id AS id',
      { id: adminId, fullName, now: nowIso() },
    );
    return rows.length > 0;
  },

  /** Used by the seeding command and by account recovery. */
  async findAdminForInstitute(instituteId: string): Promise<AccountRow | null> {
    const rows = await queryKind('INSTITUTE_ADMIN', 'a.instituteId = $instituteId', { instituteId });
    return rows[0] ?? null;
  },
};
