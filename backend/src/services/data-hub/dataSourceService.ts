/**
 * Data Sources Service
 * Manages external and internal data sources for the Data Hub
 */

import { query, transaction } from '../../database';
import { logger } from '../../utils/logger';
import {
  DataSource,
  CreateDataSourceInput,
  UpdateDataSourceInput,
  DataSourceFilters,
  PaginatedResult,
} from './types';

export class DataSourceService {
  /**
   * Get all data sources with optional filtering and pagination
   */
  async findAll(filters: DataSourceFilters = {}): Promise<PaginatedResult<DataSource>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      tier,
      is_active,
      is_paused,
      search,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (tier) {
      conditions.push(`tier = $${paramIndex++}`);
      params.push(tier);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    if (is_paused !== undefined) {
      conditions.push(`is_paused = $${paramIndex++}`);
      params.push(is_paused);
    }
    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Validate sort column to prevent SQL injection
    const validSortColumns = ['name', 'tier', 'trust_score', 'created_at', 'last_sync_at'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM data_sources ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data
    const dataResult = await query<DataSource>(
      `SELECT * FROM data_sources ${whereClause}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  /**
   * Get a single data source by ID
   */
  async findById(id: string): Promise<DataSource | null> {
    const result = await query<DataSource>(
      'SELECT * FROM data_sources WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get a single data source by slug
   */
  async findBySlug(slug: string): Promise<DataSource | null> {
    const result = await query<DataSource>(
      'SELECT * FROM data_sources WHERE slug = $1',
      [slug]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new data source
   */
  async create(input: CreateDataSourceInput): Promise<DataSource> {
    const {
      name,
      slug,
      description,
      tier,
      trust_score = 0.5,
      api_endpoint,
      credentials_ref,
      auth_type,
      sync_frequency = 'daily',
      spider_config = {},
      rate_limit_requests_per_minute = 10,
      regions_covered = [],
      metadata = {},
      created_by,
    } = input;

    const result = await query<DataSource>(
      `INSERT INTO data_sources (
        name, slug, description, tier, trust_score,
        api_endpoint, credentials_ref, auth_type,
        sync_frequency, spider_config, rate_limit_requests_per_minute,
        regions_covered, metadata, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14
      ) RETURNING *`,
      [
        name, slug, description, tier, trust_score,
        api_endpoint, credentials_ref, auth_type,
        sync_frequency, JSON.stringify(spider_config), rate_limit_requests_per_minute,
        regions_covered, JSON.stringify(metadata), created_by,
      ]
    );

    logger.info('Created new data source', { id: result.rows[0].id, name, tier });
    return result.rows[0];
  }

  /**
   * Update a data source
   */
  async update(id: string, input: UpdateDataSourceInput): Promise<DataSource | null> {
    // Build dynamic UPDATE query
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateDataSourceInput)[] = [
      'name', 'description', 'trust_score', 'api_endpoint',
      'credentials_ref', 'auth_type', 'sync_frequency',
      'spider_config', 'rate_limit_requests_per_minute',
      'regions_covered', 'is_active', 'is_paused', 'pause_reason', 'metadata'
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        const value = field === 'spider_config' || field === 'metadata'
          ? JSON.stringify(input[field])
          : input[field];
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const result = await query<DataSource>(
      `UPDATE data_sources 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      params
    );

    if (result.rows[0]) {
      logger.info('Updated data source', { id, updates: Object.keys(input) });
    }

    return result.rows[0] || null;
  }

  /**
   * Delete a data source
   */
  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM data_sources WHERE id = $1',
      [id]
    );
    
    if (result.rowCount && result.rowCount > 0) {
      logger.info('Deleted data source', { id });
      return true;
    }
    return false;
  }

  /**
   * Update sync status after a job completes
   */
  async updateSyncStatus(
    id: string,
    status: 'completed' | 'failed',
    stats?: {
      records_synced?: number;
      properties_added?: number;
      properties_updated?: number;
      errors?: number;
    }
  ): Promise<void> {
    const updates = ['last_sync_at = NOW()', `last_sync_status = $1`];
    const params: unknown[] = [status];
    let paramIndex = 2;

    if (stats) {
      if (stats.records_synced !== undefined) {
        updates.push(`total_records_synced = total_records_synced + $${paramIndex++}`);
        params.push(stats.records_synced);
      }
      if (stats.properties_added !== undefined) {
        updates.push(`total_properties_added = total_properties_added + $${paramIndex++}`);
        params.push(stats.properties_added);
      }
      if (stats.properties_updated !== undefined) {
        updates.push(`total_properties_updated = total_properties_updated + $${paramIndex++}`);
        params.push(stats.properties_updated);
      }
      if (stats.errors !== undefined) {
        updates.push(`total_errors = total_errors + $${paramIndex++}`);
        params.push(stats.errors);
      }
    }

    params.push(id);
    await query(
      `UPDATE data_sources SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  }

  /**
   * Get data sources due for sync
   */
  async getDueForSync(): Promise<DataSource[]> {
    const result = await query<DataSource>(
      `SELECT * FROM data_sources 
       WHERE is_active = true 
         AND is_paused = false 
         AND (next_sync_at IS NULL OR next_sync_at <= NOW())
       ORDER BY next_sync_at ASC NULLS FIRST`
    );
    return result.rows;
  }

  /**
   * Schedule next sync for a data source
   */
  async scheduleNextSync(id: string): Promise<void> {
    await query(
      `UPDATE data_sources 
       SET next_sync_at = CASE sync_frequency
         WHEN 'realtime' THEN NOW() + INTERVAL '1 minute'
         WHEN 'hourly' THEN NOW() + INTERVAL '1 hour'
         WHEN 'daily' THEN NOW() + INTERVAL '1 day'
         WHEN 'weekly' THEN NOW() + INTERVAL '1 week'
         WHEN 'monthly' THEN NOW() + INTERVAL '1 month'
         ELSE NULL
       END
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Get statistics by tier
   */
  async getStatsByTier(): Promise<Array<{
    tier: string;
    count: number;
    active: number;
    total_properties: number;
    avg_trust_score: number;
  }>> {
    const result = await query<{
      tier: string;
      count: string;
      active: string;
      total_records: string;
      total_properties: string;
      avg_trust_score: string;
    }>(
      `SELECT
         ds.tier,
         COUNT(DISTINCT ds.id) as count,
         SUM(CASE WHEN ds.is_active THEN 1 ELSE 0 END) as active,
         GREATEST(
           COALESCE(SUM(ds.total_records_synced), 0),
           COALESCE(pc.prop_count, 0)
         ) as total_records,
         COALESCE(pc.prop_count, 0) as total_properties,
         AVG(ds.trust_score) as avg_trust_score
       FROM data_sources ds
       LEFT JOIN (
         SELECT
           CASE data_source
             WHEN 'tier1_government' THEN 'tier1_government'
             WHEN 'tier2_financial' THEN 'tier2_financial'
             WHEN 'tier3_partner' THEN 'tier3_partners'
             WHEN 'tier4_user' THEN 'tier3b_user_generated'
             WHEN 'tier5_web' THEN 'tier5_public_web'
             WHEN 'manual_entry' THEN 'tier3b_user_generated'
             ELSE 'tier5_public_web'
           END as tier,
           COUNT(*) as prop_count
         FROM properties
         GROUP BY 1
       ) pc ON ds.tier::text = pc.tier
       GROUP BY ds.tier, pc.prop_count
       ORDER BY ds.tier`
    );

    return result.rows.map(row => ({
      tier: row.tier,
      count: parseInt(row.count, 10),
      active: parseInt(row.active, 10),
      total_records: parseInt(row.total_records || '0', 10),
      total_properties: parseInt(row.total_properties || '0', 10),
      avg_trust_score: parseFloat(row.avg_trust_score || '0'),
    }));
  }
}

export const dataSourceService = new DataSourceService();
