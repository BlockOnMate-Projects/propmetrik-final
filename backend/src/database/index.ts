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

// Queries slower than this (ms) are logged; faster ones are not, to keep the hot path quiet.
const SLOW_QUERY_MS = 100;

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
// Transient connection-level errors (network reset, pool timeout, server dropped the
// connection). Retrying these with a fresh pooled connection recovers the request.
// Deliberately EXCLUDES SQL errors (syntax, constraint, etc.) — those are deterministic.
function isTransientConnectionError(error: any): boolean {
  const code = error?.code;
  // pg SQLSTATE class 08 = connection_exception; 57P0x = server shutdown/cannot-connect.
  if (typeof code === 'string' && (code.startsWith('08') || code === '57P01' || code === '57P02' || code === '57P03')) {
    return true;
  }
  // node socket errors
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection error') ||
    msg.includes('server closed the connection') ||
    msg.includes('timeout exceeded when trying to connect')
  );
}

// A read query (SELECT / CTE) is idempotent → safe to retry. Writes are NEVER retried
// here (a lost-response write could double-apply money/valuation mutations).
function isReadQuery(text: string): boolean {
  const t = text.trimStart().slice(0, 8).toLowerCase();
  return t.startsWith('select') || t.startsWith('with') || t.startsWith('show') || t.startsWith('explain');
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const maxAttempts = isReadQuery(text) ? 3 : 1;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      // Only log slow queries. A single dashboard load can fire hundreds of fast queries;
      // logging every one adds real overhead (and noise) on the hot path.
      if (duration >= SLOW_QUERY_MS) {
        logger.warn('Slow query', {
          text: text.substring(0, 100),
          duration,
          rows: result.rowCount,
        });
      }
      return result;
    } catch (error: any) {
      lastError = error;
      // Retry only transient connection failures on read queries; a fresh pool
      // connection on the next attempt typically recovers a remote-DB blip.
      if (attempt < maxAttempts && isTransientConnectionError(error)) {
        logger.warn('Transient DB connection error — retrying read query', {
          attempt, code: error?.code, error: error?.message,
        });
        await new Promise((r) => setTimeout(r, 150 * attempt));
        continue;
      }
      logger.error('Query error', {
        text: text.substring(0, 500),
        error: error instanceof Error ? error.message : 'Unknown error',
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
        position: error?.position,
      });
      throw error;
    }
  }
  throw lastError;
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
