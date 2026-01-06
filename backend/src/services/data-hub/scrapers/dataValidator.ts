/**
 * Data Validator
 * 
 * Validates incoming economic data with range checks,
 * anomaly detection, and data quality scoring.
 */

import { logger } from '../../../utils/logger';
import {
  ValidationResult,
  ValidationWarning,
  ValidationError,
  IndicatorValidationRules,
  VALIDATION_RULES,
} from './types';

export class DataValidator {
  private readonly rules: Record<string, IndicatorValidationRules>;

  constructor(customRules?: Record<string, IndicatorValidationRules>) {
    this.rules = { ...VALIDATION_RULES, ...customRules };
  }

  /**
   * Validate a single indicator value
   */
  validate(
    indicatorType: string,
    value: number,
    previousValue?: number | null
  ): ValidationResult {
    const warnings: ValidationWarning[] = [];
    const errors: ValidationError[] = [];

    const rules = this.rules[indicatorType];
    if (!rules) {
      // No specific rules, apply generic validation
      return this.genericValidation(value, previousValue);
    }

    // Check for NaN or Infinity
    if (!Number.isFinite(value)) {
      errors.push({
        code: 'INVALID_NUMBER',
        message: 'Value is not a valid finite number',
        details: { value },
      });
      return { is_valid: false, value, warnings, errors };
    }

    // Check positive constraint
    if (rules.requires_positive && value < 0) {
      errors.push({
        code: 'NEGATIVE_VALUE',
        message: `${indicatorType} requires a positive value`,
        details: { value },
      });
    }

    // Check minimum value
    if (value < rules.min_value) {
      errors.push({
        code: 'BELOW_MINIMUM',
        message: `Value ${value} is below minimum ${rules.min_value}`,
        details: { value, min: rules.min_value },
      });
    }

    // Check maximum value
    if (value > rules.max_value) {
      errors.push({
        code: 'ABOVE_MAXIMUM',
        message: `Value ${value} is above maximum ${rules.max_value}`,
        details: { value, max: rules.max_value },
      });
    }

    // Check change percentage if previous value exists
    if (previousValue !== null && previousValue !== undefined && previousValue !== 0) {
      const changePercent = Math.abs((value - previousValue) / previousValue) * 100;
      
      if (changePercent > rules.max_change_percent) {
        warnings.push({
          code: 'LARGE_CHANGE',
          message: `Value changed by ${changePercent.toFixed(2)}% which exceeds threshold of ${rules.max_change_percent}%`,
          threshold: rules.max_change_percent,
          actual: changePercent,
        });
      }
    }

    // Log validation issues
    if (errors.length > 0) {
      logger.warn('Data validation errors', {
        indicatorType,
        value,
        errors,
      });
    }

    return {
      is_valid: errors.length === 0,
      value,
      warnings,
      errors,
    };
  }

  /**
   * Generic validation for unknown indicator types
   */
  private genericValidation(
    value: number,
    previousValue?: number | null
  ): ValidationResult {
    const warnings: ValidationWarning[] = [];
    const errors: ValidationError[] = [];

    if (!Number.isFinite(value)) {
      errors.push({
        code: 'INVALID_NUMBER',
        message: 'Value is not a valid finite number',
      });
    }

    // Generic large change detection
    if (previousValue !== null && previousValue !== undefined && previousValue !== 0) {
      const changePercent = Math.abs((value - previousValue) / previousValue) * 100;
      if (changePercent > 50) {
        warnings.push({
          code: 'LARGE_CHANGE',
          message: `Value changed by ${changePercent.toFixed(2)}%`,
          threshold: 50,
          actual: changePercent,
        });
      }
    }

    return {
      is_valid: errors.length === 0,
      value,
      warnings,
      errors,
    };
  }

  /**
   * Validate a batch of indicators
   */
  validateBatch(
    indicators: Array<{
      indicator_type: string;
      value: number;
      previous_value?: number | null;
    }>
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const indicator of indicators) {
      const result = this.validate(
        indicator.indicator_type,
        indicator.value,
        indicator.previous_value
      );
      results.set(indicator.indicator_type, result);
    }

    return results;
  }

  /**
   * Check for anomalies across a time series
   */
  detectAnomalies(
    values: number[],
    windowSize: number = 5,
    stdDevThreshold: number = 2
  ): Array<{ index: number; value: number; zscore: number }> {
    if (values.length < windowSize) {
      return [];
    }

    const anomalies: Array<{ index: number; value: number; zscore: number }> = [];

    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const stdDev = Math.sqrt(
        window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length
      );

      if (stdDev > 0) {
        const zscore = Math.abs((values[i] - mean) / stdDev);
        if (zscore > stdDevThreshold) {
          anomalies.push({
            index: i,
            value: values[i],
            zscore,
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Calculate data quality score (0-100)
   */
  calculateQualityScore(
    indicators: Array<{
      indicator_type: string;
      value: number;
      previous_value?: number | null;
      source: string;
      timestamp: Date;
    }>
  ): number {
    if (indicators.length === 0) return 0;

    let totalScore = 0;
    const weights = {
      validation: 40,   // Passes validation checks
      freshness: 30,    // Data is recent
      source: 20,       // From authoritative source
      coverage: 10,     // Complete data
    };

    for (const indicator of indicators) {
      let indicatorScore = 0;

      // Validation score
      const validation = this.validate(
        indicator.indicator_type,
        indicator.value,
        indicator.previous_value
      );
      if (validation.is_valid) {
        indicatorScore += weights.validation;
        // Reduce score for warnings
        indicatorScore -= validation.warnings.length * 5;
      }

      // Freshness score
      const ageMs = Date.now() - indicator.timestamp.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays <= 1) {
        indicatorScore += weights.freshness;
      } else if (ageDays <= 7) {
        indicatorScore += weights.freshness * 0.8;
      } else if (ageDays <= 30) {
        indicatorScore += weights.freshness * 0.5;
      }

      // Source score
      const authoritativeSources = [
        'Bank of Ghana',
        'Ghana Statistical Service',
        'World Bank WDI',
        'ExchangeRate-API',
      ];
      if (authoritativeSources.includes(indicator.source)) {
        indicatorScore += weights.source;
      } else {
        indicatorScore += weights.source * 0.5;
      }

      // Coverage (has value)
      if (indicator.value !== null && indicator.value !== undefined) {
        indicatorScore += weights.coverage;
      }

      totalScore += Math.max(0, Math.min(100, indicatorScore));
    }

    return Math.round(totalScore / indicators.length);
  }
}

export const dataValidator = new DataValidator();
