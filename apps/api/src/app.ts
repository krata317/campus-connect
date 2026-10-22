import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { env } from './config/env';
import { Neo4jSessionStore } from './db/sessionStore';
import { ensureCsrfToken, verifyCsrf } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth.routes';
import { studentRouter } from './routes/student.routes';
import { employerRouter } from './routes/employer.routes';
import { adminRouter } from './routes/admin.routes';
import { skillRouter } from './routes/skill.routes';
import { verifyConnectivity } from './db/neo4j';

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use(
    session({
      name: env.SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new Neo4jSessionStore(env.sessionTtlMs),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
        maxAge: env.sessionTtlMs,
        path: '/',
      },
    }),
  );

  app.use(ensureCsrfToken);
  app.use(verifyCsrf);

  app.get('/api/health', async (_req, res) => {
    try {
      await verifyConnectivity();
      res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down', time: new Date().toISOString() });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/employer', employerRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/skills', skillRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
