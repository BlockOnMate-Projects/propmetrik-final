/**
 * Punch List Service
 * Phase 5.8 Week 5 - Unit Handover Punch Lists
 *
 * Manages punch list items for unit quality control and handover.
 * Tracks defects, repairs, and completion status with photo evidence.
 *
 * NOTE: Aligned with actual punch_list_items table schema.
 * DB columns: id, project_id, unit_id, organization_id, item_number,
 *   category, location, description (title/main text), priority,
 *   assigned_to, assigned_contractor_name, status, identified_at,
 *   identified_by, due_date, started_at, completed_at, completed_by,
 *   verified_at, verified_by, photos_before (jsonb), photos_after (jsonb),
 *   notes (secondary description), resolution_notes, created_by, updated_by,
 *   created_at, updated_at
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { BaseService } from '../../../shared-services/base/BaseService';

// =====================================================
// TYPES
// =====================================================

export type PunchItemStatus =
  | 'open'
  | 'in_progress'
  | 'ready_for_review'
  | 'completed'
  | 'verified'
  | 'rejected'
  | 'deferred';

export type PunchItemPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export interface PunchListItem {
  id: string;
  project_id: string;
  unit_id?: string;
  organization_id: string;
  project_name?: string;
  unit_number?: string;

  // Item details
  item_number: number;
  title: string;         // maps from DB 'description' column
  description?: string;  // maps from DB 'notes' column
  location?: string;
  category?: string;
  priority: PunchItemPriority;
  status: PunchItemStatus;

  // Assignment
  assigned_to?: string;
  assigned_contractor_name?: string;
  due_date?: Date;

  // Timeline
  identified_at?: Date;
  identified_by?: string;
  started_at?: Date;
  completed_at?: Date;
  completed_by?: string;
  verified_at?: Date;
  verified_by?: string;
  resolution_notes?: string;

  // Photos (JSONB)
  photos_before: any[];
  photos_after: any[];

  // Audit
  created_by?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePunchItemInput {
  project_id: string;
  unit_id?: string;
  organization_id: string;
  title: string;          // will be stored as DB 'description'
  description?: string;   // will be stored as DB 'notes'
  location?: string;
  category?: string;
  priority?: PunchItemPriority;
  assigned_to?: string;
  assigned_contractor_name?: string;
  due_date?: string | Date;
  created_by?: string;
}

export interface UpdatePunchItemInput {
  title?: string;
  description?: string;
  location?: string;
  category?: string;
  priority?: PunchItemPriority;
  assigned_to?: string;
  assigned_contractor_name?: string;
  due_date?: string | Date;
  status?: PunchItemStatus;
  resolution_notes?: string;
}

export interface PunchListFilters {
  unit_id?: string;
  project_id?: string;
  status?: PunchItemStatus | PunchItemStatus[];
  priority?: PunchItemPriority;
  category?: string;
  assigned_to?: string;
  is_overdue?: boolean;
}

export interface PunchListSummary {
  organization_id: string;
  project_id?: string;
  unit_id?: string;
  total_items: number;
  open_items: number;
  in_progress_items: number;
  completed_items: number;
  verified_items: number;
  deferred_items: number;
  overdue_items: number;
  completion_rate: number;
  by_category: { category: string; count: number }[];
  by_priority: { priority: PunchItemPriority; count: number }[];
}

// =====================================================
// PUNCH LIST SERVICE CLASS
// =====================================================

class PunchListService extends BaseService {
  constructor() {
    super('PunchListService');
  }

  // =====================================================
  // CRUD OPERATIONS
  // =====================================================

  /**
   * Create a new punch list item
   */
  async create(input: CreatePunchItemInput): Promise<PunchListItem> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get next item number for the project
      const countResult = await client.query(`
        SELECT COALESCE(MAX(item_number), 0) + 1 as next_number
        FROM punch_list_items
        WHERE project_id = $1
      `, [input.project_id]);
      const itemNumber = parseInt(countResult.rows[0].next_number);

      // Create item — map title→description, description→notes
      const result = await client.query(`
        INSERT INTO punch_list_items (
          project_id, unit_id, organization_id, item_number,
          description, notes, location, category, priority, status,
          assigned_to, assigned_contractor_name, due_date, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, $12, $13)
        RETURNING *
      `, [
        input.project_id,
        input.unit_id || null,
        input.organization_id,
        itemNumber,
        input.title,              // frontend 'title' → DB 'description'
        input.description || null, // frontend 'description' → DB 'notes'
        input.location || null,
        input.category || null,
        input.priority || 'medium',
        input.assigned_to || null,
        input.assigned_contractor_name || null,
        input.due_date || null,
        input.created_by || null
      ]);

      await client.query('COMMIT');

      logger.info({ itemId: result.rows[0].id, projectId: input.project_id }, 'Punch list item created');

      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, input }, 'Failed to create punch list item');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get punch list item by ID
   */
  async getById(id: string): Promise<PunchListItem | null> {
    const result = await pool.query(`
      SELECT pli.*,
             dp.project_name
      FROM punch_list_items pli
      LEFT JOIN development_projects dp ON pli.project_id = dp.id
      WHERE pli.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all punch list items with filters
   */
  async getAll(
    organizationId: string,
    filters?: PunchListFilters,
    page = 1,
    limit = 50
  ): Promise<{
    data: PunchListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const conditions: string[] = ['pli.organization_id = $1'];
    const params: any[] = [organizationId];
    let paramCount = 1;

    if (filters?.project_id) {
      conditions.push(`pli.project_id = $${++paramCount}`);
      params.push(filters.project_id);
    }

    if (filters?.unit_id) {
      conditions.push(`pli.unit_id = $${++paramCount}`);
      params.push(filters.unit_id);
    }

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`pli.status = ANY($${++paramCount})`);
        params.push(filters.status);
      } else {
        conditions.push(`pli.status = $${++paramCount}`);
        params.push(filters.status);
      }
    }

    if (filters?.priority) {
      conditions.push(`pli.priority = $${++paramCount}`);
      params.push(filters.priority);
    }

    if (filters?.category) {
      conditions.push(`pli.category = $${++paramCount}`);
      params.push(filters.category);
    }

    if (filters?.assigned_to) {
      conditions.push(`pli.assigned_to = $${++paramCount}`);
      params.push(filters.assigned_to);
    }

    if (filters?.is_overdue) {
      conditions.push(`pli.due_date < NOW() AND pli.status NOT IN ('completed', 'verified', 'deferred')`);
    }

    const whereClause = conditions.join(' AND ');

    // Count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM punch_list_items pli
      WHERE ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);

    // Get data
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT pli.*,
             dp.project_name
      FROM punch_list_items pli
      LEFT JOIN development_projects dp ON pli.project_id = dp.id
      WHERE ${whereClause}
      ORDER BY
        CASE pli.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        pli.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, [...params, limit, offset]);

    return {
      data: result.rows.map(row => this.mapRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get punch list for a specific unit
   */
  async getByUnit(unitId: string): Promise<PunchListItem[]> {
    const result = await pool.query(`
      SELECT pli.*,
             dp.project_name
      FROM punch_list_items pli
      LEFT JOIN development_projects dp ON pli.project_id = dp.id
      WHERE pli.unit_id = $1
      ORDER BY pli.item_number ASC
    `, [unitId]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Update punch list item
   */
  async update(id: string, input: UpdatePunchItemInput): Promise<PunchListItem | null> {
    const item = await this.getById(id);
    if (!item) {
      return null;
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramCount = 0;

    // frontend 'title' → DB 'description'
    if (input.title !== undefined) {
      updates.push(`description = $${++paramCount}`);
      params.push(input.title);
    }

    // frontend 'description' → DB 'notes'
    if (input.description !== undefined) {
      updates.push(`notes = $${++paramCount}`);
      params.push(input.description);
    }

    if (input.location !== undefined) {
      updates.push(`location = $${++paramCount}`);
      params.push(input.location);
    }

    if (input.category !== undefined) {
      updates.push(`category = $${++paramCount}`);
      params.push(input.category);
    }

    if (input.priority !== undefined) {
      updates.push(`priority = $${++paramCount}`);
      params.push(input.priority);
    }

    if (input.assigned_to !== undefined) {
      updates.push(`assigned_to = $${++paramCount}`);
      params.push(input.assigned_to);
    }

    if (input.assigned_contractor_name !== undefined) {
      updates.push(`assigned_contractor_name = $${++paramCount}`);
      params.push(input.assigned_contractor_name);
    }

    if (input.due_date !== undefined) {
      updates.push(`due_date = $${++paramCount}`);
      params.push(input.due_date);
    }

    if (input.status !== undefined) {
      updates.push(`status = $${++paramCount}`);
      params.push(input.status);

      // Auto-set timestamps based on status transitions
      if (input.status === 'in_progress' && item.status === 'open') {
        updates.push(`started_at = NOW()`);
      }
      if (input.status === 'completed') {
        updates.push(`completed_at = NOW()`);
      }
      if (input.status === 'verified') {
        updates.push(`verified_at = NOW()`);
      }
    }

    if (input.resolution_notes !== undefined) {
      updates.push(`resolution_notes = $${++paramCount}`);
      params.push(input.resolution_notes);
    }

    if (params.length === 0) {
      return item;
    }

    params.push(id);

    await pool.query(`
      UPDATE punch_list_items
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
    `, params);

    logger.info({ itemId: id }, 'Punch list item updated');

    return this.getById(id);
  }

  /**
   * Delete punch list item (hard delete — no deleted_at column)
   */
  async delete(id: string): Promise<boolean> {
    const result = await pool.query(`
      DELETE FROM punch_list_items
      WHERE id = $1
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // WORKFLOW OPERATIONS
  // =====================================================

  /**
   * Assign item to contractor
   */
  async assign(id: string, assignedTo: string, dueDate?: Date): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET assigned_to = $2,
          due_date = COALESCE($3, due_date),
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          started_at = CASE WHEN status = 'open' THEN NOW() ELSE started_at END,
          updated_at = NOW()
      WHERE id = $1
    `, [id, assignedTo, dueDate]);

    logger.info({ itemId: id, assignedTo }, 'Punch list item assigned');

    return this.getById(id);
  }

  /**
   * Start work on item
   */
  async startWork(id: string): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET status = 'in_progress',
          started_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND status = 'open'
    `, [id]);

    return this.getById(id);
  }

  /**
   * Mark item as completed
   */
  async complete(id: string, completedBy: string, notes?: string): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET status = 'completed',
          completed_at = NOW(),
          completed_by = $2,
          resolution_notes = COALESCE($3, resolution_notes),
          updated_at = NOW()
      WHERE id = $1 AND status IN ('open', 'in_progress', 'ready_for_review')
    `, [id, completedBy, notes]);

    logger.info({ itemId: id, completedBy }, 'Punch list item completed');

    return this.getById(id);
  }

  /**
   * Verify completed item
   */
  async verify(id: string, verifiedBy: string): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET status = 'verified',
          verified_at = NOW(),
          verified_by = $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'completed'
    `, [id, verifiedBy]);

    logger.info({ itemId: id, verifiedBy }, 'Punch list item verified');

    return this.getById(id);
  }

  /**
   * Reject verification (reopen item)
   */
  async rejectVerification(id: string, reason: string): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET status = 'in_progress',
          completed_at = NULL,
          completed_by = NULL,
          resolution_notes = COALESCE(resolution_notes || E'\nRejected: ', '') || $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'completed'
    `, [id, reason]);

    logger.info({ itemId: id, reason }, 'Punch list item verification rejected');

    return this.getById(id);
  }

  /**
   * Defer item
   */
  async defer(id: string, reason: string): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET status = 'deferred',
          resolution_notes = COALESCE(resolution_notes || E'\n', '') || 'Deferred: ' || $2,
          updated_at = NOW()
      WHERE id = $1
    `, [id, reason]);

    logger.info({ itemId: id, reason }, 'Punch list item deferred');

    return this.getById(id);
  }

  // =====================================================
  // ANALYTICS & SUMMARY
  // =====================================================

  /**
   * Get punch list summary
   */
  async getSummary(
    organizationId: string,
    projectId?: string,
    unitId?: string
  ): Promise<PunchListSummary> {
    const conditions: string[] = ['pli.organization_id = $1'];
    const params: any[] = [organizationId];
    let paramCount = 1;

    if (projectId) {
      conditions.push(`pli.project_id = $${++paramCount}`);
      params.push(projectId);
    }

    if (unitId) {
      conditions.push(`pli.unit_id = $${++paramCount}`);
      params.push(unitId);
    }

    const whereClause = conditions.join(' AND ');

    // Get counts by status
    const statusResult = await pool.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_items,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_items,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_items,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_items,
        COUNT(CASE WHEN status = 'deferred' THEN 1 END) as deferred_items,
        COUNT(CASE WHEN due_date < NOW() AND status NOT IN ('completed', 'verified', 'deferred') THEN 1 END) as overdue_items
      FROM punch_list_items pli
      WHERE ${whereClause}
    `, params);

    const stats = statusResult.rows[0];
    const totalItems = parseInt(stats.total_items) || 0;
    const completedItems = (parseInt(stats.completed_items) || 0) + (parseInt(stats.verified_items) || 0);

    // Get counts by category
    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM punch_list_items pli
      WHERE ${whereClause}
      GROUP BY category
      ORDER BY count DESC
    `, params);

    // Get counts by priority
    const priorityResult = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM punch_list_items pli
      WHERE ${whereClause}
      GROUP BY priority
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `, params);

    return {
      organization_id: organizationId,
      project_id: projectId,
      unit_id: unitId,
      total_items: totalItems,
      open_items: parseInt(stats.open_items) || 0,
      in_progress_items: parseInt(stats.in_progress_items) || 0,
      completed_items: parseInt(stats.completed_items) || 0,
      verified_items: parseInt(stats.verified_items) || 0,
      deferred_items: parseInt(stats.deferred_items) || 0,
      overdue_items: parseInt(stats.overdue_items) || 0,
      completion_rate: totalItems > 0 ? (completedItems / totalItems) * 100 : 0,
      by_category: categoryResult.rows.map(row => ({
        category: row.category,
        count: parseInt(row.count)
      })),
      by_priority: priorityResult.rows.map(row => ({
        priority: row.priority,
        count: parseInt(row.count)
      })),
    };
  }

  /**
   * Check if unit is ready for handover
   */
  async isUnitReadyForHandover(unitId: string): Promise<{
    ready: boolean;
    openItems: number;
    criticalItems: number;
    message: string;
  }> {
    const result = await pool.query(`
      SELECT
        COUNT(*) as open_items,
        COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical_items
      FROM punch_list_items
      WHERE unit_id = $1
        AND status NOT IN ('completed', 'verified', 'deferred')
    `, [unitId]);

    const openItems = parseInt(result.rows[0].open_items) || 0;
    const criticalItems = parseInt(result.rows[0].critical_items) || 0;

    const ready = openItems === 0;
    let message: string;

    if (ready) {
      message = 'Unit is ready for handover. All punch list items have been resolved.';
    } else if (criticalItems > 0) {
      message = `Cannot handover: ${criticalItems} critical item(s) and ${openItems - criticalItems} other item(s) pending.`;
    } else {
      message = `${openItems} punch list item(s) still pending. Consider resolving before handover.`;
    }

    return { ready, openItems, criticalItems, message };
  }

  // =====================================================
  // BULK OPERATIONS
  // =====================================================

  /**
   * Create multiple punch list items at once
   */
  async createBulk(items: CreatePunchItemInput[]): Promise<PunchListItem[]> {
    const client = await pool.connect();
    const created: PunchListItem[] = [];

    try {
      await client.query('BEGIN');

      for (const input of items) {
        const countResult = await client.query(`
          SELECT COALESCE(MAX(item_number), 0) + 1 as next_number
          FROM punch_list_items
          WHERE project_id = $1
        `, [input.project_id]);
        const itemNumber = parseInt(countResult.rows[0].next_number);

        const result = await client.query(`
          INSERT INTO punch_list_items (
            project_id, unit_id, organization_id, item_number,
            description, notes, location, category, priority, status,
            assigned_to, assigned_contractor_name, due_date, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, $12, $13)
          RETURNING *
        `, [
          input.project_id,
          input.unit_id || null,
          input.organization_id,
          itemNumber,
          input.title,
          input.description || null,
          input.location || null,
          input.category || null,
          input.priority || 'medium',
          input.assigned_to || null,
          input.assigned_contractor_name || null,
          input.due_date || null,
          input.created_by || null
        ]);

        created.push(this.mapRow(result.rows[0]));
      }

      await client.query('COMMIT');

      logger.info({ count: created.length }, 'Bulk punch list items created');

      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Failed to create bulk punch list items');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete all items for a unit
   */
  async completeAllForUnit(unitId: string, completedBy: string): Promise<number> {
    const result = await pool.query(`
      UPDATE punch_list_items
      SET status = 'completed',
          completed_at = NOW(),
          completed_by = $2,
          updated_at = NOW()
      WHERE unit_id = $1
        AND status IN ('open', 'in_progress')
    `, [unitId, completedBy]);

    logger.info({ unitId, count: result.rowCount }, 'All punch list items completed for unit');

    return result.rowCount ?? 0;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Maps a DB row to a PunchListItem.
   * DB 'description' → 'title', DB 'notes' → 'description'
   */
  protected mapRow(row: any): PunchListItem {
    return {
      id: row.id,
      project_id: row.project_id,
      unit_id: row.unit_id,
      organization_id: row.organization_id,
      project_name: row.project_name,
      unit_number: row.unit_number,
      item_number: parseInt(row.item_number) || 0,
      title: row.description || '',       // DB 'description' → 'title'
      description: row.notes || undefined, // DB 'notes' → 'description'
      location: row.location,
      category: row.category,
      priority: row.priority || 'medium',
      status: row.status || 'open',
      assigned_to: row.assigned_to,
      assigned_contractor_name: row.assigned_contractor_name,
      due_date: row.due_date,
      identified_at: row.identified_at,
      identified_by: row.identified_by,
      started_at: row.started_at,
      completed_at: row.completed_at,
      completed_by: row.completed_by,
      verified_at: row.verified_at,
      verified_by: row.verified_by,
      resolution_notes: row.resolution_notes,
      photos_before: row.photos_before || [],
      photos_after: row.photos_after || [],
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Convert a PunchListItem to camelCase for frontend consumption
   */
  static toCamelCase(item: PunchListItem): Record<string, any> {
    return {
      id: item.id,
      projectId: item.project_id,
      unitId: item.unit_id,
      organizationId: item.organization_id,
      projectName: item.project_name,
      unitNumber: item.unit_number,
      itemNumber: item.item_number,
      title: item.title,
      description: item.description,
      location: item.location,
      category: item.category,
      priority: item.priority,
      status: item.status,
      assignedTo: item.assigned_to,
      assignedToName: item.assigned_contractor_name,
      dueDate: item.due_date,
      identifiedAt: item.identified_at,
      startedAt: item.started_at,
      completedAt: item.completed_at,
      completedBy: item.completed_by,
      verifiedAt: item.verified_at,
      verifiedBy: item.verified_by,
      resolutionNotes: item.resolution_notes,
      photosBefore: item.photos_before,
      photosAfter: item.photos_after,
      createdBy: item.created_by,
      createdByName: null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }
}

export { PunchListService };
export const punchListService = new PunchListService();
export default punchListService;
