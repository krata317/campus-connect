import { readOne, readQuery, writeQuery } from '../db/neo4j';
import { newId, normalizeSkillKey, nowIso } from '../lib/ids';

export interface SkillRow {
  id: string;
  name: string;
  nameKey: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

interface SkillQueryRow {
  skill: Omit<SkillRow, 'usageCount'>;
  usageCount: number;
}

// Skills are per institute: the same name may exist in two institutes, but a
// single institute cannot hold it twice (enforced by a composite constraint).
const SKILL_QUERY = `MATCH (k:Skill {instituteId: $instituteId})
WHERE ($id IS NULL OR k.id = $id)
  AND ($nameKey IS NULL OR k.nameKey = $nameKey)
  AND ($ids IS NULL OR k.id IN $ids)
  AND ($q = '' OR toLower(k.name) CONTAINS $q)
  AND ($activeOnly = false OR k.active = true)
CALL {
  WITH k
  OPTIONAL MATCH (:Student)-[sr:HAS_SKILL]->(k)
  RETURN count(sr) AS studentCount
}
CALL {
  WITH k
  OPTIONAL MATCH (:JobRole)-[jr:REQUIRES_SKILL|PREFERS_SKILL]->(k)
  RETURN count(jr) AS roleCount
}
RETURN k { .id, .name, .nameKey, .active, .createdAt, .updatedAt } AS skill,
       (studentCount + roleCount) AS usageCount
ORDER BY k.name ASC`;

const defaults = { id: null, nameKey: null, ids: null, q: '', activeOnly: false };

const mapRows = (rows: SkillQueryRow[]): SkillRow[] => rows.map((row) => ({ ...row.skill, usageCount: row.usageCount }));

export const skillRepository = {
  async list(instituteId: string, params: { q: string; activeOnly: boolean }): Promise<SkillRow[]> {
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, {
      ...defaults,
      instituteId,
      q: params.q,
      activeOnly: params.activeOnly,
    });
    return mapRows(rows);
  },

  async findById(id: string, instituteId: string): Promise<SkillRow | null> {
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, instituteId, id });
    const mapped = mapRows(rows);
    return mapped[0] ?? null;
  },

  async findByNameKey(nameKey: string, instituteId: string): Promise<SkillRow | null> {
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, instituteId, nameKey });
    const mapped = mapRows(rows);
    return mapped[0] ?? null;
  },

  async findManyByIds(ids: string[], instituteId: string): Promise<SkillRow[]> {
    if (ids.length === 0) return [];
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, instituteId, ids });
    return mapRows(rows);
  },

  async create(name: string, instituteId: string): Promise<SkillRow> {
    const id = newId('skl');
    const now = nowIso();
    const nameKey = normalizeSkillKey(name);
    await writeQuery(
      `MATCH (institute:Institute {id: $instituteId})
       CREATE (k:Skill {
         id: $id, name: $name, nameKey: $nameKey, instituteId: $instituteId,
         active: true, createdAt: $now, updatedAt: $now
       })
       CREATE (k)-[:BELONGS_TO]->(institute)`,
      { id, name, nameKey, instituteId, now },
    );
    return { id, name, nameKey, active: true, createdAt: now, updatedAt: now, usageCount: 0 };
  },

  async update(id: string, instituteId: string, changes: { name?: string; active?: boolean }): Promise<boolean> {
    const props: Record<string, unknown> = {};
    if (changes.name !== undefined) {
      props.name = changes.name;
      props.nameKey = normalizeSkillKey(changes.name);
    }
    if (changes.active !== undefined) props.active = changes.active;
    if (Object.keys(props).length === 0) return false;
    const rows = await writeQuery<{ id: string }>(
      'MATCH (k:Skill {id: $id, instituteId: $instituteId}) SET k += $props, k.updatedAt = $now RETURN k.id AS id',
      { id, instituteId, props, now: nowIso() },
    );
    return rows.length > 0;
  },

  async countAll(instituteId: string): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (k:Skill {instituteId: $instituteId}) RETURN count(k) AS total', { instituteId });
    return row?.total ?? 0;
  },
};
