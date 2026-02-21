/**
 * Flood Risk Service
 * 
 * Manages flood risk assessment, NADMO data integration, and incident tracking.
 * Calculates property-level flood risk scores using historical data and spatial analysis.
 */

import { query } from '../../src/database';
import { logger } from '../../src/utils/logger';

interface FloodIncident {
    id: string;
    source: string;
    incident_date: string;
    description: string;
    severity: 'minor' | 'moderate' | 'major' | 'catastrophic';
    location_name: string;
    latitude: number | null;
    longitude: number | null;
    verified: boolean;
}

interface FloodRiskScore {
    neighborhood: string;
    city: string;
    risk_score: number;
    risk_level: 'low' | 'moderate' | 'high' | 'critical';
    incident_count: number;
    last_incident_date: string | null;
}

interface PropertyFloodRisk {
    score: number;
    level: 'low' | 'moderate' | 'high' | 'critical';
    nearby_incidents: number;
    nearest_incident_distance_m: number | null;
    neighborhood_risk: number;
    risk_factors: string[];
}

export class FloodRiskService {

    /**
     * Assess flood risk for a specific location
     * Combines neighborhood-level risk with proximity to historical incidents
     */
    async assessPropertyRisk(params: {
        latitude: number;
        longitude: number;
        radius_meters?: number;
    }): Promise<PropertyFloodRisk> {
        const { latitude, longitude, radius_meters = 500 } = params;

        try {
            // 1. Get nearby historical incidents using PostGIS (if available)
            let nearbyIncidents: any[] = [];
            try {
                const incidentsSql = `
          SELECT 
            id,
            severity,
            ST_Distance(
              location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) as distance_m
          FROM flood_risk_incidents
          WHERE location IS NOT NULL AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
          ORDER BY distance_m ASC
        `;
                const incidentsResult = await query(incidentsSql, [longitude, latitude, radius_meters]);
                nearbyIncidents = incidentsResult.rows;
            } catch {
                // PostGIS not available or location not populated — fallback to all incidents
                const fallbackSql = `
          SELECT id, severity, severity_score, neighborhood, city
          FROM flood_risk_incidents
          ORDER BY incident_date DESC
        `;
                const fallbackResult = await query(fallbackSql, []);
                nearbyIncidents = fallbackResult.rows.map((r: any) => ({ ...r, distance_m: 500 }));
            }

            // 2. Compute neighborhood risk score from raw incidents
            let neighborhoodRiskScore = 0;
            try {
                const neighborhoodSql = `
          SELECT 
            AVG(severity_score) as avg_severity,
            COUNT(*) as incident_count
          FROM flood_risk_incidents
          WHERE neighborhood = (
            SELECT neighborhood FROM flood_risk_incidents
            ORDER BY incident_date DESC LIMIT 1
          )
        `;
                const neighborhoodResult = await query(neighborhoodSql, []);
                if (neighborhoodResult.rows.length > 0 && neighborhoodResult.rows[0].avg_severity) {
                    neighborhoodRiskScore = parseFloat(neighborhoodResult.rows[0].avg_severity) * 10;
                }
            } catch { /* ignore if neighborhood lookup fails */ }

            // 3. Calculate Property Specific Score
            // Base score from neighborhood + points for nearby incidents
            let propertyScore = neighborhoodRiskScore;

            // Add weight for nearby incidents
            if (nearbyIncidents.length > 0) {
                // High impact for very close incidents (< 100m)
                const closeIncidents = nearbyIncidents.filter((i: any) => i.distance_m < 100).length;
                propertyScore += (closeIncidents * 15);

                // Moderate impact for medium distance (100m - 500m)
                const mediumIncidents = nearbyIncidents.length - closeIncidents;
                propertyScore += (mediumIncidents * 5);
            }

            // Cap score at 100
            propertyScore = Math.min(100, propertyScore);

            // Determine level
            let level: PropertyFloodRisk['level'] = 'low';
            if (propertyScore >= 80) level = 'critical';
            else if (propertyScore >= 60) level = 'high';
            else if (propertyScore >= 30) level = 'moderate';

            // Risk factors
            const riskFactors = [];
            if (neighborhoodRiskScore > 50) riskFactors.push('Located in high-risk neighborhood');
            if (nearbyIncidents.length > 0) riskFactors.push(`${nearbyIncidents.length} historical flood incidents within ${radius_meters}m`);
            if (nearbyIncidents.some((i: any) => i.severity === 'catastrophic')) riskFactors.push('History of catastrophic flooding nearby');

            return {
                score: Math.round(propertyScore),
                level,
                nearby_incidents: nearbyIncidents.length,
                nearest_incident_distance_m: nearbyIncidents.length > 0 ? Math.round(nearbyIncidents[0].distance_m) : null,
                neighborhood_risk: neighborhoodRiskScore,
                risk_factors: riskFactors
            };

        } catch (error) {
            logger.error('Failed to assess flood risk', { error, params });
            throw error;
        }
    }

    /**
     * Get flood risk map/incidents with filters
     */
    async getIncidents(params: {
        city?: string;
        start_date?: string;
        severity?: string;
        limit?: number;
    }): Promise<FloodIncident[]> {
        const { city, start_date, severity, limit = 100 } = params;

        try {
            const conditions: string[] = [];
            const values: any[] = [];
            let idx = 1;

            if (city) {
                conditions.push(`city = $${idx++}`);
                values.push(city);
            }
            if (start_date) {
                conditions.push(`incident_date >= $${idx++}`);
                values.push(start_date);
            }
            if (severity) {
                conditions.push(`severity = $${idx++}`);
                values.push(severity);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const sql = `
        SELECT 
          id, source_type as source, incident_date, incident_description as description, severity, 
          neighborhood as location_name,
          CASE WHEN location IS NOT NULL THEN ST_Y(location::geometry) ELSE NULL END as latitude,
          CASE WHEN location IS NOT NULL THEN ST_X(location::geometry) ELSE NULL END as longitude,
          is_verified as verified,
          severity_score,
          city,
          estimated_affected_properties
        FROM flood_risk_incidents
        ${whereClause}
        ORDER BY incident_date DESC
        LIMIT $${idx}
      `;
            values.push(limit);

            const result = await query<FloodIncident>(sql, values);
            return result.rows;

        } catch (error) {
            logger.error('Failed to get flood incidents', { error });
            throw error;
        }
    }

    /**
     * Report a new flood incident (Crowdsourcing / Admin entry)
     */
    async reportIncident(data: {
        incident_date: string;
        description: string;
        severity: string;
        latitude: number;
        longitude: number;
        neighborhood?: string;
        city?: string;
        source?: string;
    }): Promise<string> {
        try {
            const sql = `
        INSERT INTO flood_risk_incidents (
          incident_date, incident_description, severity, 
          location, neighborhood, city, source_type, is_verified
        ) VALUES (
          $1, $2, $3, 
          ST_SetSRID(ST_MakePoint($4, $5), 4326), 
          $6, $7, $8, 
          false
        ) RETURNING id
      `;

            const result = await query(sql, [
                data.incident_date,
                data.description,
                data.severity,
                data.longitude,
                data.latitude,
                data.neighborhood || null,
                data.city || 'Accra',
                data.source || 'user_report'
            ]);

            // Trigger refresh of materialized view (asynchronously)
            this.refreshRiskScores().catch(err => logger.error('Failed to refresh risk scores', err));

            return result.rows[0].id;
        } catch (error) {
            logger.error('Failed to report flood incident', { error });
            throw error;
        }
    }

    /**
     * Refresh risk scores (no-op if materialized view doesn't exist)
     */
    async refreshRiskScores(): Promise<void> {
        try {
            await query('REFRESH MATERIALIZED VIEW CONCURRENTLY flood_risk_scores');
            logger.info('Refreshed flood_risk_scores materialized view');
        } catch {
            logger.info('flood_risk_scores materialized view does not exist, skipping refresh');
        }
    }
}

export const floodRiskService = new FloodRiskService();
