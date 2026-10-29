import { readOne, readQuery, withTransaction } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import type { RecruiterProfile } from '@campusconnect/shared';

interface RecruiterNode {
  id: string;
  email: string;
  username: string;
  companyName: string;
  companyNameKey: string;
  website: string | null;
  contactPersonName: string;
  contactPhone: string;
  description: string | null;
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

const PROJECTION = `r { .id, .email, .username, .companyName, .companyNameKey, .website,
  .contactPersonName, .contactPhone, .description, .emailNotifications, .createdAt, .updatedAt } AS recruiter`;

const toProfile = (node: RecruiterNode): RecruiterProfile => ({
  id: node.id,
  email: node.email,
  companyName: node.companyName,
  website: node.website ?? null,
  contactPersonName: node.contactPersonName ?? '',
  contactPhone: node.contactPhone ?? '',
  description: node.description ?? null,
  emailNotifications: node.emailNotifications !== false,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt ?? node.createdAt,
});

export const recruiterRepository = {
  async findById(id: string): Promise<RecruiterProfile | null> {
    const row = await readOne<{ recruiter: RecruiterNode }>(`MATCH (r:Recruiter {id: $id}) RETURN ${PROJECTION}`, { id });
    return row ? toProfile(row.recruiter) : null;
  },

  async findByEmail(email: string): Promise<(RecruiterProfile & { username: string }) | null> {
    const row = await readOne<{ recruiter: RecruiterNode }>(`MATCH (r:Recruiter {email: $email}) RETURN ${PROJECTION}`, { email });
    return row ? { ...toProfile(row.recruiter), username: row.recruiter.username } : null;
  },

  async findByCompanyKey(companyNameKey: string): Promise<RecruiterProfile | null> {
    const row = await readOne<{ recruiter: RecruiterNode }>(
      `MATCH (r:Recruiter {companyNameKey: $key}) RETURN ${PROJECTION}`,
      { key: companyNameKey },
    );
    return row ? toProfile(row.recruiter) : null;
  },

  async listAll(): Promise<RecruiterProfile[]> {
    const rows = await readQuery<{ recruiter: RecruiterNode }>(`MATCH (r:Recruiter) RETURN ${PROJECTION} ORDER BY toLower(r.companyName) ASC`);
    return rows.map((row) => toProfile(row.recruiter));
  },

  async count(): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (r:Recruiter) RETURN count(r) AS total');
    return row?.total ?? 0;
  },

  /**
   * Creates the recruiter account. Returns null when the email, username or
   * normalised company name is already registered, so the caller can report a
   * conflict instead of a duplicate company.
   */
  async create(input: {
    email: string;
    username: string;
    passwordHash: string;
    companyName: string;
    companyNameKey: string;
    website: string | null;
    contactPersonName: string;
    contactPhone: string;
    description: string | null;
  }): Promise<{ recruiterId: string } | null> {
    const recruiterId = newId('rec');
    const now = nowIso();

    return withTransaction(async (tx) => {
      const clash = await tx.run(
        `OPTIONAL MATCH (company:Recruiter {companyNameKey: $companyNameKey})
         OPTIONAL MATCH (emailOwner) WHERE (emailOwner:InstituteAdmin OR emailOwner:Recruiter OR emailOwner:Student) AND emailOwner.email = $email
         OPTIONAL MATCH (usernameOwner) WHERE (usernameOwner:InstituteAdmin OR usernameOwner:Recruiter) AND usernameOwner.username = $username
         RETURN company.id AS companyId, emailOwner.id AS emailOwnerId, usernameOwner.id AS usernameOwnerId`,
        { companyNameKey: input.companyNameKey, email: input.email, username: input.username },
      );
      const record = clash.records[0];
      if (!record) return null;
      if (record.get('companyId') || record.get('emailOwnerId') || record.get('usernameOwnerId')) return null;

      await tx.run(
        `CREATE (r:Recruiter {
           id: $recruiterId, email: $email, username: $username, passwordHash: $passwordHash,
           companyName: $companyName, companyNameKey: $companyNameKey, website: $website,
           contactPersonName: $contactPersonName, contactPhone: $contactPhone, description: $description,
           emailNotifications: true, active: true, createdAt: $now, updatedAt: $now
         })`,
        { recruiterId, now, ...input },
      );

      return { recruiterId };
    });
  },

  async updateProfile(
    recruiterId: string,
    changes: {
      companyName: string;
      companyNameKey: string;
      website: string | null;
      contactPersonName: string;
      contactPhone: string;
      description: string | null;
    },
  ): Promise<'ok' | 'conflict' | 'not_found'> {
    return withTransaction(async (tx) => {
      const owner = await tx.run('MATCH (r:Recruiter {id: $id}) RETURN r.id AS id', { id: recruiterId });
      if (owner.records.length === 0) return 'not_found';

      const clash = await tx.run(
        'MATCH (other:Recruiter {companyNameKey: $key}) WHERE other.id <> $id RETURN other.id AS id LIMIT 1',
        { key: changes.companyNameKey, id: recruiterId },
      );
      if (clash.records.length > 0) return 'conflict';

      await tx.run('MATCH (r:Recruiter {id: $id}) SET r += $changes, r.updatedAt = $now', {
        id: recruiterId,
        changes,
        now: nowIso(),
      });
      return 'ok';
    });
  },
};
