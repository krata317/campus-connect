import session from 'express-session';
import type { SessionData } from 'express-session';
import { sessionRepository } from '../repositories/session.repository';

type Callback = (error: Error | null, session?: SessionData | null) => void;
type SimpleCallback = (error?: Error | null) => void;

export class Neo4jSessionStore extends session.Store {
  /**
   * @param ttlMs Fallback lifetime for a session saved without an explicit
   * `expiresAt` — for example the anonymous session that only carries a CSRF
   * token before the visitor signs in.
   */
  constructor(private readonly ttlMs: number) {
    super();
  }

  /**
   * The expiry written at sign-in always wins. express-session touches the
   * session on ordinary requests, so without this a session would never end
   * while the browser kept talking to the API.
   */
  private resolveExpiry(data: SessionData): string {
    if (data.expiresAt) return data.expiresAt;
    return new Date(Date.now() + this.ttlMs).toISOString();
  }

  override get(sid: string, callback: Callback): void {
    sessionRepository
      .get(sid)
      .then((row) => {
        if (!row) {
          callback(null, null);
          return;
        }
        if (new Date(row.expiresAt).getTime() <= Date.now()) {
          sessionRepository.destroy(sid).catch(() => undefined);
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(row.data) as SessionData);
      })
      .catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
  }

  override set(sid: string, data: SessionData, callback?: SimpleCallback): void {
    sessionRepository
      .set(sid, JSON.stringify(data), this.resolveExpiry(data), data.userId ?? null)
      .then(() => callback?.(null))
      .catch((error: unknown) => callback?.(error instanceof Error ? error : new Error(String(error))));
  }

  override destroy(sid: string, callback?: SimpleCallback): void {
    sessionRepository
      .destroy(sid)
      .then(() => callback?.(null))
      .catch((error: unknown) => callback?.(error instanceof Error ? error : new Error(String(error))));
  }

  override touch(sid: string, data: SessionData, callback?: SimpleCallback): void {
    this.set(sid, data, callback);
  }
}
