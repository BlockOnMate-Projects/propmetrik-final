/**
 * Audit Log Service
 * 
 * Comprehensive audit logging for report actions.
 * Tracks all report lifecycle events for compliance and security.
 * 
 * Phase 4: Week 8 - Audit Trail Implementation
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================

export type AuditAction =
  | 'created'
  | 'viewed'
  | 'edited'
  | 'generated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'downloaded'
  | 'printed'
  | 'shared'
  | 'superseded'
  | 'deleted'
  | 'signature_added'
  | 'pdf_generated'
  | 'verified';

export interface AuditLogEntry {
  id: string;
  report_id: string;
  action: AuditAction;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, any> | null;
  created_at: Date;
}

export interface AuditLogInput {
  reportId: string;
  action: AuditAction;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export interface AuditLogFilters {
  reportId?: string;
  userId?: string;
  action?: AuditAction;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditLog {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditSummary {
  reportId: string;
  totalActions: number;
  uniqueUsers: number;
  createdAt: Date | null;
  lastModifiedAt: Date | null;
  lastViewedAt: Date | null;
  approvedAt: Date | null;
  downloadCount: number;
  viewCount: number;
  editCount: number;
}

// =====================================================
// AUDIT LOG SERVICE CLASS
// =====================================================

export class AuditLogService {
  // ---------------------------------------------------
  // LOG CREATION
  // ---------------------------------------------------

  /**
   * Log an audit event
   */
  async log(input: AuditLogInput): Promise<AuditLogEntry> {
    const entryId = uuidv4();

    const result = await query(
      `INSERT INTO report_audit_log (
        id, report_id, action, user_id, ip_address, user_agent, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        entryId,
        input.reportId,
        input.action,
        input.userId || null,
        input.ipAddress || null,
        input.userAgent || null,
        input.details ? JSON.stringify(input.details) : null,
      ]
    );

    const entry = this.mapRowToEntry(result.rows[0]);

    logger.debug('Audit log entry created', {
      entryId,
      reportId: input.reportId,
      action: input.action,
    });

    return entry;
  }

  /**
   * Log report creation
   */
  async logCreated(
    reportId: string, 
    userId?: string, 
    details?: Record<string, any>
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'created',
      userId,
      details: { ...details, event: 'Report draft created' },
    });
  }

  /**
   * Log report view
   */
  async logViewed(
    reportId: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'viewed',
      userId,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log report edit
   */
  async logEdited(
    reportId: string,
    userId?: string,
    changes?: Record<string, any>
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'edited',
      userId,
      details: { changes },
    });
  }

  /**
   * Log DOCX generation
   */
  async logGenerated(
    reportId: string,
    userId?: string,
    filename?: string
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'generated',
      userId,
      details: { filename, event: 'DOCX report generated' },
    });
  }

  /**
   * Log submission for approval
   */
  async logSubmitted(reportId: string, userId?: string): Promise<void> {
    await this.log({
      reportId,
      action: 'submitted',
      userId,
      details: { event: 'Report submitted for approval' },
    });
  }

  /**
   * Log report approval
   */
  async logApproved(
    reportId: string,
    valuerId: string,
    digitalSealHash?: string
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'approved',
      userId: valuerId,
      details: {
        event: 'Report approved',
        valuer_id: valuerId,
        digital_seal_hash: digitalSealHash,
      },
    });
  }

  /**
   * Log report rejection
   */
  async logRejected(
    reportId: string,
    valuerId: string,
    reason?: string
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'rejected',
      userId: valuerId,
      details: {
        event: 'Report rejected',
        reason,
      },
    });
  }

  /**
   * Log download
   */
  async logDownloaded(
    reportId: string,
    userId?: string,
    format?: 'docx' | 'pdf',
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'downloaded',
      userId,
      ipAddress,
      details: { format },
    });
  }

  /**
   * Log PDF generation
   */
  async logPdfGenerated(
    reportId: string,
    userId?: string,
    fileSize?: number
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'pdf_generated',
      userId,
      details: { file_size: fileSize },
    });
  }

  /**
   * Log signature addition
   */
  async logSignatureAdded(
    reportId: string,
    valuerId: string
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'signature_added',
      userId: valuerId,
      details: { event: 'Digital signature added' },
    });
  }

  /**
   * Log verification check
   */
  async logVerified(
    reportId: string,
    ipAddress?: string,
    valid?: boolean
  ): Promise<void> {
    await this.log({
      reportId,
      action: 'verified',
      ipAddress,
      details: { valid, event: 'Report verification checked' },
    });
  }

  // ---------------------------------------------------
  // LOG RETRIEVAL
  // ---------------------------------------------------

  /**
   * Get audit log for a specific report
   */
  async getReportLog(
    reportId: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    const result = await query(
      `SELECT * FROM report_audit_log 
       WHERE report_id = $1 
       ORDER BY created_at DESC
       LIMIT $2`,
      [reportId, limit]
    );

    return result.rows.map(row => this.mapRowToEntry(row));
  }

  /**
   * List audit logs with filters
   */
  async listLogs(filters: AuditLogFilters = {}): Promise<PaginatedAuditLog> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.reportId) {
      conditions.push(`report_id = $${paramIndex++}`);
      params.push(filters.reportId);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM report_audit_log ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const result = await query(
      `SELECT * FROM report_audit_log 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      entries: result.rows.map(row => this.mapRowToEntry(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit summary for a report
   */
  async getReportSummary(reportId: string): Promise<AuditSummary> {
    const result = await query(
      `SELECT 
        COUNT(*) as total_actions,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(created_at) FILTER (WHERE action = 'created') as created_at,
        MAX(created_at) FILTER (WHERE action = 'edited') as last_modified_at,
        MAX(created_at) FILTER (WHERE action = 'viewed') as last_viewed_at,
        MAX(created_at) FILTER (WHERE action = 'approved') as approved_at,
        COUNT(*) FILTER (WHERE action = 'downloaded') as download_count,
        COUNT(*) FILTER (WHERE action = 'viewed') as view_count,
        COUNT(*) FILTER (WHERE action = 'edited') as edit_count
       FROM report_audit_log
       WHERE report_id = $1`,
      [reportId]
    );

    const row = result.rows[0];

    return {
      reportId,
      totalActions: parseInt(row.total_actions, 10),
      uniqueUsers: parseInt(row.unique_users, 10),
      createdAt: row.created_at,
      lastModifiedAt: row.last_modified_at,
      lastViewedAt: row.last_viewed_at,
      approvedAt: row.approved_at,
      downloadCount: parseInt(row.download_count, 10),
      viewCount: parseInt(row.view_count, 10),
      editCount: parseInt(row.edit_count, 10),
    };
  }

  /**
   * Get recent activity across all reports
   */
  async getRecentActivity(
    limit: number = 20,
    actions?: AuditAction[]
  ): Promise<AuditLogEntry[]> {
    let sql = `SELECT * FROM report_audit_log`;
    const params: any[] = [];

    if (actions && actions.length > 0) {
      sql += ` WHERE action = ANY($1)`;
      params.push(actions);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);

    return result.rows.map(row => this.mapRowToEntry(row));
  }

  /**
   * Get user activity
   */
  async getUserActivity(
    userId: string,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    const result = await query(
      `SELECT * FROM report_audit_log 
       WHERE user_id = $1 
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => this.mapRowToEntry(row));
  }

  // ---------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------

  /**
   * Delete old audit logs (for compliance/retention)
   */
  async deleteOldLogs(olderThanDays: number = 365): Promise<number> {
    const result = await query(
      `DELETE FROM report_audit_log 
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [olderThanDays]
    );

    logger.info(`Deleted ${result.rows.length} old audit log entries`);

    return result.rows.length;
  }

  /**
   * Archive audit logs to separate table
   */
  async archiveLogs(reportId: string): Promise<number> {
    // This would typically move logs to an archive table
    // For now, just return count of logs that would be archived
    const result = await query(
      `SELECT COUNT(*) as count FROM report_audit_log WHERE report_id = $1`,
      [reportId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  // ---------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------

  private mapRowToEntry(row: any): AuditLogEntry {
    return {
      id: row.id,
      report_id: row.report_id,
      action: row.action,
      user_id: row.user_id,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      details: typeof row.details === 'string' 
        ? JSON.parse(row.details) 
        : row.details,
      created_at: row.created_at,
    };
  }
}

// Export singleton instance
export const auditLogService = new AuditLogService();
