import type { JobCriteria, RequestStatus } from '@campusconnect/shared';
import { requestRepository, type RequestWithRoles, type RoleInput } from '../repositories/request.repository';
import { skillRepository } from '../repositories/skill.repository';
import { badRequest, conflict, notFound } from '../lib/errors';
import { canEdit, canSubmit, requiresNote, resolveReviewTransition, statusText, type ReviewAction } from './requestWorkflow';

export interface RequestInput {
  title: string;
  assessmentInstructions: string | null;
  roles: { title: string; description: string; location: string | null; employmentType: string | null; registrationUrl: string; criteria: JobCriteria }[];
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

async function validateSkills(collegeId: string, roles: RoleInput[]): Promise<void> {
  const ids = [...new Set(roles.flatMap((role) => [...role.criteria.requiredSkillIds, ...role.criteria.optionalSkillIds]))];
  if (ids.length === 0) return;

  const skills = await skillRepository.findManyByIds(ids, collegeId);
  const found = new Set(skills.map((skill) => skill.id));
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length > 0) {
    throw badRequest('One or more selected skills are not in your college skill catalogue');
  }
  const inactive = skills.filter((skill) => !skill.active);
  if (inactive.length > 0) {
    throw badRequest(`These skills are no longer offered by the college: ${inactive.map((skill) => skill.name).join(', ')}`);
  }
}

export const requestService = {
  async create(employerId: string, collegeId: string, input: RequestInput, submit: boolean): Promise<RequestWithRoles> {
    if (input.roles.length === 0) {
      throw badRequest('A hiring request needs at least one job role');
    }
    const roles = toRoleInputs(input);
    await validateSkills(collegeId, roles);
    const requestId = await requestRepository.create({
      employerId,
      collegeId,
      title: input.title,
      assessmentInstructions: input.assessmentInstructions,
      roles,
      status: submit ? 'SUBMITTED' : 'DRAFT',
    });
    const created = await requestRepository.getById(requestId, collegeId);
    if (!created) throw notFound('Hiring request could not be loaded after creation');
    return created;
  },

  async update(employerId: string, collegeId: string, requestId: string, input: RequestInput): Promise<RequestWithRoles> {
    const existing = await requestRepository.getById(requestId, collegeId);
    if (!existing) throw notFound('Hiring request not found');
    if (!(await requestRepository.belongsToEmployer(requestId, employerId, collegeId))) {
      throw notFound('Hiring request not found');
    }
    if (!canEdit(existing.status)) {
      throw conflict(`This request is ${statusText(existing.status)} and can no longer be edited`);
    }
    if (input.roles.length === 0) {
      throw badRequest('A hiring request needs at least one job role');
    }

    const roles = toRoleInputs(input);
    await validateSkills(collegeId, roles);
    await requestRepository.update({
      requestId,
      collegeId,
      title: input.title,
      assessmentInstructions: input.assessmentInstructions,
      roles,
      status: existing.status,
    });

    const updated = await requestRepository.getById(requestId, collegeId);
    if (!updated) throw notFound('Hiring request not found');
    return updated;
  },

  async submit(employerId: string, collegeId: string, requestId: string): Promise<RequestWithRoles> {
    const existing = await requestRepository.getById(requestId, collegeId);
    if (!existing) throw notFound('Hiring request not found');
    if (!(await requestRepository.belongsToEmployer(requestId, employerId, collegeId))) {
      throw notFound('Hiring request not found');
    }
    if (!canSubmit(existing.status)) {
      throw conflict(`This request is already ${statusText(existing.status)}`);
    }
    const roleCount = await requestRepository.countRolesForRequest(requestId, collegeId);
    if (roleCount === 0) {
      throw badRequest('Add at least one job role before submitting');
    }

    await requestRepository.submit({ requestId, collegeId, employerId, previousStatus: existing.status });

    const updated = await requestRepository.getById(requestId, collegeId);
    if (!updated) throw notFound('Hiring request not found');
    return updated;
  },

  async remove(employerId: string, collegeId: string, requestId: string): Promise<void> {
    const existing = await requestRepository.getById(requestId, collegeId);
    if (!existing) throw notFound('Hiring request not found');
    if (!(await requestRepository.belongsToEmployer(requestId, employerId, collegeId))) {
      throw notFound('Hiring request not found');
    }
    if (existing.status !== 'DRAFT') {
      throw conflict('Only draft requests can be deleted');
    }
    await requestRepository.deleteDraft(requestId, collegeId);
  },

  async review(adminId: string, collegeId: string, requestId: string, action: ReviewAction, note: string | null): Promise<RequestWithRoles> {
    const existing = await requestRepository.getById(requestId, collegeId);
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
      collegeId,
      adminId,
      status: resolved.transition.to,
      previousStatus: existing.status,
      action: resolved.transition.event,
      note,
    });

    const updated = await requestRepository.getById(requestId, collegeId);
    if (!updated) throw notFound('Hiring request not found');
    return updated;
  },

  async list(params: { collegeId: string; employerId: string | null; status: RequestStatus | null; q: string }): Promise<RequestWithRoles[]> {
    return requestRepository.list(params);
  },

  async getById(requestId: string, collegeId: string): Promise<RequestWithRoles> {
    const request = await requestRepository.getById(requestId, collegeId);
    if (!request) throw notFound('Hiring request not found');
    return request;
  },
};
