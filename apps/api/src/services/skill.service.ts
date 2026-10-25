import { skillRepository, type SkillRow } from '../repositories/skill.repository';
import { conflict, notFound } from '../lib/errors';
import { isConstraintError } from '../db/neo4j';
import { normalizeSkillKey } from '../lib/ids';

export const skillService = {
  async listActive(collegeId: string): Promise<SkillRow[]> {
    return skillRepository.list(collegeId, { q: '', activeOnly: true });
  },

  async listAll(collegeId: string): Promise<SkillRow[]> {
    return skillRepository.list(collegeId, { q: '', activeOnly: false });
  },

  async listForAdmin(collegeId: string, q: string): Promise<SkillRow[]> {
    return skillRepository.list(collegeId, { q, activeOnly: false });
  },

  async create(collegeId: string, name: string): Promise<SkillRow> {
    const nameKey = normalizeSkillKey(name);
    const existing = await skillRepository.findByNameKey(nameKey, collegeId);
    if (existing) {
      throw conflict(`The skill "${existing.name}" already exists in this college's catalogue`);
    }
    try {
      return await skillRepository.create(name, collegeId);
    } catch (error) {
      if (isConstraintError(error)) {
        throw conflict('A skill with this name already exists in this college\'s catalogue');
      }
      throw error;
    }
  },

  async update(collegeId: string, id: string, changes: { name?: string; active?: boolean }): Promise<SkillRow> {
    const skill = await skillRepository.findById(id, collegeId);
    if (!skill) throw notFound('Skill not found');

    if (changes.name !== undefined) {
      const nameKey = normalizeSkillKey(changes.name);
      const existing = await skillRepository.findByNameKey(nameKey, collegeId);
      if (existing && existing.id !== id) {
        throw conflict(`The skill "${existing.name}" already exists in this college's catalogue`);
      }
    }

    try {
      await skillRepository.update(id, collegeId, changes);
    } catch (error) {
      if (isConstraintError(error)) {
        throw conflict('A skill with this name already exists in this college\'s catalogue');
      }
      throw error;
    }

    const updated = await skillRepository.findById(id, collegeId);
    if (!updated) throw notFound('Skill not found');
    return updated;
  },
};
