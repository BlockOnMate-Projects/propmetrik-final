/**
 * ETL Services Barrel Export
 * 
 * Central export point for all ETL pipeline services
 */

// Import services for internal use in ETLPipeline
import { AddressStandardizationService as AddressService, addressStandardizationService } from './addressStandardization';
import { DeduplicationService as DedupeService, deduplicationService } from './deduplication';
import { QualityScoringService as QualityService, qualityScoringService } from './qualityScoring';
import { DataEnrichmentService as EnrichmentService, dataEnrichmentService } from './dataEnrichment';

// Re-export types and services
export {
  AddressStandardizationService,
  addressStandardizationService,
  type StandardizedAddress,
  type AddressStandardizationOptions,
} from './addressStandardization';

export {
  DeduplicationService,
  deduplicationService,
  type PropertyMatch,
  type DuplicateGroup,
  type DeduplicationResult,
  type PropertyForMatching,
} from './deduplication';

export {
  QualityScoringService,
  qualityScoringService,
  type QualityScore,
  type QualityBreakdown,
  type PropertyQualityMetrics,
} from './qualityScoring';

export {
  DataEnrichmentService,
  dataEnrichmentService,
  type EnrichmentResult,
  type EnrichmentField,
  type EnrichmentOptions,
} from './dataEnrichment';

/**
 * ETL Pipeline Orchestrator
 * 
 * Coordinates all ETL services in the proper sequence
 */
export class ETLPipeline {
  private addressService: AddressService;
  private dedupeService: DedupeService;
  private qualityService: QualityService;
  private enrichmentService: EnrichmentService;

  constructor() {
    this.addressService = new AddressService();
    this.dedupeService = new DedupeService();
    this.qualityService = new QualityService();
    this.enrichmentService = new EnrichmentService();
  }

  /**
   * Process a single property through the full ETL pipeline
   */
  async processProperty(propertyId: string): Promise<{
    propertyId: string;
    stages: {
      enrichment: boolean;
      qualityScore: number;
      duplicatesFound: number;
    };
    errors: string[];
  }> {
    const errors: string[] = [];
    const stages = {
      enrichment: false,
      qualityScore: 0,
      duplicatesFound: 0,
    };

    try {
      // Stage 1: Enrich data
      const enrichmentResult = await this.enrichmentService.enrich(propertyId);
      stages.enrichment = enrichmentResult.success;
      if (enrichmentResult.errors.length > 0) {
        errors.push(...enrichmentResult.errors.map(e => `Enrichment: ${e}`));
      }

      // Stage 2: Calculate quality score
      const qualityMetrics = await this.qualityService.calculateScore(propertyId);
      stages.qualityScore = qualityMetrics.score.overall;

      // Stage 3: Check for duplicates (returns count only)
      const duplicates = await this.dedupeService.findDuplicates({
        id: propertyId,
        source: 'etl_pipeline',
        title: '',
        trustScore: 0.5,
      });
      stages.duplicatesFound = duplicates.length;

    } catch (error: any) {
      errors.push(`Pipeline error: ${error.message}`);
    }

    return {
      propertyId,
      stages,
      errors,
    };
  }

  /**
   * Run full ETL pipeline on all properties
   */
  async processAll(options: {
    batchSize?: number;
    enrichOnly?: boolean;
    qualityOnly?: boolean;
    dedupeOnly?: boolean;
  } = {}): Promise<{
    enriched: number;
    qualityScored: number;
    duplicatesProcessed: number;
    errors: number;
  }> {
    const { batchSize = 50, enrichOnly, qualityOnly, dedupeOnly } = options;
    const stats = {
      enriched: 0,
      qualityScored: 0,
      duplicatesProcessed: 0,
      errors: 0,
    };

    try {
      // Run enrichment
      if (!qualityOnly && !dedupeOnly) {
        const enrichResult = await this.enrichmentService.processAll({ batchSize });
        stats.enriched = enrichResult.enriched;
        stats.errors += enrichResult.errors;
      }

      // Run quality scoring
      if (!enrichOnly && !dedupeOnly) {
        const qualityResult = await this.qualityService.processAll({ batchSize });
        stats.qualityScored = qualityResult.updated;
        stats.errors += qualityResult.errors;
      }

      // Run deduplication
      if (!enrichOnly && !qualityOnly) {
        const dedupeResult = await this.dedupeService.processAll({ batchSize });
        stats.duplicatesProcessed = dedupeResult.duplicatesFound;
        stats.errors += dedupeResult.errors.length;
      }

    } catch (error) {
      stats.errors++;
    }

    return stats;
  }

  /**
   * Get combined statistics
   */
  async getStats(): Promise<{
    quality: {
      average: number;
      distribution: { range: string; count: number }[];
    };
    duplicates: {
      groupsCreated: number;
      duplicatesFound: number;
    };
  }> {
    const qualityStats = await this.qualityService.getQualityStats();
    const dedupeResult = await this.dedupeService.processAll({ batchSize: 0 });

    return {
      quality: {
        average: qualityStats.average,
        distribution: qualityStats.distribution,
      },
      duplicates: {
        groupsCreated: dedupeResult.groupsCreated,
        duplicatesFound: dedupeResult.duplicatesFound,
      },
    };
  }
}

// Export singleton pipeline instance
export const etlPipeline = new ETLPipeline();
