/**
 * Communication Service
 * 
 * Phase 3.4: Split teamService
 * 
 * Manages communication logging:
 * - Log calls, meetings, messages
 * - Track follow-ups
 * - Communication history
 * 
 * @module services/project-management/team/CommunicationService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  CommunicationLog,
  LogCommunicationInput,
  CommunicationType,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class CommunicationServiceImpl extends BaseService {
  constructor() {
    super('CommunicationService');
  }

  // ==========================================================================
  // LOGGING
  // ==========================================================================

  async logCommunication(input: LogCommunicationInput): Promise<CommunicationLog> {
    const result = await this.query(
      `INSERT INTO pm_communication_logs (
         organization_id, project_id, team_member_id, vendor_id,
         type, direction, subject, content, summary,
         initiated_by, contact_name, contact_phone, contact_email,
         duration, requires_follow_up, follow_up_date, follow_up_assigned_to,
         attachments
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
       )
       RETURNING *`,
      [
        input.organizationId,
        input.projectId || null,
        input.teamMemberId || null,
        input.vendorId || null,
        input.type,
        input.direction,
        input.subject || null,
        input.content,
        input.summary || null,
        input.initiatedBy,
        input.contactName,
        input.contactPhone || null,
        input.contactEmail || null,
        input.duration || null,
        input.requiresFollowUp || false,
        input.followUpDate || null,
        input.followUpAssignedTo || null,
        input.attachments || [],
      ]
    );

    const log = this.mapRow(result.rows[0]);

    eventBus.emit('communication.logged', {
      logId: log.id,
      type: input.type,
      projectId: input.projectId,
    });

    // If requires follow-up, emit separate event
    if (input.requiresFollowUp && input.followUpDate) {
      eventBus.emit('communication.followup_scheduled', {
        logId: log.id,
        followUpDate: input.followUpDate,
        assignedTo: input.followUpAssignedTo,
      });
    }

    return log;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async getCommunicationHistory(
    entityId: string,
    entityType: 'team_member' | 'vendor' | 'project',
    limit: number = 50
  ): Promise<CommunicationLog[]> {
    let column: string;
    switch (entityType) {
      case 'team_member':
        column = 'team_member_id';
        break;
      case 'vendor':
        column = 'vendor_id';
        break;
      case 'project':
        column = 'project_id';
        break;
    }

    const result = await this.query(
      `SELECT cl.*, u.name as initiated_by_name
       FROM pm_communication_logs cl
       LEFT JOIN users u ON u.id = cl.initiated_by
       WHERE cl.${column} = $1
       ORDER BY cl.created_at DESC
       LIMIT $2`,
      [entityId, limit]
    );

    return result.rows.map(this.mapRow);
  }

  async getProjectCommunications(
    projectId: string,
    filters?: {
      type?: CommunicationType;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
    }
  ): Promise<CommunicationLog[]> {
    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (filters?.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters?.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }

    if (filters?.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    const limit = filters?.limit || 100;
    
    const result = await this.query(
      `SELECT cl.*, u.name as initiated_by_name
       FROM pm_communication_logs cl
       LEFT JOIN users u ON u.id = cl.initiated_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY cl.created_at DESC
       LIMIT $${paramIndex}`,
      [...params, limit]
    );

    return result.rows.map(this.mapRow);
  }

  async getOrganizationCommunications(
    organizationId: string,
    limit: number = 100
  ): Promise<CommunicationLog[]> {
    const result = await this.query(
      `SELECT cl.*, u.name as initiated_by_name
       FROM pm_communication_logs cl
       LEFT JOIN users u ON u.id = cl.initiated_by
       WHERE cl.organization_id = $1
       ORDER BY cl.created_at DESC
       LIMIT $2`,
      [organizationId, limit]
    );

    return result.rows.map(this.mapRow);
  }

  // ==========================================================================
  // FOLLOW-UPS
  // ==========================================================================

  async getPendingFollowUps(organizationId: string): Promise<CommunicationLog[]> {
    const result = await this.query(
      `SELECT cl.*, u.name as initiated_by_name
       FROM pm_communication_logs cl
       LEFT JOIN users u ON u.id = cl.initiated_by
       WHERE cl.organization_id = $1
         AND cl.requires_follow_up = true
         AND cl.follow_up_completed = false
       ORDER BY cl.follow_up_date ASC NULLS LAST`,
      [organizationId]
    );

    return result.rows.map(this.mapRow);
  }

  async getOverdueFollowUps(organizationId: string): Promise<CommunicationLog[]> {
    const result = await this.query(
      `SELECT cl.*, u.name as initiated_by_name
       FROM pm_communication_logs cl
       LEFT JOIN users u ON u.id = cl.initiated_by
       WHERE cl.organization_id = $1
         AND cl.requires_follow_up = true
         AND cl.follow_up_completed = false
         AND cl.follow_up_date < NOW()
       ORDER BY cl.follow_up_date ASC`,
      [organizationId]
    );

    return result.rows.map(this.mapRow);
  }

  async getUserFollowUps(userId: string): Promise<CommunicationLog[]> {
    const result = await this.query(
      `SELECT cl.*, u.name as initiated_by_name
       FROM pm_communication_logs cl
       LEFT JOIN users u ON u.id = cl.initiated_by
       WHERE cl.follow_up_assigned_to = $1
         AND cl.requires_follow_up = true
         AND cl.follow_up_completed = false
       ORDER BY cl.follow_up_date ASC NULLS LAST`,
      [userId]
    );

    return result.rows.map(this.mapRow);
  }

  async markFollowUpComplete(logId: string): Promise<CommunicationLog | null> {
    const result = await this.query(
      `UPDATE pm_communication_logs
       SET follow_up_completed = true, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [logId]
    );

    if (result.rows.length) {
      eventBus.emit('communication.followup_completed', { logId });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async rescheduleFollowUp(logId: string, newDate: Date, assignedTo?: string): Promise<CommunicationLog | null> {
    const updates = ['follow_up_date = $2', 'updated_at = NOW()'];
    const params: any[] = [logId, newDate];

    if (assignedTo) {
      updates.push('follow_up_assigned_to = $3');
      params.push(assignedTo);
    }

    const result = await this.query(
      `UPDATE pm_communication_logs SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length) {
      eventBus.emit('communication.followup_rescheduled', {
        logId,
        newDate,
        assignedTo,
      });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  async getCommunicationStats(organizationId: string, projectId?: string): Promise<any> {
    const projectFilter = projectId ? 'AND project_id = $2' : '';
    const params = projectId ? [organizationId, projectId] : [organizationId];

    const result = await this.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE type = 'phone_call') as phone_calls,
         COUNT(*) FILTER (WHERE type = 'whatsapp') as whatsapp,
         COUNT(*) FILTER (WHERE type = 'email') as emails,
         COUNT(*) FILTER (WHERE type = 'site_visit') as site_visits,
         COUNT(*) FILTER (WHERE type = 'in_person') as in_person,
         COUNT(*) FILTER (WHERE requires_follow_up = true AND follow_up_completed = false) as pending_followups,
         COUNT(*) FILTER (WHERE requires_follow_up = true AND follow_up_completed = false AND follow_up_date < NOW()) as overdue_followups
       FROM pm_communication_logs
       WHERE organization_id = $1 ${projectFilter}`,
      params
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      byType: {
        phoneCalls: parseInt(row.phone_calls, 10),
        whatsapp: parseInt(row.whatsapp, 10),
        emails: parseInt(row.emails, 10),
        siteVisits: parseInt(row.site_visits, 10),
        inPerson: parseInt(row.in_person, 10),
      },
      followUps: {
        pending: parseInt(row.pending_followups, 10),
        overdue: parseInt(row.overdue_followups, 10),
      },
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  protected mapRow(row: any): CommunicationLog {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      teamMemberId: row.team_member_id,
      vendorId: row.vendor_id,
      type: row.type,
      direction: row.direction,
      subject: row.subject,
      content: row.content,
      summary: row.summary,
      initiatedBy: row.initiated_by,
      initiatedByName: row.initiated_by_name,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      duration: row.duration,
      requiresFollowUp: row.requires_follow_up,
      followUpDate: row.follow_up_date ? new Date(row.follow_up_date) : null,
      followUpAssignedTo: row.follow_up_assigned_to,
      followUpCompleted: row.follow_up_completed,
      attachments: row.attachments || [],
      createdAt: new Date(row.created_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const communicationService = new CommunicationServiceImpl();
