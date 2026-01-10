/**
 * Data Anonymization Service
 * Ensures Tier 2 financial data is properly anonymized before storage
 * 
 * Compliance:
 * - Ghana Data Protection Act 2012
 * - Banking Act 2004 (Ghana)
 * - International privacy standards (GDPR-inspired)
 * 
 * Methods:
 * - Remove: Complete field removal
 * - Hash: One-way cryptographic hashing
 * - Mask: Partial masking (e.g., phone: XXX-XXX-1234)
 * - Generalize: Reduce precision (e.g., exact address → district)
 * - Noise: Add statistical noise while preserving trends
 * - Aggregate: Group into bins/ranges
 */

import crypto from 'crypto';
import { pool } from '../../database';
import { logger } from '../../utils/logger';

export interface AnonymizationRule {
  id: string;
  dataset_type: string;
  source_tier: string;
  field_name: string;
  anonymization_method: 'remove' | 'hash' | 'mask' | 'generalize' | 'noise' | 'aggregate';
  anonymization_config: any;
  is_required: boolean;
  validation_regex?: string;
  regulation_reference: string;
}

export interface AnonymizationResult {
  success: boolean;
  processed_records: number;
  anonymized_fields: string[];
  warnings: string[];
  compliance_verified: boolean;
}

export interface AnonymizationConfig {
  // Hash configuration
  salt?: string;
  algorithm?: string;
  
  // Mask configuration
  mask_char?: string;
  show_first?: number;
  show_last?: number;
  
  // Generalize configuration
  level?: string; // 'district', 'region', 'country'
  precision?: number;
  
  // Noise configuration
  variance_percent?: number;
  distribution?: 'normal' | 'uniform';
  min_records?: number;
  radius_meters?: number;
  
  // Aggregate configuration
  bin_size?: number;
  min_count?: number;
}

class AnonymizationService {
  private readonly defaultSalt = 'propmetrik-anonymization-2026';

  /**
   * Get anonymization rules for a dataset type
   */
  async getRules(datasetType: string, sourceTier: string): Promise<AnonymizationRule[]> {
    const query = `
      SELECT *
      FROM anonymization_rules
      WHERE dataset_type = $1 AND source_tier = $2
      ORDER BY field_name
    `;

    const result = await pool.query(query, [datasetType, sourceTier]);
    return result.rows;
  }

  /**
   * Anonymize a batch of records
   */
  async anonymizeRecords(
    records: any[],
    datasetType: string,
    sourceTier: string
  ): Promise<{ anonymized: any[]; result: AnonymizationResult }> {
    const rules = await this.getRules(datasetType, sourceTier);
    
    if (rules.length === 0) {
      logger.warn('No anonymization rules found', {
        datasetType,
        sourceTier
      });
      
      return {
        anonymized: records,
        result: {
          success: false,
          processed_records: records.length,
          anonymized_fields: [],
          warnings: ['No anonymization rules defined'],
          compliance_verified: false
        }
      };
    }

    const anonymizedRecords: any[] = [];
    const anonymizedFields = new Set<string>();
    const warnings: string[] = [];
    let processedRecords = 0;

    for (const record of records) {
      try {
        const anonymizedRecord = { ...record };

        for (const rule of rules) {
          const fieldValue = record[rule.field_name];
          
          // Skip if field doesn't exist in record
          if (fieldValue === undefined || fieldValue === null) {
            if (rule.is_required) {
              warnings.push(`Required field '${rule.field_name}' missing in record`);
            }
            continue;
          }

          // Apply anonymization method
          const anonymizedValue = await this.applyAnonymization(
            fieldValue,
            rule.anonymization_method,
            rule.anonymization_config
          );

          if (rule.anonymization_method === 'remove') {
            delete anonymizedRecord[rule.field_name];
          } else {
            anonymizedRecord[rule.field_name] = anonymizedValue;
          }

          anonymizedFields.add(rule.field_name);

          // Validate result if regex provided
          if (rule.validation_regex && anonymizedValue) {
            const regex = new RegExp(rule.validation_regex);
            if (!regex.test(String(anonymizedValue))) {
              warnings.push(`Anonymized value for '${rule.field_name}' failed validation`);
            }
          }
        }

        anonymizedRecords.push(anonymizedRecord);
        processedRecords++;

      } catch (error) {
        logger.error('Error anonymizing record', {
          error: error instanceof Error ? error.message : String(error),
          recordIndex: processedRecords
        });
        warnings.push(`Failed to anonymize record ${processedRecords + 1}`);
      }
    }

    const result: AnonymizationResult = {
      success: processedRecords === records.length,
      processed_records: processedRecords,
      anonymized_fields: Array.from(anonymizedFields),
      warnings,
      compliance_verified: this.verifyCompliance(rules, anonymizedFields)
    };

    logger.info('Anonymization completed', {
      datasetType,
      sourceTier,
      inputRecords: records.length,
      processedRecords,
      anonymizedFields: result.anonymized_fields.length,
      warnings: warnings.length
    });

    return { anonymized: anonymizedRecords, result };
  }

  /**
   * Apply specific anonymization method to a field value
   */
  private async applyAnonymization(
    value: any,
    method: AnonymizationRule['anonymization_method'],
    config: AnonymizationConfig
  ): Promise<any> {
    switch (method) {
      case 'remove':
        return null; // Will be deleted from record
        
      case 'hash':
        return this.hashValue(value, config);
        
      case 'mask':
        return this.maskValue(value, config);
        
      case 'generalize':
        return this.generalizeValue(value, config);
        
      case 'noise':
        return this.addNoise(value, config);
        
      case 'aggregate':
        return this.aggregateValue(value, config);
        
      default:
        throw new Error(`Unknown anonymization method: ${method}`);
    }
  }

  /**
   * Hash a value using SHA-256
   */
  private hashValue(value: any, config: AnonymizationConfig): string {
    const salt = config.salt || this.defaultSalt;
    const algorithm = config.algorithm || 'sha256';
    
    const hash = crypto.createHash(algorithm);
    hash.update(String(value) + salt);
    
    return hash.digest('hex');
  }

  /**
   * Mask a value (e.g., phone number, email)
   */
  private maskValue(value: any, config: AnonymizationConfig): string {
    const str = String(value);
    const maskChar = config.mask_char || 'X';
    const showFirst = config.show_first || 0;
    const showLast = config.show_last || 0;

    if (str.length <= showFirst + showLast) {
      // If string is too short, mask everything except first/last chars
      return maskChar.repeat(str.length);
    }

    const firstPart = str.substring(0, showFirst);
    const lastPart = showLast > 0 ? str.substring(str.length - showLast) : '';
    const middleLength = str.length - showFirst - showLast;
    const maskedMiddle = maskChar.repeat(middleLength);

    return firstPart + maskedMiddle + lastPart;
  }

  /**
   * Generalize a value to reduce precision
   */
  private generalizeValue(value: any, config: AnonymizationConfig): string {
    if (config.level === 'district') {
      // For addresses, extract only district level
      const address = String(value).toLowerCase();
      const ghanaDistricts = [
        'accra metropolitan', 'kumasi metropolitan', 'tamale metropolitan',
        'tema municipal', 'cape coast metropolitan', 'takoradi'
      ];
      
      for (const district of ghanaDistricts) {
        if (address.includes(district)) {
          return district.charAt(0).toUpperCase() + district.slice(1);
        }
      }
      
      return 'Other District';
    }

    if (config.level === 'region') {
      // Extract region from address
      const address = String(value).toLowerCase();
      const ghanaRegions = [
        'greater accra', 'ashanti', 'northern', 'eastern', 'western',
        'central', 'volta', 'upper east', 'upper west', 'brong ahafo'
      ];
      
      for (const region of ghanaRegions) {
        if (address.includes(region)) {
          return region.charAt(0).toUpperCase() + region.slice(1) + ' Region';
        }
      }
      
      return 'Other Region';
    }

    // For numeric values, reduce precision
    if (typeof value === 'number' && config.precision) {
      return String(Math.round(value / config.precision) * config.precision);
    }

    return String(value);
  }

  /**
   * Add statistical noise to numeric values
   */
  private addNoise(value: any, config: AnonymizationConfig): number {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return numValue;
    }

    const variancePercent = config.variance_percent || 5;
    const distribution = config.distribution || 'normal';
    
    let noise: number;
    
    if (distribution === 'uniform') {
      // Uniform distribution: -variance to +variance
      const range = numValue * (variancePercent / 100);
      noise = (Math.random() - 0.5) * 2 * range;
    } else {
      // Normal distribution (Box-Muller transform)
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      const stdDev = numValue * (variancePercent / 100) / 3; // 3-sigma range
      noise = z0 * stdDev;
    }

    const noisyValue = numValue + noise;
    
    // Ensure positive values remain positive
    return numValue > 0 ? Math.max(0, noisyValue) : noisyValue;
  }

  /**
   * Aggregate values into bins
   */
  private aggregateValue(value: any, config: AnonymizationConfig): string {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return String(value);
    }

    const binSize = config.bin_size || 10000;
    const binStart = Math.floor(numValue / binSize) * binSize;
    const binEnd = binStart + binSize;

    return `${binStart.toLocaleString()} - ${binEnd.toLocaleString()}`;
  }

  /**
   * Verify compliance with all required rules
   */
  private verifyCompliance(
    rules: AnonymizationRule[],
    anonymizedFields: Set<string>
  ): boolean {
    const requiredRules = rules.filter(rule => rule.is_required);
    
    for (const rule of requiredRules) {
      if (!anonymizedFields.has(rule.field_name)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate anonymized dataset against regulations
   */
  async validateCompliance(
    records: any[],
    datasetType: string,
    sourceTier: string
  ): Promise<{
    compliant: boolean;
    violations: string[];
    recommendations: string[];
  }> {
    const rules = await this.getRules(datasetType, sourceTier);
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Check for PII that should be removed
    const piiFields = ['name', 'email', 'phone', 'address', 'id_number', 'account_number'];
    
    for (const record of records.slice(0, 10)) { // Sample check
      for (const field of Object.keys(record)) {
        const fieldLower = field.toLowerCase();
        
        // Check if field contains PII patterns
        if (piiFields.some(pii => fieldLower.includes(pii))) {
          const rule = rules.find(r => r.field_name === field);
          if (!rule || rule.anonymization_method !== 'remove') {
            violations.push(`PII field '${field}' should be removed or anonymized`);
          }
        }

        // Check for Ghana-specific identifiers
        if (fieldLower.includes('ghana_card') || fieldLower.includes('voter_id')) {
          violations.push(`Ghanaian ID field '${field}' must be removed`);
        }

        // Check for direct financial account information
        if (fieldLower.includes('account') && typeof record[field] === 'string') {
          const value = String(record[field]);
          if (value.length > 8 && /^\d+$/.test(value)) {
            violations.push(`Account number '${field}' appears to be unmasked`);
          }
        }
      }
    }

    // Recommendations for better anonymization
    if (records.length < 10) {
      recommendations.push('Dataset size is small - consider aggregating with other periods');
    }

    const complianceScore = Math.max(0, 1 - (violations.length / 10));
    
    logger.info('Compliance validation completed', {
      datasetType,
      sourceTier,
      violations: violations.length,
      recommendations: recommendations.length,
      complianceScore
    });

    return {
      compliant: violations.length === 0,
      violations,
      recommendations
    };
  }

  /**
   * Add new anonymization rule
   */
  async addRule(
    datasetType: string,
    sourceTier: string,
    fieldName: string,
    method: AnonymizationRule['anonymization_method'],
    config: AnonymizationConfig,
    isRequired = true,
    regulationReference = 'Data Protection Act 2012 - Ghana'
  ): Promise<string> {
    const query = `
      INSERT INTO anonymization_rules (
        dataset_type, source_tier, field_name, anonymization_method,
        anonymization_config, is_required, regulation_reference
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (dataset_type, field_name) DO UPDATE SET
        anonymization_method = EXCLUDED.anonymization_method,
        anonymization_config = EXCLUDED.anonymization_config,
        is_required = EXCLUDED.is_required
      RETURNING id
    `;

    const result = await pool.query(query, [
      datasetType,
      sourceTier,
      fieldName,
      method,
      JSON.stringify(config),
      isRequired,
      regulationReference
    ]);

    const ruleId = result.rows[0].id;

    logger.info('Anonymization rule added', {
      ruleId,
      datasetType,
      fieldName,
      method
    });

    return ruleId;
  }

  /**
   * Get anonymization statistics
   */
  async getAnonymizationStats(
    datasetType: string,
    sourceTier: string,
    records: any[]
  ): Promise<{
    totalFields: number;
    anonymizedFields: number;
    removedFields: number;
    privacyScore: number;
  }> {
    const rules = await this.getRules(datasetType, sourceTier);
    const sampleRecord = records[0] || {};
    
    const totalFields = Object.keys(sampleRecord).length;
    const anonymizedFields = rules.filter(r => r.anonymization_method !== 'remove').length;
    const removedFields = rules.filter(r => r.anonymization_method === 'remove').length;
    
    // Privacy score: higher when more sensitive fields are properly handled
    const privacyScore = totalFields > 0 ? 
      (anonymizedFields + removedFields) / totalFields : 1;

    return {
      totalFields,
      anonymizedFields,
      removedFields,
      privacyScore: Math.round(privacyScore * 100) / 100
    };
  }
}

export const anonymizationService = new AnonymizationService();