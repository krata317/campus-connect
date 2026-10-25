import { closeDriver, getNeo4jConfig, readOne, readQuery, verifyConnectivity } from '../db/neo4j';

async function main(): Promise<void> {
  const config = getNeo4jConfig();
  console.log(`URI:      ${config.uri}`);
  console.log(`Database: ${config.database}`);
  console.log(`User:     ${config.username}`);

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error('\nConnection failed. Is the CampusConnect database running in Neo4j Desktop, or is the AuraDB instance awake?');
    console.error(`Details: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const version = await readOne<{ version: string }>('CALL dbms.components() YIELD versions RETURN versions[0] AS version');
  console.log(`\nConnected. Neo4j ${version?.version ?? 'unknown'}`);

  const counts = await readOne<{
    colleges: number;
    students: number;
    admins: number;
    employers: number;
    skills: number;
    requests: number;
    roles: number;
    notifications: number;
    orphaned: number;
  }>(
    `RETURN
       COUNT { MATCH (c:College) } AS colleges,
       COUNT { MATCH (s:Student) } AS students,
       COUNT { MATCH (a:Admin) } AS admins,
       COUNT { MATCH (e:EmployerAccount) } AS employers,
       COUNT { MATCH (k:Skill) } AS skills,
       COUNT { MATCH (h:HiringRequest) } AS requests,
       COUNT { MATCH (j:JobRole) } AS roles,
       COUNT { MATCH (n:Notification) } AS notifications,
       COUNT { MATCH (x) WHERE (x:Student OR x:Admin OR x:EmployerAccount OR x:Company OR x:Skill OR x:HiringRequest OR x:JobRole OR x:Notification) AND x.collegeId IS NULL } AS orphaned`,
  );

  console.log('\nCurrent data:');
  console.log(`  Colleges:            ${counts?.colleges ?? 0}`);
  console.log(`  Students:            ${counts?.students ?? 0}`);
  console.log(`  Administrators:      ${counts?.admins ?? 0}`);
  console.log(`  Recruiter accounts:  ${counts?.employers ?? 0}`);
  console.log(`  Skills:              ${counts?.skills ?? 0}`);
  console.log(`  Hiring requests:     ${counts?.requests ?? 0}`);
  console.log(`  Job roles:           ${counts?.roles ?? 0}`);
  console.log(`  Notifications:       ${counts?.notifications ?? 0}`);

  if ((counts?.orphaned ?? 0) > 0) {
    console.log(`\n  WARNING: ${counts?.orphaned} record(s) have no college. Run "npm run db:migrate-tenants" to attach them.`);
  }

  const colleges = await readQuery<{
    name: string;
    slug: string;
    active: boolean;
    students: number;
    admins: number;
    requests: number;
  }>(
    `MATCH (c:College)
     RETURN c.name AS name, c.slug AS slug, c.active AS active,
            COUNT { MATCH (:Student {collegeId: c.id}) } AS students,
            COUNT { MATCH (:Admin {collegeId: c.id}) } AS admins,
            COUNT { MATCH (:HiringRequest {collegeId: c.id}) } AS requests
     ORDER BY toLower(c.name) ASC`,
  );

  if (colleges.length > 0) {
    console.log('\nColleges:');
    for (const college of colleges) {
      const state = college.active === false ? 'inactive' : 'active';
      console.log(
        `  ${college.name} [${college.slug}] — ${state} · ${college.students} student(s) · ${college.admins} admin(s) · ${college.requests} request(s)`,
      );
    }
  } else {
    console.log('\nNo colleges yet. Create the first one with: npm run admin:bootstrap');
  }
}

main()
  .catch((error: unknown) => {
    console.error(`Check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
  });
