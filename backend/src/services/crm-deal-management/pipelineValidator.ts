/**
 * Pipeline Validator
 * Phase 5.2: CRM Service Layer
 * 
 * Validates pipeline stage transitions to enforce workflow rules
 * CRITICAL: Server-side validation prevents invalid state changes
 */

import db from '../../database';
import { logger } from '../../utils/logger';

export class PipelineValidator {
  /**
   * Validate that a stage belongs to a pipeline
   */
  async validateStageInPipeline(
    pipelineId: string,
    stageId: string,
    organizationId: string
  ): Promise<void> {
    try {
      const result = await db.query(
        `SELECT ds.id 
         FROM deal_stages ds
         JOIN deal_pipelines dp ON ds.pipeline_id = dp.id
         WHERE ds.id = $1 
           AND ds.pipeline_id = $2 
           AND dp.organization_id = $3
           AND ds.is_active = true
           AND dp.is_active = true
           AND dp.deleted_at IS NULL`,
        [stageId, pipelineId, organizationId]
      );

      if (result.rows.length === 0) {
        throw new Error(
          `Invalid stage: Stage ${stageId} does not belong to pipeline ${pipelineId} or is inactive`
        );
      }
    } catch (error) {
      logger.error('Stage validation failed', { error, pipelineId, stageId, organizationId });
      throw error;
    }
  }

  /**
   * Validate stage transition
   * CRITICAL: Enforces allowed_next_stages rules from database
   */
  async validateStageTransition(
    pipelineId: string,
    currentStageId: string,
    newStageId: string,
    organizationId: string
  ): Promise<void> {
    try {
      // If same stage, allow (no change)
      if (currentStageId === newStageId) {
        return;
      }

      // Get current stage with allowed transitions
      const result = await db.query(
        `SELECT ds.stage_name, ds.allowed_next_stages
         FROM deal_stages ds
         JOIN deal_pipelines dp ON ds.pipeline_id = dp.id
         WHERE ds.id = $1 
           AND ds.pipeline_id = $2 
           AND dp.organization_id = $3
           AND ds.is_active = true`,
        [currentStageId, pipelineId, organizationId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Current stage ${currentStageId} not found or inactive`);
      }

      const currentStage = result.rows[0];
      const allowedNextStages = currentStage.allowed_next_stages || [];

      // Check if transition is allowed
      if (allowedNextStages.length > 0 && !allowedNextStages.includes(newStageId)) {
        // Get stage names for better error message
        const stageNamesResult = await db.query(
          `SELECT id, stage_name FROM deal_stages WHERE id = ANY($1)`,
          [allowedNextStages]
        );

        const allowedStageNames = stageNamesResult.rows.map((r) => r.stage_name).join(', ');

        throw new Error(
          `Invalid stage transition: Cannot move from "${currentStage.stage_name}" to the selected stage. ` +
          `Allowed next stages: ${allowedStageNames}`
        );
      }

      // Validate new stage exists and is active
      const newStageResult = await db.query(
        `SELECT ds.id, ds.stage_name
         FROM deal_stages ds
         WHERE ds.id = $1 
           AND ds.pipeline_id = $2 
           AND ds.is_active = true`,
        [newStageId, pipelineId]
      );

      if (newStageResult.rows.length === 0) {
        throw new Error(`Target stage ${newStageId} not found or inactive`);
      }

      logger.info('Stage transition validated', {
        pipelineId,
        currentStageId,
        newStageId,
        organizationId,
      });
    } catch (error) {
      logger.error('Stage transition validation failed', {
        error,
        pipelineId,
        currentStageId,
        newStageId,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Get allowed next stages for a current stage
   */
  async getAllowedNextStages(
    currentStageId: string,
    pipelineId: string,
    organizationId: string
  ): Promise<Array<{ id: string; stage_name: string; stage_order: number; stage_color: string }>> {
    try {
      const result = await db.query<{ id: string; stage_name: string; stage_order: number; stage_color: string }>(
        `SELECT ds.id, ds.stage_name, ds.stage_order, ds.stage_color
         FROM deal_stages ds
         WHERE ds.id = ANY(
           SELECT allowed_next_stages 
           FROM deal_stages 
           WHERE id = $1 AND pipeline_id = $2
         )
         AND ds.pipeline_id = $2
         AND ds.is_active = true
         ORDER BY ds.stage_order`,
        [currentStageId, pipelineId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error fetching allowed next stages', {
        error,
        currentStageId,
        pipelineId,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Check if stage has requirements
   */
  async validateStageRequirements(
    stageId: string,
    dealData: Record<string, any>
  ): Promise<{ valid: boolean; missingRequirements: string[] }> {
    try {
      const result = await db.query(
        `SELECT requirements FROM deal_stages WHERE id = $1`,
        [stageId]
      );

      if (result.rows.length === 0) {
        return { valid: true, missingRequirements: [] };
      }

      const requirements = result.rows[0].requirements;
      if (!requirements || Object.keys(requirements).length === 0) {
        return { valid: true, missingRequirements: [] };
      }

      const missing: string[] = [];

      // Check each requirement
      for (const [field, config] of Object.entries(requirements)) {
        const fieldConfig = config as any;

        if (fieldConfig.required && !dealData[field]) {
          missing.push(field);
        }

        // Add more validation rules as needed (min/max values, etc.)
      }

      return {
        valid: missing.length === 0,
        missingRequirements: missing,
      };
    } catch (error) {
      logger.error('Error validating stage requirements', { error, stageId });
      throw error;
    }
  }
}

export const pipelineValidator = new PipelineValidator();
