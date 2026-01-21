/**
 * Punch List Service
 * Phase 5.8 Week 5 - Unit Handover Punch Lists
 * 
 * Manages punch list items for unit quality control and handover.
 * Tracks defects, repairs, and completion status with photo evidence.
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';

// =====================================================
// TYPES
// =====================================================

export type PunchItemStatus = 
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'verified'
  | 'deferred';

export type PunchItemPriority = 
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export type PunchItemCategory = 
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'painting'
  | 'flooring'
  | 'carpentry'
  | 'fixtures'
  | 'appliances'
  | 'windows_doors'
  | 'exterior'
  | 'landscaping'
  | 'cleaning'
  | 'other';

export interface PunchListPhoto {
  id: string;
  punch_item_id: string;
  photo_url: string;
  photo_type: 'before' | 'after' | 'progress';
  caption?: string;
  taken_at: Date;
  taken_by?: string;
  created_at: Date;
}

export interface PunchListItem {
  id: string;
  unit_id: string;
  organization_id: string;
  project_id?: string;
  unit_number?: string;
  project_name?: string;
  
  // Item details
  item_number: number;
  title: string;
  description?: string;
  location: string; // e.g., "Master Bedroom - North Wall"
  category: PunchItemCategory;
  priority: PunchItemPriority;
  status: PunchItemStatus;
  
  // Assignment
  assigned_contractor_id?: string;
  contractor_name?: string;
  assigned_date?: Date;
  due_date?: Date;
  
  // Resolution
  completed_date?: Date;
  completed_by?: string;
  verified_by?: string;
  verified_date?: Date;
  resolution_notes?: string;
  
  // Photos
  before_photos: PunchListPhoto[];
  after_photos: PunchListPhoto[];
  
  // Audit
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePunchItemInput {
  unit_id: string;
  organization_id: string;
  title: string;
  description?: string;
  location: string;
  category: PunchItemCategory;
  priority?: PunchItemPriority;
  assigned_contractor_id?: string;
  due_date?: Date;
  created_by?: string;
}

export interface UpdatePunchItemInput {
  title?: string;
  description?: string;
  location?: string;
  category?: PunchItemCategory;
  priority?: PunchItemPriority;
  assigned_contractor_id?: string;
  due_date?: Date;
  status?: PunchItemStatus;
  resolution_notes?: string;
}

export interface PunchListFilters {
  unit_id?: string;
  project_id?: string;
  status?: PunchItemStatus | PunchItemStatus[];
  priority?: PunchItemPriority;
  category?: PunchItemCategory;
  assigned_contractor_id?: string;
  created_after?: Date;
  created_before?: Date;
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
  by_category: { category: PunchItemCategory; count: number }[];
  by_priority: { priority: PunchItemPriority; count: number }[];
  by_contractor: { contractor_id: string; contractor_name: string; count: number }[];
}

// =====================================================
// PUNCH LIST SERVICE CLASS
// =====================================================

class PunchListService {
  private static instance: PunchListService;

  private constructor() {}

  public static getInstance(): PunchListService {
    if (!PunchListService.instance) {
      PunchListService.instance = new PunchListService();
    }
    return PunchListService.instance;
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
      
      // Get next item number for the unit
      const countResult = await client.query(`
        SELECT COUNT(*) + 1 as next_number
        FROM punch_list_items
        WHERE unit_id = $1
      `, [input.unit_id]);
      const itemNumber = parseInt(countResult.rows[0].next_number);
      
      // Create item
      const result = await client.query(`
        INSERT INTO punch_list_items (
          unit_id, organization_id, item_number,
          title, description, location, category, priority, status,
          assigned_contractor_id, due_date, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11)
        RETURNING *
      `, [
        input.unit_id,
        input.organization_id,
        itemNumber,
        input.title,
        input.description,
        input.location,
        input.category,
        input.priority || 'medium',
        input.assigned_contractor_id,
        input.due_date,
        input.created_by
      ]);
      
      // If assigned, update assigned_date
      if (input.assigned_contractor_id) {
        await client.query(`
          UPDATE punch_list_items
          SET assigned_date = NOW()
          WHERE id = $1
        `, [result.rows[0].id]);
      }
      
      await client.query('COMMIT');
      
      logger.info({ itemId: result.rows[0].id, unitId: input.unit_id }, 'Punch list item created');
      
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
             pu.unit_number,
             dp.project_name,
             dp.id as project_id,
             c.business_name as contractor_name
      FROM punch_list_items pli
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
      LEFT JOIN development_projects dp ON pu.project_id = dp.id
      LEFT JOIN contractors c ON pli.assigned_contractor_id = c.id
      WHERE pli.id = $1 AND pli.deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const item = this.mapRow(result.rows[0]);
    
    // Get photos
    const photos = await this.getPhotos(id);
    item.before_photos = photos.filter(p => p.photo_type === 'before');
    item.after_photos = photos.filter(p => p.photo_type === 'after');
    
    return item;
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
    const conditions: string[] = ['pli.organization_id = $1', 'pli.deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramCount = 1;
    
    if (filters?.unit_id) {
      conditions.push(`pli.unit_id = $${++paramCount}`);
      params.push(filters.unit_id);
    }
    
    if (filters?.project_id) {
      conditions.push(`pu.project_id = $${++paramCount}`);
      params.push(filters.project_id);
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
    
    if (filters?.assigned_contractor_id) {
      conditions.push(`pli.assigned_contractor_id = $${++paramCount}`);
      params.push(filters.assigned_contractor_id);
    }
    
    if (filters?.is_overdue) {
      conditions.push(`pli.due_date < NOW() AND pli.status NOT IN ('completed', 'verified', 'deferred')`);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM punch_list_items pli
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
      WHERE ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get data
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT pli.*,
             pu.unit_number,
             dp.project_name,
             dp.id as project_id,
             c.business_name as contractor_name
      FROM punch_list_items pli
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
      LEFT JOIN development_projects dp ON pu.project_id = dp.id
      LEFT JOIN contractors c ON pli.assigned_contractor_id = c.id
      WHERE ${whereClause}
      ORDER BY 
        CASE pli.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
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
             c.business_name as contractor_name
      FROM punch_list_items pli
      LEFT JOIN contractors c ON pli.assigned_contractor_id = c.id
      WHERE pli.unit_id = $1 AND pli.deleted_at IS NULL
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
    
    if (input.title !== undefined) {
      updates.push(`title = $${++paramCount}`);
      params.push(input.title);
    }
    
    if (input.description !== undefined) {
      updates.push(`description = $${++paramCount}`);
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
    
    if (input.assigned_contractor_id !== undefined) {
      updates.push(`assigned_contractor_id = $${++paramCount}`);
      params.push(input.assigned_contractor_id);
      if (input.assigned_contractor_id && !item.assigned_contractor_id) {
        updates.push(`assigned_date = NOW()`);
      }
    }
    
    if (input.due_date !== undefined) {
      updates.push(`due_date = $${++paramCount}`);
      params.push(input.due_date);
    }
    
    if (input.status !== undefined) {
      updates.push(`status = $${++paramCount}`);
      params.push(input.status);
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
   * Delete punch list item
   */
  async delete(id: string): Promise<boolean> {
    const result = await pool.query(`
      UPDATE punch_list_items
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // WORKFLOW OPERATIONS
  // =====================================================

  /**
   * Assign item to contractor
   */
  async assign(id: string, contractorId: string, dueDate?: Date): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET assigned_contractor_id = $2,
          assigned_date = NOW(),
          due_date = COALESCE($3, due_date),
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id, contractorId, dueDate]);
    
    logger.info({ itemId: id, contractorId }, 'Punch list item assigned');
    
    return this.getById(id);
  }

  /**
   * Start work on item
   */
  async startWork(id: string): Promise<PunchListItem | null> {
    await pool.query(`
      UPDATE punch_list_items
      SET status = 'in_progress',
          updated_at = NOW()
      WHERE id = $1 AND status = 'open' AND deleted_at IS NULL
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
          completed_date = NOW(),
          completed_by = $2,
          resolution_notes = COALESCE($3, resolution_notes),
          updated_at = NOW()
      WHERE id = $1 AND status IN ('open', 'in_progress') AND deleted_at IS NULL
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
          verified_date = NOW(),
          verified_by = $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'completed' AND deleted_at IS NULL
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
          completed_date = NULL,
          completed_by = NULL,
          resolution_notes = COALESCE(resolution_notes || E'\nRejected: ', '') || $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'completed' AND deleted_at IS NULL
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
      WHERE id = $1 AND deleted_at IS NULL
    `, [id, reason]);
    
    logger.info({ itemId: id, reason }, 'Punch list item deferred');
    
    return this.getById(id);
  }

  // =====================================================
  // PHOTO MANAGEMENT
  // =====================================================

  /**
   * Add photo to punch list item
   */
  async addPhoto(
    itemId: string,
    photoUrl: string,
    photoType: 'before' | 'after' | 'progress',
    caption?: string,
    takenBy?: string
  ): Promise<PunchListPhoto> {
    const result = await pool.query(`
      INSERT INTO punch_list_photos (
        punch_item_id, photo_url, photo_type, caption, taken_at, taken_by
      )
      VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *
    `, [itemId, photoUrl, photoType, caption, takenBy]);
    
    logger.info({ itemId, photoType }, 'Photo added to punch list item');
    
    return this.mapPhotoRow(result.rows[0]);
  }

  /**
   * Remove photo
   */
  async removePhoto(photoId: string): Promise<boolean> {
    const result = await pool.query(`
      DELETE FROM punch_list_photos WHERE id = $1
    `, [photoId]);
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get photos for an item
   */
  async getPhotos(itemId: string): Promise<PunchListPhoto[]> {
    const result = await pool.query(`
      SELECT * FROM punch_list_photos
      WHERE punch_item_id = $1
      ORDER BY taken_at DESC
    `, [itemId]);
    
    return result.rows.map(row => this.mapPhotoRow(row));
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
    const conditions: string[] = ['pli.organization_id = $1', 'pli.deleted_at IS NULL'];
    const params: any[] = [organizationId];
    let paramCount = 1;
    
    if (projectId) {
      conditions.push(`pu.project_id = $${++paramCount}`);
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
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
      WHERE ${whereClause}
    `, params);
    
    const stats = statusResult.rows[0];
    const totalItems = parseInt(stats.total_items) || 0;
    const completedItems = (parseInt(stats.completed_items) || 0) + (parseInt(stats.verified_items) || 0);
    
    // Get counts by category
    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM punch_list_items pli
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
      WHERE ${whereClause}
      GROUP BY category
      ORDER BY count DESC
    `, params);
    
    // Get counts by priority
    const priorityResult = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM punch_list_items pli
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
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
    
    // Get counts by contractor
    const contractorResult = await pool.query(`
      SELECT 
        pli.assigned_contractor_id as contractor_id,
        c.business_name as contractor_name,
        COUNT(*) as count
      FROM punch_list_items pli
      LEFT JOIN project_units pu ON pli.unit_id = pu.id
      LEFT JOIN contractors c ON pli.assigned_contractor_id = c.id
      WHERE ${whereClause} AND pli.assigned_contractor_id IS NOT NULL
      GROUP BY pli.assigned_contractor_id, c.business_name
      ORDER BY count DESC
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
      by_contractor: contractorResult.rows.map(row => ({
        contractor_id: row.contractor_id,
        contractor_name: row.contractor_name || 'Unknown',
        count: parseInt(row.count)
      }))
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
        AND deleted_at IS NULL
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
        // Get next item number
        const countResult = await client.query(`
          SELECT COUNT(*) + 1 as next_number
          FROM punch_list_items
          WHERE unit_id = $1
        `, [input.unit_id]);
        const itemNumber = parseInt(countResult.rows[0].next_number);
        
        const result = await client.query(`
          INSERT INTO punch_list_items (
            unit_id, organization_id, item_number,
            title, description, location, category, priority, status,
            assigned_contractor_id, due_date, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11)
          RETURNING *
        `, [
          input.unit_id,
          input.organization_id,
          itemNumber,
          input.title,
          input.description,
          input.location,
          input.category,
          input.priority || 'medium',
          input.assigned_contractor_id,
          input.due_date,
          input.created_by
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
          completed_date = NOW(),
          completed_by = $2,
          updated_at = NOW()
      WHERE unit_id = $1 
        AND status IN ('open', 'in_progress')
        AND deleted_at IS NULL
    `, [unitId, completedBy]);
    
    logger.info({ unitId, count: result.rowCount }, 'All punch list items completed for unit');
    
    return result.rowCount ?? 0;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private mapRow(row: any): PunchListItem {
    return {
      id: row.id,
      unit_id: row.unit_id,
      organization_id: row.organization_id,
      project_id: row.project_id,
      unit_number: row.unit_number,
      project_name: row.project_name,
      item_number: parseInt(row.item_number) || 0,
      title: row.title,
      description: row.description,
      location: row.location,
      category: row.category,
      priority: row.priority,
      status: row.status,
      assigned_contractor_id: row.assigned_contractor_id,
      contractor_name: row.contractor_name,
      assigned_date: row.assigned_date,
      due_date: row.due_date,
      completed_date: row.completed_date,
      completed_by: row.completed_by,
      verified_by: row.verified_by,
      verified_date: row.verified_date,
      resolution_notes: row.resolution_notes,
      before_photos: [],
      after_photos: [],
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapPhotoRow(row: any): PunchListPhoto {
    return {
      id: row.id,
      punch_item_id: row.punch_item_id,
      photo_url: row.photo_url,
      photo_type: row.photo_type,
      caption: row.caption,
      taken_at: row.taken_at,
      taken_by: row.taken_by,
      created_at: row.created_at,
    };
  }
}

export default PunchListService.getInstance();
