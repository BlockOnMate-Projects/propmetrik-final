/**
 * Target Service
 * 
 * Phase 5.7 Week 1: Sales Targets & Performance Management
 * 
 * Features:
 * - CRUD for sales targets (org/team/agent level)
 * - Cascading targets with parent-child relationships
 * - Pacing indicators (on_track, behind, ahead, at_risk)
 * - Achievement tracking and badge awards
 * - Streak management for gamification
 * - Leaderboard generation
 */

import { pool as db } from '../../database';
import { logger } from '../../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type TargetType = 'revenue' | 'deal_count' | 'activities' | 'conversion_rate';
export type TargetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type PacingStatus = 'on_track' | 'behind' | 'ahead' | 'at_risk' | 'achieved';
export type TargetStatus = 'active' | 'achieved' | 'missed' | 'cancelled';

export interface SalesTarget {
    id: string;
    organization_id: string;
    agent_id?: string;
    team_id?: string;
    parent_target_id?: string;
    target_name: string;
    target_type: TargetType;
    target_period: TargetPeriod;
    period_start: Date;
    period_end: Date;
    target_value: number;
    stretch_target?: number;
    minimum_threshold?: number;
    achieved_value: number;
    achievement_percentage: number;
    pacing_status: PacingStatus;
    days_remaining: number;
    projected_achievement: number;
    status: TargetStatus;
    notes?: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    // Joined fields
    agent_name?: string;
    agent_avatar?: string;
}

export interface CreateTargetInput {
    organization_id: string;
    agent_id?: string;
    team_id?: string;
    parent_target_id?: string;
    target_name: string;
    target_type: TargetType;
    target_period: TargetPeriod;
    period_start: Date;
    period_end: Date;
    target_value: number;
    stretch_target?: number;
    minimum_threshold?: number;
    notes?: string;
    created_by?: string;
}

export interface UpdateTargetInput {
    target_name?: string;
    target_value?: number;
    stretch_target?: number;
    minimum_threshold?: number;
    status?: TargetStatus;
    notes?: string;
}

export interface TargetFilters {
    agent_id?: string;
    team_id?: string;
    target_type?: TargetType;
    target_period?: TargetPeriod;
    status?: TargetStatus;
    pacing_status?: PacingStatus;
    period_start?: Date;
    period_end?: Date;
}

export interface Achievement {
    id: string;
    organization_id: string;
    agent_id: string;
    achievement_type: string;
    achievement_name: string;
    achievement_description?: string;
    achievement_date: Date;
    metadata: Record<string, any>;
    badge_icon?: string;
    badge_color?: string;
    points_earned: number;
    is_public: boolean;
    created_at: Date;
}

export interface LeaderboardEntry {
    agent_id: string;
    full_name: string;
    avatar_url?: string;
    title?: string;
    mtd_revenue: number;
    mtd_deals: number;
    qtd_revenue: number;
    qtd_deals: number;
    ytd_revenue: number;
    ytd_deals: number;
    total_achievements: number;
    total_points: number;
    deal_streak: number;
    current_target_percentage: number;
    mtd_rank: number;
}

export interface TargetStats {
    total_targets: number;
    active_targets: number;
    achieved_targets: number;
    missed_targets: number;
    on_track_count: number;
    behind_count: number;
    ahead_count: number;
    average_achievement: number;
}

export interface AgentStreak {
    agent_id: string;
    streak_type: string;
    current_streak: number;
    longest_streak: number;
    last_activity_date: Date;
}

// ============================================================================
// Target Service Class
// ============================================================================

class TargetService {
    // ========================================================================
    // CRUD Operations
    // ========================================================================

    /**
     * Create a new sales target
     */
    async create(input: CreateTargetInput): Promise<SalesTarget> {
        const result = await db.query<SalesTarget>(`
            INSERT INTO sales_targets (
                organization_id, agent_id, team_id, parent_target_id,
                target_name, target_type, target_period,
                period_start, period_end,
                target_value, stretch_target, minimum_threshold,
                notes, created_by,
                days_remaining
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $9::date - CURRENT_DATE
            )
            RETURNING *
        `, [
            input.organization_id,
            input.agent_id,
            input.team_id,
            input.parent_target_id,
            input.target_name,
            input.target_type,
            input.target_period,
            input.period_start,
            input.period_end,
            input.target_value,
            input.stretch_target,
            input.minimum_threshold,
            input.notes,
            input.created_by
        ]);

        const target = result.rows[0];
        logger.info('Target created', { targetId: target.id, agentId: input.agent_id });

        // Update progress immediately
        await this.updateProgress(target.id);

        return target;
    }

    /**
     * Get a target by ID
     */
    async getById(id: string): Promise<SalesTarget | null> {
        const result = await db.query<SalesTarget>(`
            SELECT t.*, 
                   a.full_name AS agent_name,
                   a.avatar_url AS agent_avatar
            FROM sales_targets t
            LEFT JOIN crm_agents a ON a.id = t.agent_id
            WHERE t.id = $1
        `, [id]);

        return result.rows[0] || null;
    }

    /**
     * Get all targets for an organization with filters
     */
    async getAll(organizationId: string, filters: TargetFilters = {}): Promise<SalesTarget[]> {
        let query = `
            SELECT t.*, 
                   a.full_name AS agent_name,
                   a.avatar_url AS agent_avatar
            FROM sales_targets t
            LEFT JOIN crm_agents a ON a.id = t.agent_id
            WHERE t.organization_id = $1
        `;
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.agent_id) {
            query += ` AND t.agent_id = $${paramIndex++}`;
            params.push(filters.agent_id);
        }

        if (filters.team_id) {
            query += ` AND t.team_id = $${paramIndex++}`;
            params.push(filters.team_id);
        }

        if (filters.target_type) {
            query += ` AND t.target_type = $${paramIndex++}`;
            params.push(filters.target_type);
        }

        if (filters.target_period) {
            query += ` AND t.target_period = $${paramIndex++}`;
            params.push(filters.target_period);
        }

        if (filters.status) {
            query += ` AND t.status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters.pacing_status) {
            query += ` AND t.pacing_status = $${paramIndex++}`;
            params.push(filters.pacing_status);
        }

        if (filters.period_start) {
            query += ` AND t.period_end >= $${paramIndex++}`;
            params.push(filters.period_start);
        }

        if (filters.period_end) {
            query += ` AND t.period_start <= $${paramIndex++}`;
            params.push(filters.period_end);
        }

        query += ` ORDER BY t.period_end DESC, t.created_at DESC`;

        const result = await db.query<SalesTarget>(query, params);
        return result.rows;
    }

    /**
     * Get active targets for an agent
     */
    async getActiveForAgent(agentId: string): Promise<SalesTarget[]> {
        const result = await db.query<SalesTarget>(`
            SELECT t.*, 
                   a.full_name AS agent_name,
                   a.avatar_url AS agent_avatar
            FROM sales_targets t
            LEFT JOIN crm_agents a ON a.id = t.agent_id
            WHERE t.agent_id = $1
              AND t.status = 'active'
              AND t.period_start <= CURRENT_DATE
              AND t.period_end >= CURRENT_DATE
            ORDER BY t.target_type, t.period_end
        `, [agentId]);

        return result.rows;
    }

    /**
     * Update a target
     */
    async update(id: string, input: UpdateTargetInput): Promise<SalesTarget | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (input.target_name !== undefined) {
            fields.push(`target_name = $${paramIndex++}`);
            values.push(input.target_name);
        }

        if (input.target_value !== undefined) {
            fields.push(`target_value = $${paramIndex++}`);
            values.push(input.target_value);
        }

        if (input.stretch_target !== undefined) {
            fields.push(`stretch_target = $${paramIndex++}`);
            values.push(input.stretch_target);
        }

        if (input.minimum_threshold !== undefined) {
            fields.push(`minimum_threshold = $${paramIndex++}`);
            values.push(input.minimum_threshold);
        }

        if (input.status !== undefined) {
            fields.push(`status = $${paramIndex++}`);
            values.push(input.status);
        }

        if (input.notes !== undefined) {
            fields.push(`notes = $${paramIndex++}`);
            values.push(input.notes);
        }

        if (fields.length === 0) return this.getById(id);

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const result = await db.query<SalesTarget>(`
            UPDATE sales_targets
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, values);

        if (result.rows[0]) {
            await this.updateProgress(id);
        }

        return result.rows[0] || null;
    }

    /**
     * Delete a target
     */
    async delete(id: string): Promise<boolean> {
        const result = await db.query(`
            DELETE FROM sales_targets WHERE id = $1
        `, [id]);

        return (result.rowCount ?? 0) > 0;
    }

    // ========================================================================
    // Progress & Pacing
    // ========================================================================

    /**
     * Update target progress (calls the SQL function)
     */
    async updateProgress(targetId: string): Promise<void> {
        await db.query(`SELECT update_target_progress($1)`, [targetId]);
    }

    /**
     * Update all active targets (for cron job)
     */
    async updateAllActiveTargets(organizationId?: string): Promise<number> {
        let query = `
            SELECT id FROM sales_targets
            WHERE status = 'active'
              AND period_start <= CURRENT_DATE
              AND period_end >= CURRENT_DATE
        `;
        const params: any[] = [];

        if (organizationId) {
            query += ` AND organization_id = $1`;
            params.push(organizationId);
        }

        const result = await db.query<{ id: string }>(query, params);

        for (const row of result.rows) {
            await this.updateProgress(row.id);
        }

        logger.info('Updated target progress', { count: result.rows.length });
        return result.rows.length;
    }

    /**
     * Get target statistics for an organization
     */
    async getStats(organizationId: string, agentId?: string): Promise<TargetStats> {
        let whereClause = 'organization_id = $1';
        const params: any[] = [organizationId];

        if (agentId) {
            whereClause += ' AND agent_id = $2';
            params.push(agentId);
        }

        const result = await db.query<any>(`
            SELECT 
                COUNT(*) AS total_targets,
                COUNT(*) FILTER (WHERE status = 'active') AS active_targets,
                COUNT(*) FILTER (WHERE status = 'achieved') AS achieved_targets,
                COUNT(*) FILTER (WHERE status = 'missed') AS missed_targets,
                COUNT(*) FILTER (WHERE pacing_status = 'on_track' AND status = 'active') AS on_track_count,
                COUNT(*) FILTER (WHERE pacing_status = 'behind' AND status = 'active') AS behind_count,
                COUNT(*) FILTER (WHERE pacing_status = 'ahead' AND status = 'active') AS ahead_count,
                COALESCE(AVG(achievement_percentage) FILTER (WHERE status IN ('active', 'achieved')), 0) AS average_achievement
            FROM sales_targets
            WHERE ${whereClause}
        `, params);

        const row = result.rows[0];
        return {
            total_targets: parseInt(row.total_targets) || 0,
            active_targets: parseInt(row.active_targets) || 0,
            achieved_targets: parseInt(row.achieved_targets) || 0,
            missed_targets: parseInt(row.missed_targets) || 0,
            on_track_count: parseInt(row.on_track_count) || 0,
            behind_count: parseInt(row.behind_count) || 0,
            ahead_count: parseInt(row.ahead_count) || 0,
            average_achievement: parseFloat(row.average_achievement) || 0,
        };
    }

    // ========================================================================
    // Achievements & Gamification
    // ========================================================================

    /**
     * Award an achievement to an agent
     */
    async awardAchievement(
        organizationId: string,
        agentId: string,
        achievementType: string,
        metadata: Record<string, any> = {}
    ): Promise<Achievement | null> {
        // Get badge info
        const badgeResult = await db.query<any>(`
            SELECT * FROM achievement_badges WHERE badge_key = $1
        `, [achievementType]);

        const badge = badgeResult.rows[0];
        if (!badge) {
            logger.warn('Achievement badge not found', { achievementType });
            return null;
        }

        // Check if already awarded (for unique achievements)
        const existingResult = await db.query(`
            SELECT id FROM agent_achievements
            WHERE agent_id = $1 AND achievement_type = $2
              AND DATE(achievement_date) = CURRENT_DATE
        `, [agentId, achievementType]);

        if (existingResult.rows.length > 0) {
            logger.debug('Achievement already awarded today', { agentId, achievementType });
            return null;
        }

        // Award the achievement
        const result = await db.query<Achievement>(`
            INSERT INTO agent_achievements (
                organization_id, agent_id, achievement_type,
                achievement_name, achievement_description,
                achievement_date, metadata,
                badge_icon, badge_color, points_earned
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, $9)
            RETURNING *
        `, [
            organizationId,
            agentId,
            achievementType,
            badge.badge_name,
            badge.badge_description,
            metadata,
            badge.icon,
            badge.color,
            badge.points
        ]);

        logger.info('Achievement awarded', {
            agentId,
            achievementType,
            points: badge.points
        });

        return result.rows[0];
    }

    /**
     * Get achievements for an agent
     */
    async getAgentAchievements(agentId: string, limit: number = 50): Promise<Achievement[]> {
        const result = await db.query<Achievement>(`
            SELECT * FROM agent_achievements
            WHERE agent_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [agentId, limit]);

        return result.rows;
    }

    /**
     * Get all available badges
     */
    async getBadges(organizationId?: string): Promise<any[]> {
        const result = await db.query(`
            SELECT * FROM achievement_badges
            WHERE is_active = TRUE
              AND (organization_id IS NULL OR organization_id = $1)
            ORDER BY tier, badge_name
        `, [organizationId]);

        return result.rows;
    }

    // ========================================================================
    // Streaks
    // ========================================================================

    /**
     * Increment a streak for an agent
     */
    async incrementStreak(
        organizationId: string,
        agentId: string,
        streakType: string
    ): Promise<AgentStreak> {
        // Upsert streak
        const result = await db.query<AgentStreak>(`
            INSERT INTO agent_streaks (
                organization_id, agent_id, streak_type,
                current_streak, longest_streak, last_activity_date, streak_started_at
            ) VALUES ($1, $2, $3, 1, 1, CURRENT_DATE, CURRENT_DATE)
            ON CONFLICT (organization_id, agent_id, streak_type)
            DO UPDATE SET
                current_streak = CASE
                    WHEN agent_streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                    THEN agent_streaks.current_streak + 1
                    WHEN agent_streaks.last_activity_date = CURRENT_DATE
                    THEN agent_streaks.current_streak
                    ELSE 1
                END,
                longest_streak = GREATEST(
                    agent_streaks.longest_streak,
                    CASE
                        WHEN agent_streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                        THEN agent_streaks.current_streak + 1
                        ELSE 1
                    END
                ),
                last_activity_date = CURRENT_DATE,
                streak_started_at = CASE
                    WHEN agent_streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                    THEN agent_streaks.streak_started_at
                    WHEN agent_streaks.last_activity_date = CURRENT_DATE
                    THEN agent_streaks.streak_started_at
                    ELSE CURRENT_DATE
                END,
                updated_at = NOW()
            RETURNING *
        `, [organizationId, agentId, streakType]);

        const streak = result.rows[0];

        // Check for streak achievements
        if (streakType === 'deal_close') {
            if (streak.current_streak === 3) {
                await this.awardAchievement(organizationId, agentId, 'deal_streak_3', { streak: 3 });
            } else if (streak.current_streak === 5) {
                await this.awardAchievement(organizationId, agentId, 'deal_streak_5', { streak: 5 });
            } else if (streak.current_streak === 10) {
                await this.awardAchievement(organizationId, agentId, 'deal_streak_10', { streak: 10 });
            }
        }

        return streak;
    }

    /**
     * Get streak for an agent
     */
    async getStreak(agentId: string, streakType: string): Promise<AgentStreak | null> {
        const result = await db.query<AgentStreak>(`
            SELECT * FROM agent_streaks
            WHERE agent_id = $1 AND streak_type = $2
        `, [agentId, streakType]);

        return result.rows[0] || null;
    }

    // ========================================================================
    // Leaderboard
    // ========================================================================

    /**
     * Get leaderboard for an organization
     */
    async getLeaderboard(
        organizationId: string,
        period: 'mtd' | 'qtd' | 'ytd' = 'mtd',
        limit: number = 10
    ): Promise<LeaderboardEntry[]> {
        const orderColumn = period === 'mtd' ? 'mtd_revenue' 
            : period === 'qtd' ? 'qtd_revenue' 
            : 'ytd_revenue';

        const result = await db.query<LeaderboardEntry>(`
            SELECT * FROM v_agent_leaderboard
            WHERE organization_id = $1
            ORDER BY ${orderColumn} DESC
            LIMIT $2
        `, [organizationId, limit]);

        return result.rows;
    }

    /**
     * Get an agent's rank
     */
    async getAgentRank(agentId: string, period: 'mtd' | 'qtd' | 'ytd' = 'mtd'): Promise<number> {
        const result = await db.query<any>(`
            SELECT mtd_rank FROM v_agent_leaderboard
            WHERE agent_id = $1
        `, [agentId]);

        return result.rows[0]?.mtd_rank || 0;
    }

    // ========================================================================
    // Checkpoints
    // ========================================================================

    /**
     * Create a checkpoint for a target
     */
    async createCheckpoint(
        targetId: string,
        checkpointNumber: number,
        expectedValue: number,
        actualValue: number,
        notes?: string
    ): Promise<any> {
        const variancePercentage = expectedValue > 0 
            ? ((actualValue - expectedValue) / expectedValue) * 100 
            : 0;

        const pacingStatus = variancePercentage >= 10 ? 'ahead'
            : variancePercentage >= -10 ? 'on_track'
            : 'behind';

        const result = await db.query(`
            INSERT INTO target_checkpoints (
                target_id, checkpoint_date, checkpoint_number,
                expected_value, actual_value, variance_percentage, pacing_status, notes
            ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [targetId, checkpointNumber, expectedValue, actualValue, variancePercentage, pacingStatus, notes]);

        return result.rows[0];
    }

    /**
     * Get checkpoints for a target
     */
    async getCheckpoints(targetId: string): Promise<any[]> {
        const result = await db.query(`
            SELECT * FROM target_checkpoints
            WHERE target_id = $1
            ORDER BY checkpoint_date
        `, [targetId]);

        return result.rows;
    }

    // ========================================================================
    // Bulk Operations
    // ========================================================================

    /**
     * Create targets for all active agents in an organization
     */
    async createBulkTargets(
        organizationId: string,
        targetType: TargetType,
        targetPeriod: TargetPeriod,
        targetValue: number,
        periodStart: Date,
        periodEnd: Date,
        createdBy?: string
    ): Promise<SalesTarget[]> {
        // Get all active agents
        const agentsResult = await db.query<{ id: string }>(`
            SELECT id FROM crm_agents
            WHERE organization_id = $1 AND is_active = TRUE
        `, [organizationId]);

        const targets: SalesTarget[] = [];

        for (const agent of agentsResult.rows) {
            const target = await this.create({
                organization_id: organizationId,
                agent_id: agent.id,
                target_name: `${targetPeriod.charAt(0).toUpperCase() + targetPeriod.slice(1)} ${targetType} Target`,
                target_type: targetType,
                target_period: targetPeriod,
                period_start: periodStart,
                period_end: periodEnd,
                target_value: targetValue,
                stretch_target: targetValue * 1.2,
                minimum_threshold: targetValue * 0.8,
                created_by: createdBy,
            });
            targets.push(target);
        }

        logger.info('Bulk targets created', {
            organizationId,
            count: targets.length,
            targetType,
            targetPeriod
        });

        return targets;
    }

    // ========================================================================
    // Event Handlers (called from deal service)
    // ========================================================================

    /**
     * Handle deal closure - update targets and streaks
     */
    async onDealClosed(
        organizationId: string,
        agentId: string,
        dealValue: number
    ): Promise<void> {
        // Update streaks
        await this.incrementStreak(organizationId, agentId, 'deal_close');

        // Update active targets
        const activeTargets = await this.getActiveForAgent(agentId);
        for (const target of activeTargets) {
            await this.updateProgress(target.id);

            // Check for achievement
            const updated = await this.getById(target.id);
            if (updated && updated.status === 'achieved' && target.status !== 'achieved') {
                await this.awardAchievement(organizationId, agentId, 'target_achieved', {
                    target_id: target.id,
                    target_name: target.target_name
                });

                // Check stretch
                if (updated.stretch_target && updated.achieved_value >= updated.stretch_target) {
                    await this.awardAchievement(organizationId, agentId, 'target_stretch', {
                        target_id: target.id,
                        target_name: target.target_name
                    });
                }
            }
        }

        // Check first deal achievement
        const dealsResult = await db.query(`
            SELECT COUNT(*) as count FROM deals
            WHERE assigned_agent_id = $1 AND status = 'won'
        `, [agentId]);

        if (parseInt(dealsResult.rows[0].count) === 1) {
            await this.awardAchievement(organizationId, agentId, 'first_deal', {});
        }

        // Check revenue milestones
        const revenueResult = await db.query<{ total: string }>(`
            SELECT COALESCE(SUM(deal_value), 0) as total FROM deals
            WHERE assigned_agent_id = $1 AND status = 'won'
              AND closed_at >= date_trunc('year', CURRENT_DATE)
        `, [agentId]);

        const ytdRevenue = parseFloat(revenueResult.rows[0].total);
        
        if (ytdRevenue >= 1000000) {
            await this.awardAchievement(organizationId, agentId, 'revenue_1m', { revenue: ytdRevenue });
        } else if (ytdRevenue >= 500000) {
            await this.awardAchievement(organizationId, agentId, 'revenue_500k', { revenue: ytdRevenue });
        } else if (ytdRevenue >= 100000) {
            await this.awardAchievement(organizationId, agentId, 'revenue_100k', { revenue: ytdRevenue });
        }
    }
}

// Export singleton instance
export const targetService = new TargetService();
