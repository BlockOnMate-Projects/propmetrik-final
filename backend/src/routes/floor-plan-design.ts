/**
 * Floor Plan Design Intent API Routes
 * 
 * Endpoints for LLM-generated layout strategies and design intents.
 * Part of the Floor Plan Enhancement Phase 1 implementation.
 * 
 * @module routes/floor-plan-design
 * @version 1.0.0
 * @since 2026-01-14
 */

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type {
  LLMDesignIntent,
  DesignIntentRecord,
  PropertyFeatures,
} from '../types/floorPlanDesign';
import { PropertyFeaturesSchema } from '../types/floorPlanDesign';

const router = Router();

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Validate UUID parameter
 */
const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuid || !uuidRegex.test(uuid)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid ${paramName} format`,
      });
    }
    next();
  };
};

// =====================================================
// DESIGN INTENT ROUTES
// =====================================================

/**
 * POST /api/valuations/:valuationId/floor-plans/design-intent
 * Generate LLM design intent from property features
 * 
 * Request body:
 * - property_features: PropertyFeatures (optional, will fetch from valuation if not provided)
 * - user_preferences: UserLayoutPreferences (optional)
 * 
 * Response:
 * - design_intent: LLMDesignIntent
 * - alternatives: LayoutAlternative[]
 */
router.post(
  '/:valuationId/floor-plans/design-intent',
  validateUUID('valuationId'),
  async (req: Request, res: Response) => {
    try {
      const { valuationId } = req.params;
      const { property_features, user_preferences } = req.body;

      // Validate property features if provided
      if (property_features) {
        const validation = PropertyFeaturesSchema.safeParse(property_features);
        if (!validation.success) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'Invalid property features',
            details: validation.error.errors,
          });
        }
      }

      // Check valuation exists
      const valuationResult = await query(
        'SELECT id, property_id FROM valuations WHERE id = $1',
        [valuationId]
      );

      if (valuationResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Valuation not found',
        });
      }

      // TODO: Phase 2 - Implement LLM design intent generation
      // For now, return 501 Not Implemented as per Phase 1 exit criteria
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'LLM design intent generation will be implemented in Phase 2',
        phase: 2,
        expected_completion: 'Weeks 7-9',
        endpoint: 'POST /api/valuations/:valuationId/floor-plans/design-intent',
      });

    } catch (error: any) {
      logger.error('Failed to generate design intent', { 
        error: error.message,
        valuationId: req.params.valuationId,
      });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to generate design intent',
      });
    }
  }
);

/**
 * GET /api/valuations/:valuationId/floor-plans/design-intent
 * Retrieve existing design intent(s) for a valuation
 * 
 * Query params:
 * - status: Filter by status (generated, validated, applied, rejected)
 * - limit: Max results (default 10)
 * 
 * Response:
 * - design_intents: DesignIntentRecord[]
 * - total: number
 */
router.get(
  '/:valuationId/floor-plans/design-intent',
  validateUUID('valuationId'),
  async (req: Request, res: Response) => {
    try {
      const { valuationId } = req.params;
      const { status, limit = '10' } = req.query;

      // Check valuation exists
      const valuationResult = await query(
        'SELECT id FROM valuations WHERE id = $1',
        [valuationId]
      );

      if (valuationResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Valuation not found',
        });
      }

      // Build query
      let sql = `
        SELECT * FROM valuation_floor_plan_design_intents
        WHERE valuation_id = $1
      `;
      const params: any[] = [valuationId];

      if (status && typeof status === 'string') {
        sql += ` AND status = $2`;
        params.push(status);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit as string, 10));

      const result = await query(sql, params);

      res.json({
        success: true,
        data: {
          design_intents: result.rows,
          total: result.rows.length,
        },
      });

    } catch (error: any) {
      logger.error('Failed to get design intents', { 
        error: error.message,
        valuationId: req.params.valuationId,
      });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to get design intents',
      });
    }
  }
);

/**
 * GET /api/valuations/:valuationId/floor-plans/design-intent/:intentId
 * Get a specific design intent by ID
 */
router.get(
  '/:valuationId/floor-plans/design-intent/:intentId',
  validateUUID('valuationId'),
  validateUUID('intentId'),
  async (req: Request, res: Response) => {
    try {
      const { valuationId, intentId } = req.params;

      const result = await query(
        `SELECT * FROM valuation_floor_plan_design_intents
         WHERE id = $1 AND valuation_id = $2`,
        [intentId, valuationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Design intent not found',
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });

    } catch (error: any) {
      logger.error('Failed to get design intent', { 
        error: error.message,
        intentId: req.params.intentId,
      });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to get design intent',
      });
    }
  }
);

/**
 * POST /api/valuations/:valuationId/floor-plans/design-intent/:intentId/apply
 * Apply design intent → trigger Blender geometry generation
 * 
 * This endpoint takes a validated design intent and passes it to the
 * Blender geometry kernel to generate authoritative geometry.
 */
router.post(
  '/:valuationId/floor-plans/design-intent/:intentId/apply',
  validateUUID('valuationId'),
  validateUUID('intentId'),
  async (req: Request, res: Response) => {
    try {
      const { valuationId, intentId } = req.params;

      // Check design intent exists and belongs to valuation
      const intentResult = await query(
        `SELECT * FROM valuation_floor_plan_design_intents
         WHERE id = $1 AND valuation_id = $2 AND status = 'validated'`,
        [intentId, valuationId]
      );

      if (intentResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Design intent not found or not validated',
        });
      }

      // TODO: Phase 2 - Implement Blender geometry generation
      // For now, return 501 Not Implemented as per Phase 1 exit criteria
      return res.status(501).json({
        error: 'Not Implemented',
        message: 'Blender geometry generation will be implemented in Phase 2',
        phase: 2,
        expected_completion: 'Weeks 4-6',
        endpoint: 'POST /api/valuations/:valuationId/floor-plans/design-intent/:intentId/apply',
      });

    } catch (error: any) {
      logger.error('Failed to apply design intent', { 
        error: error.message,
        intentId: req.params.intentId,
      });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to apply design intent',
      });
    }
  }
);

/**
 * POST /api/valuations/:valuationId/floor-plans/design-intent/:intentId/reject
 * Reject a design intent with reason
 */
router.post(
  '/:valuationId/floor-plans/design-intent/:intentId/reject',
  validateUUID('valuationId'),
  validateUUID('intentId'),
  async (req: Request, res: Response) => {
    try {
      const { valuationId, intentId } = req.params;
      const { rejection_reason } = req.body;

      if (!rejection_reason || typeof rejection_reason !== 'string' || rejection_reason.length < 10) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Rejection reason must be at least 10 characters',
        });
      }

      const result = await query(
        `UPDATE valuation_floor_plan_design_intents
         SET status = 'rejected', 
             rejected_at = NOW(),
             rejected_by = $3,
             rejection_reason = $4
         WHERE id = $1 AND valuation_id = $2
         RETURNING *`,
        [intentId, valuationId, (req as any).user?.id, rejection_reason]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Design intent not found',
        });
      }

      // Log to audit trail
      await query(
        `INSERT INTO valuation_floor_plan_audit_log
         (valuation_id, design_intent_id, action, actor_id, actor_type, justification, timestamp)
         VALUES ($1, $2, 'reject_design_intent', $3, 'user', $4, NOW())`,
        [valuationId, intentId, (req as any).user?.id, rejection_reason]
      );

      res.json({
        success: true,
        data: result.rows[0],
      });

    } catch (error: any) {
      logger.error('Failed to reject design intent', { 
        error: error.message,
        intentId: req.params.intentId,
      });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to reject design intent',
      });
    }
  }
);

export default router;
