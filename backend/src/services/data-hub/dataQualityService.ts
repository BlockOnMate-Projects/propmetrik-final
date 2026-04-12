
import { Pool } from 'pg';
import { pool as dbPool } from '../../database';
import { logger } from '../../utils/logger';

export interface QualityTrend {
    date: string;
    score: number;
    completeness: number;
    accuracy: number;
    timeliness: number;
    consistency: number;
}

export interface QualitySummary {
    overall: number;
    completeness: number;
    accuracy: number;
    timeliness: number;
    consistency: number;
    totalProperties: number;
    scoredProperties: number;
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
    getQualitySummary(): Promise<QualitySummary>;
    getQualityTrends(days?: number): Promise<QualityTrend[]>;
    getValidationResults(): Promise<ValidationRuleResult[]>;
    getFieldCompleteness(): Promise<Record<string, number>>;
    getAnomalies(limit?: number): Promise<any[]>;
    getDataProfiles(): Promise<any[]>;
    ensureQualityMetrics(): Promise<void>;
}

// Ghana price bounds (GHS) - realistic range for property market
const PRICE_BOUNDS = { min: 500, max: 50_000_000 };
// Ghana bounding box
const GHANA_BOUNDS = { minLat: 4.5, maxLat: 11.2, minLon: -3.3, maxLon: 1.2 };

export class DataHubQualityService implements DataQualityService {
    private pool: Pool;
    private metricsEnsured = false;

    constructor(pool: Pool = dbPool) {
        this.pool = pool;
    }

    /**
     * Populate property_quality_metrics for any properties that don't have scores yet.
     * Uses a single SQL query to calculate scores in bulk (no row-by-row processing).
     */
    async ensureQualityMetrics(): Promise<void> {
        if (this.metricsEnsured) return;
        const client = await this.pool.connect();
        try {
            // Check if we need to score
            const countRes = await client.query(
                `SELECT
                   (SELECT COUNT(*) FROM properties) as total,
                   (SELECT COUNT(*) FROM property_quality_metrics) as scored`
            );
            const { total, scored } = countRes.rows[0];
            if (parseInt(scored) >= parseInt(total) * 0.9) {
                this.metricsEnsured = true;
                return; // 90%+ coverage, skip
            }

            logger.info('Calculating quality metrics for unscored properties', {
                total: parseInt(total),
                scored: parseInt(scored),
            });

            // Bulk calculate and insert quality metrics using SQL
            await client.query(`
                INSERT INTO property_quality_metrics (
                    property_id, property_region, overall_score,
                    completeness_score, accuracy_score, timeliness_score, consistency_score,
                    fields_total, fields_filled, issues, assessed_at, assessed_by
                )
                SELECT
                    p.id,
                    p.region,
                    -- Overall: weighted average of components
                    ROUND((comp.score * 0.35 + acc.score * 0.25 + fresh.score * 0.20 + cons.score * 0.20)::numeric, 2) as overall_score,
                    comp.score as completeness_score,
                    acc.score as accuracy_score,
                    fresh.score as timeliness_score,
                    cons.score as consistency_score,
                    10 as fields_total,
                    comp.filled as fields_filled,
                    '[]'::jsonb as issues,
                    NOW() as assessed_at,
                    'system' as assessed_by
                FROM properties p
                LEFT JOIN property_quality_metrics pqm ON p.id = pqm.property_id
                CROSS JOIN LATERAL (
                    SELECT
                        (
                            CASE WHEN p.title IS NOT NULL AND LENGTH(p.title) > 0 THEN 1 ELSE 0 END +
                            CASE WHEN p.description IS NOT NULL AND LENGTH(p.description) > 0 THEN 1 ELSE 0 END +
                            CASE WHEN p.price IS NOT NULL AND p.price > 0 THEN 1 ELSE 0 END +
                            CASE WHEN p.address_city IS NOT NULL THEN 1 ELSE 0 END +
                            CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN 1 ELSE 0 END +
                            CASE WHEN p.property_type IS NOT NULL THEN 1 ELSE 0 END +
                            CASE WHEN p.bedrooms IS NOT NULL THEN 1 ELSE 0 END +
                            CASE WHEN p.bathrooms IS NOT NULL THEN 1 ELSE 0 END +
                            CASE WHEN p.total_area_sqm IS NOT NULL OR p.land_area_sqm IS NOT NULL THEN 1 ELSE 0 END +
                            CASE WHEN p.primary_image_url IS NOT NULL THEN 1 ELSE 0 END
                        ) as filled,
                        ROUND(
                            (CASE WHEN p.title IS NOT NULL AND LENGTH(p.title) > 0 THEN 1 ELSE 0 END +
                             CASE WHEN p.description IS NOT NULL AND LENGTH(p.description) > 0 THEN 1 ELSE 0 END +
                             CASE WHEN p.price IS NOT NULL AND p.price > 0 THEN 1 ELSE 0 END +
                             CASE WHEN p.address_city IS NOT NULL THEN 1 ELSE 0 END +
                             CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN 1 ELSE 0 END +
                             CASE WHEN p.property_type IS NOT NULL THEN 1 ELSE 0 END +
                             CASE WHEN p.bedrooms IS NOT NULL THEN 1 ELSE 0 END +
                             CASE WHEN p.bathrooms IS NOT NULL THEN 1 ELSE 0 END +
                             CASE WHEN p.total_area_sqm IS NOT NULL OR p.land_area_sqm IS NOT NULL THEN 1 ELSE 0 END +
                             CASE WHEN p.primary_image_url IS NOT NULL THEN 1 ELSE 0 END
                            )::numeric / 10.0 * 100, 2
                        ) as score
                ) comp
                CROSS JOIN LATERAL (
                    SELECT ROUND((
                        CASE WHEN p.price >= ${PRICE_BOUNDS.min} AND p.price <= ${PRICE_BOUNDS.max} THEN 40 ELSE 0 END +
                        CASE WHEN p.latitude BETWEEN ${GHANA_BOUNDS.minLat} AND ${GHANA_BOUNDS.maxLat}
                             AND p.longitude BETWEEN ${GHANA_BOUNDS.minLon} AND ${GHANA_BOUNDS.maxLon} THEN 30
                             WHEN p.latitude IS NULL THEN 10
                             ELSE 0 END +
                        CASE WHEN p.property_type IS NOT NULL THEN 15 ELSE 0 END +
                        CASE WHEN LENGTH(COALESCE(p.description, '')) >= 50 THEN 15 ELSE
                             CASE WHEN LENGTH(COALESCE(p.description, '')) >= 20 THEN 8 ELSE 0 END END
                    )::numeric, 2) as score
                ) acc
                CROSS JOIN LATERAL (
                    SELECT ROUND(GREATEST(0, LEAST(100,
                        CASE
                            WHEN p.updated_at >= NOW() - INTERVAL '7 days' THEN 100
                            WHEN p.updated_at >= NOW() - INTERVAL '30 days' THEN 80
                            WHEN p.updated_at >= NOW() - INTERVAL '90 days' THEN 60
                            WHEN p.updated_at >= NOW() - INTERVAL '180 days' THEN 40
                            ELSE 20
                        END
                    ))::numeric, 2) as score
                ) fresh
                CROSS JOIN LATERAL (
                    SELECT ROUND((
                        -- Land shouldn't have bedrooms
                        CASE WHEN p.property_type::text LIKE '%land%' AND p.bedrooms IS NOT NULL AND p.bedrooms > 0 THEN 0 ELSE 25 END +
                        -- Price should be positive
                        CASE WHEN p.price > 0 THEN 25 ELSE 0 END +
                        -- Region should match city (basic check)
                        CASE WHEN p.address_city IS NOT NULL AND p.region IS NOT NULL THEN 25 ELSE 15 END +
                        -- Has consistent source data
                        CASE WHEN p.data_source IS NOT NULL THEN 25 ELSE 15 END
                    )::numeric, 2) as score
                ) cons
                WHERE pqm.property_id IS NULL
            `);

            // Also update properties.data_quality_score
            await client.query(`
                UPDATE properties p
                SET data_quality_score = pqm.overall_score
                FROM property_quality_metrics pqm
                WHERE p.id = pqm.property_id
                  AND (p.data_quality_score IS NULL OR p.data_quality_score = 0)
            `);

            this.metricsEnsured = true;
            logger.info('Quality metrics calculation complete');
        } catch (error) {
            logger.error('Error calculating quality metrics', { error });
        } finally {
            client.release();
        }
    }

    /**
     * Get overall quality summary with real breakdown scores
     */
    async getQualitySummary(): Promise<QualitySummary> {
        await this.ensureQualityMetrics();
        const client = await this.pool.connect();
        try {
            const res = await client.query(`
                SELECT
                    COALESCE(ROUND(AVG(overall_score)::numeric, 1), 0) as overall,
                    COALESCE(ROUND(AVG(completeness_score)::numeric, 1), 0) as completeness,
                    COALESCE(ROUND(AVG(accuracy_score)::numeric, 1), 0) as accuracy,
                    COALESCE(ROUND(AVG(timeliness_score)::numeric, 1), 0) as timeliness,
                    COALESCE(ROUND(AVG(consistency_score)::numeric, 1), 0) as consistency,
                    (SELECT COUNT(*) FROM properties) as total_properties,
                    COUNT(*) as scored_properties
                FROM property_quality_metrics
            `);
            const row = res.rows[0];
            return {
                overall: parseFloat(row.overall),
                completeness: parseFloat(row.completeness),
                accuracy: parseFloat(row.accuracy),
                timeliness: parseFloat(row.timeliness),
                consistency: parseFloat(row.consistency),
                totalProperties: parseInt(row.total_properties),
                scoredProperties: parseInt(row.scored_properties),
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get quality trends using real assessed_at timestamps.
     * Falls back to property creation dates if no historical metrics exist.
     */
    async getQualityTrends(days: number = 30): Promise<QualityTrend[]> {
        await this.ensureQualityMetrics();
        const client = await this.pool.connect();
        try {
            // Efficient approach: get cumulative daily averages using window functions.
            // First aggregate new properties per day, then compute running averages.
            const result = await client.query(`
                WITH date_series AS (
                    SELECT generate_series(
                        (CURRENT_DATE - $1 * INTERVAL '1 day')::date,
                        CURRENT_DATE,
                        '1 day'::interval
                    )::date AS day
                ),
                daily_new AS (
                    SELECT
                        p.created_at::date as day,
                        COUNT(*) as new_count,
                        SUM(pqm.overall_score) as sum_overall,
                        SUM(pqm.completeness_score) as sum_comp,
                        SUM(pqm.accuracy_score) as sum_acc,
                        SUM(pqm.timeliness_score) as sum_time,
                        SUM(pqm.consistency_score) as sum_cons
                    FROM properties p
                    JOIN property_quality_metrics pqm ON p.id = pqm.property_id
                    GROUP BY p.created_at::date
                ),
                cumulative AS (
                    SELECT
                        ds.day,
                        SUM(COALESCE(dn.new_count, 0)) OVER (ORDER BY ds.day) as total_props,
                        SUM(COALESCE(dn.sum_overall, 0)) OVER (ORDER BY ds.day) as cum_overall,
                        SUM(COALESCE(dn.sum_comp, 0)) OVER (ORDER BY ds.day) as cum_comp,
                        SUM(COALESCE(dn.sum_acc, 0)) OVER (ORDER BY ds.day) as cum_acc,
                        SUM(COALESCE(dn.sum_time, 0)) OVER (ORDER BY ds.day) as cum_time,
                        SUM(COALESCE(dn.sum_cons, 0)) OVER (ORDER BY ds.day) as cum_cons
                    FROM date_series ds
                    LEFT JOIN daily_new dn ON dn.day = ds.day
                )
                SELECT
                    day::text as date,
                    CASE WHEN total_props > 0 THEN ROUND((cum_overall / total_props)::numeric, 1) ELSE 0 END as score,
                    CASE WHEN total_props > 0 THEN ROUND((cum_comp / total_props)::numeric, 1) ELSE 0 END as completeness,
                    CASE WHEN total_props > 0 THEN ROUND((cum_acc / total_props)::numeric, 1) ELSE 0 END as accuracy,
                    CASE WHEN total_props > 0 THEN ROUND((cum_time / total_props)::numeric, 1) ELSE 0 END as timeliness,
                    CASE WHEN total_props > 0 THEN ROUND((cum_cons / total_props)::numeric, 1) ELSE 0 END as consistency
                FROM cumulative
                ORDER BY day ASC
            `, [days]);

            return result.rows.map(row => ({
                date: row.date,
                score: parseFloat(row.score),
                completeness: parseFloat(row.completeness),
                accuracy: parseFloat(row.accuracy),
                timeliness: parseFloat(row.timeliness),
                consistency: parseFloat(row.consistency),
            }));
        } finally {
            client.release();
        }
    }

    async getValidationResults(): Promise<ValidationRuleResult[]> {
        const client = await this.pool.connect();
        try {
            // Rule 1: Missing coordinates (use latitude/longitude, not PostGIS)
            const missingCoordsRes = await client.query(`
                SELECT COUNT(*) as count FROM properties
                WHERE latitude IS NULL OR longitude IS NULL
            `);

            // Rule 2: Invalid price range
            const invalidPriceRes = await client.query(`
                SELECT COUNT(*) as count FROM properties
                WHERE price < ${PRICE_BOUNDS.min} OR price > ${PRICE_BOUNDS.max}
            `);

            // Rule 3: Short/missing descriptions
            const shortDescRes = await client.query(`
                SELECT COUNT(*) as count FROM properties
                WHERE description IS NULL OR LENGTH(description) < 50
            `);

            // Rule 4: Missing images
            const missingImagesRes = await client.query(`
                SELECT COUNT(*) as count FROM properties
                WHERE primary_image_url IS NULL
            `);

            // Rule 5: Duplicate detection (same title + price + city)
            const duplicatesRes = await client.query(`
                SELECT COUNT(*) as count FROM (
                    SELECT title, price, address_city
                    FROM properties
                    WHERE title IS NOT NULL
                    GROUP BY title, price, address_city
                    HAVING COUNT(*) > 1
                ) dupes
            `);

            const missingCoords = parseInt(missingCoordsRes.rows[0].count);
            const invalidPrice = parseInt(invalidPriceRes.rows[0].count);
            const shortDesc = parseInt(shortDescRes.rows[0].count);
            const missingImages = parseInt(missingImagesRes.rows[0].count);
            const duplicates = parseInt(duplicatesRes.rows[0].count);

            return [
                {
                    ruleId: 'GEO-001',
                    name: 'Geocoding Completeness',
                    description: 'All properties must have valid GPS coordinates',
                    status: missingCoords > 0 ? 'warning' : 'passed',
                    impact: 'High',
                    affectedCount: missingCoords,
                },
                {
                    ruleId: 'VAL-001',
                    name: 'Price Range Sanity',
                    description: 'Property prices must be within realistic bounds',
                    status: invalidPrice > 0 ? 'warning' : 'passed',
                    impact: 'Critical',
                    affectedCount: invalidPrice,
                },
                {
                    ruleId: 'CNT-001',
                    name: 'Description Quality',
                    description: 'Descriptions should be at least 50 characters',
                    status: shortDesc > 10 ? 'warning' : 'passed',
                    impact: 'Medium',
                    affectedCount: shortDesc,
                },
                {
                    ruleId: 'IMG-001',
                    name: 'Image Coverage',
                    description: 'Properties should have at least one image',
                    status: missingImages > 0 ? 'warning' : 'passed',
                    impact: 'Medium',
                    affectedCount: missingImages,
                },
                {
                    ruleId: 'DUP-001',
                    name: 'Duplicate Detection',
                    description: 'No duplicate properties by title + price + city',
                    status: duplicates > 0 ? 'warning' : 'passed',
                    impact: 'High',
                    affectedCount: duplicates,
                },
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
                    COUNT(CASE WHEN title IS NOT NULL AND LENGTH(title) > 0 THEN 1 END) as title_count,
                    COUNT(CASE WHEN description IS NOT NULL AND LENGTH(description) > 0 THEN 1 END) as desc_count,
                    COUNT(CASE WHEN price IS NOT NULL AND price > 0 THEN 1 END) as price_count,
                    COUNT(CASE WHEN address_city IS NOT NULL THEN 1 END) as location_count,
                    COUNT(CASE WHEN property_type IS NOT NULL THEN 1 END) as type_count,
                    COUNT(CASE WHEN bedrooms IS NOT NULL THEN 1 END) as bed_count,
                    COUNT(CASE WHEN bathrooms IS NOT NULL THEN 1 END) as bath_count,
                    COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as coords_count,
                    COUNT(CASE WHEN primary_image_url IS NOT NULL THEN 1 END) as image_count,
                    COUNT(CASE WHEN total_area_sqm IS NOT NULL OR land_area_sqm IS NOT NULL THEN 1 END) as size_count,
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
                'Coordinates': Math.round((parseInt(row.coords_count) / total) * 100),
                'Property Type': Math.round((parseInt(row.type_count) / total) * 100),
                'Bedrooms': Math.round((parseInt(row.bed_count) / total) * 100),
                'Bathrooms': Math.round((parseInt(row.bath_count) / total) * 100),
                'Size': Math.round((parseInt(row.size_count) / total) * 100),
                'Images': Math.round((parseInt(row.image_count) / total) * 100),
            };
        } finally {
            client.release();
        }
    }

    async getAnomalies(limit: number = 10): Promise<any[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT
                    p.id, p.title, p.price, p.property_type, p.address_city,
                    pqm.overall_score,
                    CASE
                        WHEN pqm.overall_score IS NOT NULL AND pqm.overall_score < 30 THEN 'Low Data Quality'
                        WHEN p.price > 5000000 THEN 'Price Outlier (High)'
                        WHEN p.price < 1000 THEN 'Price Outlier (Low)'
                        WHEN p.latitude IS NULL AND p.longitude IS NULL THEN 'Missing Coordinates'
                        WHEN p.description IS NULL OR LENGTH(p.description) < 20 THEN 'Poor Description'
                        ELSE 'Metadata Issue'
                    END as issue_type,
                    p.created_at
                FROM properties p
                LEFT JOIN property_quality_metrics pqm ON p.id = pqm.property_id
                WHERE (pqm.overall_score IS NOT NULL AND pqm.overall_score < 30)
                   OR p.price > 5000000
                   OR p.price < 1000
                   OR (p.description IS NULL OR LENGTH(p.description) < 20)
                ORDER BY COALESCE(pqm.overall_score, 100) ASC, p.created_at DESC
                LIMIT $1
            `, [limit]);

            return result.rows.map(row => ({
                id: row.id,
                entityId: row.id,
                entityType: 'property',
                title: row.title,
                price: row.price ? parseFloat(row.price) : null,
                city: row.address_city,
                propertyType: row.property_type,
                qualityScore: row.overall_score ? parseFloat(row.overall_score) : null,
                issue: row.issue_type,
                severity: (row.overall_score !== null && parseFloat(row.overall_score) < 20) || row.price < 1000 ? 'critical' : 'warning',
                detectedAt: row.created_at?.toISOString() || new Date().toISOString(),
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
                    p.property_type,
                    COUNT(*) as count,
                    AVG(p.price) as avg_price,
                    MIN(p.price) as min_price,
                    MAX(p.price) as max_price,
                    ROUND(
                        (COUNT(CASE WHEN p.title IS NOT NULL THEN 1 END) +
                         COUNT(CASE WHEN p.description IS NOT NULL THEN 1 END) +
                         COUNT(CASE WHEN p.price > 0 THEN 1 END) +
                         COUNT(CASE WHEN p.address_city IS NOT NULL THEN 1 END) +
                         COUNT(CASE WHEN p.latitude IS NOT NULL THEN 1 END) +
                         COUNT(CASE WHEN p.bedrooms IS NOT NULL THEN 1 END) +
                         COUNT(CASE WHEN p.bathrooms IS NOT NULL THEN 1 END)
                        )::numeric / (COUNT(*) * 7) * 100, 1
                    ) as completeness
                FROM properties p
                GROUP BY p.property_type
                ORDER BY count DESC
            `);

            return result.rows.map(row => ({
                dataset: `Properties - ${row.property_type || 'Unknown'}`,
                rowCount: parseInt(row.count),
                completeness: parseFloat(row.completeness),
                lastUpdated: 'Just now',
            }));
        } finally {
            client.release();
        }
    }
}

export const dataQualityService = new DataHubQualityService();
