import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import { createInstituteFixture, createRecruiterFixture, createStudentFixture, type InstituteFixture } from '../helpers/fixtures';
import { clearOutbox } from '../../src/email/mailer';
import { emptyCriteria } from '@campusconnect/shared';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[workflow.test] ${testDbSkipReason}`);
}

const REGISTRATION_URL = 'https://northwind.example.com/careers/apply';

const rolePayload = (skillIds: string[], overrides: Record<string, unknown> = {}) => ({
  title: 'Software Engineer',
  description: 'Build and maintain backend services.',
  location: 'Bengaluru',
  employmentType: 'FULL_TIME',
  registrationUrl: REGISTRATION_URL,
  criteria: {
    ...emptyCriteria(),
    minClass10Percentage: 60,
    minClass12Percentage: 60,
    undergradScoreType: 'CGPA',
    minUndergradScore: 7,
    undergradScoreScale: 10,
    maxActiveBacklogs: 1,
    skillMode: 'ANY',
    optionalSkillIds: skillIds,
    ...overrides,
  },
});

async function completeProfile(
  student: Awaited<ReturnType<typeof createStudentFixture>>,
  skillIds: string[],
  options: { class12?: number | null; cgpa?: number; backlogs?: number | null } = {},
) {
  await student.client.put('/api/student/me/profile', {
    fullName: 'Asha Verma',
    dateOfBirth: '2004-05-12',
    phone: '9876500001',
    city: 'Bengaluru',
    state: 'Karnataka',
    activeBacklogs: options.backlogs ?? 0,
  });
  await student.client.put('/api/student/me/education/CLASS_10', { board: 'CBSE', passingYear: 2020, scoreValue: 88 });
  if (options.class12 !== null) {
    await student.client.put('/api/student/me/education/CLASS_12', {
      board: 'CBSE',
      stream: 'Science',
      passingYear: 2022,
      scoreValue: options.class12 ?? 84,
    });
  }
  await student.client.put('/api/student/me/education/UNDERGRAD', {
    degree: 'B.Tech',
    branch: 'Computer Science',
    institution: 'Northfield Institute of Technology',
    passingYear: 2026,
    scoreType: 'CGPA',
    scoreValue: options.cgpa ?? 8.4,
    scoreScale: 10,
  });
  if (skillIds.length > 0) {
    await student.client.put('/api/student/me/skills', { skillIds });
  }
}

interface Pipeline {
  institute: InstituteFixture;
  recruiter: Awaited<ReturnType<typeof createRecruiterFixture>>;
  student: Awaited<ReturnType<typeof createStudentFixture>>;
  weakStudent: Awaited<ReturnType<typeof createStudentFixture>>;
  requestId: string;
  roleId: string;
  skillId: string;
}

async function buildPipeline(): Promise<Pipeline> {
  const institute = await createInstituteFixture();
  const recruiter = await createRecruiterFixture();

  const skill = await institute.client.post('/api/institute/skills', { name: 'JavaScript' });
  expect(skill.status).toBe(201);
  const skillId = skill.body.skill.id as string;

  const student = await createStudentFixture(institute, 'Asha Verma');
  await completeProfile(student, [skillId]);

  const weakStudent = await createStudentFixture(institute, 'Rohit Sharma');
  await completeProfile(weakStudent, [skillId], { class12: null, cgpa: 6.1 });

  const created = await recruiter.client.post('/api/recruiter/requests', {
    instituteId: institute.instituteId,
    title: 'Graduate hiring drive',
    assessmentInstructions: 'Complete the online assessment within 48 hours.',
    roles: [rolePayload([skillId])],
    submit: true,
  });
  expect(created.status).toBe(201);

  const requestId = created.body.request.id as string;
  const roleId = created.body.request.roles[0].id as string;

  const review = await institute.client.post(`/api/institute/requests/${requestId}/review`, { action: 'APPROVE' });
  expect(review.status).toBe(200);

  return { institute, recruiter, student, weakStudent, requestId, roleId, skillId };
}

describeDb('hiring request pipeline', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
  });

  it('delivers a request to the institute it was addressed to', async () => {
    const pipeline = await buildPipeline();

    const list = await pipeline.institute.client.get('/api/institute/requests');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].recruiterName).toBe(pipeline.recruiter.companyName);
    expect(list.body.items[0].status).toBe('APPROVED');
  });

  it('evaluates students against the criteria and explains failures', async () => {
    const pipeline = await buildPipeline();

    const response = await pipeline.institute.client.get(`/api/institute/roles/${pipeline.roleId}/candidates?eligibleOnly=false`);
    expect(response.status).toBe(200);

    const candidates = response.body.candidates as { studentId: string; eligible: boolean; checks: { key: string; status: string }[] }[];
    const strong = candidates.find((candidate) => candidate.studentId === pipeline.student.studentId);
    const weak = candidates.find((candidate) => candidate.studentId === pipeline.weakStudent.studentId);

    expect(strong?.eligible).toBe(true);
    expect(weak?.eligible).toBe(false);
    expect(weak?.checks.find((check) => check.key === 'class12')?.status).toBe('MISSING');
    expect(weak?.checks.find((check) => check.key === 'undergradScore')?.status).toBe('FAIL');
  });

  it('returns the recruiter and request context the shortlist page renders', async () => {
    // The institute shortlist page crashed to a blank screen because the API
    // sends `recruiter` while the page read `company`. This pins the contract.
    const pipeline = await buildPipeline();

    const response = await pipeline.institute.client.get(`/api/institute/roles/${pipeline.roleId}/candidates`);
    expect(response.status).toBe(200);

    expect(response.body.recruiter).toEqual({
      id: pipeline.recruiter.recruiterId,
      name: pipeline.recruiter.companyName,
    });
    expect(response.body).not.toHaveProperty('company');
    expect(response.body.request).toMatchObject({ id: pipeline.requestId, status: 'APPROVED' });
    expect(response.body.role.id).toBe(pipeline.roleId);
    expect(typeof response.body.totalStudents).toBe('number');
    expect(typeof response.body.eligibleCount).toBe('number');
    expect(Array.isArray(response.body.candidates)).toBe(true);
  });

  it('shortlists without notifying, then dispatches with a notification', async () => {
    const pipeline = await buildPipeline();

    const saved = await pipeline.institute.client.put(`/api/institute/roles/${pipeline.roleId}/shortlist`, {
      studentIds: [pipeline.student.studentId],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.count).toBe(1);

    const beforeDispatch = await pipeline.student.client.get('/api/student/me/notifications');
    expect(beforeDispatch.body.total).toBe(0);

    const dispatch = await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.student.studentId],
    });
    expect(dispatch.status).toBe(201);
    expect(dispatch.body.dispatched).toBe(1);

    const afterDispatch = await pipeline.student.client.get('/api/student/me/notifications');
    expect(afterDispatch.body.total).toBe(1);
    expect(afterDispatch.body.items[0].recruiterName).toBe(pipeline.recruiter.companyName);
  });

  it('refuses to dispatch the same role twice', async () => {
    const pipeline = await buildPipeline();

    const first = await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.student.studentId],
    });
    expect(first.status).toBe(201);

    const second = await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.student.studentId],
    });
    expect(second.status).toBe(409);

    const notifications = await pipeline.student.client.get('/api/student/me/notifications');
    expect(notifications.body.total).toBe(1);
  });

  it('re-checks eligibility at dispatch time', async () => {
    const pipeline = await buildPipeline();

    const response = await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.weakStudent.studentId],
    });

    expect(response.status).toBe(409);
    expect(response.body.error.details.ineligible).toHaveLength(1);
  });

  it('lets a student mark a notification as read', async () => {
    const pipeline = await buildPipeline();
    await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.student.studentId],
    });

    const before = await pipeline.student.client.get('/api/student/me/dashboard');
    expect(before.body.unreadNotifications).toBe(1);

    const notificationId = before.body.recentNotifications[0].id as string;
    const read = await pipeline.student.client.post(`/api/student/me/notifications/${notificationId}/read`);
    expect(read.status).toBe(200);

    const after = await pipeline.student.client.get('/api/student/me/dashboard');
    expect(after.body.unreadNotifications).toBe(0);
  });

  it('does not let another student read the notification', async () => {
    const pipeline = await buildPipeline();
    await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.student.studentId],
    });

    const dashboard = await pipeline.student.client.get('/api/student/me/dashboard');
    const notificationId = dashboard.body.recentNotifications[0].id as string;

    const attempt = await pipeline.weakStudent.client.post(`/api/student/me/notifications/${notificationId}/read`);
    expect(attempt.status).toBe(404);
  });

  it('locks an approved request against recruiter edits', async () => {
    const pipeline = await buildPipeline();

    const attempt = await pipeline.recruiter.client.put(`/api/recruiter/requests/${pipeline.requestId}`, {
      title: 'Edited after approval',
      roles: [rolePayload([pipeline.skillId])],
    });

    expect(attempt.status).toBe(409);
  });

  it('only allows a legal review transition', async () => {
    const pipeline = await buildPipeline();

    const again = await pipeline.institute.client.post(`/api/institute/requests/${pipeline.requestId}/review`, { action: 'APPROVE' });
    expect(again.status).toBe(409);
  });

  it('requires a note when returning a request for changes', async () => {
    const institute = await createInstituteFixture();
    const recruiter = await createRecruiterFixture();
    const skill = await institute.client.post('/api/institute/skills', { name: 'SQL' });

    const created = await recruiter.client.post('/api/recruiter/requests', {
      instituteId: institute.instituteId,
      title: 'Draft drive',
      roles: [rolePayload([skill.body.skill.id])],
      submit: true,
    });
    const requestId = created.body.request.id as string;

    const withoutNote = await institute.client.post(`/api/institute/requests/${requestId}/review`, { action: 'REQUEST_CHANGES' });
    expect(withoutNote.status).toBe(400);

    const withNote = await institute.client.post(`/api/institute/requests/${requestId}/review`, {
      action: 'REQUEST_CHANGES',
      note: 'Please add the internship role.',
    });
    expect(withNote.status).toBe(200);
    expect(withNote.body.request.status).toBe('CHANGES_REQUESTED');
  });

  it('shows the dispatch in the institute history with read counts', async () => {
    const pipeline = await buildPipeline();
    await pipeline.institute.client.post(`/api/institute/roles/${pipeline.roleId}/dispatch`, {
      studentIds: [pipeline.student.studentId],
    });

    const history = await pipeline.institute.client.get('/api/institute/dispatches');
    expect(history.status).toBe(200);
    const entry = (history.body.items as { roleId: string; recipientCount: number; readCount: number }[]).find(
      (item) => item.roleId === pipeline.roleId,
    );
    expect(entry).toBeTruthy();
    expect(entry?.recipientCount).toBe(1);
    expect(entry?.readCount).toBe(0);
  });

  it('sends one recruiter account to several institutes', async () => {
    const northfield = await createInstituteFixture();
    const lakeside = await createInstituteFixture({ name: 'Lakeside College' });
    const recruiter = await createRecruiterFixture();

    const toA = await recruiter.client.post('/api/recruiter/requests', {
      instituteId: northfield.instituteId,
      title: 'Northfield drive',
      roles: [rolePayload([])],
      submit: true,
    });
    const toB = await recruiter.client.post('/api/recruiter/requests', {
      instituteId: lakeside.instituteId,
      title: 'Lakeside drive',
      roles: [rolePayload([])],
      submit: true,
    });

    expect(toA.status).toBe(201);
    expect(toB.status).toBe(201);

    const northfieldList = await northfield.client.get('/api/institute/requests');
    const lakesideList = await lakeside.client.get('/api/institute/requests');

    expect(northfieldList.body.items).toHaveLength(1);
    expect(northfieldList.body.items[0].title).toBe('Northfield drive');
    expect(lakesideList.body.items).toHaveLength(1);
    expect(lakesideList.body.items[0].title).toBe('Lakeside drive');

    const recruiterList = await recruiter.client.get('/api/recruiter/requests');
    expect(recruiterList.body.items).toHaveLength(2);
  });

  it('rejects a request addressed to an unknown institute', async () => {
    const recruiter = await createRecruiterFixture();
    const response = await recruiter.client.post('/api/recruiter/requests', {
      instituteId: 'ins_missing',
      title: 'Nowhere',
      roles: [rolePayload([])],
      submit: false,
    });
    expect(response.status).toBe(400);
  });
});
