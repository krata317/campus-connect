import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import { createTestClient, uniqueEmail, STUDENT_PASSWORD, ADMIN_PASSWORD } from '../helpers/client';
import { createInstituteFixture } from '../helpers/fixtures';
import { getOutbox, clearOutbox } from '../../src/email/mailer';
import { readOne, writeQuery } from '../../src/db/neo4j';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[auth.test] ${testDbSkipReason}`);
}

const studentBody = (instituteId: string, studentCode: string, email = uniqueEmail('student')) => ({
  fullName: 'Asha Verma',
  email,
  password: STUDENT_PASSWORD,
  instituteId,
  studentCode,
});

describeDb('authentication and access control', () => {
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

  it('registers a student when the institute code matches', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const email = uniqueEmail('student');

    const response = await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('STUDENT');
    expect(response.body.user.institute.id).toBe(institute.instituteId);
    expect(response.body.user.email).toBe(email);
  });

  it('rejects a student code that belongs to another institute', async () => {
    const northfield = await createInstituteFixture();
    const lakeside = await createInstituteFixture({ name: 'Lakeside College' });
    const client = createTestClient();

    const response = await client.post(
      '/api/auth/register/student',
      studentBody(northfield.instituteId, lakeside.studentCode),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/student code/i);
  });

  it('rejects an unknown institute', async () => {
    const client = createTestClient();
    const response = await client.post('/api/auth/register/student', studentBody('ins_missing', 'A'.repeat(32)));
    expect(response.status).toBe(400);
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const email = uniqueEmail('student');
    await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));

    const row = await readOne<{ passwordHash: string }>('MATCH (s:Student {email: $email}) RETURN s.passwordHash AS passwordHash', {
      email,
    });

    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe(STUDENT_PASSWORD);
    expect(row?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('keeps the session alive across requests', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode));

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('STUDENT');
  });

  it('rejects a duplicate email address', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const email = uniqueEmail('student');

    await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));
    const second = await createTestClient().post(
      '/api/auth/register/student',
      studentBody(institute.instituteId, institute.studentCode, email),
    );

    expect(second.status).toBe(409);
  });

  it('returns the same message for a wrong password and an unknown account', async () => {
    const institute = await createInstituteFixture();
    const email = uniqueEmail('student');
    await createTestClient().post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));

    const wrongPassword = await createTestClient().post('/api/auth/login', { identifier: email, password: 'WrongPass123' });
    const unknown = await createTestClient().post('/api/auth/login', { identifier: uniqueEmail('nobody'), password: 'WrongPass123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses a student signing in through the administrator tab', async () => {
    const institute = await createInstituteFixture();
    const email = uniqueEmail('student');
    await createTestClient().post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));

    const response = await createTestClient().post('/api/auth/login', {
      identifier: email,
      password: STUDENT_PASSWORD,
      role: 'INSTITUTE_ADMIN',
    });

    expect(response.status).toBe(401);
  });

  it('signs an institute administrator in with a username', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();

    const login = await client.post('/api/auth/login', {
      identifier: institute.adminUsername,
      password: ADMIN_PASSWORD,
      role: 'INSTITUTE_ADMIN',
    });

    expect(login.status).toBe(200);
    expect(login.body.user.institute.id).toBe(institute.instituteId);

    const stats = await client.get('/api/institute/stats');
    expect(stats.status).toBe(200);
  });

  it('clears the session on sign out', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode));

    const logout = await client.post('/api/auth/logout');
    expect(logout.status).toBe(204);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('blocks mutating requests without a CSRF token', async () => {
    const client = createTestClient();
    const response = await client.postWithoutCsrf('/api/auth/login', { identifier: 'a@b.test', password: 'x' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks mutating requests with a mismatched CSRF token', async () => {
    const client = createTestClient();
    const response = await client.postWithBadCsrf('/api/auth/login', { identifier: 'a@b.test', password: 'x' });
    expect(response.status).toBe(403);
  });

  it('rejects anonymous access to protected routes', async () => {
    const client = createTestClient();
    expect((await client.get('/api/institute/stats')).status).toBe(401);
    expect((await client.get('/api/student/me/profile')).status).toBe(401);
    expect((await client.get('/api/recruiter/profile')).status).toBe(401);
  });

  it('enforces role separation between the three portals', async () => {
    const institute = await createInstituteFixture();
    const studentClient = createTestClient();
    await studentClient.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode));

    expect((await studentClient.get('/api/institute/stats')).status).toBe(403);
    expect((await studentClient.get('/api/recruiter/profile')).status).toBe(403);
    expect((await institute.client.get('/api/student/me/profile')).status).toBe(403);
  });

  it('resets a password through an emailed single-use link', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const email = uniqueEmail('student');
    await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));
    clearOutbox();

    const request = await createTestClient().post('/api/auth/password-reset/request', { email, role: 'STUDENT' });
    expect(request.status).toBe(200);

    const message = getOutbox().find((entry) => entry.to === email);
    expect(message).toBeTruthy();
    const token = /token=([A-Za-z0-9_-]+)/.exec(message?.text ?? '')?.[1];
    expect(token).toBeTruthy();

    const complete = await createTestClient().post('/api/auth/password-reset/complete', {
      token,
      password: 'BrandNewPass2026',
    });
    expect(complete.status).toBe(200);

    const login = await createTestClient().post('/api/auth/login', { identifier: email, password: 'BrandNewPass2026' });
    expect(login.status).toBe(200);

    // The token is single-use.
    const replay = await createTestClient().post('/api/auth/password-reset/complete', {
      token,
      password: 'AnotherPass2026',
    });
    expect(replay.status).toBe(410);
  });

  it('does not reveal whether an address has an account', async () => {
    const known = await createInstituteFixture();
    const knownRequest = await createTestClient().post('/api/auth/password-reset/request', { email: known.adminEmail, role: 'INSTITUTE_ADMIN' });
    const unknownRequest = await createTestClient().post('/api/auth/password-reset/request', {
      email: uniqueEmail('nobody'),
      role: 'STUDENT',
    });

    expect(knownRequest.status).toBe(200);
    expect(unknownRequest.status).toBe(200);
    expect(knownRequest.body.message).toBe(unknownRequest.body.message);
  });

  it('gives a normal sign-in 10 minutes and a "Remember me" sign-in 7 days', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const email = uniqueEmail('student');

    const registered = await client.post(
      '/api/auth/register/student',
      studentBody(institute.instituteId, institute.studentCode, email),
    );
    expect(registered.status).toBe(201);

    const shortLived = await sessionExpiry(registered.body.user.id);
    expect(shortLived).toBeTruthy();
    expect(minutesFromNow(shortLived as string)).toBeGreaterThan(9);
    expect(minutesFromNow(shortLived as string)).toBeLessThan(11);

    const remembered = await createTestClient().post('/api/auth/login', {
      identifier: email,
      password: STUDENT_PASSWORD,
      role: 'STUDENT',
      rememberMe: true,
    });
    expect(remembered.status).toBe(200);

    const longLived = await sessionExpiry(remembered.body.user.id);
    expect(longLived).toBeTruthy();
    expect(minutesFromNow(longLived as string)).toBeGreaterThan(7 * 24 * 60 - 5);
  });

  it('refuses protected requests once the session has expired', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const registered = await client.post(
      '/api/auth/register/student',
      studentBody(institute.instituteId, institute.studentCode),
    );

    const before = await client.get('/api/auth/me');
    expect(before.status).toBe(200);

    // Move the stored expiry into the past; the cookie itself stays valid.
    await writeQuery('MATCH (s:Session {userId: $userId}) SET s.expiresAt = $past', {
      userId: registered.body.user.id,
      past: new Date(Date.now() - 1000).toISOString(),
    });

    const after = await client.get('/api/auth/me');
    expect(after.status).toBe(401);

    const again = await client.get('/api/auth/me');
    expect(again.status).toBe(401);
  });

  it('signs out existing sessions when a password is reset', async () => {
    const institute = await createInstituteFixture();
    const client = createTestClient();
    const email = uniqueEmail('student');
    await client.post('/api/auth/register/student', studentBody(institute.instituteId, institute.studentCode, email));
    clearOutbox();

    await createTestClient().post('/api/auth/password-reset/request', { email, role: 'STUDENT' });
    const token = /token=([A-Za-z0-9_-]+)/.exec(getOutbox()[0]?.text ?? '')?.[1];
    expect(token).toBeTruthy();

    await createTestClient().post('/api/auth/password-reset/complete', { token, password: 'BrandNewPass2026' });

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('only resets the account type that was chosen', async () => {
    const institute = await createInstituteFixture();
    clearOutbox();

    // The administrator's address, but the student form was used.
    await createTestClient().post('/api/auth/password-reset/request', {
      email: institute.adminEmail,
      role: 'STUDENT',
    });
    expect(getOutbox().filter((entry) => entry.to === institute.adminEmail)).toHaveLength(0);

    await createTestClient().post('/api/auth/password-reset/request', {
      email: institute.adminEmail,
      role: 'INSTITUTE_ADMIN',
    });
    expect(getOutbox().filter((entry) => entry.to === institute.adminEmail)).toHaveLength(1);
  });
});

/** Minutes between now and an ISO timestamp (negative means already past). */
const minutesFromNow = (iso: string): number => (new Date(iso).getTime() - Date.now()) / 60000;

const sessionExpiry = async (userId: string): Promise<string | null> => {
  // Newest first: a previous sign-in may still hold its own (shorter) session.
  const row = await readOne<{ expiresAt: string }>(
    'MATCH (s:Session {userId: $userId}) RETURN s.expiresAt AS expiresAt ORDER BY s.expiresAt DESC LIMIT 1',
    { userId },
  );
  return row?.expiresAt ?? null;
};
