/**
 * Contribution Workflow API Routes
 * 
 * Endpoints for contribution prompts, submissions, credits, and reputation.
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  gapDetectionService,
  contributionService,
  ContributionSubmission,
  ContributionPrompt,
} from '../services/valuation-engine/contributionWorkflowService';
import { pythonClient } from '../services/valuation-engine/pythonClient';
import { authenticate, AuthenticatedUser } from '../middleware/auth';
import { pool } from '../database';

// Use Express extended Request with AuthenticatedUser
type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

const router = Router();

// =====================================================
// GAP ANALYSIS
// =====================================================

/**
 * @route   POST /api/contributions/analyze-gaps
 * @desc    Analyze comparable gaps for a property
 * @access  Protected
 */
router.post(
  '/analyze-gaps',
  authenticate,
  [
    body('propertyId').isUUID().withMessage('Valid property ID required'),
    body('targetConfidence')
      .optional()
      .isIn(['high', 'medium', 'low'])
      .withMessage('Invalid confidence level'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { propertyId, targetConfidence = 'high' } = req.body;

      // Get property details
      const propertyResult = await pool.query(
        'SELECT * FROM properties WHERE id = $1',
        [propertyId]
      );

      if (propertyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Property not found' });
      }

      const property = propertyResult.rows[0];

      // Get current comparables from database
      const comparablesResult = await pool.query(`
        SELECT * FROM properties 
        WHERE id != $1 
          AND property_type = $2 
          AND region = $3
          AND created_at > NOW() - INTERVAL '365 days'
        ORDER BY created_at DESC
        LIMIT 20
      `, [propertyId, property.property_type, property.region]);
      
      const comparables = comparablesResult.rows;

      // Analyze gaps
      const gapAnalysis = await gapDetectionService.analyzeGaps(
        property,
        comparables,
        targetConfidence
      );

      res.json({
        success: true,
        data: gapAnalysis,
      });
    } catch (error) {
      console.error('Gap analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze gaps' });
    }
  }
);

// =====================================================
// CONTRIBUTION PROMPTS
// =====================================================

/**
 * @route   GET /api/contributions/prompts
 * @desc    Get active contribution prompts
 * @access  Protected
 */
router.get(
  '/prompts',
  authenticate,
  [
    query('region').optional().isString(),
    query('type').optional().isIn(['comparable', 'property_update', 'transaction', 'market_data']),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { region, type, limit = 20 } = req.query;

      let query = `
        SELECT 
          cp.*,
          p.address_city,
          p.property_type,
          p.price as reference_price
        FROM contribution_prompts cp
        LEFT JOIN properties p ON p.id = cp.property_id
        WHERE cp.status = 'active'
        AND cp.expires_at > NOW()
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (region) {
        query += ` AND cp.region = $${paramIndex++}`;
        params.push(region);
      }

      if (type) {
        query += ` AND cp.prompt_type = $${paramIndex++}`;
        params.push(type);
      }

      query += ` ORDER BY cp.base_reward_credits DESC, cp.expires_at ASC LIMIT $${paramIndex++}`;
      params.push(limit);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('Get prompts error:', error);
      res.status(500).json({ error: 'Failed to get contribution prompts' });
    }
  }
);

/**
 * @route   GET /api/contributions/prompts/:id
 * @desc    Get a specific contribution prompt
 * @access  Protected
 */
router.get(
  '/prompts/:id',
  authenticate,
  [param('id').isUUID().withMessage('Valid prompt ID required')],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      const result = await pool.query(
        `SELECT cp.*, p.address_city, p.property_type, p.bedrooms, p.bathrooms
         FROM contribution_prompts cp
         LEFT JOIN properties p ON p.id = cp.property_id
         WHERE cp.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Get prompt error:', error);
      res.status(500).json({ error: 'Failed to get contribution prompt' });
    }
  }
);

// =====================================================
// CONTRIBUTION SUBMISSIONS
// =====================================================

/**
 * @route   POST /api/contributions/submit
 * @desc    Submit a contribution
 * @access  Protected
 */
router.post(
  '/submit',
  authenticate,
  [
    body('promptId').optional().isUUID(),
    body('data').isObject().withMessage('Contribution data required'),
    body('data.address').isString().withMessage('Address required'),
    body('data.transaction_price').isNumeric().withMessage('Transaction price required'),
    body('data.property_type').isString().withMessage('Property type required'),
    body('sourceType')
      .isIn(['personal_knowledge', 'transaction_party', 'professional', 'public_record'])
      .withMessage('Valid source type required'),
    body('attestation').isBoolean().withMessage('Attestation required'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { promptId, data, proofDocuments, sourceType, attestation } = req.body;
      const contributorId = req.user!.id;

      // Ensure contributor profile exists
      await contributionService.ensureContributorProfile(contributorId);

      const submission: ContributionSubmission = {
        promptId: promptId || '',
        contributorId,
        data,
        proofDocuments,
        sourceType,
        attestation,
      };

      const result = await contributionService.processContribution(submission);

      // If successful and linked to a prompt, update prompt status
      if (result.status === 'approved' && promptId) {
        await pool.query(
          `UPDATE contribution_prompts 
           SET status = 'fulfilled', fulfilled_by = $1, fulfilled_at = NOW()
           WHERE id = $2 AND status = 'active'`,
          [contributorId, promptId]
        );
      }

      res.status(result.status === 'approved' ? 201 : 400).json({
        success: result.status === 'approved',
        data: result,
      });
    } catch (error) {
      console.error('Contribution submission error:', error);
      res.status(500).json({ error: 'Failed to process contribution' });
    }
  }
);

/**
 * @route   GET /api/contributions/my-submissions
 * @desc    Get user's contribution submissions
 * @access  Protected
 */
router.get(
  '/my-submissions',
  authenticate,
  [
    query('status').optional().isIn(['pending', 'validated', 'approved', 'rejected']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;
      const userId = req.user!.id;

      let query = `
        SELECT 
          cs.*,
          cp.title as prompt_title,
          cp.prompt_type
        FROM contribution_submissions cs
        LEFT JOIN contribution_prompts cp ON cp.id = cs.prompt_id
        WHERE cs.contributor_id = $1
      `;
      const params: any[] = [userId];
      let paramIndex = 2;

      if (status) {
        query += ` AND cs.status = $${paramIndex++}`;
        params.push(status);
      }

      query += ` ORDER BY cs.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM contribution_submissions WHERE contributor_id = $1',
        [userId]
      );

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error('Get submissions error:', error);
      res.status(500).json({ error: 'Failed to get submissions' });
    }
  }
);

// =====================================================
// CONTRIBUTOR PROFILE & CREDITS
// =====================================================

/**
 * @route   GET /api/contributions/profile
 * @desc    Get contributor profile
 * @access  Protected
 */
router.get('/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get or create profile
    const profile = await contributionService.ensureContributorProfile(userId);

    // Get recent credit transactions
    const creditsResult = await pool.query(
      `SELECT * FROM contributor_credits 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        ...profile,
        recentCredits: creditsResult.rows,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * @route   GET /api/contributions/credits/history
 * @desc    Get credit transaction history
 * @access  Protected
 */
router.get(
  '/credits/history',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('type').optional().isIn(['earned', 'spent', 'adjustment', 'bonus', 'expired']),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { limit = 50, offset = 0, type } = req.query;
      const userId = req.user!.id;

      let query = 'SELECT * FROM contributor_credits WHERE user_id = $1';
      const params: any[] = [userId];
      let paramIndex = 2;

      if (type) {
        query += ` AND transaction_type = $${paramIndex++}`;
        params.push(type);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error('Get credit history error:', error);
      res.status(500).json({ error: 'Failed to get credit history' });
    }
  }
);

/**
 * @route   POST /api/contributions/credits/spend
 * @desc    Spend credits on a service
 * @access  Protected
 */
router.post(
  '/credits/spend',
  authenticate,
  [
    body('ruleId').isString().withMessage('Spending rule ID required'),
    body('context').optional().isObject(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { ruleId, context } = req.body;
      const userId = req.user!.id;

      await client.query('BEGIN');

      // Get spending rule
      const ruleResult = await client.query(
        'SELECT * FROM credit_spending_rules WHERE id = $1 AND is_active = TRUE',
        [ruleId]
      );

      if (ruleResult.rows.length === 0) {
        return res.status(404).json({ error: 'Spending rule not found' });
      }

      const rule = ruleResult.rows[0];

      // Get user profile
      const profileResult = await client.query(
        'SELECT * FROM contributor_profiles WHERE user_id = $1',
        [userId]
      );

      if (profileResult.rows.length === 0) {
        return res.status(400).json({ error: 'Contributor profile not found' });
      }

      const profile = profileResult.rows[0];

      // Check tier eligibility
      const tierOrder = ['bronze', 'silver', 'gold', 'platinum'];
      if (tierOrder.indexOf(profile.tier) < tierOrder.indexOf(rule.min_tier)) {
        return res.status(403).json({ 
          error: `This feature requires ${rule.min_tier} tier or higher` 
        });
      }

      // Check available credits
      if (profile.available_credits < rule.credit_cost) {
        return res.status(400).json({ 
          error: 'Insufficient credits',
          required: rule.credit_cost,
          available: profile.available_credits,
        });
      }

      // Deduct credits
      await client.query(
        `UPDATE contributor_profiles 
         SET available_credits = available_credits - $1,
             spent_credits = spent_credits + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [rule.credit_cost, userId]
      );

      // Log transaction
      await client.query(
        `INSERT INTO contributor_credits (
          user_id, credits, transaction_type, source_type, source_id, description
        ) VALUES ($1, $2, 'spent', $3, $4, $5)`,
        [
          userId,
          -rule.credit_cost,
          ruleId,
          JSON.stringify(context),
          rule.name,
        ]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        data: {
          creditsSpent: rule.credit_cost,
          remainingCredits: profile.available_credits - rule.credit_cost,
          service: rule.name,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Spend credits error:', error);
      res.status(500).json({ error: 'Failed to spend credits' });
    } finally {
      client.release();
    }
  }
);

// =====================================================
// ACHIEVEMENTS
// =====================================================

/**
 * @route   GET /api/contributions/achievements
 * @desc    Get user's achievements
 * @access  Protected
 */
router.get('/achievements', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all achievements with user's unlock status
    const result = await pool.query(
      `SELECT 
        a.*,
        ua.unlocked_at,
        ua.credits_awarded,
        CASE WHEN ua.id IS NOT NULL THEN true ELSE false END as is_unlocked
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
       WHERE a.is_active = TRUE
       ORDER BY is_unlocked DESC, a.criteria_value ASC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Failed to get achievements' });
  }
});

// =====================================================
// LEADERBOARD
// =====================================================

/**
 * @route   GET /api/contributions/leaderboard
 * @desc    Get contribution leaderboard
 * @access  Public
 */
router.get(
  '/leaderboard',
  [
    query('type').optional().isIn(['credits', 'contributions', 'reputation']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: Request, res: Response) => {
    try {
      const { type = 'credits', limit = 20 } = req.query;

      let orderBy: string;
      switch (type) {
        case 'contributions':
          orderBy = 'contribution_count DESC';
          break;
        case 'reputation':
          orderBy = 'reputation_score DESC';
          break;
        default:
          orderBy = 'total_credits DESC';
      }

      const result = await pool.query(
        `SELECT 
          cp.user_id,
          u.first_name,
          SUBSTRING(u.last_name, 1, 1) || '.' as last_initial,
          cp.total_credits,
          cp.reputation_score,
          cp.contribution_count,
          cp.tier,
          (SELECT COUNT(*) FROM user_achievements WHERE user_id = cp.user_id) as achievements
         FROM contributor_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.contribution_count > 0
         ORDER BY ${orderBy}
         LIMIT $1`,
        [limit]
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  }
);

export default router;
