import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import { createInstituteFixture, createRecruiterFixture, createStudentFixture } from '../helpers/fixtures';
import { createTestClient, uniqueEmail } from '../helpers/client';
import { clearOutbox, getOutbox } from '../../src/email/mailer';
import { emptyCriteria } from '@campusconnect/shared';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[tenancy.test] ${testDbSkipReason}`);
}

const rolePayload = (overrides: Record<string, unknown> = {}) => ({
  title: 'Software Engineer',
  description: 'Build and maintain backend services.',
  registrationUrl: 'https://recruiter.example.com/apply',
  criteria: { ...emptyCriteria(), ...overrides },
});

describeDb('institute isolation and ownership', () => {
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

  it('keeps student directories inside one institute', async () => {
    const northfield = await createInstituteFixture();
    const lakeside = await createInstituteFixture({ name: 'Lakeside College' });
    const insider = await createStudentFixture(northfield, 'Asha Verma');
    const outsider = await createStudentFixture(lakeside, 'Rohit Sharma');

    const list = await northfield.client.get('/api/institute/students');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].fullName).toBe('Asha Verma');

    const peek = await northfield.client.get(`/api/institute/students/${outsider.studentId}`);
    expect(peek.status).toBe(404);

    const stats = await northfield.client.get('/api/institute/stats');
    expect(stats.body.students).toBe(1);

    const own = await northfield.client.get(`/api/institute/students/${insider.studentId}`);
    expect(own.status).toBe(200);
  });

  it('keeps hiring requests inside the institute they were sent to', async () => {
    const northfield = await createInstituteFixture();
    const lakeside = await createInstituteFixture({ name: 'Lakeside College' });
    const recruiter = await createRecruiterFixture();

    const created = await recruiter.client.post('/api/recruiter/requests', {
      instituteId: lakeside.instituteId,
      title: 'Lakeside only',
      roles: [rolePayload()],
      submit: true,
    });
    const requestId = created.body.request.id as string;
    const roleId = created.body.request.roles[0].id as string;

    expect((await northfield.client.get('/api/institute/requests')).body.items).toHaveLength(0);
    expect((await northfield.client.get(`/api/institute/requests/${requestId}`)).status).toBe(404);
    expect((await northfield.client.get(`/api/institute/roles/${roleId}/candidates`)).status).toBe(404);

    // The owning institute can read it.
    expect((await lakeside.client.get(`/api/institute/requests/${requestId}`)).status).toBe(200);
  });

  it('keeps skill catalogues per institute', async () => {
    const northfield = await createInstituteFixture();
    const lakeside = await createInstituteFixture({ name: 'Lakeside College' });

    const lakesideSkill = await lakeside.client.post('/api/institute/skills', { name: 'Python' });
    expect(lakesideSkill.status).toBe(201);

    expect((await northfield.client.get('/api/institute/skills')).body.items).toHaveLength(0);

    // The same name is allowed in another institute.
    expect((await northfield.client.post('/api/institute/skills', { name: 'Python' })).status).toBe(201);
    // ...but not twice in one institute.
    expect((await northfield.client.post('/api/institute/skills', { name: 'python' })).status).toBe(409);

    // A foreign skill id cannot be renamed.
    const cross = await northfield.client.patch(`/api/institute/skills/${lakesideSkill.body.skill.id}`, { name: 'Hijacked' });
    expect(cross.status).toBe(404);
  });

  it('only lets a recruiter see its own requests', async () => {
    const institute = await createInstituteFixture();
    const recruiterA = await createRecruiterFixture({ companyName: 'Alpha Systems' });
    const recruiterB = await createRecruiterFixture({ companyName: 'Beta Labs' });

    const created = await recruiterA.client.post('/api/recruiter/requests', {
      instituteId: institute.instituteId,
      title: 'Alpha drive',
      roles: [rolePayload()],
      submit: true,
    });
    const requestId = created.body.request.id as string;

    expect((await recruiterB.client.get('/api/recruiter/requests')).body.items).toHaveLength(0);
    expect((await recruiterB.client.get(`/api/recruiter/requests/${requestId}`)).status).toBe(404);

    const attempt = await recruiterB.client.put(`/api/recruiter/requests/${requestId}`, {
      title: 'Hijacked',
      roles: [rolePayload()],
    });
    expect(attempt.status).toBe(404);
  });

  it('does not expose institute student codes through public endpoints', async () => {
    const institute = await createInstituteFixture();

    const list = await createTestClient().get('/api/institutes');
    expect(list.status).toBe(200);
    const entry = (list.body.items as Record<string, unknown>[]).find((item) => item.id === institute.instituteId);
    expect(entry).toBeTruthy();
    expect(Object.keys(entry ?? {})).toEqual(['id', 'name', 'aisheCode', 'state', 'district']);
    expect(JSON.stringify(list.body)).not.toContain(institute.studentCode);

    const settings = await institute.client.get('/api/institute/settings');
    expect(settings.status).toBe(200);
    expect(JSON.stringify(settings.body)).not.toContain(institute.studentCode);
    expect(settings.body.studentCodeUpdatedAt).toBeTruthy();
  });

  it('rotates the student code without affecting existing students', async () => {
    const institute = await createInstituteFixture();
    const existing = await createStudentFixture(institute, 'Asha Verma');

    const rotated = await institute.client.post('/api/institute/settings/student-code');
    expect(rotated.status).toBe(200);
    const newCode = rotated.body.code as string;
    expect(newCode).toMatch(/^[A-Z0-9]{32}$/);
    expect(newCode).not.toBe(institute.studentCode);

    // The old code no longer registers anyone.
    const withOldCode = await createTestClient().post('/api/auth/register/student', {
      fullName: 'Rohit Sharma',
      email: uniqueEmail('student'),
      password: 'StudentPass2026',
      instituteId: institute.instituteId,
      studentCode: institute.studentCode,
    });
    expect(withOldCode.status).toBe(400);

    // The new code works.
    const withNewCode = await createTestClient().post('/api/auth/register/student', {
      fullName: 'Rohit Sharma',
      email: uniqueEmail('student'),
      password: 'StudentPass2026',
      instituteId: institute.instituteId,
      studentCode: newCode,
    });
    expect(withNewCode.status).toBe(201);

    // The student who registered earlier still belongs to the institute.
    const me = await existing.client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.institute.id).toBe(institute.instituteId);
  });

  it('stores the notification preference per account and applies it to optional email', async () => {
    const institute = await createInstituteFixture();
    const recruiter = await createRecruiterFixture();

    const before = await recruiter.client.get('/api/settings/notifications');
    expect(before.body.emailNotifications).toBe(true);

    const updated = await recruiter.client.patch('/api/settings/notifications', { emailNotifications: false });
    expect(updated.status).toBe(200);
    expect((await recruiter.client.get('/api/settings/notifications')).body.emailNotifications).toBe(false);

    // The institute preference is untouched.
    expect((await institute.client.get('/api/settings/notifications')).body.emailNotifications).toBe(true);

    clearOutbox();
    await recruiter.client.post('/api/recruiter/requests', {
      instituteId: institute.instituteId,
      title: 'No confirmation please',
      roles: [rolePayload()],
      submit: true,
    });

    // The institute still gets its notification, the recruiter opted out of theirs.
    const toRecruiter = getOutbox().filter((message) => message.to === recruiter.email);
    expect(toRecruiter).toHaveLength(0);
    const toInstitute = getOutbox().filter((message) => message.to === institute.adminEmail);
    expect(toInstitute.length).toBeGreaterThan(0);
  });
});
