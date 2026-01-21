
import { Pool } from 'pg';
import { pool as dbPool } from '../../database';
import { QualityScore, PropertyQualityMetrics } from './etl/qualityScoring';

export interface QualityTrend {
    date: string;
    score: number;
}

export interface ValidationRuleResult {
    ruleId: string;
    name: string;
    description: string;
    status: 'passed' | 'failed' | 'warning';
    impact: string;
    affectedCount: number;
}

export interface DataQualityService {
    getQualityTrends(days?: number): Promise<QualityTrend[]>;
    getValidationResults(): Promise<ValidationRuleResult[]>;
    getFieldCompleteness(): Promise<Record<string, number>>;
    getAnomalies(limit?: number): Promise<any[]>;
    getDataProfiles(): Promise<any[]>;
}

export class DataHubQualityService implements DataQualityService {
    private pool: Pool;

    constructor(pool: Pool = dbPool) {
        this.pool = pool;
    }

    async getQualityTrends(days: number = 30): Promise<QualityTrend[]> {
        const client = await this.pool.connect();
        try {
            // In a real scenario, we'd store historical snapshots. 
            // For now, we'll simulate a trend based on the current average and some random variation
            // or if we had a history table, we'd query that.
            // Let's assume we don't have history yet and return a simulated trend ending in current score.

            const currentRes = await client.query('SELECT AVG(overall_score) as score FROM property_quality_metrics');
            const currentScore = parseFloat(currentRes.rows[0]?.score || '0');

            const trends: QualityTrend[] = [];
            const now = new Date();

            for (let i = days; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                // Simulate a slight upward trend
                const randomVar = (Math.random() - 0.5) * 5; // +/- 2.5
                const historicalScore = Math.max(0, Math.min(100, currentScore - (i * 0.1) + randomVar));

                trends.push({
                    date: date.toISOString().split('T')[0],
                    score: parseFloat(historicalScore.toFixed(1))
                });
            }

            return trends;
        } finally {
            client.release();
        }
    }

    async getValidationResults(): Promise<ValidationRuleResult[]> {
        const client = await this.pool.connect();
        try {
            // Execute queries to check against rules

            // Rule 1: Missing coordinates
            const missingCoordsRes = await client.query(`
        SELECT COUNT(*) as count FROM properties 
        WHERE location IS NULL OR ST_X(location::geometry) IS NULL
      `);

            // Rule 2: Invalid price range
            const invalidPriceRes = await client.query(`
        SELECT COUNT(*) as count FROM properties 
        WHERE price < 100 OR price > 1000000000
      `);

            // Rule 3: Short descriptions
            const shortDescRes = await client.query(`
        SELECT COUNT(*) as count FROM properties 
        WHERE LENGTH(description) < 50
      `);

            return [
                {
                    ruleId: 'GEO-001',
                    name: 'Geocoding Completeness',
                    description: 'All properties must have valid GPS coordinates',
                    status: parseInt(missingCoordsRes.rows[0].count) > 0 ? 'warning' : 'passed',
                    impact: 'High',
                    affectedCount: parseInt(missingCoordsRes.rows[0].count)
                },
                {
                    ruleId: 'VAL-001',
                    name: 'Price Range Sanity',
                    description: 'Property prices must be within realistic bounds',
                    status: parseInt(invalidPriceRes.rows[0].count) > 0 ? 'warning' : 'passed',
                    impact: 'Critical',
                    affectedCount: parseInt(invalidPriceRes.rows[0].count)
                },
                {
                    ruleId: 'CNT-001',
                    name: 'Description Quality',
                    description: 'Descriptions should be at least 50 characters',
                    status: parseInt(shortDescRes.rows[0].count) > 10 ? 'warning' : 'passed',
                    impact: 'Medium',
                    affectedCount: parseInt(shortDescRes.rows[0].count)
                }
            ];
        } finally {
            client.release();
        }
    }

    async getFieldCompleteness(): Promise<Record<string, number>> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          COUNT(title) as title_count,
          COUNT(description) as desc_count,
          COUNT(price) as price_count,
          COUNT(address_city) as location_count,
          COUNT(property_type) as type_count,
          COUNT(bedrooms) as bed_count,
          COUNT(bathrooms) as bath_count,
          COUNT(*) as total
        FROM properties
      `);

            const row = result.rows[0];
            const total = parseInt(row.total) || 1;

            return {
                'Title': Math.round((parseInt(row.title_count) / total) * 100),
                'Description': Math.round((parseInt(row.desc_count) / total) * 100),
                'Price': Math.round((parseInt(row.price_count) / total) * 100),
                'Location': Math.round((parseInt(row.location_count) / total) * 100),
                'Property Type': Math.round((parseInt(row.type_count) / total) * 100),
                'Bedrooms': Math.round((parseInt(row.bed_count) / total) * 100),
                'Bathrooms': Math.round((parseInt(row.bath_count) / total) * 100),
            };
        } finally {
            client.release();
        }
    }

    async getAnomalies(limit: number = 10): Promise<any[]> {
        const client = await this.pool.connect();
        try {
            // Detect outliers in price (simple Z-score like approach or just extreme values)
            // For simplicity, we'll fetch properties with quality score < 30 or extreme prices

            const result = await client.query(`
        SELECT 
          p.id, p.title, p.price as price, p.property_type,
          pq.overall_score,
          CASE 
            WHEN pq.overall_score < 30 THEN 'Low Data Quality'
            WHEN p.price > 5000000 THEN 'Price Outlier (High)'
            WHEN p.price < 1000 THEN 'Price Outlier (Low)'
            ELSE 'Metadata Issue'
          END as issue_type
        FROM properties p
        LEFT JOIN property_quality_metrics pq ON p.id = pq.property_id
        WHERE pq.overall_score < 30 OR p.price > 5000000 OR p.price < 1000
        LIMIT $1
      `, [limit]);

            return result.rows.map(row => ({
                id: row.id,
                entityId: row.id, // Using same for now
                entityType: 'property',
                issue: row.issue_type,
                severity: row.overall_score < 20 ? 'critical' : 'warning',
                detectedAt: new Date().toISOString() // In reality, this would be from a detection table
            }));
        } finally {
            client.release();
        }
    }

    async getDataProfiles(): Promise<any[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          property_type,
          COUNT(*) as count,
          AVG(price) as avg_price,
          MIN(price) as min_price,
          MAX(price) as max_price
        FROM properties
        GROUP BY property_type
      `);

            return result.rows.map(row => ({
                dataset: `Properties - ${row.property_type || 'Unknown'}`,
                rowCount: parseInt(row.count),
                completeness: 95, // Placeholder, could calculate real per-type completeness
                lastUpdated: 'Just now'
            }));
        } finally {
            client.release();
        }
    }
}

export const dataQualityService = new DataHubQualityService();
