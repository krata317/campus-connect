import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { emailSchema, nameSchema, passwordSchema } from '@campusconnect/shared';
import { accountRepository } from '../repositories/account.repository';
import { hashPassword } from '../lib/password';
import { closeDriver, verifyConnectivity } from '../db/neo4j';
import { env } from '../config/env';

const pipedLines: string[] = [];

/**
 * When stdin is not a terminal (CI, provisioning scripts, `... < answers.txt`)
 * the answers are read from the piped stream instead of an interactive prompt,
 * so the command never hangs waiting for a TTY that will not arrive.
 */
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

async function main(): Promise<number> {
  console.log('CampusConnect — initial administrator setup');
  console.log('-------------------------------------------');

  await collectPipedInput();

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error(`\nCannot reach Neo4j at ${env.NEO4J_URI}.`);
    console.error('Start the CampusConnect database in Neo4j Desktop and check the NEO4J_* values in .env.');
    console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const existing = await accountRepository.countAdmins();
  if (existing > 0) {
    console.error('\nAn administrator account already exists. This bootstrap command only creates the first one.');
    console.error('Sign in with the existing administrator account instead.');
    return 1;
  }

  const emailInput = (process.env.ADMIN_EMAIL ?? (await ask('Administrator email: '))).trim().toLowerCase();
  const emailResult = emailSchema.safeParse(emailInput);
  if (!emailResult.success) {
    console.error(`\nInvalid email: ${emailResult.error.issues[0]?.message ?? 'unknown error'}`);
    return 1;
  }

  const nameInput = (process.env.ADMIN_NAME ?? (await ask('Administrator display name: '))).trim();
  const nameResult = nameSchema.safeParse(nameInput || 'Placement Administrator');
  if (!nameResult.success) {
    console.error(`\nInvalid name: ${nameResult.error.issues[0]?.message ?? 'unknown error'}`);
    return 1;
  }

  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await askHidden('Password (minimum 8 characters): ');
    const confirmation = await askHidden('Confirm password: ');
    if (password !== confirmation) {
      console.error('\nThe passwords do not match. Nothing was created.');
      return 1;
    }
  }

  const passwordResult = passwordSchema.safeParse(password);
  if (!passwordResult.success) {
    console.error(`\nInvalid password: ${passwordResult.error.issues[0]?.message ?? 'unknown error'}`);
    return 1;
  }

  const token = randomUUID();
  const claimed = await accountRepository.claimBootstrapLock(token);
  if (!claimed) {
    console.error('\nAnother bootstrap run is in progress or already completed. Nothing was created.');
    return 1;
  }

  try {
    const recheck = await accountRepository.countAdmins();
    if (recheck > 0) {
      console.error('\nAn administrator account already exists. Nothing was created.');
      return 1;
    }

    const passwordHash = await hashPassword(password);
    const created = await accountRepository.createAdmin({
      email: emailResult.data,
      passwordHash,
      name: nameResult.data,
    });

    console.log('\nAdministrator created successfully.');
    console.log(`  Email: ${created.email}`);
    console.log('\nSign in at http://localhost:5173/login with the Admin tab.');
    return 0;
  } finally {
    await accountRepository.releaseBootstrapLock(token);
  }
}

main()
  .then(async (code) => {
    await closeDriver();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(`\nAdministrator setup failed: ${error instanceof Error ? error.message : String(error)}`);
    await closeDriver();
    process.exit(1);
  });
