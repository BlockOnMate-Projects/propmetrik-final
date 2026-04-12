import { query } from '../../database';
import { logger } from '../../utils/logger';

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
        // Get data sources with real record counts from properties table
        // and actual last sync times from etl_jobs
        const result = await query<any>(`
            SELECT
                ds.id,
                ds.name,
                ds.slug,
                ds.tier,
                ds.description,
                ds.is_active,
                ds.total_records_synced,
                ds.last_sync_at,
                ds.last_sync_status,
                ds.data_quality_score,
                ds.trust_score,
                COALESCE(pc.property_count, 0) as actual_records,
                COALESCE(jc.last_job_at, ds.last_sync_at) as last_activity,
                COALESCE(jc.completed_jobs, 0) as completed_jobs
            FROM data_sources ds
            LEFT JOIN (
                SELECT external_source, COUNT(*) as property_count
                FROM properties
                GROUP BY external_source
            ) pc ON pc.external_source = ds.slug
            LEFT JOIN (
                SELECT
                    source_id,
                    MAX(completed_at) as last_job_at,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs
                FROM etl_jobs
                GROUP BY source_id
            ) jc ON jc.source_id = ds.id
            ORDER BY COALESCE(pc.property_count, 0) DESC, ds.name ASC
        `);

        // Get actual field count from properties table (same for all sources)
        const fieldResult = await query<{ cnt: string }>(`
            SELECT COUNT(*) as cnt
            FROM information_schema.columns
            WHERE table_name = 'properties' AND table_schema = 'public'
        `);
        const actualFieldCount = parseInt(fieldResult.rows[0]?.cnt || '0');

        return result.rows.map((s: any) => {
            const records = Math.max(
                parseInt(s.actual_records || '0'),
                parseInt(s.total_records_synced || '0')
            );

            return {
                id: s.id,
                name: s.name,
                type: 'Table',
                source: 'PostgreSQL',
                schema: 'public',
                records,
                lastUpdated: s.last_activity || s.last_sync_at || null,
                description: s.description || `Data source for ${s.name}`,
                fields: actualFieldCount,
                classification: s.tier === 'tier1_government' ? 'Public' as const :
                    s.tier === 'tier2_financial' ? 'Sensitive' as const : 'Internal' as const,
                tags: [s.tier, s.is_active ? 'active' : 'inactive',
                    ...(parseInt(s.completed_jobs || '0') > 0 ? ['scraped'] : [])],
                usage: records > 1000 ? 'High' as const :
                    records > 100 ? 'Medium' as const : 'Low' as const,
            };
        });
    }

    static async getSchema(entryId: string): Promise<SchemaField[]> {
        // Return actual columns from the properties table
        try {
            const result = await query<{
                column_name: string;
                data_type: string;
                is_nullable: string;
                column_default: string | null;
            }>(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'properties' AND table_schema = 'public'
                ORDER BY ordinal_position
            `);

            const fieldDescriptions: Record<string, string> = {
                id: 'Primary key',
                reference_number: 'Unique property reference',
                title: 'Property listing title',
                description: 'Property description',
                price: 'Listing price',
                price_currency: 'Currency code (GHS, USD)',
                region: 'Geographic region (partitioning key)',
                address_city: 'City name',
                address_district: 'District/neighborhood',
                latitude: 'GPS latitude',
                longitude: 'GPS longitude',
                property_type: 'Property classification',
                transaction_type: 'Sale or rent',
                bedrooms: 'Number of bedrooms',
                bathrooms: 'Number of bathrooms',
                total_area_sqm: 'Total area in square meters',
                land_area_sqm: 'Land area in square meters',
                primary_image_url: 'Main listing image URL',
                data_source: 'Origin tier (tier1-5, manual)',
                external_source: 'Source slug (meqasa, gpc, etc.)',
                data_quality_score: 'Quality score 0-100',
                status: 'Listing status (active, draft, sold)',
                created_at: 'Record creation timestamp',
                updated_at: 'Last modification timestamp',
            };

            return result.rows.map(col => ({
                name: col.column_name,
                type: col.data_type.toUpperCase(),
                nullable: col.is_nullable === 'YES',
                description: fieldDescriptions[col.column_name] || col.column_name.replace(/_/g, ' '),
            }));
        } catch (error) {
            logger.error('Error fetching schema', { error });
            return [];
        }
    }
}
