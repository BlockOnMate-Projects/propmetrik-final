import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

// Database connection pool
const poolConfig: PoolConfig = {
  connectionString: config.database.url,
  max: config.database.pool.max,
  min: config.database.pool.min,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

export const pool = new Pool(poolConfig);

// Log pool events
pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('remove', () => {
  logger.debug('Database connection removed from pool');
});

/**
 * Execute a SQL query with optional parameters
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', {
      text: text.substring(0, 100),
      duration,
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    logger.error('Query error', {
      text: text.substring(0, 100),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  // Set a timeout for automatic release
  const timeout = setTimeout(() => {
    logger.error('Client has been checked out for too long');
    client.release();
  }, 30000);

  // Monkey-patch release to clear timeout
  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connection health
 */
export async function checkHealth(): Promise<{
  connected: boolean;
  latency: number;
  poolSize: number;
  waitingCount: number;
}> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      connected: true,
      latency: Date.now() - start,
      poolSize: pool.totalCount,
      waitingCount: pool.waitingCount,
    };
  } catch (error) {
    return {
      connected: false,
      latency: -1,
      poolSize: pool.totalCount,
      waitingCount: pool.waitingCount,
    };
  }
}

/**
 * Check PostGIS availability
 */
export async function checkPostGIS(): Promise<{ available: boolean; version: string | null }> {
  try {
    const result = await pool.query('SELECT PostGIS_Version() as version');
    return {
      available: true,
      version: result.rows[0]?.version || null,
    };
  } catch (error) {
    return {
      available: false,
      version: null,
    };
  }
}

/**
 * Close the database pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export default {
  pool,
  query,
  getClient,
  transaction,
  checkHealth,
  checkPostGIS,
  closePool,
};
