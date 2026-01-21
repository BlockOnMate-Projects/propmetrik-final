
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'propmetrik',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
};

async function createDatabaseIfNotExists() {
    // Connect to postgres/template1 first to check/create db
    const pool = new Pool({
        ...dbConfig,
        database: 'postgres',
    });

    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${dbConfig.database}'`);
        if (res.rowCount === 0) {
            console.log(`Database ${dbConfig.database} does not exist. Creating...`);
            await client.query(`CREATE DATABASE ${dbConfig.database}`);
            console.log(`Database ${dbConfig.database} created.`);
        } else {
            console.log(`Database ${dbConfig.database} already exists.`);
        }
    } catch (error) {
        console.error('Error checking/creating database:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

async function initTables() {
    await createDatabaseIfNotExists();

    const pool = new Pool(dbConfig);
    const client = await pool.connect();

    try {
        console.log('Starting Data Hub tables initialization...');

        // 1. Create system_settings table
        console.log('Creating system_settings table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        is_public BOOLEAN DEFAULT false,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_by VARCHAR(100)
      );
    `);

        // Seed default settings if they don't exist
        const defaultSettings = [
            {
                key: 'general.region',
                value: JSON.stringify('greater_accra'),
                category: 'general',
                description: 'Default region for dashboard views'
            },
            {
                key: 'general.currency',
                value: JSON.stringify('ghs'),
                category: 'general',
                description: 'Default currency'
            },
            {
                key: 'etl.max_concurrent_jobs',
                value: "5",
                category: 'etl',
                description: 'Maximum number of concurrent ETL jobs'
            },
            {
                key: 'notifications.email_enabled',
                value: "true",
                category: 'notifications',
                description: 'Enable email notifications'
            }
        ];

        for (const setting of defaultSettings) {
            await client.query(`
        INSERT INTO system_settings (key, value, category, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO NOTHING;
      `, [setting.key, setting.value, setting.category, setting.description]);
        }

        // 2. Create property_quality_metrics table
        console.log('Creating property_quality_metrics table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS property_quality_metrics (
        property_id UUID PRIMARY KEY,
        overall_score NUMERIC(5, 2),
        completeness_score NUMERIC(5, 2),
        accuracy_score NUMERIC(5, 2),
        freshness_score NUMERIC(5, 2),
        field_scores JSONB,
        calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

        // 3. Create data_lineage_logs table (simplified for now)
        console.log('Creating data_lineage_logs table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS data_lineage_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'transformed', 'synced'
        source_system VARCHAR(100),
        target_system VARCHAR(100),
        metadata JSONB,
        performed_by VARCHAR(100),
        occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

        // 4. Create pipeline_executions table (if using it for lineage)
        console.log('Creating pipeline_executions table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL, -- 'running', 'completed', 'failed'
        start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        end_time TIMESTAMP WITH TIME ZONE,
        records_processed INTEGER DEFAULT 0,
        error_message TEXT,
        metadata JSONB
      );
    `);

        console.log('Data Hub tables initialized successfully!');
    } catch (err) {
        console.error('Error initializing tables:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

initTables();
