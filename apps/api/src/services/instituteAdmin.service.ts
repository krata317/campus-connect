import type { InstituteStats, InstituteStudentListItem, Paginated, RequestStatus } from '@campusconnect/shared';
import { studentRepository } from '../repositories/student.repository';
import { requestRepository } from '../repositories/request.repository';
import { shortlistRepository } from '../repositories/shortlist.repository';
import { skillRepository } from '../repositories/skill.repository';
import { calculateCompletion, studentService } from './student.service';
import { notFound } from '../lib/errors';

export const instituteAdminService = {
  /** Every count is scoped to the administrator's own institute. */
  async stats(instituteId: string): Promise<InstituteStats> {
    const [students, skills, requestsAwaitingReview, approvedRequests, notificationsSent, dispatches] = await Promise.all([
      studentRepository.count(instituteId, { q: '' }),
      skillRepository.countAll(instituteId),
      requestRepository.countForInstitute(instituteId, 'SUBMITTED'),
      requestRepository.countForInstitute(instituteId, 'APPROVED'),
      shortlistRepository.countNotifications(instituteId),
      shortlistRepository.countDispatchedRoles(instituteId),
    ]);

    return { students, skills, requestsAwaitingReview, approvedRequests, notificationsSent, dispatches };
  },

  async listStudents(instituteId: string, filters: { q: string; page: number; pageSize: number }): Promise<Paginated<InstituteStudentListItem>> {
    const [total, rows] = await Promise.all([
      studentRepository.count(instituteId, { q: filters.q }),
      studentRepository.list(instituteId, { q: filters.q, page: filters.page, pageSize: filters.pageSize }),
    ]);

    const items: InstituteStudentListItem[] = rows.map((row) => ({
      id: row.student.id,
      fullName: row.student.fullName,
      email: row.student.email,
      city: row.student.city ?? null,
      state: row.student.state ?? null,
      activeBacklogs: row.student.activeBacklogs ?? null,
      createdAt: row.student.createdAt,
      undergradDegree: row.undergrad?.degree ?? null,
      undergradBranch: row.undergrad?.branch ?? null,
      undergradPassingYear: row.undergrad?.passingYear ?? null,
      undergradScoreType: (row.undergrad?.scoreType ?? null) as InstituteStudentListItem['undergradScoreType'],
      undergradScoreValue: row.undergrad?.scoreValue ?? null,
      undergradScoreScale: row.undergrad?.scoreScale ?? null,
      skillCount: row.skillCount ?? 0,
    }));

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  },

  async getStudentDetail(instituteId: string, studentId: string) {
    const profile = await studentRepository.getProfile(studentId, instituteId);
    if (!profile) throw notFound('Student not found');
    const [history, notifications, skills] = await Promise.all([
      studentRepository.shortlistHistory(studentId, instituteId),
      shortlistRepository.countForStudent(studentId, instituteId),
      skillRepository.countAll(instituteId),
    ]);
    return {
      profile,
      completion: calculateCompletion(profile),
      shortlistHistory: history,
      notificationCount: notifications,
      skillCatalogueSize: skills,
    };
  },

  async listRequests(instituteId: string, filters: { status: RequestStatus | null; q: string }) {
    return requestRepository.listForInstitute(instituteId, filters);
  },

  async listDispatches(instituteId: string) {
    return shortlistRepository.listDispatches(instituteId);
  },

  async studentNotifications(instituteId: string, studentId: string) {
    await studentService.getProfile(studentId, instituteId);
    return studentService.listNotifications(studentId, instituteId, 1, 50);
  },
};
