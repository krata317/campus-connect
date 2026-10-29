import type { AuthUser, Role } from '@campusconnect/shared';
import { accountRepository } from '../repositories/account.repository';
import { deletionRepository } from '../repositories/deletion.repository';
import { studentRepository } from '../repositories/student.repository';
import { verifyPassword } from '../lib/password';
import { badRequest, emailUnavailable, notFound } from '../lib/errors';
import { emailService } from './email.service';
import { logger } from '../lib/logger';

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'student',
  RECRUITER: 'recruiter',
  INSTITUTE_ADMIN: 'institute administrator',
};

export const accountDeletionService = {
  /**
   * Deletes the signed-in account. The account is always resolved from the
   * session, so there is no id in the request that could point at somebody else.
   *
   * Order matters:
   *   1. verify the password against the stored hash,
   *   2. send the goodbye email — if it fails, nothing has been deleted yet,
   *   3. delete in one transaction, which also drops every session for the
   *      account so no stale cookie can authenticate again.
   */
  async deleteOwnAccount(user: AuthUser, password: string): Promise<void> {
    const account = await accountRepository.findById(user.role, user.id);
    if (!account) throw notFound('This account no longer exists.');

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      throw badRequest('That password is not correct, so nothing was deleted.');
    }

    // Counted before the delete so the email can state the real number.
    const removedStudents =
      account.kind === 'INSTITUTE_ADMIN' && account.instituteId
        ? await studentRepository.count(account.instituteId, { q: '' })
        : 0;

    try {
      await emailService.sendAccountDeleted({
        to: account.email,
        roleLabel: ROLE_LABEL[account.kind],
        email: account.email,
        removedStudents,
      });
    } catch (error) {
      logger.warn('Account deletion aborted: the confirmation email could not be sent', {
        role: account.kind,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw emailUnavailable(
        'We could not send the confirmation email, so your account has not been deleted. Please try again in a few minutes.',
      );
    }

    const deleted =
      account.kind === 'STUDENT'
        ? await deletionRepository.deleteStudent(account.id, account.instituteId ?? '')
        : account.kind === 'RECRUITER'
          ? await deletionRepository.deleteRecruiter(account.id)
          : await deletionRepository.deleteInstitute(account.instituteId ?? '');

    if (!deleted) {
      throw notFound('This account no longer exists.');
    }

    // No email address, name or token is logged.
    logger.info(`Account deleted (${account.kind})`, { role: account.kind });
  },
};
