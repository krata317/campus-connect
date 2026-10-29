import { env } from '../config/env';
import { logger } from '../lib/logger';
import { sendMail } from '../email/mailer';
import {
  accountDeletedEmail,
  hiringRequestInstituteEmail,
  hiringRequestRecruiterEmail,
  instituteWelcomeEmail,
  otpEmail,
  passwordResetEmail,
  recruiterWelcomeEmail,
  requestStatusRecruiterEmail,
  registrationLinkEmail,
  shortlistStudentEmail,
  type RenderedEmail,
} from '../email/templates';

/**
 * Mandatory messages (verification, links, password reset, welcome) are always
 * sent and propagate failures: the caller must not tell the user that an email
 * went out when it did not.
 *
 * Optional messages (product and recruitment updates) are gated by the
 * recipient's `emailNotifications` preference and never break the request that
 * triggered them.
 */
async function deliver(to: string, rendered: RenderedEmail): Promise<void> {
  await sendMail({ to, ...rendered });
}

async function deliverOptional(to: string, enabled: boolean, rendered: RenderedEmail, label: string): Promise<void> {
  if (!enabled) {
    logger.info(`Email skipped (${label}): recipient disabled optional notifications`);
    return;
  }
  try {
    await deliver(to, rendered);
  } catch (error) {
    logger.warn(`Email failed (${label})`, { to, reason: error instanceof Error ? error.message : String(error) });
  }
}

export const emailService = {
  isConfigured(): boolean {
    return env.emailConfigured;
  },

  async sendOtp(to: string, purpose: string, otp: string): Promise<void> {
    await deliver(to, otpEmail({ purpose, otp, expiresInMinutes: Math.round(env.otpTtlMs / 60000) }));
  },

  async sendRegistrationLink(to: string, purpose: string, displayName: string, link: string): Promise<void> {
    await deliver(
      to,
      registrationLinkEmail({ purpose, displayName, link, expiresInMinutes: Math.round(env.registrationTokenTtlMs / 60000) }),
    );
  },

  async sendInstituteWelcome(params: {
    to: string;
    instituteName: string;
    username: string;
    studentCode: string;
  }): Promise<void> {
    await deliver(
      params.to,
      instituteWelcomeEmail({
        instituteName: params.instituteName,
        username: params.username,
        studentCode: params.studentCode,
        loginUrl: `${env.appBaseUrl}/login`,
      }),
    );
  },

  async sendRecruiterWelcome(params: { to: string; companyName: string; username: string }): Promise<void> {
    await deliver(
      params.to,
      recruiterWelcomeEmail({
        companyName: params.companyName,
        username: params.username,
        loginUrl: `${env.appBaseUrl}/login`,
      }),
    );
  },

  async sendPasswordReset(to: string, link: string): Promise<void> {
    await deliver(to, passwordResetEmail({ link, expiresInMinutes: Math.round(env.passwordResetTtlMs / 60000) }));
  },

  /**
   * The goodbye message. Mandatory and failure-propagating: the deletion flow
   * calls this before touching the database, so a delivery failure aborts the
   * deletion instead of leaving an account removed without a record of it.
   */
  async sendAccountDeleted(params: {
    to: string;
    roleLabel: string;
    email: string;
    removedStudents: number;
  }): Promise<void> {
    await deliver(
      params.to,
      accountDeletedEmail({ roleLabel: params.roleLabel, email: params.email, removedStudents: params.removedStudents }),
    );
  },

  async notifyInstituteNewRequest(params: {
    to: string;
    enabled: boolean;
    instituteName: string;
    recruiterName: string;
    requestTitle: string;
    roleCount: number;
    requestId: string;
  }): Promise<void> {
    await deliverOptional(
      params.to,
      params.enabled,
      hiringRequestInstituteEmail({
        instituteName: params.instituteName,
        recruiterName: params.recruiterName,
        requestTitle: params.requestTitle,
        roleCount: params.roleCount,
        link: `${env.appBaseUrl}/institute/requests/${params.requestId}`,
      }),
      'institute-new-request',
    );
  },

  async notifyRecruiterSubmitted(params: {
    to: string;
    enabled: boolean;
    recruiterName: string;
    instituteName: string;
    requestTitle: string;
    requestId: string;
  }): Promise<void> {
    await deliverOptional(
      params.to,
      params.enabled,
      hiringRequestRecruiterEmail({
        recruiterName: params.recruiterName,
        instituteName: params.instituteName,
        requestTitle: params.requestTitle,
        link: `${env.appBaseUrl}/recruiter/requests/${params.requestId}`,
      }),
      'recruiter-request-submitted',
    );
  },

  async notifyRecruiterStatus(params: {
    to: string;
    enabled: boolean;
    instituteName: string;
    requestTitle: string;
    statusLabel: string;
    note: string | null;
    requestId: string;
  }): Promise<void> {
    await deliverOptional(
      params.to,
      params.enabled,
      requestStatusRecruiterEmail({
        instituteName: params.instituteName,
        requestTitle: params.requestTitle,
        statusLabel: params.statusLabel,
        note: params.note,
        link: `${env.appBaseUrl}/recruiter/requests/${params.requestId}`,
      }),
      'recruiter-request-status',
    );
  },

  async notifyStudentShortlist(params: {
    to: string;
    enabled: boolean;
    studentName: string;
    recruiterName: string;
    roleTitle: string;
    instituteName: string;
    message: string;
    registrationUrl: string;
  }): Promise<void> {
    await deliverOptional(
      params.to,
      params.enabled,
      shortlistStudentEmail({
        studentName: params.studentName,
        recruiterName: params.recruiterName,
        roleTitle: params.roleTitle,
        instituteName: params.instituteName,
        message: params.message,
        registrationUrl: params.registrationUrl,
        link: `${env.appBaseUrl}/student/notifications`,
      }),
      'student-shortlist',
    );
  },
};
