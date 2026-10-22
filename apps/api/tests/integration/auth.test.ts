import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import { createTestClient, uniqueEmail, STUDENT_PASSWORD, EMPLOYER_PASSWORD, ADMIN_PASSWORD } from '../helpers/client';
import { accountRepository } from '../../src/repositories/account.repository';
import { hashPassword } from '../../src/lib/password';
import { readOne } from '../../src/db/neo4j';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  // Surfaced in the test output so a skipped run is never mistaken for a pass.
  console.warn(`[auth.test] ${testDbSkipReason}`);
}

describeDb('authentication and access control', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const registerStudent = async (client = createTestClient(), email = uniqueEmail('student')) => {
    const response = await client.post('/api/auth/register/student', {
      fullName: 'Asha Verma',
      email,
      password: STUDENT_PASSWORD,
    });
    return { client, response, email };
  };

  const createAdmin = async (email = uniqueEmail('admin')) => {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const created = await accountRepository.createAdmin({ email, passwordHash, name: 'Placement Admin' });
    return { id: created.id, email, password: ADMIN_PASSWORD };
  };

  it('reports API health without touching any protected data', async () => {
    const client = createTestClient();
    const response = await client.get('/api/health');

    expect(response.status).toBe(200);
  });

  it('registers a student, opens a session and returns the signed-in user', async () => {
    const { client, response, email } = await registerStudent();

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ role: 'STUDENT', email });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.user).not.toHaveProperty('password');

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('keeps the session alive across separate requests without any client-side token', async () => {
    const { client } = await registerStudent();

    // Three sequential requests reuse only the cookie jar, exactly like a browser.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const me = await client.get('/api/auth/me');
      expect(me.status).toBe(200);
    }
  });

  it('stores only a bcrypt hash, never the plaintext password', async () => {
    const { email } = await registerStudent();

    const row = await readOne<{ passwordHash: string }>('MATCH (s:Student {email: $email}) RETURN s.passwordHash AS passwordHash', { email });

    expect(row).not.toBeNull();
    expect(row?.passwordHash).not.toBe(STUDENT_PASSWORD);
    expect(row?.passwordHash.startsWith('$2')).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    const { email } = await registerStudent();
    const second = createTestClient();

    const response = await second.post('/api/auth/register/student', {
      fullName: 'Someone Else',
      email,
      password: STUDENT_PASSWORD,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a password shorter than 8 characters with a field level error', async () => {
    const client = createTestClient();

    const response = await client.post('/api/auth/register/student', {
      fullName: 'Asha Verma',
      email: uniqueEmail('student'),
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = response.body.error.details.fields as { path: string; message: string }[];
    expect(fields.some((field) => field.path === 'password')).toBe(true);
  });

  it('returns the same generic message for a wrong password and an unknown email', async () => {
    const { email } = await registerStudent();

    const wrongPassword = await createTestClient().post('/api/auth/login', { email, password: 'WrongPassword123', role: 'STUDENT' });
    const unknownEmail = await createTestClient().post('/api/auth/login', {
      email: uniqueEmail('nobody'),
      password: 'WrongPassword123',
      role: 'STUDENT',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('refuses to sign a student in through the administrator tab', async () => {
    const { email } = await registerStudent();

    const response = await createTestClient().post('/api/auth/login', { email, password: STUDENT_PASSWORD, role: 'ADMIN' });

    expect(response.status).toBe(401);
  });

  it('signs an existing student back in and clears the session on logout', async () => {
    const { email } = await registerStudent();
    const client = createTestClient();

    const login = await client.post('/api/auth/login', { email, password: STUDENT_PASSWORD, role: 'STUDENT' });
    expect(login.status).toBe(200);

    const logout = await client.post('/api/auth/logout');
    expect(logout.status).toBe(204);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('blocks mutating requests that arrive without a CSRF token', async () => {
    const client = createTestClient();

    const response = await client.postWithoutCsrf('/api/auth/register/student', {
      fullName: 'Asha Verma',
      email: uniqueEmail('student'),
      password: STUDENT_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks mutating requests whose CSRF token does not match the cookie', async () => {
    const client = createTestClient();
    await client.prime();

    const response = await client.postWithBadCsrf('/api/auth/register/student', {
      fullName: 'Asha Verma',
      email: uniqueEmail('student'),
      password: STUDENT_PASSWORD,
    });

    expect(response.status).toBe(403);
  });

  it('rejects anonymous access to protected routes with 401', async () => {
    const client = createTestClient();

    expect((await client.get('/api/admin/stats')).status).toBe(401);
    expect((await client.get('/api/students/me/profile')).status).toBe(401);
    expect((await client.get('/api/employer/me/company')).status).toBe(401);
  });

  it('enforces role based access control on every portal', async () => {
    const { client: student } = await registerStudent();

    expect((await student.get('/api/admin/stats')).status).toBe(403);
    expect((await student.get('/api/employer/me/company')).status).toBe(403);
    // The student's own portal still works.
    expect((await student.get('/api/students/me/profile')).status).toBe(200);

    const employer = createTestClient();
    await employer.post('/api/auth/register/employer', {
      email: uniqueEmail('employer'),
      password: EMPLOYER_PASSWORD,
      companyName: 'Northwind Systems',
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      companyEmail: uniqueEmail('hr'),
    });

    expect((await employer.get('/api/admin/stats')).status).toBe(403);
    expect((await employer.get('/api/students/me/profile')).status).toBe(403);
  });

  it('lets an administrator sign in after a one-time bootstrap and reach admin routes', async () => {
    const admin = await createAdmin();
    const client = createTestClient();

    const login = await client.post('/api/auth/login', { email: admin.email, password: admin.password, role: 'ADMIN' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('ADMIN');

    const stats = await client.get('/api/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveProperty('students');
  });

  it('creates an employer in PENDING state and blocks hiring requests until approval', async () => {
    const client = createTestClient();
    const email = uniqueEmail('employer');

    const register = await client.post('/api/auth/register/employer', {
      email,
      password: EMPLOYER_PASSWORD,
      companyName: 'Northwind Systems',
      website: 'https://northwind.example.com',
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      companyEmail: uniqueEmail('hr'),
    });

    expect(register.status).toBe(201);
    expect(register.body.user.employerApprovalStatus).toBe('PENDING');

    const company = await client.get('/api/employer/me/company');
    expect(company.status).toBe(200);
    expect(company.body.account.approvalStatus).toBe('PENDING');

    const request = await client.post('/api/employer/me/requests', {
      title: 'Campus drive 2026',
      roles: [
        {
          title: 'Software Engineer',
          description: 'Build backend services',
          registrationUrl: 'https://northwind.example.com/apply',
          criteria: {},
        },
      ],
    });

    expect(request.status).toBe(403);
    expect(request.body.error.message).toMatch(/approval/i);
  });

  it('does not let one employer read another employer request', async () => {
    const admin = await createAdmin();
    const adminClient = createTestClient();
    await adminClient.post('/api/auth/login', { email: admin.email, password: admin.password, role: 'ADMIN' });

    const employerA = createTestClient();
    await employerA.post('/api/auth/register/employer', {
      email: uniqueEmail('employer'),
      password: EMPLOYER_PASSWORD,
      companyName: 'Northwind Systems',
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      companyEmail: uniqueEmail('hr'),
    });
    const employerAId = (await employerA.get('/api/auth/me')).body.user.id as string;

    // Approve employer A so it can create a request.
    await adminClient.post(`/api/admin/employers/${employerAId}/review`, { action: 'APPROVE' });

    const created = await employerA.post('/api/employer/me/requests', {
      title: 'Campus drive 2026',
      roles: [
        {
          title: 'Software Engineer',
          description: 'Build backend services',
          registrationUrl: 'https://northwind.example.com/apply',
          criteria: {},
        },
      ],
    });
    expect(created.status).toBe(201);
    const requestId = created.body.request.id as string;

    const employerB = createTestClient();
    await employerB.post('/api/auth/register/employer', {
      email: uniqueEmail('employer'),
      password: EMPLOYER_PASSWORD,
      companyName: 'Contoso Labs',
      contactPersonName: 'Priya Nair',
      contactPhone: '9876500000',
      companyEmail: uniqueEmail('hr'),
    });

    const peek = await employerB.get(`/api/employer/me/requests/${requestId}`);
    expect(peek.status).toBe(404);
  });
});
