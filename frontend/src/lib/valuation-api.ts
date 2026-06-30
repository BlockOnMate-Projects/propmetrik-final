/**
 * PROPMETRIK Valuation API Client
 * 
 * Microservices Architecture:
 * - TypeScript Backend (4000): Valuations CRUD, floor plans, HBU analysis, overrides, reconciliation
 * - Python Backend (8001): Valuation method calculations (sales comparison, cost, income, etc.)
 * 
 * This client routes requests to the appropriate backend service.
 */

import { fetchApi } from '@/lib/api';
import { getSession } from 'next-auth/react';
import type { ValuationType, ValuationPurpose } from '@/types/valuation';

// ============================================================================
// BACKEND CONFIGURATION
// ============================================================================

// TypeScript backend for valuation CRUD and workflow services
// In production, use the /api proxy path (NEXT_PUBLIC_API_URL = '/api')
// which Next.js rewrites to INTERNAL_API_URL/api/v1/...
const TS_API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '/api')
  : `${(process.env.INTERNAL_API_URL || 'http://localhost:4000').replace(/\/api\/v1$/, '')}/api/v1`;
const TS_VALUATIONS_BASE = `${TS_API_BASE}/valuations`;

// Python backend for valuation method calculations only
// In production, use /ml-api proxy path; falls back to localhost for dev
const PYTHON_VALUATION_API = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_PYTHON_API_URL || '/ml-api')
  : (process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8001/api/v1');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateValuationRequest {
  property_id: string;
  valuation_type?: ValuationType;
  valuation_purpose?: ValuationPurpose;
  client_id?: string;
  methods?: string[];
  valuation_date?: string;
  force_refresh_comparables?: boolean;
  max_comparable_distance_km?: number;
  max_comparable_age_days?: number;
  min_comparables_required?: number;
  requested_by?: string;
  organization?: string;
}

export interface ValuationResult {
  id: string;
  property_id: string;
  estimated_value: number;
  value_currency: string;
  confidence_level: string;
  confidence_score: number;
  methods_used: Record<string, any>;
  primary_method: string;
  market_conditions: Record<string, any>;
  comparables_count: number;
  created_at: string;
  status: string;
  // Workflow tracking
  currentStep?: number;
  current_step?: number;
  lastModified?: string;
  methodResults?: Record<string, any>;
  methodWeights?: Record<string, number>;
  // Additional fields from full Valuation type
  reference_number?: string;
  valuation_type?: string;
  valuation_purpose?: string;
  methods_applied?: string[];
  property?: any;
  final_value_ghs?: number;
  valuation_date?: string;
  updated_at?: string;
  // Allow any additional properties for compatibility
  [key: string]: any;
}

export interface ValuationFilters {
  status?: string;
  property_type?: string;
  region?: string;
  date_from?: string;
  date_to?: string;
  min_value?: number;
  max_value?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    valuations: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

// ============================================================================
// API FETCH HELPERS
// ============================================================================

/**
 * Fetch helper for Python valuation service
 */
const fetchPythonApi = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${PYTHON_VALUATION_API}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Python API Error:', error);
    throw error;
  }
};

/**
 * Fetch helper for TypeScript backend services
 * Used for: Floor Plans, HBU Analysis, Overrides, Reconciliation, Sensitivity Analysis
 */
const fetchTypescriptApi = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${TS_VALUATIONS_BASE}${endpoint}`;

  // Get session token for authenticated requests
  const session = await getSession();
  const authHeaders: Record<string, string> = {};
  if ((session as any)?.accessToken) {
    authHeaders['Authorization'] = `Bearer ${(session as any).accessToken}`;
  }

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Properly extract error message from various response formats
      const errorMessage = typeof errorData === 'string' 
        ? errorData 
        : errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      // Include status code in error for proper handling
      const fullErrorMessage = `[${response.status}] ${errorMessage}`;
      // Only log non-404 errors (404s are often expected for new valuations)
      // Also suppress errors for land-value/calculate (expected for DRC/specialized properties)
      const isLandValueCalc = url.includes('land-value/calculate')
      if (response.status !== 404 && !isLandValueCalc) {
        console.error(`TypeScript API Error [${response.status}]:`, errorMessage);
      }
      throw new Error(fullErrorMessage);
    }

    return await response.json();
  } catch (error) {
    // Only log if it's not a 404-related or land-value error
    if (error instanceof Error && !error.message.includes('404') && !error.message.includes('not found') && !error.message.includes('Not Found') && !error.message.includes('land-value') && !error.message.includes('Land valuation')) {
      console.error('TypeScript API Error:', error.message);
    }
    throw error;
  }
};

/**
 * Valuations API - Routes to TypeScript backend for CRUD operations
 */
export const valuationsApi = {
  /**
   * Create a new property valuation
   */
  async create(data: CreateValuationRequest): Promise<{ data: ValuationResult; error?: string }> {
    try {
      const response = await fetchTypescriptApi('', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return {
        data: response.data || response
      };
    } catch (error: any) {
      return {
        data: {} as ValuationResult,
        error: error.message || 'Failed to create valuation'
      };
    }
  },

  /**
   * Update property data via valuation endpoint
   */
  async updateProperty(valuationId: string, data: any): Promise<{ data: any; success: boolean; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/property`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return {
        data: response.data || response,
        success: true
      };
    } catch (error: any) {
      return {
        data: {},
        success: false,
        error: error.message || 'Failed to update property'
      };
    }
  },

  /**
   * Get valuation by ID
   */
  async getById(id: string): Promise<{ data: ValuationResult; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${id}`);
      return {
        data: response.data || response
      };
    } catch (error: any) {
      return {
        data: {} as ValuationResult,
        error: error.message || 'Failed to fetch valuation'
      };
    }
  },

  /**
   * List valuations with pagination and filters
   * API returns: { success, data: ValuationResult[], meta: { total, limit, offset, count } }
   */
  async list(params?: {
    page?: number;
    limit?: number;
    status?: string;
    property_id?: string;
  }): Promise<{ success: boolean; data: ValuationResult[]; meta?: any }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.property_id) searchParams.set('property_id', params.property_id);

    const queryString = searchParams.toString();
    return fetchTypescriptApi(`${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Create test valuation (for development) - uses TypeScript backend
   */
  async createTest(): Promise<ApiResponse<ValuationResult>> {
    return fetchTypescriptApi('/test', {
      method: 'POST',
    });
  },

  /**
   * Get test data (for development)
   */
  async getTestData(): Promise<ApiResponse<any>> {
    return fetchTypescriptApi('/test-data');
  },

  /**
   * Get all valuations (legacy method for compatibility)
   */
  async getAll(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ data: ValuationResult[]; error?: string }> {
    try {
      // Convert frontend params to TypeScript API format
      const apiParams: any = {};
      if (params?.page) apiParams.page = params.page;
      if (params?.limit) apiParams.limit = params.limit;
      if (params?.status) apiParams.status = params.status;

      const response = await this.list(apiParams);

      // API returns { success, data: [...], meta } where data is the array directly
      // Handle both formats for compatibility
      const valuations = Array.isArray(response.data)
        ? response.data
        : ((response.data as any)?.valuations || []);

      return {
        data: valuations
      };
    } catch (error: any) {
      return {
        data: [],
        error: error.message || 'Failed to fetch valuations'
      };
    }
  },

  /**
   * Get valuation statistics (mock implementation)
   */
  async getStats(): Promise<{ data: any }> {
    try {
      // Get current valuations to calculate real stats
      const valuationsResponse = await this.getAll({ limit: 100 });
      const valuations = valuationsResponse.data || [];

      const stats = {
        total: valuations.length,
        completed: valuations.filter(v => v.status === 'completed').length,
        in_progress: valuations.filter(v => v.status === 'in_progress').length,
        pending: valuations.filter(v => v.status === 'pending').length,
        failed: valuations.filter(v => v.status === 'failed').length,
        avg_value: valuations.length > 0 ? valuations.reduce((sum, v) => sum + (v.estimated_value || 0), 0) / valuations.length : 0,
        total_value: valuations.reduce((sum, v) => sum + (v.estimated_value || 0), 0),
        byStatus: {
          draft: valuations.filter(v => v.status === 'draft').length,
          in_progress: valuations.filter(v => v.status === 'in_progress').length,
          pending_review: valuations.filter(v => v.status === 'pending').length,
          completed: valuations.filter(v => v.status === 'completed').length,
          all: valuations.length
        }
      };

      return { data: stats };
    } catch (error: any) {
      // Return empty stats structure on error
      return {
        data: {
          total: 0,
          completed: 0,
          in_progress: 0,
          pending: 0,
          failed: 0,
          avg_value: 0,
          total_value: 0,
          byStatus: {
            draft: 0,
            in_progress: 0,
            pending_review: 0,
            completed: 0,
            all: 0
          }
        }
      };
    }
  },

  /**
   * Update valuation
   */
  async update(id: string, data: any): Promise<{ data: ValuationResult; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return {
        data: response.data || response
      };
    } catch (error: any) {
      return {
        data: {} as ValuationResult,
        error: error.message || 'Failed to update valuation'
      };
    }
  },

  /**
   * Update valuation progress
   */
  async updateProgress(id: string, progressData: {
    currentStep?: number;
    status?: string;
    lastModified?: string;
  }): Promise<{ data: ValuationResult; error?: string }> {
    try {
      // For now, simulate a successful update
      // TODO: Implement progress update endpoint in Python service

      // Get current valuation
      const current = await this.getById(id);
      if (current.error) {
        return { data: current.data, error: current.error };
      }

      // Mock update - in real implementation, this would call the backend
      const updatedValuation = {
        ...current.data,
        currentStep: progressData.currentStep || current.data.currentStep || 1,
        status: progressData.status || current.data.status,
        lastModified: progressData.lastModified || new Date().toISOString(),
      };

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        data: updatedValuation as ValuationResult
      };
    } catch (error: any) {
      return {
        data: {} as ValuationResult,
        error: error.message || 'Failed to update progress'
      };
    }
  },

  /**
   * Create valuation with new property
   * The TypeScript backend creates the property inline with the valuation
   */
  async createWithNewProperty(data: any): Promise<{ data: ValuationResult }> {
    try {
      // Send property object directly to TypeScript backend
      // The backend handles creating the property and valuation together
      const response = await fetchTypescriptApi('', {
        method: 'POST',
        body: JSON.stringify({
          property: data.property,
          valuation_type: data.valuation_type || 'professional',
          valuation_purpose: data.valuation_purpose || 'sale',
          valuation_date: data.valuation_date || null,
          inspection_date: data.inspection_date || null,
          instruction_date: data.instruction_date || null,
          report_date: data.report_date || null,
          is_retrospective: data.is_retrospective || false,
          client_id: data.client_id || null,
          team_members: data.team_members || undefined,
        }),
      });

      return {
        data: response.data || response
      };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create valuation with new property');
    }
  },

  /**
   * Delete a valuation by ID
   */
  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await fetchTypescriptApi(`/${id}`, {
        method: 'DELETE',
      });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete valuation'
      };
    }
  },
};

// ============================================================================
// DESIGN INTENT API - LLM-Powered Floor Plan Generation
// Endpoints: POST/GET /:valuationId/floor-plans/design-intent
// ============================================================================

// Room program item from backend (matches LLM output)
export interface RoomProgram {
  room_id: string;
  room_type: string;
  room_name?: string;
  target_area_sqm: number;
  min_area_sqm: number;
  max_area_sqm?: number;
  importance: 'primary' | 'secondary' | 'ancillary';
  adjacency_requirements: string[];
  natural_light_required: boolean;
  ventilation_required: boolean;
  floor_number: number;
}

// Layout strategy from backend
export interface LayoutStrategy {
  template_id: string;
  style: 'colonial' | 'modern' | 'compound' | 'apartment' | 'bungalow' | 'split_level';
  circulation_type: 'central_corridor' | 'side_corridor' | 'open_flow' | 'gallery' | 'courtyard';
  primary_orientation?: string;
  entrance_position?: string;
  kitchen_style?: string;
}

// Full design intent from backend
export interface LLMDesignIntent {
  version: string;
  timestamp: string;
  model_id: string;
  request_id: string;
  input_features: Record<string, any>;
  layout_strategy: LayoutStrategy;
  room_program: RoomProgram[];
  assumptions: Array<{
    assumption_id: string;
    category: string;
    assumption: string;
    default_value: string | number;
    unit?: string;
    confidence: number;
    source: string;
    overridable: boolean;
    applied: boolean;
  }>;
  alternatives?: any[];
  generation_time_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface DesignIntentResponse {
  success: boolean;
  data?: {
    designIntent: LLMDesignIntent;
    record: {
      id: string;
      valuation_id: string;
      status: string;
      created_at: string;
    };
    assumptions?: Array<{
      id: string;
      category: string;
      assumption: string;
      default_value: any;
      confidence: number;
      source: string;
      requires_user_confirmation: boolean;
    }>;
    metrics?: {
      providerUsed: string;
      inputTokens: number;
      outputTokens: number;
      totalCost?: number;
    };
  };
  error?: string;
  validationErrors?: string[];
}

export const designIntentApi = {
  /**
   * Generate an LLM-powered floor plan design intent from property features
   * The backend will automatically fetch property features from the valuation
   */
  async generate(
    valuationId: string,
    options?: {
      generateAlternatives?: boolean;
      numAlternatives?: number;
      preferences?: {
        preferred_style?: string;
        open_plan_kitchen?: boolean;
        master_ensuite?: boolean;
        separate_dining?: boolean;
        garage_spaces?: number;
        outdoor_living?: boolean;
        home_office?: boolean;
        additional_requirements?: string[];
      };
    }
  ): Promise<DesignIntentResponse> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/floor-plans/design-intent`, {
        method: 'POST',
        body: JSON.stringify({
          preferences: options?.preferences,
          generateAlternatives: options?.generateAlternatives ?? false,
          numAlternatives: options?.numAlternatives ?? 2,
        }),
      });
      return response;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Get existing design intents for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: any[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/floor-plans/design-intent`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Convert design intent room_program to Fabric.js canvas JSON
   * This creates a visual floor plan from the LLM's room layout
   */
  convertToCanvasJson(designIntent: DesignIntentResponse['data']): string {
    if (!designIntent?.designIntent?.room_program || !Array.isArray(designIntent.designIntent.room_program)) {
      return JSON.stringify({ version: '5.3.0', objects: [] });
    }

    const PIXELS_PER_METER = 100;
    const ROOM_COLORS: Record<string, string> = {
      bedroom: 'rgba(147, 197, 253, 0.4)',
      master_bedroom: 'rgba(99, 102, 241, 0.4)',
      bathroom: 'rgba(167, 243, 208, 0.4)',
      master_bathroom: 'rgba(52, 211, 153, 0.4)',
      kitchen: 'rgba(253, 224, 71, 0.4)',
      living_room: 'rgba(252, 211, 77, 0.4)',
      dining_room: 'rgba(251, 191, 36, 0.4)',
      storage: 'rgba(209, 213, 219, 0.4)',
      corridor: 'rgba(229, 231, 235, 0.4)',
      porch: 'rgba(196, 181, 253, 0.4)',
      garage: 'rgba(156, 163, 175, 0.4)',
      laundry: 'rgba(147, 197, 253, 0.4)',
      office: 'rgba(254, 202, 202, 0.4)',
      store: 'rgba(209, 213, 219, 0.4)',
    };

    const objects: any[] = [];
    const rooms = designIntent.designIntent.room_program;

    // Simple grid layout - arrange rooms in a grid pattern
    const GRID_PADDING = 20;
    const CANVAS_WIDTH = 1000;
    let currentX = GRID_PADDING;
    let currentY = GRID_PADDING;
    let rowHeight = 0;

    rooms.forEach((room, index) => {
      // Calculate width/height from target_area_sqm (assume roughly square rooms)
      const areaSqm = room.target_area_sqm || 12;
      const roomWidth = Math.sqrt(areaSqm) * 1.2; // slightly wider than square
      const roomHeight = areaSqm / roomWidth;
      const width = roomWidth * PIXELS_PER_METER;
      const height = roomHeight * PIXELS_PER_METER;

      // Move to next row if room doesn't fit
      if (currentX + width > CANVAS_WIDTH - GRID_PADDING) {
        currentX = GRID_PADDING;
        currentY += rowHeight + GRID_PADDING;
        rowHeight = 0;
      }

      // Create room polygon (rectangle)
      const roomId = `room_${Date.now()}_${index}`;
      const roomColor = ROOM_COLORS[room.room_type] || 'rgba(200, 200, 200, 0.4)';

      // Room rectangle
      objects.push({
        type: 'polygon',
        version: '5.3.0',
        originX: 'left',
        originY: 'top',
        left: currentX,
        top: currentY,
        width,
        height,
        fill: roomColor,
        stroke: '#1e40af',
        strokeWidth: 2,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        flipX: false,
        flipY: false,
        skewX: 0,
        skewY: 0,
        opacity: 1,
        visible: true,
        backgroundColor: '',
        fillRule: 'nonzero',
        paintFirst: 'fill',
        globalCompositeOperation: 'source-over',
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
        roomId,
        roomType: room.room_type,
        roomName: room.room_name || room.room_type,
        isRoom: true,
        selectable: true,
        hasControls: true,
      });

      // Room label - use room_name and target_area_sqm from room_program
      const displayName = room.room_name || room.room_type;
      const displayArea = room.target_area_sqm || areaSqm;
      objects.push({
        type: 'text',
        version: '5.3.0',
        originX: 'center',
        originY: 'center',
        left: currentX + width / 2,
        top: currentY + height / 2,
        width: 100,
        height: 30,
        fill: '#1f2937',
        stroke: null,
        strokeWidth: 1,
        fontSize: 12,
        fontWeight: 'normal',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        text: `${displayName}\n${displayArea.toFixed(1)}m²`,
        selectable: false,
        evented: false,
        roomId,
      });

      // Update position for next room
      currentX += width + GRID_PADDING;
      rowHeight = Math.max(rowHeight, height);
    });

    // Build rooms array for FloorPlanBuilder state
    const roomsForBuilder = rooms.map((room, index) => {
      const areaSqm = room.target_area_sqm || 12;
      const roomWidth = Math.sqrt(areaSqm) * 1.2;
      const roomHeight = areaSqm / roomWidth;
      return {
        id: `room_${Date.now()}_${index}`,
        type: room.room_type,
        label: room.room_name || room.room_type,
        area: areaSqm,
        width: roomWidth,
        height: roomHeight,
      };
    });

    // Return the full floor plan structure expected by FloorPlanBuilder
    // FloorPlanBuilder expects: { canvasData: {...}, rooms: [...], scale: number, gridSize: number }
    return JSON.stringify({
      canvasData: {
        version: '5.3.0',
        objects,
      },
      rooms: roomsForBuilder,
      scale: PIXELS_PER_METER,
      gridSize: 10,
    });
  },
};

// ============================================================================
// FLOOR PLAN API - Routes to TypeScript backend
// Endpoints: POST/GET /:id/floor-plans, PUT/DELETE /floor-plans/:planId
// ============================================================================

export interface FloorPlanData {
  id?: string;
  valuation_id: string;
  canvas_json: string;
  scale_pixels_per_meter?: number;
  floor_number?: number;
  floor_label?: string;
  calibration_reference?: string;
  total_area_sqm?: number;
  rooms?: any[]; // Uses FloorPlanRoom from @/types/valuation
  is_locked?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FloorPlanSummary {
  total_plans: number;
  total_area_sqm: number;
  total_rooms: number;
  rooms_by_type: Record<string, number>;
  validation_status: 'valid' | 'warning' | 'error';
  validation_messages: string[];
}

export const floorPlanApi = {
  /**
   * Create a new floor plan for a valuation
   */
  async create(valuationId: string, data: Omit<FloorPlanData, 'valuation_id'>): Promise<{ success: boolean; data: FloorPlanData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/floor-plans`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as FloorPlanData, error: error.message };
    }
  },

  /**
   * Get all floor plans for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: FloorPlanData[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/floor-plans`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Alias for getByValuation
   */
  async getAll(valuationId: string): Promise<{ success: boolean; data: FloorPlanData[]; error?: string }> {
    return this.getByValuation(valuationId);
  },

  /**
   * Get floor plan summary with room counts and validation
   */
  async getSummary(valuationId: string): Promise<{ success: boolean; data: FloorPlanSummary; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/floor-plans/summary`);
      return response;
    } catch (error: any) {
      return {
        success: false,
        data: {
          total_plans: 0,
          total_area_sqm: 0,
          total_rooms: 0,
          rooms_by_type: {},
          validation_status: 'error',
          validation_messages: [error.message]
        },
        error: error.message
      };
    }
  },

  /**
   * Update an existing floor plan
   */
  async update(planId: string, data: Partial<FloorPlanData>): Promise<{ success: boolean; data: FloorPlanData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/floor-plans/${planId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as FloorPlanData, error: error.message };
    }
  },

  /**
   * Lock a floor plan (prevents further edits)
   */
  async lock(planId: string): Promise<{ success: boolean; data: FloorPlanData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/floor-plans/${planId}/lock`, {
        method: 'POST',
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as FloorPlanData, error: error.message };
    }
  },

  /**
   * Delete a floor plan
   */
  async delete(planId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/floor-plans/${planId}`, {
        method: 'DELETE',
      });
      return response;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Upload floor plan image (PNG) for report appendices
   */
  async uploadImage(planId: string, imageDataUrl: string, width?: number, height?: number): Promise<{ success: boolean; data: FloorPlanData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/floor-plans/${planId}/image`, {
        method: 'PUT',
        body: JSON.stringify({ imageDataUrl, width, height }),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as FloorPlanData, error: error.message };
    }
  },

  /**
   * Get presigned URL for floor plan image
   */
  async getImageUrl(planId: string): Promise<{ success: boolean; data: { imageUrl: string }; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/floor-plans/${planId}/image`);
      return response;
    } catch (error: any) {
      return { success: false, data: { imageUrl: '' }, error: error.message };
    }
  },
};

// ============================================================================
// HBU (Highest & Best Use) ANALYSIS API - Routes to TypeScript backend
// Endpoints: GET /:id/hbu, PUT /hbu/:hbuId/legal|physical|financial|productivity
// ============================================================================

export interface HBUAnalysis {
  id: string;
  valuation_id: string;
  legal_analysis?: any;
  legal_test_passed?: boolean;
  physical_analysis?: any;
  physical_test_passed?: boolean;
  financial_analysis?: any;
  financial_test_passed?: boolean;
  productivity_analysis?: any;
  productivity_test_passed?: boolean;
  hbu_conclusion?: string;
  hbu_justification?: string;
  recommended_methods?: string[];
  method_justifications?: Record<string, string>;
  hbu_as_vacant?: string;
  hbu_as_improved?: string;
  is_completed?: boolean;
  completed_at?: string;
  completed_by?: string;
  created_at?: string;
  updated_at?: string;
}

export const hbuApi = {
  /**
   * Get or create HBU analysis for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: HBUAnalysis | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/hbu`);
      return response;
    } catch (error: any) {
      // 404 means no HBU analysis yet - not an error for new valuations
      if (error.message?.includes('404') || error.message?.includes('Not Found') || error.message?.includes('not found')) {
        return { success: true, data: null };
      }
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Update legal analysis
   */
  async updateLegal(hbuId: string, data: { legal_analysis: any; legal_test_passed: boolean }): Promise<{ success: boolean; data: HBUAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/hbu/${hbuId}/legal`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as HBUAnalysis, error: error.message };
    }
  },

  /**
   * Update physical analysis
   */
  async updatePhysical(hbuId: string, data: { physical_analysis: any; physical_test_passed: boolean }): Promise<{ success: boolean; data: HBUAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/hbu/${hbuId}/physical`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as HBUAnalysis, error: error.message };
    }
  },

  /**
   * Update financial analysis
   */
  async updateFinancial(hbuId: string, data: { financial_analysis: any; financial_test_passed: boolean }): Promise<{ success: boolean; data: HBUAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/hbu/${hbuId}/financial`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as HBUAnalysis, error: error.message };
    }
  },

  /**
   * Update productivity analysis
   */
  async updateProductivity(hbuId: string, data: { productivity_analysis: any; productivity_test_passed: boolean }): Promise<{ success: boolean; data: HBUAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/hbu/${hbuId}/productivity`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as HBUAnalysis, error: error.message };
    }
  },

  /**
   * Finalize HBU analysis with conclusion
   */
  async finalize(hbuId: string, data: {
    hbu_conclusion: string;
    hbu_justification: string;
    recommended_methods?: string[];
    method_justifications?: Record<string, string>;
    hbu_as_vacant?: string;
    hbu_as_improved?: string;
  }): Promise<{ success: boolean; data: HBUAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/hbu/${hbuId}/finalize`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as HBUAnalysis, error: error.message };
    }
  },

  /**
   * Create or update HBU analysis
   */
  async create(data: {
    valuationId: string;
    legallyPermissible: boolean;
    physicallyPossible: boolean;
    financiallyFeasible: boolean;
    maximallyProductive: boolean;
    recommendedUse?: string;
    analysisNotes?: string;
    tests?: any[];
    scenarios?: any[];
  }): Promise<{ success: boolean; data: any; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${data.valuationId}/hbu`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Legacy method - kept for backward compatibility  
   */
  async update(hbuId: string, data: any): Promise<{ data: any }> {
    // Route to appropriate update method based on data
    return { data: { id: hbuId, ...data } };
  },
};

// ============================================================================
// RECONCILIATION API - Routes to TypeScript backend
// Endpoints: GET/POST /:id/reconciliation, PUT/POST /reconciliation/:id/*
// ============================================================================

export interface MethodResult {
  method: string;
  value: number;
  confidence_score: number;
  data_quality_score: number;
  weight?: number;
}

export interface ReconciliationData {
  id: string;
  valuation_id: string;
  method_results: Record<string, MethodResult>;
  weighting_method: 'equal' | 'confidence' | 'quality' | 'manual' | 'hybrid';
  weights: Record<string, number>;
  weight_justifications?: Record<string, string>;
  weighted_average_value: number;
  final_value_selection: 'weighted_average' | 'primary_method' | 'manual';
  final_market_value?: number;
  value_per_sqm?: number;
  reconciliation_narrative?: string;
  special_assumptions?: string[];
  departures_from_standards?: string[];
  is_finalized: boolean;
  finalized_at?: string;
  finalized_by?: string;
  is_approved?: boolean;
  approved_at?: string;
  approved_by?: string;
  is_locked?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const reconciliationApi = {
  /**
   * Get reconciliation for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: ReconciliationData | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/reconciliation`);
      // Backend now returns { success: true, data: null } for new valuations
      return { success: true, data: response.data || null };
    } catch (error: any) {
      // Handle any remaining edge cases (network errors, etc.)
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('404') || errorMsg.includes('not found') || errorMsg.includes('reconciliation')) {
        return { success: true, data: null };
      }
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Create reconciliation with method results
   */
  async create(valuationId: string, data: {
    method_results: Record<string, MethodResult>;
    weighting_method?: 'equal' | 'confidence' | 'quality' | 'manual' | 'hybrid';
  }): Promise<{ success: boolean; data: ReconciliationData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/reconciliation`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ReconciliationData, error: error.message };
    }
  },

  /**
   * Set manual method weights
   */
  async setWeights(reconciliationId: string, data: {
    weights: Record<string, number>;
    justifications?: Record<string, string>;
  }): Promise<{ success: boolean; data: ReconciliationData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/reconciliation/${reconciliationId}/weights`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ReconciliationData, error: error.message };
    }
  },

  /**
   * Finalize reconciliation with narrative and final value
   */
  async finalize(reconciliationId: string, data: {
    final_value_selection?: 'weighted_average' | 'primary_method' | 'manual';
    final_market_value?: number;
    reconciliation_narrative: string;
    special_assumptions?: string[];
    departures_from_standards?: string[];
    building_area_sqm?: number;
  }): Promise<{ success: boolean; data: ReconciliationData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/reconciliation/${reconciliationId}/finalize`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ReconciliationData, error: error.message };
    }
  },

  /**
   * Approve reconciliation (reviewer)
   */
  async approve(reconciliationId: string, notes?: string): Promise<{ success: boolean; data: ReconciliationData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/reconciliation/${reconciliationId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ReconciliationData, error: error.message };
    }
  },

  /**
   * Lock reconciliation (final)
   */
  async lock(reconciliationId: string): Promise<{ success: boolean; data: ReconciliationData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/reconciliation/${reconciliationId}/lock`, {
        method: 'POST',
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ReconciliationData, error: error.message };
    }
  },

  /**
   * Get narrative template
   */
  async getNarrativeTemplate(reconciliationId: string): Promise<{ success: boolean; data: { template: string }; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/reconciliation/${reconciliationId}/narrative-template`);
      return response;
    } catch (error: any) {
      return { success: false, data: { template: '' }, error: error.message };
    }
  },

  /**
   * Legacy method - kept for backward compatibility
   */
  async update(reconId: string, data: any): Promise<{ data: any }> {
    return { data: { id: reconId, ...data } };
  },
};

// ============================================================================
// SENSITIVITY ANALYSIS API - Routes to TypeScript backend
// Endpoints: GET /:id/sensitivity, POST /:id/sensitivity/cap-rate|tornado|monte-carlo
// ============================================================================

export interface SensitivityAnalysis {
  id: string;
  valuation_id: string;
  analysis_type: 'cap_rate' | 'tornado' | 'monte_carlo';
  base_value: number;
  scenarios: SensitivityScenario[];
  variance_analysis: any;
  created_at?: string;
}

export interface SensitivityScenario {
  name: string;
  value: number;
  change_percent: number;
  impact_on_value: number;
}

export const sensitivityApi = {
  /**
   * Get all sensitivity analyses for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: SensitivityAnalysis[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sensitivity`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Run cap rate sensitivity analysis
   */
  async analyzeCapRate(valuationId: string, data: {
    noi: number;
    base_cap_rate: number;
  }): Promise<{ success: boolean; data: SensitivityAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sensitivity/cap-rate`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as SensitivityAnalysis, error: error.message };
    }
  },

  /**
   * Run tornado diagram analysis for income approach
   */
  async analyzeTornado(valuationId: string, data: {
    gross_income: number;
    vacancy_rate: number;
    operating_expenses: number;
    cap_rate: number;
  }): Promise<{ success: boolean; data: SensitivityAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sensitivity/tornado`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as SensitivityAnalysis, error: error.message };
    }
  },

  /**
   * Run Monte Carlo simulation for residual method
   */
  async analyzeMonteCarlo(valuationId: string, data: {
    gdv: number;
    construction_cost: number;
    developer_profit_rate: number;
    finance_cost?: number;
    iterations?: number;
  }): Promise<{ success: boolean; data: SensitivityAnalysis; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sensitivity/monte-carlo`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as SensitivityAnalysis, error: error.message };
    }
  },

  /**
   * Legacy method - kept for backward compatibility
   */
  async create(data: any): Promise<{ data: any }> {
    return { data };
  },
};

// ============================================================================
// CAP RATE API - Market cap rate from RICS-compliant methodology
// Endpoints: GET /cap-rate/:region/:propertyType, GET /cap-rate/benchmarks
// ============================================================================

export const capRateApi = {
  /**
   * Get market cap rate for region/property type using RICS hierarchy:
   * Market Extraction > Partner Data > Listings > Survey > Defaults
   */
  async getMarketCapRate(region: string, propertyType: string): Promise<{
    success: boolean;
    data: {
      capRate: number;
      range: { low: number; high: number };
      confidence: string;
      methodology: string;
      ricsCategory: string;
      sampleSize: number;
      source?: string;
    };
    error?: string;
  }> {
    try {
      const response = await fetchTypescriptApi(`/cap-rate/${region}/${propertyType}`);
      return response;
    } catch (error: any) {
      return { success: false, data: { capRate: 0, range: { low: 0, high: 0 }, confidence: 'insufficient', methodology: 'none', ricsCategory: 'C', sampleSize: 0 }, error: error.message };
    }
  },
};

// ============================================================================
// OVERRIDE TRACKING API - Routes to TypeScript backend
// Endpoints: GET/POST /:id/overrides, POST /overrides/:id/approve|reject
// ============================================================================

export interface OverrideRecord {
  id: string;
  valuation_id: string;
  category: string;
  field_path: string;
  field_label: string;
  system_default_value: any;
  user_override_value: any;
  value_unit?: string;
  reason: string;
  supporting_evidence?: string;
  overridden_by: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
  created_at?: string;
}

export interface OverrideSummary {
  total_overrides: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  by_category: Record<string, number>;
  disclaimers: string[];
}

export const overridesApi = {
  /**
   * Get all overrides for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: OverrideRecord[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/overrides`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Get override summary with disclaimers
   */
  async getSummary(valuationId: string): Promise<{ success: boolean; data: OverrideSummary; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/overrides/summary`);
      return response;
    } catch (error: any) {
      return {
        success: false,
        data: { total_overrides: 0, pending_count: 0, approved_count: 0, rejected_count: 0, by_category: {}, disclaimers: [] },
        error: error.message
      };
    }
  },

  /**
   * Record a user override
   */
  async create(valuationId: string, data: {
    category: string;
    field_path: string;
    field_label: string;
    system_default_value: any;
    user_override_value: any;
    value_unit?: string;
    reason: string;
    supporting_evidence?: string;
  }): Promise<{ success: boolean; data: OverrideRecord; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/overrides`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as OverrideRecord, error: error.message };
    }
  },

  /**
   * Approve an override
   */
  async approve(overrideId: string, notes?: string): Promise<{ success: boolean; data: OverrideRecord; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/overrides/${overrideId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approval_notes: notes }),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as OverrideRecord, error: error.message };
    }
  },

  /**
   * Reject an override
   */
  async reject(overrideId: string, notes?: string): Promise<{ success: boolean; data: OverrideRecord; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/overrides/${overrideId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ approval_notes: notes }),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as OverrideRecord, error: error.message };
    }
  },
};

// ============================================================================
// COMPARABLE BASKET API - Routes to TypeScript backend
// Endpoints: GET/POST /:id/baskets, GET/POST /baskets/:basketId/*
// ============================================================================

export interface ComparableBasket {
  id: string;
  valuation_id: string;
  basket_name: string;
  is_primary: boolean;
  search_criteria: any;
  comparables: ComparableProperty[];
  statistics?: BasketStatistics;
  created_at?: string;
}

export interface ComparableProperty {
  id: string;
  property_id: string;
  property_details: any;
  similarity_score: number;
  weight: number;
  adjustments: Record<string, number>;
  adjusted_value: number;
  is_selected: boolean;
}

export interface BasketStatistics {
  count: number;
  avg_value: number;
  median_value: number;
  min_value: number;
  max_value: number;
  std_dev: number;
  avg_similarity: number;
}

export const comparableBasketApi = {
  /**
   * Get all comparable baskets for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: ComparableBasket[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/baskets`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Create a new comparable basket
   */
  async create(valuationId: string, data: {
    basket_name: string;
    is_primary?: boolean;
    search_criteria?: any;
  }): Promise<{ success: boolean; data: ComparableBasket; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/baskets`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ComparableBasket, error: error.message };
    }
  },

  /**
   * Get comparables in a basket
   */
  async getComparables(basketId: string): Promise<{ success: boolean; data: ComparableProperty[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/baskets/${basketId}/comparables`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Add comparable to basket
   */
  async addComparable(basketId: string, data: {
    property_id: string;
    similarity_score?: number;
    weight?: number;
  }): Promise<{ success: boolean; data: ComparableProperty; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/baskets/${basketId}/comparables`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ComparableProperty, error: error.message };
    }
  },

  /**
   * Clear all comparables from a basket
   */
  async clearComparables(basketId: string): Promise<{ success: boolean; deleted?: number; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/baskets/${basketId}/comparables`, {
        method: 'DELETE',
      });
      return response;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Update comparable adjustments
   */
  async updateComparable(comparableId: string, data: {
    adjustments?: Record<string, number>;
    weight?: number;
    is_selected?: boolean;
  }): Promise<{ success: boolean; data: ComparableProperty; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/comparables/${comparableId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ComparableProperty, error: error.message };
    }
  },

  /**
   * Get basket statistics
   */
  async getStatistics(basketId: string): Promise<{ success: boolean; data: BasketStatistics; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/baskets/${basketId}/statistics`);
      return response;
    } catch (error: any) {
      return {
        success: false,
        data: { count: 0, avg_value: 0, median_value: 0, min_value: 0, max_value: 0, std_dev: 0, avg_similarity: 0 },
        error: error.message
      };
    }
  },

  /**
   * Normalize weights in basket to sum to 100%
   */
  async normalizeWeights(basketId: string): Promise<{ success: boolean; data: ComparableBasket; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/baskets/${basketId}/normalize-weights`, {
        method: 'POST',
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as ComparableBasket, error: error.message };
    }
  },
};

// ============================================================================
// PROPERTY API - Routes to Python service for property data
// ============================================================================

export interface PropertyData {
  id: string;
  address: string;
  region: string;
  property_type: string;
  bedrooms?: number;
  bathrooms?: number;
  built_area_sqm?: number;
  land_area_sqm?: number;
  year_built?: number;
  condition?: string;
}

export const propertiesApi = {
  async create(propertyData: any): Promise<{ data: any; error?: string }> {
    try {
      // Create property via TypeScript backend's public properties endpoint
      const response = await fetch(`${TS_API_BASE}/public/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address_street: propertyData.address_street || propertyData.address,
          address_city: propertyData.address_city || propertyData.city,
          region: propertyData.region,
          property_type: propertyData.property_type,
          digital_address: propertyData.digital_address,
          land_area_sqm: propertyData.land_area_sqm,
          bedrooms: propertyData.bedrooms,
          bathrooms: propertyData.bathrooms,
          year_built: propertyData.year_built
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { data: data.data || data };
    } catch (error: any) {
      return {
        data: null,
        error: error.message || 'Failed to create property'
      };
    }
  },
  /**
   * Get property by ID
   */
  async getById(id: string): Promise<ApiResponse<PropertyData>> {
    const response = await fetch(`${TS_API_BASE}/public/properties/${id}/enriched`);
    return response.json();
  },

  /**
   * List properties with pagination and filters
   */
  async list(params?: {
    page?: number;
    limit?: number;
    region?: string;
    property_type?: string;
  }): Promise<ApiResponse<{
    properties: PropertyData[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('offset', ((params.page - 1) * (params?.limit || 24)).toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const queryString = searchParams.toString();
    const response = await fetch(`${TS_API_BASE}/public/properties${queryString ? `?${queryString}` : ''}`);
    return response.json();
  },

  /**
   * Update property by ID with comprehensive property data
   */
  async update(id: string, propertyData: any): Promise<{ data: any; error?: string }> {
    try {
      // Update property via TypeScript backend's public properties endpoint
      const response = await fetch(`${TS_API_BASE}/public/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { data: data.data || data };
    } catch (error: any) {
      return {
        data: null,
        error: error.message || 'Failed to update property'
      };
    }
  },
};

// ============================================================================
// ECONOMIC DATA API - Routes to TypeScript backend
// Exchange rates, inflation, and economic indicators for RICS/GhIS compliance
// ============================================================================

export interface ExchangeRateData {
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string | Date;
  source: string;
  requested_date?: string;
  is_retrospective?: boolean;
  rics_compliant?: boolean;
}

export const economicApi = {
  /**
   * Get current exchange rate for a currency pair
   */
  async getCurrentExchangeRate(currency: string = 'USD', toCurrency: string = 'GHS'): Promise<ApiResponse<ExchangeRateData>> {
    const queryParams = toCurrency !== 'GHS' ? `?to=${toCurrency}` : '';
    return fetchApi(`/data-hub/economic/exchange-rate/${currency}${queryParams}`);
  },

  /**
   * Get historical exchange rate for a specific date (RICS VPS 3 compliant)
   * 
   * This is critical for retrospective valuations where the exchange rate
   * must reflect market conditions as at the effective valuation date.
   * 
   * @param currency - Source currency (e.g., 'USD')
   * @param date - Valuation effective date (YYYY-MM-DD format)
   * @param toCurrency - Target currency (default: 'GHS')
   * @returns Exchange rate as of the specified date
   */
  async getHistoricalExchangeRate(
    currency: string = 'USD',
    date: string,
    toCurrency: string = 'GHS'
  ): Promise<ApiResponse<ExchangeRateData & { metadata?: { note: string; source_priority: string[] } }>> {
    const queryParams = new URLSearchParams({ date });
    if (toCurrency !== 'GHS') {
      queryParams.set('to', toCurrency);
    }
    return fetchApi(`/data-hub/economic/exchange-rate/${currency}/historical?${queryParams.toString()}`);
  },

  /**
   * Get exchange rate for a valuation date (convenience wrapper)
   * Automatically chooses current or historical based on date
   */
  async getExchangeRateForValuation(
    currency: string = 'USD',
    valuationDate?: string,
    toCurrency: string = 'GHS'
  ): Promise<ApiResponse<ExchangeRateData>> {
    if (!valuationDate) {
      return this.getCurrentExchangeRate(currency, toCurrency);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const valDate = new Date(valuationDate);
    valDate.setHours(0, 0, 0, 0);
    
    // If valuation date is today or future, use current rate
    if (valDate >= today) {
      return this.getCurrentExchangeRate(currency, toCurrency);
    }
    
    // Otherwise, fetch historical rate
    return this.getHistoricalExchangeRate(currency, valuationDate, toCurrency);
  },

  /**
   * Convert currency amount to GHS
   */
  async convertToGHS(amount: number, fromCurrency: string): Promise<ApiResponse<{
    original_amount: number;
    from_currency: string;
    to_currency: string;
    converted_amount: number;
  }>> {
    return fetchApi('/data-hub/economic/convert', {
      method: 'POST',
      body: JSON.stringify({ amount, from_currency: fromCurrency }),
    });
  },

  /**
   * Get latest economic snapshot (inflation, rates, etc.)
   */
  async getEconomicSnapshot(): Promise<ApiResponse<{
    date: string;
    inflation_rate: number | null;
    interest_rate_policy: number | null;
    exchange_rate_usd: number | null;
    gdp_growth: number | null;
  }>> {
    return fetchApi('/data-hub/economic/snapshot');
  },
};

// ============================================================================
// MARKET DATA API - Routes to TypeScript backend
// ============================================================================

export const marketApi = {
  /**
   * Get market conditions for a region
   */
  async getMarketConditions(region: string): Promise<ApiResponse<{
    region: string;
    conditions: Record<string, any>;
    last_updated: string;
  }>> {
    return fetchTypescriptApi(`/market/${region}`);
  },

  /**
   * Get market conditions for a region and property type (alias for getMarketConditions)
   */
  async getConditions(region: string, propertyType?: string): Promise<{ success: boolean; data: any; error?: string }> {
    try {
      const queryParams = propertyType ? `?property_type=${propertyType}` : '';
      const response = await fetchTypescriptApi(`/market/${region}${queryParams}`);
      return { success: true, data: response.data || response };
    } catch (error: any) {
      // Return error - do not use mock data; Data Hub should have real data
      console.error('Failed to fetch market conditions:', error);
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to fetch market conditions from Data Hub',
      };
    }
  },

  /**
   * Get market indices for a region
   */
  async getMarketIndices(region: string): Promise<{ success: boolean; data: any; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/market/${region}/indices`);
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },
};

// Alias for backward compatibility
export const marketDataApi = marketApi;

// ============================================================================
// COST APPROACH API - Routes to TypeScript backend
// ============================================================================

export interface CostApproachData {
  id?: string;
  valuation_id: string;
  land_value: number;
  replacement_cost_new: number;
  physical_depreciation: number;
  functional_obsolescence: number;
  external_obsolescence: number;
  total_depreciation: number;
  depreciated_value: number;
  indicated_value: number;
  effective_age: number;
  remaining_life: number;
  cost_source: string;
  calculations: any;
}

export const costApproachApi = {
  /**
   * Get cost approach data for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: CostApproachData | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/cost-approach`);
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Save/update cost approach data
   */
  async save(valuationId: string, data: Partial<CostApproachData>): Promise<{ success: boolean; data: CostApproachData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/cost-approach`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as CostApproachData, error: error.message };
    }
  },
};

// ============================================================================
// PYTHON VALUATION METHODS API - Routes to Python RICS Valuation Engine
// All calculations should be performed by the Python service for consistency
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
  quality_tier?: string;
  amenities?: string[];
  [key: string]: any; // Allow additional property fields
}

/**
 * Common response structure from Python valuation methods
 */
export interface PythonMethodResponse {
  success: boolean;
  method: string;
  estimated_value: number;
  confidence_score: number;
  confidence_level: 'low' | 'medium' | 'high';
  value_range: {
    low: number;
    high: number;
  };
  details: Record<string, any>;
  assumptions: string[];
  limitations: string[];
  calculation_time_ms: number;
}

/**
 * Options for Profits Method calculation
 */
export interface ProfitsMethodOptions {
  unit_count?: number;
  revenue_per_unit?: number;
  occupancy_rate?: number;
  cap_rate?: number;
  operating_cost_overrides?: Record<string, number>;
  trading_property_type?: string;
}

/**
 * Options for Cost Approach calculation
 */
export interface CostApproachOptions {
  land_value_per_sqm?: number;
  construction_cost_per_sqm?: number;
  hard_costs?: number;                     // component-breakdown override (else rate × area)
  soft_costs_percent?: number;             // % of hard costs (design/permits/supervision)
  siteworks?: number;                      // absolute ₵ (drainage/landscaping/utilities)
  entrepreneurial_profit_percent?: number; // % of construction cost (developer margin)
  depreciation_overrides?: {
    physical?: number;
    functional?: number;
    external?: number;
  };
}

/**
 * Options for Income Approach calculation
 */
export interface IncomeApproachOptions {
  monthly_rent?: number;
  parking_income?: number;            // monthly
  other_income?: number;              // monthly
  vacancy_rate?: number;
  collection_loss?: number;
  operating_expenses?: number;        // legacy single-ratio (deprecated)
  management_fee_percent?: number;    // % of EGI
  reserves_percent?: number;          // % of EGI
  maintenance?: number;               // annual ₵
  insurance?: number;
  property_tax?: number;
  utilities?: number;
  security?: number;
  other_expenses?: number;
  cap_rate?: number;
  // DCF
  discount_rate?: number;
  real_rent_growth?: number;
  terminal_cap_rate?: number;
  holding_period?: number;
  inflation_rate?: number;
}

/**
 * Options for DRC Method calculation
 */
export interface DRCMethodOptions {
  replacement_cost_per_sqm?: number;
  land_value?: number; // Land value from Cost Approach
  mea_factor?: number;
  useful_life?: number;
  depreciation_overrides?: {
    physical?: number;
    functional?: number;
    external?: number;
  };
}

/**
 * Options for Residual Method calculation
 */
export interface ResidualMethodOptions {
  proposed_gfa?: number;
  sale_price_per_sqm?: number;
  construction_cost_per_sqm?: number;
  developer_profit_pct?: number;
  finance_cost_pct?: number;
  professional_fees_pct?: number;
  marketing_cost_pct?: number;
}

/**
 * Python Valuation Methods API
 * Routes calculations to the Python RICS Valuation Engine (port 8001)
 */
export const pythonMethodsApi = {
  /**
   * Calculate value using Profits Method
   * Used for trading properties: hotels, hospitals, schools, restaurants, fuel stations
   */
  async calculateProfits(
    property: PythonPropertyInput,
    options?: ProfitsMethodOptions
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/profits', {
        method: 'POST',
        body: JSON.stringify({ property, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate value using Cost Approach
   * Used when market data is limited or for specialized properties
   */
  async calculateCostApproach(
    property: PythonPropertyInput,
    options?: CostApproachOptions
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/cost-approach', {
        method: 'POST',
        body: JSON.stringify({ property, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate value using Income Approach
   * Used for income-producing properties
   */
  async calculateIncomeApproach(
    property: PythonPropertyInput,
    options?: IncomeApproachOptions
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/income-approach', {
        method: 'POST',
        body: JSON.stringify({ property, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate value using DRC Method
   * Used for specialized/non-market properties: schools, hospitals, religious buildings
   */
  async calculateDRC(
    property: PythonPropertyInput,
    options?: DRCMethodOptions
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/drc', {
        method: 'POST',
        body: JSON.stringify({ property, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate value using Residual Method
   * Used for development land valuation
   */
  async calculateResidual(
    property: PythonPropertyInput,
    options?: ResidualMethodOptions
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/residual', {
        method: 'POST',
        body: JSON.stringify({ property, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate value using Sales Comparison (RICS-compliant)
   * Primary method for market-based valuations
   */
  async calculateSalesComparison(
    property: PythonPropertyInput,
    comparables?: any[],
    options?: any
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/sales-comparison-rics', {
        method: 'POST',
        body: JSON.stringify({ property, comparables, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate all applicable methods for a property
   * Returns values from multiple methods for reconciliation
   */
  async calculateAll(
    property: PythonPropertyInput,
    methods: string[],
    comparables?: any[],
    options?: Record<string, any>
  ): Promise<{ success: boolean; data: any | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/calculate-all', {
        method: 'POST',
        body: JSON.stringify({ property, methods, comparables, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate land value
   */
  async calculateLandValue(
    property: PythonPropertyInput,
    options?: any
  ): Promise<{ success: boolean; data: PythonMethodResponse | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/methods/land-value', {
        method: 'POST',
        body: JSON.stringify({ property, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Get depreciation calculation
   */
  async calculateDepreciation(
    property: PythonPropertyInput,
    options?: { include_external?: boolean; location_data?: any; market_data?: any }
  ): Promise<{ success: boolean; data: any | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/depreciation/calculate', {
        method: 'POST',
        body: JSON.stringify({ 
          property, 
          include_external: options?.include_external ?? true,
          location_data: options?.location_data || {},
          market_data: options?.market_data || {},
        }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Get market conditions for a region
   */
  async getMarketConditions(
    region: string
  ): Promise<{ success: boolean; data: any | null; error?: string }> {
    try {
      const response = await fetchPythonApi(`/market/conditions?region=${encodeURIComponent(region)}`);
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Get confidence score calculation
   */
  async calculateConfidence(
    methodResults: Record<string, any>,
    options?: any
  ): Promise<{ success: boolean; data: any | null; error?: string }> {
    try {
      const response = await fetchPythonApi('/confidence', {
        method: 'POST',
        body: JSON.stringify({ method_results: methodResults, options }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },
};

// ============================================================================
// SALES COMPARISON API - Routes to TypeScript backend
// Unified interface for sales comparison approach (RICS-compliant)
// ============================================================================

export interface SalesComparisonComparable {
  id: string;
  comparable_id?: string;
  property_id?: string;
  reference_number: string;
  title: string;
  address_street?: string;
  address_city?: string;
  neighborhood?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  property_type: string;
  bedrooms?: number;
  bathrooms?: number;
  gfa?: number;
  plot_size?: number;
  year_built?: number;
  condition?: string;
  sale_price: number;
  asking_price?: number;
  price_currency: string;
  sale_date: string;
  evidence_type: 'listing' | 'delisted_inferred' | 'verified_sale' | 'contributed';
  evidence_weight: number;
  is_delisted?: boolean;
  inferred_sale_price?: number;
  similarity_score?: number;
  adjustments?: Record<string, number>;
  adjusted_price?: number;
  weight?: number;
  notes?: string;
}

export interface EvidenceQuality {
  verifiedSales: number;
  delistedInferred: number;
  contributed: number;
  activeListings: number;
  avgWeight: number;
  qualityRating: 'excellent' | 'good' | 'fair' | 'limited';
}

export interface RICSCompliance {
  minimum_comparables_met: boolean;
  has_transaction_evidence: boolean;
  evidence_quality_rating: string;
  requires_disclosure: boolean;
}

export interface SalesComparisonData {
  basket: {
    id: string;
    basket_name: string;
    indicated_value: number;
    avg_price_per_sqm: number;
    created_at: string;
    updated_at?: string;
  };
  comparables: SalesComparisonComparable[];
  comparables_count: number;
  method_inputs: {
    comparables_count?: number;
    adjustments?: Record<string, any>;
    reconciliation_notes?: string;
    weighting_rationale?: string;
    calculated_value?: number;
    confidence_score?: number;
  } | null;
  evidence_quality: EvidenceQuality | null;
  rics_compliance: RICSCompliance;
}

export interface SalesComparisonSaveData {
  comparables: Array<{
    id: string;
    property_id?: string;
    similarity_score?: number;
    adjustments?: Record<string, number>;
    adjusted_price?: number;
    weight?: number;
    notes?: string;
    evidence_type?: string;
    sale_price?: number;
    price?: number;
  }>;
  adjustments?: Record<string, any>;
  indicated_value: number;
  avg_price_per_sqm: number;
  reconciliation_notes?: string;
  weighting_rationale?: string;
}

export const salesComparisonApi = {
  /**
   * Get sales comparison approach data for a valuation
   * Returns basket, comparables, adjustments, and indicated value
   */
  async getByValuation(valuationId: string): Promise<{ 
    success: boolean; 
    data: SalesComparisonData | null; 
    error?: string;
    message?: string;
  }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sales-comparison`);
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Save sales comparison approach data
   * Validates RICS compliance (minimum 3 comparables)
   */
  async save(valuationId: string, data: SalesComparisonSaveData): Promise<{ 
    success: boolean; 
    data: any; 
    error?: string;
  }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sales-comparison`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Search for comparable properties
   * Wrapper around comparablesApi.search with evidence_type support
   */
  async searchComparables(valuationId: string, criteria: {
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    sizeMin?: number;
    sizeMax?: number;
    bedroomsMin?: number;
    bedroomsMax?: number;
    maxAgeMonths?: number;
    condition?: string;
    excludeIds?: string[];
    includeContributed?: boolean;
    limit?: number;
  }): Promise<{ 
    success: boolean; 
    data: SalesComparisonComparable[]; 
    meta?: {
      count: number;
      hasGap: boolean;
      gapSeverity: string;
      aggregates: any;
    };
    error?: string;
  }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/comparables/search`, {
        method: 'POST',
        body: JSON.stringify(criteria),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Calculate indicated value from adjusted comparables
   * Uses weighted average based on evidence quality and similarity
   */
  calculateIndicatedValue(comparables: SalesComparisonComparable[]): {
    indicatedValue: number;
    avgPricePerSqm: number;
    confidence: number;
  } {
    if (comparables.length === 0) {
      return { indicatedValue: 0, avgPricePerSqm: 0, confidence: 0 };
    }

    // Weight by evidence quality and similarity
    let totalWeight = 0;
    let weightedSum = 0;
    let weightedPricePerSqm = 0;

    for (const comp of comparables) {
      const price = comp.adjusted_price || comp.sale_price || 0;
      const area = comp.gfa || comp.plot_size || 1;
      const evidenceWeight = comp.evidence_weight || 0.6;
      const similarityWeight = (comp.similarity_score || 50) / 100;
      const customWeight = comp.weight || 1.0;
      
      const combinedWeight = evidenceWeight * similarityWeight * customWeight;
      
      weightedSum += price * combinedWeight;
      weightedPricePerSqm += (price / area) * combinedWeight;
      totalWeight += combinedWeight;
    }

    const indicatedValue = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    const avgPricePerSqm = totalWeight > 0 ? Math.round(weightedPricePerSqm / totalWeight) : 0;
    
    // Confidence based on evidence quality and count
    const avgEvidenceWeight = comparables.reduce((sum, c) => sum + (c.evidence_weight || 0.6), 0) / comparables.length;
    const countBonus = Math.min(0.2, comparables.length * 0.03);
    const confidence = Math.min(0.95, avgEvidenceWeight + countBonus);

    return { indicatedValue, avgPricePerSqm, confidence };
  },

  /**
   * Get evidence quality summary for a set of comparables
   */
  getEvidenceQuality(comparables: SalesComparisonComparable[]): EvidenceQuality {
    if (comparables.length === 0) {
      return {
        verifiedSales: 0,
        delistedInferred: 0,
        contributed: 0,
        activeListings: 0,
        avgWeight: 0,
        qualityRating: 'limited',
      };
    }

    const verifiedSales = comparables.filter(c => c.evidence_type === 'verified_sale').length;
    const delistedInferred = comparables.filter(c => c.evidence_type === 'delisted_inferred').length;
    const contributed = comparables.filter(c => c.evidence_type === 'contributed').length;
    const activeListings = comparables.filter(c => c.evidence_type === 'listing').length;
    const avgWeight = comparables.reduce((sum, c) => sum + (c.evidence_weight || 0.6), 0) / comparables.length;
    
    const transactionBased = verifiedSales + delistedInferred;
    const ratio = transactionBased / comparables.length;
    let qualityRating: 'excellent' | 'good' | 'fair' | 'limited';
    if (ratio >= 0.75) qualityRating = 'excellent';
    else if (ratio >= 0.50) qualityRating = 'good';
    else if (ratio >= 0.25) qualityRating = 'fair';
    else qualityRating = 'limited';

    return {
      verifiedSales,
      delistedInferred,
      contributed,
      activeListings,
      avgWeight,
      qualityRating,
    };
  },

  /**
   * Auto-calculate adjustments using Python valuation engine
   * Falls back to TypeScript calculation if Python service unavailable
   * 
   * Includes Ghana-specific adjustments:
   * - Neighborhood premiums (Airport Res: +30%, Cantonments: +28%, etc.)
   * - Tenure risk (Freehold: 0%, Stool Land: -12%, Family Land: -18%)
   */
  async autoCalculate(
    valuationId: string,
    data: {
      subject_property: {
        property_type?: string;
        region?: string;
        city?: string;
        address?: string;
        neighborhood?: string;
        gfa?: number;
        plot_size?: number;
        bedrooms?: number;
        bathrooms?: number;
        year_built?: number;
        age?: number;
        condition?: string;
        quality_rating?: string;
        tenure_type?: string;
        price?: number;
        latitude?: number;
        longitude?: number;
      };
      comparables: Array<{
        id: string;
        property_type?: string;
        region?: string;
        city?: string;
        address?: string;
        neighborhood?: string;
        gfa?: number;
        plot_size?: number;
        bedrooms?: number;
        bathrooms?: number;
        year_built?: number;
        age?: number;
        condition?: string;
        quality_rating?: string;
        tenure_type?: string;
        sale_price?: number;
        price?: number;
        sale_date?: string;
        evidence_type?: string;
        latitude?: number;
        longitude?: number;
      }>;
      options?: {
        include_ghana_adjustments?: boolean;
        include_tenure_risk?: boolean;
        include_neighborhood_premiums?: boolean;
      };
    }
  ): Promise<{
    success: boolean;
    data: {
      valuation_id: string;
      comparables: Array<{
        id: string;
        adjustments: Record<string, number>;
        total_adjustment_pct: number;
        adjusted_price: number;
        adjusted_price_per_sqm: number | null;
        similarity_score?: number;
        weight?: number;
        calculation_source: 'python_valuation_engine' | 'typescript_fallback';
      }>;
      indicated_value: number;
      confidence_score?: number;
      confidence_level?: 'high' | 'medium' | 'low';
      value_range?: { low: number; high: number };
      avg_adjustment_pct: number;
      calculation_source: 'python_valuation_engine' | 'typescript_fallback';
      python_available: boolean;
      methodology_notes?: string[];
      assumptions?: string[];
      limitations?: string[];
      ghana_adjustments_applied?: {
        tenure_risk: boolean;
        neighborhood_premiums: boolean;
      };
    } | null;
    error?: string;
    message?: string;
  }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/sales-comparison/auto-calculate`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },
};

// ============================================================================
// INCOME APPROACH API - Routes to TypeScript backend
// ============================================================================

export interface IncomeApproachData {
  id?: string;
  valuation_id: string;
  gross_potential_income: number;
  vacancy_rate: number;
  effective_gross_income: number;
  operating_expenses: number;
  net_operating_income: number;
  cap_rate: number;
  cap_rate_mode?: 'system' | 'manual' | 'custom' | 'user';
  cap_rate_grade?: string | null;
  cap_rate_methodology?: string | Record<string, any> | null;
  system_cap_rate?: number | null;
  indicated_value: number;
  dcf_value?: number;
  grm_value?: number;
  income_streams: any[];
  expense_breakdown: any;
  // Rental analysis metadata for disclosure (Phase 5.5+)
  rental_analysis?: {
    source?: string;
    methodology?: string;
    indicated_rent?: number;
    rent_per_sqm?: number;
    confidence?: number;
    comparables_count?: number;
    weighting_method?: string;
    estimated_at?: string | null;
    market_stats?: {
      avg_rent?: number;
      median_rent?: number;
      min_rent?: number;
      max_rent?: number;
    };
    comparables?: Array<{
      id: string;
      address?: string;
      rent?: number;
      bedrooms?: number;
      distance_km?: number;
    }>;
  } | null;
}

export const incomeApproachApi = {
  /**
   * Get income approach data for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: IncomeApproachData | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/income-approach`);
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Save/update income approach data
   */
  async save(valuationId: string, data: Partial<IncomeApproachData>): Promise<{ success: boolean; data: IncomeApproachData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/income-approach`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as IncomeApproachData, error: error.message };
    }
  },
};

// ============================================================================
// LAND VALUE API - Routes to TypeScript backend
// Multi-method land value calculation with reconciliation
// ============================================================================

export interface LandValueData {
  id?: string;
  valuation_id: string;
  land_value: number;
  land_value_per_sqm: number;
  land_area_sqm: number;
  primary_method: string;
  is_user_override: boolean;
  user_justification?: string;
  calculation_result?: LandValueResult;
  created_at?: string;
  updated_at?: string;
}

export interface LandValueResult {
  success: boolean;
  final_land_value: number;
  final_land_value_per_sqm: number;
  land_area_sqm: number;
  confidence_score: number;
  primary_method: string;
  is_user_override: boolean;
  user_justification?: string;
  methods?: {
    residual?: LandValueMethodDetail;
    comparable?: LandValueMethodDetail;
  };
  comparables_summary?: {
    count_found: number;
    count_used: number;
    strength: 'weak' | 'balanced' | 'strong';
    top_comparables: LandComparableSummary[];
  };
  reconciliation?: {
    method_weights: Record<string, number>;
    weight_justification: string;
    value_spread_pct: number;
    outlier_flags: string[];
  };
  comparable_strength: 'weak' | 'balanced' | 'strong' | 'N/A';
  disclosure_required: boolean;
  disclosure_text: string;
  cached: boolean;
  error?: string;
}

export interface LandValueMethodDetail {
  value: number;
  value_per_sqm: number;
  confidence: number;
  weight: number;
  weighted_contribution: number;
  method_specific?: Record<string, any>;
}

export interface LandComparableSummary {
  id: string;
  distance_km: number;
  sale_date: string;
  sale_price_per_sqm: number;
  adjusted_price_per_sqm: number;
  similarity_score: number;
  adjustment_factor: number;
}

export interface LandValueCalculateRequest {
  user_entered_value?: number;
  user_justification?: string;
  force_recalculate?: boolean;
}

export const landValueApi = {
  /**
   * Get land value data for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: LandValueData | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/land-value`);
      return response;
    } catch (error: any) {
      // Return null if not found (404) - expected for new valuations
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        return { success: true, data: null };
      }
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Calculate/recalculate land value using multi-method reconciliation
   * @param valuationId - The valuation ID
   * @param options - Optional: user_entered_value (100% override), force_recalculate
   */
  async calculate(
    valuationId: string, 
    options?: LandValueCalculateRequest
  ): Promise<{ success: boolean; data: LandValueResult | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/land-value/calculate`, {
        method: 'POST',
        body: JSON.stringify(options || {}),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Save/update land value with user override
   * @param valuationId - The valuation ID
   * @param data - Land value data including user override and justification
   */
  async save(valuationId: string, data: Partial<LandValueData>): Promise<{ success: boolean; data: LandValueData; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/land-value`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: {} as LandValueData, error: error.message };
    }
  },

  /**
   * Get land comparables used in the comparable land sales method
   */
  async getComparables(valuationId: string): Promise<{ success: boolean; data: LandComparableSummary[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/land-value/comparables`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },
};

// ============================================================================
// COMPARABLES API - Routes to TypeScript backend
// ============================================================================

export const comparablesApi = {
  /**
   * Get comparables for a valuation
   */
  async getByValuation(valuationId: string): Promise<{ success: boolean; data: ComparableProperty[]; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/comparables`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },

  /**
   * Get comparable basket for a valuation
   */
  async getBasket(valuationId: string): Promise<{ success: boolean; data: ComparableBasket | null; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/comparables/basket`);
      return response;
    } catch (error: any) {
      // Return null basket if not found (404) - this is expected for new valuations
      if (error.message?.includes('404') || error.message?.includes('Not Found') || error.message?.includes('not found')) {
        return { success: true, data: null };
      }
      return { success: false, data: null, error: error.message };
    }
  },

  /**
   * Save comparable basket for a valuation
   */
  async saveBasket(valuationId: string, data: { comparables: any[]; indicatedValue: number | null; avgPricePerSqm: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/comparables/basket`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Search for comparable properties
   * Can be called with (valuationId, criteria) or just (criteria) for convenience
   */
  async search(valuationIdOrCriteria: string | any, criteria?: any): Promise<{ success: boolean; data: ComparableProperty[]; error?: string }> {
    try {
      // Handle both calling conventions: search(criteria) or search(valuationId, criteria)
      let valuationId: string;
      let searchCriteria: any;

      if (typeof valuationIdOrCriteria === 'string' && criteria) {
        valuationId = valuationIdOrCriteria;
        searchCriteria = criteria;
      } else if (typeof valuationIdOrCriteria === 'object') {
        // Called with just criteria - return mock data for now
        searchCriteria = valuationIdOrCriteria;
        // Return empty for now - actual search requires backend endpoint
        return { success: true, data: [] };
      } else {
        valuationId = valuationIdOrCriteria;
        searchCriteria = {};
      }

      const response = await fetchTypescriptApi(`/${valuationId}/comparables/search`, {
        method: 'POST',
        body: JSON.stringify(searchCriteria),
      });
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
  },
};

// ============================================================================
// RENTAL COMPARABLES API - For Income Approach rent estimation
// ============================================================================

/**
 * Rental comparable search parameters
 */
export interface RentalSearchParams {
  radiusKm?: number;           // Default: 3km (tighter for rentals)
  propertyType?: string;
  bedroomsMin?: number;
  bedroomsMax?: number;
  sizeMin?: number;            // GFA in sqm
  sizeMax?: number;
  maxAgeMonths?: number;       // Default: 6 months (rentals change faster)
  furnishing?: 'furnished' | 'unfurnished' | 'semi-furnished';
  excludeIds?: string[];
  limit?: number;
}

/**
 * Rental comparable property from search results
 */
export interface RentalComparable {
  id: string;
  reference_number?: string;
  title?: string;
  address_street?: string;
  address_city?: string;
  neighborhood: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  gfa_sqm: number;
  plot_size?: number;
  asking_rent_monthly: number;     // Monthly asking rent in GHS
  rent_per_sqm_monthly: number;    // ₵/sqm/month
  price_original?: number;
  price_currency?: string;
  amenities?: string[];
  listing_date: string;
  distance_km: number;
  similarity_score: number;
  data_source: string;
}

/**
 * Rent estimation result from rental comparables analysis
 */
export interface RentEstimation {
  suggestedMonthlyRent: number;
  rentPerSqm: number;
  confidence: number;
  comparablesUsed: number;
  methodology: 'median' | 'weighted_average' | 'manual';
  note?: string;
}

/**
 * Rental search response with aggregates and rent estimation
 */
export interface RentalSearchResponse {
  success: boolean;
  data: RentalComparable[];
  meta: {
    valuationId: string;
    searchCriteria: {
      latitude: number;
      longitude: number;
      radiusKm: number;
      propertyType: string;
      bedroomsRange: { min: number; max: number };
      sizeRange: { min: number; max: number };
      maxAgeMonths: number;
    };
    count: number;
    hasGap: boolean;
    aggregates: {
      avgRentMonthly: number;
      medianRentMonthly: number;
      avgRentPerSqm: number;
      minRent: number;
      maxRent: number;
      minRentPerSqm: number;
      maxRentPerSqm: number;
      avgDistance: number;
      avgSimilarity: number;
      suggestedRentForSubject: number;
      suggestedRentPerSqm: number;
      confidence: number;
    } | null;
    currencyConversion: {
      targetCurrency: string;
      fxRateUsed: number;
      usdCount: number;
      ghsCount: number;
    };
    rentEstimation: RentEstimation | null;
    gapAnalysis: {
      required: number;
      found: number;
      shortfall: number;
      message: string;
    } | null;
  };
  error?: string;
}

/**
 * Rental Comparables API - For Income Approach rent estimation
 * Routes to TypeScript backend
 */
export const rentalComparablesApi = {
  /**
   * Search for rental comparable properties to estimate market rent
   * Used by Income Approach to derive rental assumptions
   * 
   * @param valuationId - The valuation to search rental comparables for
   * @param params - Search parameters (radius, size, bedrooms, etc.)
   * @returns Rental comparables with market rent statistics
   */
  async search(
    valuationId: string, 
    params: RentalSearchParams = {}
  ): Promise<RentalSearchResponse> {
    try {
      const response = await fetchTypescriptApi(`/${valuationId}/rental-comparables/search`, {
        method: 'POST',
        body: JSON.stringify({
          radiusKm: params.radiusKm ?? 3,
          propertyType: params.propertyType,
          bedroomsMin: params.bedroomsMin,
          bedroomsMax: params.bedroomsMax,
          sizeMin: params.sizeMin,
          sizeMax: params.sizeMax,
          maxAgeMonths: params.maxAgeMonths ?? 6,
          furnishing: params.furnishing,
          excludeIds: params.excludeIds ?? [],
          limit: params.limit ?? 20,
        }),
      });
      return response;
    } catch (error: any) {
      return { 
        success: false, 
        data: [], 
        meta: {
          valuationId,
          searchCriteria: {
            latitude: 0,
            longitude: 0,
            radiusKm: params.radiusKm ?? 3,
            propertyType: params.propertyType ?? '',
            bedroomsRange: { min: params.bedroomsMin ?? 0, max: params.bedroomsMax ?? 10 },
            sizeRange: { min: params.sizeMin ?? 0, max: params.sizeMax ?? 1000 },
            maxAgeMonths: params.maxAgeMonths ?? 6,
          },
          count: 0,
          hasGap: true,
          aggregates: null,
          currencyConversion: { targetCurrency: 'GHS', fxRateUsed: 15.5, usdCount: 0, ghsCount: 0 },
          rentEstimation: null,
          gapAnalysis: {
            required: 3,
            found: 0,
            shortfall: 3,
            message: 'Failed to search rental comparables',
          },
        },
        error: error.message 
      };
    }
  },

  /**
   * Get suggested market rent from rental comparables
   * Convenience method that returns just the rent estimation
   * 
   * @param valuationId - The valuation to estimate rent for
   * @param params - Search parameters
   * @returns Rent estimation with confidence level
   */
  async estimateMarketRent(
    valuationId: string,
    params: RentalSearchParams = {}
  ): Promise<{ success: boolean; data: RentEstimation | null; error?: string }> {
    try {
      const response = await this.search(valuationId, params);
      
      if (!response.success || !response.meta?.rentEstimation) {
        return {
          success: false,
          data: null,
          error: response.error || 'No rental comparables found',
        };
      }

      return {
        success: true,
        data: response.meta.rentEstimation,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  },

  /**
   * Get rental market statistics for a location
   * Returns aggregate metrics without individual comparables
   * 
   * @param valuationId - The valuation for location context
   * @param params - Search parameters
   * @returns Market aggregates (avg rent, rent per sqm, etc.)
   */
  async getMarketStats(
    valuationId: string,
    params: RentalSearchParams = {}
  ): Promise<{ success: boolean; data: RentalSearchResponse['meta']['aggregates']; error?: string }> {
    try {
      const response = await this.search(valuationId, params);
      
      return {
        success: response.success,
        data: response.meta?.aggregates || null,
        error: response.error,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  },

  /**
   * Get rental market benchmarks for a specific area
   * Computed from actual Data Hub listings - used as fallback when few comparables found
   * 
   * @param areaName - The neighborhood/district name to get benchmarks for
   * @param propertyType - Optional property type filter
   * @returns Benchmark data with avg rent, median, range, etc.
   */
  async getMarketBenchmarks(
    areaName: string,
    propertyType?: string
  ): Promise<{
    success: boolean;
    data: {
      areaName: string;
      areaType: string;
      propertyType: string | null;
      listingCount: number;
      avgRentMonthly: number;
      medianRentMonthly: number;
      minRentMonthly: number;
      maxRentMonthly: number;
      avgRentPerSqm: number | null;
      rentByBedrooms: Record<string, { count: number; avg: number; median: number; min: number; max: number }> | null;
      vacancyRateEstimate: number | null;
      dataSource: string;
      computedAt: string;
    } | null;
    error?: string;
  }> {
    try {
      const response = await fetchTypescriptApi(
        `/rental-benchmarks/${encodeURIComponent(areaName)}${propertyType ? `?propertyType=${propertyType}` : ''}`,
        { method: 'GET' }
      );
      
      return {
        success: response.success,
        data: response.data,
        error: response.error,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  },

  /**
   * Get all rental market benchmarks
   * Returns pre-computed statistics for all areas with rental data
   * 
   * @param options - Filter options
   * @returns List of benchmark data for all areas
   */
  async getAllBenchmarks(
    options: { area?: string; propertyType?: string; limit?: number } = {}
  ): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      area_name: string;
      area_type: string;
      property_type: string | null;
      listing_count: number;
      avg_rent_monthly: string;
      median_rent_monthly: string;
      min_rent_monthly: string;
      max_rent_monthly: string;
      avg_rent_per_sqm: string | null;
      computed_at: string;
    }>;
    meta: {
      count: number;
      dataSource: string;
      lastUpdated: string | null;
    };
    error?: string;
  }> {
    try {
      const params = new URLSearchParams();
      if (options.area) params.set('area', options.area);
      if (options.propertyType) params.set('propertyType', options.propertyType);
      if (options.limit) params.set('limit', options.limit.toString());
      
      const response = await fetchTypescriptApi(
        `/rental-benchmarks${params.toString() ? `?${params.toString()}` : ''}`,
        { method: 'GET' }
      );
      
      return response;
    } catch (error: any) {
      return {
        success: false,
        data: [],
        meta: { count: 0, dataSource: 'computed_from_data_hub', lastUpdated: null },
        error: error.message,
      };
    }
  },
};

// ============================================================================
// TYPESCRIPT BACKEND APIS (for other platform services)
// ============================================================================

/**
 * Users API - Routes to TypeScript backend
 */
export const usersApi = {
  async getProfile(): Promise<any> {
    return fetchApi('/auth/profile');
  },

  async updateProfile(data: any): Promise<any> {
    return fetchApi('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

/**
 * Files/Upload API - Routes to TypeScript backend
 */
export const filesApi = {
  async upload(formData: FormData): Promise<any> {
    return fetchApi('/files/upload', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let browser set it for FormData
      headers: {},
    });
  },

  async getFile(id: string): Promise<any> {
    return fetchApi(`/files/${id}`);
  },
};

/**
 * Deals API - Routes to TypeScript backend
 */
export const dealsApi = {
  async list(params?: any): Promise<any> {
    const searchParams = new URLSearchParams(params);
    return fetchApi(`/deals?${searchParams.toString()}`);
  },

  async create(data: any): Promise<any> {
    return fetchApi('/deals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getById(id: string): Promise<any> {
    return fetchApi(`/deals/${id}`);
  },
};

/**
 * Analytics API - Routes to TypeScript backend
 */
export const analyticsApi = {
  async getDashboardData(): Promise<any> {
    return fetchApi('/analytics/dashboard');
  },

  async getReports(params?: Record<string, string>): Promise<any> {
    const searchParams = new URLSearchParams(params || {});
    return fetchApi(`/analytics/reports?${searchParams.toString()}`);
  },
};

// ============================================================================
// SERVICE HEALTH CHECKS
// ============================================================================

/**
 * Check health of both services
 */
export const healthApi = {
  async checkPythonService(): Promise<{ status: string; service: string; timestamp: string }> {
    try {
      const healthUrl = typeof window !== 'undefined'
        ? '/ml-api/health'
        : `${(process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8001').replace(/\/api\/v1$/, '')}/health`;
      return await fetch(healthUrl).then(res => res.json());
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'Python Valuation Service',
        timestamp: new Date().toISOString(),
      };
    }
  },

  async checkTypeScriptService(): Promise<{ status: string; service: string; timestamp: string }> {
    try {
      return await fetchApi('/health');
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'TypeScript Platform Service',
        timestamp: new Date().toISOString(),
      };
    }
  },

  async checkAllServices(): Promise<{
    python: { status: string; service: string; timestamp: string };
    typescript: { status: string; service: string; timestamp: string };
  }> {
    const [python, typescript] = await Promise.all([
      this.checkPythonService(),
      this.checkTypeScriptService(),
    ]);

    return { python, typescript };
  },
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

const propmetrikApiClient = {
  valuations: valuationsApi,
  properties: propertiesApi,
  market: marketApi,
  marketData: marketDataApi,
  users: usersApi,
  files: filesApi,
  deals: dealsApi,
  analytics: analyticsApi,
  health: healthApi,
  // Valuation workflow APIs (TypeScript backend)
  floorPlan: floorPlanApi,
  hbu: hbuApi,
  reconciliation: reconciliationApi,
  sensitivity: sensitivityApi,
  overrides: overridesApi,
  comparableBasket: comparableBasketApi,
  // Valuation method APIs
  costApproach: costApproachApi,
  incomeApproach: incomeApproachApi,
  salesComparison: salesComparisonApi,
  landValue: landValueApi,
  // Python RICS Valuation Engine methods
  pythonMethods: pythonMethodsApi,
  comparables: comparablesApi,
  // Rental comparables for Income Approach
  rentalComparables: rentalComparablesApi,
};

export default propmetrikApiClient;

// ============================================================================
// PAYMENT CONFIGURATION (Valuation Invoice Payouts)
// ============================================================================

import type {
  PaymentAccountConfig,
  BankListItem,
  ResolveAccountResult,
  CryptoWalletConfig,
  CryptoWalletSaveResult,
  SettlementCoin,
} from '@/lib/property-management-api';

// Relative path for valuation-invoices — fetchApi prepends API_BASE (/api → Next.js rewrite)
const VALUATION_INVOICES_PATH = '/valuation-invoices';

/**
 * Payment payout configuration API for valuation services.
 * Matches PaymentConfigApiShape so it works with the reusable PaymentSettings component.
 * 
 * Uses relative paths because fetchApi prepends API_BASE (e.g. '/api'),
 * and Next.js rewrites /api/:path* → http://localhost:4000/api/v1/:path*.
 */
export const valuationPaymentConfigApi = {
  /** Get current payout account status */
  getAccount: () =>
    fetchApi<PaymentAccountConfig>(`${VALUATION_INVOICES_PATH}/payments/account`),

  /** Get list of supported banks (Ghana) */
  getBanks: () =>
    fetchApi<{ status: boolean; data: BankListItem[] }>(`${VALUATION_INVOICES_PATH}/payments/banks`),

  /** Verify a bank account number (name enquiry) */
  resolveAccount: (accountNumber: string, bankCode: string) =>
    fetchApi<ResolveAccountResult>(`${VALUATION_INVOICES_PATH}/payments/resolve-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountNumber, bankCode }),
    }),

  /** Register or update payout account (creates Paystack sub-account) */
  registerAccount: (data: {
    bankCode: string;
    accountNumber: string;
    businessName: string;
    contactEmail?: string;
    contactPhone?: string;
  }) =>
    fetchApi<{ success: boolean; subaccountCode: string }>(`${VALUATION_INVOICES_PATH}/payments/register-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Get crypto wallet configuration */
  getCryptoWallet: () =>
    fetchApi<CryptoWalletConfig>(`${VALUATION_INVOICES_PATH}/payments/crypto-wallet`),

  /** Save/update crypto wallet + payout currency */
  saveCryptoWallet: (walletAddress: string, payoutCoin?: string, payoutChain?: string) =>
    fetchApi<CryptoWalletSaveResult>(`${VALUATION_INVOICES_PATH}/payments/crypto-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, payoutCoin, payoutChain }),
    }),

  /** Get supported settlement/payout currencies */
  getSettlementCoins: () =>
    fetchApi<SettlementCoin[]>(`${VALUATION_INVOICES_PATH}/payments/settlement-coins`),
};

// ============================================================================
// DEVELOPMENT HELPERS
// ============================================================================

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Add to window for debugging in development
  (window as any).propmetrikApi = {
    valuations: valuationsApi,
    properties: propertiesApi,
    market: marketApi,
    health: healthApi,
    // Valuation workflow APIs
    floorPlan: floorPlanApi,
    hbu: hbuApi,
    reconciliation: reconciliationApi,
    sensitivity: sensitivityApi,
    overrides: overridesApi,
    comparableBasket: comparableBasketApi,
    costApproach: costApproachApi,
    incomeApproach: incomeApproachApi,
    salesComparison: salesComparisonApi,
    landValue: landValueApi,
    comparables: comparablesApi,
    // Python RICS Valuation Engine methods
    pythonMethods: pythonMethodsApi,
    // Rental comparables for Income Approach
    rentalComparables: rentalComparablesApi,
  };

  console.log('🔧 PROPMETRIK API Client loaded in development mode');
  console.log('🐍 Python Valuation Service:', PYTHON_VALUATION_API);
  console.log('🟦 TypeScript Valuation Workflow Service:', TS_VALUATIONS_BASE);
  console.log('📊 API client available at: window.propmetrikApi');
}