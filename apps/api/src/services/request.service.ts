import type { JobCriteria, RequestStatus } from '@campusconnect/shared';
import { requestRepository, type RequestWithRoles, type RoleInput } from '../repositories/request.repository';
import { skillRepository } from '../repositories/skill.repository';
import { instituteRepository } from '../repositories/institute.repository';
import { accountRepository } from '../repositories/account.repository';
import { recruiterRepository } from '../repositories/recruiter.repository';
import { badRequest, conflict, notFound } from '../lib/errors';
import { canEdit, canSubmit, requiresNote, resolveReviewTransition, statusText, type ReviewAction } from './requestWorkflow';
import { emailService } from './email.service';

export interface RequestInput {
  title: string;
  assessmentInstructions: string | null;
  roles: {
    title: string;
    description: string;
    location: string | null;
    employmentType: string | null;
    registrationUrl: string;
    criteria: JobCriteria;
  }[];
}

const toRoleInputs = (input: RequestInput): RoleInput[] =>
  input.roles.map((role) => ({
    title: role.title,
    description: role.description,
    location: role.location,
    employmentType: role.employmentType,
    registrationUrl: role.registrationUrl,
    criteria: role.criteria,
  }));

async function validateSkills(instituteId: string, roles: RoleInput[]): Promise<void> {
  const ids = [...new Set(roles.flatMap((role) => [...role.criteria.requiredSkillIds, ...role.criteria.optionalSkillIds]))];
  if (ids.length === 0) return;

  const skills = await skillRepository.findManyByIds(ids, instituteId);
  const found = new Set(skills.map((skill) => skill.id));
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length > 0) {
    throw badRequest('One or more selected skills are not in the selected institute’s skill catalogue.');
  }
  const inactive = skills.filter((skill) => !skill.active);
  if (inactive.length > 0) {
    throw badRequest(`These skills are no longer offered by the institute: ${inactive.map((skill) => skill.name).join(', ')}`);
  }
}

/** Emails are best effort: they must never undo a committed database change. */
async function notifyInstituteOfSubmission(request: RequestWithRoles): Promise<void> {
  try {
    const admin = await accountRepository.findAdminForInstitute(request.instituteId);
    if (!admin) return;
    await emailService.notifyInstituteNewRequest({
      to: admin.email,
      enabled: admin.emailNotifications,
      instituteName: request.instituteName,
      recruiterName: request.recruiterName,
      requestTitle: request.title,
      roleCount: request.roles.length,
      requestId: request.id,
    });
  } catch {
    // Logged inside the email service.
  }
}

async function notifyRecruiterOfSubmission(request: RequestWithRoles): Promise<void> {
  try {
    const recruiter = await accountRepository.findById('RECRUITER', request.recruiterId);
    if (!recruiter) return;
    await emailService.notifyRecruiterSubmitted({
      to: recruiter.email,
      enabled: recruiter.emailNotifications,
      recruiterName: request.recruiterName,
      instituteName: request.instituteName,
      requestTitle: request.title,
      requestId: request.id,
    });
  } catch {
    // Logged inside the email service.
  }
}

export const requestService = {
  async create(recruiterId: string, input: RequestInput & { instituteId: string }, submit: boolean): Promise<RequestWithRoles> {
    if (input.roles.length === 0) {
      throw badRequest('A hiring request needs at least one job role');
    }

    const institute = await instituteRepository.findById(input.instituteId);
    if (!institute || !institute.active) {
      throw badRequest('Choose a registered institute for this request.');
    }

    const roles = toRoleInputs(input);
    await validateSkills(institute.id, roles);

    const requestId = await requestRepository.create({
      recruiterId,
      instituteId: institute.id,
      title: input.title,
      assessmentInstructions: input.assessmentInstructions,
      roles,
      status: submit ? 'SUBMITTED' : 'DRAFT',
    });

    const created = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!created) throw notFound('Hiring request could not be loaded after creation');

    if (submit) {
      await notifyInstituteOfSubmission(created);
      await notifyRecruiterOfSubmission(created);
    }

    return created;
  },

  async update(recruiterId: string, requestId: string, input: RequestInput): Promise<RequestWithRoles> {
    const existing = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!existing) throw notFound('Hiring request not found');
    if (!canEdit(existing.status)) {
      throw conflict(`This request is ${statusText(existing.status)} and can no longer be edited`);
    }
    if (input.roles.length === 0) {
      throw badRequest('A hiring request needs at least one job role');
    }

    const roles = toRoleInputs(input);
    await validateSkills(existing.instituteId, roles);
    await requestRepository.update({
      requestId,
      recruiterId,
      title: input.title,
      assessmentInstructions: input.assessmentInstructions,
      roles,
      status: existing.status,
    });

    const updated = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!updated) throw notFound('Hiring request not found');
    return updated;
  },

  async submit(recruiterId: string, requestId: string): Promise<RequestWithRoles> {
    const existing = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!existing) throw notFound('Hiring request not found');
    if (!canSubmit(existing.status)) {
      throw conflict(`This request is already ${statusText(existing.status)}`);
    }
    const roleCount = await requestRepository.countRolesForRequest(requestId);
    if (roleCount === 0) {
      throw badRequest('Add at least one job role before submitting');
    }

    await requestRepository.submit({ requestId, recruiterId, previousStatus: existing.status });

    const updated = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!updated) throw notFound('Hiring request not found');

    await notifyInstituteOfSubmission(updated);
    await notifyRecruiterOfSubmission(updated);
    return updated;
  },

  async remove(recruiterId: string, requestId: string): Promise<void> {
    const existing = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!existing) throw notFound('Hiring request not found');
    if (existing.status !== 'DRAFT') {
      throw conflict('Only draft requests can be deleted');
    }
    const removed = await requestRepository.deleteDraft(requestId, recruiterId);
    if (!removed) throw notFound('Hiring request not found');
  },

  async review(
    adminId: string,
    instituteId: string,
    requestId: string,
    action: ReviewAction,
    note: string | null,
  ): Promise<RequestWithRoles> {
    const existing = await requestRepository.getForInstitute(requestId, instituteId);
    if (!existing) throw notFound('Hiring request not found');

    const resolved = resolveReviewTransition(action, existing.status);
    if (!resolved.ok) {
      throw conflict(resolved.reason);
    }
    if (requiresNote(action) && !note) {
      throw badRequest(
        action === 'REJECT'
          ? 'Add a short note so the recruiter understands why the request was rejected'
          : 'Describe the changes the recruiter needs to make',
      );
    }

    await requestRepository.review({
      requestId,
      instituteId,
      adminId,
      status: resolved.transition.to,
      previousStatus: existing.status,
      action: resolved.transition.event,
      note,
    });

    const updated = await requestRepository.getForInstitute(requestId, instituteId);
    if (!updated) throw notFound('Hiring request not found');

    try {
      const recruiter = await accountRepository.findById('RECRUITER', updated.recruiterId);
      if (recruiter) {
        await emailService.notifyRecruiterStatus({
          to: recruiter.email,
          enabled: recruiter.emailNotifications,
          instituteName: updated.instituteName,
          requestTitle: updated.title,
          statusLabel: statusText(updated.status),
          note: updated.reviewNote,
          requestId: updated.id,
        });
      }
    } catch {
      // Logged inside the email service.
    }

    return updated;
  },

  async listForInstitute(instituteId: string, filters: { status: RequestStatus | null; q: string }): Promise<RequestWithRoles[]> {
    return requestRepository.listForInstitute(instituteId, filters);
  },

  async listForRecruiter(recruiterId: string, status: RequestStatus | null): Promise<RequestWithRoles[]> {
    return requestRepository.listForRecruiter(recruiterId, { status });
  },

  async getForInstitute(requestId: string, instituteId: string): Promise<RequestWithRoles> {
    const request = await requestRepository.getForInstitute(requestId, instituteId);
    if (!request) throw notFound('Hiring request not found');
    return request;
  },

  async getForRecruiter(requestId: string, recruiterId: string): Promise<RequestWithRoles> {
    const request = await requestRepository.getForRecruiter(requestId, recruiterId);
    if (!request) throw notFound('Hiring request not found');
    return request;
  },

  /** Institutes a recruiter can address a request to. */
  async listInstitutesForRecruiter() {
    return instituteRepository.listActive();
  },

  /** Used by the recruiter dashboard for a quick summary. */
  async recruiterSummary(recruiterId: string) {
    const recruiter = await recruiterRepository.findById(recruiterId);
    if (!recruiter) throw notFound('Recruiter not found');
    return recruiter;
  },
};
