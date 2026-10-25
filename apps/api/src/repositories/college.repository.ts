import { readOne, readQuery, withTransaction, writeQuery } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import type { College } from '@campusconnect/shared';

interface CollegeNode {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const COLLEGE_PROJECTION = `c { .id, .name, .slug, .website, .contactEmail, .contactPhone,
  .active, .createdAt, .updatedAt } AS college`;

const toCollege = (node: CollegeNode): College => ({
  id: node.id,
  name: node.name,
  slug: node.slug,
  website: node.website ?? null,
  contactEmail: node.contactEmail ?? null,
  contactPhone: node.contactPhone ?? null,
  active: node.active !== false,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt ?? node.createdAt,
});

export interface CollegeInput {
  name: string;
  slug: string;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export const collegeRepository = {
  async findBySlug(slug: string): Promise<College | null> {
    const row = await readOne<{ college: CollegeNode }>(
      `MATCH (c:College {slug: $slug}) RETURN ${COLLEGE_PROJECTION}`,
      { slug },
    );
    return row ? toCollege(row.college) : null;
  },

  async findById(id: string): Promise<College | null> {
    const row = await readOne<{ college: CollegeNode }>(`MATCH (c:College {id: $id}) RETURN ${COLLEGE_PROJECTION}`, { id });
    return row ? toCollege(row.college) : null;
  },

  /** Only active colleges are exposed publicly for registration. */
  async listActive(): Promise<College[]> {
    const rows = await readQuery<{ college: CollegeNode }>(
      `MATCH (c:College) WHERE c.active = true RETURN ${COLLEGE_PROJECTION} ORDER BY toLower(c.name) ASC`,
    );
    return rows.map((row) => toCollege(row.college));
  },

  async count(): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (c:College) RETURN count(c) AS total');
    return row?.total ?? 0;
  },

  /**
   * Creates a College and its first administrator in one transaction, so a
   * failure can never leave an orphaned college or an admin without a tenant.
   * Returns `null` when the slug or the admin email is already taken.
   */
  async createWithAdmin(
    college: CollegeInput,
    admin: { email: string; passwordHash: string; name: string },
  ): Promise<{ collegeId: string; adminId: string } | null> {
    const collegeId = newId('col');
    const adminId = newId('adm');
    const now = nowIso();

    return withTransaction(async (tx) => {
      const existingSlug = await tx.run('MATCH (c:College {slug: $slug}) RETURN c.id AS id', { slug: college.slug });
      if (existingSlug.records.length > 0) return null;

      const existingEmail = await tx.run(
        'MATCH (a) WHERE (a:Admin OR a:Student OR a:EmployerAccount) AND a.email = $email RETURN a.id AS id LIMIT 1',
        { email: admin.email },
      );
      if (existingEmail.records.length > 0) return null;

      await tx.run(
        `CREATE (c:College {
           id: $collegeId, name: $name, slug: $slug, website: $website,
           contactEmail: $contactEmail, contactPhone: $contactPhone,
           active: true, createdAt: $now, updatedAt: $now
         })
         CREATE (a:Admin {
           id: $adminId, email: $email, passwordHash: $passwordHash, name: $adminName,
           collegeId: $collegeId, active: true, createdAt: $now
         })
         CREATE (a)-[:ADMINISTERS]->(c)`,
        {
          collegeId,
          name: college.name,
          slug: college.slug,
          website: college.website,
          contactEmail: college.contactEmail,
          contactPhone: college.contactPhone,
          adminId,
          email: admin.email,
          passwordHash: admin.passwordHash,
          adminName: admin.name,
          now,
        },
      );

      return { collegeId, adminId };
    });
  },

  async setActive(id: string, active: boolean): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      'MATCH (c:College {id: $id}) SET c.active = $active, c.updatedAt = $now RETURN c.id AS id',
      { id, active, now: nowIso() },
    );
    return rows.length > 0;
  },
};
