/**
 * Data Hub ETL Orchestrator
 * 
 * Master service that orchestrates all ETL operations including:
 * - Deduplication (finding and grouping duplicate properties)
 * - Conflict Resolution (resolving field-level conflicts between sources)
 * - Multi-source Tracking (maintaining data provenance)
 * - Data Quality Scoring (calculating completeness and accuracy)
 * 
 * This service provides the main entry points for:
 * - Full ETL pipeline runs
 * - Incremental updates
 * - Scheduled jobs (via cron or external scheduler)
 * - Manual operations
 */

import { Pool } from 'pg';
import { logger } from '../../../utils/logger';
import { deduplicationService, DeduplicationResult, MergeResult } from './deduplication';
import { conflictResolutionService, PropertyResolution } from './conflictResolution';
import { multiSourceTrackingService, PropertySourceSummary } from './multiSourceTracking';
import { qualityScoringService } from './qualityScoring';

// ETL job status
export type ETLJobStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ETL job type
export type ETLJobType = 
  | 'full_pipeline'
  | 'deduplication'
  | 'conflict_resolution'
  | 'quality_scoring'
  | 'incremental_update';

// Interface for ETL job configuration
export interface ETLJobConfig {
  type: ETLJobType;
  options?: {
    batchSize?: number;
    dryRun?: boolean;
    autoMerge?: boolean;
    minConfidence?: number;
    maxErrors?: number;
    progressInterval?: number;
  };
}

// Interface for ETL job result
export interface ETLJobResult {
  job_id: string;
  type: ETLJobType;
  status: ETLJobStatus;
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
  stats: {
    properties_processed: number;
    duplicates_found: number;
    merges_completed: number;
    conflicts_resolved: number;
    sources_tracked: number;
    quality_scores_updated: number;
    errors: number;
  };
  errors: string[];
}

// Interface for pipeline progress
export interface PipelineProgress {
  stage: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
}

// Interface for data quality report
export interface DataQualityReport {
  generated_at: Date;
  total_properties: number;
  by_source: {
    source: string;
    count: number;
    avg_quality: number;
    avg_completeness: number;
  }[];
  by_region: {
    region: string;
    count: number;
    avg_quality: number;
  }[];
  field_coverage: Record<string, { count: number; percentage: number }>;
  duplicate_rate: number;
  multi_source_rate: number;
}

export class ETLOrchestrator {
  private pool: Pool;
  private currentJob: ETLJobResult | null = null;
  private progressCallbacks: ((progress: PipelineProgress) => void)[] = [];

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  /**
   * Register a progress callback
   */
  onProgress(callback: (progress: PipelineProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Emit progress to all registered callbacks
   */
  private emitProgress(progress: PipelineProgress): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (e) {
        // Ignore callback errors
      }
    }
  }

  /**
   * Run full ETL pipeline
   */
  async runFullPipeline(
    options: ETLJobConfig['options'] = {}
  ): Promise<ETLJobResult> {
    const {
      batchSize = 100,
      dryRun = false,
      autoMerge = true,
      minConfidence = 70,
      maxErrors = 100,
    } = options;

    const jobId = this.generateJobId();
    const startedAt = new Date();
    
    this.currentJob = {
      job_id: jobId,
      type: 'full_pipeline',
      status: 'running',
      started_at: startedAt,
      stats: {
        properties_processed: 0,
        duplicates_found: 0,
        merges_completed: 0,
        conflicts_resolved: 0,
        sources_tracked: 0,
        quality_scores_updated: 0,
        errors: 0,
      },
      errors: [],
    };

    await this.logJobStart(jobId, 'full_pipeline');

    try {
      // Stage 1: Quality Scoring
      this.emitProgress({
        stage: 'quality_scoring',
        current: 0,
        total: 1,
        percentage: 0,
        message: 'Updating data quality scores...',
      });

      const qualityResult = await this.runQualityScoring(batchSize, dryRun);
      this.currentJob.stats.quality_scores_updated = qualityResult.updated;
      
      // Stage 2: Deduplication
      this.emitProgress({
        stage: 'deduplication',
        current: 0,
        total: 1,
        percentage: 25,
        message: 'Running deduplication...',
      });

      const dedupResult = await this.runDeduplication({
        batchSize,
        dryRun,
        autoMerge,
        threshold: minConfidence,
      });

      this.currentJob.stats.properties_processed = dedupResult.totalProcessed;
      this.currentJob.stats.duplicates_found = dedupResult.duplicatesFound;
      this.currentJob.stats.merges_completed = dedupResult.mergesConducted;
      this.currentJob.errors.push(...dedupResult.errors.slice(0, maxErrors));

      // Stage 3: Conflict Resolution (for properties with multiple sources)
      this.emitProgress({
        stage: 'conflict_resolution',
        current: 0,
        total: 1,
        percentage: 60,
        message: 'Resolving data conflicts...',
      });

      const conflictResult = await this.runConflictResolution(batchSize, dryRun);
      this.currentJob.stats.conflicts_resolved = conflictResult.resolved;

      // Stage 4: Source Statistics Update
      this.emitProgress({
        stage: 'statistics',
        current: 0,
        total: 1,
        percentage: 90,
        message: 'Updating source statistics...',
      });

      const sourceStats = await multiSourceTrackingService.getSourceStatistics();
      this.currentJob.stats.sources_tracked = sourceStats.total_tracked_properties;

      // Complete
      this.currentJob.status = 'completed';
      this.currentJob.completed_at = new Date();
      this.currentJob.duration_ms = Date.now() - startedAt.getTime();
      this.currentJob.stats.errors = this.currentJob.errors.length;

      this.emitProgress({
        stage: 'complete',
        current: 1,
        total: 1,
        percentage: 100,
        message: 'Pipeline completed successfully',
      });

      await this.logJobComplete(jobId, this.currentJob);

      return this.currentJob;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentJob.status = 'failed';
      this.currentJob.completed_at = new Date();
      this.currentJob.duration_ms = Date.now() - startedAt.getTime();
      this.currentJob.errors.push(`Pipeline failed: ${errorMessage}`);

      await this.logJobFailed(jobId, errorMessage);

      logger.error(`ETL pipeline failed: ${errorMessage}`);
      return this.currentJob;
    }
  }

  /**
   * Run deduplication only
   */
  async runDeduplication(
    options: {
      batchSize?: number;
      dryRun?: boolean;
      autoMerge?: boolean;
      threshold?: number;
    } = {}
  ): Promise<DeduplicationResult> {
    const { batchSize = 100, dryRun = false, autoMerge = true, threshold = 70 } = options;

    logger.info(`Starting deduplication (batch: ${batchSize}, dryRun: ${dryRun})`);

    // Run enhanced deduplication with progress tracking
    const result = await deduplicationService.processWithEnhancedMatching({
      batchSize,
      includeImages: true,
      dryRun,
      progressCallback: (progress) => {
        this.emitProgress({
          stage: 'deduplication',
          current: progress.processed,
          total: progress.processed + 100, // Approximate
          percentage: Math.min(90, (progress.processed / (progress.processed + 100)) * 100),
          message: `Processed ${progress.processed} properties, found ${progress.found} duplicates`,
        });
      },
    });

    // Auto-merge high confidence duplicates if enabled
    if (autoMerge && !dryRun) {
      const mergeResult = await deduplicationService.autoMergeHighConfidence({
        batchSize: 50,
        threshold: 85,
        dryRun: false,
      });
      result.mergesConducted += mergeResult.successful;
      result.autoMerges = mergeResult.successful;
    }

    logger.info(`Deduplication complete: ${result.duplicatesFound} duplicates found, ${result.mergesConducted} merged`);

    return result;
  }

  /**
   * Run conflict resolution for all multi-source properties
   */
  async runConflictResolution(
    batchSize: number = 100,
    dryRun: boolean = false
  ): Promise<{ resolved: number; errors: string[] }> {
    logger.info(`Starting conflict resolution (batch: ${batchSize})`);

    const propertyIds = await conflictResolutionService.findPropertiesWithConflicts({
      limit: batchSize * 10,
      minSources: 2,
    });

    let resolved = 0;
    const errors: string[] = [];

    for (let i = 0; i < propertyIds.length; i += batchSize) {
      const batch = propertyIds.slice(i, i + batchSize);
      const result = await conflictResolutionService.resolveConflictsBatch(batch, { dryRun });
      
      resolved += result.successful;
      errors.push(...result.errors.map(e => e.error));

      this.emitProgress({
        stage: 'conflict_resolution',
        current: i + batch.length,
        total: propertyIds.length,
        percentage: ((i + batch.length) / propertyIds.length) * 100,
        message: `Resolved conflicts for ${i + batch.length}/${propertyIds.length} properties`,
      });
    }

    logger.info(`Conflict resolution complete: ${resolved} properties resolved`);

    return { resolved, errors };
  }

  /**
   * Run quality scoring update
   */
  async runQualityScoring(
    batchSize: number = 100,
    dryRun: boolean = false
  ): Promise<{ updated: number; errors: string[] }> {
    logger.info('Starting quality scoring update');

    let updated = 0;
    const errors: string[] = [];

    try {
      // Get properties that need quality score updates
      const result = await this.pool.query(`
        SELECT id, region
        FROM properties
        WHERE status = 'active'
          AND (
            completeness_score IS NULL 
            OR updated_at > COALESCE(
              (metadata->>'quality_scored_at')::timestamp,
              '1970-01-01'::timestamp
            )
          )
        LIMIT $1
      `, [batchSize * 10]);

      const properties = result.rows;

      for (const prop of properties) {
        try {
          if (!dryRun) {
            // Calculate quality score using the service
            const metrics = await qualityScoringService.calculateScore(prop.id);
            
            await this.pool.query(`
              UPDATE properties SET
                completeness_score = $1,
                metadata = jsonb_set(
                  COALESCE(metadata, '{}'),
                  '{quality_scored_at}',
                  to_jsonb(NOW()::text)
                ),
                updated_at = NOW()
              WHERE id = $2 AND region = $3
            `, [metrics.score.overall, prop.id, prop.region]);
          }
          updated++;
        } catch (e) {
          errors.push(`Quality scoring failed for ${prop.id}: ${e}`);
        }
      }

      logger.info(`Quality scoring complete: ${updated} properties updated`);

    } catch (error) {
      errors.push(`Quality scoring error: ${error}`);
    }

    return { updated, errors };
  }

  /**
   * Run incremental update (for new/changed properties only)
   */
  async runIncrementalUpdate(
    sinceTimestamp: Date,
    options: ETLJobConfig['options'] = {}
  ): Promise<ETLJobResult> {
    const { batchSize = 50, dryRun = false } = options;

    const jobId = this.generateJobId();
    const startedAt = new Date();

    this.currentJob = {
      job_id: jobId,
      type: 'incremental_update',
      status: 'running',
      started_at: startedAt,
      stats: {
        properties_processed: 0,
        duplicates_found: 0,
        merges_completed: 0,
        conflicts_resolved: 0,
        sources_tracked: 0,
        quality_scores_updated: 0,
        errors: 0,
      },
      errors: [],
    };

    try {
      // Get properties updated since timestamp
      const result = await this.pool.query(`
        SELECT id, region
        FROM properties
        WHERE updated_at >= $1
          AND status = 'active'
        ORDER BY updated_at DESC
      `, [sinceTimestamp]);

      const propertyIds = result.rows.map(r => r.id);
      this.currentJob.stats.properties_processed = propertyIds.length;

      // Run deduplication for each new property
      for (const propertyId of propertyIds) {
        try {
          // Find duplicates for this specific property
          const property = await this.getPropertyForMatching(propertyId);
          if (!property) continue;

          const duplicates = await deduplicationService.findDuplicates(property, {
            threshold: 70,
          });

          if (duplicates.length > 0) {
            this.currentJob.stats.duplicates_found += duplicates.length;
          }

          // Resolve conflicts if property has multiple sources
          const sources = await multiSourceTrackingService.getPropertySourceSummary(propertyId);
          if (sources.total_sources > 1) {
            if (!dryRun) {
              await conflictResolutionService.resolvePropertyConflicts(propertyId);
              this.currentJob.stats.conflicts_resolved++;
            }
          }

        } catch (e) {
          this.currentJob.errors.push(`Error processing ${propertyId}: ${e}`);
        }
      }

      this.currentJob.status = 'completed';
      this.currentJob.completed_at = new Date();
      this.currentJob.duration_ms = Date.now() - startedAt.getTime();
      this.currentJob.stats.errors = this.currentJob.errors.length;

      return this.currentJob;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentJob.status = 'failed';
      this.currentJob.completed_at = new Date();
      this.currentJob.errors.push(errorMessage);
      return this.currentJob;
    }
  }

  /**
   * Generate data quality report
   */
  async generateQualityReport(): Promise<DataQualityReport> {
    const client = await this.pool.connect();

    try {
      // Total properties
      const totalResult = await client.query(
        "SELECT COUNT(*) FROM properties WHERE status = 'active'"
      );
      const totalProperties = parseInt(totalResult.rows[0].count);

      // By source
      const sourceResult = await client.query(`
        SELECT 
          external_source as source,
          COUNT(*) as count,
          AVG(completeness_score) as avg_quality,
          AVG(CASE 
            WHEN bedrooms IS NOT NULL THEN 1.0 ELSE 0 END +
            CASE WHEN bathrooms IS NOT NULL THEN 1.0 ELSE 0 END +
            CASE WHEN price IS NOT NULL THEN 1.0 ELSE 0 END +
            CASE WHEN latitude IS NOT NULL THEN 1.0 ELSE 0 END
          ) / 4 as avg_completeness
        FROM properties
        WHERE status = 'active'
        GROUP BY external_source
        ORDER BY count DESC
      `);

      // By region
      const regionResult = await client.query(`
        SELECT 
          region,
          COUNT(*) as count,
          AVG(completeness_score) as avg_quality
        FROM properties
        WHERE status = 'active'
        GROUP BY region
        ORDER BY count DESC
      `);

      // Field coverage
      const fieldCoverage: Record<string, { count: number; percentage: number }> = {};
      const fields = ['title', 'description', 'price', 'bedrooms', 'bathrooms', 
                      'latitude', 'longitude', 'address_street', 'image_urls'];
      
      for (const field of fields) {
        const result = await client.query(`
          SELECT COUNT(*) FROM properties 
          WHERE status = 'active' AND ${field} IS NOT NULL
        `);
        const count = parseInt(result.rows[0].count);
        fieldCoverage[field] = {
          count,
          percentage: totalProperties > 0 ? (count / totalProperties) * 100 : 0,
        };
      }

      // Duplicate rate
      const dupResult = await client.query(`
        SELECT COUNT(DISTINCT canonical_property_id) as dup_groups
        FROM property_duplicates
      `);
      const duplicateRate = totalProperties > 0 
        ? (parseInt(dupResult.rows[0].dup_groups) / totalProperties) * 100 
        : 0;

      // Multi-source rate
      const multiSourceResult = await client.query(`
        SELECT COUNT(DISTINCT property_id) as multi_source
        FROM property_data_sources
        GROUP BY property_id
        HAVING COUNT(*) > 1
      `);
      const multiSourceCount = multiSourceResult.rows.length;
      const multiSourceRate = totalProperties > 0 
        ? (multiSourceCount / totalProperties) * 100 
        : 0;

      return {
        generated_at: new Date(),
        total_properties: totalProperties,
        by_source: sourceResult.rows.map(r => ({
          source: r.source || 'unknown',
          count: parseInt(r.count),
          avg_quality: parseFloat(r.avg_quality) || 0,
          avg_completeness: parseFloat(r.avg_completeness) || 0,
        })),
        by_region: regionResult.rows.map(r => ({
          region: r.region,
          count: parseInt(r.count),
          avg_quality: parseFloat(r.avg_quality) || 0,
        })),
        field_coverage: fieldCoverage,
        duplicate_rate: duplicateRate,
        multi_source_rate: multiSourceRate,
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get current job status
   */
  getCurrentJobStatus(): ETLJobResult | null {
    return this.currentJob;
  }

  /**
   * Get job history
   */
  async getJobHistory(limit: number = 20): Promise<{
    job_id: string;
    type: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    duration_ms: number | null;
  }[]> {
    const result = await this.pool.query(`
      SELECT 
        job_id, type, status, started_at, completed_at, duration_ms
      FROM etl_job_history
      ORDER BY started_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  // Helper methods

  private generateJobId(): string {
    return `etl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private async getPropertyForMatching(propertyId: string): Promise<any | null> {
    const result = await this.pool.query(`
      SELECT 
        id, external_source as source, title, 
        address_street as address, address_city as city, region,
        latitude, longitude, price,
        bedrooms, bathrooms,
        built_area_sqm as "buildingSizeSqm",
        property_type as "propertyType",
        COALESCE(completeness_score, 0.5) as "trustScore"
      FROM properties
      WHERE id = $1
    `, [propertyId]);

    return result.rows[0] || null;
  }

  private async logJobStart(jobId: string, type: string): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO etl_job_history (job_id, type, status, started_at)
        VALUES ($1, $2, 'running', NOW())
        ON CONFLICT DO NOTHING
      `, [jobId, type]);
    } catch (e) {
      // Table might not exist, ignore
    }
  }

  private async logJobComplete(jobId: string, result: ETLJobResult): Promise<void> {
    try {
      await this.pool.query(`
        UPDATE etl_job_history SET
          status = 'completed',
          completed_at = NOW(),
          duration_ms = $2,
          stats = $3
        WHERE job_id = $1
      `, [jobId, result.duration_ms, JSON.stringify(result.stats)]);
    } catch (e) {
      // Table might not exist, ignore
    }
  }

  private async logJobFailed(jobId: string, error: string): Promise<void> {
    try {
      await this.pool.query(`
        UPDATE etl_job_history SET
          status = 'failed',
          completed_at = NOW(),
          error = $2
        WHERE job_id = $1
      `, [jobId, error]);
    } catch (e) {
      // Table might not exist, ignore
    }
  }
}

// Export singleton instance
export const etlOrchestrator = new ETLOrchestrator();

// Export a convenience function for running the full pipeline
export async function runETLPipeline(options?: ETLJobConfig['options']): Promise<ETLJobResult> {
  return etlOrchestrator.runFullPipeline(options);
}
