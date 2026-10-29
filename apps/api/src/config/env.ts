import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

function findRepoRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const pkgPath = resolve(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === 'campusconnect') return dir;
      } catch {
        // Ignore an unreadable package.json and keep walking up.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const repoRoot = findRepoRoot(process.cwd());

for (const candidate of [resolve(repoRoot, '.env'), resolve(process.cwd(), '.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

const boolFromEnv = (defaultValue: boolean) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      const normalized = String(value).trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // Optional: the interface the HTTP server binds to. Left unset it becomes
    // 127.0.0.1 in production (so the API is only reachable through Nginx) and
    // 0.0.0.0 in development. An empty `HOST=` is treated as unset.
    HOST: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    // A trailing slash is the most common cause of a CORS origin mismatch,
    // because browsers never send one. It is stripped before validation.
    WEB_ORIGIN: z
      .string()
      .trim()
      .min(1)
      .default('http://localhost:5173')
      .transform((value) => value.replace(/\/+$/, '')),
    NEO4J_URI: z.string().trim().min(1, 'NEO4J_URI is required'),
    NEO4J_USERNAME: z.string().trim().min(1).default('neo4j'),
    NEO4J_PASSWORD: z.string().min(1, 'NEO4J_PASSWORD is required'),
    NEO4J_DATABASE: z.string().trim().min(1).default('neo4j'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_COOKIE_NAME: z.string().trim().min(1).default('cc.sid'),
    // How long a normal sign-in lasts before the user must sign in again.
    SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
    // How long a "Remember me" sign-in lasts.
    SESSION_REMEMBER_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    COOKIE_SECURE: boolFromEnv(false),
    TRUST_PROXY: boolFromEnv(false),

    // ---------------------------------------------------------------------
    // Email
    // ---------------------------------------------------------------------
    // Public URL used to build links inside emails. Defaults to WEB_ORIGIN.
    APP_BASE_URL: z.string().trim().min(1).optional(),
    // "auto" uses SMTP when SMTP_HOST is set, otherwise an in-memory outbox
    // that only logs the message (safe for local development and tests).
    EMAIL_TRANSPORT: z.enum(['auto', 'smtp', 'memory']).default('auto'),
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: boolFromEnv(false),
    SMTP_USER: z.string().trim().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().trim().default('Campus Connect <campus.connect.krata@gmail.com>'),

    // ---------------------------------------------------------------------
    // Verification windows
    // ---------------------------------------------------------------------
    OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(60).default(10),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
    OTP_MAX_RESENDS: z.coerce.number().int().min(1).max(20).default(5),
    REGISTRATION_TOKEN_TTL_MINUTES: z.coerce.number().int().min(10).max(1440).default(60),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(180).default(30),
  })
  .superRefine((data, ctx) => {
    // Production refuses to boot with development defaults, so an insecure
    // configuration is a startup error rather than a silent risk.
    if (data.NODE_ENV !== 'production') return;

    if (!data.WEB_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_ORIGIN'],
        message: 'WEB_ORIGIN must be an https:// URL in production (the public site origin)',
      });
    }
    if (!data.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production so session cookies are only sent over HTTPS',
      });
    }
    if (!data.TRUST_PROXY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message: 'TRUST_PROXY must be true in production so Express reads X-Forwarded-* headers from Nginx',
      });
    }
    if (!data.NEO4J_URI.startsWith('neo4j+s://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NEO4J_URI'],
        message: 'NEO4J_URI must use the encrypted neo4j+s:// scheme in production (AuraDB)',
      });
    }
    if (data.SESSION_SECRET.length < 48) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET must be at least 48 characters in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print the problems as a plain list and stop. A stack trace here would bury
  // the one line the operator actually needs to read.
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`).join('\n');
  console.error(
    [
      '',
      'Campus Connect cannot start: the environment configuration is invalid.',
      issues,
      '',
      'Fix the values above in the .env file in the project root.',
      'Use .env.example as the template; NODE_ENV=production requires https and secure cookies.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const smtpConfigured = Boolean(parsed.data.SMTP_HOST && parsed.data.SMTP_USER && parsed.data.SMTP_PASS);
const emailTransport: 'smtp' | 'memory' =
  parsed.data.EMAIL_TRANSPORT === 'smtp' ? 'smtp' : parsed.data.EMAIL_TRANSPORT === 'memory' ? 'memory' : smtpConfigured ? 'smtp' : 'memory';

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  host: parsed.data.HOST ?? (parsed.data.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'),
  repoRoot,
  sessionTtlMs: parsed.data.SESSION_TTL_MINUTES * 60 * 1000,
  sessionRememberTtlMs: parsed.data.SESSION_REMEMBER_DAYS * 24 * 60 * 60 * 1000,
  /** Public origin used for links inside emails. */
  appBaseUrl: (parsed.data.APP_BASE_URL ?? parsed.data.WEB_ORIGIN).replace(/\/+$/, ''),
  emailTransport,
  /** True when real email delivery is possible. Registration refuses to start without it. */
  emailConfigured: emailTransport === 'smtp' ? smtpConfigured : true,
  otpTtlMs: parsed.data.OTP_TTL_MINUTES * 60 * 1000,
  registrationTokenTtlMs: parsed.data.REGISTRATION_TOKEN_TTL_MINUTES * 60 * 1000,
  passwordResetTtlMs: parsed.data.PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
};

export type Env = typeof env;
