
import { Pool } from 'pg';
import { pool as dbPool } from '../../database';

// Types for lineage visualization
export interface LineageNode {
    id: string;
    type: 'source' | 'process' | 'storage' | 'output';
    label: string;
    data?: any;
}

export interface LineageEdge {
    source: string;
    target: string;
    label?: string;
}

export interface LineageGraph {
    nodes: LineageNode[];
    edges: LineageEdge[];
}

export interface AuditLogEvent {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    sourceSystem?: string;
    targetSystem?: string;
    performedBy?: string;
    occurredAt: string;
    metadata?: any;
}

export class DataHubLineageService {
    private pool: Pool;

    constructor(pool: Pool = dbPool) {
        this.pool = pool;
    }

    async getLineageFlow(): Promise<LineageGraph> {
        // In a real system, this would be constructed from actual dependencies.
        // For now, we'll return a static graph representing the typical flow, 
        // potentially augmented with status from actual jobs.

        const nodes: LineageNode[] = [
            { id: 'src-scrapers', type: 'source', label: 'Web Scrapers' },
            { id: 'src-apis', type: 'source', label: 'External APIs' },
            { id: 'src-uploads', type: 'source', label: 'File Uploads' },
            { id: 'proc-ingest', type: 'process', label: 'Ingestion Pipeline' },
            { id: 'store-raw', type: 'storage', label: 'Raw Data Store' },
            { id: 'proc-clean', type: 'process', label: 'Cleaning & Dedupe' },
            { id: 'store-processed', type: 'storage', label: 'Processed Properties' },
            { id: 'proc-enrich', type: 'process', label: 'Enrichment (Geo, Val)' },
            { id: 'store-analytics', type: 'output', label: 'Analytics DB' },
            { id: 'out-crm', type: 'output', label: 'CRM Sync' },
        ];

        const edges: LineageEdge[] = [
            { source: 'src-scrapers', target: 'proc-ingest' },
            { source: 'src-apis', target: 'proc-ingest' },
            { source: 'src-uploads', target: 'proc-ingest' },
            { source: 'proc-ingest', target: 'store-raw' },
            { source: 'store-raw', target: 'proc-clean' },
            { source: 'proc-clean', target: 'store-processed' },
            { source: 'store-processed', target: 'proc-enrich' },
            { source: 'proc-enrich', target: 'store-analytics' },
            { source: 'proc-enrich', target: 'out-crm' },
        ];

        return { nodes, edges };
    }

    async getAuditLog(limit: number = 50): Promise<AuditLogEvent[]> {
        const client = await this.pool.connect();
        try {
            // Query our new data_lineage_events table
            const result = await client.query(`
        SELECT * FROM data_lineage_events 
        ORDER BY occurred_at DESC 
        LIMIT $1
      `, [limit]);

            return result.rows.map(row => ({
                id: row.id,
                entityType: row.entity_type,
                entityId: row.entity_id,
                action: row.action,
                sourceSystem: row.source_system,
                targetSystem: row.target_system,
                performedBy: row.performed_by,
                occurredAt: row.occurred_at,
                metadata: row.metadata
            }));
        } finally {
            client.release();
        }
    }
}

export const dataLineageService = new DataHubLineageService();
