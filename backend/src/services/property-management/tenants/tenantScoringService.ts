/**
 * Tenant Scoring Service
 * 
 * Comprehensive tenant evaluation and scoring system:
 * - Credit score integration (future: Ghana credit bureaus)
 * - Payment history analysis
 * - Employment verification
 * - Rental history scoring
 * - Risk assessment and recommendations
 */

import { pool } from '../../../database';
import { logger } from '../../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface TenantScore {
  tenantId: string;
  overallScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'very_high';
  recommendation: 'approve' | 'approve_with_conditions' | 'decline' | 'manual_review';
  
  scoreBreakdown: {
    paymentHistory: ScoreComponent;
    incomeVerification: ScoreComponent;
    employmentStability: ScoreComponent;
    rentalHistory: ScoreComponent;
    identityVerification: ScoreComponent;
    creditIndicators: ScoreComponent;
  };
  
  riskFactors: RiskFactor[];
  conditions?: string[];
  calculatedAt: Date;
  validUntil: Date;
}

export interface ScoreComponent {
  score: number; // 0-100
  weight: number; // percentage of total
  weightedScore: number; // score * weight
  factors: string[];
  dataAvailable: boolean;
}

export interface RiskFactor {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigationSuggestion?: string;
}

export interface TenantScreeningData {
  tenantId: string;
  
  // Identity
  fullName: string;
  idType: 'ghana_card' | 'passport' | 'voters_id' | 'drivers_license';
  idNumber: string;
  idVerified: boolean;
  
  // Employment
  employmentStatus: 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student';
  employerName?: string;
  jobTitle?: string;
  monthlyIncome?: number;
  employmentDuration?: number; // months
  incomeVerified: boolean;
  
  // Rental History
  previousAddresses?: PreviousAddress[];
  
  // Financial
  bankStatementProvided: boolean;
  averageBankBalance?: number;
  mobileMoneyUsage?: boolean;
  
  // References
  personalReferences?: Reference[];
  employerReference?: Reference;
  previousLandlordReference?: Reference;
}

export interface PreviousAddress {
  address: string;
  landlordName?: string;
  landlordPhone?: string;
  durationMonths: number;
  rentAmount?: number;
  leftOnGoodTerms?: boolean;
  evicted?: boolean;
}

export interface Reference {
  name: string;
  relationship: string;
  phone: string;
  verified: boolean;
  verificationNotes?: string;
  rating?: number; // 1-5
}

export interface PaymentHistoryAnalysis {
  tenantId: string;
  totalPayments: number;
  onTimePayments: number;
  latePayments: number;
  missedPayments: number;
  onTimeRate: number;
  averageDaysLate: number;
  currentBalance: number;
  longestStreak: number; // consecutive on-time payments
  recentTrend: 'improving' | 'stable' | 'declining';
}

// Scoring weights (must sum to 100)
const SCORING_WEIGHTS = {
  paymentHistory: 30,
  incomeVerification: 25,
  employmentStability: 15,
  rentalHistory: 15,
  identityVerification: 10,
  creditIndicators: 5,
};

// Risk thresholds
const RISK_THRESHOLDS = {
  low: 75,
  medium: 55,
  high: 35,
};

// ============================================================================
// MAIN SCORING FUNCTIONS
// ============================================================================

export async function calculateTenantScore(tenantId: string): Promise<TenantScore> {
  // Get tenant data
  const tenantResult = await pool.query(`
    SELECT 
      t.*,
      s.id_type,
      s.id_number,
      s.id_verified,
      s.employment_status,
      s.employer_name,
      s.job_title,
      s.monthly_income,
      s.employment_duration_months,
      s.income_verified,
      s.bank_statement_provided,
      s.average_bank_balance,
      s.mobile_money_usage,
      s.previous_addresses,
      s.personal_references,
      s.employer_reference,
      s.previous_landlord_reference
    FROM pm_tenants t
    LEFT JOIN pm_tenant_screening s ON s.tenant_id = t.id
    WHERE t.id = $1
  `, [tenantId]);

  if (tenantResult.rows.length === 0) {
    throw new Error('Tenant not found');
  }

  const tenant = tenantResult.rows[0];
  const riskFactors: RiskFactor[] = [];

  // Calculate each score component
  const paymentHistory = await calculatePaymentHistoryScore(tenantId, riskFactors);
  const incomeVerification = await calculateIncomeScore(tenant, riskFactors);
  const employmentStability = calculateEmploymentScore(tenant, riskFactors);
  const rentalHistory = calculateRentalHistoryScore(tenant, riskFactors);
  const identityVerification = calculateIdentityScore(tenant, riskFactors);
  const creditIndicators = calculateCreditIndicatorsScore(tenant, riskFactors);

  // Calculate overall score
  const overallScore = Math.round(
    paymentHistory.weightedScore +
    incomeVerification.weightedScore +
    employmentStability.weightedScore +
    rentalHistory.weightedScore +
    identityVerification.weightedScore +
    creditIndicators.weightedScore
  );

  // Determine risk level
  let riskLevel: TenantScore['riskLevel'];
  if (overallScore >= RISK_THRESHOLDS.low) {
    riskLevel = 'low';
  } else if (overallScore >= RISK_THRESHOLDS.medium) {
    riskLevel = 'medium';
  } else if (overallScore >= RISK_THRESHOLDS.high) {
    riskLevel = 'high';
  } else {
    riskLevel = 'very_high';
  }

  // Determine recommendation
  const { recommendation, conditions } = determineRecommendation(
    overallScore, 
    riskLevel, 
    riskFactors
  );

  const score: TenantScore = {
    tenantId,
    overallScore,
    riskLevel,
    recommendation,
    scoreBreakdown: {
      paymentHistory,
      incomeVerification,
      employmentStability,
      rentalHistory,
      identityVerification,
      creditIndicators,
    },
    riskFactors,
    conditions,
    calculatedAt: new Date(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  };

  // Store the score
  await storeTenantScore(score);

  logger.info('Calculated tenant score', {
    tenantId,
    overallScore,
    riskLevel,
    recommendation,
  });

  return score;
}

export async function getStoredTenantScore(tenantId: string): Promise<TenantScore | null> {
  const result = await pool.query(`
    SELECT * FROM pm_tenant_scores
    WHERE tenant_id = $1
      AND valid_until > NOW()
    ORDER BY calculated_at DESC
    LIMIT 1
  `, [tenantId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapScoreRow(result.rows[0]);
}

// ============================================================================
// COMPONENT SCORING FUNCTIONS
// ============================================================================

async function calculatePaymentHistoryScore(
  tenantId: string, 
  riskFactors: RiskFactor[]
): Promise<ScoreComponent> {
  const analysis = await analyzePaymentHistory(tenantId);
  const factors: string[] = [];
  let score = 70; // Base score for new tenants

  if (analysis.totalPayments > 0) {
    // On-time payment rate (up to 40 points)
    const onTimeBonus = analysis.onTimeRate * 40;
    score = 20 + onTimeBonus;
    factors.push(`${(analysis.onTimeRate * 100).toFixed(0)}% on-time payment rate`);

    // Late payment penalty
    if (analysis.latePayments > 0) {
      const latePenalty = Math.min(20, analysis.latePayments * 3);
      score -= latePenalty;
      factors.push(`${analysis.latePayments} late payment(s)`);
      
      if (analysis.latePayments >= 3) {
        riskFactors.push({
          category: 'Payment History',
          severity: 'medium',
          description: `${analysis.latePayments} late payments on record`,
          mitigationSuggestion: 'Consider requiring automatic payment setup',
        });
      }
    }

    // Missed payment severe penalty
    if (analysis.missedPayments > 0) {
      score -= analysis.missedPayments * 15;
      factors.push(`${analysis.missedPayments} missed payment(s)`);
      
      riskFactors.push({
        category: 'Payment History',
        severity: analysis.missedPayments >= 2 ? 'critical' : 'high',
        description: `${analysis.missedPayments} missed payment(s)`,
        mitigationSuggestion: 'Request guarantor or additional security deposit',
      });
    }

    // Current balance penalty
    if (analysis.currentBalance > 0) {
      const balancePenalty = Math.min(15, Math.ceil(analysis.currentBalance / 1000) * 2);
      score -= balancePenalty;
      factors.push(`Outstanding balance: GHS ${analysis.currentBalance.toFixed(2)}`);
      
      riskFactors.push({
        category: 'Payment History',
        severity: analysis.currentBalance > 5000 ? 'high' : 'medium',
        description: `Outstanding balance of GHS ${analysis.currentBalance.toFixed(2)}`,
        mitigationSuggestion: 'Require clearing of outstanding balance before approval',
      });
    }

    // Streak bonus
    if (analysis.longestStreak >= 12) {
      score += 10;
      factors.push(`${analysis.longestStreak} consecutive on-time payments`);
    } else if (analysis.longestStreak >= 6) {
      score += 5;
      factors.push(`${analysis.longestStreak} consecutive on-time payments`);
    }

    // Recent trend adjustment
    if (analysis.recentTrend === 'improving') {
      score += 5;
      factors.push('Payment behavior improving');
    } else if (analysis.recentTrend === 'declining') {
      score -= 10;
      factors.push('Payment behavior declining');
      
      riskFactors.push({
        category: 'Payment History',
        severity: 'medium',
        description: 'Recent payment pattern showing decline',
      });
    }
  } else {
    factors.push('No payment history with this organization');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: SCORING_WEIGHTS.paymentHistory / 100,
    weightedScore: Math.max(0, Math.min(100, score)) * (SCORING_WEIGHTS.paymentHistory / 100),
    factors,
    dataAvailable: analysis.totalPayments > 0,
  };
}

function calculateIncomeScore(
  tenant: any, 
  riskFactors: RiskFactor[]
): Promise<ScoreComponent> | ScoreComponent {
  const factors: string[] = [];
  let score = 50; // Default if no income data

  if (tenant.monthly_income) {
    const monthlyIncome = parseFloat(tenant.monthly_income);
    
    // Income verification bonus
    if (tenant.income_verified) {
      score = 70;
      factors.push('Income verified through documentation');
    } else {
      score = 55;
      factors.push('Income stated but not verified');
      
      riskFactors.push({
        category: 'Income',
        severity: 'low',
        description: 'Income not yet verified',
        mitigationSuggestion: 'Request bank statements or pay slips for verification',
      });
    }

    // Bank statement bonus
    if (tenant.bank_statement_provided) {
      score += 10;
      factors.push('Bank statement provided');
      
      if (tenant.average_bank_balance) {
        const avgBalance = parseFloat(tenant.average_bank_balance);
        // Check if balance covers at least 3 months rent
        const minExpectedBalance = monthlyIncome * 0.5; // At least half of monthly income
        if (avgBalance >= minExpectedBalance * 3) {
          score += 10;
          factors.push('Strong average bank balance');
        } else if (avgBalance < minExpectedBalance) {
          score -= 10;
          factors.push('Low average bank balance');
          
          riskFactors.push({
            category: 'Income',
            severity: 'medium',
            description: 'Bank balance below expected level for stated income',
          });
        }
      }
    }

    // Mobile money as supplementary
    if (tenant.mobile_money_usage) {
      score += 5;
      factors.push('Active mobile money user');
    }
  } else {
    factors.push('No income information provided');
    
    riskFactors.push({
      category: 'Income',
      severity: 'high',
      description: 'Income information not provided',
      mitigationSuggestion: 'Request proof of income before proceeding',
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: SCORING_WEIGHTS.incomeVerification / 100,
    weightedScore: Math.max(0, Math.min(100, score)) * (SCORING_WEIGHTS.incomeVerification / 100),
    factors,
    dataAvailable: !!tenant.monthly_income,
  };
}

function calculateEmploymentScore(
  tenant: any, 
  riskFactors: RiskFactor[]
): ScoreComponent {
  const factors: string[] = [];
  let score = 50;

  if (tenant.employment_status) {
    switch (tenant.employment_status) {
      case 'employed':
        score = 75;
        factors.push('Currently employed');
        
        // Employment duration bonus
        if (tenant.employment_duration_months) {
          const months = parseInt(tenant.employment_duration_months);
          if (months >= 24) {
            score += 15;
            factors.push(`${Math.floor(months / 12)}+ years with current employer`);
          } else if (months >= 12) {
            score += 10;
            factors.push(`${months} months with current employer`);
          } else if (months < 6) {
            score -= 5;
            factors.push(`Recently started (${months} months)`);
            
            riskFactors.push({
              category: 'Employment',
              severity: 'low',
              description: 'Employment less than 6 months',
            });
          }
        }
        
        // Employer name adds credibility
        if (tenant.employer_name) {
          score += 5;
          factors.push(`Employed at ${tenant.employer_name}`);
        }
        break;
        
      case 'self_employed':
        score = 65;
        factors.push('Self-employed');
        
        // Self-employed needs more verification
        if (!tenant.income_verified) {
          score -= 10;
          riskFactors.push({
            category: 'Employment',
            severity: 'medium',
            description: 'Self-employment income requires additional verification',
            mitigationSuggestion: 'Request business registration and bank statements',
          });
        }
        break;
        
      case 'retired':
        score = 70;
        factors.push('Retired');
        // Stable income from pension
        break;
        
      case 'student':
        score = 55;
        factors.push('Student');
        riskFactors.push({
          category: 'Employment',
          severity: 'medium',
          description: 'Student without steady employment',
          mitigationSuggestion: 'Request guarantor or parent co-signer',
        });
        break;
        
      case 'unemployed':
        score = 30;
        factors.push('Currently unemployed');
        riskFactors.push({
          category: 'Employment',
          severity: 'high',
          description: 'No current employment',
          mitigationSuggestion: 'Require guarantor and advance payment',
        });
        break;
    }
  } else {
    factors.push('Employment status not provided');
    riskFactors.push({
      category: 'Employment',
      severity: 'medium',
      description: 'Employment information missing',
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: SCORING_WEIGHTS.employmentStability / 100,
    weightedScore: Math.max(0, Math.min(100, score)) * (SCORING_WEIGHTS.employmentStability / 100),
    factors,
    dataAvailable: !!tenant.employment_status,
  };
}

function calculateRentalHistoryScore(
  tenant: any, 
  riskFactors: RiskFactor[]
): ScoreComponent {
  const factors: string[] = [];
  let score = 60; // Default for no history

  const previousAddresses = tenant.previous_addresses || [];

  if (previousAddresses.length > 0) {
    // Has rental history
    score = 70;
    factors.push(`${previousAddresses.length} previous rental(s)`);

    let positiveRefs = 0;
    let negativeRefs = 0;
    let totalDuration = 0;

    for (const addr of previousAddresses) {
      totalDuration += addr.durationMonths || 0;

      if (addr.evicted) {
        negativeRefs++;
        score -= 25;
        factors.push('Previous eviction on record');
        
        riskFactors.push({
          category: 'Rental History',
          severity: 'critical',
          description: 'Prior eviction from rental property',
          mitigationSuggestion: 'Manual review required - understand circumstances',
        });
      } else if (addr.leftOnGoodTerms === false) {
        negativeRefs++;
        score -= 10;
        factors.push('Left previous rental on poor terms');
        
        riskFactors.push({
          category: 'Rental History',
          severity: 'medium',
          description: 'Previous tenancy ended on poor terms',
        });
      } else if (addr.leftOnGoodTerms === true) {
        positiveRefs++;
        score += 5;
      }
    }

    // Stable tenancy bonus (long-term renter)
    if (totalDuration >= 36) {
      score += 10;
      factors.push('Long rental history (3+ years)');
    } else if (totalDuration >= 24) {
      score += 5;
      factors.push('Established rental history (2+ years)');
    }

    // Previous landlord reference
    if (tenant.previous_landlord_reference?.verified) {
      const rating = tenant.previous_landlord_reference.rating;
      if (rating >= 4) {
        score += 10;
        factors.push('Positive landlord reference');
      } else if (rating <= 2) {
        score -= 15;
        factors.push('Negative landlord reference');
        
        riskFactors.push({
          category: 'Rental History',
          severity: 'high',
          description: 'Poor reference from previous landlord',
        });
      }
    }
  } else {
    factors.push('First-time renter or no history provided');
    
    // Not necessarily negative, but needs other strong factors
    riskFactors.push({
      category: 'Rental History',
      severity: 'low',
      description: 'No verifiable rental history',
      mitigationSuggestion: 'Consider requesting guarantor for first-time renters',
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: SCORING_WEIGHTS.rentalHistory / 100,
    weightedScore: Math.max(0, Math.min(100, score)) * (SCORING_WEIGHTS.rentalHistory / 100),
    factors,
    dataAvailable: previousAddresses.length > 0,
  };
}

function calculateIdentityScore(
  tenant: any, 
  riskFactors: RiskFactor[]
): ScoreComponent {
  const factors: string[] = [];
  let score = 40;

  if (tenant.id_type) {
    factors.push(`ID Type: ${tenant.id_type.replace('_', ' ')}`);
    
    // Ghana Card is preferred
    if (tenant.id_type === 'ghana_card') {
      score = 70;
      factors.push('Ghana Card provided (gold standard)');
    } else if (tenant.id_type === 'passport') {
      score = 65;
      factors.push('Passport provided');
    } else {
      score = 55;
    }

    // Verification status
    if (tenant.id_verified) {
      score += 25;
      factors.push('Identity verified');
    } else {
      factors.push('Identity not yet verified');
      
      riskFactors.push({
        category: 'Identity',
        severity: 'medium',
        description: 'Identity document not yet verified',
        mitigationSuggestion: 'Verify ID before finalizing approval',
      });
    }
  } else {
    factors.push('No identity document provided');
    
    riskFactors.push({
      category: 'Identity',
      severity: 'critical',
      description: 'No identity document on file',
      mitigationSuggestion: 'Require valid ID before proceeding',
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: SCORING_WEIGHTS.identityVerification / 100,
    weightedScore: Math.max(0, Math.min(100, score)) * (SCORING_WEIGHTS.identityVerification / 100),
    factors,
    dataAvailable: !!tenant.id_type,
  };
}

function calculateCreditIndicatorsScore(
  tenant: any, 
  riskFactors: RiskFactor[]
): ScoreComponent {
  const factors: string[] = [];
  // Default neutral score since Ghana credit bureaus aren't widely integrated yet
  let score = 60;

  factors.push('Ghana credit bureau integration pending');
  
  // Use proxy indicators
  if (tenant.bank_statement_provided && tenant.average_bank_balance) {
    const avgBalance = parseFloat(tenant.average_bank_balance);
    if (avgBalance > 0) {
      score = 70;
      factors.push('Positive bank account history');
    }
  }

  // Mobile money activity as proxy
  if (tenant.mobile_money_usage) {
    score += 5;
    factors.push('Active in digital financial services');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    weight: SCORING_WEIGHTS.creditIndicators / 100,
    weightedScore: Math.max(0, Math.min(100, score)) * (SCORING_WEIGHTS.creditIndicators / 100),
    factors,
    dataAvailable: false, // Credit bureau not yet integrated
  };
}

// ============================================================================
// RECOMMENDATION ENGINE
// ============================================================================

function determineRecommendation(
  overallScore: number,
  riskLevel: TenantScore['riskLevel'],
  riskFactors: RiskFactor[]
): { recommendation: TenantScore['recommendation']; conditions?: string[] } {
  const conditions: string[] = [];
  let recommendation: TenantScore['recommendation'];

  // Check for critical risk factors (auto-decline or manual review)
  const criticalFactors = riskFactors.filter(f => f.severity === 'critical');
  const highFactors = riskFactors.filter(f => f.severity === 'high');

  if (criticalFactors.length > 0) {
    // Check if it's eviction - that requires manual review
    const hasEviction = criticalFactors.some(f => f.description.includes('eviction'));
    if (hasEviction) {
      recommendation = 'manual_review';
      conditions.push('Review eviction circumstances before decision');
    } else {
      recommendation = 'decline';
    }
  } else if (overallScore >= RISK_THRESHOLDS.low && highFactors.length === 0) {
    recommendation = 'approve';
  } else if (overallScore >= RISK_THRESHOLDS.medium) {
    recommendation = 'approve_with_conditions';
    
    // Add conditions based on risk factors
    if (highFactors.some(f => f.category === 'Income')) {
      conditions.push('Require 3 months advance rent');
    }
    if (highFactors.some(f => f.category === 'Employment')) {
      conditions.push('Require guarantor with proof of income');
    }
    if (highFactors.some(f => f.category === 'Payment History')) {
      conditions.push('Set up automatic rent deduction');
    }
    if (highFactors.some(f => f.category === 'Rental History')) {
      conditions.push('Increase security deposit to 2 months rent');
    }
    if (highFactors.some(f => f.category === 'Identity')) {
      conditions.push('Complete identity verification before move-in');
    }

    // Default condition for medium score
    if (conditions.length === 0) {
      conditions.push('Standard security deposit required');
    }
  } else if (overallScore >= RISK_THRESHOLDS.high) {
    recommendation = 'manual_review';
    conditions.push('Score indicates elevated risk - manual review required');
    
    // Add mitigation suggestions as potential conditions
    for (const factor of [...criticalFactors, ...highFactors]) {
      if (factor.mitigationSuggestion) {
        conditions.push(factor.mitigationSuggestion);
      }
    }
  } else {
    recommendation = 'decline';
  }

  return { recommendation, conditions: conditions.length > 0 ? conditions : undefined };
}

// ============================================================================
// PAYMENT HISTORY ANALYSIS
// ============================================================================

async function analyzePaymentHistory(tenantId: string): Promise<PaymentHistoryAnalysis> {
  // Get all payments for this tenant
  const result = await pool.query(`
    SELECT 
      p.id,
      p.amount_due,
      p.amount_paid,
      p.payment_status,
      p.payment_date,
      p.due_date,
      p.created_at,
      CASE 
        WHEN p.payment_date <= p.due_date THEN 'on_time'
        WHEN p.payment_date IS NOT NULL THEN 'late'
        ELSE 'missed'
      END as payment_timing,
      EXTRACT(DAY FROM p.payment_date - p.due_date) as days_late
    FROM pm_payments p
    JOIN pm_tenancies t ON p.tenancy_id = t.id
    WHERE t.tenant_id = $1
    ORDER BY p.due_date DESC
  `, [tenantId]);

  if (result.rows.length === 0) {
    return {
      tenantId,
      totalPayments: 0,
      onTimePayments: 0,
      latePayments: 0,
      missedPayments: 0,
      onTimeRate: 1, // Benefit of the doubt
      averageDaysLate: 0,
      currentBalance: 0,
      longestStreak: 0,
      recentTrend: 'stable',
    };
  }

  const payments = result.rows;
  const onTimePayments = payments.filter(p => p.payment_timing === 'on_time').length;
  const latePayments = payments.filter(p => p.payment_timing === 'late').length;
  const missedPayments = payments.filter(p => p.payment_timing === 'missed').length;

  // Calculate average days late (for late payments only)
  const latePaymentDays = payments
    .filter(p => p.days_late && p.days_late > 0)
    .map(p => p.days_late);
  const averageDaysLate = latePaymentDays.length > 0
    ? latePaymentDays.reduce((a, b) => a + b, 0) / latePaymentDays.length
    : 0;

  // Calculate current balance
  const currentBalance = payments
    .filter(p => p.payment_status !== 'paid')
    .reduce((sum, p) => sum + (parseFloat(p.amount_due) - parseFloat(p.amount_paid || 0)), 0);

  // Calculate longest streak of on-time payments
  let longestStreak = 0;
  let currentStreak = 0;
  for (const payment of payments.reverse()) {
    if (payment.payment_timing === 'on_time') {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Analyze recent trend (last 6 payments)
  const recentPayments = payments.slice(0, Math.min(6, payments.length));
  const recentOnTime = recentPayments.filter(p => p.payment_timing === 'on_time').length;
  const olderPayments = payments.slice(6);
  const olderOnTime = olderPayments.length > 0
    ? olderPayments.filter(p => p.payment_timing === 'on_time').length / olderPayments.length
    : 0;
  const recentRate = recentPayments.length > 0 ? recentOnTime / recentPayments.length : 1;

  let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentRate > olderOnTime + 0.1) {
    recentTrend = 'improving';
  } else if (recentRate < olderOnTime - 0.1) {
    recentTrend = 'declining';
  }

  return {
    tenantId,
    totalPayments: payments.length,
    onTimePayments,
    latePayments,
    missedPayments,
    onTimeRate: payments.length > 0 ? onTimePayments / payments.length : 1,
    averageDaysLate,
    currentBalance,
    longestStreak,
    recentTrend,
  };
}

// ============================================================================
// STORAGE & RETRIEVAL
// ============================================================================

async function storeTenantScore(score: TenantScore): Promise<void> {
  await pool.query(`
    INSERT INTO pm_tenant_scores (
      tenant_id, overall_score, risk_level, recommendation,
      score_breakdown, risk_factors, conditions,
      calculated_at, valid_until
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      overall_score = EXCLUDED.overall_score,
      risk_level = EXCLUDED.risk_level,
      recommendation = EXCLUDED.recommendation,
      score_breakdown = EXCLUDED.score_breakdown,
      risk_factors = EXCLUDED.risk_factors,
      conditions = EXCLUDED.conditions,
      calculated_at = EXCLUDED.calculated_at,
      valid_until = EXCLUDED.valid_until
  `, [
    score.tenantId,
    score.overallScore,
    score.riskLevel,
    score.recommendation,
    JSON.stringify(score.scoreBreakdown),
    JSON.stringify(score.riskFactors),
    JSON.stringify(score.conditions || []),
    score.calculatedAt,
    score.validUntil,
  ]);
}

function mapScoreRow(row: any): TenantScore {
  return {
    tenantId: row.tenant_id,
    overallScore: parseInt(row.overall_score),
    riskLevel: row.risk_level,
    recommendation: row.recommendation,
    scoreBreakdown: row.score_breakdown,
    riskFactors: row.risk_factors,
    conditions: row.conditions,
    calculatedAt: new Date(row.calculated_at),
    validUntil: new Date(row.valid_until),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateTenantScore,
  getStoredTenantScore,
  analyzePaymentHistory,
};
