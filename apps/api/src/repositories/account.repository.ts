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
}

interface RawAccountRow {
  labels: string[];
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  active: boolean | null;
  approvalStatus: string | null;
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
  };
};

export const accountRepository = {
  async findByEmail(email: string): Promise<AccountRow[]> {
    const rows = await readQuery<RawAccountRow>(
      `MATCH (a) WHERE (a:Admin OR a:Student OR a:EmployerAccount) AND a.email = $email
       OPTIONAL MATCH (c:Company)-[:HAS_ACCOUNT]->(a)
       RETURN labels(a) AS labels, a.id AS id, a.email AS email, a.passwordHash AS passwordHash,
              coalesce(a.fullName, a.name, c.name) AS displayName, a.active AS active, a.approvalStatus AS approvalStatus`,
      { email },
    );
    return rows.map(toAccount).filter((row): row is AccountRow => row !== null);
  },

  async findById(kind: AccountKind, id: string): Promise<AccountRow | null> {
    const label = kind === 'ADMIN' ? 'Admin' : kind === 'STUDENT' ? 'Student' : 'EmployerAccount';
    const rows = await readQuery<RawAccountRow>(
      `MATCH (a:${label} {id: $id})
       OPTIONAL MATCH (c:Company)-[:HAS_ACCOUNT]->(a)
       RETURN labels(a) AS labels, a.id AS id, a.email AS email, a.passwordHash AS passwordHash,
              coalesce(a.fullName, a.name, c.name) AS displayName, a.active AS active, a.approvalStatus AS approvalStatus`,
      { id },
    );
    const mapped = rows.map(toAccount).filter((row): row is AccountRow => row !== null);
    return mapped[0] ?? null;
  },

  async countAdmins(): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (a:Admin) RETURN count(a) AS total');
    return row?.total ?? 0;
  },

  async createAdmin(input: { email: string; passwordHash: string; name: string }): Promise<{ id: string; email: string }> {
    const id = newId('adm');
    const now = nowIso();
    await writeQuery(
      `CREATE (a:Admin {id: $id, email: $email, passwordHash: $passwordHash, name: $name, active: true, createdAt: $now})`,
      { id, email: input.email, passwordHash: input.passwordHash, name: input.name, now },
    );
    return { id, email: input.email };
  },

  async createStudent(input: { fullName: string; email: string; passwordHash: string; dateOfBirth: string | null }): Promise<string> {
    const id = newId('stu');
    const now = nowIso();
    await writeQuery(
      `CREATE (s:Student {
         id: $id, fullName: $fullName, email: $email, passwordHash: $passwordHash,
         dateOfBirth: $dateOfBirth, createdAt: $now, updatedAt: $now
       })`,
      { id, fullName: input.fullName, email: input.email, passwordHash: input.passwordHash, dateOfBirth: input.dateOfBirth, now },
    );
    return id;
  },

  async claimBootstrapLock(token: string): Promise<boolean> {
    // MERGE writes, so this must run in a write transaction.
    const rows = await writeQuery<{ mine: boolean }>(
      `MERGE (b:BootstrapLock {id: 'admin-bootstrap'})
       ON CREATE SET b.owner = $token, b.claimedAt = $now
       RETURN b.owner = $token AS mine`,
      { token, now: nowIso() },
    );
    return rows[0]?.mine === true;
  },

  async releaseBootstrapLock(token: string): Promise<void> {
    await writeQuery("MATCH (b:BootstrapLock {id: 'admin-bootstrap'}) WHERE b.owner = $token DELETE b", { token });
  },
};
