import {
  ApiResponse,
  PaginatedResponse,
  DataSource,
  DataSourceStats,
  EtlJob,
  EtlJobStats,
  EtlJobLog,
  Contribution,
  ContributorProfile,
  EconomicSnapshot,
  EconomicIndicator,
  MaterialPrice,
  LaborRate,
  ConstructionEstimate,
  QueueStats,
  DataSourceTier,
  EtlJobType,
  EtlJobStatus,
  ContributionType,
  ValidationStatus,
  RegionCode,
  mapPropertyRegionToConstructionCluster,
  getPropertyRegionDisplayName,
} from '@/types/data-hub';

// Re-export commonly used types
export type { RegionCode } from '@/types/data-hub';
export { mapPropertyRegionToConstructionCluster, getPropertyRegionDisplayName, mapShortRegionToDataHub } from '@/types/data-hub';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    const message = error.error || error.message || error.detail || `HTTP ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// =====================================================
// DATA SOURCES API
// =====================================================

export interface DataSourceFilters {
  tier?: DataSourceTier;
  is_active?: boolean;
  is_paused?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export const dataSourcesApi = {
  getAll: (filters?: DataSourceFilters) => {
    const params = new URLSearchParams();
    if (filters?.tier) params.set('tier', filters.tier);
    if (filters?.is_active !== undefined) params.set('is_active', String(filters.is_active));
    if (filters?.is_paused !== undefined) params.set('is_paused', String(filters.is_paused));
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    return fetchApi<PaginatedResponse<DataSource>>(`/data-hub/sources?${params}`);
  },

  getById: (id: string) =>
    fetchApi<ApiResponse<DataSource>>(`/data-hub/sources/${id}`),

  getStatsByTier: () =>
    fetchApi<ApiResponse<DataSourceStats[]>>('/data-hub/sources/stats/by-tier'),

  create: (data: Partial<DataSource>) =>
    fetchApi<ApiResponse<DataSource>>('/data-hub/sources', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<DataSource>) =>
    fetchApi<ApiResponse<DataSource>>(`/data-hub/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<ApiResponse<void>>(`/data-hub/sources/${id}`, {
      method: 'DELETE',
    }),

  triggerSync: (id: string) =>
    fetchApi<ApiResponse<{ jobId: string }>>(`/data-hub/sources/${id}/sync`, {
      method: 'POST',
    }),
};

// =====================================================
// SPIDERS API (Web Scraping Data Sources)
// =====================================================

export interface Spider {
  id: string;
  name: string;
  slug: string;
  domain: string;
  status: 'idle' | 'running' | 'failed' | 'paused';
  lastRun: string | null;
  itemsScraped: number;
  errorRate: number;
  avgDuration: number;
  progress?: number;
  errorMessage?: string;
  isActive: boolean;
  isPaused: boolean;
  spiderConfig: Record<string, unknown>;
  schedule?: string;
}

export interface SpiderStats {
  totalSpiders: number;
  runningCount: number;
  errorCount: number;
  totalItemsScraped: number;
  avgErrorRate: number;
}

export const spidersApi = {
  // Get all web scraping spiders (using management service)
  getAll: () =>
    fetchApi<ApiResponse<Spider[]>>('/data-hub/spiders'),

  // Run a spider (start sync)
  run: (id: string) =>
    fetchApi<ApiResponse<boolean>>(`/data-hub/spiders/${id}/start`, {
      method: 'POST',
    }),

  // Stop a spider
  stop: (id: string) =>
    fetchApi<ApiResponse<boolean>>(`/data-hub/spiders/${id}/stop`, {
      method: 'POST',
    }),

  /** @deprecated use getAll */
  getStats: async (): Promise<ApiResponse<SpiderStats>> => {
    const spidersResponse = await spidersApi.getAll();
    const spiders = spidersResponse.data;

    const stats: SpiderStats = {
      totalSpiders: spiders.length,
      runningCount: spiders.filter(s => s.status === 'running').length,
      errorCount: spiders.filter(s => s.status === 'failed').length,
      totalItemsScraped: spiders.reduce((acc, s) => acc + (Number(s.itemsScraped) || 0), 0),
      avgErrorRate: spiders.length > 0
        ? spiders.reduce((acc, s) => acc + s.errorRate, 0) / spiders.length
        : 0,
    };

    return { success: true, data: stats };
  },
};

// =====================================================
// ETL JOBS API
// =====================================================

export interface EtlJobFilters {
  source_id?: string;
  job_type?: EtlJobType;
  status?: EtlJobStatus;
  page?: number;
  limit?: number;
}

export const etlJobsApi = {
  getAll: (filters?: EtlJobFilters) => {
    const params = new URLSearchParams();
    if (filters?.source_id) params.set('data_source_id', filters.source_id);
    if (filters?.job_type) params.set('job_type', filters.job_type);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    return fetchApi<PaginatedResponse<EtlJob>>(`/data-hub/jobs?${params}`);
  },

  getById: (id: string) =>
    fetchApi<ApiResponse<EtlJob>>(`/data-hub/jobs/${id}`),

  getStats: () =>
    fetchApi<ApiResponse<EtlJobStats>>('/data-hub/jobs/stats'),

  getLogs: (id: string, level?: string) => {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    return fetchApi<ApiResponse<EtlJobLog[]>>(`/data-hub/jobs/${id}/logs?${params}`);
  },

  cancel: (id: string, reason?: string) =>
    fetchApi<ApiResponse<EtlJob>>(`/data-hub/jobs/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// =====================================================
// CONTRIBUTIONS API
// =====================================================

export interface ContributionFilters {
  contributor_id?: string;
  contribution_type?: ContributionType;
  validation_status?: ValidationStatus;
  property_region?: RegionCode;
  source_context?: string;
  page?: number;
  limit?: number;
}

export interface ContributionStats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  totalApproved: number;
  totalRejected: number;
  rejectionRate: number;
  activeContributors: number;
}

export const contributionsApi = {
  getAll: (filters?: ContributionFilters) => {
    const params = new URLSearchParams();
    if (filters?.contributor_id) params.set('contributor_id', filters.contributor_id);
    if (filters?.contribution_type) params.set('contribution_type', filters.contribution_type);
    if (filters?.validation_status) params.set('validation_status', filters.validation_status);
    if (filters?.property_region) params.set('property_region', filters.property_region);
    if (filters?.source_context) params.set('source_context', filters.source_context);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    return fetchApi<PaginatedResponse<Contribution>>(`/data-hub/contributions?${params}`);
  },

  getPending: (limit = 50) =>
    fetchApi<ApiResponse<Contribution[]> & { count: number }>(
      `/data-hub/contributions/pending?limit=${limit}`
    ),

  getStats: () =>
    fetchApi<ApiResponse<ContributionStats>>('/data-hub/contributions/stats'),

  getById: (id: string) =>
    fetchApi<ApiResponse<Contribution>>(`/data-hub/contributions/${id}`),

  approve: (id: string, credits?: number) =>
    fetchApi<ApiResponse<Contribution>>(`/data-hub/contributions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ credits_awarded: credits }),
    }),

  reject: (id: string, reason: string) =>
    fetchApi<ApiResponse<Contribution>>(`/data-hub/contributions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getLeaderboard: (limit = 10, region?: string, period?: string) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (region) params.set('region', region);
    if (period) params.set('period', period);
    return fetchApi<ApiResponse<ContributorProfile[]>>(`/data-hub/contributors/leaderboard?${params}`);
  },
};

// =====================================================
// ECONOMIC DATA API
// =====================================================

export const economicApi = {
  getSnapshot: () =>
    fetchApi<ApiResponse<EconomicSnapshot>>('/data-hub/economic/snapshot'),

  getIndicator: (type: string) =>
    fetchApi<ApiResponse<EconomicIndicator>>(`/data-hub/economic/indicators/${type}`),

  getIndicatorHistory: (type: string, from?: string, to?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('limit', String(limit));
    return fetchApi<ApiResponse<EconomicIndicator[]> & { count: number }>(
      `/data-hub/economic/indicators/${type}/history?${params}`
    );
  },

  getExchangeRate: (currency: string, to = 'GHS') =>
    fetchApi<ApiResponse<{ from_currency: string; to_currency: string; rate: number }>>(
      `/data-hub/economic/exchange-rate/${currency}?to=${to}`
    ),

  convertCurrency: (amount: number, from_currency: string) =>
    fetchApi<ApiResponse<{
      original_amount: number;
      from_currency: string;
      to_currency: string;
      converted_amount: number;
    }>>('/data-hub/economic/convert', {
      method: 'POST',
      body: JSON.stringify({ amount, from_currency }),
    }),

  calculateAffordability: (median_property_price: number, median_household_income: number) =>
    fetchApi<ApiResponse<{ index: number; interpretation: string }>>(
      '/data-hub/economic/affordability',
      {
        method: 'POST',
        body: JSON.stringify({ median_property_price, median_household_income }),
      }
    ),

  seed: () =>
    fetchApi<ApiResponse<void>>('/data-hub/economic/seed', { method: 'POST' }),
};

// =====================================================
// CONSTRUCTION COSTS API
// =====================================================

export interface MaterialFilters {
  category?: string;
  region?: RegionCode;
  supplier_type?: 'retail' | 'wholesale' | 'manufacturer';
}

export interface LaborFilters {
  category?: string;
  skill_level?: 'apprentice' | 'journeyman' | 'master' | 'specialist';
  region?: RegionCode;
}

export const constructionApi = {
  getMaterials: (filters?: MaterialFilters) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.region) params.set('region', filters.region);
    if (filters?.supplier_type) params.set('supplier_type', filters.supplier_type);
    return fetchApi<ApiResponse<MaterialPrice[]> & { count: number }>(
      `/data-hub/construction/materials?${params}`
    );
  },

  getMaterialHistory: (name: string, region: RegionCode = 'greater_accra') =>
    fetchApi<ApiResponse<MaterialPrice[]> & { count: number }>(
      `/data-hub/construction/materials/${encodeURIComponent(name)}/history?region=${region}`
    ),

  getMaterialComparison: (name: string) =>
    fetchApi<ApiResponse<{ region: RegionCode; price_ghs: number }[]>>(
      `/data-hub/construction/materials/${encodeURIComponent(name)}/compare`
    ),

  getLaborRates: (filters?: LaborFilters) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.skill_level) params.set('skill_level', filters.skill_level);
    if (filters?.region) params.set('region', filters.region);
    return fetchApi<ApiResponse<LaborRate[]> & { count: number }>(
      `/data-hub/construction/labor?${params}`
    );
  },

  estimateCost: (data: {
    property_type: string;
    quality_level: string;
    region: RegionCode;
    built_area_sqm: number;
    num_floors?: number;
  }) =>
    fetchApi<ApiResponse<ConstructionEstimate>>('/data-hub/construction/estimate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  calculateDRC: (data: {
    property_type: string;
    quality_level: string;
    region: RegionCode;
    built_area_sqm: number;
    age_years: number;
    condition?: string;
  }) =>
    fetchApi<ApiResponse<{
      gross_replacement_cost: number;
      depreciation: number;
      depreciated_value: number;
    }>>('/data-hub/construction/drc', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getIndex: (region?: RegionCode) => {
    const params = region ? `?region=${region}` : '';
    return fetchApi<ApiResponse<{
      material_index: number;
      labor_index: number;
      overall_index: number;
      base_year: number;
      last_updated: string;
      price_date_range: { from: string; to: string } | null;
      material_weights?: Record<string, number>;
    }>>(`/data-hub/construction/index${params}`);
  },

  getIndexHistory: (region?: RegionCode, limit = 12) => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    params.set('limit', String(limit));
    return fetchApi<ApiResponse<Array<{
      period: string;
      date: string;
      material_index: number;
      labor_index: number;
      overall_index: number;
      price_change: number;
    }>> & { count: number }>(`/data-hub/construction/index/history?${params}`);
  },

  getWeeklyMaterialTrends: (limit = 12) => {
    return fetchApi<ApiResponse<Array<{
      week: string;
      date: string;
      greater_accra?: number;
      kumasi_metro?: number;
      eastern?: number;
      western_cluster?: number;
      northern_cluster?: number;
    }>> & { count: number }>(`/data-hub/construction/materials/weekly-trends?limit=${limit}`);
  },

  getWeeklyLaborTrends: (limit = 12) => {
    return fetchApi<ApiResponse<Array<{
      week: string;
      date: string;
      greater_accra?: number;
      kumasi_metro?: number;
      eastern?: number;
      western_cluster?: number;
      northern_cluster?: number;
    }>> & { count: number }>(`/data-hub/construction/labor/weekly-trends?limit=${limit}`);
  },

  getWeeklyMaterialCategoryAverages: (region?: RegionCode, weeks = 2) => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    params.set('weeks', String(weeks));
    return fetchApi<ApiResponse<Array<{
      week: string;
      date: string;
      category: string;
      avg_price: number;
    }>> & { count: number }>(`/data-hub/construction/materials/categories/weekly?${params}`);
  },

  getWeeklyLaborCategoryAverages: (region?: RegionCode, weeks = 2) => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    params.set('weeks', String(weeks));
    return fetchApi<ApiResponse<Array<{
      week: string;
      date: string;
      labor_category: string;
      avg_rate: number;
    }>> & { count: number }>(`/data-hub/construction/labor/categories/weekly?${params}`);
  },

  getMaterialCategoryWeights: () => {
    return fetchApi<ApiResponse<Array<{ category: string; weight: number }>> & { count: number }>(
      `/data-hub/construction/materials/weights`
    );
  },

  updateMaterialCategoryWeights: (weights: Array<{ category: string; weight: number }>) => {
    return fetchApi<ApiResponse<Array<{ category: string; weight: number }>> & { count: number }>(
      `/data-hub/construction/materials/weights`,
      {
        method: 'PUT',
        body: JSON.stringify({ weights }),
      }
    );
  },

  // Quality Multipliers
  getQualityMultipliers: () => {
    return fetchApi<ApiResponse<Array<{ quality_level: string; multiplier: number; description: string | null }>> & { count: number }>(
      `/data-hub/construction/quality-multipliers`
    );
  },

  updateQualityMultipliers: (multipliers: Array<{ quality_level: string; multiplier: number; description?: string | null }>) => {
    return fetchApi<ApiResponse<Array<{ quality_level: string; multiplier: number; description: string | null }>> & { count: number }>(
      `/data-hub/construction/quality-multipliers`,
      {
        method: 'PUT',
        body: JSON.stringify({ multipliers }),
      }
    );
  },

  // Region Multipliers
  getRegionMultipliers: () => {
    return fetchApi<ApiResponse<Array<{ region: string; multiplier: number; description: string | null }>> & { count: number }>(
      `/data-hub/construction/region-multipliers`
    );
  },

  updateRegionMultipliers: (multipliers: Array<{ region: string; multiplier: number; description?: string | null }>) => {
    return fetchApi<ApiResponse<Array<{ region: string; multiplier: number; description: string | null }>> & { count: number }>(
      `/data-hub/construction/region-multipliers`,
      {
        method: 'PUT',
        body: JSON.stringify({ multipliers }),
      }
    );
  },

  // Base Costs Per SQM
  getBaseCosts: () => {
    return fetchApi<ApiResponse<Array<{ id: number; property_type: string; quality_level: string; cost_ghs: number; effective_date: string; notes: string | null }>> & { count: number }>(
      `/data-hub/construction/base-costs`
    );
  },

  updateBaseCosts: (costs: Array<{ property_type: string; quality_level: string; cost_ghs: number; notes?: string | null }>) => {
    return fetchApi<ApiResponse<Array<{ id: number; property_type: string; quality_level: string; cost_ghs: number; effective_date: string; notes: string | null }>> & { count: number }>(
      `/data-hub/construction/base-costs`,
      {
        method: 'PUT',
        body: JSON.stringify({ costs }),
      }
    );
  },

  // Cost Breakdown
  getCostBreakdown: () => {
    return fetchApi<ApiResponse<Array<{ category: string; percentage: number; display_order: number; description: string | null }>> & { count: number }>(
      `/data-hub/construction/cost-breakdown`
    );
  },

  updateCostBreakdown: (breakdown: Array<{ category: string; percentage: number; display_order?: number; description?: string | null }>) => {
    return fetchApi<ApiResponse<Array<{ category: string; percentage: number; display_order: number; description: string | null }>> & { count: number }>(
      `/data-hub/construction/cost-breakdown`,
      {
        method: 'PUT',
        body: JSON.stringify({ breakdown }),
      }
    );
  },

  getMaterialNames: () => {
    return fetchApi<ApiResponse<string[]>>('/data-hub/construction/materials/names');
  },

  getMaterialCategories: () => {
    return fetchApi<ApiResponse<string[]>>('/data-hub/construction/materials/categories');
  },

  getLaborRoles: () => {
    return fetchApi<ApiResponse<string[]>>('/data-hub/construction/labor/roles');
  },

  getLaborCategories: () => {
    return fetchApi<ApiResponse<string[]>>('/data-hub/construction/labor/categories');
  },

  getRegionalMaterialComparison: (limit = 20) => {
    return fetchApi<ApiResponse<Array<{
      material_name: string;
      greater_accra?: number;
      kumasi_metro?: number;
      eastern?: number;
      western_cluster?: number;
      northern_cluster?: number;
    }>> & { count: number }>(`/data-hub/construction/materials/regional-comparison?limit=${limit}`);
  },

  createMaterialPrice: (data: {
    material_category: string;
    material_name: string;
    brand?: string;
    specification?: string;
    price_ghs: number;
    unit: string;
    region: string;
    supplier_type: 'retail' | 'wholesale' | 'manufacturer';
    supplier_name?: string;
    survey_date?: string;
    is_verified?: boolean;
    confidence_level?: number;
    notes?: string;
  }) => {
    return fetchApi<ApiResponse<any>>('/data-hub/construction/materials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createLaborRate: (data: {
    labor_category: string;
    skill_level: 'apprentice' | 'journeyman' | 'master' | 'specialist';
    rate_ghs: number;
    rate_type: 'daily' | 'hourly' | 'monthly' | 'per_unit';
    region: string;
    includes_benefits?: boolean;
    source: string;
    is_verified?: boolean;
    notes?: string;
  }) => {
    return fetchApi<ApiResponse<any>>('/data-hub/construction/labor', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getRegionalLaborComparison: (limit = 20) => {
    return fetchApi<ApiResponse<Array<{
      role_name: string;
      greater_accra?: number;
      kumasi_metro?: number;
      eastern?: number;
      western_cluster?: number;
      northern_cluster?: number;
    }>> & { count: number }>(`/data-hub/construction/labor/regional-comparison?limit=${limit}`);
  },

  seed: () =>
    fetchApi<ApiResponse<void>>('/data-hub/construction/seed', { method: 'POST' }),
};

// =====================================================
// QUEUES API
// =====================================================

export const queuesApi = {
  getStats: () =>
    fetchApi<ApiResponse<QueueStats>>('/data-hub/queues/stats'),

  trigger: (queue: string, data?: Record<string, unknown>) =>
    fetchApi<ApiResponse<{ jobId: string; queue: string }>>('/data-hub/queues/trigger', {
      method: 'POST',
      body: JSON.stringify({ queue, data }),
    }),
};

// =====================================================
// GEOCODING API
// =====================================================

export const geocodingApi = {
  geocode: (address: string) =>
    fetchApi<ApiResponse<{
      latitude: number;
      longitude: number;
      confidence: number;
      region: string;
    }>>('/data-hub/geocode', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  reverseGeocode: (latitude: number, longitude: number) =>
    fetchApi<ApiResponse<{
      address: string;
      district: string;
      region: string;
    }>>('/data-hub/geocode/reverse', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    }),

  getStats: () =>
    fetchApi<ApiResponse<{
      total_cached: number;
      hit_rate: number;
    }>>('/data-hub/geocode/stats'),
};

// =====================================================
// FILE UPLOADS API
// =====================================================

export interface FileUploadFilters {
  source_id?: string;
  status?: string;
  file_type?: string;
  uploaded_by?: string;
  page?: number;
  limit?: number;
}

export const fileUploadsApi = {
  upload: async (file: File, sourceId: string, uploadedBy = 'admin') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_id', sourceId);
    formData.append('uploaded_by', uploadedBy);

    const response = await fetch(`${API_BASE}/data-hub/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  },

  getAll: (filters?: FileUploadFilters) => {
    const params = new URLSearchParams();
    if (filters?.source_id) params.set('source_id', filters.source_id);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.file_type) params.set('file_type', filters.file_type);
    if (filters?.uploaded_by) params.set('uploaded_by', filters.uploaded_by);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    return fetchApi<PaginatedResponse<any>>(`/data-hub/uploads?${params}`);
  },

  getById: (id: string) =>
    fetchApi<ApiResponse<any>>(`/data-hub/uploads/${id}`),

  getRecent: (limit = 10) =>
    fetchApi<ApiResponse<any[]> & { count: number }>(`/data-hub/uploads/recent/${limit}`),

  delete: (id: string) =>
    fetchApi<ApiResponse<void>>(`/data-hub/uploads/${id}`, {
      method: 'DELETE',
    }),
};

// =====================================================
// VALUATION CONFIG API (Admin-managed weights & factors)
// =====================================================

export const valuationConfigApi = {
  // Material Category Weights
  getMaterialWeights: () =>
    fetchApi<ApiResponse<Array<{
      category: string;
      display_name: string;
      weight: number;
      updated_at: string;
    }>> & { count: number }>('/data-hub/valuation-config/material-weights'),

  updateMaterialWeight: (category: string, weight: number, updatedBy?: string) =>
    fetchApi<ApiResponse<{ message: string }>>(`/data-hub/valuation-config/material-weights/${category}`, {
      method: 'PUT',
      body: JSON.stringify({ weight, updated_by: updatedBy }),
    }),

  // Regional Location Factors
  getRegionalFactors: () =>
    fetchApi<ApiResponse<Array<{
      region_code: string;
      region_name: string;
      location_factor: number;
      updated_at: string;
    }>> & { count: number }>('/data-hub/valuation-config/regional-factors'),

  getRegionalFactor: (regionCode: string) =>
    fetchApi<ApiResponse<{
      name: string;
      factor: number;
    }>>(`/data-hub/valuation-config/regional-factors/${regionCode}`),

  updateRegionalFactor: (regionCode: string, locationFactor: number, updatedBy?: string) =>
    fetchApi<ApiResponse<{ message: string }>>(`/data-hub/valuation-config/regional-factors/${regionCode}`, {
      method: 'PUT',
      body: JSON.stringify({ location_factor: locationFactor, updated_by: updatedBy }),
    }),

  // Base Construction Costs
  getBaseCosts: () =>
    fetchApi<ApiResponse<Array<{
      quality_tier: string;
      display_name: string;
      base_cost_per_sqm: number;
      base_year: number;
      updated_at: string;
    }>> & { count: number }>('/data-hub/valuation-config/base-costs'),

  updateBaseCost: (qualityTier: string, baseCostPerSqm: number, updatedBy?: string) =>
    fetchApi<ApiResponse<{ message: string }>>(`/data-hub/valuation-config/base-costs/${qualityTier}`, {
      method: 'PUT',
      body: JSON.stringify({ base_cost_per_sqm: baseCostPerSqm, updated_by: updatedBy }),
    }),

  // Configuration History
  getConfigHistory: (tableName?: string, limit = 100) => {
    const params = new URLSearchParams();
    if (tableName) params.set('table', tableName);
    params.set('limit', String(limit));
    return fetchApi<ApiResponse<Array<{
      id: string;
      table_name: string;
      record_id: string;
      field_name: string;
      old_value: string | null;
      new_value: string | null;
      changed_by: string;
      changed_at: string;
    }>> & { count: number }>(`/data-hub/valuation-config/history?${params}`);
  },
};

// =====================================================
// DATA QUALITY API
// =====================================================

export interface DataQualityOverview {
  total_properties: number;
  geocoding_coverage: string;
  price_coverage: string;
  delisted_count: number;
  with_evidence_type: number;
  with_digital_address: number;
  with_size_data: number;
  with_images: number;
  avg_completeness_score: number;
}

export interface SourceQualityStats {
  source: string;
  total: number;
  geocoded: number;
  geocoding_pct: string;
  with_price: number;
  price_pct: string;
  delisted: number;
  avg_age_days: number;
  avg_completeness: number;
  last_scraped: string;
}

export interface EvidenceDistribution {
  type: string;
  count: number;
}

export interface PropertyTypeDistribution {
  type: string;
  count: number;
}

export interface RegionDistribution {
  region: string;
  count: number;
  geocoded: number;
  geocoding_pct: string;
}

export interface WeeklyTrend {
  week: string;
  new_properties: number;
  geocoded: number;
  with_price: number;
  avg_completeness: number;
}

export interface DataQualityStats {
  overview: DataQualityOverview;
  by_source: SourceQualityStats[];
  evidence_distribution: EvidenceDistribution[];
  property_type_distribution: PropertyTypeDistribution[];
  region_distribution: RegionDistribution[];
  weekly_trends: WeeklyTrend[];
}

export interface GeocodingSourceStats {
  source: string;
  total: number;
  geocoded: number;
  with_gps_code: number;
  geocoded_via_gps: number;
  geocoded_via_api: number;
  original_coords: number;
  geocoding_pct: string;
}

// Duplicate dataQualityApi removed


// =====================================================
// DATA HUB ANALYTICS API
// =====================================================

export const dataHubAnalyticsApi = {
  getVolumeByTier: () =>
    fetchApi<ApiResponse<Array<{ tier: string; total_records: number; source_count: number }>>>('/data-hub/analytics/volume'),

  getTrends: (range: '1h' | '24h' | '7d' | '30d' = '24h') =>
    fetchApi<ApiResponse<Array<{ timestamp: string; tier1: number; tier2: number; tier3: number; tier4: number; tier5: number; total: number }>>>(`/data-hub/analytics/trends?range=${range}`),

  getGeographicDist: () =>
    fetchApi<ApiResponse<Array<{ region: string; count: number; percentage: number }>>>('/data-hub/analytics/geographic'),

  getSourcePerformance: () =>
    fetchApi<ApiResponse<Array<{ name: string; reliability: number; speed: number; quality: number }>>>('/data-hub/analytics/performance'),

  getTemporalPatterns: () =>
    fetchApi<ApiResponse<Array<{ day: string; hour: number; value: number }>>>('/data-hub/analytics/temporal'),
};

// =====================================================
// DATA HUB PERFORMANCE API
// =====================================================

export const dataHubPerformanceApi = {
  getIngestionSpeed: () =>
    fetchApi<ApiResponse<Array<{ hour: string; recordsPerSec: number; avgLatency: number }>>>('/data-hub/performance/ingestion'),

  getProcessingTime: () =>
    fetchApi<ApiResponse<Array<{ jobType: string; avgTime: number; p95: number; p99: number }>>>('/data-hub/performance/processing'),

  getQueueDepth: () =>
    fetchApi<ApiResponse<Array<{ name: string; pending: number; processing: number; completed: number; failed: number }>>>('/data-hub/performance/queues'),

  getResourceUtilization: () =>
    fetchApi<ApiResponse<Array<{ resource: string; current: number; average: number; peak: number }>>>('/data-hub/performance/resources'),

  getSlaMetrics: () =>
    fetchApi<ApiResponse<Array<{ metric: string; target: number; actual: number; status: string }>>>('/data-hub/performance/sla'),

  getBottlenecks: () =>
    fetchApi<ApiResponse<Array<{ component: string; severity: string; impact: string; recommendation: string }>>>('/data-hub/performance/bottlenecks'),
};

export const dataCatalogApi = {
  listEntries: () =>
    fetchApi<ApiResponse<any[]>>('/data-hub/catalog/entries'),
  getSchema: (id: string) =>
    fetchApi<ApiResponse<any[]>>(`/data-hub/catalog/entries/${id}/schema`),
};

// =====================================================
// DATA QUALITY API
// =====================================================

export const dataQualityApi = {
  getTrends: (days = 30) =>
    fetchApi<ApiResponse<Array<{ date: string; score: number }>>>(`/data-hub/quality/trends?days=${days}`),

  getValidationResults: () =>
    fetchApi<ApiResponse<Array<{
      ruleId: string;
      name: string;
      description: string;
      status: 'passed' | 'failed' | 'warning';
      impact: string;
      affectedCount: number;
    }>>>('/data-hub/quality/validation'),

  getFieldCompleteness: () =>
    fetchApi<ApiResponse<Record<string, number>>>('/data-hub/quality/completeness'),

  getAnomalies: (limit = 10) =>
    fetchApi<ApiResponse<Array<{
      id: string;
      entityId: string;
      entityType: string;
      issue: string;
      severity: 'critical' | 'warning';
      detectedAt: string;
    }>>>(`/data-hub/quality/anomalies?limit=${limit}`),

  getDataProfiles: () =>
    fetchApi<ApiResponse<Array<{
      dataset: string;
      rowCount: number;
      completeness: number;
      lastUpdated: string;
    }>>>('/data-hub/quality/profiles'),
};

// =====================================================
// DATA LINEAGE API
// =====================================================

export const dataLineageApi = {
  getFlow: () =>
    fetchApi<ApiResponse<{
      nodes: Array<{ id: string; type: string; label: string; data?: any }>;
      edges: Array<{ source: string; target: string; label?: string }>;
    }>>('/data-hub/lineage/flow'),

  getAuditLog: (limit = 50) =>
    fetchApi<ApiResponse<Array<{
      id: string;
      entityType: string;
      entityId: string;
      action: string;
      sourceSystem?: string;
      targetSystem?: string;
      performedBy?: string;
      occurredAt: string;
      metadata?: any;
    }>>>(`/data-hub/lineage/audit?limit=${limit}`),
};

// =====================================================
// DATA INSIGHTS API
// =====================================================

export const dataInsightsApi = {
  getInsights: () =>
    fetchApi<ApiResponse<{
      insights: Array<{
        id: string;
        type: 'trend' | 'anomaly' | 'opportunity' | 'quality';
        severity: 'high' | 'medium' | 'low';
        title: string;
        description: string;
        confidence: number;
        recommendation: string;
        impact: string;
        timestamp: string;
      }>;
      predictions: Array<{
        metric: string;
        current: number;
        predicted7d: number;
        predicted30d: number;
        confidence: number;
        trend: 'up' | 'down' | 'stable';
      }>;
    }>>('/data-hub/insights'),
};

// =====================================================
// SYSTEM SETTINGS API
// =====================================================

export const systemSettingsApi = {
  getAll: () =>
    fetchApi<ApiResponse<Record<string, any>>>('/data-hub/settings'),

  update: (settings: Record<string, any>) =>
    fetchApi<ApiResponse<{ message: string }>>('/data-hub/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

export const systemHealthApi = {
  getHealth: () =>
    fetchApi<ApiResponse<{
      database: { status: string; uptime_percent: number };
      queue: { status: string; active_workers: number };
      storage: { status: string; used_bytes: number; total_bytes: number };
      api: { status: string; avg_latency_ms: number };
    }>>('/data-hub/system/health'),
};

