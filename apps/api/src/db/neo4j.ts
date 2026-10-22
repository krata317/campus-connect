import neo4j, { type Driver, type ManagedTransaction } from 'neo4j-driver';
import { env } from '../config/env';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
}

let activeConfig: Neo4jConfig = {
  uri: env.NEO4J_URI,
  username: env.NEO4J_USERNAME,
  password: env.NEO4J_PASSWORD,
  database: env.NEO4J_DATABASE,
};

let driver: Driver | null = null;

export function getNeo4jConfig(): Neo4jConfig {
  return activeConfig;
}

export function setNeo4jConfig(config: Neo4jConfig): void {
  activeConfig = config;
  if (driver) {
    const previous = driver;
    driver = null;
    void previous.close();
  }
}

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      activeConfig.uri,
      neo4j.auth.basic(activeConfig.username, activeConfig.password),
      {
        disableLosslessIntegers: true,
        maxConnectionPoolSize: 20,
        connectionAcquisitionTimeout: 20000,
        maxTransactionRetryTime: 15000,
      },
    );
  }
  return driver;
}

export function openSession() {
  return getDriver().session({ database: activeConfig.database });
}

export async function readQuery<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = openSession();
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params));
    return result.records.map((record) => record.toObject() as unknown as T);
  } finally {
    await session.close();
  }
}

export async function readOne<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const rows = await readQuery<T>(cypher, params);
  return rows.length > 0 ? (rows[0] as T) : null;
}

export async function writeQuery<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = openSession();
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params));
    return result.records.map((record) => record.toObject() as unknown as T);
  } finally {
    await session.close();
  }
}

export async function withTransaction<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
  const session = openSession();
  try {
    return await session.executeWrite(work);
  } finally {
    await session.close();
  }
}

export async function verifyConnectivity(): Promise<void> {
  await getDriver().verifyConnectivity();
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    const current = driver;
    driver = null;
    await current.close();
  }
}

export function isConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && String((error as { code: unknown }).code).includes('ConstraintValidationFailed'));
}
