/**
 * Valuation Engine API Client
 * 
 * API service for all valuation-related endpoints.
 * Provides type-safe access to the PROPMETRIK Valuation Engine backend.
 */

import {
  Valuation,
  ValuationApiResponse,
  ValuationStatsResponse,
  PaginatedValuations,
  CreateValuationInput,
  ValuationStatus,
  ValuationType,
  ValuationPurpose,
  FloorPlan,
  FloorPlanSummary,
  CreateFloorPlanInput,
  HBUAnalysis,
  UserOverride,
  OverrideSummary,
  ComparableBasket,
  BasketComparable,
  BasketStatistics,
  CreateBasketInput,
  AddComparableInput,
  SensitivityAnalysis,
  Reconciliation,
  CreateReconciliationInput,
  FinalizeReconciliationInput,
  MarketConditions,
  MarketIndex,
  ValuationReport,
  RegionCode,
  PropertyType,
  ValuationMethod,
} from '@/types/valuation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// =====================================================
// BASE FETCH UTILITY
// =====================================================

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// =====================================================
// VALUATION FILTERS
// =====================================================

export interface ValuationFilters {
  status?: ValuationStatus;
  valuation_type?: ValuationType;
  valuation_purpose?: ValuationPurpose;
  property_id?: string;
  assigned_to?: string;
  region?: RegionCode;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// =====================================================
// CORE VALUATION API
// =====================================================

export const valuationsApi = {
  // List valuations with filters
  getAll: (filters?: ValuationFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.valuation_type) params.set('valuation_type', filters.valuation_type);
    if (filters?.valuation_purpose) params.set('valuation_purpose', filters.valuation_purpose);
    if (filters?.property_id) params.set('property_id', filters.property_id);
    if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);
    if (filters?.region) params.set('region', filters.region);
    if (filters?.date_from) params.set('date_from', filters.date_from);
    if (filters?.date_to) params.set('date_to', filters.date_to);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.sort_by) params.set('sort_by', filters.sort_by);
    if (filters?.sort_order) params.set('sort_order', filters.sort_order);

    return fetchApi<PaginatedValuations>(`/valuations?${params}`);
  },

  // Get single valuation
  getById: (id: string) =>
    fetchApi<ValuationApiResponse<Valuation>>(`/valuations/${id}`),

  // Get valuations for a property
  getByProperty: (propertyId: string) =>
    fetchApi<ValuationApiResponse<Valuation[]>>(`/valuations/property/${propertyId}`),

  // Create new valuation
  create: (data: CreateValuationInput) =>
    fetchApi<ValuationApiResponse<Valuation>>('/valuations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Create valuation with new subject property (no existing property_id required)
  createWithNewProperty: (data: {
    property: {
      address_street?: string;
      address_city: string;
      region: string;
      property_type: string;
      digital_address?: string;
      land_area_sqm?: number;
      bedrooms?: string;
      bathrooms?: string;
      year_built?: string;
    };
    valuation_type: string;
    valuation_purpose: string;
  }) =>
    fetchApi<ValuationApiResponse<Valuation>>('/valuations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Quick valuation (Sales Comparison only)
  quickValuation: (propertyId: string) =>
    fetchApi<ValuationApiResponse<Valuation>>('/valuations/quick', {
      method: 'POST',
      body: JSON.stringify({ property_id: propertyId }),
    }),

  // Batch valuations
  batchValuation: (propertyIds: string[]) =>
    fetchApi<ValuationApiResponse<Valuation[]>>('/valuations/batch', {
      method: 'POST',
      body: JSON.stringify({ property_ids: propertyIds }),
    }),

  // Get valuation statistics
  getStats: () =>
    fetchApi<ValuationApiResponse<ValuationStatsResponse>>('/valuations/stats'),

  // Get comparables used in valuation
  getComparables: (id: string) =>
    fetchApi<ValuationApiResponse<BasketComparable[]>>(`/valuations/${id}/comparables`),

  // Get valuation report
  getReport: (id: string, format: 'json' | 'html' | 'pdf' = 'json') =>
    fetchApi<ValuationApiResponse<ValuationReport>>(`/valuations/${id}/report?format=${format}`),

  // Update valuation
  update: (id: string, data: Partial<Valuation>) =>
    fetchApi<ValuationApiResponse<Valuation>>(`/valuations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// =====================================================
// FLOOR PLAN API
// =====================================================

export const floorPlanApi = {
  // Create floor plan
  create: (valuationId: string, data: Omit<CreateFloorPlanInput, 'valuation_id'>) =>
    fetchApi<ValuationApiResponse<FloorPlan>>(`/valuations/${valuationId}/floor-plans`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get all floor plans for valuation
  getAll: (valuationId: string) =>
    fetchApi<ValuationApiResponse<FloorPlan[]>>(`/valuations/${valuationId}/floor-plans`),

  // Get all floor plans for valuation (alias)
  getByValuation: (valuationId: string) =>
    fetchApi<ValuationApiResponse<FloorPlan[]>>(`/valuations/${valuationId}/floor-plans`),

  // Get floor plan summary
  getSummary: (valuationId: string) =>
    fetchApi<ValuationApiResponse<FloorPlanSummary>>(`/valuations/${valuationId}/floor-plans/summary`),

  // Update floor plan
  update: (planId: string, data: Partial<CreateFloorPlanInput>) =>
    fetchApi<ValuationApiResponse<FloorPlan>>(`/valuations/floor-plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Lock floor plan
  lock: (planId: string) =>
    fetchApi<ValuationApiResponse<FloorPlan>>(`/valuations/floor-plans/${planId}/lock`, {
      method: 'POST',
    }),

  // Delete floor plan
  delete: (planId: string) =>
    fetchApi<ValuationApiResponse<void>>(`/valuations/floor-plans/${planId}`, {
      method: 'DELETE',
    }),
};

// =====================================================
// HBU ANALYSIS API
// =====================================================

export const hbuApi = {
  // Get or create HBU analysis
  get: (valuationId: string) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/${valuationId}/hbu`),

  // Get HBU analysis by valuation (alias)
  getByValuation: (valuationId: string) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/${valuationId}/hbu`),

  // Update legal analysis
  updateLegal: (hbuId: string, data: { legal_analysis: unknown; legal_test_passed: boolean }) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/hbu/${hbuId}/legal`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Update physical analysis
  updatePhysical: (hbuId: string, data: { physical_analysis: unknown; physical_test_passed: boolean }) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/hbu/${hbuId}/physical`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Update financial analysis
  updateFinancial: (hbuId: string, data: { financial_analysis: unknown; financial_test_passed: boolean }) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/hbu/${hbuId}/financial`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Update productivity analysis
  updateProductivity: (hbuId: string, data: { productivity_analysis: unknown; productivity_test_passed: boolean }) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/hbu/${hbuId}/productivity`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Finalize HBU analysis
  finalize: (hbuId: string, data: {
    hbu_conclusion: string;
    hbu_justification: string;
    recommended_methods: ValuationMethod[];
    method_justifications: Record<string, string>;
    hbu_as_vacant?: string;
    hbu_as_improved?: string;
  }) =>
    fetchApi<ValuationApiResponse<HBUAnalysis>>(`/valuations/hbu/${hbuId}/finalize`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// =====================================================
// OVERRIDE TRACKING API
// =====================================================

export const overridesApi = {
  // Create override
  create: (valuationId: string, data: Omit<UserOverride, 'id' | 'valuation_id' | 'overridden_at' | 'approval_status'>) =>
    fetchApi<ValuationApiResponse<UserOverride>>(`/valuations/${valuationId}/overrides`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get all overrides
  getAll: (valuationId: string) =>
    fetchApi<ValuationApiResponse<UserOverride[]>>(`/valuations/${valuationId}/overrides`),

  // Get override summary with disclaimers
  getSummary: (valuationId: string) =>
    fetchApi<ValuationApiResponse<OverrideSummary>>(`/valuations/${valuationId}/overrides/summary`),

  // Approve override
  approve: (overrideId: string, notes?: string) =>
    fetchApi<ValuationApiResponse<UserOverride>>(`/valuations/overrides/${overrideId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approval_notes: notes }),
    }),

  // Reject override
  reject: (overrideId: string, notes?: string) =>
    fetchApi<ValuationApiResponse<UserOverride>>(`/valuations/overrides/${overrideId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ approval_notes: notes }),
    }),
};

// =====================================================
// COMPARABLE BASKET API
// =====================================================

export const basketApi = {
  // Get all baskets for valuation
  getAll: (valuationId: string) =>
    fetchApi<ValuationApiResponse<ComparableBasket[]>>(`/valuations/${valuationId}/baskets`),

  // Create basket
  create: (valuationId: string, data?: Omit<CreateBasketInput, 'valuation_id'>) =>
    fetchApi<ValuationApiResponse<ComparableBasket>>(`/valuations/${valuationId}/baskets`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  // Get comparables in basket
  getComparables: (basketId: string, includeExcluded = false) =>
    fetchApi<ValuationApiResponse<BasketComparable[]>>(
      `/valuations/baskets/${basketId}/comparables?include_excluded=${includeExcluded}`
    ),

  // Add comparable to basket
  addComparable: (basketId: string, data: Omit<AddComparableInput, 'basket_id'>) =>
    fetchApi<ValuationApiResponse<BasketComparable>>(`/valuations/baskets/${basketId}/comparables`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Update comparable
  updateComparable: (comparableId: string, data: Partial<BasketComparable>) =>
    fetchApi<ValuationApiResponse<BasketComparable>>(`/valuations/comparables/${comparableId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Get basket statistics
  getStatistics: (basketId: string) =>
    fetchApi<ValuationApiResponse<BasketStatistics>>(`/valuations/baskets/${basketId}/statistics`),

  // Normalize weights
  normalizeWeights: (basketId: string) =>
    fetchApi<ValuationApiResponse<BasketComparable[]>>(`/valuations/baskets/${basketId}/normalize-weights`, {
      method: 'POST',
    }),
};

// =====================================================
// SENSITIVITY ANALYSIS API
// =====================================================

export const sensitivityApi = {
  // Get all analyses for valuation
  getAll: (valuationId: string) =>
    fetchApi<ValuationApiResponse<SensitivityAnalysis[]>>(`/valuations/${valuationId}/sensitivity`),

  // Run cap rate sensitivity
  analyzeCapRate: (valuationId: string, data: { noi: number; base_cap_rate: number }) =>
    fetchApi<ValuationApiResponse<SensitivityAnalysis>>(`/valuations/${valuationId}/sensitivity/cap-rate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Run tornado analysis
  analyzeTornado: (valuationId: string, data: {
    gross_income: number;
    vacancy_rate: number;
    operating_expenses: number;
    cap_rate: number;
  }) =>
    fetchApi<ValuationApiResponse<SensitivityAnalysis>>(`/valuations/${valuationId}/sensitivity/tornado`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Run Monte Carlo simulation
  analyzeMonteCarlo: (valuationId: string, data: {
    gdv: number;
    construction_cost: number;
    developer_profit_rate: number;
    finance_cost?: number;
    iterations?: number;
  }) =>
    fetchApi<ValuationApiResponse<SensitivityAnalysis>>(`/valuations/${valuationId}/sensitivity/monte-carlo`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// =====================================================
// RECONCILIATION API
// =====================================================

export const reconciliationApi = {
  // Get reconciliation
  get: (valuationId: string) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/${valuationId}/reconciliation`),

  // Get reconciliation by valuation (alias)
  getByValuation: (valuationId: string) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/${valuationId}/reconciliation`),

  // Create reconciliation
  create: (valuationId: string, data: Omit<CreateReconciliationInput, 'valuation_id'>) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/${valuationId}/reconciliation`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Set method weights
  setWeights: (reconciliationId: string, data: {
    weights: Record<ValuationMethod, number>;
    justifications?: Record<ValuationMethod, string>;
  }) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/reconciliation/${reconciliationId}/weights`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Finalize reconciliation
  finalize: (reconciliationId: string, data: FinalizeReconciliationInput) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/reconciliation/${reconciliationId}/finalize`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Approve reconciliation
  approve: (reconciliationId: string, notes?: string) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/reconciliation/${reconciliationId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  // Lock reconciliation
  lock: (reconciliationId: string) =>
    fetchApi<ValuationApiResponse<Reconciliation>>(`/valuations/reconciliation/${reconciliationId}/lock`, {
      method: 'POST',
    }),

  // Get narrative template
  getNarrativeTemplate: (reconciliationId: string) =>
    fetchApi<ValuationApiResponse<{ template: string }>>(`/valuations/reconciliation/${reconciliationId}/narrative-template`),
};

// =====================================================
// MARKET DATA API
// =====================================================

export const marketDataApi = {
  // Get market conditions for region
  getConditions: (region: RegionCode, propertyType?: PropertyType) => {
    const params = new URLSearchParams();
    if (propertyType) params.set('property_type', propertyType);
    return fetchApi<ValuationApiResponse<MarketConditions>>(`/valuations/market/${region}?${params}`);
  },

  // Get market index history
  getIndices: (region: RegionCode, propertyType?: PropertyType, months = 24) => {
    const params = new URLSearchParams();
    if (propertyType) params.set('property_type', propertyType);
    params.set('months', String(months));
    return fetchApi<ValuationApiResponse<MarketIndex[]>>(`/valuations/market/${region}/indices?${params}`);
  },
};

// =====================================================
// COMPARABLES SEARCH API (for Sales Comparison)
// =====================================================

export interface ComparableSearchParams {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  propertyType?: PropertyType;
  priceMin?: number;
  priceMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  excludeIds?: string[];
}

export interface ComparableProperty {
  id: string;
  address: string;
  city: string;
  region: string;
  propertyType: PropertyType;
  salePrice: number;
  saleDate: string;
  gfa: number;
  plotSize?: number;
  pricePerSqm: number;
  bedrooms?: number;
  bathrooms?: number;
  yearBuilt?: number;
  condition?: string;
  adjustments?: Record<string, number>;
  totalAdjustment?: number;
  adjustedValue?: number;
  adjustedPricePerSqm?: number;
}

export const comparablesApi = {
  // Search for comparable properties
  search: (params: ComparableSearchParams) =>
    fetchApi<ValuationApiResponse<ComparableProperty[]>>('/comparables/search', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Get comparable basket for valuation
  getBasket: (valuationId: string) =>
    fetchApi<ValuationApiResponse<{
      id: string;
      comparables: ComparableProperty[];
      indicatedValue: number;
      avgPricePerSqm: number;
    }>>(`/valuations/${valuationId}/comparable-basket`),

  // Save comparable basket
  saveBasket: (valuationId: string, data: {
    comparables: ComparableProperty[];
    indicatedValue: number | null;
    avgPricePerSqm: number;
  }) =>
    fetchApi<ValuationApiResponse<unknown>>(`/valuations/${valuationId}/comparable-basket`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// =====================================================
// COST APPROACH API
// =====================================================

export interface CostApproachData {
  id?: string;
  valuationId: string;
  landValue: number;
  gfa: number;
  constructionRate: number;
  constructionQuality: string;
  hardCosts: number;
  softCostsPercent: number;
  softCostsAmount: number;
  siteworks: number;
  entrepreneurialProfitPercent: number;
  entrepreneurialProfitAmount: number;
  reproductionCostNew: number;
  physicalDepreciation: number;
  functionalObsolescence: number;
  externalObsolescence: number;
  totalDepreciation: number;
  depreciationAmount: number;
  depreciatedBuildingValue: number;
  indicatedValue: number;
  components?: Array<{
    id: string;
    name: string;
    area: number;
    ratePerSqm: number;
    total: number;
  }>;
}

export const costApproachApi = {
  // Get cost approach data
  getByValuation: (valuationId: string) =>
    fetchApi<ValuationApiResponse<CostApproachData>>(`/valuations/${valuationId}/cost-approach`),

  // Save cost approach data
  save: (valuationId: string, data: Omit<CostApproachData, 'id' | 'valuationId'>) =>
    fetchApi<ValuationApiResponse<CostApproachData>>(`/valuations/${valuationId}/cost-approach`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// =====================================================
// INCOME APPROACH API
// =====================================================

export interface IncomeApproachData {
  id?: string;
  valuationId: string;
  incomeSources: Array<{
    id: string;
    description: string;
    units: number;
    monthlyRent: number;
    annualIncome: number;
    occupancyRate: number;
  }>;
  parkingIncome: number;
  otherIncome: number;
  potentialGrossIncome: number;
  vacancyRate: number;
  vacancyLoss: number;
  collectionLoss: number;
  collectionLossAmount: number;
  effectiveGrossIncome: number;
  managementFee: number;
  managementFeeAmount: number;
  maintenance: number;
  insurance: number;
  propertyTax: number;
  utilities: number;
  security: number;
  reserves: number;
  reservesAmount: number;
  otherExpenses: number;
  totalOperatingExpenses: number;
  netOperatingIncome: number;
  operatingExpenseRatio: number;
  capRate: number;
  discountRate: number;
  holdingPeriod: number;
  terminalCapRate: number;
  rentGrowth: number;
  incomeMethod: 'direct_cap' | 'dcf';
  directCapValue: number;
  dcfValue: number;
  indicatedValue: number;
}

export const incomeApproachApi = {
  // Get income approach data
  getByValuation: (valuationId: string) =>
    fetchApi<ValuationApiResponse<IncomeApproachData>>(`/valuations/${valuationId}/income-approach`),

  // Save income approach data
  save: (valuationId: string, data: Omit<IncomeApproachData, 'id' | 'valuationId'>) =>
    fetchApi<ValuationApiResponse<IncomeApproachData>>(`/valuations/${valuationId}/income-approach`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// =====================================================
// CONTRIBUTION WORKFLOW API
// =====================================================

export const contributionApi = {
  // Analyze gaps for property
  analyzeGaps: (propertyId: string) =>
    fetchApi<ValuationApiResponse<unknown>>('/contributions/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({ property_id: propertyId }),
    }),

  // Get active prompts
  getPrompts: () =>
    fetchApi<ValuationApiResponse<unknown[]>>('/contributions/prompts'),

  // Submit contribution
  submit: (data: unknown) =>
    fetchApi<ValuationApiResponse<unknown>>('/contributions/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Get user's submissions
  getMySubmissions: () =>
    fetchApi<ValuationApiResponse<unknown[]>>('/contributions/my-submissions'),

  // Get contributor profile
  getProfile: () =>
    fetchApi<ValuationApiResponse<unknown>>('/contributions/profile'),

  // Get credit history
  getCreditHistory: () =>
    fetchApi<ValuationApiResponse<unknown[]>>('/contributions/credits/history'),

  // Get leaderboard
  getLeaderboard: () =>
    fetchApi<ValuationApiResponse<unknown[]>>('/contributions/leaderboard'),
};
