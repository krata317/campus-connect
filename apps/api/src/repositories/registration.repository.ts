import { readOne, readQuery, writeQuery } from '../db/neo4j';
import { newId, nowIso } from '../lib/ids';
import type { RegistrationType } from '@campusconnect/shared';

export type PendingStatus = 'AWAITING_OTP' | 'LINK_SENT' | 'COMPLETED';

export interface PendingRegistration {
  id: string;
  pendingKey: string;
  type: RegistrationType;
  email: string;
  status: PendingStatus;
  aisheCode: string | null;
  instituteName: string | null;
  state: string | null;
  district: string | null;
  companyName: string | null;
  companyNameKey: string | null;
  otpHash: string | null;
  otpExpiresAt: string | null;
  otpAttempts: number;
  otpResends: number;
  otpLastSentAt: string | null;
  tokenHash: string | null;
  tokenExpiresAt: string | null;
  tokenUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROJECTION = `p { .id, .pendingKey, .type, .email, .status, .aisheCode, .instituteName, .state, .district,
  .companyName, .companyNameKey, .otpHash, .otpExpiresAt, .otpAttempts, .otpResends, .otpLastSentAt,
  .tokenHash, .tokenExpiresAt, .tokenUsedAt, .createdAt, .updatedAt } AS pending`;

const toPending = (row: { pending: PendingRegistration }): PendingRegistration => ({
  ...row.pending,
  otpAttempts: Number(row.pending.otpAttempts ?? 0),
  otpResends: Number(row.pending.otpResends ?? 0),
});

export const registrationRepository = {
  /**
   * Starts (or restarts) a pending registration for one institute code or one
   * company name. A previous attempt that never completed is replaced in place,
   * which keeps `pendingKey` unique and stops parallel attempts from piling up.
   */
  async startPending(input: {
    type: RegistrationType;
    pendingKey: string;
    email: string;
    aisheCode?: string | null;
    instituteName?: string | null;
    state?: string | null;
    district?: string | null;
    companyName?: string | null;
    companyNameKey?: string | null;
    otpHash: string;
    otpExpiresAt: string;
  }): Promise<PendingRegistration> {
    const id = newId('reg');
    const now = nowIso();
    const rows = await writeQuery<{ pending: PendingRegistration }>(
      `MERGE (p:PendingRegistration {pendingKey: $pendingKey})
       ON CREATE SET p.id = $id, p.createdAt = $now, p.otpAttempts = 0, p.otpResends = 0,
                     p.tokenHash = null, p.tokenUsedAt = null, p.tokenExpiresAt = null
       SET p.type = $type, p.email = $email, p.status = 'AWAITING_OTP',
           p.aisheCode = $aisheCode, p.instituteName = $instituteName, p.state = $state, p.district = $district,
           p.companyName = $companyName, p.companyNameKey = $companyNameKey,
           p.otpHash = $otpHash, p.otpExpiresAt = $otpExpiresAt, p.otpLastSentAt = $now, p.updatedAt = $now
       RETURN ${PROJECTION}`,
      {
        pendingKey: input.pendingKey,
        id,
        type: input.type,
        email: input.email,
        aisheCode: input.aisheCode ?? null,
        instituteName: input.instituteName ?? null,
        state: input.state ?? null,
        district: input.district ?? null,
        companyName: input.companyName ?? null,
        companyNameKey: input.companyNameKey ?? null,
        otpHash: input.otpHash,
        otpExpiresAt: input.otpExpiresAt,
        now,
      },
    );
    return toPending(rows[0]!);
  },

  async findById(id: string): Promise<PendingRegistration | null> {
    const row = await readOne<{ pending: PendingRegistration }>(`MATCH (p:PendingRegistration {id: $id}) RETURN ${PROJECTION}`, { id });
    return row ? toPending(row) : null;
  },

  async findActiveByKey(pendingKey: string): Promise<PendingRegistration | null> {
    const row = await readOne<{ pending: PendingRegistration }>(
      `MATCH (p:PendingRegistration {pendingKey: $pendingKey}) RETURN ${PROJECTION}`,
      { pendingKey },
    );
    return row ? toPending(row) : null;
  },

  /** Stores a fresh OTP and resets the attempt counter. */
  async refreshOtp(pendingId: string, otpHash: string, otpExpiresAt: string): Promise<PendingRegistration | null> {
    const rows = await writeQuery<{ pending: PendingRegistration }>(
      `MATCH (p:PendingRegistration {id: $id})
       SET p.otpHash = $otpHash, p.otpExpiresAt = $otpExpiresAt, p.otpAttempts = 0,
           p.otpResends = p.otpResends + 1, p.otpLastSentAt = $now, p.updatedAt = $now, p.status = 'AWAITING_OTP'
       RETURN ${PROJECTION}`,
      { id: pendingId, otpHash, otpExpiresAt, now: nowIso() },
    );
    return rows[0] ? toPending(rows[0]) : null;
  },

  async recordFailedAttempt(pendingId: string): Promise<number> {
    const rows = await writeQuery<{ attempts: number }>(
      `MATCH (p:PendingRegistration {id: $id})
       SET p.otpAttempts = coalesce(p.otpAttempts, 0) + 1, p.updatedAt = $now
       RETURN p.otpAttempts AS attempts`,
      { id: pendingId, now: nowIso() },
    );
    return Number(rows[0]?.attempts ?? 0);
  },

  /** Marks the email as verified and attaches the single-use link token. */
  async markLinkIssued(pendingId: string, tokenHash: string, tokenExpiresAt: string): Promise<boolean> {
    const rows = await writeQuery<{ id: string }>(
      `MATCH (p:PendingRegistration {id: $id})
       SET p.status = 'LINK_SENT', p.tokenHash = $tokenHash, p.tokenExpiresAt = $tokenExpiresAt,
           p.tokenUsedAt = null, p.otpHash = null, p.updatedAt = $now
       RETURN p.id AS id`,
      { id: pendingId, tokenHash, tokenExpiresAt, now: nowIso() },
    );
    return rows.length > 0;
  },

  async findByTokenHash(tokenHash: string): Promise<PendingRegistration | null> {
    const row = await readOne<{ pending: PendingRegistration }>(
      `MATCH (p:PendingRegistration {tokenHash: $tokenHash}) RETURN ${PROJECTION}`,
      { tokenHash },
    );
    return row ? toPending(row) : null;
  },

  /**
   * Atomically consumes the link. Two concurrent redemptions cannot both win:
   * the second one re-evaluates the guard after the first commits.
   */
  async consumeToken(tokenHash: string, now: string): Promise<PendingRegistration | null> {
    const rows = await writeQuery<{ pending: PendingRegistration }>(
      `MATCH (p:PendingRegistration {tokenHash: $tokenHash})
       WHERE p.tokenUsedAt IS NULL AND p.status = 'LINK_SENT' AND p.tokenExpiresAt > $now
       SET p.tokenUsedAt = $now, p.status = 'COMPLETED', p.updatedAt = $now
       RETURN ${PROJECTION}`,
      { tokenHash, now },
    );
    return rows[0] ? toPending(rows[0]) : null;
  },

  /** Releases a consumed token if account creation failed, so the user can retry. */
  async releaseToken(pendingId: string): Promise<void> {
    await writeQuery(
      `MATCH (p:PendingRegistration {id: $id}) WHERE p.status = 'COMPLETED'
       SET p.tokenUsedAt = null, p.status = 'LINK_SENT', p.updatedAt = $now`,
      { id: pendingId, now: nowIso() },
    );
  },

  async deleteById(id: string): Promise<void> {
    await writeQuery('MATCH (p:PendingRegistration {id: $id}) DELETE p', { id });
  },

  /** Housekeeping: drop records that can no longer be used. */
  async deleteStale(before: string): Promise<number> {
    const rows = await readQuery<{ total: number }>(
      'MATCH (p:PendingRegistration) WHERE p.updatedAt < $before RETURN count(p) AS total',
      { before },
    );
    const total = rows[0]?.total ?? 0;
    if (total > 0) {
      await writeQuery('MATCH (p:PendingRegistration) WHERE p.updatedAt < $before DELETE p', { before });
    }
    return total;
  },
};

export interface PasswordResetRecord {
  id: string;
  tokenHash: string;
  accountKind: string;
  accountId: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export const passwordResetRepository = {
  async create(input: {
    tokenHash: string;
    accountKind: string;
    accountId: string;
    email: string;
    expiresAt: string;
  }): Promise<void> {
    const now = nowIso();
    // One live reset token per account: any previous one is invalidated.
    await writeQuery('MATCH (r:PasswordReset {accountId: $accountId}) WHERE r.usedAt IS NULL DELETE r', {
      accountId: input.accountId,
    });
    await writeQuery(
      `CREATE (r:PasswordReset {
         id: $id, tokenHash: $tokenHash, accountKind: $accountKind, accountId: $accountId,
         email: $email, expiresAt: $expiresAt, usedAt: null, createdAt: $now
       })`,
      { id: newId('prs'), now, ...input },
    );
  },

  async findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const row = await readOne<{ reset: PasswordResetRecord }>(
      `MATCH (r:PasswordReset {tokenHash: $tokenHash})
       RETURN r { .id, .tokenHash, .accountKind, .accountId, .email, .expiresAt, .usedAt, .createdAt } AS reset`,
      { tokenHash },
    );
    return row?.reset ?? null;
  },

  /** Atomically consumes the reset token. */
  async consume(tokenHash: string, now: string): Promise<PasswordResetRecord | null> {
    const rows = await writeQuery<{ reset: PasswordResetRecord }>(
      `MATCH (r:PasswordReset {tokenHash: $tokenHash})
       WHERE r.usedAt IS NULL AND r.expiresAt > $now
       SET r.usedAt = $now
       RETURN r { .id, .tokenHash, .accountKind, .accountId, .email, .expiresAt, .usedAt, .createdAt } AS reset`,
      { tokenHash, now },
    );
    return rows[0]?.reset ?? null;
  },
};
