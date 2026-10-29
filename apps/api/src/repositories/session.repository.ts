import { readOne, writeQuery } from '../db/neo4j';

interface SessionRow {
  data: string;
  expiresAt: string;
}

export const sessionRepository = {
  async get(sid: string): Promise<SessionRow | null> {
    return readOne<SessionRow>('MATCH (s:Session {sid: $sid}) RETURN s.data AS data, s.expiresAt AS expiresAt', { sid });
  },

  async set(sid: string, data: string, expiresAt: string, userId: string | null): Promise<void> {
    await writeQuery(
      'MERGE (s:Session {sid: $sid}) SET s.data = $data, s.expiresAt = $expiresAt, s.userId = $userId',
      { sid, data, expiresAt, userId },
    );
  },

  /** Ends every session belonging to one account (used after a password reset). */
  async destroyForUser(userId: string): Promise<number> {
    const rows = await writeQuery<{ removed: number }>(
      'MATCH (s:Session {userId: $userId}) WITH s, count(s) AS removed DELETE s RETURN removed',
      { userId },
    );
    return rows[0]?.removed ?? 0;
  },

  async destroy(sid: string): Promise<void> {
    await writeQuery('MATCH (s:Session {sid: $sid}) DELETE s', { sid });
  },

  async pruneExpired(now: string): Promise<number> {
    const rows = await writeQuery<{ removed: number }>(
      'MATCH (s:Session) WHERE s.expiresAt < $now WITH s, count(s) AS removed DELETE s RETURN removed',
      { now },
    );
    return rows[0]?.removed ?? 0;
  },
};
