import { skillRepository, type SkillRow } from '../repositories/skill.repository';
import { conflict, notFound } from '../lib/errors';
import { isConstraintError } from '../db/neo4j';
import { normalizeSkillKey } from '../lib/ids';

export const skillService = {
  async listActive(instituteId: string): Promise<SkillRow[]> {
    return skillRepository.list(instituteId, { q: '', activeOnly: true });
  },

  async listAll(instituteId: string): Promise<SkillRow[]> {
    return skillRepository.list(instituteId, { q: '', activeOnly: false });
  },

  async listForAdmin(instituteId: string, q: string): Promise<SkillRow[]> {
    return skillRepository.list(instituteId, { q, activeOnly: false });
  },

  async create(instituteId: string, name: string): Promise<SkillRow> {
    const nameKey = normalizeSkillKey(name);
    const existing = await skillRepository.findByNameKey(nameKey, instituteId);
    if (existing) {
      throw conflict(`The skill "${existing.name}" already exists in this institute's catalogue`);
    }
    try {
      return await skillRepository.create(name, instituteId);
    } catch (error) {
      if (isConstraintError(error)) {
        throw conflict('A skill with this name already exists in this institute\'s catalogue');
      }
      throw error;
    }
  },

  async update(instituteId: string, id: string, changes: { name?: string; active?: boolean }): Promise<SkillRow> {
    const skill = await skillRepository.findById(id, instituteId);
    if (!skill) throw notFound('Skill not found');

    if (changes.name !== undefined) {
      const nameKey = normalizeSkillKey(changes.name);
      const existing = await skillRepository.findByNameKey(nameKey, instituteId);
      if (existing && existing.id !== id) {
        throw conflict(`The skill "${existing.name}" already exists in this institute's catalogue`);
      }
    }

    try {
      await skillRepository.update(id, instituteId, changes);
    } catch (error) {
      if (isConstraintError(error)) {
        throw conflict('A skill with this name already exists in this institute\'s catalogue');
      }
      throw error;
    }

    const updated = await skillRepository.findById(id, instituteId);
    if (!updated) throw notFound('Skill not found');
    return updated;
  },
};
