import { readOne, readQuery, writeQuery } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';

export type AccountKind = 'ADMIN' | 'STUDENT' | 'EMPLOYER';

export interface AccountRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  kind: AccountKind;
  active: boolean | null;
  approvalStatus: string | null;
  collegeId: string | null;
  collegeName: string | null;
  collegeSlug: string | null;
}

interface RawAccountRow {
  labels: string[];
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  active: boolean | null;
  approvalStatus: string | null;
  college: { id: string; name: string; slug: string } | null;
}

const kindFromLabels = (labels: string[]): AccountKind | null => {
  if (labels.includes('Admin')) return 'ADMIN';
  if (labels.includes('Student')) return 'STUDENT';
  if (labels.includes('EmployerAccount')) return 'EMPLOYER';
  return null;
};

const toAccount = (row: RawAccountRow): AccountRow | null => {
  const kind = kindFromLabels(row.labels);
  if (!kind) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName ?? row.email,
    kind,
    active: row.active,
    approvalStatus: row.approvalStatus,
    collegeId: row.college?.id ?? null,
    collegeName: row.college?.name ?? null,
    collegeSlug: row.college?.slug ?? null,
  };
};

/**
 * The tenant of an account is read from the graph, never from the request.
 * Admins reach their college through ADMINISTERS, everyone else through
 * BELONGS_TO.
 */
const accountQuery = (matchClause: string, whereClause: string): string => `MATCH ${matchClause}
${whereClause}
OPTIONAL MATCH (company:Company)-[:HAS_ACCOUNT]->(a)
OPTIONAL MATCH (a)-[:ADMINISTERS|BELONGS_TO]->(college:College)
RETURN labels(a) AS labels, a.id AS id, a.email AS email, a.passwordHash AS passwordHash,
       coalesce(a.fullName, a.name, company.name) AS displayName, a.active AS active,
       a.approvalStatus AS approvalStatus,
       college { .id, .name, .slug } AS college
ORDER BY a.id`;

export const accountRepository = {
  async findByEmail(email: string): Promise<AccountRow[]> {
    const rows = await readQuery<RawAccountRow>(
      accountQuery('(a)', 'WHERE (a:Admin OR a:Student OR a:EmployerAccount) AND a.email = $email'),
      { email },
    );
    return rows.map(toAccount).filter((row): row is AccountRow => row !== null);
  },

  async findById(kind: AccountKind, id: string): Promise<AccountRow | null> {
    // The label comes from a closed union, never from user input.
    const label = kind === 'ADMIN' ? 'Admin' : kind === 'STUDENT' ? 'Student' : 'EmployerAccount';
    const rows = await readQuery<RawAccountRow>(accountQuery(`(a:${label})`, 'WHERE a.id = $id'), { id });
    const mapped = rows.map(toAccount).filter((row): row is AccountRow => row !== null);
    return mapped[0] ?? null;
  },

  async countAdmins(): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (a:Admin) RETURN count(a) AS total');
    return row?.total ?? 0;
  },

  async countAdminsInCollege(collegeId: string): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (a:Admin {collegeId: $collegeId}) RETURN count(a) AS total', { collegeId });
    return row?.total ?? 0;
  },

  async createStudent(input: {
    fullName: string;
    email: string;
    passwordHash: string;
    dateOfBirth: string | null;
    collegeId: string;
  }): Promise<string> {
    const id = newId('stu');
    const now = nowIso();
    await writeQuery(
      `MATCH (college:College {id: $collegeId})
       CREATE (s:Student {
         id: $id, fullName: $fullName, email: $email, passwordHash: $passwordHash,
         dateOfBirth: $dateOfBirth, collegeId: $collegeId, createdAt: $now, updatedAt: $now
       })
       CREATE (s)-[:BELONGS_TO]->(college)`,
      {
        id,
        fullName: input.fullName,
        email: input.email,
        passwordHash: input.passwordHash,
        dateOfBirth: input.dateOfBirth,
        collegeId: input.collegeId,
        now,
      },
    );
    return id;
  },

  /**
   * Adds an administrator to an existing college. The first administrator of a
   * college is created by the onboarding command; this is the path used when a
   * college has more than one placement officer.
   */
  async createAdminInCollege(
    collegeId: string,
    input: { email: string; passwordHash: string; name: string },
  ): Promise<{ id: string; email: string }> {
    const id = newId('adm');
    const now = nowIso();
    await writeQuery(
      `MATCH (college:College {id: $collegeId})
       CREATE (a:Admin {
         id: $id, email: $email, passwordHash: $passwordHash, name: $name,
         collegeId: $collegeId, active: true, createdAt: $now
       })
       CREATE (a)-[:ADMINISTERS]->(college)`,
      { id, collegeId, email: input.email, passwordHash: input.passwordHash, name: input.name, now },
    );
    return { id, email: input.email };
  },

  /**
   * A per-slug mutex so two operators cannot bootstrap the same college at the
   * same moment. The lock is released when the run finishes.
   */
  async claimBootstrapLock(key: string, token: string): Promise<boolean> {
    // MERGE writes, so this must run in a write transaction.
    const rows = await writeQuery<{ mine: boolean }>(
      `MERGE (b:BootstrapLock {id: $key})
       ON CREATE SET b.owner = $token, b.claimedAt = $now
       RETURN b.owner = $token AS mine`,
      { key, token, now: nowIso() },
    );
    return rows[0]?.mine === true;
  },

  async releaseBootstrapLock(key: string, token: string): Promise<void> {
    await writeQuery('MATCH (b:BootstrapLock {id: $key}) WHERE b.owner = $token DELETE b', { key, token });
  },
};
