/**
 * Contribution Service
 * Manages user contributions to the property database
 */

import crypto from 'crypto';
import { query, transaction, getClient } from '../../database';
import { logger } from '../../utils/logger';
import {
  Contribution,
  CreateContributionInput,
  UpdateContributionInput,
  ContributionFilters,
  PaginatedResult,
  ContributorProfile,
  CreateContributorProfileInput,
  UpdateContributorProfileInput,
  CreditTransaction,
  ValidationStatus,
} from './types';

export class ContributionService {
  /**
   * Calculate hash of contribution data for duplicate detection
   */
  private hashData(data: Record<string, unknown>): string {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get all contributions with optional filtering and pagination
   */
  async findAll(filters: ContributionFilters = {}): Promise<PaginatedResult<Contribution>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      contributor_id,
      contribution_type,
      validation_status,
      property_region,
      from_date,
      to_date,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (contributor_id) {
      conditions.push(`contributor_id = $${paramIndex++}`);
      params.push(contributor_id);
    }
    if (contribution_type) {
      conditions.push(`contribution_type = $${paramIndex++}`);
      params.push(contribution_type);
    }
    if (validation_status) {
      conditions.push(`validation_status = $${paramIndex++}`);
      params.push(validation_status);
    }
    if (property_region) {
      conditions.push(`property_region = $${paramIndex++}`);
      params.push(property_region);
    }
    if (from_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(to_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const validSortColumns = ['created_at', 'validation_status', 'contribution_type', 'trust_score'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) FROM contributions ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query<Contribution>(
      `SELECT * FROM contributions ${whereClause}
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  /**
   * Get a single contribution by ID
   */
  async findById(id: string): Promise<Contribution | null> {
    const result = await query<Contribution>(
      'SELECT * FROM contributions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new contribution
   */
  async create(input: CreateContributionInput): Promise<Contribution> {
    const dataHash = this.hashData(input.data);

    // Check for duplicate contribution
    const existing = await query<{ id: string }>(
      `SELECT id FROM contributions 
       WHERE data_hash = $1 
         AND contributor_id = $2 
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [dataHash, input.contributor_id]
    );

    if (existing.rows.length > 0) {
      throw new Error('Duplicate contribution detected within the last 24 hours');
    }

    // Calculate trust score using database function
    const trustResult = await query<{ trust_score: string }>(
      `SELECT calculate_contribution_trust_score($1, $2::contribution_type_enum) as trust_score`,
      [input.contributor_id, input.contribution_type]
    );
    const trustScore = parseFloat(trustResult.rows[0]?.trust_score || '0.5');

    const result = await query<Contribution>(
      `INSERT INTO contributions (
        contributor_id, contributor_type, contribution_type,
        property_id, property_region, data, data_hash,
        trust_score, source_context, session_id, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING *`,
      [
        input.contributor_id, input.contributor_type, input.contribution_type,
        input.property_id, input.property_region, JSON.stringify(input.data), dataHash,
        trustScore, input.source_context, input.session_id, JSON.stringify(input.metadata || {}),
      ]
    );

    // Update contributor profile pending count
    await query(
      `UPDATE contributor_profiles 
       SET pending_contributions = pending_contributions + 1,
           last_contribution_at = NOW()
       WHERE user_id = $1`,
      [input.contributor_id]
    );

    logger.info('Created contribution', { 
      id: result.rows[0].id, 
      type: input.contribution_type,
      contributor_id: input.contributor_id,
    });

    return result.rows[0];
  }

  /**
   * Update a contribution (typically for validation)
   */
  async update(id: string, input: UpdateContributionInput): Promise<Contribution | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateContributionInput)[] = [
      'validation_status', 'trust_score', 'quality_score',
      'validated_by', 'validation_notes', 'auto_validation_result',
      'is_applied', 'applied_property_id', 'credits_awarded', 'credits_pending', 'metadata'
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        const value = field === 'auto_validation_result' || field === 'metadata'
          ? JSON.stringify(input[field])
          : input[field];
        params.push(value);
      }
    }

    // Auto-set validated_at when status changes from pending
    if (input.validation_status && input.validation_status !== 'pending') {
      updates.push(`validated_at = NOW()`);
    }

    // Auto-set applied_at when is_applied becomes true
    if (input.is_applied) {
      updates.push(`applied_at = NOW()`);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const result = await query<Contribution>(
      `UPDATE contributions 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      params
    );

    return result.rows[0] || null;
  }

  /**
   * Approve a contribution
   */
  async approve(
    id: string, 
    validatorId: string, 
    options?: { 
      notes?: string; 
      quality_score?: number;
      credits?: number;
    }
  ): Promise<Contribution | null> {
    const contribution = await this.findById(id);
    if (!contribution) {
      return null;
    }

    const creditsToAward = options?.credits ?? this.calculateCredits(contribution);

    return await transaction(async (client) => {
      // Update contribution
      const result = await client.query<Contribution>(
        `UPDATE contributions 
         SET validation_status = 'approved',
             validated_by = $2,
             validated_at = NOW(),
             validation_notes = $3,
             quality_score = $4,
             credits_awarded = $5,
             credits_pending = false
         WHERE id = $1
         RETURNING *`,
        [id, validatorId, options?.notes, options?.quality_score, creditsToAward]
      );

      // Update contributor profile
      await client.query(
        `UPDATE contributor_profiles 
         SET accepted_contributions = accepted_contributions + 1,
             pending_contributions = GREATEST(pending_contributions - 1, 0),
             total_contributions = total_contributions + 1,
             credits_balance = credits_balance + $2,
             credits_lifetime_earned = credits_lifetime_earned + $2
         WHERE user_id = $1`,
        [contribution.contributor_id, creditsToAward]
      );

      // Create credit transaction
      await client.query(
        `INSERT INTO credit_transactions (
          user_id, amount, balance_after, transaction_type, contribution_id, description
        ) SELECT 
          $1, $2, credits_balance, 'contribution_reward', $3, $4
         FROM contributor_profiles WHERE user_id = $1`,
        [
          contribution.contributor_id, 
          creditsToAward, 
          id, 
          `Reward for ${contribution.contribution_type} contribution`
        ]
      );

      // Update contributor tier
      await client.query(
        `SELECT update_contributor_tier($1)`,
        [contribution.contributor_id]
      );

      // Record review
      await client.query(
        `INSERT INTO contribution_reviews (
          contribution_id, reviewer_id, is_auto_review,
          previous_status, new_status, quality_score_given
        ) VALUES ($1, $2, false, $3, 'approved', $4)`,
        [id, validatorId, contribution.validation_status, options?.quality_score]
      );

      logger.info('Approved contribution', { 
        id, 
        contributor_id: contribution.contributor_id,
        credits: creditsToAward 
      });

      return result.rows[0];
    });
  }

  /**
   * Reject a contribution
   */
  async reject(
    id: string, 
    validatorId: string, 
    reason: string
  ): Promise<Contribution | null> {
    const contribution = await this.findById(id);
    if (!contribution) {
      return null;
    }

    return await transaction(async (client) => {
      const result = await client.query<Contribution>(
        `UPDATE contributions 
         SET validation_status = 'rejected',
             validated_by = $2,
             validated_at = NOW(),
             validation_notes = $3,
             credits_pending = false
         WHERE id = $1
         RETURNING *`,
        [id, validatorId, reason]
      );

      // Update contributor profile
      await client.query(
        `UPDATE contributor_profiles 
         SET rejected_contributions = rejected_contributions + 1,
             pending_contributions = GREATEST(pending_contributions - 1, 0),
             total_contributions = total_contributions + 1
         WHERE user_id = $1`,
        [contribution.contributor_id]
      );

      // Record review
      await client.query(
        `INSERT INTO contribution_reviews (
          contribution_id, reviewer_id, is_auto_review,
          previous_status, new_status, review_notes
        ) VALUES ($1, $2, false, $3, 'rejected', $4)`,
        [id, validatorId, contribution.validation_status, reason]
      );

      logger.info('Rejected contribution', { 
        id, 
        contributor_id: contribution.contributor_id,
        reason 
      });

      return result.rows[0];
    });
  }

  /**
   * Auto-validate a contribution using rules
   */
  async autoValidate(id: string): Promise<{
    status: ValidationStatus;
    reasons: string[];
    score: number;
  }> {
    const contribution = await this.findById(id);
    if (!contribution) {
      throw new Error('Contribution not found');
    }

    const reasons: string[] = [];
    let score = contribution.trust_score || 0.5;

    // Check data completeness
    const requiredFields = this.getRequiredFields(contribution.contribution_type);
    const missingFields = requiredFields.filter(field => !contribution.data[field]);
    
    if (missingFields.length > 0) {
      reasons.push(`Missing required fields: ${missingFields.join(', ')}`);
      score -= 0.1 * missingFields.length;
    }

    // Check for suspicious patterns
    if (contribution.data.price) {
      const price = Number(contribution.data.price);
      if (price < 1000 || price > 100000000) {
        reasons.push('Price outside reasonable range');
        score -= 0.2;
      }
    }

    // Determine status based on score
    let status: ValidationStatus;
    if (score >= 0.8 && reasons.length === 0) {
      status = 'auto_approved';
    } else if (score < 0.3 || reasons.length > 3) {
      status = 'auto_rejected';
    } else {
      status = 'under_review';
    }

    // Update contribution
    await this.update(id, {
      validation_status: status,
      quality_score: score,
      auto_validation_result: { reasons, score, timestamp: new Date().toISOString() },
    });

    // Record auto-review
    await query(
      `INSERT INTO contribution_reviews (
        contribution_id, is_auto_review, previous_status, new_status, review_notes, quality_score_given
      ) VALUES ($1, true, $2, $3, $4, $5)`,
      [id, contribution.validation_status, status, reasons.join('; '), score]
    );

    return { status, reasons, score };
  }

  /**
   * Get required fields for a contribution type
   */
  private getRequiredFields(type: string): string[] {
    const fieldMap: Record<string, string[]> = {
      new_property: ['address', 'region', 'property_type'],
      comparable: ['address', 'price', 'transaction_date'],
      enrichment: ['field', 'value'],
      correction: ['field', 'old_value', 'new_value', 'reason'],
      verification: ['verified'],
      photo: ['image_url'],
      document: ['document_url', 'document_type'],
      transaction: ['price', 'transaction_date', 'transaction_type'],
    };
    return fieldMap[type] || [];
  }

  /**
   * Calculate credits for a contribution
   */
  private calculateCredits(contribution: Contribution): number {
    const baseCredits: Record<string, number> = {
      new_property: 50,
      comparable: 30,
      enrichment: 10,
      correction: 15,
      verification: 5,
      photo: 10,
      document: 20,
      transaction: 40,
    };

    let credits = baseCredits[contribution.contribution_type] || 10;

    // Bonus for high trust contributors
    if (contribution.trust_score && contribution.trust_score > 0.8) {
      credits = Math.round(credits * 1.2);
    }

    return credits;
  }

  /**
   * Get pending contributions for review
   */
  async getPendingForReview(limit: number = 20): Promise<Contribution[]> {
    const result = await query<Contribution>(
      `SELECT * FROM contributions 
       WHERE validation_status = 'pending'
       ORDER BY trust_score DESC, created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get contribution statistics for a contributor
   */
  async getContributorStats(userId: string): Promise<{
    total: number;
    accepted: number;
    rejected: number;
    pending: number;
    credits_earned: number;
    by_type: Record<string, number>;
  }> {
    const result = await query<{
      total: string;
      accepted: string;
      rejected: string;
      pending: string;
      credits_earned: string;
    }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN validation_status = 'approved' THEN 1 ELSE 0 END) as accepted,
         SUM(CASE WHEN validation_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
         SUM(CASE WHEN validation_status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(credits_awarded) as credits_earned
       FROM contributions
       WHERE contributor_id = $1`,
      [userId]
    );

    const byTypeResult = await query<{ contribution_type: string; count: string }>(
      `SELECT contribution_type, COUNT(*) as count 
       FROM contributions 
       WHERE contributor_id = $1 
       GROUP BY contribution_type`,
      [userId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      accepted: parseInt(row.accepted, 10),
      rejected: parseInt(row.rejected, 10),
      pending: parseInt(row.pending, 10),
      credits_earned: parseInt(row.credits_earned || '0', 10),
      by_type: byTypeResult.rows.reduce((acc, r) => {
        acc[r.contribution_type] = parseInt(r.count, 10);
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// =====================================================
// CONTRIBUTOR PROFILE SERVICE
// =====================================================

export class ContributorProfileService {
  /**
   * Get a contributor profile by user ID
   */
  async findByUserId(userId: string): Promise<ContributorProfile | null> {
    const result = await query<ContributorProfile>(
      'SELECT * FROM contributor_profiles WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create or get a contributor profile
   */
  async getOrCreate(input: CreateContributorProfileInput): Promise<ContributorProfile> {
    let profile = await this.findByUserId(input.user_id);
    
    if (!profile) {
      const result = await query<ContributorProfile>(
        `INSERT INTO contributor_profiles (
          user_id, professional_type, license_number, primary_region, metadata
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          input.user_id, input.professional_type, input.license_number,
          input.primary_region, JSON.stringify(input.metadata || {}),
        ]
      );
      profile = result.rows[0];
      logger.info('Created contributor profile', { user_id: input.user_id });
    }

    return profile;
  }

  /**
   * Update a contributor profile
   */
  async update(userId: string, input: UpdateContributorProfileInput): Promise<ContributorProfile | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateContributorProfileInput)[] = [
      'reputation_score', 'is_verified_professional', 'professional_type',
      'license_number', 'primary_region', 'regions_active', 'metadata'
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        const value = field === 'metadata'
          ? JSON.stringify(input[field])
          : input[field];
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return this.findByUserId(userId);
    }

    params.push(userId);
    const result = await query<ContributorProfile>(
      `UPDATE contributor_profiles 
       SET ${updates.join(', ')} 
       WHERE user_id = $${paramIndex} 
       RETURNING *`,
      params
    );

    return result.rows[0] || null;
  }

  /**
   * Verify a professional contributor
   */
  async verifyProfessional(
    userId: string, 
    licenseNumber: string,
    professionalType: string
  ): Promise<ContributorProfile | null> {
    const result = await query<ContributorProfile>(
      `UPDATE contributor_profiles 
       SET is_verified_professional = true,
           license_number = $2,
           professional_type = $3,
           license_verified_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId, licenseNumber, professionalType]
    );

    if (result.rows[0]) {
      logger.info('Verified professional contributor', { userId, licenseNumber });
    }

    return result.rows[0] || null;
  }

  /**
   * Get top contributors (leaderboard)
   */
  async getLeaderboard(options?: {
    region?: string;
    limit?: number;
    period?: 'week' | 'month' | 'all';
  }): Promise<Array<ContributorProfile & { rank: number }>> {
    const { region, limit = 10, period = 'all' } = options || {};
    
    let sql = `
      SELECT cp.*, RANK() OVER (ORDER BY cp.reputation_score DESC, cp.accepted_contributions DESC) as rank
      FROM contributor_profiles cp
    `;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (region) {
      conditions.push(`cp.primary_region = $${paramIndex++}`);
      params.push(region);
    }

    if (period !== 'all') {
      const interval = period === 'week' ? '7 days' : '30 days';
      conditions.push(`cp.last_contribution_at >= NOW() - INTERVAL '${interval}'`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY rank LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query<ContributorProfile & { rank: string }>(sql, params);
    
    return result.rows.map(row => ({
      ...row,
      rank: parseInt(row.rank, 10),
    }));
  }

  /**
   * Award badge to contributor
   */
  async awardBadge(userId: string, badge: { id: string; name: string }): Promise<void> {
    await query(
      `UPDATE contributor_profiles 
       SET badges = badges || $2::jsonb
       WHERE user_id = $1`,
      [userId, JSON.stringify([{ ...badge, earned_at: new Date().toISOString() }])]
    );

    logger.info('Awarded badge', { userId, badge: badge.name });
  }

  /**
   * Spend credits
   */
  async spendCredits(
    userId: string, 
    amount: number, 
    reason: string
  ): Promise<{ success: boolean; balance: number }> {
    const profile = await this.findByUserId(userId);
    if (!profile || profile.credits_balance < amount) {
      return { success: false, balance: profile?.credits_balance || 0 };
    }

    await transaction(async (client) => {
      await client.query(
        `UPDATE contributor_profiles 
         SET credits_balance = credits_balance - $2,
             credits_lifetime_spent = credits_lifetime_spent + $2
         WHERE user_id = $1`,
        [userId, amount]
      );

      await client.query(
        `INSERT INTO credit_transactions (
          user_id, amount, balance_after, transaction_type, description
        ) SELECT 
          $1, $2, credits_balance, 'redemption', $3
         FROM contributor_profiles WHERE user_id = $1`,
        [userId, -amount, reason]
      );
    });

    const updated = await this.findByUserId(userId);
    return { success: true, balance: updated?.credits_balance || 0 };
  }
}

export const contributionService = new ContributionService();
export const contributorProfileService = new ContributorProfileService();
