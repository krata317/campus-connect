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
  }
}

export {};
