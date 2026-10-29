import { instituteRepository } from '../../src/repositories/institute.repository';
import { recruiterRepository } from '../../src/repositories/recruiter.repository';
import { generateStudentCode, hashStudentCode } from '../../src/lib/tokens';
import { hashPassword } from '../../src/lib/password';
import { companyNameKey } from '@campusconnect/shared';
import { createTestClient, uniqueEmail, uniqueCompany, ADMIN_PASSWORD, RECRUITER_PASSWORD, STUDENT_PASSWORD, type TestClient } from './client';

let codeCounter = 0;

export interface InstituteFixture {
  instituteId: string;
  name: string;
  aisheCode: string;
  studentCode: string;
  adminEmail: string;
  adminUsername: string;
  client: TestClient;
}

/**
 * Creates an institute and its administrator directly (bypassing email) so the
 * tests can focus on the behaviour under test. The public registration flow is
 * covered separately in registration.test.ts.
 */
export async function createInstituteFixture(options: { name?: string } = {}): Promise<InstituteFixture> {
  codeCounter += 1;
  const name = options.name ?? `Northfield Institute of Technology ${codeCounter}`;
  const aisheCode = `T-${String(900000 + codeCounter)}`;
  const adminEmail = uniqueEmail('admin');
  const adminUsername = `admin${codeCounter}${Date.now().toString(36).slice(-4)}`;
  const studentCode = generateStudentCode();

  const created = await instituteRepository.createWithAdmin(
    {
      aisheCode,
      name,
      state: 'Karnataka',
      district: 'Bengaluru',
      website: null,
      contactEmail: adminEmail,
      contactPhone: null,
      studentCode,
    },
    { email: adminEmail, username: adminUsername, passwordHash: await hashPassword(ADMIN_PASSWORD), fullName: 'Placement Administrator' },
  );

  if (!created) throw new Error('Could not create the institute fixture');

  // Re-key the hash now that the institute id exists (same as the real flow).
  await instituteRepository.setStudentCode(created.instituteId, hashStudentCode(created.instituteId, studentCode));

  const client = createTestClient();
  const login = await client.post('/api/auth/login', {
    identifier: adminUsername,
    password: ADMIN_PASSWORD,
    role: 'INSTITUTE_ADMIN',
  });
  if (login.status !== 200) {
    throw new Error(`Institute admin login failed: ${JSON.stringify(login.body)}`);
  }

  return { instituteId: created.instituteId, name, aisheCode, studentCode, adminEmail, adminUsername, client };
}

export interface RecruiterFixture {
  recruiterId: string;
  companyName: string;
  email: string;
  username: string;
  client: TestClient;
}

/** Creates a recruiter account directly (no email) and signs it in. */
export async function createRecruiterFixture(options: { companyName?: string } = {}): Promise<RecruiterFixture> {
  const companyName = options.companyName ?? uniqueCompany('Northwind Systems');
  const email = uniqueEmail('recruiter');
  const username = `rec${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

  const created = await recruiterRepository.create({
    email,
    username,
    passwordHash: await hashPassword(RECRUITER_PASSWORD),
    companyName,
    companyNameKey: companyNameKey(companyName),
    website: null,
    contactPersonName: 'Ravi Menon',
    contactPhone: '9876543210',
    description: 'Product engineering company',
  });

  if (!created) throw new Error('Could not create the recruiter fixture');

  const client = createTestClient();
  const login = await client.post('/api/auth/login', {
    identifier: username,
    password: RECRUITER_PASSWORD,
    role: 'RECRUITER',
  });
  if (login.status !== 200) {
    throw new Error(`Recruiter login failed: ${JSON.stringify(login.body)}`);
  }

  return { recruiterId: created.recruiterId, companyName, email, username, client };
}

export interface StudentFixture {
  studentId: string;
  email: string;
  client: TestClient;
}

/** Registers a student through the real HTTP flow using the institute code. */
export async function createStudentFixture(institute: InstituteFixture, fullName = 'Asha Verma'): Promise<StudentFixture> {
  const client = createTestClient();
  const email = uniqueEmail('student');
  const response = await client.post('/api/auth/register/student', {
    fullName,
    email,
    password: STUDENT_PASSWORD,
    instituteId: institute.instituteId,
    studentCode: institute.studentCode,
  });
  if (response.status !== 201) {
    throw new Error(`Student registration failed: ${JSON.stringify(response.body)}`);
  }
  return { studentId: response.body.user.id, email, client };
}
