import { closeDriver, getNeo4jConfig, readOne, verifyConnectivity } from '../db/neo4j';

async function main(): Promise<void> {
  const config = getNeo4jConfig();
  console.log(`URI:      ${config.uri}`);
  console.log(`Database: ${config.database}`);
  console.log(`User:     ${config.username}`);

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error('\nConnection failed. Is the CampusConnect database running in Neo4j Desktop?');
    console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const version = await readOne<{ version: string }>('CALL dbms.components() YIELD versions RETURN versions[0] AS version');
  console.log(`\nConnected. Neo4j ${version?.version ?? 'unknown'}`);

  const counts = await readOne<{
    students: number;
    admins: number;
    employers: number;
    skills: number;
    requests: number;
    roles: number;
    notifications: number;
  }>(
    `RETURN
       COUNT { MATCH (s:Student) } AS students,
       COUNT { MATCH (a:Admin) } AS admins,
       COUNT { MATCH (e:EmployerAccount) } AS employers,
       COUNT { MATCH (k:Skill) } AS skills,
       COUNT { MATCH (h:HiringRequest) } AS requests,
       COUNT { MATCH (j:JobRole) } AS roles,
       COUNT { MATCH (n:Notification) } AS notifications`,
  );

  console.log('\nCurrent data:');
  console.log(`  Students:            ${counts?.students ?? 0}`);
  console.log(`  Administrators:      ${counts?.admins ?? 0}`);
  console.log(`  Employer accounts:   ${counts?.employers ?? 0}`);
  console.log(`  Skills:              ${counts?.skills ?? 0}`);
  console.log(`  Hiring requests:     ${counts?.requests ?? 0}`);
  console.log(`  Job roles:           ${counts?.roles ?? 0}`);
  console.log(`  Notifications:       ${counts?.notifications ?? 0}`);
}

main()
  .catch((error: unknown) => {
    console.error(`Check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
  });
