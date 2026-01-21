#!/usr/bin/env ts-node
/**
 * Run specific migrations by name
 * Usage: ts-node run-specific-migrations.ts 1737413000000_create_crm_tables 1737413001000_seed_default_crm_pipelines
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { pool, query, transaction } from './src/database';
import { logger } from './src/utils/logger';

function calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 64);
}

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

async function runSpecificMigration(migrationName: string): Promise<void> {
    const migrationsDir = join(__dirname, 'database', 'migrations');
    const filePath = join(migrationsDir, `${migrationName}.sql`);

    logger.info(`Running migration: ${migrationName}`);

    try {
        const content = await readFile(filePath, 'utf-8');
        const checksum = calculateChecksum(content);

        await transaction(async (client) => {
            // Execute migration SQL
            await client.query(content);

            // Record migration
            await client.query(
                'INSERT INTO migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET checksum = $2',
                [migrationName, checksum]
            );
        });

        logger.info(`✅ Migration completed: ${migrationName}`);
    } catch (error: any) {
        logger.error(`❌ Migration failed: ${migrationName}`, { error: error.message });
        throw error;
    }
}

(async () => {
    try {
        await ensureMigrationsTable();

        const migrations = process.argv.slice(2);

        if (migrations.length === 0) {
            console.log('Usage: ts-node run-specific-migrations.ts [migration1] [migration2] ...');
            process.exit(1);
        }

        for (const migration of migrations) {
            await runSpecificMigration(migration);
        }

        logger.info(`All ${migrations.length} migrations completed successfully!`);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
