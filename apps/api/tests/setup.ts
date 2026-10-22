/**
 * Global test setup for the API workspace.
 *
 * Unit tests never touch Neo4j, but every module they import transitively pulls
 * in `config/env.ts`, which refuses to start without a complete configuration.
 * Setting safe placeholder values here keeps the unit suite runnable on a clean
 * checkout with no `.env` file.
 *
 * Integration tests opt in separately through `tests/helpers/db.ts` and are
 * skipped unless TEST_NEO4J_* is provided.
 */

process.env.NODE_ENV = 'test';

process.env.SESSION_SECRET ??= 'test-only-session-secret-value-not-for-production-use';
process.env.SESSION_COOKIE_NAME ??= 'cc.sid';
process.env.SESSION_TTL_HOURS ??= '168';
process.env.COOKIE_SECURE ??= 'false';
process.env.TRUST_PROXY ??= 'false';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';
process.env.PORT ??= '4000';

// Placeholders only. The driver is never opened by unit tests, and integration
// tests overwrite this config with the TEST_NEO4J_* values before connecting.
process.env.NEO4J_URI ??= 'neo4j://127.0.0.1:7687';
process.env.NEO4J_USERNAME ??= 'neo4j';
process.env.NEO4J_PASSWORD ??= 'placeholder-password';
process.env.NEO4J_DATABASE ??= 'neo4j';
