import { closeDriver, getNeo4jConfig, openSession, verifyConnectivity } from '../db/neo4j';
import { initializeSchema } from '../db/schema';

/**
 * Destructive reset of the Campus Connect graph.
 *
 * It refuses to run unless the operator repeats the exact database name from
 * the configuration, so it can never be pointed at a database by accident:
 *
 *   npm run db:reset -- --confirm=neo4j
 *
 * The database name comes from NEO4J_DATABASE in .env, which is the only
 * database this project ever connects to.
 */
async function main(): Promise<number> {
  const config = getNeo4jConfig();
  const expected = config.database;
  const arg = process.argv.find((value) => value.startsWith('--confirm='));
  const supplied = arg ? arg.slice('--confirm='.length) : '';

  console.log(`Target URI:      ${config.uri}`);
  console.log(`Target database: ${expected}`);
  console.log('');

  if (expected === 'system') {
    console.error('Refusing to reset the Neo4j system database.');
    return 1;
  }

  if (supplied !== expected) {
    console.error('Refusing to reset without an exact confirmation.');
    console.error(`Re-run with: npm run db:reset -- --confirm=${expected}`);
    return 1;
  }

  await verifyConnectivity();

  const session = openSession();
  try {
    const before = await session.run('MATCH (n) RETURN count(n) AS total');
    const total = Number(before.records[0]?.get('total') ?? 0);
    console.log(`Deleting ${total} node(s) ...`);
    await session.run('MATCH (n) CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS');
    const after = await session.run('MATCH (n) RETURN count(n) AS total');
    console.log(`Nodes remaining: ${Number(after.records[0]?.get('total') ?? 0)}`);
  } finally {
    await session.close();
  }

  const result = await initializeSchema();
  console.log(`\nCreated or verified ${result.constraints.length} constraints and ${result.indexes.length} indexes.`);
  console.log('The database is empty and ready. Institutes can now register through the app.');
  return 0;
}

main()
  .then(async (code) => {
    await closeDriver();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(`Reset failed: ${error instanceof Error ? error.message : String(error)}`);
    await closeDriver();
    process.exit(1);
  });
