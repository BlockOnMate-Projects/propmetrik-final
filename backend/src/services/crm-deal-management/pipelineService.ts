/**
 * Pipeline Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles pipeline and stage management with organization-specific configuration.
 * Pipelines are configurable per organization and support enforced stage transitions.
 * 
 * @module services/crm-deal-management/pipelineService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { DealPipeline, DealStage, DealType } from './types';

// =============================================
// Types
// =============================================

export interface CreatePipelineInput {
    pipeline_name: string;
    pipeline_type: DealType;
    description?: string;
    color?: string;
    is_default?: boolean;
}

export interface UpdatePipelineInput {
    pipeline_name?: string;
    description?: string;
    color?: string;
    is_default?: boolean;
    is_active?: boolean;
}

export interface CreateStageInput {
    pipeline_id: string;
    stage_name: string;
    stage_order: number;
    stage_color?: string;
    description?: string;
    requirements?: Record<string, any>;
    allowed_next_stages?: string[];
    auto_transition_rules?: Record<string, any>;
}

export interface UpdateStageInput {
    stage_name?: string;
    stage_order?: number;
    stage_color?: string;
    description?: string;
    requirements?: Record<string, any>;
    allowed_next_stages?: string[];
    auto_transition_rules?: Record<string, any>;
    is_active?: boolean;
}

export interface PipelineWithStages extends DealPipeline {
    stages: DealStage[];
    deal_count?: number;
}

// =============================================
// Pipeline Service Class
// =============================================

export class PipelineService {
    /**
     * Create a new pipeline
     */
    async createPipeline(
        organizationId: string,
        data: CreatePipelineInput,
        userId?: string
    ): Promise<DealPipeline> {
        const id = uuidv4();

        try {
            // If setting as default, unset other defaults for this type
            if (data.is_default) {
                await db.query(
                    `UPDATE deal_pipelines 
                    SET is_default = false 
                    WHERE organization_id = $1 AND pipeline_type = $2 AND deleted_at IS NULL`,
                    [organizationId, data.pipeline_type]
                );
            }

            const result = await db.query<DealPipeline>(
                `INSERT INTO deal_pipelines (
                    id, organization_id, pipeline_name, pipeline_type,
                    description, color, is_default, is_active, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
                RETURNING *`,
                [
                    id,
                    organizationId,
                    data.pipeline_name,
                    data.pipeline_type,
                    data.description || null,
                    data.color || '#10B981',
                    data.is_default || false,
                    userId || null,
                ]
            );

            logger.info('Pipeline created', { pipelineId: id, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error creating pipeline', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get pipeline by ID with stages
     */
    async getPipelineById(
        pipelineId: string,
        organizationId: string
    ): Promise<PipelineWithStages | null> {
        try {
            const pipelineResult = await db.query<DealPipeline>(
                `SELECT * FROM deal_pipelines 
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [pipelineId, organizationId]
            );

            if (pipelineResult.rows.length === 0) {
                return null;
            }

            const pipeline = pipelineResult.rows[0];

            // Get stages
            const stagesResult = await db.query<DealStage>(
                `SELECT * FROM deal_stages 
                WHERE pipeline_id = $1 AND is_active = true 
                ORDER BY stage_order`,
                [pipelineId]
            );

            // Get deal count
            const countResult = await db.query(
                `SELECT COUNT(*) as count FROM deals 
                WHERE pipeline_id = $1 AND deleted_at IS NULL`,
                [pipelineId]
            );

            return {
                ...pipeline,
                stages: stagesResult.rows,
                deal_count: parseInt(countResult.rows[0].count, 10),
            };
        } catch (error) {
            logger.error('Error fetching pipeline', { error, pipelineId, organizationId });
            throw error;
        }
    }

    /**
     * List all pipelines for organization
     */
    async listPipelines(
        organizationId: string,
        includeStages: boolean = true
    ): Promise<PipelineWithStages[]> {
        try {
            const result = await db.query<DealPipeline>(
                `SELECT dp.*, 
                    (SELECT COUNT(*) FROM deals d WHERE d.pipeline_id = dp.id AND d.deleted_at IS NULL) as deal_count
                FROM deal_pipelines dp
                WHERE dp.organization_id = $1 AND dp.deleted_at IS NULL AND dp.is_active = true
                ORDER BY dp.is_default DESC, dp.pipeline_type, dp.created_at`,
                [organizationId]
            );

            const pipelines: PipelineWithStages[] = [];

            for (const pipeline of result.rows) {
                let stages: DealStage[] = [];

                if (includeStages) {
                    const stagesResult = await db.query<DealStage>(
                        `SELECT * FROM deal_stages 
                        WHERE pipeline_id = $1 AND is_active = true 
                        ORDER BY stage_order`,
                        [pipeline.id]
                    );
                    stages = stagesResult.rows;
                }

                pipelines.push({
                    ...pipeline,
                    stages,
                });
            }

            return pipelines;
        } catch (error) {
            logger.error('Error listing pipelines', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get default pipeline for a deal type
     */
    async getDefaultPipeline(
        organizationId: string,
        dealType: DealType
    ): Promise<PipelineWithStages | null> {
        try {
            const result = await db.query<DealPipeline>(
                `SELECT * FROM deal_pipelines 
                WHERE organization_id = $1 AND pipeline_type = $2 
                AND is_default = true AND is_active = true AND deleted_at IS NULL
                LIMIT 1`,
                [organizationId, dealType]
            );

            if (result.rows.length === 0) {
                // Fall back to any active pipeline of this type
                const fallbackResult = await db.query<DealPipeline>(
                    `SELECT * FROM deal_pipelines 
                    WHERE organization_id = $1 AND pipeline_type = $2 
                    AND is_active = true AND deleted_at IS NULL
                    ORDER BY created_at
                    LIMIT 1`,
                    [organizationId, dealType]
                );

                if (fallbackResult.rows.length === 0) {
                    return null;
                }

                return this.getPipelineById(fallbackResult.rows[0].id, organizationId);
            }

            return this.getPipelineById(result.rows[0].id, organizationId);
        } catch (error) {
            logger.error('Error fetching default pipeline', { error, organizationId, dealType });
            throw error;
        }
    }

    /**
     * Update pipeline
     */
    async updatePipeline(
        pipelineId: string,
        organizationId: string,
        data: UpdatePipelineInput
    ): Promise<DealPipeline> {
        try {
            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (data.pipeline_name !== undefined) {
                updates.push(`pipeline_name = $${paramIndex}`);
                params.push(data.pipeline_name);
                paramIndex++;
            }

            if (data.description !== undefined) {
                updates.push(`description = $${paramIndex}`);
                params.push(data.description);
                paramIndex++;
            }

            if (data.color !== undefined) {
                updates.push(`color = $${paramIndex}`);
                params.push(data.color);
                paramIndex++;
            }

            if (data.is_active !== undefined) {
                updates.push(`is_active = $${paramIndex}`);
                params.push(data.is_active);
                paramIndex++;
            }

            if (data.is_default !== undefined) {
                updates.push(`is_default = $${paramIndex}`);
                params.push(data.is_default);
                paramIndex++;

                // If setting as default, unset other defaults
                if (data.is_default) {
                    // Get the pipeline type first
                    const pipelineResult = await db.query(
                        `SELECT pipeline_type FROM deal_pipelines WHERE id = $1`,
                        [pipelineId]
                    );
                    if (pipelineResult.rows.length > 0) {
                        await db.query(
                            `UPDATE deal_pipelines 
                            SET is_default = false 
                            WHERE organization_id = $1 AND pipeline_type = $2 AND id != $3 AND deleted_at IS NULL`,
                            [organizationId, pipelineResult.rows[0].pipeline_type, pipelineId]
                        );
                    }
                }
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(pipelineId, organizationId);

            const result = await db.query<DealPipeline>(
                `UPDATE deal_pipelines
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
                RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Pipeline not found or unauthorized');
            }

            logger.info('Pipeline updated', { pipelineId, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating pipeline', { error, pipelineId, organizationId });
            throw error;
        }
    }

    /**
     * Soft delete pipeline (only if no active deals)
     */
    async deletePipeline(pipelineId: string, organizationId: string): Promise<void> {
        try {
            // Check for active deals
            const dealCheck = await db.query(
                `SELECT COUNT(*) as count FROM deals 
                WHERE pipeline_id = $1 AND deal_status = 'active' AND deleted_at IS NULL`,
                [pipelineId]
            );

            if (parseInt(dealCheck.rows[0].count, 10) > 0) {
                throw new Error('Cannot delete pipeline with active deals');
            }

            const result = await db.query(
                `UPDATE deal_pipelines
                SET deleted_at = NOW(), is_active = false
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                RETURNING id`,
                [pipelineId, organizationId]
            );

            if (result.rows.length === 0) {
                throw new Error('Pipeline not found or already deleted');
            }

            logger.info('Pipeline soft deleted', { pipelineId, organizationId });
        } catch (error) {
            logger.error('Error deleting pipeline', { error, pipelineId, organizationId });
            throw error;
        }
    }

    // =============================================
    // Stage Management
    // =============================================

    /**
     * Create a new stage
     */
    async createStage(
        organizationId: string,
        data: CreateStageInput
    ): Promise<DealStage> {
        const id = uuidv4();

        try {
            // Verify pipeline belongs to organization
            const pipelineCheck = await db.query(
                `SELECT id FROM deal_pipelines 
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [data.pipeline_id, organizationId]
            );

            if (pipelineCheck.rows.length === 0) {
                throw new Error('Pipeline not found or unauthorized');
            }

            const result = await db.query<DealStage>(
                `INSERT INTO deal_stages (
                    id, pipeline_id, stage_name, stage_order, stage_color,
                    description, requirements, allowed_next_stages, auto_transition_rules, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
                RETURNING *`,
                [
                    id,
                    data.pipeline_id,
                    data.stage_name,
                    data.stage_order,
                    data.stage_color || '#6B7280',
                    data.description || null,
                    data.requirements ? JSON.stringify(data.requirements) : null,
                    data.allowed_next_stages || null,
                    data.auto_transition_rules ? JSON.stringify(data.auto_transition_rules) : null,
                ]
            );

            logger.info('Stage created', { stageId: id, pipelineId: data.pipeline_id });
            return result.rows[0];
        } catch (error) {
            logger.error('Error creating stage', { error, pipelineId: data.pipeline_id });
            throw error;
        }
    }

    /**
     * Update stage
     */
    async updateStage(
        stageId: string,
        organizationId: string,
        data: UpdateStageInput
    ): Promise<DealStage> {
        try {
            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (data.stage_name !== undefined) {
                updates.push(`stage_name = $${paramIndex}`);
                params.push(data.stage_name);
                paramIndex++;
            }

            if (data.stage_order !== undefined) {
                updates.push(`stage_order = $${paramIndex}`);
                params.push(data.stage_order);
                paramIndex++;
            }

            if (data.stage_color !== undefined) {
                updates.push(`stage_color = $${paramIndex}`);
                params.push(data.stage_color);
                paramIndex++;
            }

            if (data.description !== undefined) {
                updates.push(`description = $${paramIndex}`);
                params.push(data.description);
                paramIndex++;
            }

            if (data.requirements !== undefined) {
                updates.push(`requirements = $${paramIndex}`);
                params.push(JSON.stringify(data.requirements));
                paramIndex++;
            }

            if (data.allowed_next_stages !== undefined) {
                updates.push(`allowed_next_stages = $${paramIndex}`);
                params.push(data.allowed_next_stages);
                paramIndex++;
            }

            if (data.auto_transition_rules !== undefined) {
                updates.push(`auto_transition_rules = $${paramIndex}`);
                params.push(JSON.stringify(data.auto_transition_rules));
                paramIndex++;
            }

            if (data.is_active !== undefined) {
                updates.push(`is_active = $${paramIndex}`);
                params.push(data.is_active);
                paramIndex++;
            }

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(stageId, organizationId);

            const result = await db.query<DealStage>(
                `UPDATE deal_stages ds
                SET ${updates.join(', ')}
                FROM deal_pipelines dp
                WHERE ds.id = $${paramIndex} 
                    AND ds.pipeline_id = dp.id 
                    AND dp.organization_id = $${paramIndex + 1}
                    AND dp.deleted_at IS NULL
                RETURNING ds.*`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Stage not found or unauthorized');
            }

            logger.info('Stage updated', { stageId, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating stage', { error, stageId, organizationId });
            throw error;
        }
    }

    /**
     * Get stages for a pipeline
     */
    async getStagesByPipeline(
        pipelineId: string,
        organizationId: string
    ): Promise<DealStage[]> {
        try {
            const result = await db.query<DealStage>(
                `SELECT ds.*, 
                    (SELECT COUNT(*) FROM deals d WHERE d.stage_id = ds.id AND d.deleted_at IS NULL) as deal_count
                FROM deal_stages ds
                JOIN deal_pipelines dp ON ds.pipeline_id = dp.id
                WHERE ds.pipeline_id = $1 AND dp.organization_id = $2 AND ds.is_active = true
                ORDER BY ds.stage_order`,
                [pipelineId, organizationId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching stages', { error, pipelineId, organizationId });
            throw error;
        }
    }

    /**
     * Reorder stages
     */
    async reorderStages(
        pipelineId: string,
        organizationId: string,
        stageOrder: { stageId: string; order: number }[]
    ): Promise<void> {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Verify pipeline ownership
            const pipelineCheck = await client.query(
                `SELECT id FROM deal_pipelines 
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [pipelineId, organizationId]
            );

            if (pipelineCheck.rows.length === 0) {
                throw new Error('Pipeline not found or unauthorized');
            }

            // Update each stage order
            for (const item of stageOrder) {
                await client.query(
                    `UPDATE deal_stages 
                    SET stage_order = $1 
                    WHERE id = $2 AND pipeline_id = $3`,
                    [item.order, item.stageId, pipelineId]
                );
            }

            await client.query('COMMIT');
            logger.info('Stages reordered', { pipelineId, organizationId });
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error reordering stages', { error, pipelineId, organizationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get first stage of a pipeline (for new deals)
     */
    async getFirstStage(pipelineId: string): Promise<DealStage | null> {
        try {
            const result = await db.query<DealStage>(
                `SELECT * FROM deal_stages 
                WHERE pipeline_id = $1 AND is_active = true 
                ORDER BY stage_order 
                LIMIT 1`,
                [pipelineId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching first stage', { error, pipelineId });
            throw error;
        }
    }

    /**
     * Clone a pipeline for an organization
     * Useful for creating custom pipelines from templates
     */
    async clonePipeline(
        sourcePipelineId: string,
        organizationId: string,
        newName: string,
        userId?: string
    ): Promise<PipelineWithStages> {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Get source pipeline
            const sourceResult = await client.query<DealPipeline>(
                `SELECT * FROM deal_pipelines WHERE id = $1 AND deleted_at IS NULL`,
                [sourcePipelineId]
            );

            if (sourceResult.rows.length === 0) {
                throw new Error('Source pipeline not found');
            }

            const source = sourceResult.rows[0];

            // Create new pipeline
            const newPipelineId = uuidv4();
            await client.query(
                `INSERT INTO deal_pipelines (
                    id, organization_id, pipeline_name, pipeline_type,
                    description, color, is_default, is_active, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, false, true, $7)`,
                [
                    newPipelineId,
                    organizationId,
                    newName,
                    source.pipeline_type,
                    source.description,
                    source.color,
                    userId || null,
                ]
            );

            // Get source stages
            const stagesResult = await client.query<DealStage>(
                `SELECT * FROM deal_stages 
                WHERE pipeline_id = $1 AND is_active = true 
                ORDER BY stage_order`,
                [sourcePipelineId]
            );

            // Create stage ID mapping for allowed_next_stages
            const stageIdMap: Record<string, string> = {};

            // First pass: create stages and build ID map
            for (const stage of stagesResult.rows) {
                const newStageId = uuidv4();
                stageIdMap[stage.id] = newStageId;

                await client.query(
                    `INSERT INTO deal_stages (
                        id, pipeline_id, stage_name, stage_order, stage_color,
                        description, requirements, auto_transition_rules, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
                    [
                        newStageId,
                        newPipelineId,
                        stage.stage_name,
                        stage.stage_order,
                        stage.stage_color,
                        stage.description,
                        stage.requirements ? JSON.stringify(stage.requirements) : null,
                        stage.auto_transition_rules ? JSON.stringify(stage.auto_transition_rules) : null,
                    ]
                );
            }

            // Second pass: update allowed_next_stages with new IDs
            for (const stage of stagesResult.rows) {
                if (stage.allowed_next_stages && stage.allowed_next_stages.length > 0) {
                    const newAllowedNextStages = stage.allowed_next_stages
                        .map((id: string) => stageIdMap[id])
                        .filter(Boolean);

                    await client.query(
                        `UPDATE deal_stages SET allowed_next_stages = $1 WHERE id = $2`,
                        [newAllowedNextStages, stageIdMap[stage.id]]
                    );
                }
            }

            await client.query('COMMIT');

            logger.info('Pipeline cloned', {
                sourcePipelineId,
                newPipelineId,
                organizationId,
            });

            // Return the new pipeline with stages
            return (await this.getPipelineById(newPipelineId, organizationId))!;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error cloning pipeline', { error, sourcePipelineId, organizationId });
            throw error;
        } finally {
            client.release();
        }
    }
}

export const pipelineService = new PipelineService();
