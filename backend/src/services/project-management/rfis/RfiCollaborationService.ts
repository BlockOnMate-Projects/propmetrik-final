/**
 * RFI Collaboration Service
 * Phase 3.13 - Split from rfiService
 * 
 * Handles RFI collaboration features:
 * - Comments (internal and external)
 * - History/audit trail
 * - Watchers
 */

import { pool } from '../../../database';
import { BaseService } from '../BaseService';
import {
  RfiComment,
  RfiHistoryEntry,
  RfiWatcher,
  AddCommentInput,
  mapRowToComment,
  mapRowToHistory,
  serializeAttachments
} from './types';

class RfiCollaborationService extends BaseService {
  constructor() {
    super('RfiCollaborationService');
  }

  // --------------------------------------------------------------------------
  // COMMENTS
  // --------------------------------------------------------------------------

  /**
   * Add a comment to an RFI
   */
  async addComment(rfiId: string, input: AddCommentInput): Promise<RfiComment> {
    const result = await pool.query(`
      INSERT INTO rfi_comments (rfi_id, comment, is_internal, attachments, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      rfiId, 
      input.comment, 
      input.isInternal || false, 
      serializeAttachments(input.attachments || []), 
      input.createdBy
    ]);

    // Get user name
    const userResult = await pool.query(
      'SELECT full_name FROM users WHERE id = $1',
      [input.createdBy]
    );
    
    const row = result.rows[0];
    row.created_by_name = userResult.rows[0]?.full_name;

    this.log('info', `Comment added to RFI ${rfiId}`);

    return mapRowToComment(row);
  }

  /**
   * Get comments for an RFI
   */
  async getComments(rfiId: string, includeInternal: boolean = false): Promise<RfiComment[]> {
    let query = `
      SELECT c.*, u.full_name AS created_by_name
      FROM rfi_comments c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.rfi_id = $1
    `;

    if (!includeInternal) {
      query += ` AND c.is_internal = false`;
    }

    query += ` ORDER BY c.created_at ASC`;

    const result = await pool.query(query, [rfiId]);
    return result.rows.map(row => mapRowToComment(row));
  }

  /**
   * Get comment by ID
   */
  async getCommentById(id: string): Promise<RfiComment | null> {
    const result = await pool.query(`
      SELECT c.*, u.full_name AS created_by_name
      FROM rfi_comments c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToComment(result.rows[0]);
  }

  /**
   * Update a comment
   */
  async updateComment(id: string, comment: string, updatedBy: string): Promise<RfiComment | null> {
    const result = await pool.query(`
      UPDATE rfi_comments
      SET comment = $2,
          updated_at = NOW()
      WHERE id = $1 AND created_by = $3
      RETURNING *
    `, [id, comment, updatedBy]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToComment(result.rows[0]);
  }

  /**
   * Delete a comment
   */
  async deleteComment(id: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM rfi_comments WHERE id = $1 AND created_by = $2 RETURNING id',
      [id, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get comment count for RFI
   */
  async getCommentCount(rfiId: string, includeInternal: boolean = false): Promise<number> {
    let query = 'SELECT COUNT(*) FROM rfi_comments WHERE rfi_id = $1';
    if (!includeInternal) {
      query += ' AND is_internal = false';
    }

    const result = await pool.query(query, [rfiId]);
    return parseInt(result.rows[0].count, 10);
  }

  // --------------------------------------------------------------------------
  // HISTORY
  // --------------------------------------------------------------------------

  /**
   * Get RFI history/audit trail
   */
  async getHistory(rfiId: string): Promise<RfiHistoryEntry[]> {
    const result = await pool.query(`
      SELECT h.*, u.full_name AS performed_by_name
      FROM rfi_history h
      LEFT JOIN users u ON h.performed_by = u.id
      WHERE h.rfi_id = $1
      ORDER BY h.performed_at DESC
    `, [rfiId]);

    return result.rows.map(row => mapRowToHistory(row));
  }

  /**
   * Get recent history entries for a project
   */
  async getRecentProjectHistory(projectId: string, limit: number = 50): Promise<RfiHistoryEntry[]> {
    const result = await pool.query(`
      SELECT h.*, u.full_name AS performed_by_name
      FROM rfi_history h
      JOIN rfis r ON h.rfi_id = r.id
      LEFT JOIN users u ON h.performed_by = u.id
      WHERE r.project_id = $1
      ORDER BY h.performed_at DESC
      LIMIT $2
    `, [projectId, limit]);

    return result.rows.map(row => mapRowToHistory(row));
  }

  // --------------------------------------------------------------------------
  // WATCHERS
  // --------------------------------------------------------------------------

  /**
   * Add a watcher to an RFI
   */
  async addWatcher(rfiId: string, userId: string): Promise<boolean> {
    const result = await pool.query(`
      INSERT INTO rfi_watchers (rfi_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (rfi_id, user_id) DO NOTHING
      RETURNING id
    `, [rfiId, userId]);

    return result.rows.length > 0;
  }

  /**
   * Remove a watcher from an RFI
   */
  async removeWatcher(rfiId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM rfi_watchers WHERE rfi_id = $1 AND user_id = $2 RETURNING id',
      [rfiId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get watchers for an RFI
   */
  async getWatchers(rfiId: string): Promise<RfiWatcher[]> {
    const result = await pool.query(`
      SELECT w.*, u.full_name AS user_name
      FROM rfi_watchers w
      LEFT JOIN users u ON w.user_id = u.id
      WHERE w.rfi_id = $1
      ORDER BY w.created_at ASC
    `, [rfiId]);

    return result.rows.map(row => ({
      id: row.id,
      rfiId: row.rfi_id,
      userId: row.user_id,
      userName: row.user_name,
      addedAt: row.created_at
    }));
  }

  /**
   * Check if user is watching an RFI
   */
  async isWatching(rfiId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM rfi_watchers WHERE rfi_id = $1 AND user_id = $2',
      [rfiId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get RFIs a user is watching
   */
  async getWatchedRfis(userId: string, projectId?: string): Promise<string[]> {
    let query = `
      SELECT w.rfi_id
      FROM rfi_watchers w
      JOIN rfis r ON w.rfi_id = r.id
      WHERE w.user_id = $1
    `;
    const params: string[] = [userId];

    if (projectId) {
      query += ' AND r.project_id = $2';
      params.push(projectId);
    }

    const result = await pool.query(query, params);
    return result.rows.map(row => row.rfi_id);
  }

  // --------------------------------------------------------------------------
  // MENTIONS
  // --------------------------------------------------------------------------

  /**
   * Extract user mentions from comment text
   */
  extractMentions(text: string): string[] {
    const mentionPattern = /@(\w+)/g;
    const matches = text.match(mentionPattern);
    return matches ? matches.map(m => m.substring(1)) : [];
  }

  /**
   * Add mentioned users as watchers
   */
  async processMentions(rfiId: string, text: string): Promise<void> {
    const usernames = this.extractMentions(text);
    if (usernames.length === 0) return;

    // Look up users by username
    const result = await pool.query(
      'SELECT id FROM users WHERE username = ANY($1)',
      [usernames]
    );

    for (const row of result.rows) {
      await this.addWatcher(rfiId, row.id);
    }
  }
}

export const rfiCollaborationService = new RfiCollaborationService();
