/**
 * Contribution Workflow Service
 * 
 * Implements in-valuation comparable gap detection and contribution prompts.
 * Detects when valuation lacks sufficient comparables and prompts users
 * to contribute property data in exchange for credits.
 * 
 * Features:
 * - Comparable gap detection during valuation
 * - Real-time contribution prompts
 * - Contribution processing pipeline
 * - Credit rewards system
 * - Reputation management
 * - Data quality validation
 */

import { Pool } from 'pg';
import { query, transaction, pool } from '../../database';
import { logger } from '../../utils/logger';
import {
  PropertyForValuation,
  ComparableProperty,
  ValuationResult,
  ConfidenceLevel,
  RegionCode,
  PropertyType
} from './types';

// =====================================================
// TYPES
// =====================================================

export interface GapAnalysis {
  hasGap: boolean;
  gapSeverity: 'none' | 'minor' | 'moderate' | 'severe';
  gapReasons: GapReason[];
  requiredComparables: number;
  availableComparables: number;
  missingDataPoints: MissingDataPoint[];
  contributionPrompt: ContributionPrompt | null;
  confidenceImpact: number;
}

export interface GapReason {
  code: string;
  description: string;
  impact: number; // 0-100
  suggestedAction: string;
}

export interface MissingDataPoint {
  field: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  rewardCredits: number;
}

export interface ContributionPrompt {
  id: string;
  type: 'comparable' | 'property_update' | 'transaction' | 'market_data';
  title: string;
  description: string;
  requiredFields: RequiredField[];
  optionalFields: OptionalField[];
  rewardCredits: number;
  expiresAt: Date;
  propertyReference?: string;
  searchCriteria: ComparableSearchCriteria;
}

export interface RequiredField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'location';
  options?: string[];
  validation?: FieldValidation;
}

export interface OptionalField extends RequiredField {
  bonusCredits: number;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface ComparableSearchCriteria {
  region: RegionCode;
  propertyType: PropertyType;
  minArea: number;
  maxArea: number;
  minBedrooms: number;
  maxBedrooms: number;
  priceRange: {
    min: number;
    max: number;
  };
  radiusKm: number;
  maxAgeMonths: number;
}

export interface ContributionSubmission {
  promptId: string;
  contributorId: string;
  data: Record<string, unknown>;
  proofDocuments?: string[];
  sourceType: 'personal_knowledge' | 'transaction_party' | 'professional' | 'public_record';
  attestation: boolean;
}

export interface ContributionResult {
  id: string;
  status: 'pending' | 'validated' | 'approved' | 'rejected';
  creditsAwarded: number;
  validationScore: number;
  feedback?: string;
  contributorReputation: number;
}

export interface ContributorProfile {
  userId: string;
  totalCredits: number;
  availableCredits: number;
  reputationScore: number;
  contributionCount: number;
  validationRate: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  achievements: Achievement[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
  bonusCredits: number;
}

// =====================================================
// CONSTANTS
// =====================================================

const MIN_COMPARABLES_FOR_CONFIDENCE = {
  high: 10,
  medium: 5,
  low: 3,
};

const GAP_SEVERITY_THRESHOLDS = {
  none: 0,
  minor: 0.15,
  moderate: 0.35,
  severe: 0.5,
};

const BASE_CREDITS = {
  comparable_sale: 50,
  rental_data: 30,
  property_update: 20,
  market_insight: 10,
  document_upload: 25,
  transaction_verification: 100,
};

const REPUTATION_MULTIPLIERS = {
  bronze: 1.0,
  silver: 1.25,
  gold: 1.5,
  platinum: 2.0,
};

// =====================================================
// GAP DETECTION SERVICE
// =====================================================

export class GapDetectionService {
  private pool: Pool;

  constructor(dbPool?: Pool) {
    this.pool = dbPool || pool;
  }

  /**
   * Analyze comparable gaps for a valuation
   */
  async analyzeGaps(
    property: PropertyForValuation,
    comparables: ComparableProperty[],
    targetConfidence: ConfidenceLevel = 'high'
  ): Promise<GapAnalysis> {
    const requiredComparables = MIN_COMPARABLES_FOR_CONFIDENCE[targetConfidence];
    const availableComparables = comparables.length;

    const gapReasons: GapReason[] = [];
    const missingDataPoints: MissingDataPoint[] = [];

    // Check comparable count
    if (availableComparables < requiredComparables) {
      gapReasons.push({
        code: 'INSUFFICIENT_COMPARABLES',
        description: `Need ${requiredComparables} comparables for ${targetConfidence} confidence, have ${availableComparables}`,
        impact: Math.min(100, ((requiredComparables - availableComparables) / requiredComparables) * 100),
        suggestedAction: 'Contribute comparable property data to improve valuation accuracy',
      });
    }

    // Check geographic distribution
    const geographicGap = this.analyzeGeographicDistribution(property, comparables);
    if (geographicGap) {
      gapReasons.push(geographicGap);
    }

    // Check temporal recency
    const temporalGap = this.analyzeTemporalDistribution(comparables);
    if (temporalGap) {
      gapReasons.push(temporalGap);
    }

    // Check size match quality
    const sizeGap = this.analyzeSizeMatch(property, comparables);
    if (sizeGap) {
      gapReasons.push(sizeGap);
    }

    // Check amenity coverage
    const amenityGap = this.analyzeAmenityCoverage(property, comparables);
    if (amenityGap) {
      gapReasons.push(amenityGap);
    }

    // Identify missing data points
    missingDataPoints.push(...this.identifyMissingDataPoints(property, comparables));

    // Calculate gap severity
    const gapScore = gapReasons.reduce((sum, r) => sum + r.impact, 0) / Math.max(gapReasons.length, 1);
    const gapSeverity = this.calculateGapSeverity(gapScore);

    // Generate contribution prompt if there's a gap
    const contributionPrompt = gapSeverity !== 'none'
      ? await this.generateContributionPrompt(property, gapReasons, missingDataPoints)
      : null;

    return {
      hasGap: gapSeverity !== 'none',
      gapSeverity,
      gapReasons,
      requiredComparables,
      availableComparables,
      missingDataPoints,
      contributionPrompt,
      confidenceImpact: gapScore,
    };
  }

  private analyzeGeographicDistribution(
    property: PropertyForValuation,
    comparables: ComparableProperty[]
  ): GapReason | null {
    if (comparables.length === 0) return null;

    // Calculate average distance
    const distances = comparables.map(c =>
      this.calculateDistance(
        property.latitude, property.longitude,
        c.latitude, c.longitude
      )
    );
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

    // More than 3km average = geographic gap
    if (avgDistance > 3) {
      return {
        code: 'GEOGRAPHIC_SPREAD',
        description: `Comparables are on average ${avgDistance.toFixed(1)}km away`,
        impact: Math.min(100, (avgDistance - 3) * 20),
        suggestedAction: 'Contribute property data from the immediate neighborhood',
      };
    }

    return null;
  }

  private analyzeTemporalDistribution(comparables: ComparableProperty[]): GapReason | null {
    if (comparables.length === 0) return null;

    const now = Date.now();
    const ages = comparables.map(c => {
      const date = c.sale_date || c.created_at;
      return (now - new Date(date).getTime()) / (1000 * 60 * 60 * 24 * 30); // months
    });
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;

    // More than 6 months average = temporal gap
    if (avgAge > 6) {
      return {
        code: 'TEMPORAL_GAP',
        description: `Comparables are on average ${avgAge.toFixed(0)} months old`,
        impact: Math.min(100, (avgAge - 6) * 10),
        suggestedAction: 'Contribute recent transaction data to improve accuracy',
      };
    }

    return null;
  }

  private analyzeSizeMatch(
    property: PropertyForValuation,
    comparables: ComparableProperty[]
  ): GapReason | null {
    if (comparables.length === 0 || !property.built_area_sqm) return null;

    const targetSize = property.built_area_sqm;
    const sizeDiffs = comparables.map(c =>
      Math.abs((c.built_area_sqm || targetSize) - targetSize) / targetSize
    );
    const avgDiff = sizeDiffs.reduce((a, b) => a + b, 0) / sizeDiffs.length;

    // More than 30% size difference = size gap
    if (avgDiff > 0.3) {
      return {
        code: 'SIZE_MISMATCH',
        description: `Comparables differ by ${(avgDiff * 100).toFixed(0)}% in size on average`,
        impact: Math.min(100, avgDiff * 100),
        suggestedAction: 'Contribute data for similar-sized properties',
      };
    }

    return null;
  }

  private analyzeAmenityCoverage(
    property: PropertyForValuation,
    comparables: ComparableProperty[]
  ): GapReason | null {
    if (comparables.length === 0) return null;

    const targetAmenities = new Set(property.amenities || []);
    if (targetAmenities.size === 0) return null;

    let matchScore = 0;
    comparables.forEach(c => {
      const compAmenities = new Set(c.amenities || []);
      const intersection = [...targetAmenities].filter(a => compAmenities.has(a));
      matchScore += intersection.length / targetAmenities.size;
    });
    const avgMatch = matchScore / comparables.length;

    // Less than 50% amenity match = amenity gap
    if (avgMatch < 0.5) {
      return {
        code: 'AMENITY_MISMATCH',
        description: `Comparables share only ${(avgMatch * 100).toFixed(0)}% of amenities`,
        impact: Math.min(100, (0.5 - avgMatch) * 100),
        suggestedAction: 'Contribute data for properties with similar features',
      };
    }

    return null;
  }

  private identifyMissingDataPoints(
    property: PropertyForValuation,
    comparables: ComparableProperty[]
  ): MissingDataPoint[] {
    const missing: MissingDataPoint[] = [];

    // Check for properties with missing critical data
    const missingYearBuilt = comparables.filter(c => !c.year_built).length;
    if (missingYearBuilt > comparables.length * 0.3) {
      missing.push({
        field: 'year_built',
        description: 'Year built information missing for many comparables',
        priority: 'high',
        rewardCredits: 15,
      });
    }

    const missingCondition = comparables.filter(c => !c.condition).length;
    if (missingCondition > comparables.length * 0.3) {
      missing.push({
        field: 'condition',
        description: 'Property condition data missing for many comparables',
        priority: 'high',
        rewardCredits: 20,
      });
    }

    const missingFloors = comparables.filter(c => !c.floors).length;
    if (missingFloors > comparables.length * 0.3) {
      missing.push({
        field: 'floors',
        description: 'Floor count missing for many comparables',
        priority: 'medium',
        rewardCredits: 10,
      });
    }

    return missing;
  }

  private calculateGapSeverity(gapScore: number): 'none' | 'minor' | 'moderate' | 'severe' {
    if (gapScore <= 0) return 'none';
    if (gapScore < GAP_SEVERITY_THRESHOLDS.minor * 100) return 'minor';
    if (gapScore < GAP_SEVERITY_THRESHOLDS.moderate * 100) return 'moderate';
    return 'severe';
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private async generateContributionPrompt(
    property: PropertyForValuation,
    gapReasons: GapReason[],
    missingDataPoints: MissingDataPoint[]
  ): Promise<ContributionPrompt> {
    const promptId = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate reward based on gap severity and missing data
    const baseReward = BASE_CREDITS.comparable_sale;
    const dataPointBonus = missingDataPoints.reduce((sum, dp) => sum + dp.rewardCredits, 0);
    const gapBonus = gapReasons.reduce((sum, r) => sum + Math.floor(r.impact / 10), 0);

    const totalReward = baseReward + dataPointBonus + gapBonus;

    // Build search criteria for contributors
    const searchCriteria: ComparableSearchCriteria = {
      region: property.region,
      propertyType: property.property_type,
      minArea: (property.built_area_sqm || 100) * 0.7,
      maxArea: (property.built_area_sqm || 100) * 1.3,
      minBedrooms: Math.max(0, (property.bedrooms || 3) - 1),
      maxBedrooms: (property.bedrooms || 3) + 1,
      priceRange: {
        min: property.price * 0.7,
        max: property.price * 1.3,
      },
      radiusKm: 3,
      maxAgeMonths: 12,
    };

    return {
      id: promptId,
      type: 'comparable',
      title: 'Help Improve This Valuation',
      description: this.buildPromptDescription(gapReasons),
      requiredFields: this.buildRequiredFields(),
      optionalFields: this.buildOptionalFields(missingDataPoints),
      rewardCredits: totalReward,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      propertyReference: property.reference_number,
      searchCriteria,
    };
  }

  private buildPromptDescription(gapReasons: GapReason[]): string {
    const mainReason = gapReasons[0];
    return `We need more comparable property data to improve valuation accuracy. ${mainReason?.description || 'Your contribution helps create better valuations for everyone.'}`;
  }

  private buildRequiredFields(): RequiredField[] {
    return [
      {
        name: 'address',
        label: 'Property Address',
        type: 'text',
        validation: { required: true, message: 'Address is required' },
      },
      {
        name: 'transaction_date',
        label: 'Transaction Date',
        type: 'date',
        validation: { required: true },
      },
      {
        name: 'transaction_price',
        label: 'Transaction Price (GHS)',
        type: 'number',
        validation: { required: true, min: 0 },
      },
      {
        name: 'property_type',
        label: 'Property Type',
        type: 'select',
        options: ['house', 'apartment', 'townhouse', 'villa', 'land'],
        validation: { required: true },
      },
      {
        name: 'built_area_sqm',
        label: 'Built Area (sqm)',
        type: 'number',
        validation: { required: true, min: 0 },
      },
    ];
  }

  private buildOptionalFields(missingDataPoints: MissingDataPoint[]): OptionalField[] {
    const baseOptional: OptionalField[] = [
      {
        name: 'bedrooms',
        label: 'Number of Bedrooms',
        type: 'number',
        bonusCredits: 5,
      },
      {
        name: 'bathrooms',
        label: 'Number of Bathrooms',
        type: 'number',
        bonusCredits: 5,
      },
      {
        name: 'year_built',
        label: 'Year Built',
        type: 'number',
        bonusCredits: 10,
      },
      {
        name: 'condition',
        label: 'Property Condition',
        type: 'select',
        options: ['new', 'excellent', 'good', 'fair', 'poor'],
        bonusCredits: 10,
      },
      {
        name: 'location',
        label: 'Pin Location on Map',
        type: 'location',
        bonusCredits: 15,
      },
    ];

    // Add bonus for specifically missing data points
    return baseOptional.map(field => {
      const missingMatch = missingDataPoints.find(dp => dp.field === field.name);
      if (missingMatch) {
        return { ...field, bonusCredits: field.bonusCredits + missingMatch.rewardCredits };
      }
      return field;
    });
  }
}

// =====================================================
// CONTRIBUTION PROCESSING SERVICE
// =====================================================

export class ContributionService {
  private pool: Pool;
  private gapDetection: GapDetectionService;

  constructor(dbPool?: Pool) {
    this.pool = dbPool || pool;
    this.gapDetection = new GapDetectionService(dbPool);
  }

  /**
   * Process a contribution submission
   */
  async processContribution(submission: ContributionSubmission): Promise<ContributionResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Validate the submission data
      const validationResult = await this.validateContribution(submission);

      if (validationResult.isValid) {
        // Insert the contributed property
        const propertyId = await this.insertContributedProperty(client, submission);

        // Calculate credits
        const credits = await this.calculateCredits(submission, validationResult.score);

        // Award credits to contributor
        await this.awardCredits(client, submission.contributorId, credits, propertyId);

        // Update contributor reputation
        await this.updateReputation(client, submission.contributorId, validationResult.score);

        await client.query('COMMIT');

        // Track in Data Hub contributions
        try {
          const { ServiceHooks } = await import('../data-hub/serviceHooks');
          await ServiceHooks.createContribution({
            contributor_id: submission.contributorId,
            organization_id: undefined, // Global contribution
            contribution_type: 'comparable',
            source_context: 'valuation_workflow',
            source_id: propertyId, // Use the generated property ID
            data: {
              ...submission.data,
              property_id: propertyId,
              prompt_id: submission.promptId,
              action: 'valuation_contribution_processed'
            }
          });
        } catch (hookError) {
          // logger is available via import in this file
          logger.error('Failed to create valuation contribution hook in workflow service', { error: hookError });
        }

        return {
          id: propertyId,
          status: 'approved',
          creditsAwarded: credits,
          validationScore: validationResult.score,
          contributorReputation: await this.getReputationScore(submission.contributorId),
        };
      } else {
        await client.query('ROLLBACK');

        return {
          id: '',
          status: 'rejected',
          creditsAwarded: 0,
          validationScore: validationResult.score,
          feedback: validationResult.feedback,
          contributorReputation: await this.getReputationScore(submission.contributorId),
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async validateContribution(
    submission: ContributionSubmission
  ): Promise<{ isValid: boolean; score: number; feedback?: string }> {
    let score = 100;
    const issues: string[] = [];

    // Check required fields
    const requiredFields = ['address', 'transaction_date', 'transaction_price', 'property_type', 'built_area_sqm'];
    for (const field of requiredFields) {
      if (!submission.data[field]) {
        score -= 20;
        issues.push(`Missing required field: ${field}`);
      }
    }

    // Validate price reasonableness
    const price = submission.data.transaction_price as number;
    if (price < 10000 || price > 100000000) {
      score -= 30;
      issues.push('Price seems unreasonable');
    }

    // Validate date
    const transactionDate = new Date(submission.data.transaction_date as string);
    const now = new Date();
    const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));

    if (transactionDate > new Date()) {
      score -= 50;
      issues.push('Transaction date cannot be in the future');
    }
    if (transactionDate < oneYearAgo) {
      score -= 10;
      issues.push('Transaction is more than 1 year old');
    }

    // Check for duplicate submissions
    const isDuplicate = await this.checkDuplicate(submission);
    if (isDuplicate) {
      score = 0;
      issues.push('This property has already been contributed');
    }

    // Require attestation
    if (!submission.attestation) {
      score -= 30;
      issues.push('Contributor must attest to data accuracy');
    }

    return {
      isValid: score >= 50,
      score,
      feedback: issues.length > 0 ? issues.join('; ') : undefined,
    };
  }

  private async checkDuplicate(submission: ContributionSubmission): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT id FROM properties 
       WHERE address_street ILIKE $1 
       AND ABS(EXTRACT(EPOCH FROM (created_at - $2::timestamp))) < 86400 * 30
       LIMIT 1`,
      [submission.data.address, submission.data.transaction_date]
    );
    return result.rows.length > 0;
  }

  private async insertContributedProperty(
    client: any,
    submission: ContributionSubmission
  ): Promise<string> {
    const data = submission.data;

    const result = await client.query(
      `INSERT INTO properties (
        reference_number, address_street, property_type, 
        built_area_sqm, bedrooms, bathrooms, year_built, condition,
        price, price_currency, transaction_type,
        latitude, longitude,
        source_type, contributor_id, contribution_date,
        data_quality_score, is_verified
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING id`,
      [
        `CONTRIB-${Date.now()}`,
        data.address,
        data.property_type,
        data.built_area_sqm,
        data.bedrooms || null,
        data.bathrooms || null,
        data.year_built || null,
        data.condition || null,
        data.transaction_price,
        'GHS',
        'sale',
        (data.location as any)?.latitude || null,
        (data.location as any)?.longitude || null,
        'user_contributed',
        submission.contributorId,
        new Date(),
        50, // Initial quality score
        false, // Needs verification
      ]
    );

    return result.rows[0].id;
  }

  private async calculateCredits(
    submission: ContributionSubmission,
    validationScore: number
  ): Promise<number> {
    // Get contributor tier for multiplier
    const profile = await this.getContributorProfile(submission.contributorId);
    const multiplier = REPUTATION_MULTIPLIERS[profile?.tier || 'bronze'];

    // Base credits
    let credits = BASE_CREDITS.comparable_sale;

    // Bonus for optional fields
    const optionalFields = ['bedrooms', 'bathrooms', 'year_built', 'condition', 'location'];
    for (const field of optionalFields) {
      if (submission.data[field]) {
        credits += 5;
      }
    }

    // Bonus for proof documents
    if (submission.proofDocuments && submission.proofDocuments.length > 0) {
      credits += BASE_CREDITS.document_upload;
    }

    // Bonus for professional source
    if (submission.sourceType === 'professional' || submission.sourceType === 'transaction_party') {
      credits += 20;
    }

    // Scale by validation score
    credits = Math.floor(credits * (validationScore / 100));

    // Apply tier multiplier
    credits = Math.floor(credits * multiplier);

    return credits;
  }

  private async awardCredits(
    client: any,
    contributorId: string,
    credits: number,
    propertyId: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO contributor_credits (
        user_id, credits, source_type, source_id, created_at
      ) VALUES ($1, $2, 'property_contribution', $3, NOW())`,
      [contributorId, credits, propertyId]
    );

    await client.query(
      `UPDATE contributor_profiles 
       SET total_credits = total_credits + $1,
           available_credits = available_credits + $1,
           contribution_count = contribution_count + 1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [credits, contributorId]
    );
  }

  private async updateReputation(
    client: any,
    contributorId: string,
    validationScore: number
  ): Promise<void> {
    // Update rolling reputation score
    await client.query(
      `UPDATE contributor_profiles 
       SET reputation_score = (reputation_score * contribution_count + $1) / (contribution_count + 1),
           validation_rate = (validation_rate * contribution_count + $2) / (contribution_count + 1),
           tier = CASE 
             WHEN (reputation_score * contribution_count + $1) / (contribution_count + 1) >= 90 THEN 'platinum'
             WHEN (reputation_score * contribution_count + $1) / (contribution_count + 1) >= 75 THEN 'gold'
             WHEN (reputation_score * contribution_count + $1) / (contribution_count + 1) >= 50 THEN 'silver'
             ELSE 'bronze'
           END,
           updated_at = NOW()
       WHERE user_id = $3`,
      [validationScore, validationScore >= 50 ? 1 : 0, contributorId]
    );
  }

  async getReputationScore(contributorId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT reputation_score FROM contributor_profiles WHERE user_id = $1',
      [contributorId]
    );
    return result.rows[0]?.reputation_score || 0;
  }

  async getContributorProfile(contributorId: string): Promise<ContributorProfile | null> {
    const result = await this.pool.query(
      `SELECT 
        user_id,
        total_credits,
        available_credits,
        reputation_score,
        contribution_count,
        validation_rate,
        tier
       FROM contributor_profiles 
       WHERE user_id = $1`,
      [contributorId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Get achievements
    const achievementsResult = await this.pool.query(
      `SELECT a.id, a.name, a.description, ua.unlocked_at, a.bonus_credits
       FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = $1`,
      [contributorId]
    );

    return {
      userId: row.user_id,
      totalCredits: row.total_credits,
      availableCredits: row.available_credits,
      reputationScore: row.reputation_score,
      contributionCount: row.contribution_count,
      validationRate: row.validation_rate,
      tier: row.tier,
      achievements: achievementsResult.rows.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        unlockedAt: a.unlocked_at,
        bonusCredits: a.bonus_credits,
      })),
    };
  }

  /**
   * Create or ensure contributor profile exists
   */
  async ensureContributorProfile(userId: string): Promise<ContributorProfile> {
    const existing = await this.getContributorProfile(userId);
    if (existing) return existing;

    await this.pool.query(
      `INSERT INTO contributor_profiles (
        user_id, total_credits, available_credits, reputation_score,
        contribution_count, validation_rate, tier, created_at, updated_at
      ) VALUES ($1, 0, 0, 50, 0, 0, 'bronze', NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    return {
      userId,
      totalCredits: 0,
      availableCredits: 0,
      reputationScore: 50,
      contributionCount: 0,
      validationRate: 0,
      tier: 'bronze',
      achievements: [],
    };
  }

  /**
   * Get pending prompts for a contributor
   */
  async getActivePrompts(
    contributorId: string,
    region?: RegionCode
  ): Promise<ContributionPrompt[]> {
    // In a real implementation, this would query active prompts from the database
    // For now, return empty array - prompts are generated dynamically during valuation
    return [];
  }
}

// =====================================================
// EXPORTS
// =====================================================

export const gapDetectionService = new GapDetectionService();
export const contributionService = new ContributionService();

export default {
  GapDetectionService,
  ContributionService,
  gapDetectionService,
  contributionService,
};
