import type { AdminStats, AdminStudentListItem, Paginated, RequestStatus } from '@campusconnect/shared';
import { studentRepository } from '../repositories/student.repository';
import { employerRepository } from '../repositories/employer.repository';
import { requestRepository } from '../repositories/request.repository';
import { shortlistRepository } from '../repositories/shortlist.repository';
import { skillRepository } from '../repositories/skill.repository';
import { calculateCompletion, studentService } from './student.service';
import { notFound } from '../lib/errors';

export const adminService = {
  /** Every count is scoped to the administrator's own college. */
  async stats(collegeId: string): Promise<AdminStats> {
    const [students, skills, pendingEmployers, approvedEmployers, requestsAwaitingReview, approvedRequests, notificationsSent, dispatches] =
      await Promise.all([
        studentRepository.count(collegeId, { q: '' }),
        skillRepository.countAll(collegeId),
        employerRepository.countByStatus(collegeId, 'PENDING'),
        employerRepository.countByStatus(collegeId, 'APPROVED'),
        requestRepository.countByStatus(collegeId, 'SUBMITTED'),
        requestRepository.countByStatus(collegeId, 'APPROVED'),
        shortlistRepository.countNotifications(collegeId),
        shortlistRepository.countDispatchedRoles(collegeId),
      ]);

    return { students, skills, pendingEmployers, approvedEmployers, requestsAwaitingReview, approvedRequests, notificationsSent, dispatches };
  },

  async listStudents(collegeId: string, filters: { q: string; page: number; pageSize: number }): Promise<Paginated<AdminStudentListItem>> {
    const [total, rows] = await Promise.all([
      studentRepository.count(collegeId, { q: filters.q }),
      studentRepository.list(collegeId, { q: filters.q, page: filters.page, pageSize: filters.pageSize }),
    ]);

    const items: AdminStudentListItem[] = rows.map((row) => ({
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
      undergradScoreType: (row.undergrad?.scoreType ?? null) as AdminStudentListItem['undergradScoreType'],
      undergradScoreValue: row.undergrad?.scoreValue ?? null,
      undergradScoreScale: row.undergrad?.scoreScale ?? null,
      skillCount: row.skillCount ?? 0,
    }));

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  },

  async getStudentDetail(collegeId: string, studentId: string) {
    const profile = await studentRepository.getProfile(studentId, collegeId);
    if (!profile) throw notFound('Student not found');
    const [history, notifications, skills] = await Promise.all([
      studentRepository.shortlistHistory(studentId, collegeId),
      shortlistRepository.countForStudent(studentId, collegeId),
      skillRepository.countAll(collegeId),
    ]);
    return {
      profile,
      completion: calculateCompletion(profile),
      shortlistHistory: history,
      notificationCount: notifications,
      skillCatalogueSize: skills,
    };
  },

  async listEmployers(params: { collegeId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | null; q: string }) {
    return employerRepository.list(params);
  },

  async listRequests(params: { collegeId: string; status: RequestStatus | null; q: string }) {
    return requestRepository.list({ collegeId: params.collegeId, employerId: null, status: params.status, q: params.q });
  },

  async listDispatches(collegeId: string) {
    return shortlistRepository.listDispatches(collegeId);
  },

  async studentNotifications(collegeId: string, studentId: string) {
    await studentService.getProfile(studentId, collegeId);
    return studentService.listNotifications(studentId, collegeId, 1, 50);
  },
};
