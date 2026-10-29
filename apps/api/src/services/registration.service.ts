import type { RegistrationLinkInfo, RegistrationStartResult } from '@campusconnect/shared';
import { companyNameKey } from '@campusconnect/shared';
import { env } from '../config/env';
import { badRequest, conflict, emailUnavailable, gone, notFound, tooManyRequests } from '../lib/errors';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/password';
import {
  generateOtp,
  generateStudentCode,
  generateToken,
  hashOtp,
  hashToken,
  isExpired,
  msFromNow,
  verifyOtpHash,
} from '../lib/tokens';
import { findInstitution } from '../data/aishe';
import { accountRepository } from '../repositories/account.repository';
import { instituteRepository } from '../repositories/institute.repository';
import { recruiterRepository } from '../repositories/recruiter.repository';
import { registrationRepository, type PendingRegistration } from '../repositories/registration.repository';
import { emailService } from './email.service';

function assertEmailAvailable(email: string): Promise<void> {
  return accountRepository.emailExists(email).then((exists) => {
    if (exists) {
      throw conflict(
        'An account already uses this email address. Sign in instead, or use “Forgot password” if you cannot remember your password.',
      );
    }
  });
}

function assertEmailTransport(): void {
  if (!emailService.isConfigured()) {
    throw emailUnavailable(
      'Email delivery is not configured on this server, so verification codes cannot be sent. Ask the administrator to configure SMTP.',
    );
  }
}

async function issueLink(pending: PendingRegistration, purpose: string, displayName: string): Promise<void> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = msFromNow(env.registrationTokenTtlMs);

  const updated = await registrationRepository.markLinkIssued(pending.id, tokenHash, expiresAt);
  if (!updated) throw notFound('This registration is no longer available');

  const link = `${env.appBaseUrl}/register/${pending.type === 'INSTITUTE' ? 'institute' : 'recruiter'}/complete?token=${token}`;
  await emailService.sendRegistrationLink(pending.email, purpose, displayName, link);
}

export const registrationService = {
  // -------------------------------------------------------------------------
  // Institute registration
  // -------------------------------------------------------------------------
  async startInstitute(input: { aisheCode: string; email: string }): Promise<RegistrationStartResult> {
    assertEmailTransport();

    const institution = findInstitution(input.aisheCode);
    if (!institution) {
      throw badRequest(
        'That AISHE code is not in the institution directory. Check the code on your AISHE certificate and try again.',
      );
    }

    const existing = await instituteRepository.findByAisheCode(institution.aisheCode);
    if (existing) {
      throw conflict(
        `${institution.name} is already registered on Campus Connect. Sign in as the institute administrator, or use “Forgot password”.`,
      );
    }

    await assertEmailAvailable(input.email);

    const otp = generateOtp();
    const pendingKey = `INSTITUTE:${institution.aisheCode}`;

    // A second person cannot silently take over an in-progress registration:
    // the pending record is keyed by the AISHE code, so refreshing it would
    // invalidate the first person's code without telling them.
    const inProgress = await registrationRepository.findActiveByKey(pendingKey);
    if (inProgress && inProgress.email !== input.email) {
      const age = Date.now() - new Date(inProgress.updatedAt).getTime();
      if (age < env.registrationTokenTtlMs) {
        throw conflict(
          'A registration for this institute is already in progress. If you did not start it, try again in about an hour.',
        );
      }
    }

    const pending = await registrationRepository.startPending({
      type: 'INSTITUTE',
      pendingKey,
      email: input.email,
      aisheCode: institution.aisheCode,
      instituteName: institution.name,
      state: institution.state,
      district: institution.district,
      otpHash: hashOtp(pendingKey, otp),
      otpExpiresAt: msFromNow(env.otpTtlMs),
    });

    await emailService.sendOtp(input.email, 'institute registration', otp);

    return {
      pendingId: pending.id,
      email: input.email,
      expiresAt: pending.otpExpiresAt as string,
      institution,
    };
  },

  // -------------------------------------------------------------------------
  // Recruiter registration
  // -------------------------------------------------------------------------
  async startRecruiter(input: { companyName: string; email: string }): Promise<RegistrationStartResult> {
    assertEmailTransport();

    const key = companyNameKey(input.companyName);
    const existing = await recruiterRepository.findByCompanyKey(key);
    if (existing) {
      throw conflict(
        `${existing.companyName} is already registered as a recruiter. Sign in instead, or use “Forgot password”.`,
      );
    }

    await assertEmailAvailable(input.email);

    const otp = generateOtp();
    const pendingKey = `RECRUITER:${key}`;

    const inProgress = await registrationRepository.findActiveByKey(pendingKey);
    if (inProgress && inProgress.email !== input.email) {
      const age = Date.now() - new Date(inProgress.updatedAt).getTime();
      if (age < env.registrationTokenTtlMs) {
        throw conflict(
          'A registration for this company is already in progress. If you did not start it, try again in about an hour.',
        );
      }
    }

    const pending = await registrationRepository.startPending({
      type: 'RECRUITER',
      pendingKey,
      email: input.email,
      companyName: input.companyName,
      companyNameKey: key,
      otpHash: hashOtp(pendingKey, otp),
      otpExpiresAt: msFromNow(env.otpTtlMs),
    });

    await emailService.sendOtp(input.email, 'recruiter registration', otp);

    return { pendingId: pending.id, email: input.email, expiresAt: pending.otpExpiresAt as string };
  },

  // -------------------------------------------------------------------------
  // Shared verification steps
  // -------------------------------------------------------------------------
  async verifyOtp(input: { pendingId: string; code: string }): Promise<{ ok: true }> {
    const pending = await registrationRepository.findById(input.pendingId);
    if (!pending) throw notFound('This registration could not be found. Start again.');

    if (pending.status === 'COMPLETED') {
      throw conflict('This registration is already complete. Sign in instead.');
    }
    if (pending.status === 'LINK_SENT') {
      throw conflict('This email is already verified. Use the registration link that was emailed to you.');
    }
    if (isExpired(pending.otpExpiresAt)) {
      throw gone('That code has expired. Request a new code.');
    }
    if (pending.otpAttempts >= env.OTP_MAX_ATTEMPTS) {
      throw tooManyRequests('Too many incorrect codes. Request a new code.');
    }

    const matches = pending.otpHash ? verifyOtpHash(pending.pendingKey, input.code, pending.otpHash) : false;
    if (!matches) {
      const attempts = await registrationRepository.recordFailedAttempt(pending.id);
      const remaining = Math.max(0, env.OTP_MAX_ATTEMPTS - attempts);
      throw badRequest(
        remaining > 0
          ? `That code is not correct. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'That code is not correct. Request a new code.',
      );
    }

    const displayName =
      pending.type === 'INSTITUTE' ? (pending.instituteName ?? 'your institute') : (pending.companyName ?? 'your company');
    await issueLink(pending, pending.type === 'INSTITUTE' ? 'institute registration' : 'recruiter registration', displayName);

    return { ok: true };
  },

  async resendOtp(input: { pendingId: string }): Promise<{ ok: true }> {
    assertEmailTransport();

    const pending = await registrationRepository.findById(input.pendingId);
    if (!pending) throw notFound('This registration could not be found. Start again.');
    if (pending.status !== 'AWAITING_OTP') {
      throw conflict('This email is already verified. Use the registration link that was emailed to you.');
    }
    if (pending.otpResends >= env.OTP_MAX_RESENDS) {
      throw tooManyRequests('You have requested too many codes. Start the registration again in a few minutes.');
    }
    if (pending.otpLastSentAt && Date.now() - new Date(pending.otpLastSentAt).getTime() < env.OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      throw tooManyRequests(
        `Wait ${env.OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
      );
    }

    const otp = generateOtp();
    await registrationRepository.refreshOtp(pending.id, hashOtp(pending.pendingKey, otp), msFromNow(env.otpTtlMs));
    await emailService.sendOtp(
      pending.email,
      pending.type === 'INSTITUTE' ? 'institute registration' : 'recruiter registration',
      otp,
    );
    return { ok: true };
  },

  async getLinkInfo(token: string): Promise<RegistrationLinkInfo> {
    const pending = await registrationRepository.findByTokenHash(hashToken(token));
    if (!pending || pending.status !== 'LINK_SENT' || pending.tokenUsedAt || isExpired(pending.tokenExpiresAt)) {
      throw gone('This registration link is invalid or has expired. Start the registration again.');
    }

    return {
      type: pending.type,
      email: pending.email,
      expiresAt: pending.tokenExpiresAt as string,
      ...(pending.type === 'INSTITUTE'
        ? {
            instituteName: pending.instituteName ?? undefined,
            instituteState: pending.state ?? undefined,
            instituteDistrict: pending.district ?? undefined,
            aisheCode: pending.aisheCode ?? undefined,
          }
        : { companyName: pending.companyName ?? undefined }),
    };
  },

  // -------------------------------------------------------------------------
  // Completion
  // -------------------------------------------------------------------------
  async completeInstitute(input: {
    token: string;
    fullName: string;
    username: string;
    password: string;
    contactPhone: string | null;
    website: string | null;
  }): Promise<{ instituteName: string; username: string; studentCode: string; emailSent: boolean }> {
    const tokenHash = hashToken(input.token);
    const pending = await registrationRepository.consumeToken(tokenHash, new Date().toISOString());
    if (!pending) {
      throw gone('This registration link is invalid, expired, or has already been used.');
    }

    try {
      if (pending.type !== 'INSTITUTE' || !pending.aisheCode || !pending.instituteName) {
        throw badRequest('This link is not an institute registration link.');
      }

      // Re-check the authoritative dataset at completion time.
      const institution = findInstitution(pending.aisheCode);
      if (!institution) throw badRequest('That AISHE code is no longer in the institution directory.');

      if (await instituteRepository.findByAisheCode(institution.aisheCode)) {
        throw conflict('This institute is already registered. Sign in instead.');
      }
      if (await accountRepository.emailExists(pending.email)) {
        throw conflict('An account already uses this email address. Sign in instead.');
      }
      if (await accountRepository.usernameExists(input.username)) {
        throw conflict('That username is taken. Choose another one.');
      }

      const studentCode = generateStudentCode();
      const created = await instituteRepository.createWithAdmin(
        {
          aisheCode: institution.aisheCode,
          name: institution.name,
          state: institution.state,
          district: institution.district,
          website: input.website,
          contactEmail: pending.email,
          contactPhone: input.contactPhone,
          studentCode,
        },
        {
          email: pending.email,
          username: input.username,
          passwordHash: await hashPassword(input.password),
          fullName: input.fullName,
        },
      );

      if (!created) {
        throw conflict('This institute, email or username is already registered. Sign in instead.');
      }

      let emailSent = true;
      try {
        await emailService.sendInstituteWelcome({
          to: pending.email,
          instituteName: institution.name,
          username: input.username,
          studentCode,
        });
      } catch (error) {
        emailSent = false;
        logger.warn('Institute welcome email failed', { reason: error instanceof Error ? error.message : String(error) });
      }

      await registrationRepository.deleteById(pending.id);

      return { instituteName: institution.name, username: input.username, studentCode, emailSent };
    } catch (error) {
      // Give the link back so a fixable mistake (e.g. username taken) does not
      // force the user to start the whole flow again.
      await registrationRepository.releaseToken(pending.id).catch(() => undefined);
      throw error;
    }
  },

  async completeRecruiter(input: {
    token: string;
    contactPersonName: string;
    contactPhone: string;
    username: string;
    password: string;
    website: string | null;
    description: string | null;
  }): Promise<{ companyName: string; username: string; emailSent: boolean }> {
    const tokenHash = hashToken(input.token);
    const pending = await registrationRepository.consumeToken(tokenHash, new Date().toISOString());
    if (!pending) {
      throw gone('This registration link is invalid, expired, or has already been used.');
    }

    try {
      if (pending.type !== 'RECRUITER' || !pending.companyName || !pending.companyNameKey) {
        throw badRequest('This link is not a recruiter registration link.');
      }

      if (await recruiterRepository.findByCompanyKey(pending.companyNameKey)) {
        throw conflict('This company is already registered. Sign in instead.');
      }
      if (await accountRepository.emailExists(pending.email)) {
        throw conflict('An account already uses this email address. Sign in instead.');
      }
      if (await accountRepository.usernameExists(input.username)) {
        throw conflict('That username is taken. Choose another one.');
      }

      const created = await recruiterRepository.create({
        email: pending.email,
        username: input.username,
        passwordHash: await hashPassword(input.password),
        companyName: pending.companyName,
        companyNameKey: pending.companyNameKey,
        website: input.website,
        contactPersonName: input.contactPersonName,
        contactPhone: input.contactPhone,
        description: input.description,
      });

      if (!created) throw conflict('This company, email or username is already registered. Sign in instead.');

      let emailSent = true;
      try {
        await emailService.sendRecruiterWelcome({
          to: pending.email,
          companyName: pending.companyName,
          username: input.username,
        });
      } catch (error) {
        emailSent = false;
        logger.warn('Recruiter welcome email failed', { reason: error instanceof Error ? error.message : String(error) });
      }

      await registrationRepository.deleteById(pending.id);

      return { companyName: pending.companyName, username: input.username, emailSent };
    } catch (error) {
      await registrationRepository.releaseToken(pending.id).catch(() => undefined);
      throw error;
    }
  },
};
