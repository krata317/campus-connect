import type { EducationLevel, ProfileCompletion, StudentDashboard, StudentProfile } from '@campusconnect/shared';
import { studentRepository } from '../repositories/student.repository';
import { skillRepository } from '../repositories/skill.repository';
import { shortlistRepository } from '../repositories/shortlist.repository';
import { badRequest, notFound } from '../lib/errors';

type EducationPayload = Record<string, unknown>;

const educationProps = (level: EducationLevel, payload: EducationPayload): Record<string, unknown> => {
  if (level === 'CLASS_10') {
    return {
      board: payload.board,
      stream: null,
      degree: null,
      branch: null,
      institution: null,
      passingYear: payload.passingYear,
      scoreType: 'PERCENTAGE',
      scoreValue: payload.scoreValue,
      scoreScale: null,
    };
  }
  if (level === 'CLASS_12') {
    return {
      board: payload.board,
      stream: payload.stream,
      degree: null,
      branch: null,
      institution: null,
      passingYear: payload.passingYear,
      scoreType: 'PERCENTAGE',
      scoreValue: payload.scoreValue,
      scoreScale: null,
    };
  }
  return {
    board: null,
    stream: null,
    degree: payload.degree,
    branch: payload.branch,
    institution: payload.institution,
    passingYear: payload.passingYear,
    scoreType: payload.scoreType,
    scoreValue: payload.scoreValue,
    scoreScale: payload.scoreType === 'CGPA' ? payload.scoreScale : null,
  };
};

const experienceProps = (payload: Record<string, unknown>): Record<string, unknown> => ({
  organization: payload.organization,
  jobTitle: payload.jobTitle,
  startDate: payload.startDate,
  endDate: payload.isCurrent ? null : payload.endDate,
  isCurrent: payload.isCurrent,
  description: payload.description,
});

export const calculateCompletion = (profile: StudentProfile): ProfileCompletion => {
  const has = (value: unknown): boolean => value !== null && value !== undefined && value !== '';
  const levels = new Set(profile.education.map((item) => item.level));

  const checks: { label: string; done: boolean }[] = [
    { label: 'Full name', done: has(profile.fullName) },
    { label: 'Date of birth', done: has(profile.dateOfBirth) },
    { label: 'Phone number', done: has(profile.phone) },
    { label: 'City', done: has(profile.city) },
    { label: 'State', done: has(profile.state) },
    { label: 'LinkedIn profile', done: has(profile.linkedin) },
    { label: 'GitHub profile', done: has(profile.github) },
    { label: 'Portfolio or website', done: has(profile.portfolio) },
    { label: 'Class 10 details', done: levels.has('CLASS_10') },
    { label: 'Class 12 details', done: levels.has('CLASS_12') },
    { label: 'Undergraduate details', done: levels.has('UNDERGRAD') },
    { label: 'At least one skill', done: profile.skills.length > 0 },
    { label: 'Active backlog count', done: profile.activeBacklogs !== null },
  ];

  const completed = checks.filter((check) => check.done).length;
  const total = checks.length;

  return {
    percent: Math.round((completed / total) * 100),
    completed,
    total,
    missing: checks.filter((check) => !check.done).map((check) => check.label),
  };
};

export const studentService = {
  async getProfile(studentId: string): Promise<StudentProfile> {
    const profile = await studentRepository.getProfile(studentId);
    if (!profile) throw notFound('Student profile not found');
    return profile;
  },

  async updateProfile(
    studentId: string,
    payload: {
      fullName: string;
      dateOfBirth: string | null;
      gender: string | null;
      phone: string | null;
      city: string | null;
      state: string | null;
      linkedin: string | null;
      github: string | null;
      portfolio: string | null;
      activeBacklogs: number | null;
    },
  ): Promise<StudentProfile> {
    const existing = await studentRepository.getProfile(studentId);
    if (!existing) throw notFound('Student profile not found');

    await studentRepository.updateProfile(studentId, {
      fullName: payload.fullName,
      dateOfBirth: payload.dateOfBirth,
      gender: payload.gender,
      phone: payload.phone,
      city: payload.city,
      state: payload.state,
      linkedin: payload.linkedin,
      github: payload.github,
      portfolio: payload.portfolio,
      activeBacklogs: payload.activeBacklogs,
    });

    return this.getProfile(studentId);
  },

  async upsertEducation(studentId: string, level: EducationLevel, payload: EducationPayload): Promise<StudentProfile> {
    await studentRepository.upsertEducation(studentId, level, educationProps(level, payload));
    return this.getProfile(studentId);
  },

  async deleteEducation(studentId: string, level: EducationLevel): Promise<StudentProfile> {
    const removed = await studentRepository.deleteEducation(studentId, level);
    if (!removed) throw notFound('That education record does not exist');
    return this.getProfile(studentId);
  },

  async addExperience(studentId: string, payload: Record<string, unknown>): Promise<StudentProfile> {
    await studentRepository.addExperience(studentId, experienceProps(payload));
    return this.getProfile(studentId);
  },

  async updateExperience(studentId: string, experienceId: string, payload: Record<string, unknown>): Promise<StudentProfile> {
    const updated = await studentRepository.updateExperience(studentId, experienceId, experienceProps(payload));
    if (!updated) throw notFound('Experience record not found');
    return this.getProfile(studentId);
  },

  async deleteExperience(studentId: string, experienceId: string): Promise<StudentProfile> {
    const removed = await studentRepository.deleteExperience(studentId, experienceId);
    if (!removed) throw notFound('Experience record not found');
    return this.getProfile(studentId);
  },

  async setSkills(studentId: string, skillIds: string[]): Promise<StudentProfile> {
    const unique = [...new Set(skillIds)];
    if (unique.length > 0) {
      const skills = await skillRepository.findManyByIds(unique);
      if (skills.length !== unique.length) {
        throw badRequest('One or more selected skills no longer exist in the catalogue');
      }
      const inactive = skills.filter((skill) => !skill.active);
      if (inactive.length > 0) {
        throw badRequest(`These skills are no longer offered: ${inactive.map((skill) => skill.name).join(', ')}`);
      }
    }
    await studentRepository.setSkills(studentId, unique);
    return this.getProfile(studentId);
  },

  async dashboard(studentId: string): Promise<StudentDashboard> {
    const profile = await this.getProfile(studentId);
    const [unreadNotifications, recentNotifications, totalNotifications] = await Promise.all([
      shortlistRepository.countUnread(studentId),
      shortlistRepository.recentForStudent(studentId, 4),
      shortlistRepository.countForStudent(studentId),
    ]);

    return {
      profile,
      completion: calculateCompletion(profile),
      unreadNotifications,
      recentNotifications,
      totalNotifications,
    };
  },

  async listNotifications(studentId: string, page: number, pageSize: number) {
    const [items, total, unread] = await Promise.all([
      shortlistRepository.listForStudent(studentId, page, pageSize),
      shortlistRepository.countForStudent(studentId),
      shortlistRepository.countUnread(studentId),
    ]);
    return { items, total, page, pageSize, unread };
  },

  async markNotificationRead(studentId: string, notificationId: string): Promise<void> {
    const updated = await shortlistRepository.markRead(studentId, notificationId);
    if (!updated) throw notFound('Notification not found');
  },

  async shortlistHistory(studentId: string) {
    return studentRepository.shortlistHistory(studentId);
  },
};
