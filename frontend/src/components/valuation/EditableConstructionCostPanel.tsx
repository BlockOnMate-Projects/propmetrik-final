'use client';

/**
 * Editable Construction Cost Panel
 * 
 * Fetches construction cost data from database (admin-managed via Data Hub).
 * Admin updates material prices and labor rates bi-weekly through Data Hub panel.
 * 
 * Allows users to view and adjust construction cost data including:
 * - Material price indices (fetched from database, adjustable for valuation)
 * - Labor costs (fetched from database, adjustable for valuation)
 * - Base construction costs (calculated from materials + labor)
 * - Displays last updated timestamps
 * - Real-time recalculation of costs per sqm
 * 
 * Formula: Cost_per_sqm = Base × (Index/100) × (Avg_Material_Index/100) × (Labor_Rate/Base_Labor) × Location_Factor
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Building2,
  Hammer,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  MapPin,
  Layers,
  AlertTriangle,
  Edit2,
  Save,
  X,
  RotateCcw,
  HelpCircle,
  Clock,
  Loader2,
  FileWarning,
  MessageSquare,
} from 'lucide-react';
import { TerminalPanel } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import { constructionApi, valuationConfigApi, mapPropertyRegionToConstructionCluster } from '@/lib/api';
import { overridesApi, type OverrideRecord } from '@/lib/valuation-api';
import type { RegionCode } from '@/types/data-hub';

// =====================================================
// TYPES
// =====================================================

// Material price from database - actual prices not indices
export interface MaterialPriceItem {
  category: string;
  name: string;
  price_ghs: number;
  original_price_ghs: number; // For tracking overrides
  unit: string;
  change_yoy: number | null;
  last_updated?: string;
}

export interface MaterialIndex {
  name: string;
  index: number;
  change_yoy: number | null;
  weight: number; // Weight in composite calculation
  last_updated?: string;
}

export interface LaborCost {
  category: string;
  skill_level: string;
  daily_rate: number;
  original_rate: number; // For tracking overrides
  change_yoy: number | null;
  last_updated?: string;
}

export interface BaseCost {
  tier: 'luxury' | 'high' | 'standard' | 'basic' | 'substandard';
  base_cost: number; // Base cost before adjustments
  adjusted_cost?: number; // After applying factors
}

export interface RegionalFactor {
  region_code: string;
  region_name: string;
  location_factor: number;
}

export interface ConstructionCostEditableData {
  region: string;
  region_name: string;
  effective_date: string;
  location_factor: number;

  // Base costs by quality tier (GHS per sqm)
  base_costs_2020: Record<string, number>;

  // Material prices (editable) - actual prices from database
  material_prices: MaterialPriceItem[];
  
  // Legacy support
  material_indices: MaterialIndex[];

  // Labor costs (editable)
  labor_costs: LaborCost[];

  // Base labor rate for ratio calculation
  base_labor_rate: number;

  // Composite index (calculated)
  construction_cost_index: number;
  index_change_yoy: number;
  index_base_year: number;

  // Effective construction cost per sqm (calculated)
  effective_cost_per_sqm: number;

  // Source info
  source: string;
  last_updated: string;
}

interface EditableConstructionCostPanelProps {
  region: RegionCode;
  qualityTier?: string;
  valuationId?: string; // Required for override tracking
  onDataChange?: (data: ConstructionCostEditableData) => void;
  onSave?: (data: ConstructionCostEditableData, overrides?: OverrideRecord[]) => Promise<void>;
  collapsed?: boolean;
  className?: string;
  constructionQuality?: string;
  onConstructionQualityChange?: (quality: string) => void;
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function TrendIndicator({ change }: { change: number | null | undefined }) {
  if (change === null || change === undefined || Number.isNaN(Number(change))) {
    return (
      <span className="flex items-center gap-1 text-zinc-500 font-mono text-[10px]">
        <Minus className="w-3 h-3" />
        —
      </span>
    );
  }

  const value = Number(change);
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 text-red-400 font-mono text-[10px]">
        <TrendingUp className="w-3 h-3" />
        +{value.toFixed(1)}%
      </span>
    );
  } else if (value < 0) {
    return (
      <span className="flex items-center gap-1 text-green-400 font-mono text-[10px]">
        <TrendingDown className="w-3 h-3" />
        {value.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-zinc-400 font-mono text-[10px]">
      <Minus className="w-3 h-3" />
      0.0%
    </span>
  );
}

function EditableNumberInput({
  value,
  onChange,
  disabled,
  min = 0,
  max,
  step = 1,
  prefix,
  suffix,
  className,
}: {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value.toString());

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleBlur = () => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && num >= min && (max === undefined || num <= max)) {
      onChange(num);
    } else {
      setLocalValue(value.toString());
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {prefix && <span className="font-mono text-[10px] text-zinc-500">{prefix}</span>}
      <input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={cn(
          "w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-right font-mono text-xs text-white",
          "focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
      {suffix && <span className="font-mono text-[10px] text-zinc-500">{suffix}</span>}
    </div>
  );
}

function LastUpdatedBadge({ date }: { date?: string }) {
  if (!date) return null;

  const formatted = new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <span className="flex items-center gap-1 text-zinc-500 font-mono text-[9px]">
      <Clock className="w-2.5 h-2.5" />
      {formatted}
    </span>
  );
}

function FormulaTooltip() {
  const [showFormula, setShowFormula] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowFormula(!showFormula)}
        className="p-1 hover:bg-zinc-700 rounded transition-colors"
        title="View calculation formula"
      >
        <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
      </button>

      {showFormula && (
        <div className="absolute right-0 top-full mt-1 z-50 w-96 p-3 bg-zinc-900 border border-amber-500/30 shadow-xl">
          <div className="font-mono text-[10px] text-amber-500 uppercase mb-2">
            Construction Cost Calculation
          </div>
          <div className="font-mono text-[10px] text-zinc-300 leading-relaxed space-y-2">
            <p><strong>Formula:</strong></p>
            <p className="bg-zinc-800 p-2 rounded text-amber-400">
              Cost/sqm = Base₂₀₂₀ × (Index/100) × Material_Factor × Labor_Factor × Location_Factor
            </p>
            <p><strong>Where:</strong></p>
            <ul className="list-disc list-inside text-zinc-400 space-y-1">
              <li><strong>Base₂₀₂₀:</strong> Base cost per sqm in 2020 (quality tier)</li>
              <li><strong>Index:</strong> Construction Cost Index (2020 = 100)</li>
              <li><strong>Material_Factor:</strong> Weighted average of material indices</li>
              <li><strong>Labor_Factor:</strong> Current labor rate / Base 2020 rate</li>
              <li><strong>Location_Factor:</strong> Regional adjustment (e.g., 1.15 for Accra)</li>
            </ul>
            <p className="text-zinc-500 mt-2">
              Material weights: Cement 25%, Steel 15%, Timber 12%, Aggregate 10%,
              Roofing 12%, Electrical 8%, Plumbing 8%, Finishes 10%
            </p>
          </div>
          <button
            onClick={() => setShowFormula(false)}
            className="absolute top-2 right-2 p-1 hover:bg-zinc-700 rounded"
          >
            <X className="w-3 h-3 text-zinc-400" />
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

// Default material weights for construction cost calculation
// These map material price categories to their relative weight in total construction cost
const DEFAULT_MATERIAL_WEIGHTS: Record<string, number> = {
  cement: 0.25,
  sand: 0.08,
  aggregate: 0.08,
  steel: 0.15,
  timber: 0.08,
  roofing: 0.12,
  paint: 0.06,
  plumbing: 0.08,
  electrical: 0.06,
  tiles: 0.04,
};

// Normalize category name for weight lookup
function normalizeCategoryForWeight(category: string): string {
  const normalized = category.toLowerCase().replace(/[^a-z]/g, '');
  // Handle common variations
  if (normalized.includes('cement') || normalized.includes('block')) return 'cement';
  if (normalized.includes('sand') || normalized.includes('aggregate')) return 'sand';
  if (normalized.includes('steel') || normalized.includes('iron') || normalized.includes('rebar')) return 'steel';
  if (normalized.includes('timber') || normalized.includes('wood') || normalized.includes('lumber')) return 'timber';
  if (normalized.includes('roof') || normalized.includes('sheet') || normalized.includes('zinc')) return 'roofing';
  if (normalized.includes('paint') || normalized.includes('finish')) return 'paint';
  if (normalized.includes('plumb') || normalized.includes('pipe') || normalized.includes('fitting')) return 'plumbing';
  if (normalized.includes('electr') || normalized.includes('wire') || normalized.includes('cable')) return 'electrical';
  if (normalized.includes('tile') || normalized.includes('ceramic')) return 'tiles';
  return normalized;
}

export function EditableConstructionCostPanel({
  region,
  qualityTier,
  valuationId,
  onDataChange,
  onSave,
  collapsed: initialCollapsed = false,
  className,
  constructionQuality = "Standard",
  onConstructionQualityChange = () => {},
}: EditableConstructionCostPanelProps) {
  // State
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  // Override tracking state
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [existingOverrides, setExistingOverrides] = useState<OverrideRecord[]>([]);
  const [pendingOverrides, setPendingOverrides] = useState<Array<{
    field_path: string;
    field_label: string;
    system_default_value: any;
    user_override_value: any;
    value_unit?: string;
  }>>([]);

  // Data state - actual material prices from database
  const [materialPrices, setMaterialPrices] = useState<MaterialPriceItem[]>([]);
  const [laborCosts, setLaborCosts] = useState<LaborCost[]>([]);
  const [baseCosts2020, setBaseCosts2020] = useState<Record<string, number>>({});
  const [regionalFactors, setRegionalFactors] = useState<Record<string, { name: string; factor: number }>>({});

  // Original values for reset (tracking user overrides)
  const [originalMaterialPrices, setOriginalMaterialPrices] = useState<MaterialPriceItem[]>([]);
  const [originalLaborCosts, setOriginalLaborCosts] = useState<LaborCost[]>([]);

  // Derived values - get regional info from fetched data or default to 1.0
  const regionalInfo = regionalFactors[region] || { name: region, factor: 1.0 };

  // Fetch construction cost data from database
  const fetchConstructionData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Map property region to construction cost API cluster
      const apiRegion = mapPropertyRegionToConstructionCluster(region);

      // Fetch all data in parallel: materials, labor rates, config from database
      // Note: For labor rates, we fetch ALL rates (no region filter) to ensure we get data
      // Fetch region-scoped labor rates for consistent market context
      const [materialsResponse, laborResponse, regionalsResponse, baseCostsResponse] = await Promise.all([
        constructionApi.getMaterials({ region: apiRegion }),
        constructionApi.getLaborRates({ region: apiRegion }),
        valuationConfigApi.getRegionalFactors(),
        valuationConfigApi.getBaseCosts(),
      ]);

      // Process regional factors from database
      if (regionalsResponse.success && regionalsResponse.data && regionalsResponse.data.length > 0) {
        const factors: Record<string, { name: string; factor: number }> = {};
        regionalsResponse.data.forEach((r: RegionalFactor) => {
          factors[r.region_code] = { name: r.region_name, factor: r.location_factor };
        });
        setRegionalFactors(factors);
      }

      // Process base construction costs from database
      if (baseCostsResponse.success && baseCostsResponse.data && baseCostsResponse.data.length > 0) {
        const costs: Record<string, number> = {};
        baseCostsResponse.data.forEach((c: { quality_tier: string; base_cost_per_sqm: number }) => {
          costs[c.quality_tier] = c.base_cost_per_sqm;
        });
        setBaseCosts2020(costs);
      }

      // Process actual material prices from database
      if (materialsResponse.success && materialsResponse.data && materialsResponse.data.length > 0) {
        // Group materials by category and get representative prices
        const categoryPrices = new Map<string, MaterialPriceItem>();
        
        materialsResponse.data.forEach((material: any) => {
          const category = material.material_category;
          const existing = categoryPrices.get(category);
          
          // Use most recently updated price for each category
          if (!existing || new Date(material.survey_date) > new Date(existing.last_updated || '')) {
            categoryPrices.set(category, {
              category: category,
              name: material.material_name,
              price_ghs: parseFloat(material.price_ghs) || 0,
              original_price_ghs: parseFloat(material.price_ghs) || 0,
              unit: material.unit || 'unit',
              change_yoy: material.price_change_percent != null ? parseFloat(String(material.price_change_percent)) : null,
              last_updated: material.survey_date?.toString().split('T')[0] || new Date().toISOString().split('T')[0],
            });
          }
        });

        const pricesArray = Array.from(categoryPrices.values());
        if (pricesArray.length > 0) {
          setMaterialPrices(pricesArray);
          setOriginalMaterialPrices(pricesArray.map(p => ({ ...p })));
        }
      }

      // Process labor rates from database  
      if (laborResponse.success && laborResponse.data && laborResponse.data.length > 0) {
        console.log('Raw labor response data:', laborResponse.data);
        
        // Get unique labor categories with their rates
        const laborByCategory = new Map<string, LaborCost>();
        
        laborResponse.data.forEach((labor: any) => {
          // API returns daily_rate_ghs (not rate_ghs) - check for valid data
          const dailyRate = labor.daily_rate_ghs || labor.rate_ghs;
          if (dailyRate === undefined || dailyRate === null || !labor.labor_category) {
            console.log('Skipping invalid labor entry:', labor);
            return;
          }
          
          const key = `${labor.labor_category}-${labor.skill_level || 'journeyman'}`;
          const existing = laborByCategory.get(key);
          
          // Use survey_date or effective_date for comparison
          const laborDate = labor.survey_date || labor.effective_date;
          const existingDate = existing?.last_updated;
          
          if (!existing || (laborDate && existingDate && new Date(laborDate) > new Date(existingDate))) {
            laborByCategory.set(key, {
              category: labor.labor_category,
              skill_level: labor.skill_level || 'journeyman',
              daily_rate: parseFloat(String(dailyRate)) || 0,
              original_rate: parseFloat(String(dailyRate)) || 0,
              change_yoy: labor.rate_change_percent != null ? parseFloat(String(labor.rate_change_percent)) : null,
              last_updated: (laborDate || new Date().toISOString()).toString().split('T')[0],
            });
          }
        });

        const laborArray = Array.from(laborByCategory.values());
        console.log('Processed labor array:', laborArray);
        if (laborArray.length > 0) {
          setLaborCosts(laborArray);
          setOriginalLaborCosts(laborArray.map(l => ({ ...l })));
          console.log(`Labor data loaded: ${laborArray.length} rates from database`);
        } else {
          console.log('No labor rates found after processing database response');
        }
      } else {
        console.log('Labor API response empty or failed:', laborResponse);
      }

      setLastFetchedAt(new Date().toISOString());

    } catch (err) {
      console.error('Failed to fetch construction data from database:', err);
      setError('Failed to load data from database');
    } finally {
      setLoading(false);
    }
  }, [region]);

  // Fetch data on mount and when region changes
  useEffect(() => {
    fetchConstructionData();
  }, [fetchConstructionData]);

  // Fetch existing overrides for this valuation
  useEffect(() => {
    async function fetchExistingOverrides() {
      if (!valuationId) return;
      try {
        const response = await overridesApi.getByValuation(valuationId);
        if (response.success && response.data) {
          // Filter to only construction cost overrides
          const costOverrides = response.data.filter(o => o.category === 'construction_cost');
          setExistingOverrides(costOverrides);
        }
      } catch (err) {
        console.error('Failed to fetch existing overrides:', err);
      }
    }
    fetchExistingOverrides();
  }, [valuationId]);

  // Calculate effective construction cost based on selected quality tier
  const effectiveConstructionCost = useMemo(() => {
    // For custom quality, default to Standard tier unless user has actually edited material prices
    if (constructionQuality === 'Custom' || constructionQuality === 'custom') {
      // Check if user has actually edited any material prices by comparing with originals
      const hasUserEdits = materialPrices.some((currentPrice, index) => {
        const originalPrice = originalMaterialPrices[index];
        return originalPrice && Math.abs(currentPrice.price_ghs - originalPrice.original_price_ghs) > 0.01;
      });
      
      console.log('Custom tier calculation:', {
        hasUserEdits,
        currentPricesCount: materialPrices.length,
        originalPricesCount: originalMaterialPrices.length,
        materialPricesSum: materialPrices.reduce((sum, m) => sum + (m.price_ghs || 0), 0),
        standardBaseCost: baseCosts2020['standard'],
        regionalFactor: regionalInfo.factor
      });
      
      if (hasUserEdits) {
        // User has made edits, use sum of current material prices
        const customCost = materialPrices.reduce((sum, m) => sum + (m.price_ghs || 0), 0);
        console.log('Using custom material prices sum (user edited):', customCost);
        return customCost;
      }
      
      // No user edits, use Standard tier cost as default for Custom
      const standardBaseCost = baseCosts2020['standard'] || 5000;
      const standardCost = Math.round(standardBaseCost * regionalInfo.factor);
      console.log('Using Standard tier default for Custom (no user edits):', standardCost);
      return standardCost;
    }
    
    // For all other tiers, use their respective base costs
    const tierKey = constructionQuality?.toLowerCase() || qualityTier?.toLowerCase() || 'standard';
    const baseCost = baseCosts2020[tierKey] || baseCosts2020['standard'] || 5000;
    return Math.round(baseCost * regionalInfo.factor);
  }, [materialPrices, originalMaterialPrices, constructionQuality, qualityTier, baseCosts2020, regionalInfo.factor]);

  // Calculate average YoY change from material prices
  const avgPriceChangeYoy = useMemo(() => {
    if (materialPrices.length === 0) return 0;
    const valid = materialPrices
      .map((m) => m.change_yoy)
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    if (valid.length === 0) return 0;
    const total = valid.reduce((sum, v) => sum + v, 0);
    return total / valid.length;
  }, [materialPrices]);

  // Calculate average labor rate
  const avgLaborRate = useMemo(() => {
    if (laborCosts.length === 0) return 0;
    return laborCosts.reduce((sum, l) => sum + (l.daily_rate || 0), 0) / laborCosts.length;
  }, [laborCosts]);

  // Calculate adjusted costs per sqm for each tier (from base costs)
  const adjustedCosts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [tier, baseCost] of Object.entries(baseCosts2020)) {
      result[tier] = Math.round(baseCost * regionalInfo.factor);
    }
    return result;
  }, [baseCosts2020, regionalInfo.factor]);

  // Build full data object for parent component
  const buildDataObject = useCallback((): ConstructionCostEditableData => {
    // Convert material prices to legacy MaterialIndex format for compatibility
    const materialIndices: MaterialIndex[] = materialPrices.map(m => ({
      name: m.category,
      index: 100, // Base index
      change_yoy: m.change_yoy,
      weight: DEFAULT_MATERIAL_WEIGHTS[normalizeCategoryForWeight(m.category)] || 0.05,
      last_updated: m.last_updated,
    }));

    return {
      region,
      region_name: regionalInfo.name,
      effective_date: new Date().toISOString(),
      location_factor: regionalInfo.factor,
      base_costs_2020: baseCosts2020,
      material_prices: materialPrices,
      material_indices: materialIndices,
      labor_costs: laborCosts,
      base_labor_rate: avgLaborRate,
      construction_cost_index: 100,
      index_change_yoy: avgPriceChangeYoy,
      index_base_year: 2020,
      effective_cost_per_sqm: effectiveConstructionCost,
      source: 'Ghana Statistical Service, GREDA (Database)',
      last_updated: lastFetchedAt || new Date().toISOString(),
    };
  }, [region, regionalInfo, baseCosts2020, materialPrices, laborCosts, avgLaborRate, avgPriceChangeYoy, lastFetchedAt, effectiveConstructionCost]);

  // Track previous values to prevent unnecessary updates
  const prevEffectiveCostRef = useRef<number | null>(null);
  const prevMaterialCountRef = useRef<number>(0);
  const prevLaborCountRef = useRef<number>(0);
  
  // Use ref to store onDataChange to avoid re-triggering effect when callback reference changes
  const onDataChangeRef = useRef(onDataChange);
  useEffect(() => {
    onDataChangeRef.current = onDataChange;
  }, [onDataChange]);

  // Notify parent of data changes - only when meaningful data changes
  useEffect(() => {
    // Skip during initial loading
    if (loading) return;
    
    // Only call onDataChange if meaningful data has actually changed
    const currentEffectiveCost = effectiveConstructionCost;
    const currentMaterialCount = materialPrices.length;
    const currentLaborCount = laborCosts.length;
    
    const hasChanged = 
      prevEffectiveCostRef.current !== currentEffectiveCost ||
      prevMaterialCountRef.current !== currentMaterialCount ||
      prevLaborCountRef.current !== currentLaborCount;
    
    if (hasChanged && onDataChangeRef.current) {
      prevEffectiveCostRef.current = currentEffectiveCost;
      prevMaterialCountRef.current = currentMaterialCount;
      prevLaborCountRef.current = currentLaborCount;
      onDataChangeRef.current(buildDataObject());
    }
  }, [effectiveConstructionCost, materialPrices.length, laborCosts.length, buildDataObject, loading]);

  // Update material price and track as pending override
  const handleMaterialPriceChange = (category: string, newPrice: number) => {
    // Find original value
    const original = originalMaterialPrices.find(m => m.category === category);
    const originalValue = original?.original_price_ghs || newPrice;

    // Track as pending override if value differs from original
    if (newPrice !== originalValue) {
      setPendingOverrides(prev => {
        const fieldPath = `material_prices.${category}.price_ghs`;
        const existing = prev.findIndex(o => o.field_path === fieldPath);
        const newOverride = {
          field_path: fieldPath,
          field_label: `${category} Price`,
          system_default_value: originalValue,
          user_override_value: newPrice,
          value_unit: 'GHS',
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newOverride;
          return updated;
        }
        return [...prev, newOverride];
      });
      
      // Set construction quality to "Custom" when user edits prices
      onConstructionQualityChange("Custom");
    }

    setMaterialPrices(prev => prev.map(m =>
      m.category === category
        ? { ...m, price_ghs: newPrice }
        : m
    ));
  };

  // Update labor rate and track as pending override
  const handleLaborRateChange = (category: string, skillLevel: string, newRate: number) => {
    // Find original value
    const original = originalLaborCosts.find(l => l.category === category && l.skill_level === skillLevel);
    const originalValue = original?.original_rate || newRate;

    // Track as pending override if value differs from original
    if (newRate !== originalValue) {
      setPendingOverrides(prev => {
        const fieldPath = `labor_costs.${category}.${skillLevel}.daily_rate`;
        const existing = prev.findIndex(o => o.field_path === fieldPath);
        const newOverride = {
          field_path: fieldPath,
          field_label: `${category} (${skillLevel}) Daily Rate`,
          system_default_value: originalValue,
          user_override_value: newRate,
          value_unit: 'GHS/day',
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newOverride;
          return updated;
        }
        return [...prev, newOverride];
      });
      
      // Set construction quality to "Custom" when user edits labor rates
      onConstructionQualityChange("Custom");
    }

    setLaborCosts(prev => prev.map(l =>
      l.category === category && l.skill_level === skillLevel
        ? { ...l, daily_rate: newRate }
        : l
    ));
  };

  // Start editing
  const startEditing = () => {
    setOriginalMaterialPrices(materialPrices.map(m => ({ ...m })));
    setOriginalLaborCosts(laborCosts.map(l => ({ ...l })));
    setPendingOverrides([]);
    setOverrideReason('');
    setIsEditing(true);
  };

  // Cancel editing
  const cancelEditing = () => {
    setMaterialPrices(originalMaterialPrices.map(m => ({ ...m })));
    setLaborCosts(originalLaborCosts.map(l => ({ ...l })));
    setPendingOverrides([]);
    setOverrideReason('');
    setIsEditing(false);
    setShowReasonDialog(false);
    setError(null);
  };

  // Reset to database values (re-fetch from API)
  const resetToDefaults = () => {
    setPendingOverrides([]);
    setOverrideReason('');
    fetchConstructionData();
  };

  // Initiate save - show reason dialog if there are pending overrides
  const initiateSave = () => {
    if (pendingOverrides.length > 0) {
      setShowReasonDialog(true);
    } else {
      handleSave();
    }
  };

  // Save changes with override tracking
  const handleSave = async () => {
    if (!onSave) {
      setIsEditing(false);
      return;
    }

    // Validate reason is provided if there are overrides
    if (pendingOverrides.length > 0 && !overrideReason.trim()) {
      setError('Please provide a reason for your adjustments');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Create override records in the database
      const createdOverrides: OverrideRecord[] = [];
      if (valuationId && pendingOverrides.length > 0) {
        for (const override of pendingOverrides) {
          const response = await overridesApi.create(valuationId, {
            category: 'construction_cost',
            field_path: override.field_path,
            field_label: override.field_label,
            system_default_value: override.system_default_value,
            user_override_value: override.user_override_value,
            value_unit: override.value_unit,
            reason: overrideReason,
          });
          if (response.success && response.data) {
            createdOverrides.push(response.data);
          }
        }
        // Update existing overrides state
        setExistingOverrides(prev => [...prev, ...createdOverrides]);
      }

      await onSave(buildDataObject(), createdOverrides);
      setPendingOverrides([]);
      setOverrideReason('');
      setShowReasonDialog(false);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const tierLabels: Record<string, string> = {
    luxury: 'Luxury',
    high: 'High',
    standard: 'Standard',
    basic: 'Basic',
    substandard: 'Substandard',
  };

  // Show loading state
  if (loading) {
    return (
      <TerminalPanel
        title={`CONSTRUCTION COSTS: ${regionalInfo.name.toUpperCase()}`}
        className={className}
        status="loading"
        timestamp={formatDate(new Date().toISOString())}
      >
        <div className="flex items-center justify-center py-8 gap-3">
          <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
          <span className="font-mono text-sm text-zinc-400">Loading construction cost data...</span>
        </div>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel
      title={`CONSTRUCTION COSTS: ${regionalInfo.name.toUpperCase()}`}
      className={className}
      status={error ? 'error' : 'live'}
      timestamp={lastFetchedAt ? formatDate(lastFetchedAt) : formatDate(new Date().toISOString())}
      action={
        <div className="flex items-center gap-2">
          {/* Data source indicator */}
          <span className={cn(
            "px-1.5 py-0.5 font-mono text-[9px] rounded",
            error
              ? "bg-red-500/20 text-red-400"
              : "bg-green-500/20 text-green-400"
          )}>
            {error ? 'ERROR' : 'DB'}
          </span>

          {/* Refresh button */}
          <button
            onClick={fetchConstructionData}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Refresh from database"
          >
            <RefreshCw className="w-3 h-3 text-zinc-400" />
          </button>

          <FormulaTooltip />
          {!isEditing ? (
            <button
              onClick={startEditing}
              className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 transition-colors text-[10px] font-mono"
            >
              <Edit2 className="w-3 h-3" />
              ADJUST
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {pendingOverrides.length > 0 && (
                <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 font-mono text-[9px]">
                  {pendingOverrides.length} CHANGE{pendingOverrides.length > 1 ? 'S' : ''}
                </span>
              )}
              <button
                onClick={resetToDefaults}
                className="p-1 hover:bg-zinc-700 rounded transition-colors"
                title="Reset to database values"
              >
                <RotateCcw className="w-3 h-3 text-zinc-400" />
              </button>
              <button
                onClick={cancelEditing}
                className="px-2 py-1 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors text-[10px] font-mono"
              >
                CANCEL
              </button>
              <button
                onClick={initiateSave}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors text-[10px] font-mono disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                APPLY
              </button>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
          >
            {collapsed ? (
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            ) : (
              <ChevronUp className="w-3 h-3 text-zinc-400" />
            )}
          </button>
        </div>
      }
    >
      {/* Override Reason Dialog */}
      {showReasonDialog && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 max-w-lg w-full p-4">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-amber-500" />
              <h3 className="font-mono text-sm text-white">Adjustment Justification Required</h3>
            </div>

            <div className="mb-4 p-3 bg-zinc-800/50 border border-zinc-700">
              <div className="font-mono text-[10px] text-amber-500 uppercase mb-2">Changes Made:</div>
              <div className="space-y-1">
                {pendingOverrides.map((override, idx) => (
                  <div key={idx} className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-zinc-400">{override.field_label}</span>
                    <span className="text-zinc-300">
                      <span className="text-red-400 line-through mr-2">
                        {typeof override.system_default_value === 'number'
                          ? override.system_default_value.toFixed(1)
                          : override.system_default_value}
                      </span>
                      <span className="text-green-400">
                        {typeof override.user_override_value === 'number'
                          ? override.user_override_value.toFixed(1)
                          : override.user_override_value}
                      </span>
                      {override.value_unit && <span className="text-zinc-500 ml-1">{override.value_unit}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-mono text-[10px] text-zinc-400 uppercase mb-2">
                Reason for Adjustment <span className="text-red-500">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why you are adjusting these values from the database defaults (e.g., site-specific conditions, recent market changes, special circumstances)..."
                rows={3}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white font-mono text-xs placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 mb-4">
              <div className="flex items-start gap-2">
                <FileWarning className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="font-mono text-[10px] text-yellow-400">
                  This adjustment will be recorded for audit trail. A disclaimer will appear in the valuation report noting that user-adjusted values were used.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReasonDialog(false)}
                className="px-4 py-2 bg-zinc-700 text-zinc-300 font-mono text-xs hover:bg-zinc-600 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !overrideReason.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                CONFIRM & SAVE
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-[10px]">
          {error}
        </div>
      )}

      {/* Existing Overrides Disclaimer */}
      {existingOverrides.length > 0 && !isEditing && (
        <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-start gap-2">
            <FileWarning className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-mono text-[10px] text-yellow-400 uppercase mb-1">
                User Adjustments Applied ({existingOverrides.length})
              </div>
              <div className="space-y-1">
                {existingOverrides.slice(0, 3).map((override) => (
                  <div key={override.id} className="font-mono text-[9px] text-zinc-400">
                    <span className="text-zinc-300">{override.field_label}:</span>
                    {' '}
                    <span className="text-red-400 line-through">{override.system_default_value}</span>
                    {' → '}
                    <span className="text-green-400">{override.user_override_value}</span>
                    {override.value_unit && <span className="text-zinc-500 ml-1">({override.value_unit})</span>}
                  </div>
                ))}
                {existingOverrides.length > 3 && (
                  <div className="font-mono text-[9px] text-zinc-500">
                    +{existingOverrides.length - 3} more adjustment(s)
                  </div>
                )}
              </div>
              {existingOverrides[0]?.reason && (
                <div className="mt-2 font-mono text-[9px] text-zinc-500">
                  <span className="text-zinc-400">Reason:</span> {existingOverrides[0].reason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {collapsed ? (
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">STANDARD:</span>
              <span className="font-mono text-sm text-white">
                ₵{adjustedCosts.standard?.toLocaleString()}/sqm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">MATERIALS:</span>
              <span className="font-mono text-sm text-white">{materialPrices.length} items</span>
              <TrendIndicator change={avgPriceChangeYoy} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Construction Cost Summary */}
          <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30">
            <div>
              <div className="font-mono text-[10px] text-amber-500 uppercase">Material Prices</div>
              <div className="font-mono text-2xl text-white font-bold">
                {materialPrices.length} items
              </div>
              <div className="font-mono text-[9px] text-zinc-500">
                From database
              </div>
            </div>
            <div className="text-right">
              <TrendIndicator change={avgPriceChangeYoy} />
              <div className="font-mono text-[9px] text-zinc-500 mt-1">Avg. Year-over-year</div>
            </div>
          </div>

          {/* Material Prices (Editable) */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Material Prices (Current Market)
              </span>
              {isEditing && (
                <span className="ml-auto px-2 py-0.5 bg-amber-500/20 text-amber-500 font-mono text-[9px]">
                  EDITING
                </span>
              )}
            </div>

            {materialPrices.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {materialPrices.map((material) => (
                    <div
                      key={material.category}
                      className="flex items-center justify-between py-1 border-b border-zinc-800/30 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-400 capitalize w-20">
                          {material.category}
                        </span>
                        <LastUpdatedBadge date={material.last_updated} />
                      </div>
                      <div className="flex items-center gap-3">
                        {isEditing ? (
                          <EditableNumberInput
                            value={material.price_ghs}
                            onChange={(val) => handleMaterialPriceChange(material.category, val)}
                            min={0}
                            step={1}
                            prefix="₵"
                          />
                        ) : (
                          <span className="font-mono text-xs text-white">
                            ₵{material.price_ghs.toLocaleString()}/{material.unit}
                          </span>
                        )}
                        <TrendIndicator change={material.change_yoy} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 pt-2 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-500">Effective Cost/sqm:</span>
                    <span className="font-mono text-sm text-amber-500 font-bold">₵{effectiveConstructionCost.toFixed(2)}</span>
                  </div>
                  <div className="mt-1">
                    <span className="font-mono text-[9px] text-zinc-500">
                      {(constructionQuality === 'Custom' || constructionQuality === 'custom') 
                        ? (materialPrices.some((currentPrice, index) => {
                            const originalPrice = originalMaterialPrices[index];
                            return originalPrice && Math.abs(currentPrice.price_ghs - originalPrice.original_price_ghs) > 0.01;
                          }) 
                           ? 'Based on your custom material prices' 
                           : 'Using Standard tier (edit material prices to customize)')
                        : `${constructionQuality || qualityTier || 'Standard'} tier + regional factor`}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-4 text-center">
                <span className="font-mono text-[10px] text-zinc-500">
                  No material prices available for this region
                </span>
              </div>
            )}
          </div>

          {/* Labor Rates (Editable) */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Hammer className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Labor Rates (Daily)
              </span>
              {isEditing && (
                <span className="ml-auto px-2 py-0.5 bg-amber-500/20 text-amber-500 font-mono text-[9px]">
                  EDITING
                </span>
              )}
            </div>

            {laborCosts.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {laborCosts.map((labor) => (
                  <div
                    key={`${labor.category}-${labor.skill_level}`}
                    className="flex items-center justify-between py-1 border-b border-zinc-800/30 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-400 capitalize w-24">
                        {labor.category}
                      </span>
                      <span className="font-mono text-[9px] text-zinc-500 capitalize">
                        ({labor.skill_level})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <EditableNumberInput
                          value={labor.daily_rate}
                          onChange={(val) => handleLaborRateChange(labor.category, labor.skill_level, val)}
                          min={0}
                          step={5}
                          prefix="₵"
                          suffix="/day"
                        />
                      ) : (
                        <span className="font-mono text-xs text-white">
                          ₵{labor.daily_rate.toLocaleString()}/day
                        </span>
                      )}
                      <TrendIndicator change={labor.change_yoy} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <span className="font-mono text-[10px] text-zinc-500">
                  No labor rates available for this region
                </span>
              </div>
            )}
          </div>

          {/* Inflation Warning */}
          {avgPriceChangeYoy > 10 && (
            <div className="p-2 bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="font-mono text-[10px] text-yellow-400">
                  High construction cost inflation detected ({avgPriceChangeYoy.toFixed(1)}% YoY).
                  Consider applying an inflation adjustment to historical cost data.
                </span>
              </div>
            </div>
          )}



          {/* Source Info */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="font-mono text-[9px] text-zinc-500">
              Source: Ghana Statistical Service, GREDA (Database)
            </span>
            <span className="font-mono text-[9px] text-zinc-500">
              Last Updated: {lastFetchedAt ? formatDate(lastFetchedAt) : 'N/A'}
            </span>
          </div>
        </div>
      )}
    </TerminalPanel>
  );
}

export default EditableConstructionCostPanel;
