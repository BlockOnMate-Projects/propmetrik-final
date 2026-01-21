/**
 * Feature Flags Service
 * 
 * Configuration and utilities for gradual rollout of Floor Plan V2.
 * Supports environment-based flags, user targeting, and A/B testing.
 * 
 * @module services/featureFlags
 * @version 1.0.0
 * @since Phase 5 - Week 16
 */

import { logger } from '../../../utils/logger';
import { query } from '../../../database';

// ============================================================================
// TYPES
// ============================================================================

export interface FeatureFlag {
  key: string;
  type: 'boolean' | 'string' | 'number';
  defaultValue: any;
  description: string;
  targeting?: TargetingRule[];
  enabled: boolean;
}

export interface TargetingRule {
  condition: string;
  value: any;
  percentage?: number;
  userIds?: string[];
  organizationIds?: string[];
  valuationIds?: string[];
}

export interface FeatureFlagContext {
  userId?: string;
  organizationId?: string;
  valuationId?: string;
  email?: string;
  isInternal?: boolean;
  isBeta?: boolean;
}

export interface FeatureFlagEvaluation {
  key: string;
  value: any;
  reason: 'default' | 'targeting' | 'percentage' | 'override';
  source: 'config' | 'database' | 'environment';
}

// ============================================================================
// FLOOR PLAN V2 FLAGS
// ============================================================================

export const FLOOR_PLAN_V2_FLAGS: Record<string, FeatureFlag> = {
  /**
   * Master switch for Floor Plan V2
   */
  'floor-plan-v2-enabled': {
    key: 'floor-plan-v2-enabled',
    type: 'boolean',
    defaultValue: false,
    description: 'Enable Floor Plan V2 with Blender geometry rendering',
    targeting: [
      { condition: 'internal_users', value: true, percentage: 100 },
      { condition: 'beta_organizations', value: true, percentage: 100 },
      { condition: 'all_users', value: true, percentage: 10 }, // 10% rollout
    ],
    enabled: true,
  },

  /**
   * Force legacy mode for specific valuations
   */
  'floor-plan-force-legacy': {
    key: 'floor-plan-force-legacy',
    type: 'boolean',
    defaultValue: false,
    description: 'Force legacy floor plan renderer for problematic valuations',
    targeting: [
      {
        condition: 'valuation_list',
        value: true,
        valuationIds: [], // Populate with problematic valuation IDs
      },
    ],
    enabled: true,
  },

  /**
   * LLM model selection for design intent
   */
  'floor-plan-llm-model': {
    key: 'floor-plan-llm-model',
    type: 'string',
    defaultValue: 'claude-sonnet-4-20250514',
    description: 'LLM model to use for floor plan design intent generation',
    targeting: [
      { condition: 'a_b_test', value: 'claude-3-5-haiku-20241022', percentage: 20 },
    ],
    enabled: true,
  },

  /**
   * Enable real-time WebSocket updates
   */
  'floor-plan-realtime-enabled': {
    key: 'floor-plan-realtime-enabled',
    type: 'boolean',
    defaultValue: true,
    description: 'Enable real-time geometry updates via WebSocket',
    targeting: [],
    enabled: true,
  },

  /**
   * Enable geometry caching
   */
  'floor-plan-cache-enabled': {
    key: 'floor-plan-cache-enabled',
    type: 'boolean',
    defaultValue: true,
    description: 'Enable Redis caching for Blender geometry',
    targeting: [],
    enabled: true,
  },

  /**
   * Show migration banner
   */
  'floor-plan-show-migration-banner': {
    key: 'floor-plan-show-migration-banner',
    type: 'boolean',
    defaultValue: true,
    description: 'Show migration banner on legacy floor plans',
    targeting: [],
    enabled: true,
  },

  /**
   * Enable constrained adjustments
   */
  'floor-plan-adjustments-enabled': {
    key: 'floor-plan-adjustments-enabled',
    type: 'boolean',
    defaultValue: true,
    description: 'Allow users to make constrained adjustments to floor plans',
    targeting: [
      { condition: 'internal_users', value: true, percentage: 100 },
      { condition: 'all_users', value: true, percentage: 50 },
    ],
    enabled: true,
  },
};

// ============================================================================
// FEATURE FLAGS SERVICE
// ============================================================================

class FeatureFlagsService {
  private flags: Map<string, FeatureFlag> = new Map();
  private overrides: Map<string, any> = new Map();
  private userSegments: Map<string, Set<string>> = new Map();

  constructor() {
    // Initialize with default flags
    for (const [key, flag] of Object.entries(FLOOR_PLAN_V2_FLAGS)) {
      this.flags.set(key, flag);
    }

    // Load from environment
    this.loadFromEnvironment();
  }

  /**
   * Load feature flags from environment variables
   */
  private loadFromEnvironment(): void {
    for (const [key, flag] of this.flags.entries()) {
      const envKey = `FEATURE_${key.toUpperCase().replace(/-/g, '_')}`;
      const envValue = process.env[envKey];

      if (envValue !== undefined) {
        let parsedValue: any;

        switch (flag.type) {
          case 'boolean':
            parsedValue = envValue.toLowerCase() === 'true';
            break;
          case 'number':
            parsedValue = parseFloat(envValue);
            break;
          default:
            parsedValue = envValue;
        }

        this.overrides.set(key, parsedValue);
        logger.debug('Feature flag loaded from environment', { key, value: parsedValue });
      }
    }
  }

  /**
   * Load user segments from database
   */
  async loadUserSegments(): Promise<void> {
    try {
      // Load internal users
      const internalResult = await query(`
        SELECT id FROM users WHERE role IN ('admin', 'developer', 'internal')
      `);
      this.userSegments.set('internal_users', new Set(internalResult.rows.map(r => r.id)));

      // Load beta organizations
      const betaResult = await query(`
        SELECT id FROM organizations WHERE is_beta = true
      `);
      this.userSegments.set('beta_organizations', new Set(betaResult.rows.map(r => r.id)));

      logger.info('User segments loaded', {
        internal_users: this.userSegments.get('internal_users')?.size || 0,
        beta_organizations: this.userSegments.get('beta_organizations')?.size || 0,
      });
    } catch (error) {
      logger.warn('Failed to load user segments', { error });
    }
  }

  /**
   * Evaluate a feature flag
   */
  evaluate(key: string, context: FeatureFlagContext = {}): FeatureFlagEvaluation {
    const flag = this.flags.get(key);

    if (!flag || !flag.enabled) {
      return {
        key,
        value: flag?.defaultValue ?? false,
        reason: 'default',
        source: 'config',
      };
    }

    // Check for environment override
    if (this.overrides.has(key)) {
      return {
        key,
        value: this.overrides.get(key),
        reason: 'override',
        source: 'environment',
      };
    }

    // Check targeting rules
    if (flag.targeting && flag.targeting.length > 0) {
      for (const rule of flag.targeting) {
        const matches = this.evaluateRule(rule, context);
        if (matches) {
          // Check percentage rollout
          if (rule.percentage !== undefined) {
            const hash = this.hashContext(key, context);
            const bucket = hash % 100;

            if (bucket < rule.percentage) {
              return {
                key,
                value: rule.value,
                reason: 'percentage',
                source: 'config',
              };
            }
          } else {
            return {
              key,
              value: rule.value,
              reason: 'targeting',
              source: 'config',
            };
          }
        }
      }
    }

    return {
      key,
      value: flag.defaultValue,
      reason: 'default',
      source: 'config',
    };
  }

  /**
   * Evaluate a targeting rule
   */
  private evaluateRule(rule: TargetingRule, context: FeatureFlagContext): boolean {
    switch (rule.condition) {
      case 'internal_users':
        if (context.isInternal) return true;
        if (context.userId) {
          const internalUsers = this.userSegments.get('internal_users');
          return internalUsers?.has(context.userId) || false;
        }
        if (context.email?.endsWith('@propmetrik.com')) return true;
        return false;

      case 'beta_organizations':
        if (context.isBeta) return true;
        if (context.organizationId) {
          const betaOrgs = this.userSegments.get('beta_organizations');
          return betaOrgs?.has(context.organizationId) || false;
        }
        return false;

      case 'valuation_list':
        if (context.valuationId && rule.valuationIds) {
          return rule.valuationIds.includes(context.valuationId);
        }
        return false;

      case 'user_list':
        if (context.userId && rule.userIds) {
          return rule.userIds.includes(context.userId);
        }
        return false;

      case 'all_users':
        return true;

      case 'a_b_test':
        return true; // Let percentage handle the decision

      default:
        return false;
    }
  }

  /**
   * Generate consistent hash for percentage rollout
   */
  private hashContext(key: string, context: FeatureFlagContext): number {
    const identifier = context.userId || context.organizationId || context.valuationId || 'default';
    const str = `${key}:${identifier}`;

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }

  /**
   * Get boolean flag value (convenience method)
   */
  isEnabled(key: string, context: FeatureFlagContext = {}): boolean {
    const result = this.evaluate(key, context);
    return Boolean(result.value);
  }

  /**
   * Get string flag value
   */
  getString(key: string, context: FeatureFlagContext = {}): string {
    const result = this.evaluate(key, context);
    return String(result.value);
  }

  /**
   * Get all flag values for context
   */
  getAllFlags(context: FeatureFlagContext = {}): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key of this.flags.keys()) {
      result[key] = this.evaluate(key, context).value;
    }

    return result;
  }

  /**
   * Set override (for testing)
   */
  setOverride(key: string, value: any): void {
    this.overrides.set(key, value);
  }

  /**
   * Clear override
   */
  clearOverride(key: string): void {
    this.overrides.delete(key);
  }

  /**
   * Clear all overrides
   */
  clearAllOverrides(): void {
    this.overrides.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: FeatureFlagsService | null = null;

export function getFeatureFlagsService(): FeatureFlagsService {
  if (!instance) {
    instance = new FeatureFlagsService();
  }
  return instance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check if Floor Plan V2 is enabled for a context
 */
export function isFloorPlanV2Enabled(context: FeatureFlagContext = {}): boolean {
  return getFeatureFlagsService().isEnabled('floor-plan-v2-enabled', context);
}

/**
 * Check if legacy mode should be forced for a valuation
 */
export function shouldForceLegacy(valuationId: string): boolean {
  return getFeatureFlagsService().isEnabled('floor-plan-force-legacy', { valuationId });
}

/**
 * Get LLM model to use
 */
export function getFloorPlanLLMModel(context: FeatureFlagContext = {}): string {
  return getFeatureFlagsService().getString('floor-plan-llm-model', context);
}

/**
 * Check if adjustments are enabled
 */
export function areAdjustmentsEnabled(context: FeatureFlagContext = {}): boolean {
  return getFeatureFlagsService().isEnabled('floor-plan-adjustments-enabled', context);
}

/**
 * Get floor plan builder component based on feature flags
 */
export function getFloorPlanBuilderType(
  valuationId: string,
  userId?: string,
  organizationId?: string
): 'v2' | 'legacy' {
  const context: FeatureFlagContext = {
    valuationId,
    userId,
    organizationId,
  };

  const useV2 = isFloorPlanV2Enabled(context);
  const forceLegacy = shouldForceLegacy(valuationId);

  if (useV2 && !forceLegacy) {
    return 'v2';
  }

  return 'legacy';
}

export default FeatureFlagsService;
