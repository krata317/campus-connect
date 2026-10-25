import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import { createTestClient, uniqueEmail, STUDENT_PASSWORD, EMPLOYER_PASSWORD, ADMIN_PASSWORD, type TestClient } from '../helpers/client';
import { collegeService } from '../../src/services/college.service';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[workflow.test] ${testDbSkipReason}`);
}

interface Pipeline {
  admin: TestClient;
  employer: TestClient;
  strongStudent: TestClient;
  weakStudent: TestClient;
  strongStudentId: string;
  weakStudentId: string;
  requestId: string;
  roleId: string;
  skills: { javascript: string; sql: string };
}

const REGISTRATION_URL = 'https://northwind.example.com/careers/apply';

describeDb('employer to student placement pipeline', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  // The slug of the college created for the current test. Registration helpers
  // need it because every account must belong to a tenant.
  let collegeSlug = '';

  const signInAdmin = async (): Promise<TestClient> => {
    const email = uniqueEmail('admin');
    collegeSlug = `college-${Math.random().toString(36).slice(2, 9)}`;
    await collegeService.onboard({
      name: 'Northfield Institute of Technology',
      slug: collegeSlug,
      website: null,
      contactEmail: null,
      contactPhone: null,
      adminEmail: email,
      adminName: 'Placement Admin',
      adminPassword: ADMIN_PASSWORD,
    });

    const client = createTestClient();
    const login = await client.post('/api/auth/login', { email, password: ADMIN_PASSWORD, role: 'ADMIN' });
    expect(login.status).toBe(200);
    return client;
  };

  const createSkills = async (admin: TestClient) => {
    const javascript = await admin.post('/api/admin/skills', { name: 'JavaScript' });
    const sql = await admin.post('/api/admin/skills', { name: 'SQL' });
    expect(javascript.status).toBe(201);
    expect(sql.status).toBe(201);
    return {
      javascript: javascript.body.skill.id as string,
      sql: sql.body.skill.id as string,
    };
  };

  const registerStudent = async (fullName: string): Promise<{ client: TestClient; id: string }> => {
    const client = createTestClient();
    const response = await client.post('/api/auth/register/student', {
      fullName,
      email: uniqueEmail('student'),
      password: STUDENT_PASSWORD,
      collegeSlug,
    });
    expect(response.status).toBe(201);
    return { client, id: response.body.user.id as string };
  };

  const completeProfile = async (
    client: TestClient,
    options: { class10: number; class12: number | null; cgpa: number; backlogs: number | null; skillIds: string[] },
  ) => {
    const profile = await client.put('/api/students/me/profile', {
      fullName: 'Asha Verma',
      activeBacklogs: options.backlogs,
      city: 'Bengaluru',
      state: 'Karnataka',
    });
    expect(profile.status).toBe(200);

    expect((await client.put('/api/students/me/education/CLASS_10', { board: 'CBSE', passingYear: 2020, scoreValue: options.class10 })).status).toBe(200);

    if (options.class12 !== null) {
      expect(
        (await client.put('/api/students/me/education/CLASS_12', { board: 'CBSE', stream: 'Science', passingYear: 2022, scoreValue: options.class12 }))
          .status,
      ).toBe(200);
    }

    const undergrad = await client.put('/api/students/me/education/UNDERGRAD', {
      degree: 'B.Tech',
      branch: 'CSE',
      institution: 'National Institute of Technology',
      passingYear: 2026,
      scoreType: 'CGPA',
      scoreValue: options.cgpa,
      scoreScale: 10,
    });
    expect(undergrad.status).toBe(200);

    expect((await client.put('/api/students/me/skills', { skillIds: options.skillIds })).status).toBe(200);
  };

  const registerEmployer = async (): Promise<{ client: TestClient; id: string }> => {
    const client = createTestClient();
    const response = await client.post('/api/auth/register/employer', {
      email: uniqueEmail('employer'),
      password: EMPLOYER_PASSWORD,
      companyName: 'Northwind Systems',
      website: 'https://northwind.example.com',
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      companyEmail: uniqueEmail('hr'),
      description: 'Product engineering company',
      collegeSlug,
    });
    expect(response.status).toBe(201);
    return { client, id: response.body.user.id as string };
  };

  const rolePayload = (skillIds: string[]) => ({
    title: 'Software Engineer',
    description: 'Build and operate backend services for the payments platform.',
    location: 'Bengaluru',
    employmentType: 'FULL_TIME',
    registrationUrl: REGISTRATION_URL,
    criteria: {
      minClass10Percentage: 60,
      minClass12Percentage: 60,
      undergradScoreType: 'CGPA',
      minUndergradScore: 7,
      undergradScoreScale: 10,
      allowedDegrees: ['B.Tech'],
      allowedBranches: ['CSE', 'IT'],
      graduationYears: [2026],
      maxActiveBacklogs: 0,
      minExperienceMonths: 0,
      skillMode: 'ALL',
      requiredSkillIds: skillIds,
      optionalSkillIds: [],
    },
  });

  /** Builds the whole scenario: admin, skills, two students, approved employer with an approved request. */
  const buildPipeline = async (): Promise<Pipeline> => {
    const admin = await signInAdmin();
    const skills = await createSkills(admin);

    const strong = await registerStudent('Asha Verma');
    await completeProfile(strong.client, {
      class10: 88,
      class12: 84,
      cgpa: 8.4,
      backlogs: 0,
      skillIds: [skills.javascript, skills.sql],
    });

    const weak = await registerStudent('Rohit Sharma');
    await completeProfile(weak.client, {
      class10: 70,
      class12: null,
      cgpa: 6.2,
      backlogs: 1,
      skillIds: [skills.javascript],
    });

    const employer = await registerEmployer();
    const approval = await admin.post(`/api/admin/employers/${employer.id}/review`, { action: 'APPROVE' });
    expect(approval.status).toBe(200);

    const created = await employer.client.post('/api/employer/me/requests', {
      title: 'Campus drive 2026',
      assessmentInstructions: 'Complete the online assessment within 48 hours.',
      roles: [rolePayload([skills.javascript, skills.sql])],
    });
    expect(created.status).toBe(201);

    const requestId = created.body.request.id as string;
    const roleId = created.body.request.roles[0].id as string;

    expect((await employer.client.post(`/api/employer/me/requests/${requestId}/submit`)).status).toBe(200);
    expect((await admin.post(`/api/admin/requests/${requestId}/review`, { action: 'APPROVE' })).status).toBe(200);

    return {
      admin,
      employer: employer.client,
      strongStudent: strong.client,
      weakStudent: weak.client,
      strongStudentId: strong.id,
      weakStudentId: weak.id,
      requestId,
      roleId,
      skills,
    };
  };

  it('evaluates candidates per criterion and explains every failure', async () => {
    const pipeline = await buildPipeline();

    const response = await pipeline.admin.get(`/api/admin/roles/${pipeline.roleId}/candidates?eligibleOnly=false`);
    expect(response.status).toBe(200);

    const { candidates, eligibleCount, totalStudents } = response.body as {
      candidates: { studentId: string; fullName: string; eligible: boolean; checks: { key: string; status: string }[]; reasons: string[]; matchedSkills: string[]; missingSkills: string[] }[];
      eligibleCount: number;
      totalStudents: number;
    };

    expect(totalStudents).toBe(2);
    expect(eligibleCount).toBe(1);

    const strong = candidates.find((candidate) => candidate.studentId === pipeline.strongStudentId);
    const weak = candidates.find((candidate) => candidate.studentId === pipeline.weakStudentId);

    expect(strong?.eligible).toBe(true);
    expect(strong?.reasons).toEqual([]);
    expect(strong?.matchedSkills).toEqual(expect.arrayContaining(['JavaScript', 'SQL']));

    expect(weak?.eligible).toBe(false);
    expect(weak?.missingSkills).toEqual(['SQL']);
    // Class 12 is missing, the CGPA is below 7, backlogs exceed 0 and SQL is absent.
    expect(weak?.reasons.length).toBeGreaterThanOrEqual(4);

    const class12Check = weak?.checks.find((check) => check.key === 'class12');
    expect(class12Check?.status).toBe('MISSING');

    const backlogsCheck = weak?.checks.find((check) => check.key === 'backlogs');
    expect(backlogsCheck?.status).toBe('FAIL');
  });

  it('filters to eligible candidates only when asked', async () => {
    const pipeline = await buildPipeline();

    const eligibleOnly = await pipeline.admin.get(`/api/admin/roles/${pipeline.roleId}/candidates?eligibleOnly=true`);
    expect(eligibleOnly.body.candidates).toHaveLength(1);
    expect(eligibleOnly.body.candidates[0].studentId).toBe(pipeline.strongStudentId);

    // With no filter parameter the API stays on the safe default: eligible only.
    const defaulted = await pipeline.admin.get(`/api/admin/roles/${pipeline.roleId}/candidates`);
    expect(defaulted.body.candidates).toHaveLength(1);

    const all = await pipeline.admin.get(`/api/admin/roles/${pipeline.roleId}/candidates?eligibleOnly=false`);
    expect(all.body.candidates).toHaveLength(2);
    expect(all.body.eligibleCount).toBe(1);
  });

  it('dispatches to a selected student and creates exactly one notification', async () => {
    const pipeline = await buildPipeline();

    const dispatch = await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.strongStudentId],
      message: 'Shortlisted by the placement cell.',
    });

    expect(dispatch.status).toBe(201);

    const notifications = await pipeline.strongStudent.get('/api/students/me/notifications');
    expect(notifications.status).toBe(200);
    expect(notifications.body.total).toBe(1);

    const notification = notifications.body.items[0];
    expect(notification.companyName).toBe('Northwind Systems');
    expect(notification.roleTitle).toBe('Software Engineer');
    expect(notification.registrationUrl).toBe(REGISTRATION_URL);
    expect(notification.readAt).toBeNull();
    expect(notification.message).toContain('Shortlisted by the placement cell.');
    expect(notification.message).toContain('Complete the online assessment within 48 hours.');
  });

  it('keeps notifications private to their recipient', async () => {
    const pipeline = await buildPipeline();

    await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, { studentIds: [pipeline.strongStudentId] });

    const otherStudent = await pipeline.weakStudent.get('/api/students/me/notifications');
    expect(otherStudent.status).toBe(200);
    expect(otherStudent.body.total).toBe(0);
  });

  it('refuses to dispatch the same role twice and never duplicates notifications', async () => {
    const pipeline = await buildPipeline();

    const first = await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, { studentIds: [pipeline.strongStudentId] });
    expect(first.status).toBe(201);

    const second = await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, { studentIds: [pipeline.strongStudentId] });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/already been dispatched/i);

    const notifications = await pipeline.strongStudent.get('/api/students/me/notifications');
    expect(notifications.body.total).toBe(1);
  });

  it('re-checks eligibility at dispatch time and rejects an ineligible selection', async () => {
    const pipeline = await buildPipeline();

    const response = await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.strongStudentId, pipeline.weakStudentId],
    });

    expect(response.status).toBe(409);
    const ineligible = response.body.error.details.ineligible as { studentId: string; reasons: string[] }[];
    expect(ineligible).toHaveLength(1);
    expect(ineligible[0]?.studentId).toBe(pipeline.weakStudentId);
    expect(ineligible[0]?.reasons.length).toBeGreaterThan(0);

    // Nothing was sent as a side effect of the failed dispatch.
    const notifications = await pipeline.strongStudent.get('/api/students/me/notifications');
    expect(notifications.body.total).toBe(0);
  });

  it('rejects a registration URL that is not http or https', async () => {
    const admin = await signInAdmin();
    const skills = await createSkills(admin);
    const employer = await registerEmployer();
    await admin.post(`/api/admin/employers/${employer.id}/review`, { action: 'APPROVE' });

    const response = await employer.client.post('/api/employer/me/requests', {
      title: 'Suspicious drive',
      roles: [{ ...rolePayload([skills.javascript]), registrationUrl: 'javascript:alert(1)' }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('tracks unread notifications and lets the student mark them read', async () => {
    const pipeline = await buildPipeline();

    await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, { studentIds: [pipeline.strongStudentId] });

    const before = await pipeline.strongStudent.get('/api/students/me/dashboard');
    expect(before.body.unreadNotifications).toBe(1);
    expect(before.body.recentNotifications).toHaveLength(1);

    const notificationId = before.body.recentNotifications[0].id as string;
    const markRead = await pipeline.strongStudent.post(`/api/students/me/notifications/${notificationId}/read`);
    expect(markRead.status).toBe(200);

    const after = await pipeline.strongStudent.get('/api/students/me/dashboard');
    expect(after.body.unreadNotifications).toBe(0);
  });

  it('does not let one student mark another student notification as read', async () => {
    const pipeline = await buildPipeline();

    await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, { studentIds: [pipeline.strongStudentId] });

    const dashboard = await pipeline.strongStudent.get('/api/students/me/dashboard');
    const notificationId = dashboard.body.recentNotifications[0].id as string;

    const attempt = await pipeline.weakStudent.post(`/api/students/me/notifications/${notificationId}/read`);
    expect(attempt.status).toBe(404);

    const stillUnread = await pipeline.strongStudent.get('/api/students/me/dashboard');
    expect(stillUnread.body.unreadNotifications).toBe(1);
  });

  it('records the shortlist before dispatch and exposes it to the admin', async () => {
    const pipeline = await buildPipeline();

    const save = await pipeline.admin.put(`/api/admin/roles/${pipeline.roleId}/shortlist`, {
      studentIds: [pipeline.strongStudentId],
    });
    expect(save.status).toBe(200);

    const shortlist = await pipeline.admin.get(`/api/admin/roles/${pipeline.roleId}/shortlist`);
    expect(shortlist.body.items).toHaveLength(1);
    expect(shortlist.body.items[0].studentId).toBe(pipeline.strongStudentId);
    // Saved but not yet notified: the shortlist stays in DRAFT until dispatch.
    expect(shortlist.body.items[0].status).toBe('DRAFT');
    expect(shortlist.body.items[0].notificationId).toBeNull();
  });

  it('locks an approved request against employer edits', async () => {
    const pipeline = await buildPipeline();

    const attempt = await pipeline.employer.put(`/api/employer/me/requests/${pipeline.requestId}`, {
      title: 'Changed after approval',
      roles: [rolePayload([pipeline.skills.javascript])],
    });

    expect(attempt.status).toBe(409);
    expect(attempt.body.error.message).toMatch(/approved/i);
  });

  it('only allows a legal review transition on a hiring request', async () => {
    const pipeline = await buildPipeline();

    const again = await pipeline.admin.post(`/api/admin/requests/${pipeline.requestId}/review`, { action: 'APPROVE' });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already been approved/i);

    const reject = await pipeline.admin.post(`/api/admin/requests/${pipeline.requestId}/review`, { action: 'REJECT' });
    expect(reject.status).toBe(409);
  });

  it('requires a note when a request is returned for changes', async () => {
    const admin = await signInAdmin();
    const skills = await createSkills(admin);
    const employer = await registerEmployer();
    await admin.post(`/api/admin/employers/${employer.id}/review`, { action: 'APPROVE' });

    const created = await employer.client.post('/api/employer/me/requests', {
      title: 'Campus drive 2026',
      roles: [rolePayload([skills.javascript])],
      submit: true,
    });
    const requestId = created.body.request.id as string;

    const withoutNote = await admin.post(`/api/admin/requests/${requestId}/review`, { action: 'REQUEST_CHANGES' });
    expect(withoutNote.status).toBe(400);

    const withNote = await admin.post(`/api/admin/requests/${requestId}/review`, {
      action: 'REQUEST_CHANGES',
      note: 'Please add the internship location.',
    });
    expect(withNote.status).toBe(200);
    expect(withNote.body.request.status).toBe('CHANGES_REQUESTED');
  });

  it('shows the dispatch in the admin history with recipient and read counts', async () => {
    const pipeline = await buildPipeline();

    await pipeline.admin.post(`/api/admin/roles/${pipeline.roleId}/dispatch`, { studentIds: [pipeline.strongStudentId] });

    const history = await pipeline.admin.get('/api/admin/dispatches');
    expect(history.status).toBe(200);
    expect(history.body.items.length).toBeGreaterThan(0);

    const entry = history.body.items.find((item: { roleId: string }) => item.roleId === pipeline.roleId);
    expect(entry).toBeDefined();
    expect(entry.recipientCount).toBe(1);
    expect(entry.readCount).toBe(0);
  });
});
