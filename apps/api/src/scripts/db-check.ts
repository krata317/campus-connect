import { closeDriver, getNeo4jConfig, readOne, readQuery, verifyConnectivity } from '../db/neo4j';
import { institutionCount } from '../data/aishe';

async function main(): Promise<void> {
  const config = getNeo4jConfig();
  console.log(`URI:      ${config.uri}`);
  console.log(`Database: ${config.database}`);
  console.log(`User:     ${config.username}`);

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error('\nConnection failed. Is the Campus Connect database running in Neo4j Desktop, or is the AuraDB instance awake?');
    console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const version = await readOne<{ version: string }>('CALL dbms.components() YIELD versions RETURN versions[0] AS version');
  console.log(`\nConnected. Neo4j ${version?.version ?? 'unknown'}`);

  const counts = await readOne<{
    institutes: number;
    admins: number;
    recruiters: number;
    students: number;
    skills: number;
    requests: number;
    roles: number;
    notifications: number;
    pending: number;
  }>(
    `RETURN
       COUNT { MATCH (n:Institute) } AS institutes,
       COUNT { MATCH (n:InstituteAdmin) } AS admins,
       COUNT { MATCH (n:Recruiter) } AS recruiters,
       COUNT { MATCH (n:Student) } AS students,
       COUNT { MATCH (n:Skill) } AS skills,
       COUNT { MATCH (n:HiringRequest) } AS requests,
       COUNT { MATCH (n:JobRole) } AS roles,
       COUNT { MATCH (n:Notification) } AS notifications,
       COUNT { MATCH (n:PendingRegistration) } AS pending`,
  );

  console.log('\nCurrent data:');
  console.log(`  Institutes:          ${counts?.institutes ?? 0}`);
  console.log(`  Institute admins:    ${counts?.admins ?? 0}`);
  console.log(`  Recruiters:          ${counts?.recruiters ?? 0}`);
  console.log(`  Students:            ${counts?.students ?? 0}`);
  console.log(`  Skills:              ${counts?.skills ?? 0}`);
  console.log(`  Hiring requests:     ${counts?.requests ?? 0}`);
  console.log(`  Job roles:           ${counts?.roles ?? 0}`);
  console.log(`  Notifications:       ${counts?.notifications ?? 0}`);
  console.log(`  Pending sign-ups:    ${counts?.pending ?? 0}`);

  const institutes = await readQuery<{
    name: string;
    aisheCode: string;
    state: string;
    active: boolean;
    students: number;
    admins: number;
    requests: number;
  }>(
    `MATCH (i:Institute)
     RETURN i.name AS name, i.aisheCode AS aisheCode, i.state AS state, i.active AS active,
            COUNT { MATCH (:Student {instituteId: i.id}) } AS students,
            COUNT { MATCH (:InstituteAdmin {instituteId: i.id}) } AS admins,
            COUNT { MATCH (:HiringRequest {instituteId: i.id}) } AS requests
     ORDER BY toLower(i.name) ASC`,
  );

  if (institutes.length > 0) {
    console.log('\nInstitutes:');
    for (const institute of institutes) {
      const state = institute.active === false ? 'inactive' : 'active';
      console.log(
        `  ${institute.name} [${institute.aisheCode}] — ${state} · ${institute.students} student(s) · ${institute.admins} admin(s) · ${institute.requests} request(s)`,
      );
    }
  } else {
    console.log('\nNo institutes yet. Register one through the UI, or run: npm run db:seed -- --confirm=' + config.database);
  }

  console.log(`\nAISHE directory loaded: ${institutionCount()} institutions available for lookup.`);
}

main()
  .catch((error: unknown) => {
    console.error(`Check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
  });
