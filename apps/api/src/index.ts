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
    logger.error('Could not connect to Neo4j. Start the CampusConnect database in Neo4j Desktop, then restart the API.', {
      uri: env.NEO4J_URI,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`CampusConnect API listening on http://localhost:${env.PORT}`);
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
