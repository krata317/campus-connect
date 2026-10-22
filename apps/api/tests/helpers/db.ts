import { env } from '../../src/config/env';
import { closeDriver, openSession, readQuery, setNeo4jConfig, verifyConnectivity } from '../../src/db/neo4j';
import { initializeSchema } from '../../src/db/schema';

/**
 * Integration tests need a real Neo4j instance. They are opt-in: set the
 * TEST_NEO4J_* variables to run them, otherwise the suites skip themselves and
 * `npm test` stays green on a machine without a database.
 *
 * The suite wipes the target database between runs, so pointing it at a
 * database that holds real data is refused unless
 * TEST_NEO4J_ALLOW_SHARED_DB=true is set explicitly.
 */
const config = {
  uri: process.env.TEST_NEO4J_URI ?? '',
  username: process.env.TEST_NEO4J_USERNAME ?? 'neo4j',
  password: process.env.TEST_NEO4J_PASSWORD ?? '',
  database: process.env.TEST_NEO4J_DATABASE ?? '',
};

const allowShared = process.env.TEST_NEO4J_ALLOW_SHARED_DB === 'true';

const missingPieces: string[] = [];
if (!config.uri) missingPieces.push('TEST_NEO4J_URI');
if (!config.password) missingPieces.push('TEST_NEO4J_PASSWORD');
if (!config.database) missingPieces.push('TEST_NEO4J_DATABASE');

const targetsDevDatabase = config.database === env.NEO4J_DATABASE && config.uri === env.NEO4J_URI;

export const testDbSkipReason: string | null = (() => {
  if (missingPieces.length > 0) {
    return `integration tests skipped: set ${missingPieces.join(', ')} to run them`;
  }
  if (targetsDevDatabase && !allowShared) {
    return 'integration tests skipped: TEST_NEO4J_DATABASE points at the development database. Use a dedicated database, or set TEST_NEO4J_ALLOW_SHARED_DB=true to accept that the database is wiped.';
  }
  return null;
})();

export const hasTestDb = testDbSkipReason === null;

/** Points the shared driver singleton at the test database. */
export function useTestDatabase(): void {
  if (!hasTestDb) throw new Error(String(testDbSkipReason));
  setNeo4jConfig(config);
}

export async function connectTestDatabase(): Promise<void> {
  useTestDatabase();
  await verifyConnectivity();
  await initializeSchema();
}

export async function resetDatabase(): Promise<void> {
  if (!hasTestDb) throw new Error(String(testDbSkipReason));
  // `CALL { ... } IN TRANSACTIONS` is only allowed in an auto-commit query, so
  // this bypasses the managed-transaction helper on purpose.
  const session = openSession();
  try {
    await session.run('MATCH (n) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS');
  } finally {
    await session.close();
  }
}

export async function disconnectTestDatabase(): Promise<void> {
  await closeDriver();
}

export async function countNodes(): Promise<number> {
  const rows = await readQuery<{ total: number }>('MATCH (n) RETURN count(n) AS total');
  return rows[0]?.total ?? 0;
}
