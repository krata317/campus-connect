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

const SKILL_QUERY = `MATCH (k:Skill)
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
  async list(params: { q: string; activeOnly: boolean }): Promise<SkillRow[]> {
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, q: params.q, activeOnly: params.activeOnly });
    return mapRows(rows);
  },

  async findById(id: string): Promise<SkillRow | null> {
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, id });
    const mapped = mapRows(rows);
    return mapped[0] ?? null;
  },

  async findByNameKey(nameKey: string): Promise<SkillRow | null> {
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, nameKey });
    const mapped = mapRows(rows);
    return mapped[0] ?? null;
  },

  async findManyByIds(ids: string[]): Promise<SkillRow[]> {
    if (ids.length === 0) return [];
    const rows = await readQuery<SkillQueryRow>(SKILL_QUERY, { ...defaults, ids });
    return mapRows(rows);
  },

  async create(name: string): Promise<SkillRow> {
    const id = newId('skl');
    const now = nowIso();
    const nameKey = normalizeSkillKey(name);
    await writeQuery('CREATE (k:Skill {id: $id, name: $name, nameKey: $nameKey, active: true, createdAt: $now, updatedAt: $now})', {
      id,
      name,
      nameKey,
      now,
    });
    return { id, name, nameKey, active: true, createdAt: now, updatedAt: now, usageCount: 0 };
  },

  async update(id: string, changes: { name?: string; active?: boolean }): Promise<boolean> {
    const props: Record<string, unknown> = {};
    if (changes.name !== undefined) {
      props.name = changes.name;
      props.nameKey = normalizeSkillKey(changes.name);
    }
    if (changes.active !== undefined) props.active = changes.active;
    if (Object.keys(props).length === 0) return false;
    const rows = await writeQuery<{ id: string }>('MATCH (k:Skill {id: $id}) SET k += $props, k.updatedAt = $now RETURN k.id AS id', {
      id,
      props,
      now: nowIso(),
    });
    return rows.length > 0;
  },

  async countAll(): Promise<number> {
    const row = await readOne<{ total: number }>('MATCH (k:Skill) RETURN count(k) AS total');
    return row?.total ?? 0;
  },
};
