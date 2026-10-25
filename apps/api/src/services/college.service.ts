import type { College, CollegeSummary } from '@campusconnect/shared';
import { collegeSlugSchema } from '@campusconnect/shared';
import { collegeRepository, type CollegeInput } from '../repositories/college.repository';
import { hashPassword } from '../lib/password';
import { badRequest, conflict, notFound } from '../lib/errors';

export interface OnboardInput extends CollegeInput {
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

export const collegeService = {
  /** Public registration list: active colleges only, minimal fields. */
  async listPublic(): Promise<CollegeSummary[]> {
    const colleges = await collegeRepository.listActive();
    return colleges.map((college) => ({ id: college.id, name: college.name, slug: college.slug }));
  },

  async getBySlug(slug: string): Promise<College> {
    const college = await collegeRepository.findBySlug(slug);
    if (!college) throw notFound('College not found');
    return college;
  },

  async count(): Promise<number> {
    return collegeRepository.count();
  },

  /**
   * Privileged onboarding: creates a college and its first administrator.
   * Only reachable from the CLI (`npm run admin:bootstrap`), never from an
   * unauthenticated HTTP route.
   */
  async onboard(input: OnboardInput): Promise<{ college: College; adminEmail: string }> {
    // The CLI validates the slug, but the service does not rely on that: an
    // invalid tenant identifier must never reach the graph.
    const slugResult = collegeSlugSchema.safeParse(input.slug);
    if (!slugResult.success) {
      throw badRequest(`Invalid college identifier: ${slugResult.error.issues[0]?.message ?? 'unknown error'}`);
    }
    const slug = slugResult.data;

    const passwordHash = await hashPassword(input.adminPassword);
    const created = await collegeRepository.createWithAdmin(
      { ...input, slug },
      {
        email: input.adminEmail,
        passwordHash,
        name: input.adminName,
      },
    );

    if (!created) {
      throw conflict(
        `A college with the identifier "${slug}" already exists, or the administrator email is already in use. Nothing was created.`,
      );
    }

    const college = await collegeRepository.findById(created.collegeId);
    if (!college) throw notFound('College could not be loaded after creation');
    return { college, adminEmail: input.adminEmail };
  },
};
