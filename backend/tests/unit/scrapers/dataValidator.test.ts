/**
 * Data Validator Unit Tests
 */

import { DataValidator, dataValidator } from '../../../src/services/data-hub/scrapers/dataValidator';
import { VALIDATION_RULES } from '../../../src/services/data-hub/scrapers/types';

describe('DataValidator', () => {
  describe('validate', () => {
    it('should validate a valid inflation rate', () => {
      const result = dataValidator.validate('inflation_rate', 23.5);

      expect(result.is_valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject NaN values', () => {
      const result = dataValidator.validate('gdp_growth', NaN);

      expect(result.is_valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NUMBER')).toBe(true);
    });

    it('should reject Infinity values', () => {
      const result = dataValidator.validate('inflation_rate', Infinity);

      expect(result.is_valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NUMBER')).toBe(true);
    });

    it('should reject values below minimum', () => {
      const result = dataValidator.validate('inflation_rate', -50);

      expect(result.is_valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BELOW_MINIMUM')).toBe(true);
    });

    it('should reject values above maximum', () => {
      const result = dataValidator.validate('inflation_rate', 200);

      expect(result.is_valid).toBe(false);
      expect(result.errors.some(e => e.code === 'ABOVE_MAXIMUM')).toBe(true);
    });

    it('should add warning for large changes from previous value', () => {
      const previousValue = 20;
      const newValue = 40; // 100% change

      const result = dataValidator.validate('inflation_rate', newValue, previousValue);

      expect(result.warnings.some(w => w.code === 'LARGE_CHANGE')).toBe(true);
    });

    it('should handle zero previous value without division error', () => {
      const result = dataValidator.validate('gdp_growth', 5.0, 0);
      expect(result.is_valid).toBe(true);
    });

    it('should handle null previous value', () => {
      const result = dataValidator.validate('gdp_growth', 5.0, null);
      expect(result.is_valid).toBe(true);
    });

    it('should use generic validation for unknown indicator types', () => {
      const result = dataValidator.validate('unknown_indicator', 50);
      expect(result).toHaveProperty('is_valid');
    });
  });

  describe('validateBatch', () => {
    it('should validate a map of indicators', () => {
      const indicators = [
        { indicator_type: 'inflation_rate', value: 23.5 },
        { indicator_type: 'gdp_growth', value: 3.2 },
        { indicator_type: 'exchange_rate_usd', value: 15.5 },
      ];

      const results = dataValidator.validateBatch(indicators);

      expect(results.size).toBe(3);
      expect(results.get('inflation_rate')?.is_valid).toBe(true);
      expect(results.get('gdp_growth')?.is_valid).toBe(true);
      expect(results.get('exchange_rate_usd')?.is_valid).toBe(true);
    });

    it('should handle empty batch', () => {
      const results = dataValidator.validateBatch([]);
      expect(results.size).toBe(0);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect anomalies in time series with variation', () => {
      // Values with normal variation, then a huge outlier
      const values = [20, 22, 18, 21, 19, 23, 20, 22, 18, 100];

      const anomalies = dataValidator.detectAnomalies(values, 5, 2);

      expect(anomalies.length).toBeGreaterThan(0);
      // Check that an anomaly with value 100 exists
      const hasLargeAnomaly = anomalies.some(a => a.value === 100);
      expect(hasLargeAnomaly).toBe(true);
    });

    it('should not flag stable values as anomalies', () => {
      // All same values - zero std dev means no anomalies detected
      const values = [20, 20, 20, 20, 20, 20, 20, 20, 20, 20];

      const anomalies = dataValidator.detectAnomalies(values, 5, 2);

      expect(anomalies).toHaveLength(0);
    });

    it('should return empty with insufficient data', () => {
      const values = [20, 21]; // Too few

      const anomalies = dataValidator.detectAnomalies(values, 5);

      expect(anomalies).toHaveLength(0);
    });
  });

  describe('calculateQualityScore', () => {
    it('should return a score between 0 and 100', () => {
      const indicators = [{
        indicator_type: 'inflation_rate',
        value: 23.5,
        source: 'Bank of Ghana',
        timestamp: new Date(),
      }];

      const score = dataValidator.calculateQualityScore(indicators);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return higher score for authoritative sources', () => {
      const officialIndicator = [{
        indicator_type: 'inflation_rate',
        value: 23.5,
        source: 'Bank of Ghana',
        timestamp: new Date(),
      }];

      const unknownIndicator = [{
        indicator_type: 'inflation_rate',
        value: 23.5,
        source: 'Unknown Source',
        timestamp: new Date(),
      }];

      const officialScore = dataValidator.calculateQualityScore(officialIndicator);
      const unknownScore = dataValidator.calculateQualityScore(unknownIndicator);

      expect(officialScore).toBeGreaterThan(unknownScore);
    });

    it('should return 0 for empty array', () => {
      const score = dataValidator.calculateQualityScore([]);
      expect(score).toBe(0);
    });
  });

  describe('VALIDATION_RULES', () => {
    it('should have rules for key indicator types', () => {
      const expectedTypes = [
        'inflation_rate',
        'gdp_growth',
        'interest_rate_policy',
        'exchange_rate_usd',
        'exchange_rate_gbp',
        'exchange_rate_eur',
        'unemployment_rate',
      ];

      for (const type of expectedTypes) {
        expect(VALIDATION_RULES[type]).toBeDefined();
        expect(VALIDATION_RULES[type].min_value).toBeDefined();
        expect(VALIDATION_RULES[type].max_value).toBeDefined();
      }
    });

    it('should have max change percent defined for all rules', () => {
      for (const [type, rules] of Object.entries(VALIDATION_RULES)) {
        expect(rules.max_change_percent).toBeDefined();
        expect(rules.max_change_percent).toBeGreaterThan(0);
      }
    });
  });
});
