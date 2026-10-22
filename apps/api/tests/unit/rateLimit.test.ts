import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLoginLimiter, createRegisterLimiter } from '../../src/middleware/rateLimit';

const buildApp = (middleware: express.RequestHandler) => {
  const app = express();
  app.post('/login', middleware, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe('login rate limiting', () => {
  it('allows requests up to the limit and then answers 429', async () => {
    const app = buildApp(createLoginLimiter({ limit: 2 }));

    expect((await request(app).post('/login')).status).toBe(200);
    expect((await request(app).post('/login')).status).toBe(200);

    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(/too many sign-in attempts/i);
  });

  it('starts a fresh counter for each limiter instance', async () => {
    const first = buildApp(createLoginLimiter({ limit: 1 }));
    expect((await request(first).post('/login')).status).toBe(200);
    expect((await request(first).post('/login')).status).toBe(429);

    const second = buildApp(createLoginLimiter({ limit: 1 }));
    expect((await request(second).post('/login')).status).toBe(200);
  });

  it('can be skipped so the automated suite does not consume real counters', async () => {
    const app = buildApp(createLoginLimiter({ limit: 1, skip: true }));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(app).post('/login')).status).toBe(200);
    }
  });

  it('rate limits account creation separately from sign-in', async () => {
    const app = buildApp(createRegisterLimiter({ limit: 1 }));

    expect((await request(app).post('/login')).status).toBe(200);
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toMatch(/too many accounts/i);
  });
});
