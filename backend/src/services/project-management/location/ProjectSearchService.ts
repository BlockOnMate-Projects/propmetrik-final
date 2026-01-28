/**
 * Project Search Service
 * 
 * Phase 3.5: Split projectLocationService
 * 
 * Location-based project search:
 * - Search by region/district/city
 * - Nearby project search (geospatial)
 * - Filter by project attributes
 * 
 * @module services/project-management/location/ProjectSearchService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import {
  ProjectSearchParams,
  ProjectSearchResult,
  NearbyProject,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class ProjectSearchServiceImpl extends BaseService {
  constructor() {
    super('ProjectSearchService');
  }

  /**
   * Search projects with location filters
   */
  async searchProjects(params: ProjectSearchParams): Promise<{
    projects: ProjectSearchResult[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const conditions: string[] = ['p.deleted_at IS NULL'];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Organization filter
    if (params.organizationId) {
      conditions.push(`p.organization_id = $${paramIndex++}`);
      queryParams.push(params.organizationId);
    }

    // Location filters
    if (params.region) {
      conditions.push(`(p.ghana_region ILIKE $${paramIndex} OR p.state_province ILIKE $${paramIndex})`);
      queryParams.push(`%${params.region}%`);
      paramIndex++;
    }

    if (params.district) {
      conditions.push(`p.ghana_district ILIKE $${paramIndex++}`);
      queryParams.push(`%${params.district}%`);
    }

    if (params.city) {
      conditions.push(`p.city ILIKE $${paramIndex++}`);
      queryParams.push(`%${params.city}%`);
    }

    // Type and status
    if (params.projectType) {
      conditions.push(`p.project_type = $${paramIndex++}`);
      queryParams.push(params.projectType);
    }

    if (params.status) {
      conditions.push(`p.status = $${paramIndex++}`);
      queryParams.push(params.status);
    }

    // Text search
    if (params.search) {
      conditions.push(`(
        p.name ILIKE $${paramIndex} OR
        p.description ILIKE $${paramIndex} OR
        p.address_line1 ILIKE $${paramIndex} OR
        p.city ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const offset = (page - 1) * pageSize;

    // Handle geospatial query if coordinates provided
    let distanceSelect = '';
    let distanceOrder = '';
    
    if (params.nearLatitude && params.nearLongitude) {
      const radiusKm = params.radiusKm || 50;
      
      distanceSelect = `, 
        ST_Distance(
          ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography
        ) / 1000 as distance_km`;
      
      queryParams.push(params.nearLongitude, params.nearLatitude);
      paramIndex += 2;
      
      conditions.push(`
        p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND
        ST_DWithin(
          ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint($${paramIndex - 2}, $${paramIndex - 1}), 4326)::geography,
          $${paramIndex++} * 1000
        )
      `);
      queryParams.push(radiusKm);
      
      distanceOrder = 'ORDER BY distance_km ASC';
    } else {
      distanceOrder = 'ORDER BY p.created_at DESC';
    }

    // Get projects with unit counts
    const dataQuery = `
      SELECT 
        p.id,
        p.name,
        p.project_type,
        p.status,
        COALESCE(p.address_line1, '') as address,
        COALESCE(p.city, '') as city,
        COALESCE(p.ghana_region, p.state_province, '') as region,
        p.ghana_district as district,
        p.latitude,
        p.longitude,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) as unit_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.sales_status = 'available') as available_units,
        (SELECT MIN(u.base_price) FROM project_units u WHERE u.project_id = p.id) as min_price,
        (SELECT MAX(u.base_price) FROM project_units u WHERE u.project_id = p.id) as max_price,
        p.display_currency
        ${distanceSelect}
      FROM development_projects p
      WHERE ${whereClause}
      ${distanceOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM development_projects p
      WHERE ${whereClause}
    `;

    queryParams.push(pageSize, offset);

    const [dataResult, countResult] = await Promise.all([
      this.query(dataQuery, queryParams),
      this.query(countQuery, queryParams.slice(0, -2)), // Exclude limit/offset for count
    ]);

    return {
      projects: dataResult.rows.map(row => this.mapSearchResult(row)),
      total: parseInt(countResult.rows[0].total, 10),
      page,
      pageSize,
    };
  }

  /**
   * Find projects near a given location
   */
  async findNearbyProjects(
    latitude: number,
    longitude: number,
    radiusKm: number = 10,
    excludeProjectId?: string
  ): Promise<NearbyProject[]> {
    const params: any[] = [longitude, latitude, radiusKm * 1000];
    let excludeClause = '';
    
    if (excludeProjectId) {
      excludeClause = 'AND p.id != $4';
      params.push(excludeProjectId);
    }

    const result = await this.query(
      `SELECT 
         p.id,
         p.name,
         p.project_type,
         COALESCE(p.address_line1, '') as address,
         ST_Distance(
           ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         ) / 1000 as distance_km
       FROM development_projects p
       WHERE p.latitude IS NOT NULL 
         AND p.longitude IS NOT NULL
         AND p.deleted_at IS NULL
         AND ST_DWithin(
           ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
         ${excludeClause}
       ORDER BY distance_km ASC
       LIMIT 20`,
      params
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      projectType: row.project_type,
      distanceKm: parseFloat(row.distance_km),
      address: row.address,
    }));
  }

  /**
   * Get projects by region
   */
  async getProjectsByRegion(
    organizationId: string,
    region: string
  ): Promise<ProjectSearchResult[]> {
    const result = await this.query(
      `SELECT 
         p.id,
         p.name,
         p.project_type,
         p.status,
         COALESCE(p.address_line1, '') as address,
         COALESCE(p.city, '') as city,
         COALESCE(p.ghana_region, p.state_province, '') as region,
         p.ghana_district as district,
         p.latitude,
         p.longitude,
         (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) as unit_count,
         (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.sales_status = 'available') as available_units
       FROM development_projects p
       WHERE p.organization_id = $1 
         AND (p.ghana_region ILIKE $2 OR p.state_province ILIKE $2)
         AND p.deleted_at IS NULL
       ORDER BY p.name`,
      [organizationId, `%${region}%`]
    );

    return result.rows.map(row => this.mapSearchResult(row));
  }

  /**
   * Get projects by district
   */
  async getProjectsByDistrict(
    organizationId: string,
    district: string
  ): Promise<ProjectSearchResult[]> {
    const result = await this.query(
      `SELECT 
         p.id,
         p.name,
         p.project_type,
         p.status,
         COALESCE(p.address_line1, '') as address,
         COALESCE(p.city, '') as city,
         COALESCE(p.ghana_region, p.state_province, '') as region,
         p.ghana_district as district,
         p.latitude,
         p.longitude
       FROM development_projects p
       WHERE p.organization_id = $1 
         AND p.ghana_district ILIKE $2
         AND p.deleted_at IS NULL
       ORDER BY p.name`,
      [organizationId, `%${district}%`]
    );

    return result.rows.map(row => this.mapSearchResult(row));
  }

  /**
   * Get location statistics for an organization
   */
  async getLocationStats(organizationId: string): Promise<{
    totalProjects: number;
    byRegion: Array<{ region: string; count: number }>;
    byDistrict: Array<{ district: string; region: string; count: number }>;
    withCoordinates: number;
    withGhanaPostGPS: number;
  }> {
    const [totalResult, regionResult, districtResult, coordResult, gpsResult] = await Promise.all([
      this.query(
        `SELECT COUNT(*) as total FROM development_projects WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      ),
      this.query(
        `SELECT COALESCE(ghana_region, state_province, 'Unknown') as region, COUNT(*) as count
         FROM development_projects
         WHERE organization_id = $1 AND deleted_at IS NULL
         GROUP BY COALESCE(ghana_region, state_province, 'Unknown')
         ORDER BY count DESC`,
        [organizationId]
      ),
      this.query(
        `SELECT ghana_district as district, COALESCE(ghana_region, 'Unknown') as region, COUNT(*) as count
         FROM development_projects
         WHERE organization_id = $1 AND ghana_district IS NOT NULL AND deleted_at IS NULL
         GROUP BY ghana_district, COALESCE(ghana_region, 'Unknown')
         ORDER BY count DESC`,
        [organizationId]
      ),
      this.query(
        `SELECT COUNT(*) as count FROM development_projects 
         WHERE organization_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL`,
        [organizationId]
      ),
      this.query(
        `SELECT COUNT(*) as count FROM development_projects 
         WHERE organization_id = $1 AND ghana_post_gps IS NOT NULL AND deleted_at IS NULL`,
        [organizationId]
      ),
    ]);

    return {
      totalProjects: parseInt(totalResult.rows[0].total, 10),
      byRegion: regionResult.rows.map(row => ({
        region: row.region,
        count: parseInt(row.count, 10),
      })),
      byDistrict: districtResult.rows.map(row => ({
        district: row.district,
        region: row.region,
        count: parseInt(row.count, 10),
      })),
      withCoordinates: parseInt(coordResult.rows[0].count, 10),
      withGhanaPostGPS: parseInt(gpsResult.rows[0].count, 10),
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private mapSearchResult(row: any): ProjectSearchResult {
    return {
      id: row.id,
      name: row.name,
      projectType: row.project_type,
      status: row.status,
      address: row.address,
      city: row.city,
      region: row.region,
      district: row.district,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceKm: row.distance_km ? parseFloat(row.distance_km) : undefined,
      unitCount: row.unit_count ? parseInt(row.unit_count, 10) : undefined,
      availableUnits: row.available_units ? parseInt(row.available_units, 10) : undefined,
      priceRange: row.min_price ? {
        min: parseFloat(row.min_price),
        max: parseFloat(row.max_price),
        currency: row.display_currency || 'GHS',
      } : undefined,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const projectSearchService = new ProjectSearchServiceImpl();
