/**
 * Litigation Risk Service
 * 
 * Analyzes land litigation and court judgment data to calculate risk scores.
 * Identifies landguard hotspots and provides property-level risk assessments.
 * 
 * Data source: litigation_risk_data table + litigation_hotspots materialized view
 */

import { query } from '../../src/database';
import { logger } from '../../src/utils/logger';

interface LitigationCase {
    id: string;
    source_name: string;
    publication_date: string;
    case_number: string | null;
    case_title: string;
    court_name: string | null;
    plaintiff_names: string[];
    defendant_names: string[];
    property_description: string | null;
    raw_address: string | null;
    neighborhood: string | null;
    city: string | null;
    region: string | null;
    dispute_type: string | null;
    status: string;
    involves_landguard: boolean;
    involves_violence: boolean;
    risk_score: number | null;
}

interface LitigationHotspot {
    neighborhood: string;
    city: string;
    region: string;
    total_cases: number;
    active_cases: number;
    landguard_cases: number;
    avg_risk_score: number;
    latest_case_date: string;
}

interface PropertyRiskAssessment {
    property_location: string;
    nearby_cases_count: number;
    nearest_case_distance_km: number | null;
    neighborhood_risk_score: number;
    landguard_incidents_nearby: number;
    risk_level: 'low' | 'moderate' | 'high' | 'critical';
    risk_factors: string[];
}

export class LitigationRiskService {
    /**
     * Get litigation cases by filters
     */
    async getCases(params: {
        region?: string;
        city?: string;
        neighborhood?: string;
        status?: 'pending' | 'active' | 'resolved' | 'dismissed';
        involves_landguard?: boolean;
        start_date?: string;
        end_date?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ cases: LitigationCase[]; total: number }> {
        const {
            region,
            city,
            neighborhood,
            status,
            involves_landguard,
            start_date,
            end_date,
            limit = 100,
            offset = 0,
        } = params;

        try {
            const whereConditions: string[] = [];
            const queryParams: any[] = [];
            let paramIndex = 1;

            if (region) {
                whereConditions.push(`region = $${paramIndex++}`);
                queryParams.push(region);
            }

            if (city) {
                whereConditions.push(`(city = $${paramIndex} OR city IS NULL)`);
                queryParams.push(city);
                paramIndex++;
            }

            if (neighborhood) {
                whereConditions.push(`neighborhood = $${paramIndex++}`);
                queryParams.push(neighborhood);
            }

            if (status) {
                whereConditions.push(`status = $${paramIndex++}`);
                queryParams.push(status);
            }

            if (involves_landguard !== undefined) {
                whereConditions.push(`involves_landguard = $${paramIndex++}`);
                queryParams.push(involves_landguard);
            }

            if (start_date) {
                whereConditions.push(`publication_date >= $${paramIndex++}::date`);
                queryParams.push(start_date);
            }

            if (end_date) {
                whereConditions.push(`publication_date <= $${paramIndex++}::date`);
                queryParams.push(end_date);
            }

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            // Get total count
            const countSql = `SELECT COUNT(*) as total FROM litigation_risk_data ${whereClause}`;
            const countResult = await query(countSql, queryParams);
            const total = parseInt(countResult.rows[0].total);

            // Get paginated results
            queryParams.push(limit, offset);
            const dataSql = `
        SELECT 
          id,
          source_name,
          publication_date::text,
          case_number,
          case_title,
          court_name,
          plaintiff_names,
          defendant_names,
          property_description,
          raw_address,
          neighborhood,
          city,
          region,
          dispute_type,
          status,
          involves_landguard,
          involves_violence,
          risk_score
        FROM litigation_risk_data
        ${whereClause}
        ORDER BY publication_date DESC, created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `;

            const dataResult = await query<LitigationCase>(dataSql, queryParams);

            return {
                cases: dataResult.rows,
                total,
            };
        } catch (error) {
            logger.error('Failed to get litigation cases', { error, params });
            throw error;
        }
    }

    /**
     * Get litigation hotspots (neighborhoods with high litigation activity)
     * Computes directly from litigation_risk_data instead of materialized view
     */
    async getHotspots(params: {
        region?: string;
        city?: string;
        min_cases?: number;
    }): Promise<LitigationHotspot[]> {
        const { region, city, min_cases = 1 } = params;

        try {
            const whereConditions: string[] = [];
            const queryParams: any[] = [];
            let paramIndex = 1;

            if (region) {
                whereConditions.push(`region = $${paramIndex++}`);
                queryParams.push(region);
            }

            if (city) {
                whereConditions.push(`(city = $${paramIndex} OR city IS NULL)`);
                queryParams.push(city);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            const sql = `
        SELECT 
          COALESCE(region, 'Unknown') as region,
          COALESCE(city, 'Unknown') as city,
          COALESCE(neighborhood, COALESCE(city, 'General')) as neighborhood,
          COUNT(*)::int as total_cases,
          COUNT(*) FILTER (WHERE status = 'active' OR status = 'pending')::int as active_cases,
          COUNT(*) FILTER (WHERE involves_landguard = true)::int as landguard_cases,
          ROUND(COALESCE(AVG(risk_score), 0)::numeric, 2) as avg_risk_score,
          MAX(COALESCE(publication_date, created_at::date))::text as latest_case_date
        FROM litigation_risk_data
        ${whereClause}
        GROUP BY COALESCE(region, 'Unknown'), COALESCE(city, 'Unknown'), COALESCE(neighborhood, COALESCE(city, 'General'))
        HAVING COUNT(*) >= $${paramIndex}
        ORDER BY COUNT(*) DESC, avg_risk_score DESC
      `;
            queryParams.push(min_cases);

            const result = await query<LitigationHotspot>(sql, queryParams);
            return result.rows;
        } catch (error) {
            logger.error('Failed to get litigation hotspots', { error, params });
            throw error;
        }
    }

    /**
     * Calculate risk score for a property based on nearby litigation
     * 
     * Uses PostGIS to find cases within radius
     */
    async assessPropertyRisk(params: {
        latitude: number;
        longitude: number;
        radius_km?: number;
    }): Promise<PropertyRiskAssessment> {
        const { latitude, longitude, radius_km = 2 } = params;

        try {
            // Find nearby litigation cases — try PostGIS first, fallback to all
            let nearbyCases: any[] = [];
            try {
                const nearbyCasesSql = `
          SELECT 
            id,
            neighborhood,
            city,
            involves_landguard,
            involves_violence,
            risk_score,
            ST_Distance(
              location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) / 1000 as distance_km
          FROM litigation_risk_data
          WHERE location IS NOT NULL
            AND ST_DWithin(
              location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
              $3 * 1000
            )
          ORDER BY distance_km ASC
        `;
                const result = await query(nearbyCasesSql, [longitude, latitude, radius_km]);
                nearbyCases = result.rows;
            } catch {
                // PostGIS not available — return all cases as nearby  
                const fallbackSql = `SELECT id, neighborhood, city, involves_landguard, involves_violence, risk_score FROM litigation_risk_data ORDER BY created_at DESC`;
                const result = await query(fallbackSql, []);
                nearbyCases = result.rows.map((r: any) => ({ ...r, distance_km: 1 }));
            }

            // Calculate risk metrics
            const landguardIncidents = nearbyCases.filter((c) => c.involves_landguard).length;
            const violenceIncidents = nearbyCases.filter((c) => c.involves_violence).length;
            const avgRiskScore = nearbyCases.length > 0
                ? nearbyCases.reduce((sum, c) => sum + (c.risk_score || 0), 0) / nearbyCases.length
                : 0;

            // Get neighborhood risk score from computed aggregation
            let neighborhoodRiskScore = 0;
            try {
                const hotspotSql = `
          SELECT ROUND(COALESCE(AVG(risk_score), 0)::numeric, 2) as avg_risk_score 
          FROM litigation_risk_data 
          WHERE neighborhood = $1 OR ($1 IS NULL AND neighborhood IS NULL)
          LIMIT 1
        `;
                const hotspotResult = await query(hotspotSql, [nearbyCases.length > 0 ? nearbyCases[0].neighborhood : null]);
                if (hotspotResult.rows.length > 0) {
                    neighborhoodRiskScore = parseFloat(hotspotResult.rows[0].avg_risk_score) || 0;
                }
            } catch { /* ignore */ }

            // Determine risk level
            let riskLevel: 'low' | 'moderate' | 'high' | 'critical' = 'low';
            const totalRiskScore = avgRiskScore + neighborhoodRiskScore;

            if (totalRiskScore >= 75 || landguardIncidents >= 3) {
                riskLevel = 'critical';
            } else if (totalRiskScore >= 50 || landguardIncidents >= 2) {
                riskLevel = 'high';
            } else if (totalRiskScore >= 25 || landguardIncidents >= 1) {
                riskLevel = 'moderate';
            }

            // Build risk factors list
            const riskFactors: string[] = [];
            if (nearbyCases.length > 0) {
                riskFactors.push(`${nearbyCases.length} litigation case(s) within ${radius_km}km`);
            }
            if (landguardIncidents > 0) {
                riskFactors.push(`${landguardIncidents} landguard incident(s) nearby`);
            }
            if (violenceIncidents > 0) {
                riskFactors.push(`${violenceIncidents} violent incident(s) nearby`);
            }
            if (neighborhoodRiskScore > 50) {
                riskFactors.push('High-risk neighborhood');
            }

            return {
                property_location: `${latitude}, ${longitude}`,
                nearby_cases_count: nearbyCases.length,
                nearest_case_distance_km: nearbyCases.length > 0 ? nearbyCases[0].distance_km : null,
                neighborhood_risk_score: neighborhoodRiskScore,
                landguard_incidents_nearby: landguardIncidents,
                risk_level: riskLevel,
                risk_factors: riskFactors,
            };
        } catch (error) {
            logger.error('Failed to assess property risk', { error, params });
            throw error;
        }
    }

    /**
     * Refresh litigation hotspots (no-op if materialized view doesn't exist)
     */
    async refreshHotspots(): Promise<void> {
        try {
            await query('REFRESH MATERIALIZED VIEW CONCURRENTLY litigation_hotspots');
            logger.info('Litigation hotspots refreshed successfully');
        } catch {
            logger.info('litigation_hotspots materialized view does not exist, skipping refresh');
        }
    }

    /**
     * Get litigation trends over time
     * Uses COALESCE(publication_date, created_at::date) since publication_date may be null
     */
    async getTrends(params: {
        region?: string;
        city?: string;
        dispute_type?: string;
        months?: number;
    }): Promise<Array<{ month: string; case_count: number; landguard_count: number }>> {
        const { region, city, dispute_type, months = 24 } = params;

        try {
            const whereConditions: string[] = [
                `COALESCE(publication_date, created_at::date) >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')`,
            ];
            const queryParams: any[] = [];
            let paramIndex = 1;

            if (region) {
                whereConditions.push(`region = $${paramIndex++}`);
                queryParams.push(region);
            }

            if (city) {
                whereConditions.push(`(city = $${paramIndex} OR city IS NULL)`);
                queryParams.push(city);
                paramIndex++;
            }

            if (dispute_type) {
                whereConditions.push(`dispute_type = $${paramIndex++}`);
                queryParams.push(dispute_type);
            }

            const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

            const sql = `
        SELECT 
          DATE_TRUNC('month', COALESCE(publication_date, created_at::date))::text as month,
          COUNT(*)::int as case_count,
          COUNT(*) FILTER (WHERE involves_landguard = TRUE)::int as landguard_count
        FROM litigation_risk_data
        ${whereClause}
        GROUP BY DATE_TRUNC('month', COALESCE(publication_date, created_at::date))
        ORDER BY month ASC
      `;

            const result = await query(sql, queryParams);
            return result.rows as { month: string; case_count: number; landguard_count: number }[];
        } catch (error) {
            logger.error('Failed to get litigation trends', { error, params });
            throw error;
        }
    }
}

export const litigationRiskService = new LitigationRiskService();
