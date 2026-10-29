import { readOne, readQuery, withTransaction, writeQuery } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import { hashStudentCode } from '../lib/tokens';
import type { Institute, InstituteSummary } from '@campusconnect/shared';

interface InstituteNode {
  id: string;
  aisheCode: string;
  name: string;
  state: string;
  district: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  studentCodeHash: string | null;
  studentCodeUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROJECTION = `i { .id, .aisheCode, .name, .state, .district, .website, .contactEmail,
  .contactPhone, .active, .studentCodeHash, .studentCodeUpdatedAt, .createdAt, .updatedAt } AS institute`;

const toInstitute = (node: InstituteNode): Institute & { studentCodeHash: string | null; studentCodeUpdatedAt: string | null } => ({
  id: node.id,
  aisheCode: node.aisheCode,
  name: node.name,
  state: node.state,
  district: node.district,
  website: node.website ?? null,
  contactEmail: node.contactEmail ?? null,
  contactPhone: node.contactPhone ?? null,
  active: node.active !== false,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt ?? node.createdAt,
  studentCodeHash: node.studentCodeHash ?? null,
  studentCodeUpdatedAt: node.studentCodeUpdatedAt ?? null,
});

export type InstituteRecord = ReturnType<typeof toInstitute>;

export interface CreateInstituteInput {
  aisheCode: string;
  name: string;
  state: string;
  district: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Plaintext student code; only its keyed hash is stored. */
  studentCode: string;
}

export const instituteRepository = {
  async listActive(): Promise<InstituteSummary[]> {
    const rows = await readQuery<{ institute: InstituteNode }>(
      `MATCH (i:Institute) WHERE i.active = true
       RETURN ${PROJECTION}
       ORDER BY toLower(i.name) ASC`,
    );
    return rows.map(({ institute }) => ({
      id: institute.id,
      name: institute.name,
      aisheCode: institute.aisheCode,
      state: institute.state,
      district: institute.district,
    }));
  },

  async findById(id: string): Promise<InstituteRecord | null> {
    const row = await readOne<{ institute: InstituteNode }>(`MATCH (i:Institute {id: $id}) RETURN ${PROJECTION}`, { id });
    return row ? toInstitute(row.institute) : null;
  },

  async findByAisheCode(aisheCode: string): Promise<InstituteRecord | null> {
    const row = await readOne<{ institute: InstituteNode }>(
      `MATCH (i:Institute {aisheCode: $aisheCode}) RETURN ${PROJECTION}`,
      { aisheCode },
    );
    return row ? toInstitute(row.institute) : null;
  },

  async count(): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (i:Institute) RETURN count(i) AS total');
    return row?.total ?? 0;
  },

  /**
   * Creates the institute and its first administrator in one transaction.
   * Returns null when the AISHE code, email or username is already taken, so
   * the caller can report a conflict instead of a partial registration.
   */
  async createWithAdmin(
    institute: CreateInstituteInput,
    admin: { email: string; username: string; passwordHash: string; fullName: string },
  ): Promise<{ instituteId: string; adminId: string } | null> {
    const instituteId = newId('ins');
    const adminId = newId('iad');
    const now = nowIso();

    return withTransaction(async (tx) => {
      const clash = await tx.run(
        `OPTIONAL MATCH (existing:Institute {aisheCode: $aisheCode})
         OPTIONAL MATCH (emailOwner) WHERE (emailOwner:InstituteAdmin OR emailOwner:Recruiter OR emailOwner:Student) AND emailOwner.email = $email
         OPTIONAL MATCH (usernameOwner) WHERE (usernameOwner:InstituteAdmin OR usernameOwner:Recruiter) AND usernameOwner.username = $username
         RETURN existing.id AS instituteId, emailOwner.id AS emailOwnerId, usernameOwner.id AS usernameOwnerId`,
        { aisheCode: institute.aisheCode, email: admin.email, username: admin.username },
      );
      const record = clash.records[0];
      if (!record) return null;
      if (record.get('instituteId') || record.get('emailOwnerId') || record.get('usernameOwnerId')) return null;

      await tx.run(
        `CREATE (i:Institute {
           id: $instituteId, aisheCode: $aisheCode, name: $name, state: $state, district: $district,
           website: $website, contactEmail: $contactEmail, contactPhone: $contactPhone,
           active: true, studentCodeHash: $studentCodeHash, studentCodeUpdatedAt: $now,
           createdAt: $now, updatedAt: $now
         })
         CREATE (a:InstituteAdmin {
           id: $adminId, email: $email, username: $username, passwordHash: $passwordHash,
           fullName: $fullName, instituteId: $instituteId, emailNotifications: true,
           active: true, createdAt: $now, updatedAt: $now
         })
         CREATE (a)-[:ADMINISTERS]->(i)`,
        {
          instituteId,
          aisheCode: institute.aisheCode,
          name: institute.name,
          state: institute.state,
          district: institute.district,
          website: institute.website,
          contactEmail: institute.contactEmail,
          contactPhone: institute.contactPhone,
          studentCodeHash: hashStudentCode(instituteId, institute.studentCode),
          adminId,
          email: admin.email,
          username: admin.username,
          passwordHash: admin.passwordHash,
          fullName: admin.fullName,
          now,
        },
      );

      return { instituteId, adminId };
    });
  },

  async updateProfile(
    instituteId: string,
    changes: { website?: string | null; contactEmail?: string | null; contactPhone?: string | null },
  ): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      'MATCH (i:Institute {id: $id}) SET i += $changes, i.updatedAt = $now RETURN i.id AS id',
      { id: instituteId, changes, now: nowIso() },
    );
    return rows.length > 0;
  },

  async setStudentCode(instituteId: string, studentCodeHash: string): Promise<void> {
    await writeQuery(
      'MATCH (i:Institute {id: $id}) SET i.studentCodeHash = $hash, i.studentCodeUpdatedAt = $now, i.updatedAt = $now',
      { id: instituteId, hash: studentCodeHash, now: nowIso() },
    );
  },
};
