import { collegeRepository } from '../repositories/college.repository';
import { closeDriver, readQuery, verifyConnectivity, writeQuery } from '../db/neo4j';
import { env } from '../config/env';

/**
 * One-off migration for a database created before multi-college support.
 *
 * It never guesses: the operator must name the college that owns the existing
 * records, and that college must already exist. Without `--yes` the script only
 * reports what it would change.
 *
 *   npm run db:migrate-tenants -- --slug=northfield-institute
 *   npm run db:migrate-tenants -- --slug=northfield-institute --yes
 */

const TENANT_LABELS: { label: string; relationship: string }[] = [
  { label: 'Student', relationship: 'BELONGS_TO' },
  { label: 'Admin', relationship: 'ADMINISTERS' },
  { label: 'EmployerAccount', relationship: 'BELONGS_TO' },
  { label: 'Company', relationship: 'BELONGS_TO' },
  { label: 'Skill', relationship: 'BELONGS_TO' },
  { label: 'HiringRequest', relationship: 'BELONGS_TO' },
  { label: 'JobRole', relationship: 'BELONGS_TO' },
];

const argValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

async function main(): Promise<number> {
  const slug = (argValue('slug') ?? process.env.MIGRATE_COLLEGE_SLUG ?? '').trim();
  const confirmed = process.argv.includes('--yes') || process.env.MIGRATE_CONFIRM === 'yes';

  if (!slug) {
    console.error('Usage: npm run db:migrate-tenants -- --slug=<college-slug> [--yes]');
    console.error('The slug must identify an existing college. Records are never assigned to a guessed tenant.');
    return 1;
  }

  try {
    await verifyConnectivity();
  } catch (error) {
    console.error(`Cannot reach Neo4j at ${env.NEO4J_URI}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const college = await collegeRepository.findBySlug(slug);
  if (!college) {
    console.error(`No college with the slug "${slug}". Create it with npm run admin:bootstrap first.`);
    return 1;
  }

  console.log(`Target college: ${college.name} (${college.slug})`);
  console.log(confirmed ? 'Mode: APPLY\n' : 'Mode: DRY RUN (add --yes to apply)\n');

  let pendingTotal = 0;

  for (const { label, relationship } of TENANT_LABELS) {
    const rows = await readQuery<{ total: number }>(
      `MATCH (n:${label}) WHERE n.collegeId IS NULL RETURN count(n) AS total`,
    );
    const total = rows[0]?.total ?? 0;
    pendingTotal += total;
    console.log(`${label.padEnd(16)} ${total} record(s) without a college`);

    if (total === 0 || !confirmed) continue;

    await writeQuery(
      `MATCH (college:College {id: $collegeId})
       MATCH (n:${label}) WHERE n.collegeId IS NULL
       SET n.collegeId = $collegeId
       MERGE (n)-[:${relationship}]->(college)`,
      { collegeId: college.id },
    );
  }

  const notifications = await readQuery<{ total: number }>(
    'MATCH (n:Notification) WHERE n.collegeId IS NULL RETURN count(n) AS total',
  );
  const notificationTotal = notifications[0]?.total ?? 0;
  pendingTotal += notificationTotal;
  console.log(`${'Notification'.padEnd(16)} ${notificationTotal} record(s) without a college`);

  if (notificationTotal > 0 && confirmed) {
    await writeQuery(
      `MATCH (college:College {id: $collegeId})
       MATCH (n:Notification) WHERE n.collegeId IS NULL
       SET n.collegeId = $collegeId`,
      { collegeId: college.id },
    );
  }

  if (pendingTotal === 0) {
    console.log('\nNothing to migrate — every record already belongs to a college.');
    return 0;
  }

  if (!confirmed) {
    console.log(`\n${pendingTotal} record(s) would be assigned to "${college.name}". Re-run with --yes to apply.`);
    return 0;
  }

  console.log(`\nMigrated ${pendingTotal} record(s) to "${college.name}".`);
  return 0;
}

main()
  .then(async (code) => {
    await closeDriver();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    await closeDriver();
    process.exit(1);
  });
