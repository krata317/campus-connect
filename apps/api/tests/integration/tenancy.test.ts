import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import {
  createTestClient,
  uniqueEmail,
  STUDENT_PASSWORD,
  EMPLOYER_PASSWORD,
  ADMIN_PASSWORD,
  type TestClient,
} from '../helpers/client';
import { collegeService } from '../../src/services/college.service';
import { skillService } from '../../src/services/skill.service';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[tenancy.test] ${testDbSkipReason}`);
}

const REGISTRATION_URL = 'https://recruiter.example.com/careers/apply';

const emptyCriteria = () => ({
  minClass10Percentage: null,
  minClass12Percentage: null,
  undergradScoreType: null,
  minUndergradScore: null,
  undergradScoreScale: null,
  allowedDegrees: [],
  allowedBranches: [],
  graduationYears: [],
  maxActiveBacklogs: null,
  minExperienceMonths: null,
  skillMode: 'ALL' as const,
  requiredSkillIds: [],
  optionalSkillIds: [],
});

interface Tenant {
  slug: string;
  collegeId: string;
  name: string;
  admin: TestClient;
  adminEmail: string;
}

describeDb('multi-college tenancy', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const makeCollege = async (name: string): Promise<Tenant> => {
    const slug = `college-${Math.random().toString(36).slice(2, 9)}`;
    const adminEmail = uniqueEmail('admin');
    const created = await collegeService.onboard({
      name,
      slug,
      website: null,
      contactEmail: null,
      contactPhone: null,
      adminEmail,
      adminName: 'Placement Administrator',
      adminPassword: ADMIN_PASSWORD,
    });

    const admin = createTestClient();
    const login = await admin.post('/api/auth/login', { email: adminEmail, password: ADMIN_PASSWORD, role: 'ADMIN' });
    expect(login.status).toBe(200);

    return { slug, collegeId: created.college.id, name, admin, adminEmail };
  };

  const registerStudent = async (tenant: Tenant, fullName: string) => {
    const client = createTestClient();
    const response = await client.post('/api/auth/register/student', {
      fullName,
      email: uniqueEmail('student'),
      password: STUDENT_PASSWORD,
      collegeSlug: tenant.slug,
    });
    expect(response.status).toBe(201);
    return { client, id: response.body.user.id as string };
  };

  const registerRecruiter = async (tenant: Tenant) => {
    const client = createTestClient();
    const response = await client.post('/api/auth/register/employer', {
      email: uniqueEmail('recruiter'),
      password: EMPLOYER_PASSWORD,
      companyName: 'Northwind Systems',
      website: 'https://northwind.example.com',
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      companyEmail: uniqueEmail('hr'),
      description: 'Product engineering company',
      collegeSlug: tenant.slug,
    });
    expect(response.status).toBe(201);
    return { client, id: response.body.user.id as string };
  };

  const createApprovedRequest = async (tenant: Tenant, recruiter: { client: TestClient; id: string }) => {
    const approval = await tenant.admin.post(`/api/admin/employers/${recruiter.id}/review`, { action: 'APPROVE' });
    expect(approval.status).toBe(200);

    const created = await recruiter.client.post('/api/employer/me/requests', {
      title: 'Graduate hiring drive',
      roles: [
        {
          title: 'Software Engineer',
          description: 'Build and maintain backend services.',
          registrationUrl: REGISTRATION_URL,
          criteria: emptyCriteria(),
        },
      ],
      submit: true,
    });
    expect(created.status).toBe(201);

    const requestId = created.body.request.id as string;
    const roleId = created.body.request.roles[0].id as string;

    const review = await tenant.admin.post(`/api/admin/requests/${requestId}/review`, { action: 'APPROVE' });
    expect(review.status).toBe(200);

    return { requestId, roleId };
  };

  it('creates independent administrators for independent colleges', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    expect(northfield.collegeId).not.toBe(lakeside.collegeId);

    const northfieldMe = await northfield.admin.get('/api/auth/me');
    const lakesideMe = await lakeside.admin.get('/api/auth/me');

    expect(northfieldMe.body.user.college.id).toBe(northfield.collegeId);
    expect(lakesideMe.body.user.college.id).toBe(lakeside.collegeId);
    expect(northfieldMe.body.user.college.name).toBe('Northfield Institute of Technology');
    expect(lakesideMe.body.user.college.name).toBe('Lakeside College of Engineering');
  });

  it('refuses a duplicate college slug and a duplicate administrator email', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');

    await expect(
      collegeService.onboard({
        name: 'A different name',
        slug: northfield.slug,
        website: null,
        contactEmail: null,
        contactPhone: null,
        adminEmail: uniqueEmail('admin'),
        adminName: 'Another Admin',
        adminPassword: ADMIN_PASSWORD,
      }),
    ).rejects.toThrow(/already exists/i);

    await expect(
      collegeService.onboard({
        name: 'Second Campus',
        slug: `college-${Math.random().toString(36).slice(2, 9)}`,
        website: null,
        contactEmail: null,
        contactPhone: null,
        adminEmail: northfield.adminEmail,
        adminName: 'Duplicate Email Admin',
        adminPassword: ADMIN_PASSWORD,
      }),
    ).rejects.toThrow(/already exists|already in use/i);
  });

  it('binds students and recruiters to the college they selected', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    const student = await registerStudent(northfield, 'Asha Verma');
    const recruiter = await registerRecruiter(lakeside);

    const studentMe = await student.client.get('/api/auth/me');
    const recruiterMe = await recruiter.client.get('/api/auth/me');

    expect(studentMe.body.user.college.slug).toBe(northfield.slug);
    expect(recruiterMe.body.user.college.slug).toBe(lakeside.slug);
    expect(recruiterMe.body.user.employerApprovalStatus).toBe('PENDING');
  });

  it('rejects registration for a college that does not exist', async () => {
    const client = createTestClient();
    const response = await client.post('/api/auth/register/student', {
      fullName: 'Asha Verma',
      email: uniqueEmail('student'),
      password: STUDENT_PASSWORD,
      collegeSlug: 'no-such-college',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/could not be found/i);
  });

  it('keeps student directories and profiles inside one college', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    await registerStudent(northfield, 'Asha Verma');
    const outsider = await registerStudent(lakeside, 'Rohit Sharma');

    const list = await northfield.admin.get('/api/admin/students');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].fullName).toBe('Asha Verma');

    // Direct id access to the other tenant's student must not resolve.
    const peek = await northfield.admin.get(`/api/admin/students/${outsider.id}`);
    expect(peek.status).toBe(404);

    const stats = await northfield.admin.get('/api/admin/stats');
    expect(stats.body.students).toBe(1);
  });

  it('keeps recruiter accounts and hiring requests inside one college', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    const recruiter = await registerRecruiter(lakeside);
    const { requestId } = await createApprovedRequest(lakeside, recruiter);

    const northfieldEmployers = await northfield.admin.get('/api/admin/employers');
    expect(northfieldEmployers.body.items).toHaveLength(0);

    const northfieldRequests = await northfield.admin.get('/api/admin/requests');
    expect(northfieldRequests.body.items).toHaveLength(0);

    const peekEmployer = await northfield.admin.get(`/api/admin/employers/${recruiter.id}`);
    expect(peekEmployer.status).toBe(404);

    const peekRequest = await northfield.admin.get(`/api/admin/requests/${requestId}`);
    expect(peekRequest.status).toBe(404);

    // A recruiter cannot reach another college's request either.
    const otherRecruiter = await registerRecruiter(northfield);
    const crossPeek = await otherRecruiter.client.get(`/api/employer/me/requests/${requestId}`);
    expect(crossPeek.status).toBe(404);
  });

  it('gives each college an independent skill catalogue', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    const lakesideSkill = await lakeside.admin.post('/api/admin/skills', { name: 'Python' });
    expect(lakesideSkill.status).toBe(201);

    const northfieldSkills = await northfield.admin.get('/api/admin/skills');
    expect(northfieldSkills.body.items).toHaveLength(0);

    // The same name is allowed in a different college.
    const duplicateElsewhere = await northfield.admin.post('/api/admin/skills', { name: 'Python' });
    expect(duplicateElsewhere.status).toBe(201);

    // ...but not twice inside one college.
    const duplicateSameCollege = await northfield.admin.post('/api/admin/skills', { name: 'python' });
    expect(duplicateSameCollege.status).toBe(409);

    // A foreign skill id cannot be renamed through the admin API.
    const crossUpdate = await northfield.admin.patch(`/api/admin/skills/${lakesideSkill.body.skill.id}`, { name: 'Hijacked' });
    expect(crossUpdate.status).toBe(404);

    // The same is true at the service layer, which is what the route delegates to.
    await expect(skillService.update(northfield.collegeId, lakesideSkill.body.skill.id, { name: 'Hijacked' })).rejects.toThrow(
      /not found/i,
    );
  });

  it('evaluates only students from the college that owns the role', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    await registerStudent(northfield, 'Asha Verma');
    await registerStudent(lakeside, 'Rohit Sharma');

    const recruiter = await registerRecruiter(northfield);
    const { roleId } = await createApprovedRequest(northfield, recruiter);

    const candidates = await northfield.admin.get(`/api/admin/roles/${roleId}/candidates?eligibleOnly=false`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.totalStudents).toBe(1);
    expect(candidates.body.candidates).toHaveLength(1);
    expect(candidates.body.candidates[0].fullName).toBe('Asha Verma');

    // The other college's administrator cannot reach this role at all.
    const crossRole = await lakeside.admin.get(`/api/admin/roles/${roleId}/candidates?eligibleOnly=false`);
    expect(crossRole.status).toBe(404);
  });

  it('refuses to shortlist or dispatch a student from another college', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    const insider = await registerStudent(northfield, 'Asha Verma');
    const outsider = await registerStudent(lakeside, 'Rohit Sharma');

    const recruiter = await registerRecruiter(northfield);
    const { roleId } = await createApprovedRequest(northfield, recruiter);

    const shortlist = await northfield.admin.put(`/api/admin/roles/${roleId}/shortlist`, {
      studentIds: [insider.id, outsider.id],
    });
    expect(shortlist.status).toBe(400);

    const dispatch = await northfield.admin.post(`/api/admin/roles/${roleId}/dispatch`, { studentIds: [outsider.id] });
    expect(dispatch.status).toBe(400);

    // Nothing leaked into the outsider's notification feed.
    const outsiderNotifications = await outsider.client.get('/api/students/me/notifications');
    expect(outsiderNotifications.body.total).toBe(0);
  });

  it('keeps shortlists and notifications tenant-specific', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    const insider = await registerStudent(northfield, 'Asha Verma');
    const outsider = await registerStudent(lakeside, 'Rohit Sharma');

    const recruiter = await registerRecruiter(northfield);
    const { roleId } = await createApprovedRequest(northfield, recruiter);

    const dispatch = await northfield.admin.post(`/api/admin/roles/${roleId}/dispatch`, { studentIds: [insider.id] });
    expect(dispatch.status).toBe(201);
    expect(dispatch.body.dispatched).toBe(1);

    const insiderNotifications = await insider.client.get('/api/students/me/notifications');
    expect(insiderNotifications.body.total).toBe(1);

    const outsiderNotifications = await outsider.client.get('/api/students/me/notifications');
    expect(outsiderNotifications.body.total).toBe(0);

    const lakesideDispatches = await lakeside.admin.get('/api/admin/dispatches');
    expect(lakesideDispatches.body.items).toHaveLength(0);

    const northfieldDispatches = await northfield.admin.get('/api/admin/dispatches');
    expect(northfieldDispatches.body.items).toHaveLength(1);
  });

  it('does not let a student or recruiter change their own college', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const lakeside = await makeCollege('Lakeside College of Engineering');

    const student = await registerStudent(northfield, 'Asha Verma');

    const update = await student.client.put('/api/students/me/profile', {
      fullName: 'Asha Verma',
      collegeSlug: lakeside.slug,
      collegeId: lakeside.collegeId,
      activeBacklogs: 0,
    });
    expect(update.status).toBe(200);

    const me = await student.client.get('/api/auth/me');
    expect(me.body.user.college.id).toBe(northfield.collegeId);

    // The recruiter profile form has no college field either.
    const recruiter = await registerRecruiter(northfield);
    const companyUpdate = await recruiter.client.put('/api/employer/me/company', {
      name: 'Northwind Systems',
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      contactEmail: uniqueEmail('hr'),
      collegeSlug: lakeside.slug,
    });
    expect(companyUpdate.status).toBe(200);

    const recruiterMe = await recruiter.client.get('/api/auth/me');
    expect(recruiterMe.body.user.college.id).toBe(northfield.collegeId);
  });

  it('blocks a recruiter from every student-facing endpoint', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const recruiter = await registerRecruiter(northfield);

    expect((await recruiter.client.get('/api/admin/students')).status).toBe(403);
    expect((await recruiter.client.get('/api/admin/stats')).status).toBe(403);
    expect((await recruiter.client.get('/api/students/me/profile')).status).toBe(403);
    expect((await recruiter.client.get('/api/students/me/dashboard')).status).toBe(403);
  });

  it('keeps a recruiter locked out of hiring requests until the college approves it', async () => {
    const northfield = await makeCollege('Northfield Institute of Technology');
    const recruiter = await registerRecruiter(northfield);

    const blocked = await recruiter.client.post('/api/employer/me/requests', {
      title: 'Early request',
      roles: [
        {
          title: 'Software Engineer',
          description: 'Build and maintain backend services.',
          registrationUrl: REGISTRATION_URL,
          criteria: emptyCriteria(),
        },
      ],
      submit: false,
    });
    expect(blocked.status).toBe(403);

    const approval = await northfield.admin.post(`/api/admin/employers/${recruiter.id}/review`, { action: 'APPROVE' });
    expect(approval.status).toBe(200);

    const allowed = await recruiter.client.post('/api/employer/me/requests', {
      title: 'Approved request',
      roles: [
        {
          title: 'Software Engineer',
          description: 'Build and maintain backend services.',
          registrationUrl: REGISTRATION_URL,
          criteria: emptyCriteria(),
        },
      ],
      submit: false,
    });
    expect(allowed.status).toBe(201);
  });
});
