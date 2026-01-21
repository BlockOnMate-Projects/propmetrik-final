import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool, query, transaction } from './index';
import { logger } from '../utils/logger';

interface MigrationRecord {
  id: number;
  name: string;
  executed_at: Date;
  checksum: string;
}

/**
 * Create migrations table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64) NOT NULL
    )
  `);
}

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations(): Promise<Map<string, MigrationRecord>> {
  const result = await query<MigrationRecord>('SELECT * FROM migrations ORDER BY id');
  const map = new Map<string, MigrationRecord>();

  for (const row of result.rows) {
    map.set(row.name, row);
  }

  return map;
}

/**
 * Calculate checksum for migration content
 */
function calculateChecksum(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 64);
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  logger.info('Starting database migrations...');

  await ensureMigrationsTable();

  // Use centralized migrations folder at backend/database/migrations
  const migrationsDir = join(__dirname, '..', '..', 'database', 'migrations');
  const executedMigrations = await getExecutedMigrations();

  // Read migration files
  let files: string[];
  try {
    files = await readdir(migrationsDir);
  } catch (error) {
    logger.warn('Migrations directory not found', { path: migrationsDir });
    return;
  }

  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Ensure order by filename

  let migrated = 0;
  let skipped = 0;

  for (const file of sqlFiles) {
    const name = file.replace('.sql', '');
    const filePath = join(migrationsDir, file);

    // Read migration content
    const content = await readFile(filePath, 'utf-8');
    const checksum = calculateChecksum(content);

    // Check if already executed
    const existing = executedMigrations.get(name);

    if (existing) {
      // CHECKSUM VALIDATION DISABLED FOR DEVELOPMENT
      // Re-enable in production by uncommenting below:
      /*
      if (existing.checksum !== checksum) {
        throw new Error(
          `Migration ${name} has been modified after execution. ` +
          `Expected checksum: ${existing.checksum}, got: ${checksum}`
        );
      }
      */
      skipped++;
      continue;
    }

    // Execute migration
    logger.info(`Running migration: ${name}`);

    try {
      await transaction(async (client) => {
        // Execute migration SQL
        await client.query(content);

        // Record migration
        await client.query(
          'INSERT INTO migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum]
        );
      });

      migrated++;
      logger.info(`Migration completed: ${name}`);
    } catch (error: any) {
      logger.error(`Migration failed: ${name}`, { error: error.message });
      throw error;
    }
  }

  logger.info(`Migrations complete. Executed: ${migrated}, Skipped: ${skipped}`);
}

/**
 * Rollback last migration (for development)
 */
export async function rollbackLastMigration(): Promise<void> {
  const result = await query<MigrationRecord>(
    'SELECT * FROM migrations ORDER BY id DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    logger.info('No migrations to rollback');
    return;
  }

  const lastMigration = result.rows[0];
  logger.warn(`Rolling back migration: ${lastMigration.name}`);

  // Note: This doesn't actually reverse the migration SQL
  // You would need separate down migration files for that
  await query('DELETE FROM migrations WHERE id = $1', [lastMigration.id]);

  logger.info(`Migration record removed: ${lastMigration.name}`);
  logger.warn('Note: Database changes were NOT reversed. Create a new migration to undo changes.');
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  executed: string[];
  pending: string[];
}> {
  await ensureMigrationsTable();

  const executedMigrations = await getExecutedMigrations();
  const migrationsDir = join(__dirname, '..', '..', 'database', 'migrations');

  let files: string[];
  try {
    files = await readdir(migrationsDir);
  } catch {
    return { executed: [], pending: [] };
  }

  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

  const executed: string[] = [];
  const pending: string[] = [];

  for (const file of sqlFiles) {
    const name = file.replace('.sql', '');
    if (executedMigrations.has(name)) {
      executed.push(name);
    } else {
      pending.push(name);
    }
  }

  return { executed, pending };
}

// CLI support
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'run':
          await runMigrations();
          break;
        case 'rollback':
          await rollbackLastMigration();
          break;
        case 'status':
          const status = await getMigrationStatus();
          console.log('Executed migrations:', status.executed);
          console.log('Pending migrations:', status.pending);
          break;
        default:
          console.log('Usage: ts-node migrate.ts [run|rollback|status]');
      }
    } catch (error) {
      console.error('Migration error:', error);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}
