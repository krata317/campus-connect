import type { RecruiterProfile } from '@campusconnect/shared';
import { companyNameKey } from '@campusconnect/shared';
import { recruiterRepository } from '../repositories/recruiter.repository';
import { conflict, notFound } from '../lib/errors';

export const recruiterService = {
  async getProfile(recruiterId: string): Promise<RecruiterProfile> {
    const profile = await recruiterRepository.findById(recruiterId);
    if (!profile) throw notFound('Recruiter account not found');
    return profile;
  },

  async updateProfile(
    recruiterId: string,
    input: {
      companyName: string;
      website: string | null;
      contactPersonName: string;
      contactPhone: string;
      description: string | null;
    },
  ): Promise<RecruiterProfile> {
    const result = await recruiterRepository.updateProfile(recruiterId, {
      ...input,
      companyNameKey: companyNameKey(input.companyName),
    });

    if (result === 'not_found') throw notFound('Recruiter account not found');
    if (result === 'conflict') {
      throw conflict('Another recruiter account already uses that company name.');
    }

    return this.getProfile(recruiterId);
  },
};
