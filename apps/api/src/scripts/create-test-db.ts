/**
 * Creates the isolated database used by the DB-backed integration tests.
 *
 * The integration suite deletes every node in its target database, so it must
 * never point at the database the application uses. This script reads
 * TEST_NEO4J_DATABASE, refuses to touch the application database, and creates
 * the test database when the server edition supports multiple databases.
 */
import neo4j from 'neo4j-driver';
import { env } from '../config/env';

const uri = process.env.TEST_NEO4J_URI ?? '';
const username = process.env.TEST_NEO4J_USERNAME ?? env.NEO4J_USERNAME;
const password = process.env.TEST_NEO4J_PASSWORD ?? '';
const database = process.env.TEST_NEO4J_DATABASE ?? '';

const fail = (message: string): never => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

if (!uri || !password || !database) {
  fail('Set TEST_NEO4J_URI, TEST_NEO4J_PASSWORD and TEST_NEO4J_DATABASE in .env first.');
}

if (database === env.NEO4J_DATABASE && uri === env.NEO4J_URI) {
  fail(
    `Refusing to continue: TEST_NEO4J_DATABASE is "${database}", the same database the application uses.\n` +
      'The integration tests delete all data in their target database. Use a separate name such as campusconnecttest.',
  );
}

const driver = neo4j.driver(uri, neo4j.auth.basic(username, password), { disableLosslessIntegers: true });

async function main(): Promise<void> {
  await driver.verifyConnectivity();
  console.log(`Connected to ${uri} as ${username}`);

  const system = driver.session({ database: 'system' });
  try {
    const existing = await system.run('SHOW DATABASES YIELD name RETURN collect(name) AS names');
    const names = (existing.records[0]?.get('names') as string[] | undefined) ?? [];

    if (names.includes(database)) {
      console.log(`Database "${database}" already exists - nothing to do.`);
      return;
    }

    try {
      await system.run(`CREATE DATABASE \`${database}\` IF NOT EXISTS WAIT`);
      console.log(`Created database "${database}".`);
      console.log('\nNext: npm run test:api');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\nCould not create "${database}": ${message}`);
      console.error(
        'Multi-database creation needs Neo4j Enterprise, Aura, or a dedicated second instance.\n' +
          'If you are on Community edition, point TEST_NEO4J_URI at a separate Neo4j instance (for example a Docker container),\n' +
          'or set TEST_NEO4J_ALLOW_SHARED_DB=true and accept that the test run wipes the target database.',
      );
      process.exitCode = 1;
    }
  } finally {
    await system.close();
  }
}

main()
  .catch((error: unknown) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await driver.close();
  });
