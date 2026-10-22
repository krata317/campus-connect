import type { AdminStats, AdminStudentListItem, Paginated } from '@campusconnect/shared';
import { studentRepository } from '../repositories/student.repository';
import { employerRepository } from '../repositories/employer.repository';
import { requestRepository } from '../repositories/request.repository';
import { shortlistRepository } from '../repositories/shortlist.repository';
import { skillRepository } from '../repositories/skill.repository';
import { calculateCompletion, studentService } from './student.service';
import { notFound } from '../lib/errors';

export const adminService = {
  async stats(): Promise<AdminStats> {
    const [students, skills, pendingEmployers, approvedEmployers, requestsAwaitingReview, approvedRequests, notificationsSent, dispatches] =
      await Promise.all([
        studentRepository.count({ q: '' }),
        skillRepository.countAll(),
        employerRepository.countByStatus('PENDING'),
        employerRepository.countByStatus('APPROVED'),
        requestRepository.countByStatus('SUBMITTED'),
        requestRepository.countByStatus('APPROVED'),
        shortlistRepository.countNotifications(),
        shortlistRepository.countDispatchedRoles(),
      ]);

    return { students, skills, pendingEmployers, approvedEmployers, requestsAwaitingReview, approvedRequests, notificationsSent, dispatches };
  },

  async listStudents(filters: { q: string; page: number; pageSize: number }): Promise<Paginated<AdminStudentListItem>> {
    const [total, rows] = await Promise.all([
      studentRepository.count({ q: filters.q }),
      studentRepository.list({ q: filters.q, page: filters.page, pageSize: filters.pageSize }),
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

  async getStudentDetail(studentId: string) {
    const profile = await studentRepository.getProfile(studentId);
    if (!profile) throw notFound('Student not found');
    const [history, notifications, skills] = await Promise.all([
      studentRepository.shortlistHistory(studentId),
      shortlistRepository.countForStudent(studentId),
      skillRepository.countAll(),
    ]);
    return {
      profile,
      completion: calculateCompletion(profile),
      shortlistHistory: history,
      notificationCount: notifications,
      skillCatalogueSize: skills,
    };
  },

  async listEmployers(params: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | null; q: string }) {
    return employerRepository.list(params);
  },

  async listRequests(params: { status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | null; q: string }) {
    return requestRepository.list({ employerId: null, status: params.status, q: params.q });
  },

  async listDispatches() {
    return shortlistRepository.listDispatches();
  },

  async studentNotifications(studentId: string) {
    await studentService.getProfile(studentId);
    return studentService.listNotifications(studentId, 1, 50);
  },
};
