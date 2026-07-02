/**
 * Analytics Services - Barrel Export
 */

// Short-Stay Metrics (existing)
export { shortStayMetricsService } from './shortStayMetricsService';

// Housing Demand Score (Slice 3 — RHDS composite)
export { housingDemandScoreService, HousingDemandScoreService } from './housingDemandScoreService';
export type { RHDSComponent } from './housingDemandScoreService';

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
