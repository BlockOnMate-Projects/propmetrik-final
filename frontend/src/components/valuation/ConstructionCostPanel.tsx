'use client';

/**
 * Construction Cost Panel
 * 
 * Displays regional construction cost data for Cost Approach valuations including:
 * - Base construction costs by quality tier
 * - Regional cost modifiers
 * - Material cost indices
 * - Labor cost trends
 * 
 * Per valuation.md Step 5: Cost Inputs Module specification
 */

import React, { useEffect, useState } from 'react';
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
  DollarSign,
  MapPin,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { TerminalPanel } from '@/components/ui/terminal';
import { constructionApi, mapPropertyRegionToConstructionCluster } from '@/lib/api';
import { RegionCode } from '@/types/data-hub';
import { cn } from '@/lib/utils';

// =====================================================
// TYPES
// =====================================================

export interface ConstructionCostData {
  region: string;
  region_name: string;
  effective_date: string;

  // Base costs by quality tier (GHS per sqm)
  base_costs: {
    luxury: number;
    high: number;
    standard: number;
    basic: number;
    substandard: number;
  };

  // Regional modifiers
  location_factor: number; // e.g., 1.15 for Accra premium

  // Material indices
  material_indices: Record<string, { index: number; change_yoy: number }>;

  // Labor costs
  labor_costs: {
    skilled_daily: number;
    unskilled_daily: number;
    change_yoy: number;
  };

  // Composite index
  construction_cost_index: number;
  index_change_yoy: number;
  index_base_year: number;

  // Source info
  source: string;
  last_updated: string;
}

interface ConstructionCostPanelProps {
  region: RegionCode;
  qualityTier?: string;
  propertyType?: string;
  onDataLoad?: (data: ConstructionCostData) => void;
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

function CostTierCard({
  tier,
  cost,
  locationFactor,
  isSelected
}: {
  tier: string;
  cost: number;
  locationFactor: number;
  isSelected?: boolean;
}) {
  const adjustedCost = Math.round(cost * locationFactor);

  const tierColors: Record<string, string> = {
    luxury: 'border-purple-500 bg-purple-500/10',
    high: 'border-blue-500 bg-blue-500/10',
    standard: 'border-green-500 bg-green-500/10',
    basic: 'border-yellow-500 bg-yellow-500/10',
    substandard: 'border-red-500 bg-red-500/10',
  };

  return (
    <div className={cn(
      'p-3 border transition-all',
      isSelected ? tierColors[tier] : 'border-zinc-800 bg-zinc-800/30',
      isSelected && 'ring-1 ring-offset-1 ring-offset-black'
    )}>
      <div className="font-mono text-[10px] text-zinc-500 uppercase mb-1">
        {tier}
      </div>
      <div className="font-mono text-lg text-white font-bold">
        ₵{adjustedCost.toLocaleString()}
      </div>
      <div className="font-mono text-[9px] text-zinc-500">
        per sqm (adjusted)
      </div>
      <div className="font-mono text-[9px] text-zinc-600 mt-1">
        Base: ₵{cost.toLocaleString()}/sqm
      </div>
    </div>
  );
}

function MaterialIndexRow({
  name,
  index,
  change
}: {
  name: string;
  index: number;
  change: number;
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-zinc-800/30 last:border-0">
      <span className="font-mono text-[10px] text-zinc-400 capitalize">{name}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-white">{index.toFixed(1)}</span>
        <TrendIndicator change={change} />
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function ConstructionCostPanel({
  region,
  qualityTier,
  propertyType,
  onDataLoad,
  collapsed: initialCollapsed = false,
  className,
}: ConstructionCostPanelProps) {
  const [data, setData] = useState<ConstructionCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Fetch construction cost data from Data Hub
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Map property region to construction cost API cluster
        // Ghana has 16 administrative regions mapped to 5 construction cost clusters
        const regionCode = mapPropertyRegionToConstructionCluster(region);
        const [
          indexResponse,
          materialsResponse,
          laborResponse,
          baseCostsResponse,
          regionMultipliersResponse,
        ] = await Promise.all([
          constructionApi.getIndex(regionCode),
          constructionApi.getMaterials({ region: regionCode }),
          constructionApi.getLaborRates({ region: regionCode }),
          constructionApi.getBaseCosts(),
          constructionApi.getRegionMultipliers(),
        ]);

        // Extract construction cost index
        const indexData = indexResponse?.data;
        const overallIndex = indexData?.overall_index ?? 100;
        const baseYear = indexData?.base_year ?? 2020;

        // Build material indices from material prices
        const materialIndices: Record<string, { index: number; change_yoy: number }> = {};
        const materials = materialsResponse?.data || [];

        // Group materials by category and calculate indices
        const materialsByCategory = materials.reduce((acc: Record<string, any[]>, m: any) => {
          if (!acc[m.material_category]) acc[m.material_category] = [];
          acc[m.material_category].push(m);
          return acc;
        }, {});

        for (const [category, items] of Object.entries(materialsByCategory)) {
          const latestItem = items[0]; // Assuming sorted by date desc
          materialIndices[category] = {
            index: (latestItem.price_ghs / (latestItem.previous_price_ghs || latestItem.price_ghs)) * 100,
            change_yoy: latestItem.price_change_percent ?? 0,
          };
        }

        // Extract labor costs
        const laborRates = laborResponse?.data || [];
        const skilledRates = laborRates.filter((r: any) =>
          r.skill_level === 'journeyman' || r.skill_level === 'master'
        );
        const unskilledRates = laborRates.filter((r: any) =>
          r.skill_level === 'apprentice' || r.labor_category === 'general_laborer'
        );

        const avgSkilledDaily = skilledRates.length > 0
          ? skilledRates.reduce((sum: number, r: any) => sum + r.rate_ghs, 0) / skilledRates.length
          : 0;
        const avgUnskilledDaily = unskilledRates.length > 0
          ? unskilledRates.reduce((sum: number, r: any) => sum + r.rate_ghs, 0) / unskilledRates.length
          : 0;
        const avgLaborChange = laborRates.length > 0
          ? laborRates.reduce((sum: number, r: any) => sum + (r.rate_change_percent || 0), 0) / laborRates.length
          : 0;

        // Extract base costs by quality tier
        const baseCosts = baseCostsResponse?.data || [];
        const baseCostsByTier: Record<string, number> = {
          luxury: 0,
          high: 0,
          standard: 0,
          basic: 0,
          substandard: 0,
        };

        for (const cost of baseCosts) {
          const tier = cost.quality_level?.toLowerCase();
          if (tier && tier in baseCostsByTier) {
            baseCostsByTier[tier] = cost.cost_ghs;
          }
        }

        // Extract region multiplier (location factor)
        const regionMultipliers = regionMultipliersResponse?.data || [];
        const currentRegionMultiplier = regionMultipliers.find(
          (r: any) => r.region === region || r.region === regionCode
        );
        const locationFactor = currentRegionMultiplier?.multiplier ?? 1.0;

        // Format region name
        const regionName = region
          .split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        const costData: ConstructionCostData = {
          region,
          region_name: regionName,
          effective_date: indexData?.last_updated || new Date().toISOString(),
          base_costs: baseCostsByTier as any,
          location_factor: locationFactor,
          material_indices: materialIndices,
          labor_costs: {
            skilled_daily: Math.round(avgSkilledDaily),
            unskilled_daily: Math.round(avgUnskilledDaily),
            change_yoy: avgLaborChange,
          },
          construction_cost_index: overallIndex,
          index_change_yoy: 0, // YoY change would need historical data comparison
          index_base_year: baseYear,
          source: 'PROPMETRIK Data Hub',
          last_updated: indexData?.last_updated || new Date().toISOString(),
        };

        setData(costData);
        onDataLoad?.(costData);
      } catch (err: any) {
        console.error('Failed to fetch construction costs from Data Hub:', err);
        setError(err.message || 'Failed to load construction cost data. Please check Data Hub connection.');
        // Do not set mock data - show error state to user
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [region, onDataLoad]);

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

  if (loading && !data) {
    return (
      <TerminalPanel
        title="CONSTRUCTION COSTS"
        className={className}
        status="loading"
      >
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
          <span className="ml-2 font-mono text-xs text-zinc-500">Loading cost data from Data Hub...</span>
        </div>
      </TerminalPanel>
    );
  }

  // Show error state when data fetch failed
  if (error && !data) {
    const handleRetry = () => {
      setError(null);
      setLoading(true);
      // Force re-fetch by updating region dependency indirectly
      window.location.reload();
    };

    return (
      <TerminalPanel
        title="CONSTRUCTION COSTS"
        className={className}
        status="error"
      >
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <div className="text-center">
            <div className="font-mono text-xs text-red-400 mb-2">Failed to load construction costs</div>
            <div className="font-mono text-[10px] text-zinc-500 max-w-md">{error}</div>
          </div>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-amber-500" />
            <span className="font-mono text-xs text-zinc-300">Retry</span>
          </button>
        </div>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel
      title={`CONSTRUCTION COSTS: ${data?.region_name?.toUpperCase() || region.toUpperCase()}`}
      className={className}
      status={error ? 'error' : 'live'}
      timestamp={data ? formatDate(data.effective_date) : undefined}
      action={
        <div className="flex items-center gap-2">
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
      {collapsed ? (
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">STANDARD:</span>
              <span className="font-mono text-sm text-white">
                ₵{Math.round((data?.base_costs.standard || 5500) * (data?.location_factor || 1)).toLocaleString()}/sqm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">INDEX:</span>
              <span className="font-mono text-sm text-white">{data?.construction_cost_index?.toFixed(1)}</span>
              <TrendIndicator change={data?.index_change_yoy || 0} />
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
                {data?.construction_cost_index?.toFixed(1)}
              </div>
              <div className="font-mono text-[9px] text-zinc-500">
                Base: {data?.index_base_year} = 100
              </div>
            </div>
            <div className="text-right">
              <TrendIndicator change={data?.index_change_yoy || 0} />
              <div className="font-mono text-[9px] text-zinc-500 mt-1">Year-over-year</div>
            </div>
          </div>

          {/* Base Costs by Quality Tier */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Base Construction Costs (per sqm)
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {data?.base_costs && Object.entries(data.base_costs).map(([tier, cost]) => (
                <CostTierCard
                  key={tier}
                  tier={tier}
                  cost={cost}
                  locationFactor={data.location_factor}
                  isSelected={qualityTier === tier}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 p-2 bg-zinc-800/30">
              <MapPin className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-zinc-400">
                Location Factor: <span className="text-white font-bold">{data?.location_factor?.toFixed(2)}</span>
                {' '}({data?.region_name} adjustment applied)
              </span>
            </div>
          </div>

          {/* Material Indices */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Material Price Indices (Base: 100)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-6">
              {data?.material_indices && Object.entries(data.material_indices).map(([material, values]) => (
                <MaterialIndexRow
                  key={material}
                  name={material}
                  index={values.index}
                  change={values.change_yoy}
                />
              ))}
            </div>
          </div>

          {/* Labor Costs */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Hammer className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Labor Costs (Daily Rates)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-2 bg-zinc-800/30">
                <div className="font-mono text-[10px] text-zinc-500">Skilled Labor</div>
                <div className="font-mono text-lg text-white">₵{data?.labor_costs.skilled_daily}</div>
                <div className="font-mono text-[9px] text-zinc-500">per day</div>
              </div>
              <div className="text-center p-2 bg-zinc-800/30">
                <div className="font-mono text-[10px] text-zinc-500">Unskilled Labor</div>
                <div className="font-mono text-lg text-white">₵{data?.labor_costs.unskilled_daily}</div>
                <div className="font-mono text-[9px] text-zinc-500">per day</div>
              </div>
              <div className="text-center p-2 bg-zinc-800/30">
                <div className="font-mono text-[10px] text-zinc-500">YoY Change</div>
                <TrendIndicator change={data?.labor_costs.change_yoy || 0} />
              </div>
            </div>
          </div>

          {/* Inflation Warning */}
          {(data?.index_change_yoy || 0) > 10 && (
            <div className="p-2 bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="font-mono text-[10px] text-yellow-400">
                  High construction cost inflation detected ({data?.index_change_yoy?.toFixed(1)}% YoY).
                  Consider applying an inflation adjustment to historical cost data.
                </span>
              </div>
            </div>
          )}

          {/* Source Info */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="font-mono text-[9px] text-zinc-500">
              Source: {data?.source}
            </span>
            <span className="font-mono text-[9px] text-zinc-500">
              Effective: {data ? formatDate(data.effective_date) : '—'}
            </span>
          </div>
        </div>
      )}
    </TerminalPanel>
  );
}

export default ConstructionCostPanel;
