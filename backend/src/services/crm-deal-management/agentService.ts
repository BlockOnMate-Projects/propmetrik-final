/**
 * Agent Service
 * CRM Agent Management - Handles agent CRUD and performance tracking
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { inviteService } from '../shared/inviteService';

// =====================================================
// TYPES
// =====================================================

export type AgentStatus = 'active' | 'inactive' | 'suspended' | 'pending_approval';

export type AgentSpecialization = 
    | 'residential_sales'
    | 'commercial_sales'
    | 'residential_rentals'
    | 'commercial_rentals'
    | 'land_sales'
    | 'property_management'
    | 'investment_advisory'
    | 'valuation'
    | 'general';

export interface Agent {
    id: string;
    organization_id: string;
    user_id?: string;
    first_name: string;
    last_name: string;
    display_name?: string;
    email: string;
    phone_primary: string;
    phone_secondary?: string;
    whatsapp_number?: string;
    avatar_url?: string;
    license_number?: string;
    license_expiry?: string;
    ghana_real_estate_board_id?: string;
    specializations: AgentSpecialization[];
    regions_covered?: string[];
    languages?: string[];
    years_experience: number;
    bio?: string;
    default_commission_rate: number;
    commission_split_rate: number;
    base_salary?: number;
    total_deals_closed: number;
    total_sales_volume: number;
    total_commission_earned: number;
    average_deal_value: number;
    average_days_to_close: number;
    current_active_deals: number;
    current_active_listings: number;
    customer_rating: number;
    rating_count: number;
    status: AgentStatus;
    hire_date?: string;
    termination_date?: string;
    team_id?: string;
    supervisor_id?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
}

export interface CreateAgentInput {
    first_name: string;
    last_name: string;
    display_name?: string;
    email: string;
    phone_primary: string;
    phone_secondary?: string;
    whatsapp_number?: string;
    avatar_url?: string;
    license_number?: string;
    license_expiry?: string;
    ghana_real_estate_board_id?: string;
    specializations?: AgentSpecialization[];
    regions_covered?: string[];
    languages?: string[];
    years_experience?: number;
    bio?: string;
    default_commission_rate?: number;
    commission_split_rate?: number;
    base_salary?: number;
    status?: AgentStatus;
    hire_date?: string;
    team_id?: string;
    supervisor_id?: string;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

export interface AgentFilters {
    page?: number;
    limit?: number;
    search?: string;
    status?: AgentStatus;
    specialization?: AgentSpecialization;
    region?: string;
    team_id?: string;
}

export interface AgentStats {
    total_agents: number;
    active_agents: number;
    total_deals_this_month: number;
    total_volume_this_month: number;
    average_rating: number;
}

// =====================================================
// SERVICE CLASS
// =====================================================

export class AgentService {
    /**
     * List agents with filtering and pagination
     */
    async listAgents(
        organizationId: string,
        filters: AgentFilters = {}
    ): Promise<{ data: Agent[]; pagination: { total: number; page: number; limit: number; total_pages: number } }> {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE a.organization_id = $1 AND a.deleted_at IS NULL';
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.search) {
            whereClause += ` AND (
                a.first_name ILIKE $${paramIndex} OR 
                a.last_name ILIKE $${paramIndex} OR 
                a.email ILIKE $${paramIndex} OR
                a.display_name ILIKE $${paramIndex}
            )`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        if (filters.status) {
            whereClause += ` AND a.status = $${paramIndex}`;
            params.push(filters.status);
            paramIndex++;
        }

        if (filters.specialization) {
            whereClause += ` AND $${paramIndex} = ANY(a.specializations)`;
            params.push(filters.specialization);
            paramIndex++;
        }

        if (filters.region) {
            whereClause += ` AND $${paramIndex} = ANY(a.regions_covered)`;
            params.push(filters.region);
            paramIndex++;
        }

        if (filters.team_id) {
            whereClause += ` AND a.team_id = $${paramIndex}`;
            params.push(filters.team_id);
            paramIndex++;
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM agents a ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total || '0');

        // Get paginated data
        const dataParams = [...params, limit, offset];
        const result = await db.query<Agent>(
            `SELECT a.* FROM agents a
             ${whereClause}
             ORDER BY a.first_name ASC, a.last_name ASC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            dataParams
        );

        return {
            data: result.rows,
            pagination: {
                total,
                page,
                limit,
                total_pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get agent by ID
     */
    async getAgentById(id: string, organizationId: string): Promise<Agent | null> {
        const result = await db.query<Agent>(
            `SELECT * FROM agents 
             WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, organizationId]
        );
        return result.rows[0] || null;
    }

    /**
     * Create a new agent
     */
    async createAgent(
        organizationId: string,
        data: CreateAgentInput,
        userId?: string
    ): Promise<Agent> {
        const id = uuidv4();

        const result = await db.query<Agent>(
            `INSERT INTO agents (
                id, organization_id, first_name, last_name, display_name,
                email, phone_primary, phone_secondary, whatsapp_number, avatar_url,
                license_number, license_expiry, ghana_real_estate_board_id,
                specializations, regions_covered, languages, years_experience, bio,
                default_commission_rate, commission_split_rate, base_salary,
                status, hire_date, team_id, supervisor_id, created_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26
            ) RETURNING *`,
            [
                id,
                organizationId,
                data.first_name,
                data.last_name,
                data.display_name || `${data.first_name} ${data.last_name}`,
                data.email,
                data.phone_primary,
                data.phone_secondary || null,
                data.whatsapp_number || null,
                data.avatar_url || null,
                data.license_number || null,
                data.license_expiry || null,
                data.ghana_real_estate_board_id || null,
                data.specializations || ['general'],
                data.regions_covered || null,
                data.languages || ['english'],
                data.years_experience || 0,
                data.bio || null,
                data.default_commission_rate || 3.0,
                data.commission_split_rate || 50.0,
                data.base_salary || null,
                data.status || 'active',
                data.hire_date || new Date().toISOString().split('T')[0],
                data.team_id || null,
                data.supervisor_id || null,
                userId || null
            ]
        );

        logger.info('Agent created', { agentId: id, organizationId });

        // Send invitation email so the agent can set a password and log in
        if (userId && data.email) {
            try {
                await inviteService.createInvitation({
                    email: data.email,
                    role: 'agent',
                    userType: 'staff',
                    organizationId,
                    invitedById: userId,
                    firstName: data.first_name,
                    lastName: data.last_name,
                });
                logger.info('Agent invitation sent', { agentId: id, email: data.email });
            } catch (inviteErr: any) {
                // Non-fatal — agent record exists even if invitation fails
                logger.warn('Agent invitation could not be sent', {
                    agentId: id,
                    email: data.email,
                    error: inviteErr.message,
                });
            }
        }

        return result.rows[0];
    }

    /**
     * Update an agent
     */
    async updateAgent(
        id: string,
        organizationId: string,
        data: UpdateAgentInput,
        userId?: string
    ): Promise<Agent> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        const fieldMap: Record<string, string> = {
            first_name: 'first_name',
            last_name: 'last_name',
            display_name: 'display_name',
            email: 'email',
            phone_primary: 'phone_primary',
            phone_secondary: 'phone_secondary',
            whatsapp_number: 'whatsapp_number',
            avatar_url: 'avatar_url',
            license_number: 'license_number',
            license_expiry: 'license_expiry',
            ghana_real_estate_board_id: 'ghana_real_estate_board_id',
            specializations: 'specializations',
            regions_covered: 'regions_covered',
            languages: 'languages',
            years_experience: 'years_experience',
            bio: 'bio',
            default_commission_rate: 'default_commission_rate',
            commission_split_rate: 'commission_split_rate',
            base_salary: 'base_salary',
            status: 'status',
            hire_date: 'hire_date',
            team_id: 'team_id',
            supervisor_id: 'supervisor_id'
        };

        for (const [key, column] of Object.entries(fieldMap)) {
            if (data[key as keyof UpdateAgentInput] !== undefined) {
                updates.push(`${column} = $${paramIndex}`);
                values.push(data[key as keyof UpdateAgentInput]);
                paramIndex++;
            }
        }

        if (userId) {
            updates.push(`updated_by = $${paramIndex}`);
            values.push(userId);
            paramIndex++;
        }

        if (updates.length === 0) {
            const existing = await this.getAgentById(id, organizationId);
            if (!existing) throw new Error('Agent not found');
            return existing;
        }

        values.push(id, organizationId);
        const result = await db.query<Agent>(
            `UPDATE agents SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Agent not found');
        }

        logger.info('Agent updated', { agentId: id, organizationId });
        return result.rows[0];
    }

    /**
     * Soft delete an agent
     */
    async deleteAgent(id: string, organizationId: string): Promise<void> {
        const result = await db.query(
            `UPDATE agents SET deleted_at = NOW() 
             WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
            [id, organizationId]
        );

        if (result.rowCount === 0) {
            throw new Error('Agent not found');
        }

        logger.info('Agent deleted', { agentId: id, organizationId });
    }

    /**
     * Get agent statistics for an organization
     */
    async getAgentStats(organizationId: string): Promise<AgentStats> {
        const result = await db.query(
            `SELECT 
                COUNT(*) FILTER (WHERE deleted_at IS NULL) as total_agents,
                COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL) as active_agents,
                COALESCE(AVG(customer_rating) FILTER (WHERE customer_rating > 0 AND deleted_at IS NULL), 0) as average_rating
             FROM agents
             WHERE organization_id = $1`,
            [organizationId]
        );

        // Get this month's deals count and volume
        const monthResult = await db.query(
            `SELECT 
                COUNT(*) as deals_count,
                COALESCE(SUM(deal_value), 0) as total_volume
             FROM deals
             WHERE organization_id = $1 
               AND deal_status = 'won'
               AND actual_close_date >= date_trunc('month', CURRENT_DATE)
               AND deleted_at IS NULL`,
            [organizationId]
        );

        const stats = result.rows[0];
        const monthStats = monthResult.rows[0];

        return {
            total_agents: parseInt(stats.total_agents || '0'),
            active_agents: parseInt(stats.active_agents || '0'),
            total_deals_this_month: parseInt(monthStats.deals_count || '0'),
            total_volume_this_month: parseFloat(monthStats.total_volume || '0'),
            average_rating: parseFloat(stats.average_rating || '0')
        };
    }

    /**
     * Get agent's assigned deals
     */
    async getAgentDeals(agentId: string, organizationId: string): Promise<any[]> {
        const result = await db.query(
            `SELECT d.*, ds.stage_name, dp.pipeline_name
             FROM deals d
             LEFT JOIN deal_stages ds ON d.stage_id = ds.id
             LEFT JOIN deal_pipelines dp ON d.pipeline_id = dp.id
             WHERE d.assigned_agent = $1 AND d.organization_id = $2 AND d.deleted_at IS NULL
             ORDER BY d.created_at DESC
             LIMIT 50`,
            [agentId, organizationId]
        );
        return result.rows;
    }

    /**
     * Get agent's assigned contacts
     */
    async getAgentContacts(agentId: string, organizationId: string): Promise<any[]> {
        const result = await db.query(
            `SELECT c.*
             FROM contacts c
             WHERE c.assigned_agent = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL
             ORDER BY c.created_at DESC
             LIMIT 50`,
            [agentId, organizationId]
        );
        return result.rows;
    }

    /**
     * Update agent performance metrics (called periodically)
     */
    async updateAgentMetrics(agentId: string, organizationId: string): Promise<void> {
        await db.query(
            `UPDATE agents SET
                total_deals_closed = (
                    SELECT COUNT(*) FROM deals 
                    WHERE assigned_agent = $1 AND deal_status = 'won' AND deleted_at IS NULL
                ),
                total_sales_volume = (
                    SELECT COALESCE(SUM(deal_value), 0) FROM deals 
                    WHERE assigned_agent = $1 AND deal_status = 'won' AND deleted_at IS NULL
                ),
                current_active_deals = (
                    SELECT COUNT(*) FROM deals 
                    WHERE assigned_agent = $1 AND deal_status = 'active' AND deleted_at IS NULL
                ),
                average_deal_value = (
                    SELECT COALESCE(AVG(deal_value), 0) FROM deals 
                    WHERE assigned_agent = $1 AND deal_status = 'won' AND deleted_at IS NULL
                )
             WHERE id = $1 AND organization_id = $2`,
            [agentId, organizationId]
        );
    }
}

// Export singleton instance
export const agentService = new AgentService();
