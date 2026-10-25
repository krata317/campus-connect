import { createApp } from './app';
import { env } from './config/env';
import { closeDriver, verifyConnectivity } from './db/neo4j';
import { sessionRepository } from './repositories/session.repository';
import { logger } from './lib/logger';

const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  try {
    await verifyConnectivity();
    logger.info(`Connected to Neo4j at ${env.NEO4J_URI} (database: ${env.NEO4J_DATABASE})`);
  } catch (error) {
    // The process stays up on purpose: liveness stays green, readiness reports
    // 503, and the API recovers by itself when the database comes back (AuraDB
    // Free pauses after inactivity).
    logger.error(
      'Neo4j is unreachable. The API is running but /api/health/ready will report 503 until the database is available.',
      {
        uri: env.NEO4J_URI,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`CampusConnect API listening on port ${env.PORT} (${env.isProduction ? 'production' : env.NODE_ENV})`);
  });

  // Without this, a port clash surfaces as an unhandled 'error' event and a
  // raw stack trace — the most common first-run problem after a stale process.
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${env.PORT} is already in use. Stop the other process or change PORT in .env.`);
    } else {
      logger.error('The HTTP server could not start', { reason: error.message });
    }
    process.exit(1);
  });

  const pruneTimer = setInterval(() => {
    sessionRepository
      .pruneExpired(new Date().toISOString())
      .catch((error: unknown) => logger.warn('Session cleanup failed', { reason: String(error) }));
  }, PRUNE_INTERVAL_MS);

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    clearInterval(pruneTimer);
    server.close(() => {
      closeDriver()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error('API failed to start', { reason: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
