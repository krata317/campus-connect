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

const envSchema = z.object({
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
