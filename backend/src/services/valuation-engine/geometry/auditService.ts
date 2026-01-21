/**
 * Floor Plan Audit Service
 *
 * Comprehensive audit logging for all floor plan geometry changes.
 * Supports compliance requirements, version history, and report generation.
 *
 * @module services/geometry/auditService
 * @version 1.0.0
 */

import { pool } from '../../../database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../utils/logger';
import type { GeometryMeasurements, BlenderGeometryResult } from '../../../types/floorPlanDesign';
import type { AdjustmentDelta } from './adjustmentConstraints';

// ============================================================================
// TYPES
// ============================================================================

export type AuditAction =
  | 'design_intent_generated'
  | 'geometry_generated'
  | 'geometry_regenerated'
  | 'adjustment_applied'
  | 'adjustment_rejected'
  | 'geometry_approved'
  | 'geometry_locked'
  | 'geometry_unlocked'
  | 'geometry_reverted'
  | 'floor_plan_created'
  | 'floor_plan_updated'
  | 'floor_plan_deleted';

export type ActorType = 'user' | 'system' | 'llm' | 'blender';

export interface AuditDetails {
  geometry_version_id?: string;
  geometry_hash?: string;
  floor_plan_id?: string;
  design_intent_id?: string;
  actor_id: string;
  actor_type: ActorType;
  adjustments?: AdjustmentDelta[];
  justification?: string;
  measurements?: GeometryMeasurements;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditEntry {
  id: string;
  valuation_id: string;
  geometry_version_id: string | null;
  floor_plan_id: string | null;
  action: AuditAction;
  actor_id: string;
  actor_type: ActorType;
  actor_name: string | null;
  adjustment_deltas: AdjustmentDelta[] | null;
  justification: string | null;
  geometry_hash: string | null;
  measurements: GeometryMeasurements | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditReport {
  valuation_id: string;
  generated_at: string;
  entry_count: number;
  entries: AuditEntry[];
  summary: AuditSummary;
}

export interface AuditSummary {
  total_adjustments: number;
  total_regenerations: number;
  approval_status: 'pending' | 'approved' | 'locked';
  last_modified_by: string | null;
  last_modified_at: string | null;
  gfa_initial_sqm: number | null;
  gfa_final_sqm: number | null;
  gfa_change_sqm: number;
  timeline: AuditTimelineEvent[];
}

export interface AuditTimelineEvent {
  timestamp: string;
  action: AuditAction;
  actor_name: string | null;
  description: string;
  gfa_sqm: number | null;
}

// ============================================================================
// FLOOR PLAN AUDIT SERVICE
// ============================================================================

class FloorPlanAuditService {
  /**
   * Log an audit action
   */
  async logAction(
    valuationId: string,
    action: AuditAction,
    details: AuditDetails
  ): Promise<string> {
    const id = uuidv4();

    try {
      const query = `
        INSERT INTO valuation_floor_plan_audit_log (
          id,
          valuation_id,
          geometry_version_id,
          floor_plan_id,
          action,
          actor_id,
          actor_type,
          adjustment_deltas,
          justification,
          geometry_hash,
          measurements,
          metadata,
          ip_address,
          user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `;

      await pool.query(query, [
        id,
        valuationId,
        details.geometry_version_id || null,
        details.floor_plan_id || null,
        action,
        details.actor_id,
        details.actor_type,
        details.adjustments ? JSON.stringify(details.adjustments) : null,
        details.justification || null,
        details.geometry_hash || null,
        details.measurements ? JSON.stringify(details.measurements) : null,
        details.metadata ? JSON.stringify(details.metadata) : null,
        details.ip_address || null,
        details.user_agent || null,
      ]);

      logger.info('Audit log entry created', {
        id,
        valuationId,
        action,
        actorId: details.actor_id,
        actorType: details.actor_type,
      });

      return id;
    } catch (error) {
      logger.error('Failed to create audit log entry', {
        valuationId,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get audit entries for a valuation
   */
  async getAuditEntries(
    valuationId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
      actions?: AuditAction[];
    }
  ): Promise<AuditEntry[]> {
    let query = `
      SELECT 
        al.id,
        al.valuation_id,
        al.geometry_version_id,
        al.floor_plan_id,
        al.action,
        al.actor_id,
        al.actor_type,
        u.full_name as actor_name,
        al.adjustment_deltas,
        al.justification,
        al.geometry_hash,
        al.measurements,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at
      FROM valuation_floor_plan_audit_log al
      LEFT JOIN users u ON al.actor_id = u.id::text
      WHERE al.valuation_id = $1
    `;

    const params: any[] = [valuationId];
    let paramIndex = 2;

    if (options?.startDate) {
      query += ` AND al.created_at >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options?.endDate) {
      query += ` AND al.created_at <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    if (options?.actions && options.actions.length > 0) {
      query += ` AND al.action = ANY($${paramIndex})`;
      params.push(options.actions);
      paramIndex++;
    }

    query += ` ORDER BY al.created_at DESC`;

    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      ...row,
      adjustment_deltas: row.adjustment_deltas
        ? JSON.parse(row.adjustment_deltas)
        : null,
      measurements: row.measurements ? JSON.parse(row.measurements) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  /**
   * Generate comprehensive audit report
   */
  async generateAuditReport(valuationId: string): Promise<AuditReport> {
    const entries = await this.getAuditEntries(valuationId);
    const summary = this.generateSummary(entries);

    return {
      valuation_id: valuationId,
      generated_at: new Date().toISOString(),
      entry_count: entries.length,
      entries,
      summary,
    };
  }

  /**
   * Get the latest geometry version for a valuation
   */
  async getLatestGeometryVersion(valuationId: string): Promise<{
    id: string;
    geometry_hash: string;
    measurements: GeometryMeasurements;
    status: string;
    created_at: string;
  } | null> {
    const result = await pool.query(
      `
      SELECT id, geometry_hash, measurements, status, created_at
      FROM valuation_floor_plan_geometry_versions
      WHERE valuation_id = $1
      ORDER BY version_number DESC
      LIMIT 1
    `,
      [valuationId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      measurements: typeof row.measurements === 'string'
        ? JSON.parse(row.measurements)
        : row.measurements,
    };
  }

  /**
   * Compare two geometry versions
   */
  async compareGeometryVersions(
    versionId1: string,
    versionId2: string
  ): Promise<{
    version1: { id: string; measurements: GeometryMeasurements };
    version2: { id: string; measurements: GeometryMeasurements };
    differences: {
      gfa_change_sqm: number;
      nia_change_sqm: number;
      efficiency_change: number;
      room_changes: Array<{
        room_id: string;
        room_type: string;
        area_change_sqm: number;
      }>;
    };
  }> {
    const result = await pool.query(
      `
      SELECT id, measurements
      FROM valuation_floor_plan_geometry_versions
      WHERE id = ANY($1)
    `,
      [[versionId1, versionId2]]
    );

    if (result.rows.length !== 2) {
      throw new Error('One or both geometry versions not found');
    }

    const v1 = result.rows.find((r) => r.id === versionId1);
    const v2 = result.rows.find((r) => r.id === versionId2);

    const m1: GeometryMeasurements = typeof v1.measurements === 'string'
      ? JSON.parse(v1.measurements)
      : v1.measurements;
    const m2: GeometryMeasurements = typeof v2.measurements === 'string'
      ? JSON.parse(v2.measurements)
      : v2.measurements;

    // Calculate room-level changes
    const roomChanges: Array<{ room_id: string; room_type: string; area_change_sqm: number }> = [];

    for (const room2 of m2.rooms) {
      const room1 = m1.rooms.find((r) => r.room_id === room2.room_id);
      if (room1) {
        const change = room2.area_sqm - room1.area_sqm;
        if (Math.abs(change) > 0.1) {
          roomChanges.push({
            room_id: room2.room_id,
            room_type: room2.room_type,
            area_change_sqm: change,
          });
        }
      } else {
        // New room
        roomChanges.push({
          room_id: room2.room_id,
          room_type: room2.room_type,
          area_change_sqm: room2.area_sqm,
        });
      }
    }

    // Check for removed rooms
    for (const room1 of m1.rooms) {
      const room2 = m2.rooms.find((r) => r.room_id === room1.room_id);
      if (!room2) {
        roomChanges.push({
          room_id: room1.room_id,
          room_type: room1.room_type,
          area_change_sqm: -room1.area_sqm,
        });
      }
    }

    return {
      version1: { id: versionId1, measurements: m1 },
      version2: { id: versionId2, measurements: m2 },
      differences: {
        gfa_change_sqm: m2.gfa_sqm - m1.gfa_sqm,
        nia_change_sqm: m2.nia_sqm - m1.nia_sqm,
        efficiency_change: m2.efficiency_ratio - m1.efficiency_ratio,
        room_changes: roomChanges,
      },
    };
  }

  /**
   * Lock a valuation's floor plan (prevent further edits)
   */
  async lockFloorPlan(
    valuationId: string,
    actorId: string,
    reason?: string
  ): Promise<void> {
    // Update geometry version status
    await pool.query(
      `
      UPDATE valuation_floor_plan_geometry_versions
      SET status = 'locked', locked_at = NOW(), locked_by = $2
      WHERE valuation_id = $1 AND status = 'approved'
    `,
      [valuationId, actorId]
    );

    // Log the action
    await this.logAction(valuationId, 'geometry_locked', {
      actor_id: actorId,
      actor_type: 'user',
      justification: reason,
    });
  }

  /**
   * Unlock a valuation's floor plan (allow edits)
   */
  async unlockFloorPlan(
    valuationId: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    // Update geometry version status
    await pool.query(
      `
      UPDATE valuation_floor_plan_geometry_versions
      SET status = 'approved', locked_at = NULL, locked_by = NULL
      WHERE valuation_id = $1 AND status = 'locked'
    `,
      [valuationId]
    );

    // Log the action
    await this.logAction(valuationId, 'geometry_unlocked', {
      actor_id: actorId,
      actor_type: 'user',
      justification: reason,
    });
  }

  /**
   * Check if floor plan is locked
   */
  async isFloorPlanLocked(valuationId: string): Promise<boolean> {
    const result = await pool.query(
      `
      SELECT COUNT(*) as count
      FROM valuation_floor_plan_geometry_versions
      WHERE valuation_id = $1 AND status = 'locked'
    `,
      [valuationId]
    );

    return parseInt(result.rows[0].count, 10) > 0;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private generateSummary(entries: AuditEntry[]): AuditSummary {
    // Count adjustments and regenerations
    const totalAdjustments = entries.filter(
      (e) => e.action === 'adjustment_applied'
    ).length;
    const totalRegenerations = entries.filter(
      (e) =>
        e.action === 'geometry_generated' || e.action === 'geometry_regenerated'
    ).length;

    // Determine approval status
    const lastLockEntry = entries.find((e) => e.action === 'geometry_locked');
    const lastUnlockEntry = entries.find((e) => e.action === 'geometry_unlocked');
    const lastApprovalEntry = entries.find((e) => e.action === 'geometry_approved');

    let approvalStatus: 'pending' | 'approved' | 'locked' = 'pending';
    if (lastLockEntry && (!lastUnlockEntry || lastLockEntry.created_at > lastUnlockEntry.created_at)) {
      approvalStatus = 'locked';
    } else if (lastApprovalEntry) {
      approvalStatus = 'approved';
    }

    // Get last modified info
    const lastModifiedEntry = entries[0];
    const lastModifiedBy = lastModifiedEntry?.actor_name || lastModifiedEntry?.actor_id || null;
    const lastModifiedAt = lastModifiedEntry?.created_at || null;

    // Calculate GFA changes
    const entriesWithGFA = entries.filter((e) => e.measurements?.gfa_sqm);
    const gfaInitial = entriesWithGFA.length > 0
      ? entriesWithGFA[entriesWithGFA.length - 1].measurements?.gfa_sqm || null
      : null;
    const gfaFinal = entriesWithGFA.length > 0
      ? entriesWithGFA[0].measurements?.gfa_sqm || null
      : null;
    const gfaChange = (gfaFinal || 0) - (gfaInitial || 0);

    // Generate timeline
    const timeline: AuditTimelineEvent[] = entries
      .slice()
      .reverse()
      .map((entry) => ({
        timestamp: entry.created_at,
        action: entry.action,
        actor_name: entry.actor_name,
        description: this.getActionDescription(entry),
        gfa_sqm: entry.measurements?.gfa_sqm || null,
      }));

    return {
      total_adjustments: totalAdjustments,
      total_regenerations: totalRegenerations,
      approval_status: approvalStatus,
      last_modified_by: lastModifiedBy,
      last_modified_at: lastModifiedAt,
      gfa_initial_sqm: gfaInitial,
      gfa_final_sqm: gfaFinal,
      gfa_change_sqm: gfaChange,
      timeline,
    };
  }

  private getActionDescription(entry: AuditEntry): string {
    const actor = entry.actor_name || entry.actor_id;

    switch (entry.action) {
      case 'design_intent_generated':
        return `Design intent generated by ${entry.actor_type === 'llm' ? 'AI' : actor}`;
      case 'geometry_generated':
        return `Floor plan geometry generated (GFA: ${entry.measurements?.gfa_sqm?.toFixed(1) || 'N/A'} m²)`;
      case 'geometry_regenerated':
        return `Floor plan regenerated by ${actor}`;
      case 'adjustment_applied':
        const adjustmentCount = entry.adjustment_deltas?.length || 0;
        return `${adjustmentCount} adjustment(s) applied by ${actor}`;
      case 'adjustment_rejected':
        return `Adjustments rejected by ${actor}`;
      case 'geometry_approved':
        return `Floor plan approved by ${actor}`;
      case 'geometry_locked':
        return `Floor plan locked for valuation by ${actor}`;
      case 'geometry_unlocked':
        return `Floor plan unlocked by ${actor}`;
      case 'geometry_reverted':
        return `Floor plan reverted to previous version by ${actor}`;
      case 'floor_plan_created':
        return `Floor plan created`;
      case 'floor_plan_updated':
        return `Floor plan updated by ${actor}`;
      case 'floor_plan_deleted':
        return `Floor plan deleted by ${actor}`;
      default:
        return `Action: ${entry.action}`;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let auditServiceInstance: FloorPlanAuditService | null = null;

export function getFloorPlanAuditService(): FloorPlanAuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new FloorPlanAuditService();
  }
  return auditServiceInstance;
}

export { FloorPlanAuditService };
export default getFloorPlanAuditService;
