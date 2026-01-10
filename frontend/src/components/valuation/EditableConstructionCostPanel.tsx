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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

export interface MaterialIndex {
  name: string;
  index: number;
  change_yoy: number;
  weight: number; // Weight in composite calculation
  last_updated?: string;
}

export interface LaborCost {
  type: 'skilled' | 'unskilled';
  daily_rate: number;
  change_yoy: number;
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

  // Base costs by quality tier (GHS per sqm) - these are BASE 2020 values
  base_costs_2020: Record<string, number>;

  // Material indices (editable)
  material_indices: MaterialIndex[];

  // Labor costs (editable)
  labor_costs: LaborCost[];

  // Base labor rate for ratio calculation
  base_labor_rate: number;

  // Composite index (calculated)
  construction_cost_index: number;
  index_change_yoy: number;
  index_base_year: number;

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
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function TrendIndicator({ change }: { change: number }) {
  if (change > 0) {
    return (
      <span className="flex items-center gap-1 text-red-400 font-mono text-[10px]">
        <TrendingUp className="w-3 h-3" />
        +{change.toFixed(1)}%
      </span>
    );
  } else if (change < 0) {
    return (
      <span className="flex items-center gap-1 text-green-400 font-mono text-[10px]">
        <TrendingDown className="w-3 h-3" />
        {change.toFixed(1)}%
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

export function EditableConstructionCostPanel({
  region,
  qualityTier,
  valuationId,
  onDataChange,
  onSave,
  collapsed: initialCollapsed = false,
  className,
}: EditableConstructionCostPanelProps) {
  // State
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'database' | 'fallback'>('database');
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

  // Data state - initialize with empty arrays, will be populated from database
  const [materialIndices, setMaterialIndices] = useState<MaterialIndex[]>([]);
  const [laborCosts, setLaborCosts] = useState<LaborCost[]>([]);
  const [baseCosts2020, setBaseCosts2020] = useState<Record<string, number>>({});
  const [materialWeights, setMaterialWeights] = useState<Record<string, number>>({});
  const [regionalFactors, setRegionalFactors] = useState<Record<string, { name: string; factor: number }>>({});

  // Original values for reset
  const [originalMaterials, setOriginalMaterials] = useState<MaterialIndex[]>([]);
  const [originalLabor, setOriginalLabor] = useState<LaborCost[]>([]);

  // Derived values - get regional info from fetched data or default to 1.0
  const regionalInfo = regionalFactors[region] || { name: region, factor: 1.0 };
  const baseLaborRate = 120; // Base 2020 average labor rate

  // Fetch construction cost data from database
  const fetchConstructionData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Map property region to construction cost API cluster
      // Ghana has 16 administrative regions mapped to 5 construction cost clusters
      const apiRegion = mapPropertyRegionToConstructionCluster(region);

      // Fetch all data in parallel: materials, labor rates, config from database
      const [materialsResponse, laborResponse, weightsResponse, regionalsResponse, baseCostsResponse] = await Promise.all([
        constructionApi.getMaterials({ region: apiRegion }),
        constructionApi.getLaborRates({ region: apiRegion }),
        valuationConfigApi.getMaterialWeights(),
        valuationConfigApi.getRegionalFactors(),
        valuationConfigApi.getBaseCosts(),
      ]);

      // Process material weights from database
      let fetchedWeights: Record<string, number> = {};
      if (weightsResponse.success && weightsResponse.data && weightsResponse.data.length > 0) {
        weightsResponse.data.forEach((w: { category: string; weight: number }) => {
          fetchedWeights[w.category] = w.weight;
        });
        setMaterialWeights(fetchedWeights);
      }

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

      // Transform material prices to MaterialIndex format
      if (materialsResponse.success && materialsResponse.data && materialsResponse.data.length > 0) {
        // Group materials by category and calculate indices
        const categoryMap = new Map<string, { totalPrice: number; count: number; lastUpdated: string }>();

        materialsResponse.data.forEach((material) => {
          const category = material.material_category;
          const existing = categoryMap.get(category);
          if (existing) {
            existing.totalPrice += material.price_ghs;
            existing.count += 1;
            if (new Date(material.survey_date) > new Date(existing.lastUpdated)) {
              existing.lastUpdated = material.survey_date?.toString() || new Date().toISOString();
            }
          } else {
            categoryMap.set(category, {
              totalPrice: material.price_ghs,
              count: 1,
              lastUpdated: material.survey_date?.toString() || new Date().toISOString(),
            });
          }
        });

        // Convert to MaterialIndex array with calculated indices
        const materialIndicesFromDb: MaterialIndex[] = [];
        categoryMap.forEach((value, category) => {
          const avgPrice = value.totalPrice / value.count;
          // Calculate index relative to base (100 = 2020 baseline)
          // Use a safe fallback if avgPrice is 0 or NaN
          const basePrice = avgPrice > 0 ? avgPrice * 0.7 : 100; // Assume ~30% increase since 2020
          const index = basePrice > 0 ? (avgPrice / basePrice) * 100 : 100;
          const materialData = materialsResponse.data?.find((m: any) => m.material_category === category);

          materialIndicesFromDb.push({
            name: category,
            index: isNaN(index) ? 100 : Math.round(index * 10) / 10,
            change_yoy: materialData?.price_change_percent ?? 0,
            weight: fetchedWeights[category] || 0.05,
            last_updated: value.lastUpdated.split('T')[0],
          });
        });

        if (materialIndicesFromDb.length > 0) {
          setMaterialIndices(materialIndicesFromDb);
          setOriginalMaterials(materialIndicesFromDb);
        }
      }

      // Transform labor rates to LaborCost format
      if (laborResponse.success && laborResponse.data && laborResponse.data.length > 0) {
        const skillLevelMap = new Map<'skilled' | 'unskilled', { rate: number; count: number; change: number; lastUpdated: string }>();

        laborResponse.data.forEach((labor) => {
          // Skip records with no rate or category
          if (!labor.rate_ghs || !labor.labor_category) return;

          // Map labor categories to skilled/unskilled
          const type: 'skilled' | 'unskilled' =
            ['mason', 'carpenter', 'plumber', 'electrician', 'painter', 'welder', 'tiler', 'steel_fixer'].includes(labor.labor_category)
              ? 'skilled'
              : 'unskilled';

          const existing = skillLevelMap.get(type);
          if (existing) {
            existing.rate += labor.rate_ghs;
            existing.count += 1;
            existing.change = Math.max(existing.change, labor.rate_change_percent || 0);
            if (new Date(labor.survey_date) > new Date(existing.lastUpdated)) {
              existing.lastUpdated = labor.survey_date?.toString() || new Date().toISOString();
            }
          } else {
            skillLevelMap.set(type, {
              rate: labor.rate_ghs,
              count: 1,
              change: labor.rate_change_percent || 0,
              lastUpdated: labor.survey_date?.toString() || new Date().toISOString(),
            });
          }
        });

        const laborCostsFromDb: LaborCost[] = [];
        skillLevelMap.forEach((value, type) => {
          const avgRate = value.count > 0 ? Math.round(value.rate / value.count) : 0;
          laborCostsFromDb.push({
            type,
            daily_rate: avgRate,
            change_yoy: value.change,
            last_updated: value.lastUpdated.split('T')[0],
          });
        });

        if (laborCostsFromDb.length > 0) {
          setLaborCosts(laborCostsFromDb);
          setOriginalLabor(laborCostsFromDb);
        }
      }

      setDataSource('database');
      setLastFetchedAt(new Date().toISOString());

    } catch (err) {
      console.error('Failed to fetch construction data from database:', err);
      setError('Using fallback data - database unavailable');
      setDataSource('fallback');
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

  // Calculate weighted average material index
  const avgMaterialIndex = useMemo(() => {
    if (materialIndices.length === 0) return 100; // Default to base index
    const totalWeight = materialIndices.reduce((sum, m) => sum + (m.weight || 0), 0);
    if (totalWeight === 0) return 100;
    const weightedSum = materialIndices.reduce((sum, m) => sum + (m.index || 100) * (m.weight || 0), 0);
    const result = weightedSum / totalWeight;
    return isNaN(result) ? 100 : result;
  }, [materialIndices]);

  // Calculate labor factor (average of skilled and unskilled vs base)
  const laborFactor = useMemo(() => {
    if (laborCosts.length === 0) return 1;
    const avgCurrent = laborCosts.reduce((sum, l) => sum + (l.daily_rate || 0), 0) / laborCosts.length;
    const result = avgCurrent / baseLaborRate;
    return isNaN(result) || result === 0 ? 1 : result;
  }, [laborCosts]);

  // Calculate construction cost index
  const constructionCostIndex = useMemo(() => {
    return isNaN(avgMaterialIndex) ? 100 : avgMaterialIndex;
  }, [avgMaterialIndex]);

  // Calculate YoY change for index
  const indexChangeYoy = useMemo(() => {
    if (materialIndices.length === 0) return 0;
    const totalWeight = materialIndices.reduce((sum, m) => sum + (m.weight || 0), 0);
    if (totalWeight === 0) return 0;
    const result = materialIndices.reduce((sum, m) => sum + (m.change_yoy || 0) * (m.weight || 0), 0) / totalWeight;
    return isNaN(result) ? 0 : result;
  }, [materialIndices]);

  // Calculate adjusted costs per sqm for each tier
  const adjustedCosts = useMemo(() => {
    const result: Record<string, number> = {};
    const indexFactor = constructionCostIndex / 100;

    for (const [tier, baseCost] of Object.entries(baseCosts2020)) {
      result[tier] = Math.round(
        baseCost * indexFactor * laborFactor * regionalInfo.factor
      );
    }

    return result;
  }, [baseCosts2020, constructionCostIndex, laborFactor, regionalInfo.factor]);

  // Build full data object
  const buildDataObject = useCallback((): ConstructionCostEditableData => {
    return {
      region,
      region_name: regionalInfo.name,
      effective_date: new Date().toISOString(),
      location_factor: regionalInfo.factor,
      base_costs_2020: baseCosts2020,
      material_indices: materialIndices,
      labor_costs: laborCosts,
      base_labor_rate: baseLaborRate,
      construction_cost_index: constructionCostIndex,
      index_change_yoy: indexChangeYoy,
      index_base_year: 2020,
      source: dataSource === 'database' ? 'Ghana Statistical Service, GREDA (Database)' : 'Fallback Data',
      last_updated: lastFetchedAt || new Date().toISOString(),
    };
  }, [region, regionalInfo, baseCosts2020, materialIndices, laborCosts, constructionCostIndex, indexChangeYoy, dataSource, lastFetchedAt]);

  // Notify parent of data changes
  useEffect(() => {
    onDataChange?.(buildDataObject());
  }, [buildDataObject, onDataChange]);

  // Update material index and track as pending override
  const handleMaterialChange = (name: string, field: 'index' | 'change_yoy', value: number) => {
    // Find original value
    const original = originalMaterials.find(m => m.name === name);
    const originalValue = original ? original[field] : value;

    // Track as pending override if value differs from original
    if (value !== originalValue) {
      setPendingOverrides(prev => {
        const fieldPath = `material_indices.${name}.${field}`;
        const existing = prev.findIndex(o => o.field_path === fieldPath);
        const newOverride = {
          field_path: fieldPath,
          field_label: `${name.charAt(0).toUpperCase() + name.slice(1)} ${field === 'index' ? 'Index' : 'YoY Change'}`,
          system_default_value: originalValue,
          user_override_value: value,
          value_unit: field === 'index' ? 'index' : '%',
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newOverride;
          return updated;
        }
        return [...prev, newOverride];
      });
    }

    setMaterialIndices(prev => prev.map(m =>
      m.name === name
        ? { ...m, [field]: value, last_updated: new Date().toISOString().split('T')[0] }
        : m
    ));
  };

  // Update labor cost and track as pending override
  const handleLaborChange = (type: 'skilled' | 'unskilled', value: number) => {
    // Find original value
    const original = originalLabor.find(l => l.type === type);
    const originalValue = original ? original.daily_rate : value;

    // Track as pending override if value differs from original
    if (value !== originalValue) {
      setPendingOverrides(prev => {
        const fieldPath = `labor_costs.${type}.daily_rate`;
        const existing = prev.findIndex(o => o.field_path === fieldPath);
        const newOverride = {
          field_path: fieldPath,
          field_label: `${type.charAt(0).toUpperCase() + type.slice(1)} Labor Daily Rate`,
          system_default_value: originalValue,
          user_override_value: value,
          value_unit: 'GHS/day',
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newOverride;
          return updated;
        }
        return [...prev, newOverride];
      });
    }

    setLaborCosts(prev => prev.map(l =>
      l.type === type
        ? { ...l, daily_rate: value, last_updated: new Date().toISOString().split('T')[0] }
        : l
    ));
  };

  // Start editing
  const startEditing = () => {
    setOriginalMaterials([...materialIndices]);
    setOriginalLabor([...laborCosts]);
    setPendingOverrides([]);
    setOverrideReason('');
    setIsEditing(true);
  };

  // Cancel editing
  const cancelEditing = () => {
    setMaterialIndices(originalMaterials);
    setLaborCosts(originalLabor);
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
      status={dataSource === 'database' ? 'live' : 'error'}
      timestamp={lastFetchedAt ? formatDate(lastFetchedAt) : formatDate(new Date().toISOString())}
      action={
        <div className="flex items-center gap-2">
          {/* Data source indicator */}
          <span className={cn(
            "px-1.5 py-0.5 font-mono text-[9px] rounded",
            dataSource === 'database'
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400"
          )}>
            {dataSource === 'database' ? 'DB' : 'FALLBACK'}
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
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
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
              <span className="font-mono text-[10px] text-zinc-500">INDEX:</span>
              <span className="font-mono text-sm text-white">{constructionCostIndex.toFixed(1)}</span>
              <TrendIndicator change={indexChangeYoy} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Construction Cost Index Summary */}
          <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30">
            <div>
              <div className="font-mono text-[10px] text-amber-500 uppercase">Construction Cost Index</div>
              <div className="font-mono text-2xl text-white font-bold">
                {constructionCostIndex.toFixed(1)}
              </div>
              <div className="font-mono text-[9px] text-zinc-500">
                Base: 2020 = 100
              </div>
            </div>
            <div className="text-right">
              <TrendIndicator change={indexChangeYoy} />
              <div className="font-mono text-[9px] text-zinc-500 mt-1">Year-over-year</div>
            </div>
          </div>

          {/* Base Costs by Quality Tier (Calculated/Read-only) */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Base Construction Costs (per sqm)
              </span>
              <span className="font-mono text-[9px] text-zinc-500 ml-auto">Calculated</span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {Object.entries(adjustedCosts).map(([tier, cost]) => (
                <div
                  key={tier}
                  className={cn(
                    'p-3 border transition-all',
                    qualityTier === tier
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-800 bg-zinc-800/30'
                  )}
                >
                  <div className="font-mono text-[10px] text-zinc-500 uppercase mb-1">
                    {tierLabels[tier]}
                  </div>
                  <div className="font-mono text-lg text-white font-bold">
                    ₵{cost.toLocaleString()}
                  </div>
                  <div className="font-mono text-[9px] text-zinc-500">
                    per sqm (adjusted)
                  </div>
                  <div className="font-mono text-[9px] text-zinc-600 mt-1">
                    Base: ₵{baseCosts2020[tier as keyof typeof baseCosts2020].toLocaleString()}/sqm
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 p-2 bg-zinc-800/30">
              <MapPin className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-zinc-400">
                Location Factor: <span className="text-white font-bold">{regionalInfo.factor.toFixed(2)}</span>
                {' '}({regionalInfo.name} adjustment applied)
              </span>
            </div>
          </div>

          {/* Material Indices (Editable) */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Material Price Indices (Base: 100)
              </span>
              {isEditing && (
                <span className="ml-auto px-2 py-0.5 bg-amber-500/20 text-amber-500 font-mono text-[9px]">
                  EDITING
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {materialIndices.map((material) => (
                <div
                  key={material.name}
                  className="flex items-center justify-between py-1 border-b border-zinc-800/30 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-400 capitalize w-20">
                      {material.name}
                    </span>
                    <LastUpdatedBadge date={material.last_updated} />
                  </div>
                  <div className="flex items-center gap-3">
                    {isEditing ? (
                      <EditableNumberInput
                        value={material.index}
                        onChange={(val) => handleMaterialChange(material.name, 'index', val)}
                        min={50}
                        max={300}
                        step={0.1}
                      />
                    ) : (
                      <span className="font-mono text-xs text-white">{material.index.toFixed(1)}</span>
                    )}
                    <TrendIndicator change={material.change_yoy} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-500">Weighted Average Index:</span>
                <span className="font-mono text-sm text-amber-500 font-bold">{avgMaterialIndex.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Inflation Warning */}
          {indexChangeYoy > 10 && (
            <div className="p-2 bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="font-mono text-[10px] text-yellow-400">
                  High construction cost inflation detected ({indexChangeYoy.toFixed(1)}% YoY).
                  Consider applying an inflation adjustment to historical cost data.
                </span>
              </div>
            </div>
          )}

          {/* Editing Notice */}
          {isEditing && (
            <div className="p-2 bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-2">
                <Info className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="font-mono text-[10px] text-amber-400">
                  Adjustments are for this valuation only. Database values are managed by admin via Data Hub
                  and updated bi-weekly.
                </span>
              </div>
            </div>
          )}

          {/* Source Info */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="font-mono text-[9px] text-zinc-500">
              Source: {dataSource === 'database' ? 'Ghana Statistical Service, GREDA (Database)' : 'Fallback Data'}
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
