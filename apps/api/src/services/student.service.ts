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
  async getProfile(studentId: string, collegeId: string): Promise<StudentProfile> {
    const profile = await studentRepository.getProfile(studentId, collegeId);
    if (!profile) throw notFound('Student profile not found');
    return profile;
  },

  async updateProfile(
    studentId: string,
    collegeId: string,
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
    const existing = await studentRepository.getProfile(studentId, collegeId);
    if (!existing) throw notFound('Student profile not found');

    // Only the fixed profile fields are writable. Role and college are never
    // part of this payload, so a student cannot move themselves to another
    // tenant through a profile update.
    await studentRepository.updateProfile(studentId, collegeId, {
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

    return this.getProfile(studentId, collegeId);
  },

  async upsertEducation(studentId: string, collegeId: string, level: EducationLevel, payload: EducationPayload): Promise<StudentProfile> {
    await studentRepository.upsertEducation(studentId, collegeId, level, educationProps(level, payload));
    return this.getProfile(studentId, collegeId);
  },

  async deleteEducation(studentId: string, collegeId: string, level: EducationLevel): Promise<StudentProfile> {
    const removed = await studentRepository.deleteEducation(studentId, collegeId, level);
    if (!removed) throw notFound('That education record does not exist');
    return this.getProfile(studentId, collegeId);
  },

  async addExperience(studentId: string, collegeId: string, payload: Record<string, unknown>): Promise<StudentProfile> {
    await studentRepository.addExperience(studentId, collegeId, experienceProps(payload));
    return this.getProfile(studentId, collegeId);
  },

  async updateExperience(
    studentId: string,
    collegeId: string,
    experienceId: string,
    payload: Record<string, unknown>,
  ): Promise<StudentProfile> {
    const updated = await studentRepository.updateExperience(studentId, collegeId, experienceId, experienceProps(payload));
    if (!updated) throw notFound('Experience record not found');
    return this.getProfile(studentId, collegeId);
  },

  async deleteExperience(studentId: string, collegeId: string, experienceId: string): Promise<StudentProfile> {
    const removed = await studentRepository.deleteExperience(studentId, collegeId, experienceId);
    if (!removed) throw notFound('Experience record not found');
    return this.getProfile(studentId, collegeId);
  },

  async setSkills(studentId: string, collegeId: string, skillIds: string[]): Promise<StudentProfile> {
    const unique = [...new Set(skillIds)];
    if (unique.length > 0) {
      const skills = await skillRepository.findManyByIds(unique, collegeId);
      if (skills.length !== unique.length) {
        throw badRequest('One or more selected skills are not in your college skill catalogue');
      }
      const inactive = skills.filter((skill) => !skill.active);
      if (inactive.length > 0) {
        throw badRequest(`These skills are no longer offered: ${inactive.map((skill) => skill.name).join(', ')}`);
      }
    }
    await studentRepository.setSkills(studentId, collegeId, unique);
    return this.getProfile(studentId, collegeId);
  },

  async dashboard(studentId: string, collegeId: string): Promise<StudentDashboard> {
    const profile = await this.getProfile(studentId, collegeId);
    const [unreadNotifications, recentNotifications, totalNotifications] = await Promise.all([
      shortlistRepository.countUnread(studentId, collegeId),
      shortlistRepository.recentForStudent(studentId, collegeId, 4),
      shortlistRepository.countForStudent(studentId, collegeId),
    ]);

    return {
      profile,
      completion: calculateCompletion(profile),
      unreadNotifications,
      recentNotifications,
      totalNotifications,
    };
  },

  async listNotifications(studentId: string, collegeId: string, page: number, pageSize: number) {
    const [items, total, unread] = await Promise.all([
      shortlistRepository.listForStudent(studentId, collegeId, page, pageSize),
      shortlistRepository.countForStudent(studentId, collegeId),
      shortlistRepository.countUnread(studentId, collegeId),
    ]);
    return { items, total, page, pageSize, unread };
  },

  async markNotificationRead(studentId: string, collegeId: string, notificationId: string): Promise<void> {
    const updated = await shortlistRepository.markRead(studentId, collegeId, notificationId);
    if (!updated) throw notFound('Notification not found');
  },

  async shortlistHistory(studentId: string, collegeId: string) {
    return studentRepository.shortlistHistory(studentId, collegeId);
  },
};
