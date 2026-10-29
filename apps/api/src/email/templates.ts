/**
 * Email templates.
 *
 * Styles are inline because most mail clients strip <style> blocks. Every
 * template returns both an HTML body and a plain-text fallback.
 */

const COLORS = {
  navy: '#152741',
  body: '#223c58',
  muted: '#5b6b7f',
  border: '#dbe3ec',
  surface: '#f6f8fb',
  accent: '#2f5074',
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface LayoutOptions {
  heading: string;
  intro: string;
  paragraphs?: string[];
  code?: { label: string; value: string };
  button?: { label: string; url: string };
  note?: string;
  footer?: string;
}

function layout(options: LayoutOptions): string {
  const paragraphs = (options.paragraphs ?? [])
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.body};">${text}</p>`,
    )
    .join('');

  const code = options.code
    ? `<div style="margin:20px 0;padding:16px;border:1px solid ${COLORS.border};border-radius:10px;background:${COLORS.surface};text-align:center;">
         <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:8px;">${escapeHtml(options.code.label)}</div>
         <div style="font-size:30px;letter-spacing:.22em;font-weight:700;color:${COLORS.navy};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(options.code.value)}</div>
       </div>`
    : '';

  const button = options.button
    ? `<div style="margin:24px 0 8px;">
         <a href="${escapeHtml(options.button.url)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${escapeHtml(options.button.label)}</a>
       </div>
       <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};word-break:break-all;">If the button does not work, paste this link into your browser:<br />${escapeHtml(options.button.url)}</p>`
    : '';

  const note = options.note
    ? `<div style="margin-top:20px;padding:12px 14px;border-left:3px solid ${COLORS.border};background:${COLORS.surface};border-radius:6px;font-size:13px;line-height:1.6;color:${COLORS.muted};">${options.note}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(options.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px 0;">
                <div style="font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.accent};">Campus Connect</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 6px;">
                <h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;color:${COLORS.navy};">${escapeHtml(options.heading)}</h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.body};">${options.intro}</p>
                ${paragraphs}
                ${code}
                ${button}
                ${note}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 26px;">
                <div style="border-top:1px solid ${COLORS.border};padding-top:16px;font-size:12px;line-height:1.6;color:${COLORS.muted};">
                  ${options.footer ?? 'Campus Connect — campus placement management for students, recruiters and institutes.'}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, '');

export function otpEmail(params: {
  purpose: string;
  otp: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const subject = `Your Campus Connect verification code`;
  const html = layout({
    heading: 'Verify your email address',
    intro: `Use the code below to continue with your ${escapeHtml(params.purpose)}.`,
    code: { label: 'Verification code', value: params.otp },
    paragraphs: [
      `This code expires in ${params.expiresInMinutes} minutes and can be used once.`,
      'If you did not request this, you can ignore this email — no account will be created.',
    ],
    note: 'Campus Connect will never ask you for this code by phone, chat or email.',
  });
  const text = [
    'Verify your email address',
    '',
    `Your ${params.purpose} verification code is: ${params.otp}`,
    '',
    `This code expires in ${params.expiresInMinutes} minutes and can be used once.`,
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  return { subject, html, text };
}

export function registrationLinkEmail(params: {
  purpose: string;
  displayName: string;
  link: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const subject = `Finish your Campus Connect ${params.purpose}`;
  const html = layout({
    heading: 'Your email is verified',
    intro: `Continue registering <strong>${escapeHtml(params.displayName)}</strong> on Campus Connect.`,
    paragraphs: [
      `This link expires in ${params.expiresInMinutes} minutes and can only be used once.`,
    ],
    button: { label: 'Continue registration', url: params.link },
    note: 'If you did not request this, ignore this email and nothing will be created.',
  });
  const text = [
    'Your email is verified',
    '',
    `Continue registering ${params.displayName}:`,
    params.link,
    '',
    `This link expires in ${params.expiresInMinutes} minutes and can only be used once.`,
  ].join('\n');
  return { subject, html, text };
}

export function instituteWelcomeEmail(params: {
  instituteName: string;
  username: string;
  studentCode: string;
  loginUrl: string;
}): RenderedEmail {
  const subject = `Campus Connect is ready for ${params.instituteName}`;
  const html = layout({
    heading: 'Your institute is registered',
    intro: `<strong>${escapeHtml(params.instituteName)}</strong> is now on Campus Connect.`,
    paragraphs: [
      `Your administrator username is <strong>${escapeHtml(params.username)}</strong>.`,
      'Share the student verification code below with your students. They need it to register, and only your administrators can see it.',
    ],
    code: { label: 'Institute student code', value: params.studentCode },
    button: { label: 'Open your dashboard', url: params.loginUrl },
    note: 'Keep this code private. You can view it again, or rotate it, from Institute settings. Rotating it only affects future student registrations.',
  });
  const text = [
    'Your institute is registered',
    '',
    `${params.instituteName} is now on Campus Connect.`,
    `Administrator username: ${params.username}`,
    '',
    `Institute student code: ${params.studentCode}`,
    'Share this code with your students. Keep it private; you can rotate it from Institute settings.',
    '',
    `Sign in: ${params.loginUrl}`,
  ].join('\n');
  return { subject, html, text };
}

export function recruiterWelcomeEmail(params: { companyName: string; username: string; loginUrl: string }): RenderedEmail {
  const subject = `Your Campus Connect recruiter account is ready`;
  const html = layout({
    heading: 'Your recruiter account is ready',
    intro: `<strong>${escapeHtml(params.companyName)}</strong> can now send hiring requests to any registered institute.`,
    paragraphs: [`Your username is <strong>${escapeHtml(params.username)}</strong>.`],
    button: { label: 'Open your dashboard', url: params.loginUrl },
  });
  const text = [
    'Your recruiter account is ready',
    '',
    `${params.companyName} can now send hiring requests to any registered institute.`,
    `Username: ${params.username}`,
    '',
    `Sign in: ${params.loginUrl}`,
  ].join('\n');
  return { subject, html, text };
}

export function passwordResetEmail(params: { link: string; expiresInMinutes: number }): RenderedEmail {
  const subject = 'Reset your Campus Connect password';
  const html = layout({
    heading: 'Reset your password',
    intro: 'Use the button below to choose a new password.',
    paragraphs: [`This link expires in ${params.expiresInMinutes} minutes and can only be used once.`],
    button: { label: 'Choose a new password', url: params.link },
    note: 'If you did not request a password reset, no action is needed — your password stays unchanged.',
  });
  const text = [
    'Reset your password',
    '',
    params.link,
    '',
    `This link expires in ${params.expiresInMinutes} minutes and can only be used once.`,
    'If you did not request this, ignore this email.',
  ].join('\n');
  return { subject, html, text };
}

export function hiringRequestInstituteEmail(params: {
  instituteName: string;
  recruiterName: string;
  requestTitle: string;
  roleCount: number;
  link: string;
}): RenderedEmail {
  const subject = `New hiring request from ${params.recruiterName}`;
  const html = layout({
    heading: 'A recruiter sent you a hiring request',
    intro: `<strong>${escapeHtml(params.recruiterName)}</strong> submitted “${escapeHtml(params.requestTitle)}” to ${escapeHtml(params.instituteName)}.`,
    paragraphs: [`The request contains ${params.roleCount} role${params.roleCount === 1 ? '' : 's'} with structured eligibility criteria.`],
    button: { label: 'Review the request', url: params.link },
    note: 'Only approved requests can be shortlisted and dispatched to students.',
  });
  const text = [
    `New hiring request from ${params.recruiterName}`,
    '',
    `${params.recruiterName} submitted "${params.requestTitle}" to ${params.instituteName}.`,
    `Roles: ${params.roleCount}`,
    '',
    `Review: ${params.link}`,
  ].join('\n');
  return { subject, html, text };
}

export function hiringRequestRecruiterEmail(params: {
  recruiterName: string;
  instituteName: string;
  requestTitle: string;
  link: string;
}): RenderedEmail {
  const subject = `Request sent to ${params.instituteName}`;
  const html = layout({
    heading: 'Your hiring request was submitted',
    intro: `“${escapeHtml(params.requestTitle)}” was sent to <strong>${escapeHtml(params.instituteName)}</strong>.`,
    paragraphs: ['You will be notified here when the institute reviews it.'],
    button: { label: 'Track the request', url: params.link },
  });
  const text = [
    'Your hiring request was submitted',
    '',
    `"${params.requestTitle}" was sent to ${params.instituteName}.`,
    '',
    `Track it: ${params.link}`,
  ].join('\n');
  return { subject, html, text };
}

export function requestStatusRecruiterEmail(params: {
  instituteName: string;
  requestTitle: string;
  statusLabel: string;
  note: string | null;
  link: string;
}): RenderedEmail {
  const subject = `${params.instituteName}: “${params.requestTitle}” ${params.statusLabel.toLowerCase()}`;
  const html = layout({
    heading: `Request ${params.statusLabel.toLowerCase()}`,
    intro: `<strong>${escapeHtml(params.instituteName)}</strong> reviewed “${escapeHtml(params.requestTitle)}”.`,
    paragraphs: params.note ? [`Note from the institute: ${escapeHtml(params.note)}`] : [],
    button: { label: 'Open the request', url: params.link },
  });
  const text = [
    `${params.instituteName}: "${params.requestTitle}" ${params.statusLabel.toLowerCase()}`,
    params.note ? `Note: ${params.note}` : '',
    '',
    params.link,
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, html, text };
}

export function shortlistStudentEmail(params: {
  studentName: string;
  recruiterName: string;
  roleTitle: string;
  instituteName: string;
  message: string;
  registrationUrl: string;
  link: string;
}): RenderedEmail {
  const subject = `You were shortlisted for ${params.roleTitle}`;
  const html = layout({
    heading: `You were shortlisted for ${escapeHtml(params.roleTitle)}`,
    intro: `Hello ${escapeHtml(params.studentName)}, <strong>${escapeHtml(params.recruiterName)}</strong> shortlisted you through ${escapeHtml(params.instituteName)}.`,
    paragraphs: [`<span style="white-space:pre-line;">${escapeHtml(params.message)}</span>`],
    button: { label: 'View the notification', url: params.link },
    note: 'This is a college nomination, not a job offer. Complete the recruiter’s own application using the link in your Campus Connect notification.',
  });
  const text = [
    `You were shortlisted for ${params.roleTitle}`,
    '',
    params.message,
    '',
    `View the notification: ${params.link}`,
    `Apply: ${params.registrationUrl}`,
  ].join('\n');
  return { subject, html, text };
}

export { stripTags };
