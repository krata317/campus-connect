import type { CandidateEvaluation, JobRole, ShortlistStatus } from '@campusconnect/shared';
import { requestRepository } from '../repositories/request.repository';
import { studentRepository } from '../repositories/student.repository';
import { skillRepository } from '../repositories/skill.repository';
import { shortlistRepository } from '../repositories/shortlist.repository';
import { buildSkillNameMap, evaluateCandidate } from './eligibility.service';
import { badRequest, conflict, notFound } from '../lib/errors';

export interface CandidateListResult {
  role: JobRole;
  request: { id: string; title: string; status: string; assessmentInstructions: string | null };
  company: { id: string; name: string };
  candidates: CandidateEvaluation[];
  totalStudents: number;
  eligibleCount: number;
  shortlistCount: number;
}

const composeMessage = (params: {
  companyName: string;
  roleTitle: string;
  assessmentInstructions: string | null;
  adminMessage: string | null;
}): string => {
  const parts = [`The college placement cell has shortlisted you for the role of ${params.roleTitle} at ${params.companyName}.`];
  if (params.assessmentInstructions) {
    parts.push(`Assessment details from the employer: ${params.assessmentInstructions}`);
  }
  if (params.adminMessage) {
    parts.push(params.adminMessage);
  }
  parts.push(
    'This notification records a college nomination. It is not a job offer — use the registration link below to complete the employer’s own application process.',
  );
  return parts.join('\n\n');
};

export const shortlistService = {
  async getRoleContext(roleId: string) {
    const context = await requestRepository.getRoleContext(roleId);
    if (!context) throw notFound('Job role not found');
    return context;
  },

  async getCandidates(roleId: string, eligibleOnly: boolean): Promise<CandidateListResult> {
    const context = await this.getRoleContext(roleId);
    const [skills, students, shortlist] = await Promise.all([
      skillRepository.list({ q: '', activeOnly: false }),
      studentRepository.listForEvaluation(),
      shortlistRepository.listForRole(roleId),
    ]);

    const nameMap = buildSkillNameMap(skills);
    const shortlistMap = new Map<string, ShortlistStatus>(shortlist.map((entry) => [entry.studentId, entry.status as ShortlistStatus]));

    const evaluations = students.map((student) => {
      const evaluation = evaluateCandidate(student, context.role.criteria, nameMap);
      return { ...evaluation, shortlistStatus: shortlistMap.get(student.id) ?? null };
    });

    const eligibleCount = evaluations.filter((evaluation) => evaluation.eligible).length;
    const filtered = eligibleOnly ? evaluations.filter((evaluation) => evaluation.eligible) : evaluations;
    filtered.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.fullName.localeCompare(b.fullName));

    return {
      role: context.role,
      request: {
        id: context.request.id,
        title: context.request.title,
        status: context.request.status,
        assessmentInstructions: context.request.assessmentInstructions,
      },
      company: context.company,
      candidates: filtered,
      totalStudents: students.length,
      eligibleCount,
      shortlistCount: shortlist.length,
    };
  },

  async saveShortlist(roleId: string, studentIds: string[], adminId: string) {
    const context = await this.getRoleContext(roleId);
    if (context.request.status !== 'APPROVED') {
      throw conflict('Only approved hiring requests can be shortlisted');
    }
    const unique = [...new Set(studentIds)];
    const saved = await shortlistRepository.replaceShortlist(roleId, unique, adminId);
    if (saved !== unique.length) {
      throw badRequest('One or more selected students no longer exist');
    }
    return { count: saved, entries: await shortlistRepository.listForRole(roleId) };
  },

  async dispatch(input: { roleId: string; studentIds: string[]; adminId: string; message: string | null }) {
    const context = await this.getRoleContext(input.roleId);
    if (context.request.status !== 'APPROVED') {
      throw conflict('Only approved hiring requests can be dispatched');
    }
    if (context.role.shortlistStatus === 'DISPATCHED') {
      throw conflict('This role has already been dispatched. Notifications were not sent again.');
    }

    const unique = [...new Set(input.studentIds)];
    if (unique.length === 0) {
      throw badRequest('Select at least one student to notify');
    }

    const [skills, students] = await Promise.all([
      skillRepository.list({ q: '', activeOnly: false }),
      studentRepository.listForEvaluation(),
    ]);
    const nameMap = buildSkillNameMap(skills);
    const byId = new Map(students.map((student) => [student.id, student]));

    const missingStudents = unique.filter((id) => !byId.has(id));
    if (missingStudents.length > 0) {
      throw badRequest('One or more selected students no longer exist');
    }

    const ineligible = unique
      .map((id) => evaluateCandidate(byId.get(id) as (typeof students)[number], context.role.criteria, nameMap))
      .filter((evaluation) => !evaluation.eligible)
      .map((evaluation) => ({ studentId: evaluation.studentId, fullName: evaluation.fullName, reasons: evaluation.reasons }));

    if (ineligible.length > 0) {
      throw conflict(
        'Eligibility was re-checked and some selected students no longer meet the role criteria. Remove them and try again.',
        { ineligible },
      );
    }

    const message = composeMessage({
      companyName: context.company.name,
      roleTitle: context.role.title,
      assessmentInstructions: context.request.assessmentInstructions,
      adminMessage: input.message,
    });

    const result = await shortlistRepository.dispatch({
      roleId: input.roleId,
      studentIds: unique,
      adminId: input.adminId,
      title: `Shortlisted for ${context.role.title} at ${context.company.name}`,
      message,
    });

    return {
      dispatched: result.dispatched,
      roleTitle: result.roleTitle,
      companyName: result.companyName,
      requestId: result.requestId,
      entries: await shortlistRepository.listForRole(input.roleId),
    };
  },

  async getShortlist(roleId: string) {
    await this.getRoleContext(roleId);
    return shortlistRepository.listForRole(roleId);
  },

  async listDispatches() {
    return shortlistRepository.listDispatches();
  },
};
