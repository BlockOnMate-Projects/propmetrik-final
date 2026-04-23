/**
 * ML Analytics Service
 *
 * Orchestration layer that bridges the Data Hub (raw data) with the
 * ML Serving microservice (intelligence). Provides high-level analytics
 * methods consumed by the Express routes.
 *
 * Data Flow:
 *   Data Hub (PostgreSQL) → ML Analytics Service → ML Serving (Python :8000)
 *                                                ↘ Direct DB analytics
 *
 * Covers Analytics.md Sections 8.1-8.7:
 *   - AVM Performance Monitoring
 *   - Feature Importance
 *   - Prediction Confidence
 *   - Model Drift Detection
 *   - Price Forecasting
 *   - Ensemble Analytics
 *   - Centralized ML/NLP Services (sentiment, NER, trends, docs, assistant)
 *
 * @module services/analytics/mlAnalyticsService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import {
  mlServingClient,
  MLServingClient,
  SentimentAnalysisRequest,
  NERRequest,
  PriceForecastRequest,
  DocumentIntelligenceRequest,
  AssistantQueryRequest,
  ReportRequest,
} from './mlServingClient';

// ============================================================================
// TYPES
// ============================================================================

export interface AnalyticsDashboardSummary {
  ml_service_status: 'online' | 'offline' | 'degraded';
  model_version?: string;
  total_predictions_30d: number;
  avg_confidence: number;
  market_confidence_index?: number;
  active_drift_alerts: number;
  last_retrain_date?: string;
}

export interface ConstructionCostIndexData {
  national_index: number;
  baseline_date: string;
  components: {
    materials: { value: number; weight: number; change_mom: number; change_yoy: number };
    labor: { value: number; weight: number; change_mom: number; change_yoy: number };
    overhead: { value: number; weight: number; change_mom: number; change_yoy: number };
  };
  regional_indices: Record<string, number>;
  historical_trend: Array<{ date: string; value: number }>;
}

export interface RegionalCostData {
  region: string;
  multiplier: number;
  distance_from_port_km: number;
  transport_factor: number;
  infrastructure_score: number;
  cost_components: { materials: number; labor: number; transport: number };
  trend_6m: number;
  trend_12m: number;
}

export interface HousingAffordabilityIndex {
  region: string;
  ghai_composite: number;
  ghai_category: string;
  mhai: number;
  chai: number;
  rhai: number;
  median_property_price: number;
  median_household_income: number;
  mortgage_rate: number;
  median_monthly_rent: number;
  trend_direction: string;
  change_mom: number;
  change_yoy: number;
}

export interface ValuationVolumeMetrics {
  period: string;
  region?: string;
  valuation_count: number;
  total_value: number;
  avg_value: number;
  median_value: number;
  method_distribution: Record<string, { count: number; avg_confidence: number }>;
}

export interface MarketPriceIndex {
  region: string;
  property_type: string;
  index_value: number;
  base_period: string;
  change_mom: number;
  change_qoq: number;
  change_yoy: number;
  median_price: number;
  avg_price: number;
  transaction_count: number;
}

export interface MarketActivityMetrics {
  region: string;
  period: string;
  new_listings: number;
  total_active_listings: number;
  properties_sold: number;
  avg_days_on_market: number;
  listing_to_sale_ratio: number;
  price_reductions: number;
}

// ============================================================================
// ML ANALYTICS SERVICE
// ============================================================================

class MLAnalyticsService {
  private client: MLServingClient;

  constructor(client?: MLServingClient) {
    this.client = client || mlServingClient;
  }

  // ==========================================================================
  // DASHBOARD & STATUS
  // ==========================================================================

  /** Get high-level ML analytics dashboard summary. */
  async getDashboardSummary(): Promise<AnalyticsDashboardSummary> {
    let serviceStatus: 'online' | 'offline' | 'degraded' = 'offline';

    try {
      const health = await this.client.healthCheck();
      serviceStatus = health.status === 'healthy' ? 'online' : 'degraded';
    } catch {
      serviceStatus = 'offline';
    }

    // Fetch prediction stats from local DB
    let totalPredictions30d = 0;
    let avgConfidence = 0;
    let activeDriftAlerts = 0;
    let lastRetrainDate: string | undefined;
    let modelVersion: string | undefined;

    try {
      const predStats = await pool.query(
        `SELECT COUNT(*) AS cnt, AVG(confidence_score) AS avg_conf
         FROM ml_predictions
         WHERE predicted_at >= NOW() - INTERVAL '30 days'`,
      );
      totalPredictions30d = parseInt(predStats.rows[0]?.cnt || '0', 10);
      avgConfidence = parseFloat(predStats.rows[0]?.avg_conf || '0');
    } catch (err: any) {
      if (err.code !== '42P01') logger.warn('ml_predictions query failed', { error: err.message });
    }

    try {
      const modelRow = await pool.query(
        `SELECT model_version, last_retrain_date
         FROM ml_model_metadata
         WHERE is_active = true
         ORDER BY created_at DESC LIMIT 1`,
      );
      if (modelRow.rows.length > 0) {
        modelVersion = modelRow.rows[0].model_version;
        lastRetrainDate = modelRow.rows[0].last_retrain_date;
      }
    } catch (err: any) {
      if (err.code !== '42P01') logger.warn('ml_model_metadata query failed', { error: err.message });
    }

    // Get market confidence from ML service
    let marketConfidenceIndex: number | undefined;
    if (serviceStatus !== 'offline') {
      try {
        const mci = await this.client.getMarketConfidenceIndex(30);
        marketConfidenceIndex = mci.index_value;
      } catch {
        /* ML service optional */
      }
    }

    return {
      ml_service_status: serviceStatus,
      model_version: modelVersion,
      total_predictions_30d: totalPredictions30d,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      market_confidence_index: marketConfidenceIndex,
      active_drift_alerts: activeDriftAlerts,
      last_retrain_date: lastRetrainDate,
    };
  }

  // ==========================================================================
  // SECTION 1: Construction Cost Index
  // ==========================================================================

  /** Get national construction cost index with components and regional breakdown. */
  async getConstructionCostIndex(): Promise<ConstructionCostIndexData | null> {
    try {
      const result = await pool.query(
        `SELECT *
         FROM construction_cost_index_analytics
         WHERE region IS NULL
         ORDER BY period_date DESC
         LIMIT 1`,
      );
      if (result.rows.length === 0) return null;

      const latest = result.rows[0];

      // Regional indices
      const regional = await pool.query(
        `SELECT region, index_value
         FROM construction_cost_index_analytics
         WHERE period_date = $1 AND region IS NOT NULL`,
        [latest.period_date],
      );
      const regionalIndices: Record<string, number> = {};
      for (const r of regional.rows) {
        regionalIndices[r.region] = parseFloat(r.index_value);
      }

      // Historical trend
      const history = await pool.query(
        `SELECT period_date AS date, index_value AS value
         FROM construction_cost_index_analytics
         WHERE region IS NULL
         ORDER BY period_date DESC
         LIMIT 24`,
      );

      return {
        national_index: parseFloat(latest.index_value),
        baseline_date: latest.base_date,
        components: {
          materials: {
            value: parseFloat(latest.materials_index || '0'),
            weight: parseFloat(latest.materials_weight || '0.55'),
            change_mom: parseFloat(latest.change_mom || '0'),
            change_yoy: parseFloat(latest.change_yoy || '0'),
          },
          labor: {
            value: parseFloat(latest.labor_index || '0'),
            weight: parseFloat(latest.labor_weight || '0.35'),
            change_mom: parseFloat(latest.change_mom || '0'),
            change_yoy: parseFloat(latest.change_yoy || '0'),
          },
          overhead: {
            value: parseFloat(latest.overhead_index || '0'),
            weight: parseFloat(latest.overhead_weight || '0.10'),
            change_mom: parseFloat(latest.change_mom || '0'),
            change_yoy: parseFloat(latest.change_yoy || '0'),
          },
        },
        regional_indices: regionalIndices,
        historical_trend: history.rows.map((r: any) => ({
          date: r.date,
          value: parseFloat(r.value),
        })),
      };
    } catch (err: any) {
      if (err.code === '42P01') {
        logger.warn('construction_cost_index table does not exist yet');
        return null;
      }
      throw err;
    }
  }

  /** Get regional cost comparison data. */
  async getRegionalCosts(region?: string): Promise<RegionalCostData[]> {
    try {
      let sql = `
        SELECT region, multiplier, distance_from_port_km, transport_factor,
               infrastructure_score, materials_cost, labor_cost, transport_cost,
               trend_6m, trend_12m
        FROM regional_cost_data
      `;
      const params: any[] = [];
      if (region) {
        sql += ' WHERE region = $1';
        params.push(region);
      }
      sql += ' ORDER BY multiplier DESC';

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        multiplier: parseFloat(r.multiplier),
        distance_from_port_km: parseFloat(r.distance_from_port_km || '0'),
        transport_factor: parseFloat(r.transport_factor || '1'),
        infrastructure_score: parseFloat(r.infrastructure_score || '0'),
        cost_components: {
          materials: parseFloat(r.materials_cost || '0'),
          labor: parseFloat(r.labor_cost || '0'),
          transport: parseFloat(r.transport_cost || '0'),
        },
        trend_6m: parseFloat(r.trend_6m || '0'),
        trend_12m: parseFloat(r.trend_12m || '0'),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /** Get material price trends from data-hub. */
  async getMaterialPriceTrends(material?: string, period?: string) {
    try {
      let sql = `
        SELECT category, material_name, price_ghs, 'GHS' AS currency, effective_date, region
        FROM material_prices
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIdx = 1;
      if (material) {
        sql += ` AND LOWER(category) = LOWER($${paramIdx++})`;
        params.push(material);
      }
      if (period) {
        const months = parseInt(period.replace('m', ''), 10) || 12;
        sql += ` AND effective_date >= NOW() - INTERVAL '${months} months'`;
      }
      sql += ` ORDER BY effective_date DESC LIMIT 500`;
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /** Get labor cost analytics. */
  async getLaborCostAnalytics(skillLevel?: string, region?: string) {
    try {
      let sql = `
        SELECT category, skill_level, daily_rate_ghs AS daily_rate,
               daily_rate_ghs * 22 AS monthly_rate, region,
               rate_change_percent AS yoy_change, NULL AS supply_status, effective_date
        FROM labor_rates
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIdx = 1;
      if (skillLevel) {
        sql += ` AND LOWER(skill_level) = LOWER($${paramIdx++})`;
        params.push(skillLevel);
      }
      if (region) {
        sql += ` AND LOWER(region) = LOWER($${paramIdx++})`;
        params.push(region);
      }
      sql += ` ORDER BY effective_date DESC LIMIT 200`;
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  // ==========================================================================
  // SECTION 2: Housing Affordability Index (GHAI)
  // ==========================================================================

  /** Get current GHAI values for all or specific region. */
  async getHousingAffordabilityIndex(region?: string): Promise<HousingAffordabilityIndex[]> {
    try {
      let sql = `
        SELECT *
        FROM housing_affordability_index
        WHERE calculation_date = (SELECT MAX(calculation_date) FROM housing_affordability_index)
      `;
      const params: any[] = [];
      if (region) {
        sql += ' AND LOWER(region) = LOWER($1)';
        params.push(region);
      }
      sql += ' ORDER BY ghai_composite DESC';
      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        ghai_composite: parseFloat(r.ghai_composite),
        ghai_category: r.ghai_category,
        mhai: parseFloat(r.mhai || '0'),
        chai: parseFloat(r.chai || '0'),
        rhai: parseFloat(r.rhai || '0'),
        median_property_price: parseFloat(r.median_property_price || '0'),
        median_household_income: parseFloat(r.median_household_income || '0'),
        mortgage_rate: parseFloat(r.mortgage_rate || '0'),
        median_monthly_rent: parseFloat(r.median_monthly_rent || '0'),
        trend_direction: r.trend_direction || 'stable',
        change_mom: parseFloat(r.change_mom || '0'),
        change_yoy: parseFloat(r.change_yoy || '0'),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /** Get GHAI history for a region. */
  async getHAIHistory(region: string, months: number = 24) {
    try {
      const result = await pool.query(
        `SELECT calculation_date, ghai_composite, mhai, chai, rhai, ghai_category
         FROM housing_affordability_index
         WHERE LOWER(region) = LOWER($1)
         ORDER BY calculation_date DESC
         LIMIT $2`,
        [region, months],
      );
      return result.rows;
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  // ==========================================================================
  // SECTION 3: Valuation Analytics
  // ==========================================================================

  /** Get valuation volume metrics. */
  async getValuationVolume(period?: string, region?: string): Promise<ValuationVolumeMetrics | null> {
    try {
      let sql = `
        SELECT
          snapshot_date AS period,
          region,
          valuation_count,
          total_value,
          avg_value,
          median_value,
          sales_comparison_count,
          sales_comparison_avg_confidence,
          cost_approach_count,
          cost_approach_avg_confidence,
          income_approach_count,
          income_approach_avg_confidence
        FROM valuation_analytics_snapshots
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIdx = 1;
      if (region) {
        sql += ` AND LOWER(region) = LOWER($${paramIdx++})`;
        params.push(region);
      }
      sql += ` ORDER BY snapshot_date DESC LIMIT 1`;

      const result = await pool.query(sql, params);
      if (result.rows.length === 0) return null;

      const r = result.rows[0];
      return {
        period: r.period,
        region: r.region,
        valuation_count: parseInt(r.valuation_count || '0', 10),
        total_value: parseFloat(r.total_value || '0'),
        avg_value: parseFloat(r.avg_value || '0'),
        median_value: parseFloat(r.median_value || '0'),
        method_distribution: {
          sales_comparison: {
            count: parseInt(r.sales_comparison_count || '0', 10),
            avg_confidence: parseFloat(r.sales_comparison_avg_confidence || '0'),
          },
          cost_approach: {
            count: parseInt(r.cost_approach_count || '0', 10),
            avg_confidence: parseFloat(r.cost_approach_avg_confidence || '0'),
          },
          income_approach: {
            count: parseInt(r.income_approach_count || '0', 10),
            avg_confidence: parseFloat(r.income_approach_avg_confidence || '0'),
          },
        },
      };
    } catch (err: any) {
      if (err.code === '42P01') return null;
      throw err;
    }
  }

  // ==========================================================================
  // SECTION 4: Market Intelligence
  // ==========================================================================

  /** Get property price index. */
  async getMarketPriceIndex(region?: string, propertyType?: string): Promise<MarketPriceIndex[]> {
    try {
      let sql = `
        SELECT region, property_type, index_value, base_period,
               change_mom, change_qoq, change_yoy,
               median_price, avg_price, transaction_count
        FROM property_price_index
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIdx = 1;
      if (region) {
        sql += ` AND LOWER(region) = LOWER($${paramIdx++})`;
        params.push(region);
      }
      if (propertyType) {
        sql += ` AND LOWER(property_type) = LOWER($${paramIdx++})`;
        params.push(propertyType);
      }
      sql += ` ORDER BY index_value DESC LIMIT 50`;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        property_type: r.property_type,
        index_value: parseFloat(r.index_value || '0'),
        base_period: r.base_period,
        change_mom: parseFloat(r.change_mom || '0'),
        change_qoq: parseFloat(r.change_qoq || '0'),
        change_yoy: parseFloat(r.change_yoy || '0'),
        median_price: parseFloat(r.median_price || '0'),
        avg_price: parseFloat(r.avg_price || '0'),
        transaction_count: parseInt(r.transaction_count || '0', 10),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /** Get market activity metrics. */
  async getMarketActivity(region?: string, period?: string): Promise<MarketActivityMetrics[]> {
    try {
      let sql = `
        SELECT region, period, new_listings, total_active_listings,
               properties_sold, avg_days_on_market, listing_to_sale_ratio,
               price_reductions
        FROM market_activity_metrics
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIdx = 1;
      if (region) {
        sql += ` AND LOWER(region) = LOWER($${paramIdx++})`;
        params.push(region);
      }
      sql += ` ORDER BY period DESC LIMIT 12`;

      const result = await pool.query(sql, params);
      return result.rows.map((r: any) => ({
        region: r.region,
        period: r.period,
        new_listings: parseInt(r.new_listings || '0', 10),
        total_active_listings: parseInt(r.total_active_listings || '0', 10),
        properties_sold: parseInt(r.properties_sold || '0', 10),
        avg_days_on_market: parseFloat(r.avg_days_on_market || '0'),
        listing_to_sale_ratio: parseFloat(r.listing_to_sale_ratio || '0'),
        price_reductions: parseInt(r.price_reductions || '0', 10),
      }));
    } catch (err: any) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  /** Get investment opportunity scores via ML. */
  async getInvestmentOpportunities(region?: string) {
    try {
      const query = region
        ? `Which areas in ${region} have the best investment potential?`
        : 'Which areas in Ghana have the best real estate investment potential?';

      const result = await this.client.assistantQuery({
        query,
        context: { region_preference: region },
        response_format: 'json',
      });
      return result;
    } catch (err: any) {
      logger.warn('ML assistant query failed for investment opportunities', { error: err.message });
      return null;
    }
  }

  // ==========================================================================
  // SECTION 8.1-8.6: ML Model Analytics (proxied to ML Serving)
  // ==========================================================================

  /** 8.1 — AVM Performance Metrics */
  async getAVMPerformance(modelVersion?: string, periodDays?: number) {
    try {
      const data = await this.client.getModelPerformance({ model_version: modelVersion, period_days: periodDays });
      if (data) {
        const sampleSize: number = (data as any).sample_size ?? (data as any).total_predictions ?? 0;
        (data as any).data_quality = {
          sample_size: sampleSize,
          sufficient_for_inference: sampleSize >= 30,
          note: sampleSize === 0
            ? 'No prediction history recorded yet — all metrics are zero-initialized defaults'
            : sampleSize < 30
            ? `Only ${sampleSize} predictions recorded — metrics are not yet statistically meaningful (need ≥30)`
            : `${sampleSize} predictions — metrics reflect actual AVM performance`,
        };
      }
      return data;
    } catch (err: any) {
      logger.warn('ML service unavailable for AVM performance', { error: err.message });
      return null;
    }
  }

  /** 8.1 — Performance by segment */
  async getPerformanceBySegment(modelVersion?: string, segmentType?: string) {
    try {
      return await this.client.getPerformanceBySegment({ model_version: modelVersion, segment_type: segmentType });
    } catch (err: any) {
      logger.warn('ML service unavailable for performance segments', { error: err.message });
      return null;
    }
  }

  /** 8.1 — Performance trend over time */
  async getPerformanceTrend(metricName?: string, modelVersion?: string, months?: number) {
    try {
      return await this.client.getPerformanceTrend({ metric_name: metricName, model_version: modelVersion, months });
    } catch (err: any) {
      logger.warn('ML service unavailable for performance trend', { error: err.message });
      return null;
    }
  }

  /** 8.2 — Feature Importance */
  async getFeatureImportance(modelVersion?: string) {
    try {
      return await this.client.getFeatureImportance(modelVersion);
    } catch (err: any) {
      logger.warn('ML service unavailable for feature importance', { error: err.message });
      return null;
    }
  }

  /** 8.2 — Prediction Explanation */
  async explainPrediction(predictionId: string) {
    try {
      return await this.client.explainPrediction(predictionId);
    } catch (err: any) {
      logger.warn('ML service unavailable for prediction explanation', { error: err.message });
      return null;
    }
  }

  /** 8.3 — Confidence Distribution */
  async getConfidenceDistribution(modelVersion?: string, periodDays?: number) {
    try {
      const data = await this.client.getConfidenceDistribution({ model_version: modelVersion, period_days: periodDays });
      if (data) {
        const totalPredictions: number = (data as any).total_predictions ?? 0;
        const meanConfidence: number = (data as any).mean_confidence ?? 0;
        (data as any).data_quality = {
          sample_size: totalPredictions,
          sufficient_for_inference: totalPredictions >= 50,
          note: totalPredictions === 0
            ? 'Insufficient prediction history — returning defaults'
            : totalPredictions < 50
            ? `Only ${totalPredictions} predictions recorded — distribution is indicative (need ≥50 for statistical validity)`
            : `Based on ${totalPredictions} predictions`,
        };
        if (totalPredictions > 0 && totalPredictions < 50) {
          (data as any).confidence_note =
            `indicative — ${totalPredictions} comparables (need ≥50 for statistical validity)`;
        } else if (totalPredictions === 0) {
          (data as any).confidence_note = 'no prediction history — confidence score is a default placeholder';
          (data as any).mean_confidence = meanConfidence;
        }
      }
      return data;
    } catch (err: any) {
      logger.warn('ML service unavailable for confidence distribution', { error: err.message });
      return null;
    }
  }

  /** 8.4 — Drift Detection */
  async detectDrift(modelVersion?: string, baselineDays?: number, currentDays?: number) {
    try {
      const data = await this.client.detectDrift({
        model_version: modelVersion,
        baseline_days: baselineDays,
        current_days: currentDays,
      });
      if (data) {
        const baselineSamples: number = (data as any).metrics?.baseline_samples ?? 0;
        const currentSamples: number = (data as any).metrics?.current_samples ?? 0;
        const sampleSize = baselineSamples + currentSamples;
        (data as any).data_quality = {
          sample_size: sampleSize,
          sufficient_for_inference: baselineSamples >= 10 && currentSamples >= 5,
          note: sampleSize === 0
            ? 'Insufficient prediction history — returning defaults'
            : `Baseline: ${baselineSamples} samples, current: ${currentSamples} samples${
                baselineSamples < 10 || currentSamples < 5
                  ? ' — below minimum thresholds for reliable drift detection (need ≥10 baseline, ≥5 current)'
                  : ''
              }`,
        };
      }
      return data;
    } catch (err: any) {
      logger.warn('ML service unavailable for drift detection', { error: err.message });
      return null;
    }
  }

  /** 8.4 — Data Drift per Feature */
  async getDataDriftDetails(modelVersion?: string) {
    try {
      return await this.client.getDataDriftDetails(modelVersion);
    } catch (err: any) {
      logger.warn('ML service unavailable for data drift details', { error: err.message });
      return null;
    }
  }

  /** 8.5 — Price Forecasting */
  async forecastPrices(request: PriceForecastRequest) {
    try {
      return await this.client.forecastPrices(request);
    } catch (err: any) {
      logger.warn('ML service unavailable for price forecasting', { error: err.message });
      return null;
    }
  }

  /** 8.6 — Ensemble Analytics */
  async getEnsembleAnalytics(modelVersion?: string) {
    try {
      const data = await this.client.getEnsembleAnalytics(modelVersion);
      if (data) {
        const weights: any[] = (data as any).weights ?? [];
        // Detect whether per-model metrics were individually measured or proxied
        // from the overall ensemble (all individual_mae identical = proxy values).
        const uniqueMae = new Set(weights.map((w: any) => w.individual_mae)).size;
        const metricsAreProxied = weights.length > 1 && uniqueMae === 1;

        if (metricsAreProxied) {
          (data as any).status = 'pre-training defaults';
          (data as any).note =
            'Individual model metrics are estimated from overall ensemble metrics — '
            + 'per-model accuracy will be available after segmented retraining completes';
          for (const w of weights) {
            w.source = 'domain_assumption';
            w.individual_metrics_note =
              'individual_mae and individual_r2 are proxied from ensemble overall — '
              + 'not independently measured per model';
          }
        } else {
          (data as any).status = 'trained';
        }
      }
      return data;
    } catch (err: any) {
      logger.warn('ML service unavailable for ensemble analytics', { error: err.message });
      return null;
    }
  }

  // ==========================================================================
  // SECTION 8.7: Centralized ML/NLP Services (proxied to ML Serving)
  // ==========================================================================

  /** 8.7.2 — Sentiment Analysis */
  async analyzeSentiment(request: SentimentAnalysisRequest) {
    return this.client.analyzeSentiment(request);
  }

  async getSentimentHistory(sourceType?: string, days?: number, limit?: number) {
    return this.client.getSentimentHistory({ source_type: sourceType, days, limit });
  }

  async getMarketConfidenceIndex(days?: number) {
    return this.client.getMarketConfidenceIndex(days);
  }

  /** 8.7.3 — Named Entity Recognition */
  async extractEntities(request: NERRequest) {
    return this.client.extractEntities(request);
  }

  async batchExtractEntities(requests: NERRequest[]) {
    return this.client.batchExtractEntities(requests);
  }

  /** 8.7.4 — Trend Extraction */
  async analyzeTrends(text: string, sourceType?: string) {
    return this.client.analyzeTrends({ text, source_type: sourceType });
  }

  async getTrendingTopics(days?: number, limit?: number) {
    return this.client.getTrendingTopics({ days, limit });
  }

  /** 8.7.5 — Document Intelligence */
  async processDocument(request: DocumentIntelligenceRequest) {
    return this.client.processDocument(request);
  }

  async batchProcessDocuments(requests: DocumentIntelligenceRequest[]) {
    return this.client.batchProcessDocuments(requests);
  }

  /** 8.7.6 — AI Assistant */
  async assistantQuery(request: AssistantQueryRequest) {
    return this.client.assistantQuery(request);
  }

  async generateReport(request: ReportRequest) {
    return this.client.generateReport(request);
  }

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  /** Check ML Serving health. */
  async checkMLServiceHealth() {
    return this.client.healthCheck();
  }

  async isMLServiceAvailable() {
    return this.client.isAvailable();
  }
}

// Singleton
export const mlAnalyticsService = new MLAnalyticsService();
