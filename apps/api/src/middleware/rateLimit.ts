import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const rateLimitResponse = (message: string) => ({
  error: { code: 'RATE_LIMITED', message },
});

export interface LimiterOptions {
  /** Maximum number of requests allowed inside the window. */
  limit?: number;
  /** Skip the limiter entirely (used so the automated suite does not trip real counters). */
  skip?: boolean;
}

const windowMs = 15 * 60 * 1000;
const registerWindowMs = 60 * 60 * 1000;

/**
 * Factory so the limiter behaviour can be exercised by tests without weakening
 * the defaults used by the running application.
 */
export const createLoginLimiter = (options: LimiterOptions = {}) =>
  rateLimit({
    windowMs,
    limit: options.limit ?? 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => options.skip ?? false,
    handler: (_req, res) => {
      res.status(429).json(rateLimitResponse('Too many sign-in attempts. Wait a few minutes and try again.'));
    },
  });

export const createRegisterLimiter = (options: LimiterOptions = {}) =>
  rateLimit({
    windowMs: registerWindowMs,
    limit: options.limit ?? 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => options.skip ?? false,
    handler: (_req, res) => {
      res.status(429).json(rateLimitResponse('Too many accounts created from this address. Try again later.'));
    },
  });

// The automated suite performs many sign-ins from a single address, so the
// counters are skipped under NODE_ENV=test. The limiter itself is still covered
// by a dedicated test that builds its own instance through the factory above.
export const loginLimiter = createLoginLimiter({ skip: env.isTest });
export const registerLimiter = createRegisterLimiter({ skip: env.isTest });
