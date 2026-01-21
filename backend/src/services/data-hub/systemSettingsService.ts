
import { Pool } from 'pg';
import { pool as dbPool } from '../../database';

export interface SystemSetting {
    key: string;
    value: any;
    category: string;
    description?: string;
    isPublic: boolean;
    updatedAt: string;
    updatedBy?: string;
}

export class DataHubSettingsService {
    private pool: Pool;

    constructor(pool: Pool = dbPool) {
        this.pool = pool;
    }

    async getAll(): Promise<Record<string, any>> {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT key, value FROM system_settings');
            const settings: Record<string, any> = {};

            for (const row of result.rows) {
                settings[row.key] = row.value;
            }
            return settings;
        } finally {
            client.release();
        }
    }

    async getByCategory(category: string): Promise<SystemSetting[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM system_settings WHERE category = $1',
                [category]
            );

            return result.rows.map(this.mapRowToSetting);
        } finally {
            client.release();
        }
    }

    async get(key: string): Promise<any> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT value FROM system_settings WHERE key = $1',
                [key]
            );

            if (result.rows.length === 0) return null;
            return result.rows[0].value;
        } finally {
            client.release();
        }
    }

    async set(key: string, value: any, updatedBy: string = 'system'): Promise<void> {
        const client = await this.pool.connect();
        try {
            // Check if exists to preserve other fields
            const exists = await client.query('SELECT 1 FROM system_settings WHERE key = $1', [key]);

            if (exists.rowCount && exists.rowCount > 0) {
                await client.query(
                    'UPDATE system_settings SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3',
                    [JSON.stringify(value), updatedBy, key]
                );
            } else {
                // Assume general category if creating new without context
                await client.query(
                    'INSERT INTO system_settings (key, value, category, updated_by) VALUES ($1, $2, $3, $4)',
                    [key, JSON.stringify(value), 'general', updatedBy]
                );
            }
        } finally {
            client.release();
        }
    }

    async updateBatch(settings: Record<string, any>, updatedBy: string = 'system'): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            for (const [key, value] of Object.entries(settings)) {
                await client.query(
                    `INSERT INTO system_settings (key, value, category, updated_by, updated_at) 
           VALUES ($1, $2, 'general', $3, NOW())
           ON CONFLICT (key) DO UPDATE SET 
             value = EXCLUDED.value, 
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
                    [key, JSON.stringify(value), updatedBy]
                );
            } // Fixed: Removed accidental syntax error

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private mapRowToSetting(row: any): SystemSetting {
        return {
            key: row.key,
            value: row.value,
            category: row.category,
            description: row.description,
            isPublic: row.is_public,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by
        };
    }
}

export const systemSettingsService = new DataHubSettingsService();
