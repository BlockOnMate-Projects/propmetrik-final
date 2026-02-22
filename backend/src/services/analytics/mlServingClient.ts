/**
 * ML Serving Client
 *
 * TypeScript HTTP client for communicating with the Python ML Serving API.
 * Follows the same pattern as valuation-engine/pythonClient.ts.
 *
 * Architecture:
 *   Analytics Service (TypeScript) → ML Serving (Python/FastAPI :8000)
 *     - Sentiment Analysis
 *     - Named Entity Recognition
 *     - Trend Extraction & Price Forecasting
 *     - Document Intelligence
 *     - AI Assistant & Report Generation
 *     - Model Monitoring & Drift Detection
 *     - Ensemble Analytics
 *
 * Consumers:
 *   - Analytics service modules (Sections 1-9)
 *   - Data Hub enrichment pipeline
 *   - CRM intelligence features
 *
 * @module services/analytics/mlServingClient
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ML_SERVING_URL = process.env.ML_SERVING_URL || 'http://localhost:8000';
const ML_SERVING_TIMEOUT = parseInt(process.env.ML_SERVING_TIMEOUT || '30000', 10);
const ML_RETRY_ATTEMPTS = parseInt(process.env.ML_RETRY_ATTEMPTS || '2', 10);
const ML_RETRY_DELAY = parseInt(process.env.ML_RETRY_DELAY || '1000', 10);

// ============================================================================
// TYPES — Sentiment Analysis
// ============================================================================

export type SentimentSource = 'news' | 'social_media' | 'report' | 'policy';
export type SentimentLevel = 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';

export interface SentimentAnalysisRequest {
  source: SentimentSource;
  text?: string;
  url?: string;
  document_id?: string;
  region_filter?: string;
  property_type_filter?: string;
}

export interface AspectSentiment {
  aspect: string;
  sentiment: number;
  mentions: number;
  key_phrases: string[];
}

export interface SentimentResult {
  overall: SentimentLevel;
  score: number;
  confidence: number;
}

export interface SentimentAnalysisResponse {
  request_id: string;
  analyzed_at: string;
  sentiment: SentimentResult;
  aspects: AspectSentiment[];
  entities: {
    locations: string[];
    developers: string[];
    property_types: string[];
    projects: string[];
  };
  market_indicators: {
    bullish_signals: string[];
    bearish_signals: string[];
    neutral_statements: string[];
  };
}

export interface MarketConfidenceIndex {
  date: string;
  index_value: number;
  change_1d?: number;
  change_7d?: number;
  change_30d?: number;
  sentiment_distribution: Record<string, number>;
  sample_size: number;
  region?: string;
}

// ============================================================================
// TYPES — Named Entity Recognition
// ============================================================================

export interface NERRequest {
  text: string;
  document_type?: string;
  extract_relationships?: boolean;
}

export interface NERResponse {
  request_id: string;
  entities: {
    locations: Array<{
      text: string;
      type: string;
      confidence: number;
      standardized_name?: string;
      coordinates?: { lat: number; lng: number };
    }>;
    organizations: Array<{
      text: string;
      type: string;
      confidence: number;
    }>;
    projects: Array<{
      name: string;
      type?: string;
      location?: string;
      status?: string;
      units?: number;
    }>;
    financial: Array<{
      text: string;
      type: string;
      amount?: number;
      currency?: string;
      confidence: number;
    }>;
    temporal: Array<{
      text: string;
      type: string;
      normalized_date?: string;
      confidence: number;
    }>;
  };
  relationships?: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }>;
  structured_summary: Record<string, string>;
}

// ============================================================================
// TYPES — Trend Extraction & Price Forecasting
// ============================================================================

export interface TrendAnalysisRequest {
  data_source?: string;
  time_range: { start_date: string; end_date: string };
  region?: string;
  min_mentions?: number;
  include_forecasts?: boolean;
}

export interface TrendingTopic {
  topic: string;
  keywords: string[];
  mention_count: number;
  change_pct: number;
  sentiment: number;
  relevance_score: number;
}

export interface TrendAnalysisResponse {
  analysis_id: string;
  period: { start: string; end: string };
  trending_topics: TrendingTopic[];
  emerging_trends: Array<{
    trend: string;
    first_detected: string;
    growth_rate: number;
    examples: string[];
    confidence: number;
  }>;
  declining_trends: Array<{
    trend: string;
    peak_date: string;
    decline_rate: number;
    last_mention?: string;
  }>;
  keyword_trends: Array<{
    keyword: string;
    time_series: Array<{ date: string; mentions: number }>;
    forecast?: Array<{ date: string; predicted_mentions: number; confidence_interval: { low: number; high: number } }>;
  }>;
  anomalies: Array<{
    date: string;
    keyword: string;
    expected_mentions: number;
    actual_mentions: number;
    severity: string;
    context: string;
  }>;
}

export interface PriceForecastRequest {
  region: string;
  property_type?: string;
  forecast_months?: number;
}

export interface PriceForecastResponse {
  region: string;
  property_type?: string;
  forecast_date: string;
  short_term: {
    horizon_months: number;
    expected_change_pct: number;
    direction_probability: number;
    confidence_interval: { low: number; high: number };
    current_avg_price?: number;
    forecast_avg_price?: number;
  };
  long_term: {
    horizon_years: number;
    scenarios: { optimistic: number; base: number; pessimistic: number };
    key_assumptions: string[];
  };
  drivers: Array<{
    factor: string;
    direction: string;
    impact_magnitude: number;
    detail: string;
  }>;
}

// ============================================================================
// TYPES — Document Intelligence
// ============================================================================

export interface DocumentIntelligenceRequest {
  document_url?: string;
  document_base64?: string;
  document_text?: string;
  document_type: string;
  extract_tables?: boolean;
}

export interface DocumentIntelligenceResponse {
  document_id: string;
  processed_at: string;
  pages: number;
  classification: {
    document_type: string;
    confidence: number;
    sub_type?: string;
  };
  extracted_data: Record<string, any>;
  tables: Array<Record<string, any>>;
  entities: Record<string, any>;
  summary: string;
  key_findings: string[];
  validation: {
    completeness_score: number;
    missing_fields: string[];
    anomalies: string[];
  };
}

// ============================================================================
// TYPES — AI Assistant
// ============================================================================

export interface AssistantQueryRequest {
  query: string;
  session_id?: string;
  user_id?: string;
  context?: Record<string, any>;
  response_format?: 'text' | 'markdown' | 'json';
}

export interface AssistantQueryResponse {
  query_id: string;
  query: string;
  intent: string;
  response: string;
  data_points: Array<{
    metric: string;
    value: any;
    period?: string;
    location?: string;
    source?: string;
  }>;
  investment_scores: Array<{
    location: string;
    overall_score: number;
    capital_growth_score: number;
    rental_yield_score: number;
    liquidity_score: number;
    risk_score: number;
    rationale: string;
  }>;
  confidence: number;
  sources: string[];
  follow_up_suggestions: string[];
  session_id?: string;
}

export interface ReportRequest {
  report_type: 'market_summary' | 'investment_outlook' | 'area_analysis';
  location?: string;
  period?: string;
  include_forecast?: boolean;
}

export interface ReportResponse {
  report_id: string;
  report_type: string;
  title: string;
  generated_at: string;
  sections: Array<Record<string, any>>;
  data_tables: Array<Record<string, any>>;
  charts_data: Array<Record<string, any>>;
}

// ============================================================================
// TYPES — Model Monitoring
// ============================================================================

export interface ModelPerformanceMetrics {
  model_version: string;
  metric_date: string;
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  median_error: number;
  p90_error: number;
  within_10_pct: number;
  within_20_pct: number;
  total_predictions: number;
  sample_size: number;
}

export interface PerformanceTrend {
  metric_name: string;
  data_points: Array<{ date: string; value: number }>;
  trend_direction: 'improving' | 'degrading' | 'stable';
  change_rate: number;
}

export interface FeatureImportance {
  feature_name: string;
  importance_score: number;
  direction: string;
  category: string;
  description: string;
}

export interface PredictionExplanation {
  prediction_id: string;
  predicted_value: number;
  feature_contributions: Array<{
    feature: string;
    contribution: number;
    direction: string;
    importance: number;
  }>;
  top_positive: string[];
  top_negative: string[];
  confidence_factors: Record<string, any>;
}

export interface ConfidenceDistribution {
  period: string;
  total_predictions: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  mean_confidence: number;
  median_confidence: number;
  histogram: Array<{ bin: string; count: number; percentage: number }>;
}

export interface DriftDetectionResult {
  detection_date: string;
  drift_detected: boolean;
  drift_type?: string;
  drift_severity: string;
  metrics: Record<string, any>;
  recommendation: string;
  retrain_required: boolean;
}

export interface EnsembleAnalytics {
  model_version: string;
  weights: Array<{
    model_name: string;
    weight: number;
    contribution_pct: number;
    individual_mae: number;
    individual_r2: number;
  }>;
  ensemble_mae: number;
  ensemble_r2: number;
  improvement_over_best_single: number;
  diversity_index: number;
  correlation_matrix: Record<string, Record<string, number>>;
}

// ============================================================================
// ML SERVING CLIENT
// ============================================================================

/**
 * HTTP client for the Python ML Serving API (port 8000).
 *
 * Provides typed methods for every ML endpoint group.
 * Includes retry logic, structured error handling, and request/response logging.
 */
export class MLServingClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(options: {
    baseUrl?: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
  } = {}) {
    this.baseUrl = options.baseUrl || ML_SERVING_URL;
    this.retryAttempts = options.retryAttempts ?? ML_RETRY_ATTEMPTS;
    this.retryDelay = options.retryDelay ?? ML_RETRY_DELAY;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeout || ML_SERVING_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'propmetrik-analytics-client/1.0.0',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`ML-Serving → ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('ML-Serving request error', { error: error.message });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`ML-Serving ← ${response.status} ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          logger.error(`ML-Serving error: ${error.response.status}`, {
            url: error.config?.url,
            data: error.response.data,
          });
        } else if (error.request) {
          logger.error('ML-Serving network error', { message: error.message });
        }
        return Promise.reject(error);
      },
    );
  }

  // ==========================================================================
  // RETRY HELPER
  // ==========================================================================

  /**
   * Execute a request with retry logic.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const isRetryable =
          !err.response || err.response.status >= 500 || err.code === 'ECONNREFUSED';
        if (!isRetryable || attempt === this.retryAttempts) break;
        const delay = this.retryDelay * Math.pow(2, attempt);
        logger.warn(`ML-Serving retry ${attempt + 1}/${this.retryAttempts} in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  /** Check Python ML service health. */
  async healthCheck(): Promise<{ status: string; redis_connected: boolean; active_model: string; timestamp: string }> {
    const res = await this.client.get('/health');
    return res.data;
  }

  /** Check if ML service is available. */
  async isAvailable(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // SENTIMENT ANALYSIS
  // ==========================================================================

  /** Analyze text sentiment for market indicators. */
  async analyzeSentiment(request: SentimentAnalysisRequest): Promise<SentimentAnalysisResponse> {
    return this.withRetry(async () => {
      const res = await this.client.post<SentimentAnalysisResponse>('/api/v1/ml/sentiment/analyze', request);
      return res.data;
    });
  }

  /** Get historical sentiment analysis results. */
  async getSentimentHistory(params?: {
    source_type?: string;
    days?: number;
    limit?: number;
  }): Promise<{ results: any[]; count: number }> {
    const res = await this.client.get('/api/v1/ml/sentiment/history', { params });
    return res.data;
  }

  /** Get aggregated Market Confidence Index (0-100). */
  async getMarketConfidenceIndex(days?: number): Promise<MarketConfidenceIndex> {
    return this.withRetry(async () => {
      const res = await this.client.get<MarketConfidenceIndex>('/api/v1/ml/sentiment/market-confidence', {
        params: { days },
      });
      return res.data;
    });
  }

  // ==========================================================================
  // NAMED ENTITY RECOGNITION
  // ==========================================================================

  /** Extract named entities from text. */
  async extractEntities(request: NERRequest): Promise<NERResponse> {
    return this.withRetry(async () => {
      const res = await this.client.post<NERResponse>('/api/v1/ml/ner/extract', request);
      return res.data;
    });
  }

  /** Batch entity extraction. */
  async batchExtractEntities(requests: NERRequest[]): Promise<{ results: NERResponse[]; count: number }> {
    return this.withRetry(async () => {
      const res = await this.client.post('/api/v1/ml/ner/batch', requests);
      return res.data;
    });
  }

  // ==========================================================================
  // TRENDS & PRICE FORECASTING
  // ==========================================================================

  /** Analyze text for market trends and patterns. */
  async analyzeTrends(request: { text: string; source_type?: string }): Promise<any> {
    return this.withRetry(async () => {
      const res = await this.client.post('/api/v1/ml/trends/analyze', request);
      return res.data;
    });
  }

  /** Get current trending topics. */
  async getTrendingTopics(params?: { days?: number; limit?: number }): Promise<TrendingTopic[]> {
    const res = await this.client.get('/api/v1/ml/trends/trending', { params });
    return res.data;
  }

  /** Generate price forecasts for a region. */
  async forecastPrices(request: PriceForecastRequest): Promise<PriceForecastResponse> {
    return this.withRetry(async () => {
      const res = await this.client.post<PriceForecastResponse>('/api/v1/ml/trends/forecast', request);
      return res.data;
    });
  }

  // ==========================================================================
  // DOCUMENT INTELLIGENCE
  // ==========================================================================

  /** Process a document and extract structured data. */
  async processDocument(request: DocumentIntelligenceRequest): Promise<DocumentIntelligenceResponse> {
    return this.withRetry(async () => {
      const res = await this.client.post<DocumentIntelligenceResponse>('/api/v1/ml/documents/process', request);
      return res.data;
    });
  }

  /** Batch process multiple documents. */
  async batchProcessDocuments(
    requests: DocumentIntelligenceRequest[],
  ): Promise<{ results: DocumentIntelligenceResponse[]; count: number }> {
    return this.withRetry(async () => {
      const res = await this.client.post('/api/v1/ml/documents/batch', requests);
      return res.data;
    });
  }

  // ==========================================================================
  // AI ASSISTANT
  // ==========================================================================

  /** Ask the AI assistant a market intelligence question. */
  async assistantQuery(request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    return this.withRetry(async () => {
      const res = await this.client.post<AssistantQueryResponse>('/api/v1/ml/assistant/query', request);
      return res.data;
    });
  }

  /** Generate an automated market report. */
  async generateReport(request: ReportRequest): Promise<ReportResponse> {
    return this.withRetry(async () => {
      const res = await this.client.post<ReportResponse>('/api/v1/ml/assistant/report', request);
      return res.data;
    });
  }

  // ==========================================================================
  // MODEL MONITORING
  // ==========================================================================

  /** Get AVM model performance metrics. */
  async getModelPerformance(params?: {
    model_version?: string;
    period_days?: number;
  }): Promise<ModelPerformanceMetrics> {
    const res = await this.client.get<ModelPerformanceMetrics>('/api/v1/ml/monitoring/performance', { params });
    return res.data;
  }

  /** Get performance broken down by segment. */
  async getPerformanceBySegment(params?: {
    model_version?: string;
    segment_type?: string;
  }): Promise<{ segments: any[]; count: number }> {
    const res = await this.client.get('/api/v1/ml/monitoring/performance/segments', { params });
    return res.data;
  }

  /** Track performance metric over time. */
  async getPerformanceTrend(params?: {
    metric_name?: string;
    model_version?: string;
    months?: number;
  }): Promise<PerformanceTrend> {
    const res = await this.client.get<PerformanceTrend>('/api/v1/ml/monitoring/performance/trend', { params });
    return res.data;
  }

  /** Get feature importance rankings. */
  async getFeatureImportance(modelVersion?: string): Promise<{ features: FeatureImportance[]; count: number }> {
    const res = await this.client.get('/api/v1/ml/monitoring/features/importance', {
      params: { model_version: modelVersion },
    });
    return res.data;
  }

  /** Get explanation for a specific prediction. */
  async explainPrediction(predictionId: string): Promise<PredictionExplanation> {
    const res = await this.client.get<PredictionExplanation>(
      `/api/v1/ml/monitoring/predictions/${predictionId}/explain`,
    );
    return res.data;
  }

  /** Get confidence level distribution. */
  async getConfidenceDistribution(params?: {
    model_version?: string;
    period_days?: number;
  }): Promise<ConfidenceDistribution> {
    const res = await this.client.get<ConfidenceDistribution>('/api/v1/ml/monitoring/confidence', { params });
    return res.data;
  }

  /** Detect model drift. */
  async detectDrift(params?: {
    model_version?: string;
    baseline_days?: number;
    current_days?: number;
  }): Promise<DriftDetectionResult> {
    const res = await this.client.get<DriftDetectionResult>('/api/v1/ml/monitoring/drift', { params });
    return res.data;
  }

  /** Get per-feature data drift details. */
  async getDataDriftDetails(modelVersion?: string): Promise<{ features: any[]; count: number }> {
    const res = await this.client.get('/api/v1/ml/monitoring/drift/features', {
      params: { model_version: modelVersion },
    });
    return res.data;
  }

  // ==========================================================================
  // ENSEMBLE ANALYTICS
  // ==========================================================================

  /** Get ensemble model analytics. */
  async getEnsembleAnalytics(modelVersion?: string): Promise<EnsembleAnalytics> {
    const res = await this.client.get<EnsembleAnalytics>('/api/v1/ml/ensemble/analytics', {
      params: { model_version: modelVersion },
    });
    return res.data;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const mlServingClient = new MLServingClient();
