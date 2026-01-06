/**
 * Data Hub Services - Barrel Export
 * Phase 2: Data Hub Implementation
 */

// Types
export * from './types';

// Core Services
export { DataSourceService, dataSourceService } from './dataSourceService';
export { EtlJobService, etlJobService } from './etlJobService';
export { ContributionService, contributionService, ContributorProfileService, contributorProfileService } from './contributionService';
export { GeocodingService, geocodingService } from './geocodingService';

// ETL Pipeline Services
export {
  // Address Standardization
  AddressStandardizationService,
  addressStandardizationService,
  type StandardizedAddress,
  type AddressStandardizationOptions,
  // Deduplication
  DeduplicationService,
  deduplicationService,
  type PropertyMatch,
  type DuplicateGroup,
  type DeduplicationResult,
  type PropertyForMatching,
  // Quality Scoring
  QualityScoringService,
  qualityScoringService,
  type QualityScore,
  type QualityBreakdown,
  type PropertyQualityMetrics,
  // Data Enrichment
  DataEnrichmentService,
  dataEnrichmentService,
  type EnrichmentResult,
  type EnrichmentField,
  type EnrichmentOptions,
  // Pipeline Orchestrator
  ETLPipeline,
  etlPipeline,
} from './etl';

// Job Queue
export { 
  DataHubQueueManager,
  dataHubQueueManager,
  type DataIngestionJobData,
  type GeocodingJobData,
  type DeduplicationJobData,
  type EnrichmentJobData,
  type QualityScoringJobData,
  type MarketSnapshotJobData,
  type JobResult,
} from './jobQueue';

// Tier 4: Economic Data and Construction Costs
export { 
  EconomicDataService, 
  economicDataService,
  type EconomicIndicatorType,
  type EconomicIndicator,
  type EconomicSnapshot,
  type ExchangeRate,
} from './economicDataService';

export {
  ConstructionCostService,
  constructionCostService,
  type MaterialCategory,
  type LaborCategory,
  type MaterialPrice,
  type LaborRate,
  type EquipmentRate,
  type ConstructionCostIndex,
  type ConstructionEstimate,
} from './constructionCostService';

// Schedulers
export {
  EconomicDataScheduler,
  economicDataScheduler,
  type SchedulerConfig,
} from './schedulers';

// Monitoring
export {
  EconomicDataMonitoringService,
  economicDataMonitoringService,
  type HealthStatus,
  type AlertSeverity,
  type DataFreshnessCheck,
  type SourceHealthReport,
  type MonitoringReport,
  type Alert,
} from './monitoring';
