/**
 * Fee Engine Service
 * Centralized fee calculation for all PROPMETRIK payment types
 * 
 * Supports three fee modes:
 * - percentage: fee = principal × rate
 * - flat: fee = fixed amount
 * - max_of: fee = max(principal × rate, flat amount) — used for rent
 * 
 * Fee rules are loaded from the fee_configurations table and cached.
 * Per-entity overrides (from payment_accounts) take precedence over global defaults.
 * 
 * @module services/payment/feeEngine
 */

import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';

// =====================================================
// TYPES
// =====================================================

export type PaymentType = 'rent' | 'deal' | 'project' | 'subscription' | 'valuation';
export type FeeMode = 'percentage' | 'flat' | 'max_of';

export interface FeeRule {
    id: string;
    paymentType: PaymentType;
    organizationId: string | null;
    feeMode: FeeMode;
    percentageRate: number;   // Decimal, e.g. 0.01 for 1%
    flatAmount: number;       // GHS, e.g. 25.00
    currency: string;
    minFee: number | null;
    maxFee: number | null;
}

export interface FeeCalculation {
    /** The rent / deal / project principal in GHS */
    principalAmount: number;
    /** PROPMETRIK's service fee in GHS */
    serviceFee: number;
    /** Total the payer is charged (principal + serviceFee) */
    totalCharge: number;
    /** Service fee in pesewas (for Paystack transaction_charge) */
    serviceFeeSubunits: number;
    /** Total charge in pesewas (for Paystack amount) */
    totalChargeSubunits: number;
    /** Which fee mode was applied */
    feeMode: FeeMode;
    /** Percentage rate applied (for audit) */
    percentageRateApplied: number;
    /** Flat amount applied (for audit) */
    flatAmountApplied: number;
    /** Human-readable description */
    feeDescription: string;
    /** Currency */
    currency: string;
}

// =====================================================
// FEE ENGINE
// =====================================================

class FeeEngine {
    // In-memory cache: key = `${paymentType}:${orgId || 'global'}`
    private cache = new Map<string, { rule: FeeRule; loadedAt: number }>();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Calculate the fee for a payment.
     * 
     * @param paymentType  - 'rent' | 'deal' | 'project' | 'subscription'
     * @param principalGHS - The base amount in GHS (what the recipient should receive)
     * @param entityId     - Optional: org or user ID for per-entity override
     * @param entityType   - Optional: 'organization' | 'deal_manager' | 'project_manager'
     */
    async calculate(
        paymentType: PaymentType,
        principalGHS: number,
        entityId?: string,
        entityType?: string
    ): Promise<FeeCalculation> {
        // Subscriptions go fully to PROPMETRIK — no fee split
        if (paymentType === 'subscription') {
            return {
                principalAmount: principalGHS,
                serviceFee: 0,
                totalCharge: principalGHS,
                serviceFeeSubunits: 0,
                totalChargeSubunits: Math.round(principalGHS * 100),
                feeMode: 'flat',
                percentageRateApplied: 0,
                flatAmountApplied: 0,
                feeDescription: 'Subscription — no service fee',
                currency: 'GHS',
            };
        }

        // 1. Try per-entity override from payment_accounts table
        //    Per-entity overrides only apply to 'rent' payments (migrated from
        //    pm_payment_accounts — property management module). Deal and project
        //    fees use the global fee_configurations unless we add per-type
        //    override columns in the future.
        let overrideRate: number | null = null;
        let overrideFlat: number | null = null;

        if (entityId && entityType && paymentType === 'rent') {
            const override = await this.getEntityFeeOverride(entityId, entityType);
            if (override) {
                overrideRate = override.percentageRate;
                overrideFlat = override.flatAmount;
            }
        }

        // 2. Load the global fee rule for this payment type
        const rule = await this.getFeeRule(paymentType);

        // 3. Apply overrides if present
        const percentageRate = overrideRate ?? rule.percentageRate;
        const flatAmount = overrideFlat ?? rule.flatAmount;
        const feeMode = rule.feeMode;
        const currency = rule.currency;

        // 4. Calculate fee
        let serviceFee: number;

        switch (feeMode) {
            case 'percentage':
                serviceFee = principalGHS * percentageRate;
                break;

            case 'flat':
                serviceFee = flatAmount;
                break;

            case 'max_of':
                // max(percentage, flat) — e.g. max(1% of 3000 = 30, GH₵25) = 30
                const pctFee = principalGHS * percentageRate;
                serviceFee = Math.max(pctFee, flatAmount);
                break;

            default:
                serviceFee = principalGHS * percentageRate;
        }

        // 5. Apply min/max caps
        if (rule.minFee != null && serviceFee < rule.minFee) {
            serviceFee = rule.minFee;
        }
        if (rule.maxFee != null && serviceFee > rule.maxFee) {
            serviceFee = rule.maxFee;
        }

        // 6. Round to 2 decimal places
        serviceFee = Math.round(serviceFee * 100) / 100;

        const totalCharge = principalGHS + serviceFee;

        // 7. Build description
        let feeDescription: string;
        switch (feeMode) {
            case 'max_of':
                feeDescription = `Service fee: max(${(percentageRate * 100).toFixed(2)}%, ${currency} ${flatAmount.toFixed(2)}) = ${currency} ${serviceFee.toFixed(2)}`;
                break;
            case 'percentage':
                feeDescription = `Service fee: ${(percentageRate * 100).toFixed(2)}% = ${currency} ${serviceFee.toFixed(2)}`;
                break;
            case 'flat':
                feeDescription = `Service fee: ${currency} ${flatAmount.toFixed(2)}`;
                break;
            default:
                feeDescription = `Service fee: ${currency} ${serviceFee.toFixed(2)}`;
        }

        return {
            principalAmount: principalGHS,
            serviceFee,
            totalCharge,
            serviceFeeSubunits: Math.round(serviceFee * 100),
            totalChargeSubunits: Math.round(totalCharge * 100),
            feeMode,
            percentageRateApplied: percentageRate,
            flatAmountApplied: flatAmount,
            feeDescription,
            currency,
        };
    }

    /**
     * Get the global fee rule for a payment type (cached).
     */
    private async getFeeRule(paymentType: PaymentType): Promise<FeeRule> {
        const cacheKey = `${paymentType}:global`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.loadedAt < this.CACHE_TTL_MS) {
            return cached.rule;
        }

        try {
            const result = await pool.query(
                `SELECT * FROM fee_configurations
                 WHERE payment_type = $1
                   AND organization_id IS NULL
                   AND is_active = TRUE
                   AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
                 ORDER BY effective_from DESC
                 LIMIT 1`,
                [paymentType]
            );

            if (result.rows.length > 0) {
                const row = result.rows[0];
                const rule: FeeRule = {
                    id: row.id,
                    paymentType: row.payment_type,
                    organizationId: row.organization_id || null,
                    feeMode: row.fee_mode,
                    percentageRate: parseFloat(row.percentage_rate),
                    flatAmount: parseFloat(row.flat_amount),
                    currency: row.currency || 'GHS',
                    minFee: row.min_fee ? parseFloat(row.min_fee) : null,
                    maxFee: row.max_fee ? parseFloat(row.max_fee) : null,
                };

                this.cache.set(cacheKey, { rule, loadedAt: Date.now() });
                return rule;
            }
        } catch (error: any) {
            logger.error('Error loading fee configuration', { paymentType, error: error.message });
        }

        // Hardcoded fallback defaults (safety net)
        const defaults: Record<PaymentType, FeeRule> = {
            rent: {
                id: 'default-rent',
                paymentType: 'rent',
                organizationId: null,
                feeMode: 'max_of',
                percentageRate: 0.01,     // 1%
                flatAmount: 25.00,        // GH₵25
                currency: 'GHS',
                minFee: null,
                maxFee: null,
            },
            deal: {
                id: 'default-deal',
                paymentType: 'deal',
                organizationId: null,
                feeMode: 'percentage',
                percentageRate: 0.0025,   // 0.25%
                flatAmount: 0,
                currency: 'GHS',
                minFee: null,
                maxFee: null,
            },
            project: {
                id: 'default-project',
                paymentType: 'project',
                organizationId: null,
                feeMode: 'percentage',
                percentageRate: 0.0025,   // 0.25%
                flatAmount: 0,
                currency: 'GHS',
                minFee: null,
                maxFee: null,
            },
            subscription: {
                id: 'default-sub',
                paymentType: 'subscription',
                organizationId: null,
                feeMode: 'flat',
                percentageRate: 0,
                flatAmount: 0,
                currency: 'GHS',
                minFee: null,
                maxFee: null,
            },
            valuation: {
                id: 'default-valuation',
                paymentType: 'valuation',
                organizationId: null,
                feeMode: 'percentage',
                percentageRate: 0.025,    // 2.5%
                flatAmount: 0,
                currency: 'GHS',
                minFee: null,
                maxFee: null,
            },
        };

        return defaults[paymentType] || defaults.rent;
    }

    /**
     * Get per-entity fee overrides from payment_accounts table.
     */
    private async getEntityFeeOverride(
        entityId: string,
        entityType: string
    ): Promise<{ percentageRate: number | null; flatAmount: number | null } | null> {
        try {
            const result = await pool.query(
                `SELECT platform_fee_percentage, platform_fee_flat
                 FROM payment_accounts
                 WHERE entity_id = $1 AND entity_type = $2 AND is_active = TRUE
                 LIMIT 1`,
                [entityId, entityType]
            );

            if (result.rows.length === 0) return null;

            const row = result.rows[0];
            // platform_fee_percentage is stored as decimal rate: 0.0100 = 1%, 0.0025 = 0.25%
            // (migration 133 already converted from legacy "1.0 = 1%" format via / 100.0)
            const pct = row.platform_fee_percentage != null ? parseFloat(row.platform_fee_percentage) : null;
            const flat = row.platform_fee_flat != null ? parseFloat(row.platform_fee_flat) : null;

            // Only return if at least one override is set
            if (pct == null && flat == null) return null;

            return { percentageRate: pct, flatAmount: flat };
        } catch (error: any) {
            logger.warn('Error loading entity fee override', { entityId, entityType, error: error.message });
            return null;
        }
    }

    /**
     * Invalidate cache (call after admin updates fee config).
     */
    clearCache(): void {
        this.cache.clear();
        logger.info('FeeEngine cache cleared');
    }
}

export const feeEngine = new FeeEngine();
