import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  sentAt: string;
  transport: 'smtp' | 'memory';
}

/**
 * Messages that were "sent" through the in-memory transport. Only used in
 * development and tests; it lets the automated tests read the OTP without
 * opening a real mailbox, and gives the developer a readable preview in the
 * server log.
 */
const outbox: OutboundMessage[] = [];
const OUTBOX_LIMIT = 200;

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    auth: { user: env.SMTP_USER as string, pass: env.SMTP_PASS as string },
    pool: true,
    maxConnections: 1,
    maxMessages: 20,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export function emailStatus(): { transport: 'smtp' | 'memory'; configured: boolean; from: string } {
  return { transport: env.emailTransport, configured: env.emailConfigured, from: env.EMAIL_FROM };
}

export function getOutbox(): OutboundMessage[] {
  return [...outbox];
}

export function clearOutbox(): void {
  outbox.length = 0;
}

/**
 * Sends one message. Throws when delivery fails so the caller can tell the user
 * the truth instead of reporting a success that never happened.
 */
export async function sendMail(message: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const sentAt = new Date().toISOString();

  if (env.emailTransport === 'memory') {
    outbox.push({ ...message, sentAt, transport: 'memory' });
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
    logger.info(`[email:memory] "${message.subject}" -> ${message.to}`);
    if (!env.isTest) {
      // Visible during local development so the OTP flow can be completed
      // without a mailbox. Never printed when NODE_ENV=production.
      logger.info(`[email:memory] body:\n${message.text}`);
    }
    return;
  }

  if (!env.emailConfigured) {
    throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER and SMTP_PASS are required).');
  }

  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  logger.info(`[email:smtp] "${message.subject}" -> ${message.to}`);
}

/** Called at startup so a misconfigured production server fails loudly in the log. */
export function logEmailConfiguration(): void {
  const status = emailStatus();
  if (status.transport === 'smtp' && status.configured) {
    logger.info(`Email: SMTP via ${env.SMTP_HOST}:${env.SMTP_PORT} as ${env.SMTP_USER}`);
    return;
  }
  if (env.isProduction) {
    logger.warn(
      'Email: SMTP is NOT configured. Registration and password reset will be refused until SMTP_HOST, SMTP_USER and SMTP_PASS are set.',
    );
    return;
  }
  logger.info('Email: in-memory transport (messages are logged, not delivered).');
}
