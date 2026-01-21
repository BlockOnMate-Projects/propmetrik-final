import { query } from '../../database';
import { DataSource } from './types';

export interface CatalogEntry {
    id: string;
    name: string;
    type: string;
    source: string;
    schema: string;
    records: number;
    lastUpdated: Date | null;
    description: string;
    fields: number;
    classification: 'Public' | 'Internal' | 'Sensitive';
    tags: string[];
    usage: 'High' | 'Medium' | 'Low';
}

export interface SchemaField {
    name: string;
    type: string;
    nullable: boolean;
    description: string;
}

export class DataCatalogService {
    static async listEntries(): Promise<CatalogEntry[]> {
        const sources = await query('SELECT * FROM data_sources ORDER BY name ASC');

        return (sources.rows as any[]).map((s: DataSource) => ({
            id: s.id,
            name: s.name,
            type: 'Table',
            source: 'PostgreSQL',
            schema: 'public',
            records: s.total_records_synced || 0,
            lastUpdated: s.last_sync_at,
            description: s.description || `Data source for ${s.name}`,
            fields: 15,
            classification: s.tier === 'tier1_government' ? 'Public' : 'Internal',
            tags: [s.tier, 'auto-discovery'],
            usage: 'Medium'
        }));
    }

    static async getSchema(entryId: string): Promise<SchemaField[]> {
        // This would fetch actual column info from PostgreSQL
        // For now, return a generic schema based on the entry
        return [
            { name: 'id', type: 'UUID', nullable: false, description: 'Primary key' },
            { name: 'data', type: 'JSONB', nullable: false, description: 'Raw payload' },
            { name: 'source_id', type: 'UUID', nullable: false, description: 'Reference to data_sources' },
            { name: 'created_at', type: 'TIMESTAMP', nullable: false, description: 'Ingestion time' },
            { name: 'updated_at', type: 'TIMESTAMP', nullable: false, description: 'Last modification time' },
        ];
    }
}
