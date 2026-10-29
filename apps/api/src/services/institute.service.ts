import type { InstituteSummary } from '@campusconnect/shared';
import { instituteRepository } from '../repositories/institute.repository';
import { generateStudentCode, hashStudentCode } from '../lib/tokens';
import { notFound } from '../lib/errors';

export const instituteService = {
  /** Public list used by the student registration form. Never exposes codes. */
  async listPublic(): Promise<InstituteSummary[]> {
    return instituteRepository.listActive();
  },

  async count(): Promise<number> {
    return instituteRepository.count();
  },

  /** Settings view: the code itself is never returned, only when it last changed. */
  async getSettings(instituteId: string) {
    const institute = await instituteRepository.findById(instituteId);
    if (!institute) throw notFound('Institute not found');
    return {
      id: institute.id,
      aisheCode: institute.aisheCode,
      name: institute.name,
      state: institute.state,
      district: institute.district,
      website: institute.website,
      contactEmail: institute.contactEmail,
      contactPhone: institute.contactPhone,
      active: institute.active,
      studentCodeUpdatedAt: institute.studentCodeUpdatedAt,
    };
  },

  async updateProfile(
    instituteId: string,
    changes: { website: string | null; contactEmail: string | null; contactPhone: string | null },
  ) {
    const updated = await instituteRepository.updateProfile(instituteId, changes);
    if (!updated) throw notFound('Institute not found');
    return this.getSettings(instituteId);
  },

  /**
   * Issues a new shared student code and returns it once, in plaintext, to the
   * authenticated administrator. Only the hash is stored. Students who already
   * registered keep their accounts and institute affiliation.
   */
  async rotateStudentCode(instituteId: string): Promise<{ code: string; updatedAt: string }> {
    const institute = await instituteRepository.findById(instituteId);
    if (!institute) throw notFound('Institute not found');

    const code = generateStudentCode();
    await instituteRepository.setStudentCode(instituteId, hashStudentCode(instituteId, code));
    const refreshed = await instituteRepository.findById(instituteId);

    return { code, updatedAt: refreshed?.studentCodeUpdatedAt ?? new Date().toISOString() };
  },
};
