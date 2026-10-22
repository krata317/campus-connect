import { skillRepository, type SkillRow } from '../repositories/skill.repository';
import { conflict, notFound } from '../lib/errors';
import { isConstraintError } from '../db/neo4j';
import { normalizeSkillKey } from '../lib/ids';

export const skillService = {
  async listActive(): Promise<SkillRow[]> {
    return skillRepository.list({ q: '', activeOnly: true });
  },

  async listAll(): Promise<SkillRow[]> {
    return skillRepository.list({ q: '', activeOnly: false });
  },

  async listForAdmin(q: string): Promise<SkillRow[]> {
    return skillRepository.list({ q, activeOnly: false });
  },

  async create(name: string): Promise<SkillRow> {
    const nameKey = normalizeSkillKey(name);
    const existing = await skillRepository.findByNameKey(nameKey);
    if (existing) {
      throw conflict(`The skill "${existing.name}" already exists in the catalogue`);
    }
    try {
      return await skillRepository.create(name);
    } catch (error) {
      if (isConstraintError(error)) {
        throw conflict('A skill with this name already exists in the catalogue');
      }
      throw error;
    }
  },

  async update(id: string, changes: { name?: string; active?: boolean }): Promise<SkillRow> {
    const skill = await skillRepository.findById(id);
    if (!skill) throw notFound('Skill not found');

    if (changes.name !== undefined) {
      const nameKey = normalizeSkillKey(changes.name);
      const existing = await skillRepository.findByNameKey(nameKey);
      if (existing && existing.id !== id) {
        throw conflict(`The skill "${existing.name}" already exists in the catalogue`);
      }
    }

    try {
      await skillRepository.update(id, changes);
    } catch (error) {
      if (isConstraintError(error)) {
        throw conflict('A skill with this name already exists in the catalogue');
      }
      throw error;
    }

    const updated = await skillRepository.findById(id);
    if (!updated) throw notFound('Skill not found');
    return updated;
  },
};
