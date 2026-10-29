import type { AuthUser, Role } from '@campusconnect/shared';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    role?: Role;
    /**
     * Absolute expiry, written once at sign-in. Later requests never push it
     * forward, so a session lasts exactly as long as the sign-in choice said
     * it would: 10 minutes by default, or 7 days with "Remember me".
     */
    expiresAt?: string;
  }
}

export {};
