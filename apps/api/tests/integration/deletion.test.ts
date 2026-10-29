import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import {
  createTestClient,
  ADMIN_PASSWORD,
  RECRUITER_PASSWORD,
  STUDENT_PASSWORD,
} from '../helpers/client';
import { createInstituteFixture, createRecruiterFixture, createStudentFixture } from '../helpers/fixtures';
import { clearOutbox, getOutbox } from '../../src/email/mailer';
import { emailService } from '../../src/services/email.service';
import { readOne } from '../../src/db/neo4j';
import { emptyCriteria } from '@campusconnect/shared';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[deletion.test] ${testDbSkipReason}`);
}

const REGISTRATION_URL = 'https://example.test/apply';

const rolePayload = () => ({
  title: 'Software Engineer',
  description: 'Build services',
  location: 'Bengaluru',
  employmentType: 'FULL_TIME',
  registrationUrl: REGISTRATION_URL,
  criteria: emptyCriteria(),
});

/** Creates a request and has the institute approve it. */
async function approvedRequest(
  institute: Awaited<ReturnType<typeof createInstituteFixture>>,
  recruiterClient: Awaited<ReturnType<typeof createRecruiterFixture>>['client'],
) {
  const created = await recruiterClient.post('/api/recruiter/requests', {
    instituteId: institute.instituteId,
    title: 'Graduate hiring drive',
    assessmentInstructions: null,
    roles: [rolePayload()],
    submit: true,
  });
  expect(created.status).toBe(201);
  const requestId = created.body.request.id as string;
  const approve = await institute.client.post(`/api/institute/requests/${requestId}/review`, { action: 'APPROVE' });
  expect(approve.status).toBe(200);
  return { requestId, roleId: created.body.request.roles[0].id as string };
}

describeDb('account deletion', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
    vi.restoreAllMocks();
  });

  describe('password and confirmation', () => {
    it('refuses to delete when the password is wrong', async () => {
      const institute = await createInstituteFixture();
      const student = await createStudentFixture(institute);

      const attempt = await student.client.post('/api/settings/delete-account', {
        password: 'NotMyPassword2026',
        confirm: 'DELETE',
      });
      expect(attempt.status).toBe(400);
      expect(attempt.body.error.message).toMatch(/password/i);

      // The account is untouched: the session still works and signing in works.
      expect((await student.client.get('/api/auth/me')).status).toBe(200);
      const login = await createTestClient().post('/api/auth/login', {
        identifier: student.email,
        password: STUDENT_PASSWORD,
        role: 'STUDENT',
      });
      expect(login.status).toBe(200);
    });

    it('requires the typed confirmation word', async () => {
      const institute = await createInstituteFixture();
      const student = await createStudentFixture(institute);

      const attempt = await student.client.post('/api/settings/delete-account', {
        password: STUDENT_PASSWORD,
        confirm: 'delete',
      });
      expect(attempt.status).toBe(400);
      expect((await student.client.get('/api/auth/me')).status).toBe(200);
    });

    it('deletes only the signed-in account, never an id passed in the body', async () => {
      const institute = await createInstituteFixture();
      const first = await createStudentFixture(institute, 'Asha Verma');
      const second = await createStudentFixture(institute, 'Rohit Sharma');

      // A caller trying to aim the endpoint at somebody else.
      const attempt = await first.client.post('/api/settings/delete-account', {
        password: STUDENT_PASSWORD,
        confirm: 'DELETE',
        id: second.studentId,
        userId: second.studentId,
      });
      expect(attempt.status).toBe(204);

      expect((await first.client.get('/api/auth/me')).status).toBe(401);
      expect((await second.client.get('/api/auth/me')).status).toBe(200);
    });
  });

  describe('student deletion', () => {
    it('removes the account and sessions, keeps the shortlist as history', async () => {
      const institute = await createInstituteFixture();
      const recruiter = await createRecruiterFixture();
      const student = await createStudentFixture(institute, 'Asha Verma');
      const { roleId } = await approvedRequest(institute, recruiter.client);

      const saved = await institute.client.put(`/api/institute/roles/${roleId}/shortlist`, {
        studentIds: [student.studentId],
      });
      expect(saved.status).toBe(200);

      const deletion = await student.client.post('/api/settings/delete-account', {
        password: STUDENT_PASSWORD,
        confirm: 'DELETE',
      });
      expect(deletion.status).toBe(204);

      // The goodbye email went out before the delete.
      const goodbye = getOutbox().find((message) => message.to === student.email);
      expect(goodbye?.subject).toMatch(/deleted/i);

      // No session survives and the credentials are gone.
      expect((await student.client.get('/api/auth/me')).status).toBe(401);
      const login = await createTestClient().post('/api/auth/login', {
        identifier: student.email,
        password: STUDENT_PASSWORD,
        role: 'STUDENT',
      });
      expect(login.status).toBe(401);

      // Gone from the active student list.
      const students = await institute.client.get('/api/institute/students');
      expect(students.body.items).toHaveLength(0);
      expect(students.body.total).toBe(0);

      // Still in the shortlist, with no personal data left.
      const shortlist = await institute.client.get(`/api/institute/roles/${roleId}/shortlist`);
      expect(shortlist.body.items).toHaveLength(1);
      expect(shortlist.body.items[0]).toMatchObject({ studentId: student.studentId, deleted: true, fullName: null });
      expect(shortlist.body.items[0].email).toBeNull();

      // And the row is still a student of this institute for history purposes.
      const tombstone = await readOne<{ instituteId: string }>(
        'MATCH (s:DeletedStudent {id: $id}) RETURN s.instituteId AS instituteId',
        { id: student.studentId },
      );
      expect(tombstone?.instituteId).toBe(institute.instituteId);
    });

    it('refuses to shortlist or dispatch a deleted student again', async () => {
      const institute = await createInstituteFixture();
      const recruiter = await createRecruiterFixture();
      const student = await createStudentFixture(institute, 'Asha Verma');
      const { roleId } = await approvedRequest(institute, recruiter.client);

      await student.client.post('/api/settings/delete-account', { password: STUDENT_PASSWORD, confirm: 'DELETE' });

      // The stale id is dropped rather than crashing the save.
      const saved = await institute.client.put(`/api/institute/roles/${roleId}/shortlist`, {
        studentIds: [student.studentId],
      });
      expect(saved.status).toBe(200);
      expect(saved.body.count).toBe(0);

      const dispatch = await institute.client.post(`/api/institute/roles/${roleId}/dispatch`, {
        studentIds: [student.studentId],
        message: null,
      });
      expect(dispatch.status).toBe(400);
    });
  });

  describe('recruiter deletion', () => {
    it('keeps historical requests read-only and shows the notice', async () => {
      const institute = await createInstituteFixture();
      const recruiter = await createRecruiterFixture();
      const { requestId } = await approvedRequest(institute, recruiter.client);

      // A second request left in SUBMITTED so the review path can be tested.
      const pending = await recruiter.client.post('/api/recruiter/requests', {
        instituteId: institute.instituteId,
        title: 'Second drive',
        assessmentInstructions: null,
        roles: [rolePayload()],
        submit: true,
      });
      expect(pending.status).toBe(201);
      const pendingId = pending.body.request.id as string;

      const deletion = await recruiter.client.post('/api/settings/delete-account', {
        password: RECRUITER_PASSWORD,
        confirm: 'DELETE',
      });
      expect(deletion.status).toBe(204);

      const login = await createTestClient().post('/api/auth/login', {
        identifier: recruiter.username,
        password: RECRUITER_PASSWORD,
        role: 'RECRUITER',
      });
      expect(login.status).toBe(401);

      // The institute still sees both requests, without the company name.
      const list = await institute.client.get('/api/institute/requests');
      expect(list.body.items).toHaveLength(2);
      for (const item of list.body.items) {
        expect(item.recruiterDeleted).toBe(true);
        expect(item.recruiterName).toBeNull();
      }

      const detail = await institute.client.get(`/api/institute/requests/${requestId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.request.recruiterDeleted).toBe(true);

      // Read-only: approving the pending one is refused.
      const review = await institute.client.post(`/api/institute/requests/${pendingId}/review`, { action: 'APPROVE' });
      expect(review.status).toBe(409);
      expect(review.body.error.message).toMatch(/no longer exists/i);

      // And the request is still SUBMITTED, not silently advanced.
      const after = await institute.client.get(`/api/institute/requests/${pendingId}`);
      expect(after.body.request.status).toBe('SUBMITTED');
    });
  });

  describe('institute deletion', () => {
    it('removes the institute, its administrator and its students, and leaves others alone', async () => {
      const doomed = await createInstituteFixture({ name: 'Doomed Institute' });
      const survivor = await createInstituteFixture({ name: 'Survivor Institute' });
      const recruiter = await createRecruiterFixture();

      await doomed.client.post('/api/institute/skills', { name: 'JavaScript' });
      const doomedStudent = await createStudentFixture(doomed, 'Asha Verma');
      const survivorStudent = await createStudentFixture(survivor, 'Rohit Sharma');
      const { requestId } = await approvedRequest(doomed, recruiter.client);

      const deletion = await doomed.client.post('/api/settings/delete-account', {
        password: ADMIN_PASSWORD,
        confirm: 'DELETE',
      });
      expect(deletion.status).toBe(204);

      // The administrator and their students are gone.
      expect((await doomed.client.get('/api/auth/me')).status).toBe(401);
      expect((await doomedStudent.client.get('/api/auth/me')).status).toBe(401);

      const studentLogin = await createTestClient().post('/api/auth/login', {
        identifier: doomedStudent.email,
        password: STUDENT_PASSWORD,
        role: 'STUDENT',
      });
      expect(studentLogin.status).toBe(401);

      // The institute's own configuration is gone too.
      const skills = await readOne<{ total: number }>('MATCH (k:Skill {instituteId: $id}) RETURN count(k) AS total', {
        id: doomed.instituteId,
      });
      expect(skills?.total).toBe(0);

      // The unrelated institute is untouched.
      expect((await survivor.client.get('/api/auth/me')).status).toBe(200);
      const survivorStudents = await survivor.client.get('/api/institute/students');
      expect(survivorStudents.body.items).toHaveLength(1);
      expect(survivorStudents.body.items[0].id).toBe(survivorStudent.studentId);

      // The recruiter keeps the request as read-only history.
      const detail = await recruiter.client.get(`/api/recruiter/requests/${requestId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.request.instituteDeleted).toBe(true);
      expect(detail.body.request.instituteName).toBeNull();
    });

    it('refuses to submit a request to a deleted institute', async () => {
      const institute = await createInstituteFixture();
      const recruiter = await createRecruiterFixture();

      const draft = await recruiter.client.post('/api/recruiter/requests', {
        instituteId: institute.instituteId,
        title: 'Draft drive',
        assessmentInstructions: null,
        roles: [rolePayload()],
        submit: false,
      });
      expect(draft.status).toBe(201);
      const draftId = draft.body.request.id as string;

      await institute.client.post('/api/settings/delete-account', { password: ADMIN_PASSWORD, confirm: 'DELETE' });

      const submit = await recruiter.client.post(`/api/recruiter/requests/${draftId}/submit`);
      expect(submit.status).toBe(409);
      expect(submit.body.error.message).toMatch(/no longer exists/i);

      const update = await recruiter.client.put(`/api/recruiter/requests/${draftId}`, {
        title: 'Renamed drive',
        assessmentInstructions: null,
        roles: [rolePayload()],
      });
      expect(update.status).toBe(409);
    });

    it('does not let a deleted institute be reached through its old requests', async () => {
      const institute = await createInstituteFixture();
      const recruiter = await createRecruiterFixture();
      const { requestId, roleId } = await approvedRequest(institute, recruiter.client);
      const adminClient = institute.client;

      await adminClient.post('/api/settings/delete-account', { password: ADMIN_PASSWORD, confirm: 'DELETE' });

      // The admin's session is dead, so the old routes answer 401, not data.
      expect((await adminClient.get(`/api/institute/requests/${requestId}`)).status).toBe(401);
      expect((await adminClient.get(`/api/institute/roles/${roleId}/candidates`)).status).toBe(401);
    });
  });

  describe('email failure', () => {
    it('leaves the account intact when the goodbye email cannot be sent', async () => {
      const institute = await createInstituteFixture();
      const student = await createStudentFixture(institute);

      vi.spyOn(emailService, 'sendAccountDeleted').mockRejectedValueOnce(new Error('SMTP down'));

      const attempt = await student.client.post('/api/settings/delete-account', {
        password: STUDENT_PASSWORD,
        confirm: 'DELETE',
      });
      expect(attempt.status).toBe(503);
      expect(attempt.body.error.message).toMatch(/not been deleted/i);

      // Nothing was removed: the session and the account both still work.
      expect((await student.client.get('/api/auth/me')).status).toBe(200);
      const students = await institute.client.get('/api/institute/students');
      expect(students.body.items).toHaveLength(1);
    });
  });

  describe('unrelated accounts', () => {
    it('rejects an unauthenticated deletion request', async () => {
      const anonymous = createTestClient();
      const attempt = await anonymous.post('/api/settings/delete-account', {
        password: STUDENT_PASSWORD,
        confirm: 'DELETE',
      });
      expect(attempt.status).toBe(401);
    });
  });
});
