/**
 * Publications & Research API — Frontend client
 * Connects to /api/v1/publications and /api/v1/charts
 */
import { fetchApi } from './api';

// ============================================================
// TYPES
// ============================================================

export interface Publication {
  id: string;
  organization_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  type: string;
  product: string;
  edition: string;
  status: string;
  content_json: ContentBlock[];
  content_html: string | null;
  excerpt: string | null;
  key_findings: string[];
  cover_image_url: string | null;
  pdf_url: string | null;
  sectors: string[];
  topics: string[];
  regions: string[];
  author_id: string | null;
  author_name: string | null;
  author_title: string | null;
  reviewer_id: string | null;
  reading_time_minutes: number;
  word_count: number;
  ai_generated: boolean;
  ai_model: string | null;
  seo_title: string | null;
  seo_description: string | null;
  access_tier: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  scheduled_publish_at: string | null;
  charts?: PublicationChart[];
}

export interface ContentBlock {
  id: string;
  type: 'text' | 'heading' | 'chart' | 'callout' | 'quote' | 'table' | 'image';
  content: string;
  metadata?: Record<string, unknown>;
  aiGenerated?: boolean;
}

export interface PublicationChart {
  id: string;
  publication_id: string;
  position: number;
  endpoint: string;
  params: Record<string, unknown>;
  chart_type: string;
  component_name: string | null;
  title: string | null;
  ai_insight: string | null;
  snapshot_data: Record<string, unknown> | null;
  snapshot_at: string | null;
  live_enabled: boolean;
  created_at: string;
}

export interface IndexValue {
  id: string;
  index_type: string;
  region: string;
  period_start: string;
  period_end: string;
  value: number;
  change_mom: number | null;
  change_yoy: number | null;
  ai_commentary: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
}

export interface PublicationFilters {
  type?: string;
  product?: string;
  edition?: string;
  status?: string;
  sector?: string;
  topic?: string;
  region?: string;
  access_tier?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaxonomyCategory {
  value: string;
  label: string;
  description: string;
  path: string;
}

export interface TaxonomyType {
  value: string;
  label: string;
  description: string;
  category: 'insights' | 'press';
  website_path: string;
}

export interface Taxonomy {
  categories: TaxonomyCategory[];
  types: TaxonomyType[];
  sectors: Array<{ value: string; label: string }>;
  topics: Array<{ value: string; label: string }>;
  regions: Array<{ value: string; label: string }>;
  access_tiers: Array<{ value: string; label: string }>;
  statuses: Array<{ value: string; label: string }>;
}

export interface ChartCatalogItem {
  id: string;
  category: string;
  title: string;
  endpoint: string;
  chartType: string;
  component: string;
  description: string;
  params: Array<{ name: string; type: string; options?: string[] }>;
}

export interface AiResponse {
  text: string;
  model: string;
  tokensUsed?: number;
}

export interface AiDraftResponse {
  sections: Array<{ heading: string; content: string; aiGenerated: boolean }>;
  keyFindings: string[];
  excerpt: string;
}

export interface CmsAnalytics {
  total_publications: number;
  published: number;
  drafts: number;
  total_views: number;
  total_subscribers: number;
  publications_by_type: Array<{ type: string; count: number }>;
  publications_by_product?: Array<{ product: string; count: number }>;
}

// ============================================================
// PUBLICATIONS API
// ============================================================

export const publicationsApi = {
  // Public endpoints
  getPublished: (filters?: PublicationFilters) => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.product) params.set('product', filters.product);
    if (filters?.edition) params.set('edition', filters.edition);
    if (filters?.sector) params.set('sector', filters.sector);
    if (filters?.topic) params.set('topic', filters.topic);
    if (filters?.region) params.set('region', filters.region);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    return fetchApi<{ success: boolean; data: Publication[]; total: number; page: number; limit: number }>(
      `/publications/public?${params}`
    );
  },

  getBySlug: (slug: string) =>
    fetchApi<{ success: boolean; data: Publication }>(`/publications/public/${slug}`),

  getTaxonomy: () =>
    fetchApi<{ success: boolean; data: Taxonomy }>('/publications/taxonomy'),

  // Admin CRUD
  list: (filters?: PublicationFilters) => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.product) params.set('product', filters.product);
    if (filters?.edition) params.set('edition', filters.edition);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.sector) params.set('sector', filters.sector);
    if (filters?.topic) params.set('topic', filters.topic);
    if (filters?.region) params.set('region', filters.region);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    return fetchApi<{ success: boolean; data: Publication[]; total: number; page: number; limit: number }>(
      `/publications?${params}`
    );
  },

  getById: (id: string) =>
    fetchApi<{ success: boolean; data: Publication }>(`/publications/${id}`),

  create: (data: Partial<Publication>) =>
    fetchApi<{ success: boolean; data: Publication }>('/publications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Publication>) =>
    fetchApi<{ success: boolean; data: Publication }>(`/publications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  publish: (id: string) =>
    fetchApi<{ success: boolean; data: Publication }>(`/publications/${id}/publish`, {
      method: 'POST',
    }),

  archive: (id: string) =>
    fetchApi<{ success: boolean; data: Publication }>(`/publications/${id}/archive`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/publications/${id}`, {
      method: 'DELETE',
    }),

  getStats: (id: string) =>
    fetchApi<{ success: boolean; data: { views: number; unique_views: number; pdf_downloads: number; avg_time: number } }>(
      `/publications/${id}/stats`
    ),

  getCmsAnalytics: () =>
    fetchApi<{ success: boolean; data: CmsAnalytics }>('/publications/analytics'),
};

// ============================================================
// AI CONTENT API
// ============================================================

export const aiContentApi = {
  generateSection: (data: {
    sectionType: string;
    dataContext?: Record<string, unknown>;
    sector?: string;
    region?: string;
    customPrompt?: string;
  }) =>
    fetchApi<{ success: boolean; data: AiResponse }>('/publications/ai/generate-section', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateChartInsight: (data: {
    chartData: Record<string, unknown>;
    chartType: string;
    title: string;
    sector?: string;
    region?: string;
  }) =>
    fetchApi<{ success: boolean; data: AiResponse }>('/publications/ai/generate-insight', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateQuote: (data: {
    topic: string;
    dataPoints?: Record<string, unknown>;
    region?: string;
  }) =>
    fetchApi<{ success: boolean; data: AiResponse }>('/publications/ai/generate-quote', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateSummary: (data: {
    title: string;
    sections: Array<{ heading: string; content: string }>;
    publicationType?: string;
  }) =>
    fetchApi<{ success: boolean; data: AiResponse }>('/publications/ai/generate-summary', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateDraft: (data: {
    type: string;
    title: string;
    sectors?: string[];
    topics?: string[];
    regions?: string[];
    dataContext?: Record<string, unknown>;
  }) =>
    fetchApi<{ success: boolean; data: AiDraftResponse }>('/publications/ai/generate-draft', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateSeo: (data: { title: string; excerpt?: string }) =>
    fetchApi<{ success: boolean; data: { seoTitle: string; seoDescription: string } }>('/publications/ai/generate-seo', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ============================================================
// INDICES API
// ============================================================

export const indicesApi = {
  getAll: () =>
    fetchApi<{ success: boolean; data: IndexValue[] }>('/publications/indices'),

  getHistory: (type: string, region?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (limit) params.set('limit', String(limit));
    return fetchApi<{ success: boolean; data: IndexValue[] }>(`/publications/indices/${type}?${params}`);
  },

  getLatest: (type: string, region?: string) => {
    const params = region ? `?region=${region}` : '';
    return fetchApi<{ success: boolean; data: IndexValue }>(`/publications/indices/${type}/latest${params}`);
  },

  publish: (data: {
    index_type: string;
    region?: string;
    period_start: string;
    period_end: string;
    value: number;
    change_mom?: number;
    change_yoy?: number;
    ai_commentary?: string;
  }) =>
    fetchApi<{ success: boolean; data: IndexValue }>('/publications/indices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ============================================================
// CHARTS API
// ============================================================

export const chartsCatalogApi = {
  getCatalog: () =>
    fetchApi<{ success: boolean; data: { charts: ChartCatalogItem[]; categories: string[]; total: number } }>(
      '/charts/catalog'
    ),

  preview: (endpoint: string, params?: Record<string, unknown>) => {
    const searchParams = new URLSearchParams();
    searchParams.set('endpoint', endpoint);
    if (params) searchParams.set('params', JSON.stringify(params));
    return fetchApi<{ success: boolean; data: unknown; snapshotAt: string }>(
      `/charts/preview?${searchParams}`
    );
  },
};

// ============================================================
// NEWSLETTER API
// ============================================================

export const newsletterApi = {
  subscribe: (data: {
    email: string;
    name?: string;
    organization?: string;
    role?: string;
    segments?: string[];
  }) =>
    fetchApi<{ success: boolean; data: { id: string; email: string }; message: string }>(
      '/publications/newsletter/subscribe',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getSubscribers: (page = 1, limit = 50) =>
    fetchApi<{ success: boolean; data: unknown[]; total: number }>(
      `/publications/newsletter/subscribers?page=${page}&limit=${limit}`
    ),
};
