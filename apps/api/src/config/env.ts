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
    WEB_ORIGIN: z.string().trim().min(1).default('http://localhost:5173'),
    NEO4J_URI: z.string().trim().min(1, 'NEO4J_URI is required'),
    NEO4J_USERNAME: z.string().trim().min(1).default('neo4j'),
    NEO4J_PASSWORD: z.string().min(1, 'NEO4J_PASSWORD is required'),
    NEO4J_DATABASE: z.string().trim().min(1).default('neo4j'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_COOKIE_NAME: z.string().trim().min(1).default('cc.sid'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(8760).default(168),
    COOKIE_SECURE: boolFromEnv(false),
    TRUST_PROXY: boolFromEnv(false),
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
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`).join('\n');
  throw new Error(
    `Invalid environment configuration.\n${issues}\n\nCopy .env.example to .env in the project root and fill in the values.`,
  );
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  repoRoot,
  sessionTtlMs: parsed.data.SESSION_TTL_HOURS * 60 * 60 * 1000,
};

export type Env = typeof env;
