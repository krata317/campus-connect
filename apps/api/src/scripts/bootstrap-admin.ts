import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { collegeCreateSchema, collegeSlugSchema, emailSchema, nameSchema, passwordSchema } from '@campusconnect/shared';
import { accountRepository } from '../repositories/account.repository';
import { collegeRepository } from '../repositories/college.repository';
import { collegeService } from '../services/college.service';
import { closeDriver, verifyConnectivity } from '../db/neo4j';
import { env } from '../config/env';

/**
 * Creates a college and its first administrator.
 *
 * This is the only way to add a tenant. It is a local operator command, never
 * an HTTP endpoint, and it can be run once per college. Each run is
 * transactional: either both the College and the Admin exist afterwards, or
 * neither does.
 */

const pipedLines: string[] = [];

async function collectPipedInput(): Promise<void> {
  if (process.stdin.isTTY) return;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  pipedLines.push(...lines);
}

const nextPipedLine = (): string => (pipedLines.length > 0 ? (pipedLines.shift() as string) : '');

function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    return Promise.resolve(nextPipedLine().trim());
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stdout.write(`${question}(read from stdin)\n`);
    return Promise.resolve(nextPipedLine());
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const mutable = rl as unknown as { _writeToOutput?: (text: string) => void };
  const original = mutable._writeToOutput?.bind(rl);

  mutable._writeToOutput = (text: string) => {
    if (text.includes('\n') || text.includes('\r')) {
      process.stdout.write('\n');
      return;
    }
    void original;
  };

  process.stdout.write(question);

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      if (mutable._writeToOutput) {
        mutable._writeToOutput = original ?? (() => undefined);
      }
      resolve(answer);
    });
  });
}

const fail = (message: string): number => {
  console.error(`\n${message}`);
  return 1;
};

async function main(): Promise<number> {
  console.log('CampusConnect — college onboarding');
  console.log('----------------------------------');
  console.log('Creates one college and its first administrator account.');
  console.log('Run it again with different details to add another college.\n');

  await collectPipedInput();

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error(`\nCannot reach Neo4j at ${env.NEO4J_URI}.`);
    console.error('Start the database (Neo4j Desktop locally, AuraDB in production) and check the NEO4J_* values in .env.');
    console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const existingColleges = await collegeRepository.count();
  if (existingColleges > 0) {
    console.log(`The database already holds ${existingColleges} college(s). This run will add a new one.\n`);
  }

  const collegeNameInput = (process.env.COLLEGE_NAME ?? (await ask('College name: '))).trim();
  const collegeNameResult = collegeCreateSchema.shape.name.safeParse(collegeNameInput);
  if (!collegeNameResult.success) {
    return fail(`Invalid college name: ${collegeNameResult.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const slugInput = (process.env.COLLEGE_SLUG ?? (await ask('College identifier (slug), e.g. northfield-institute: '))).trim();
  const slugResult = collegeSlugSchema.safeParse(slugInput);
  if (!slugResult.success) {
    return fail(`Invalid college identifier: ${slugResult.error.issues[0]?.message ?? 'unknown error'}`);
  }
  const slug = slugResult.data;

  if (await collegeRepository.findBySlug(slug)) {
    return fail(`A college with the identifier "${slug}" already exists. Nothing was created.`);
  }

  const emailInput = (process.env.ADMIN_EMAIL ?? (await ask('Administrator email: '))).trim().toLowerCase();
  const emailResult = emailSchema.safeParse(emailInput);
  if (!emailResult.success) {
    return fail(`Invalid email: ${emailResult.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const nameInput = (process.env.ADMIN_NAME ?? (await ask('Administrator display name: '))).trim();
  const nameResult = nameSchema.safeParse(nameInput || 'Placement Administrator');
  if (!nameResult.success) {
    return fail(`Invalid name: ${nameResult.error.issues[0]?.message ?? 'unknown error'}`);
  }

  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await askHidden('Password (minimum 8 characters): ');
    const confirmation = await askHidden('Confirm password: ');
    if (password !== confirmation) {
      return fail('The passwords do not match. Nothing was created.');
    }
  }

  const passwordResult = passwordSchema.safeParse(password);
  if (!passwordResult.success) {
    return fail(`Invalid password: ${passwordResult.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const lockKey = `college-bootstrap:${slug}`;
  const token = randomUUID();
  const claimed = await accountRepository.claimBootstrapLock(lockKey, token);
  if (!claimed) {
    return fail('Another onboarding run for this college is in progress. Nothing was created.');
  }

  try {
    // Re-check inside the lock so two concurrent runs cannot both proceed.
    if (await collegeRepository.findBySlug(slug)) {
      return fail(`A college with the identifier "${slug}" already exists. Nothing was created.`);
    }

    const created = await collegeService.onboard({
      name: collegeNameResult.data,
      slug,
      website: null,
      contactEmail: null,
      contactPhone: null,
      adminEmail: emailResult.data,
      adminName: nameResult.data,
      adminPassword: password,
    });

    console.log('\nCollege created successfully.');
    console.log(`  College:  ${created.college.name}`);
    console.log(`  Slug:     ${created.college.slug}`);
    console.log(`  Admin:    ${created.adminEmail}`);
    console.log('\nSign in with the College Administrator tab. Students and recruiters choose this college when they register.');
    return 0;
  } finally {
    await accountRepository.releaseBootstrapLock(lockKey, token);
  }
}

main()
  .then(async (code) => {
    await closeDriver();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(`\nCollege onboarding failed: ${error instanceof Error ? error.message : String(error)}`);
    await closeDriver();
    process.exit(1);
  });
