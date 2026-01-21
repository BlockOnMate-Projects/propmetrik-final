/**
 * Activity Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles immutable activity logging for deals
 * IMPORTANT: Activities are append-only (no updates or deletes)
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { DealActivity, CreateActivityInput } from './types';
import { PoolClient } from 'pg';

export class ActivityService {
    /**
     * Create a new activity (immutable)
     * Can optionally pass a client for transaction support
     */
    async createActivity(
        data: CreateActivityInput,
        client?: PoolClient
    ): Promise<DealActivity> {
        const id = uuidv4();
        const dbClient = client || db.pool;

        try {
            const result = await dbClient.query<DealActivity>(
                `INSERT INTO deal_activities (
          id, deal_id, contact_id, user_id,
          activity_type, subject, description, outcome,
          old_value, new_value, activity_date, duration_minutes,
          next_action, next_action_date, next_action_assigned_to, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
          COALESCE($11, NOW()), $12, $13, $14, $15, $16
        ) RETURNING *`,
                [
                    id,
                    data.deal_id,
                    data.contact_id || null,
                    data.user_id,
                    data.activity_type,
                    data.subject || null,
                    data.description || null,
                    data.outcome || null,
                    data.old_value ? JSON.stringify(data.old_value) : null,
                    data.new_value ? JSON.stringify(data.new_value) : null,
                    data.activity_date || null,
                    data.duration_minutes || null,
                    data.next_action || null,
                    data.next_action_date || null,
                    data.next_action_assigned_to || null,
                    data.notes || null,
                ]
            );

            const activity = result.rows[0];

            // Note: deal metrics (last_activity_at, total_activities) are auto-updated by trigger

            logger.info('Activity created', { activityId: id, dealId: data.deal_id });
            return activity;
        } catch (error) {
            logger.error('Error creating activity', { error, dealId: data.deal_id });
            throw error;
        }
    }

    /**
     * Get activity timeline for a deal
     */
    async getActivitiesByDeal(
        dealId: string,
        organizationId: string,
        limit: number = 100
    ): Promise<DealActivity[]> {
        try {
            const result = await db.query<DealActivity>(
                `SELECT 
          da.*,
          c.first_name || ' ' || c.last_name as contact_name,
          u.email as user_email,
          u.first_name || ' ' || u.last_name as user_name
         FROM deal_activities da
         LEFT JOIN contacts c ON da.contact_id = c.id
         LEFT JOIN users u ON da.user_id = u.id
         JOIN deals d ON da.deal_id = d.id
         WHERE da.deal_id = $1 AND d.organization_id = $2
         ORDER BY da.activity_date DESC, da.created_at DESC
         LIMIT $3`,
                [dealId, organizationId, limit]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching deal activities', { error, dealId, organizationId });
            throw error;
        }
    }

    /**
     * Get activities with pending follow-ups
     */
    async getPendingFollowUps(
        organizationId: string,
        userId?: string
    ): Promise<DealActivity[]> {
        try {
            const params: any[] = [organizationId];
            let userFilter = '';

            if (userId) {
                userFilter = 'AND (da.next_action_assigned_to = $2 OR d.assigned_agent = $2)';
                params.push(userId);
            }

            const result = await db.query<DealActivity>(
                `SELECT 
          da.*,
          d.deal_number,
          d.title as deal_title,
          c.first_name || ' ' || c.last_name as contact_name
         FROM deal_activities da
         JOIN deals d ON da.deal_id = d.id
         LEFT JOIN contacts c ON da.contact_id = c.id
         WHERE d.organization_id = $1
           AND da.next_action IS NOT NULL
           AND da.next_action_date IS NOT NULL
           AND da.next_action_date <= CURRENT_DATE + INTERVAL '7 days'
           ${userFilter}
           AND d.deleted_at IS NULL
           AND d.deal_status = 'active'
         ORDER BY da.next_action_date ASC
         LIMIT 50`,
                params
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching pending follow-ups', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get activity statistics for a deal
     */
    async getDealActivityStats(
        dealId: string,
        organizationId: string
    ): Promise<{
        total_activities: number;
        by_type: Record<string, number>;
        last_activity_date: Date | null;
        avg_response_time_days: number;
    }> {
        try {
            const result = await db.query(
                `SELECT 
          COUNT(*) as total_activities,
          MAX(activity_date) as last_activity_date,
          json_object_agg(COALESCE(activity_type, 'unknown'), type_count) as by_type
         FROM (
           SELECT 
             activity_type,
             activity_date,
             COUNT(*) OVER (PARTITION BY activity_type) as type_count
           FROM deal_activities da
           JOIN deals d ON da.deal_id = d.id
           WHERE da.deal_id = $1 AND d.organization_id = $2
         ) subquery`,
                [dealId, organizationId]
            );

            const row = result.rows[0];
            return {
                total_activities: parseInt(row.total_activities, 10),
                by_type: row.by_type || {},
                last_activity_date: row.last_activity_date,
                avg_response_time_days: 0, // TODO: Calculate based on activity gaps
            };
        } catch (error) {
            logger.error('Error fetching deal activity stats', { error, dealId, organizationId });
            throw error;
        }
    }
}

export const activityService = new ActivityService();
