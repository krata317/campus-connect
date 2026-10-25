import type { AuthUser, College, EmployerApprovalStatus, Role } from '@campusconnect/shared';
import { accountRepository, type AccountRow } from '../repositories/account.repository';
import { collegeRepository } from '../repositories/college.repository';
import { employerRepository } from '../repositories/employer.repository';
import { hashPassword, verifyPassword } from '../lib/password';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors';

// A syntactically valid bcrypt hash used to equalise response time when no account matches.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const toAuthUser = (account: AccountRow): AuthUser => ({
  id: account.id,
  role: account.kind,
  email: account.email,
  displayName: account.displayName,
  college:
    account.collegeId && account.collegeName && account.collegeSlug
      ? { id: account.collegeId, name: account.collegeName, slug: account.collegeSlug }
      : null,
  ...(account.kind === 'EMPLOYER' ? { employerApprovalStatus: (account.approvalStatus ?? 'PENDING') as EmployerApprovalStatus } : {}),
});

/**
 * Resolves a college from a client-supplied slug. The slug is only a lookup
 * key: the tenant id written to the graph always comes from the database row,
 * never from the request.
 */
async function resolveCollege(slug: string): Promise<College> {
  const college = await collegeRepository.findBySlug(slug);
  if (!college) {
    throw badRequest('That college could not be found. Choose a college from the list.');
  }
  if (!college.active) {
    throw badRequest('That college is not currently accepting registrations.');
  }
  return college;
}

export const authService = {
  async registerStudent(input: {
    fullName: string;
    email: string;
    password: string;
    dateOfBirth: string | null;
    collegeSlug: string;
  }): Promise<AuthUser> {
    const existing = await accountRepository.findByEmail(input.email);
    if (existing.length > 0) {
      throw conflict('An account with this email address already exists. Try signing in instead.');
    }
    const college = await resolveCollege(input.collegeSlug);
    const passwordHash = await hashPassword(input.password);
    const id = await accountRepository.createStudent({
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      dateOfBirth: input.dateOfBirth,
      collegeId: college.id,
    });
    return {
      id,
      role: 'STUDENT',
      email: input.email,
      displayName: input.fullName,
      college: { id: college.id, name: college.name, slug: college.slug },
    };
  },

  async registerEmployer(input: {
    email: string;
    password: string;
    companyName: string;
    website: string | null;
    contactPersonName: string;
    contactPhone: string;
    companyEmail: string;
    description: string | null;
    collegeSlug: string;
  }): Promise<AuthUser> {
    const existing = await accountRepository.findByEmail(input.email);
    if (existing.length > 0) {
      throw conflict('An account with this email address already exists. Try signing in instead.');
    }
    const college = await resolveCollege(input.collegeSlug);
    const passwordHash = await hashPassword(input.password);
    const { employerId } = await employerRepository.register(
      {
        email: input.email,
        passwordHash,
        companyName: input.companyName,
        website: input.website,
        contactPersonName: input.contactPersonName,
        contactPhone: input.contactPhone,
        companyEmail: input.companyEmail,
        description: input.description,
      },
      college.id,
    );
    return {
      id: employerId,
      role: 'EMPLOYER',
      email: input.email,
      displayName: input.companyName,
      college: { id: college.id, name: college.name, slug: college.slug },
      employerApprovalStatus: 'PENDING',
    };
  },

  async login(input: { email: string; password: string; role?: Role }): Promise<AuthUser> {
    const accounts = await accountRepository.findByEmail(input.email);
    const candidates = input.role ? accounts.filter((account) => account.kind === input.role) : accounts;

    if (candidates.length === 0) {
      await verifyPassword(input.password, DUMMY_HASH);
      throw unauthorized('Email or password is incorrect');
    }

    if (candidates.length > 1) {
      throw conflict('This email is used by more than one account type. Choose the account type you want to sign in to.');
    }

    const account = candidates[0] as AccountRow;
    const valid = await verifyPassword(input.password, account.passwordHash);
    if (!valid) {
      throw unauthorized('Email or password is incorrect');
    }

    if (account.kind === 'ADMIN' && account.active === false) {
      throw forbidden('This administrator account has been deactivated');
    }

    // An account without a tenant cannot be authorised safely, so it is
    // rejected rather than being treated as global.
    if (!account.collegeId) {
      throw forbidden('This account is not linked to a college. Ask your placement cell to check the setup.');
    }

    return toAuthUser(account);
  },

  async loadUser(role: Role, id: string): Promise<AuthUser | null> {
    const account = await accountRepository.findById(role, id);
    if (!account) return null;
    if (account.kind === 'ADMIN' && account.active === false) return null;
    if (!account.collegeId) return null;
    return toAuthUser(account);
  },
};
