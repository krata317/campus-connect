import type { AuthUser, Role } from '@campusconnect/shared';
import { accountRepository, type AccountRow } from '../repositories/account.repository';
import { instituteRepository } from '../repositories/institute.repository';
import { studentRepository } from '../repositories/student.repository';
import { passwordResetRepository } from '../repositories/registration.repository';
import { sessionRepository } from '../repositories/session.repository';
import { hashPassword, verifyPassword } from '../lib/password';
import { badRequest, conflict, forbidden, gone, unauthorized } from '../lib/errors';
import { generateToken, hashToken, isExpired, msFromNow, verifyStudentCode } from '../lib/tokens';
import { env } from '../config/env';
import { emailService } from './email.service';
import { logger } from '../lib/logger';

// A syntactically valid bcrypt hash used to equalise response time when no account matches.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const toAuthUser = (account: AccountRow): AuthUser => ({
  id: account.id,
  role: account.kind,
  email: account.email,
  displayName: account.displayName,
  emailNotifications: account.emailNotifications,
  ...(account.username ? { username: account.username } : {}),
  institute:
    account.instituteId && account.instituteName
      ? {
          id: account.instituteId,
          name: account.instituteName,
          aisheCode: account.instituteAisheCode ?? '',
          state: account.instituteState ?? '',
          district: account.instituteDistrict ?? '',
        }
      : null,
});

const looksLikeEmail = (value: string): boolean => value.includes('@');

export const authService = {
  /**
   * Student sign-up. The institute and its shared student code are verified
   * together on the server; the code is never accepted from a public listing.
   */
  async registerStudent(input: {
    fullName: string;
    email: string;
    password: string;
    dateOfBirth: string | null;
    instituteId: string;
    studentCode: string;
  }): Promise<AuthUser> {
    const institute = await instituteRepository.findById(input.instituteId);
    if (!institute || !institute.active) {
      throw badRequest('Choose a registered institute from the list.');
    }

    if (!verifyStudentCode(institute.id, input.studentCode, institute.studentCodeHash)) {
      throw badRequest(
        'That student code does not match this institute. Ask your placement cell for the current code.',
      );
    }

    if (await accountRepository.emailExists(input.email)) {
      throw conflict('An account with this email address already exists. Try signing in instead.');
    }

    const passwordHash = await hashPassword(input.password);
    const id = await studentRepository.create({
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      dateOfBirth: input.dateOfBirth,
      instituteId: institute.id,
    });

    if (!id) {
      throw conflict('This institute is not accepting students right now.');
    }

    return {
      id,
      role: 'STUDENT',
      email: input.email,
      displayName: input.fullName,
      emailNotifications: true,
      institute: {
        id: institute.id,
        name: institute.name,
        aisheCode: institute.aisheCode,
        state: institute.state,
        district: institute.district,
      },
    };
  },

  /** Sign in with an email address or a username. */
  async login(input: { identifier: string; password: string; role?: Role }): Promise<AuthUser> {
    const identifier = input.identifier.trim();
    const accounts = looksLikeEmail(identifier)
      ? await accountRepository.findByEmail(identifier.toLowerCase())
      : await accountRepository.findByUsername(identifier.toLowerCase());

    const candidates = input.role ? accounts.filter((account) => account.kind === input.role) : accounts;

    if (candidates.length === 0) {
      await verifyPassword(input.password, DUMMY_HASH);
      throw unauthorized('Email/username or password is incorrect');
    }

    if (candidates.length > 1) {
      throw conflict('This sign-in detail is used by more than one account type. Choose the account type you want.');
    }

    const account = candidates[0] as AccountRow;
    const valid = await verifyPassword(input.password, account.passwordHash);
    if (!valid) {
      throw unauthorized('Email/username or password is incorrect');
    }

    // An institute administrator without a live institute cannot be authorised safely.
    if (account.kind === 'INSTITUTE_ADMIN' && !account.instituteId) {
      throw forbidden('This administrator account is not linked to an institute. Ask for help from your placement cell.');
    }

    return toAuthUser(account);
  },

  async loadUser(role: Role, id: string): Promise<AuthUser | null> {
    const account = await accountRepository.findById(role, id);
    if (!account) return null;
    if (account.kind === 'INSTITUTE_ADMIN' && !account.instituteId) return null;
    return toAuthUser(account);
  },

  /**
   * Always resolves successfully so the endpoint cannot be used to discover
   * which addresses have accounts.
   */
  async requestPasswordReset(email: string, role: Role): Promise<void> {
    const accounts = await accountRepository.findByEmail(email);
    // Only the account of the chosen type can be reset, so a shared email
    // address never lets one account type change another's password.
    const account = accounts.find((candidate) => candidate.kind === role);
    if (!account) {
      logger.info('Password reset requested for an unknown address (no email sent)');
      return;
    }
    if (!emailService.isConfigured()) {
      logger.warn('Password reset requested but email delivery is not configured');
      return;
    }

    const token = generateToken();
    await passwordResetRepository.create({
      tokenHash: hashToken(token),
      accountKind: account.kind,
      accountId: account.id,
      email: account.email,
      expiresAt: msFromNow(env.passwordResetTtlMs),
    });

    try {
      await emailService.sendPasswordReset(account.email, `${env.appBaseUrl}/reset-password?token=${token}`);
    } catch (error) {
      logger.warn('Password reset email failed', { reason: error instanceof Error ? error.message : String(error) });
    }
  },

  async completePasswordReset(token: string, password: string): Promise<void> {
    const record = await passwordResetRepository.consume(hashToken(token), new Date().toISOString());
    if (!record || isExpired(record.expiresAt)) {
      throw gone('This password reset link is invalid or has expired. Request a new one.');
    }

    const kind = record.accountKind as Role;
    const passwordHash = await hashPassword(password);
    const updated = await accountRepository.setPassword(kind, record.accountId, passwordHash);
    if (!updated) throw gone('This account no longer exists.');

    // A reset means the old password may be compromised: sign out every device
    // that is still holding a session for this account.
    await sessionRepository.destroyForUser(record.accountId);
  },
};
