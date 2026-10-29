import { closeDriver, getNeo4jConfig, verifyConnectivity } from '../db/neo4j';
import { instituteRepository } from '../repositories/institute.repository';
import { findInstitution } from '../data/aishe';
import { generateStudentCode, hashStudentCode } from '../lib/tokens';
import { hashPassword } from '../lib/password';
import { initializeSchema } from '../db/schema';

/**
 * Development / recovery seeding.
 *
 * This is NOT the normal way to register an institute — the public flow
 * (AISHE code → email OTP → single-use link) is. This command exists so a
 * developer can create a known account on a fresh local database, and so an
 * operator can recover access if an administrator is locked out.
 *
 *   SEED_AISHE_CODE=C-6560 SEED_ADMIN_EMAIL=you@example.com \
 *   SEED_ADMIN_PASSWORD='...' npm run db:seed -- --confirm=neo4j
 */
async function main(): Promise<number> {
  const config = getNeo4jConfig();
  const arg = process.argv.find((value) => value.startsWith('--confirm='));
  const supplied = arg ? arg.slice('--confirm='.length) : '';

  if (supplied !== config.database) {
    console.error('Refusing to seed without an exact database confirmation.');
    console.error(`Re-run with: npm run db:seed -- --confirm=${config.database}`);
    return 1;
  }

  const aisheCode = process.env.SEED_AISHE_CODE?.trim();
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const username = (process.env.SEED_ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  const fullName = (process.env.SEED_ADMIN_NAME ?? 'Placement Administrator').trim();

  if (!aisheCode || !email || !password) {
    console.error('SEED_AISHE_CODE, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.');
    return 1;
  }
  if (password.length < 8) {
    console.error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
    return 1;
  }

  await verifyConnectivity();
  await initializeSchema();

  const institution = findInstitution(aisheCode);
  if (!institution) {
    console.error(`AISHE code ${aisheCode} is not in the dataset.`);
    return 1;
  }

  const existing = await instituteRepository.findByAisheCode(institution.aisheCode);
  if (existing) {
    console.error(`${institution.name} is already seeded (${existing.id}). Nothing changed.`);
    return 1;
  }

  const studentCode = generateStudentCode();
  const created = await instituteRepository.createWithAdmin(
    {
      aisheCode: institution.aisheCode,
      name: institution.name,
      state: institution.state,
      district: institution.district,
      website: null,
      contactEmail: email,
      contactPhone: null,
      studentCode,
    },
    { email, username, passwordHash: await hashPassword(password), fullName },
  );

  if (!created) {
    console.error('Could not create the institute (AISHE code, email or username already used).');
    return 1;
  }

  // Re-key the code hash now that the institute id exists.
  await instituteRepository.setStudentCode(created.instituteId, hashStudentCode(created.instituteId, studentCode));

  console.log('\nSeeded institute:');
  console.log(`  ${institution.name}`);
  console.log(`  AISHE:    ${institution.aisheCode} (${institution.district}, ${institution.state})`);
  console.log(`  Admin:    ${username} / ${email}`);
  console.log(`  Student code: ${studentCode}`);
  console.log('\nThis is a development shortcut. Real institutes register through the public flow.');
  return 0;
}

main()
  .then(async (code) => {
    await closeDriver();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
    await closeDriver();
    process.exit(1);
  });
