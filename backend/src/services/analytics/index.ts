/**
 * Analytics Services - Barrel Export
 */

// Short-Stay Metrics (existing)
export { shortStayMetricsService } from './shortStayMetricsService';

// Housing Demand Score (Slice 3 — RHDS composite)
export { housingDemandScoreService, HousingDemandScoreService } from './housingDemandScoreService';
export type { RHDSComponent } from './housingDemandScoreService';

// Infrastructure Quality Score (Slice 5 — NIQS §6.3)
export { infrastructureQualityService, InfrastructureQualityService } from './infrastructureQualityService';
export type { NIQSScore, NIQSAvmContext } from './infrastructureQualityService';

// Housing Deficit Estimation (Slice 5 — HDEM §6.9)
export { housingDeficitService, HousingDeficitService } from './housingDeficitService';
export type { HousingDeficitEstimate } from './housingDeficitService';

// Regional composite indices (Slice 5 — DPMDI §6.4 / PTMPI §6.8 / ESSI §6.10 / RICI §7.2)
export { regionalCompositesService, RegionalCompositesService } from './regionalCompositesService';
export type { DPMDIScore, PTMPIScore, ESSIScore, RICIScore } from './regionalCompositesService';

// ML Serving Client (HTTP bridge to Python ML microservice)
export { MLServingClient, mlServingClient } from './mlServingClient';
export type {
  SentimentAnalysisRequest,
  SentimentAnalysisResponse,
  NERRequest,
  NERResponse,
  TrendAnalysisRequest,
  TrendAnalysisResponse,
  PriceForecastRequest,
  PriceForecastResponse,
  DocumentIntelligenceRequest,
  DocumentIntelligenceResponse,
  AssistantQueryRequest,
  AssistantQueryResponse,
  ReportRequest,
  ReportResponse,
  ModelPerformanceMetrics,
  FeatureImportance,
  PredictionExplanation,
  ConfidenceDistribution,
  DriftDetectionResult,
  EnsembleAnalytics,
  MarketConfidenceIndex,
} from './mlServingClient';

// ML Analytics Orchestration Service
export { mlAnalyticsService } from './mlAnalyticsService';
export type {
  AnalyticsDashboardSummary,
  ConstructionCostIndexData,
  RegionalCostData,
  HousingAffordabilityIndex,
  ValuationVolumeMetrics,
  MarketPriceIndex,
  MarketActivityMetrics,
} from './mlAnalyticsService';
