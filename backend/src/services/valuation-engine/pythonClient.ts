/**
 * Python Valuation Client
 * 
 * TypeScript HTTP client for communicating with the Python Valuation Engine.
 * This client is used by the TypeScript orchestrator to delegate valuation
 * method calculations to the Python service.
 * 
 * Architecture:
 *   TypeScript Backend (Orchestration) → Python Service (Calculations)
 *   - Floor Plan, HBU, Reconciliation   - Sales Comparison
 *   - Override Tracking, Reports        - Cost Approach
 *   - Database Operations               - Income Approach
 *                                        - Residual, Profits, DRC
 *                                        - Confidence Scoring
 * 
 * @module valuation-engine/pythonClient
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger';
import type { PropertyForValuation, MethodResult, MarketConditions } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Property input for Python valuation methods
 */
export interface PythonPropertyInput {
  id: string;
  property_type: string;
  region: string;
  address_city?: string;
  address_street?: string;
  latitude?: number;
  longitude?: number;
  land_area_sqm?: number;
  building_size_sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  year_built?: number;
  condition?: string;
  current_price_ghs?: number;
  monthly_rent_ghs?: number;
}

/**
 * Request for a single valuation method
 */
export interface ValuationMethodRequest {
  property: PythonPropertyInput;
  valuation_date?: string;
  options?: Record<string, any>;
}

/**
 * Response from a single valuation method
 */
export interface ValuationMethodResponse {
  success: boolean;
  method: string;
  estimated_value: number;
  confidence_score: number;
  confidence_level: 'high' | 'medium' | 'low';
  value_range?: {
    low: number;
    high: number;
  };
  details: Record<string, any>;
  assumptions: string[];
  limitations: string[];
  calculation_time_ms: number;
}

/**
 * Request for multiple valuation methods
 */
export interface MultiMethodRequest {
  property: PythonPropertyInput;
  methods: string[];
  valuation_date?: string;
  options?: Record<string, any>;
}

/**
 * Response with multiple method results
 */
export interface MultiMethodResponse {
  success: boolean;
  property_id: string;
  results: Record<string, ValuationMethodResponse>;
  hybrid_value?: number;
  value_range?: {
    low: number;
    high: number;
  };
  primary_method?: string;
  overall_confidence: number;
  calculation_time_ms: number;
}

/**
 * Reconciliation request
 */
export interface ReconciliationRequest {
  method_results: Record<string, { estimated_value: number; confidence_score: number }>;
  property_type: string;
  valuation_purpose?: string;
  market_conditions?: Record<string, any>;
}

/**
 * Reconciliation response
 */
export interface ReconciliationResponse {
  success: boolean;
  reconciled_value: number;
  value_range: {
    low: number;
    high: number;
    reconciled: number;
  };
  method_weights: Record<string, number>;
  method_values: Record<string, number>;
  primary_method: string;
  confidence_score: number;
  reconciliation_notes: string[];
}

/**
 * Sensitivity analysis request
 */
export interface SensitivityRequest {
  property: PythonPropertyInput;
  base_value: number;
  variables?: string[];
  variation_range?: number;
}

/**
 * Sensitivity analysis response
 */
export interface SensitivityResponse {
  success: boolean;
  base_value: number;
  sensitivity_results: Record<string, {
    base: number;
    low: number;
    high: number;
    impact_pct: number;
  }>;
  tornado_data: Array<{ variable: string; low: number; high: number }>;
  most_sensitive_variable: string;
  recommendations: string[];
}

/**
 * Confidence scoring request
 */
export interface ConfidenceRequest {
  property?: PythonPropertyInput;
  method_results: Array<{ method: string; value: number; confidence: number }> | Record<string, { estimated_value: number; confidence_score?: number }>;
  comparable_count?: number;
  data_quality_score?: number;
  market_activity?: string;
  market_conditions?: {
    market_trend: string;
    supply_demand_ratio: number;
    price_volatility: number;
    average_dom: number;
  };
  data_quality?: {
    completeness: number;
    recency: number;
    source_reliability: number;
  };
}

/**
 * Confidence scoring response
 */
export interface ConfidenceResponse {
  success: boolean;
  confidence_score: number;
  confidence_level: 'high' | 'medium' | 'low';
  factor_scores?: Record<string, number>;
  data_quality_score?: number;
  factors?: string[];
  recommendations?: string[];
}

/**
 * Market conditions request
 */
export interface MarketConditionsRequest {
  region: string;
  property_type?: string;
  as_of_date?: string;
}

/**
 * Market conditions response
 */
export interface MarketConditionsResponse {
  success: boolean;
  region: string;
  conditions: {
    market_activity: string;
    price_trend: string;
    inventory_level: string;
    avg_days_on_market: number;
    price_change_6m_pct: number;
    rental_yield_pct: number;
  };
  as_of_date: string;
  data_source: string;
}

/**
 * Service health response
 */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  database: string;
  timestamp: string;
}

// ============================================================================
// PYTHON VALUATION CLIENT
// ============================================================================

/**
 * Client for communicating with Python Valuation Engine
 */
export class PythonClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(options: {
    baseUrl?: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
  } = {}) {
    this.baseUrl = options.baseUrl || process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    this.timeout = options.timeout || 60000; // 1 minute default
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'propmetrik-typescript-orchestrator/2.0.0',
      },
    });

    // Request logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Python service → ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Python service request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Python service ← ${response.status} ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          logger.error(`Python service error: ${error.response.status}`, {
            url: error.config?.url,
            data: error.response.data,
          });
        } else if (error.request) {
          logger.error('Python service network error', { message: error.message });
        }
        return Promise.reject(error);
      }
    );
  }

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  /**
   * Check Python service health
   */
  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health');
    return response.data;
  }

  /**
   * Check if Python service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // VALUATION METHODS
  // ==========================================================================

  /**
   * Calculate Sales Comparison Approach
   */
  async salesComparison(property: PythonPropertyInput, options?: Record<string, any>): Promise<ValuationMethodResponse> {
    const request: ValuationMethodRequest = { property, options };
    const response = await this.client.post<ValuationMethodResponse>('/api/v1/methods/sales-comparison', request);
    return response.data;
  }

  /**
   * Calculate Cost Approach
   */
  async costApproach(property: PythonPropertyInput, options?: Record<string, any>): Promise<ValuationMethodResponse> {
    const request: ValuationMethodRequest = { property, options };
    const response = await this.client.post<ValuationMethodResponse>('/api/v1/methods/cost-approach', request);
    return response.data;
  }

  /**
   * Calculate Income Approach
   */
  async incomeApproach(property: PythonPropertyInput, options?: Record<string, any>): Promise<ValuationMethodResponse> {
    const request: ValuationMethodRequest = { property, options };
    const response = await this.client.post<ValuationMethodResponse>('/api/v1/methods/income-approach', request);
    return response.data;
  }

  /**
   * Calculate Residual Method (for development land)
   */
  async residualMethod(property: PythonPropertyInput, options?: Record<string, any>): Promise<ValuationMethodResponse> {
    const request: ValuationMethodRequest = { property, options };
    const response = await this.client.post<ValuationMethodResponse>('/api/v1/methods/residual', request);
    return response.data;
  }

  /**
   * Calculate Profits Method (for trading properties)
   */
  async profitsMethod(property: PythonPropertyInput, options?: Record<string, any>): Promise<ValuationMethodResponse> {
    const request: ValuationMethodRequest = { property, options };
    const response = await this.client.post<ValuationMethodResponse>('/api/v1/methods/profits', request);
    return response.data;
  }

  /**
   * Calculate DRC Method (for specialized properties)
   */
  async drcMethod(property: PythonPropertyInput, options?: Record<string, any>): Promise<ValuationMethodResponse> {
    const request: ValuationMethodRequest = { property, options };
    const response = await this.client.post<ValuationMethodResponse>('/api/v1/methods/drc', request);
    return response.data;
  }

  /**
   * Calculate all applicable methods at once
   */
  async calculateAllMethods(
    property: PythonPropertyInput,
    methods: string[] = ['sales_comparison', 'cost_approach'],
    options?: Record<string, any>
  ): Promise<MultiMethodResponse> {
    const request: MultiMethodRequest = { property, methods, options };
    const response = await this.client.post<MultiMethodResponse>('/api/v1/methods/calculate-all', request);
    return response.data;
  }

  /**
   * Execute a specific valuation method by name
   */
  async executeMethod(
    methodName: string,
    property: PythonPropertyInput,
    options?: Record<string, any>
  ): Promise<ValuationMethodResponse> {
    const methodMap: Record<string, (p: PythonPropertyInput, o?: Record<string, any>) => Promise<ValuationMethodResponse>> = {
      sales_comparison: this.salesComparison.bind(this),
      cost_approach: this.costApproach.bind(this),
      income_approach: this.incomeApproach.bind(this),
      residual_method: this.residualMethod.bind(this),
      residual: this.residualMethod.bind(this),
      profits_method: this.profitsMethod.bind(this),
      profits: this.profitsMethod.bind(this),
      drc_method: this.drcMethod.bind(this),
      drc: this.drcMethod.bind(this),
    };

    const handler = methodMap[methodName];
    if (!handler) {
      throw new Error(`Unknown valuation method: ${methodName}`);
    }

    return handler(property, options);
  }

  // ==========================================================================
  // SUPPORTING SERVICES
  // ==========================================================================

  /**
   * Reconcile multiple method results into final value
   */
  async reconcile(request: ReconciliationRequest): Promise<ReconciliationResponse> {
    const response = await this.client.post<ReconciliationResponse>('/api/v1/reconciliation', request);
    return response.data;
  }

  /**
   * Run sensitivity analysis
   */
  async sensitivityAnalysis(request: SensitivityRequest): Promise<SensitivityResponse> {
    const response = await this.client.post<SensitivityResponse>('/api/v1/sensitivity', request);
    return response.data;
  }

  /**
   * Calculate confidence score
   */
  async calculateConfidence(request: ConfidenceRequest): Promise<ConfidenceResponse> {
    const response = await this.client.post<ConfidenceResponse>('/api/v1/confidence', request);
    return response.data;
  }

  /**
   * Get market conditions for a region
   */
  async getMarketConditions(request: MarketConditionsRequest): Promise<MarketConditionsResponse> {
    const response = await this.client.post<MarketConditionsResponse>('/api/v1/market/conditions', request);
    return response.data;
  }

  // ==========================================================================
  // CONVERSION HELPERS
  // ==========================================================================

  /**
   * Convert TypeScript PropertyForValuation to Python input format
   */
  static toPropertyInput(property: PropertyForValuation): PythonPropertyInput {
    return {
      id: property.id,
      property_type: property.property_type,
      region: property.region,
      address_city: property.address_city ?? undefined,
      address_street: property.address_street ?? undefined,
      latitude: property.latitude ?? undefined,
      longitude: property.longitude ?? undefined,
      land_area_sqm: property.land_area_sqm ?? undefined,
      building_size_sqm: property.building_size_sqm ?? property.built_area_sqm ?? property.total_area_sqm ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      year_built: property.year_built ?? undefined,
      condition: property.condition ?? undefined,
      current_price_ghs: (property as any).current_price_ghs ?? (property as any).asking_price ?? undefined,
      monthly_rent_ghs: (property as any).monthly_rent_ghs ?? (property as any).rental_rate ?? undefined,
    };
  }

  /**
   * Convert Python method response to TypeScript MethodResult format
   */
  static toMethodResult(response: ValuationMethodResponse): MethodResult {
    return {
      method: response.method as any,
      value: response.estimated_value,
      confidence: response.confidence_score,
      weight: 0, // Set by orchestrator
      details: {
        ...response.details,
        value_range: response.value_range,
        assumptions: response.assumptions,
        limitations: response.limitations,
      },
    };
  }

  /**
   * Convert Python market conditions to TypeScript format
   */
  static toMarketConditions(response: MarketConditionsResponse): MarketConditions {
    const conditions = response.conditions;
    return {
      trend: conditions.price_trend === 'increasing' ? 'rising' : 
             conditions.price_trend === 'decreasing' ? 'falling' : 
             conditions.price_trend as 'stable' || 'stable',
      trend_strength: Math.abs(conditions.price_change_6m_pct / 100),
      activity_level: conditions.market_activity as 'high' | 'moderate' | 'low' || 'moderate',
      days_on_market_avg: conditions.avg_days_on_market,
      supply_demand_ratio: conditions.inventory_level === 'low' ? 1.2 : 
                           conditions.inventory_level === 'high' ? 0.8 : 1.0,
      price_index: 100,
      price_index_change_yoy: conditions.price_change_6m_pct * 2 / 100, // Annualized estimate
      market_trend: conditions.price_trend,
      days_on_market: conditions.avg_days_on_market,
      inventory_level: conditions.inventory_level as any,
    };
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Wrap a method call with retry logic
   */
  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }

        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(`Python service retry ${attempt}/${this.retryAttempts} in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`Python service failed after ${this.retryAttempts} attempts`);
    throw lastError;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default Python client instance
 */
export const pythonClient = new PythonClient();

export default pythonClient;
