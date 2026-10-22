import { initializeSchema } from '../db/schema';
import { closeDriver, getNeo4jConfig, verifyConnectivity } from '../db/neo4j';

async function main(): Promise<void> {
  const config = getNeo4jConfig();
  console.log(`Connecting to ${config.uri} (database: ${config.database}) ...`);

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error('Cannot reach Neo4j. Start the CampusConnect database in Neo4j Desktop first.');
    console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const result = await initializeSchema();
  console.log(`Created or verified ${result.constraints.length} constraints:`);
  for (const name of result.constraints) console.log(`  - ${name}`);
  console.log(`Created or verified ${result.indexes.length} indexes:`);
  for (const name of result.indexes) console.log(`  - ${name}`);
  console.log('\nSchema initialisation complete. No business data was created.');
}

main()
  .catch((error: unknown) => {
    console.error(`Schema initialisation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
  });
