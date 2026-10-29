import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase, hasTestDb, resetDatabase, testDbSkipReason } from '../helpers/db';
import { createTestClient, uniqueEmail } from '../helpers/client';
import { getOutbox, clearOutbox } from '../../src/email/mailer';
import { instituteRepository } from '../../src/repositories/institute.repository';
import { hashPassword } from '../../src/lib/password';
import { generateStudentCode } from '../../src/lib/tokens';

const describeDb = hasTestDb ? describe : describe.skip;

if (!hasTestDb) {
  console.warn(`[registration.test] ${testDbSkipReason}`);
}

// Real codes from the bundled AISHE snapshot.
const AISHE_A = 'C-6560';
const AISHE_B = 'C-6547';
const AISHE_A_NAME = 'Zoological Survey of India';

const otpFromOutbox = (email: string): string => {
  const message = [...getOutbox()].reverse().find((entry) => entry.to === email && /verification code/i.test(entry.text));
  const otp = /(\d{6})/.exec(message?.text ?? '')?.[1];
  if (!otp) throw new Error(`No OTP email found for ${email}`);
  return otp;
};

const linkFromOutbox = (email: string): string => {
  const message = [...getOutbox()].reverse().find((entry) => entry.to === email && /token=/.test(entry.text));
  const token = /token=([A-Za-z0-9_-]+)/.exec(message?.text ?? '')?.[1];
  if (!token) throw new Error(`No registration link found for ${email}`);
  return token;
};

describeDb('institute and recruiter registration', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    clearOutbox();
  });

  it('looks up the official institute record from the AISHE dataset', async () => {
    const response = await createTestClient().get(`/api/registrations/institutions/lookup?code=${AISHE_A}`);
    expect(response.status).toBe(200);
    expect(response.body.institution.aisheCode).toBe(AISHE_A);
    expect(response.body.institution.name).toBe(AISHE_A_NAME);
    expect(response.body.institution.state).toBeTruthy();
  });

  it('normalises a loosely typed AISHE code', async () => {
    const response = await createTestClient().get('/api/registrations/institutions/lookup?code=c6560');
    expect(response.status).toBe(200);
    expect(response.body.institution.aisheCode).toBe(AISHE_A);
  });

  it('rejects an AISHE code that is not in the dataset', async () => {
    const client = createTestClient();
    const response = await client.post('/api/registrations/institute/start', {
      aisheCode: 'Z-999999',
      email: uniqueEmail('institute'),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/AISHE code/i);
  });

  it('starts an institute registration and emails a six-digit code', async () => {
    const email = uniqueEmail('institute');
    const response = await createTestClient().post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });

    expect(response.status).toBe(201);
    expect(response.body.institution.name).toBe(AISHE_A_NAME);
    expect(response.body.pendingId).toBeTruthy();

    const message = getOutbox().find((entry) => entry.to === email);
    expect(message).toBeTruthy();
    expect(message?.subject).toMatch(/verification/i);
    expect(otpFromOutbox(email)).toMatch(/^\d{6}$/);
  });

  it('refuses to register an institute whose AISHE code is already taken', async () => {
    await instituteRepository.createWithAdmin(
      {
        aisheCode: AISHE_A,
        name: AISHE_A_NAME,
        state: 'Andaman and Nicobar Islands',
        district: 'Nicobars',
        website: null,
        contactEmail: null,
        contactPhone: null,
        studentCode: generateStudentCode(),
      },
      { email: uniqueEmail('existing'), username: `existing${Date.now().toString(36)}`, passwordHash: await hashPassword('ExistingPass2026'), fullName: 'Existing Admin' },
    );

    const response = await createTestClient().post('/api/registrations/institute/start', {
      aisheCode: AISHE_A,
      email: uniqueEmail('institute'),
    });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/already registered/i);
  });

  it('rejects an incorrect code and counts the attempt', async () => {
    const email = uniqueEmail('institute');
    const start = await createTestClient().post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });

    const wrong = await createTestClient().post('/api/registrations/institute/verify', {
      pendingId: start.body.pendingId,
      code: '000000',
    });

    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/not correct/i);
  });

  it('verifies the code and emails a single-use registration link', async () => {
    const email = uniqueEmail('institute');
    const client = createTestClient();
    const start = await client.post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });

    const verify = await client.post('/api/registrations/institute/verify', {
      pendingId: start.body.pendingId,
      code: otpFromOutbox(email),
    });

    expect(verify.status).toBe(200);

    const token = linkFromOutbox(email);
    const info = await client.get(`/api/registrations/link?token=${token}`);
    expect(info.status).toBe(200);
    expect(info.body.instituteName).toBe(AISHE_A_NAME);
    expect(info.body.email).toBe(email);
  });

  it('creates the institute and administrator on completion', async () => {
    const email = uniqueEmail('institute');
    const client = createTestClient();
    const start = await client.post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });
    await client.post('/api/registrations/institute/verify', { pendingId: start.body.pendingId, code: otpFromOutbox(email) });
    const token = linkFromOutbox(email);

    const complete = await client.post('/api/registrations/institute/complete', {
      token,
      fullName: 'Placement Administrator',
      username: `placement${Date.now().toString(36)}`,
      password: 'InstitutePass2026',
    });

    expect(complete.status).toBe(201);
    expect(complete.body.instituteName).toBe(AISHE_A_NAME);
    expect(complete.body.studentCode).toMatch(/^[A-Z0-9]{32}$/);

    const institute = await instituteRepository.findByAisheCode(AISHE_A);
    expect(institute).toBeTruthy();
    expect(institute?.studentCodeHash).toBeTruthy();
    expect(institute?.studentCodeHash).not.toBe(complete.body.studentCode);

    // The link is single use.
    const replay = await createTestClient().post('/api/registrations/institute/complete', {
      token,
      fullName: 'Someone Else',
      username: `other${Date.now().toString(36)}`,
      password: 'InstitutePass2026',
    });
    expect(replay.status).toBe(410);
  });

  it('keeps the link usable when the chosen username is taken', async () => {
    const first = uniqueEmail('institute');
    const client = createTestClient();
    const startA = await client.post('/api/registrations/institute/start', { aisheCode: AISHE_A, email: first });
    await client.post('/api/registrations/institute/verify', { pendingId: startA.body.pendingId, code: otpFromOutbox(first) });
    const tokenA = linkFromOutbox(first);
    const username = `taken${Date.now().toString(36)}`;

    await client.post('/api/registrations/institute/complete', {
      token: tokenA,
      fullName: 'First Admin',
      username,
      password: 'InstitutePass2026',
    });

    const second = uniqueEmail('institute');
    const startB = await client.post('/api/registrations/institute/start', { aisheCode: AISHE_B, email: second });
    await client.post('/api/registrations/institute/verify', { pendingId: startB.body.pendingId, code: otpFromOutbox(second) });
    const tokenB = linkFromOutbox(second);

    const clash = await client.post('/api/registrations/institute/complete', {
      token: tokenB,
      fullName: 'Second Admin',
      username,
      password: 'InstitutePass2026',
    });
    expect(clash.status).toBe(409);

    // The same link still works with a different username.
    const retry = await client.post('/api/registrations/institute/complete', {
      token: tokenB,
      fullName: 'Second Admin',
      username: `${username}x`,
      password: 'InstitutePass2026',
    });
    expect(retry.status).toBe(201);
  });

  it('runs the recruiter registration flow end to end', async () => {
    const email = uniqueEmail('recruiter');
    const client = createTestClient();
    const companyName = `Northwind Systems ${Date.now().toString(36)}`;

    const start = await client.post('/api/registrations/recruiter/start', { companyName, email });
    expect(start.status).toBe(201);
    expect(start.body.pendingId).toBeTruthy();

    const verify = await client.post('/api/registrations/recruiter/verify', {
      pendingId: start.body.pendingId,
      code: otpFromOutbox(email),
    });
    expect(verify.status).toBe(200);

    const token = linkFromOutbox(email);
    const complete = await client.post('/api/registrations/recruiter/complete', {
      token,
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      username: `recruiter${Date.now().toString(36)}`,
      password: 'RecruiterPass2026',
    });

    expect(complete.status).toBe(201);
    expect(complete.body.companyName).toBe(companyName);
  });

  it('treats company names as duplicates regardless of case and spacing', async () => {
    const email = uniqueEmail('recruiter');
    const client = createTestClient();
    const companyName = `Acme Labs ${Date.now().toString(36)}`;

    const start = await client.post('/api/registrations/recruiter/start', { companyName, email });
    await client.post('/api/registrations/recruiter/verify', { pendingId: start.body.pendingId, code: otpFromOutbox(email) });
    const token = linkFromOutbox(email);
    await client.post('/api/registrations/recruiter/complete', {
      token,
      contactPersonName: 'Ravi Menon',
      contactPhone: '9876543210',
      username: `acme${Date.now().toString(36)}`,
      password: 'RecruiterPass2026',
    });

    const duplicate = await createTestClient().post('/api/registrations/recruiter/start', {
      companyName: `  ${companyName.toUpperCase()}  `,
      email: uniqueEmail('recruiter'),
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toMatch(/already registered/i);
  });

  it('throttles repeated codes for the same pending registration', async () => {
    const email = uniqueEmail('institute');
    const client = createTestClient();
    const start = await client.post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });

    const resend = await client.post('/api/registrations/institute/resend', { pendingId: start.body.pendingId });
    expect(resend.status).toBe(429);
    expect(resend.body.error.message).toMatch(/wait/i);
  });

  it('refuses a second in-progress registration for the same institute', async () => {
    const email = uniqueEmail('institute');
    const first = await createTestClient().post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });
    expect(first.status).toBe(201);

    // A different person cannot silently take over the pending registration.
    const second = await createTestClient().post('/api/registrations/institute/start', {
      aisheCode: AISHE_A,
      email: uniqueEmail('someone-else'),
    });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/in progress/i);

    // The original requester can restart their own attempt.
    const retry = await createTestClient().post('/api/registrations/institute/start', { aisheCode: AISHE_A, email });
    expect(retry.status).toBe(201);
  });
});
