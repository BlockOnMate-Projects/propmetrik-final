'use client';

/**
 * Market Context Panel
 * 
 * Displays comprehensive market data context for valuations including:
 * - Economic indicators (inflation, GDP, policy rate, exchange rate)
 * - Market conditions (trend, activity, price index, days on market)
 * - Risk premiums (cap rates, discount rates)
 * - Seasonal factors
 * 
 * Per valuation.md Step 4: Market Data Context specification
 */

import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  DollarSign,
  Percent,
  Calendar,
  Building2,
  BarChart3,
  Info,
} from 'lucide-react';
import { TerminalPanel, Metric } from '@/components/ui/terminal';
import { marketApi } from '@/lib/valuation-api';
import { economicApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// =====================================================
// HELPERS
// =====================================================

/**
 * Safely format a number with toFixed, handling undefined/null/string values
 */
function safeToFixed(value: unknown, decimals: number = 2, fallback: string = '0'): string {
  if (value === null || value === undefined) return fallback;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return fallback;
  return num.toFixed(decimals);
}

// =====================================================
// TYPES
// =====================================================

interface EconomicFactors {
  inflation_rate: number | null;
  interest_rate_policy: number | null;
  mortgage_rate_avg: number | null;
  exchange_rate_usd: number | null;
  gdp_growth: number | null;
  unemployment_rate?: number | null;
  construction_cost_index?: number | null;
  consumer_confidence?: number | null;
  snapshot_date?: string;
}

interface MarketConditions {
  trend: 'rising' | 'stable' | 'falling' | 'unknown';
  trend_strength: number;
  activity_level: 'high' | 'moderate' | 'low' | 'unknown';
  days_on_market_avg: number | null;
  supply_demand_ratio: number | null;
  price_index: number | null;
  price_index_change_yoy: number | null;
  market_trend?: string;
  price_trend_12m?: number;
  price_trend_3m?: number;
  seasonal_factor?: number;
  cycle_phase?: string;
  price_metrics?: {
    median_price?: number;
    avg_price?: number;
    price_per_sqm?: number;
    average_per_sqm?: number;
    year_over_year_change?: number;
    price_range?: { min: number; max: number };
  };
}

interface RiskPremiums {
  base_discount_rate: number;
  risk_free_rate: number;
  market_risk_premium: number;
  cap_rate_range: { min: number; max: number };
  terminal_cap_rate_range: { min: number; max: number };
  yield_adjustment: number;
}

export interface MarketContextData {
  economic: EconomicFactors;
  market: MarketConditions;
  risk_premiums?: RiskPremiums;
  last_updated: string;
}

interface MarketContextPanelProps {
  region: string;
  propertyType?: string;
  valuationDate?: Date;
  collapsed?: boolean;
  onDataLoad?: (data: MarketContextData) => void;
  className?: string;
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function TrendIndicator({ trend, value }: { trend: 'up' | 'down' | 'stable'; value?: string }) {
  const icons = {
    up: <TrendingUp className="w-3 h-3" />,
    down: <TrendingDown className="w-3 h-3" />,
    stable: <Minus className="w-3 h-3" />,
  };
  
  const colors = {
    up: 'text-green-400',
    down: 'text-red-400',
    stable: 'text-zinc-400',
  };
  
  return (
    <span className={cn('flex items-center gap-1 font-mono text-[10px]', colors[trend])}>
      {icons[trend]}
      {value && <span>{value}</span>}
    </span>
  );
}

function ProgressBar({ 
  value, 
  max = 100, 
  color = 'amber',
  showValue = true,
  label 
}: { 
  value: number | string | null | undefined; 
  max?: number; 
  color?: 'amber' | 'green' | 'red' | 'blue';
  showValue?: boolean;
  label?: string;
}) {
  // Safely convert value to number
  const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  const percentage = Math.min((numValue / max) * 100, 100);
  const colorClasses = {
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };
  
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between">
          <span className="font-mono text-[10px] text-zinc-400">{label}</span>
          {showValue && (
            <span className="font-mono text-[10px] text-white">{safeToFixed(numValue, 1)}%</span>
          )}
        </div>
      )}
      <div className="h-1.5 bg-zinc-800 overflow-hidden">
        <div 
          className={cn('h-full transition-all duration-500', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function MarketCycleIndicator({ phase }: { phase?: string }) {
  const phases = ['recovery', 'expansion', 'hyper_supply', 'recession'];
  const currentPhase = phase?.toLowerCase() || 'expansion';
  const phaseIndex = phases.indexOf(currentPhase);
  
  return (
    <div className="flex items-center gap-1">
      {phases.map((p, i) => (
        <div 
          key={p}
          className={cn(
            'w-3 h-3 rounded-full border',
            i === phaseIndex 
              ? 'bg-amber-500 border-amber-400' 
              : i < phaseIndex 
                ? 'bg-zinc-600 border-zinc-500' 
                : 'bg-zinc-800 border-zinc-700'
          )}
          title={p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ')}
        />
      ))}
      <span className="ml-2 font-mono text-[10px] text-amber-400 uppercase">
        {currentPhase.replace('_', ' ')}
      </span>
    </div>
  );
}

function ActivityLevel({ level }: { level: 'high' | 'moderate' | 'low' | 'unknown' }) {
  const dots = {
    high: [true, true, true, true, true],
    moderate: [true, true, true, false, false],
    low: [true, false, false, false, false],
    unknown: [false, false, false, false, false],
  };
  
  return (
    <div className="flex items-center gap-1">
      {dots[level].map((active, i) => (
        <div 
          key={i}
          className={cn(
            'w-2 h-2 rounded-full',
            active ? 'bg-amber-500' : 'bg-zinc-700'
          )}
        />
      ))}
      <span className="ml-2 font-mono text-[10px] text-zinc-400 uppercase">{level}</span>
    </div>
  );
}

function SeasonalFactorChart({ currentMonth, factors }: { currentMonth: number; factors?: number[] }) {
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  
  // If no factors provided, show a placeholder message
  if (!factors || factors.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-zinc-500 font-mono text-[10px]">
        Seasonal factor data not available from Data Hub
      </div>
    );
  }
  
  const data = factors;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-8">
        {data.map((value, i) => {
          const height = ((value - min) / range) * 100;
          return (
            <div 
              key={i}
              className="flex-1 flex flex-col items-center"
            >
              <div 
                className={cn(
                  'w-full transition-all',
                  i === currentMonth ? 'bg-amber-500' : 'bg-zinc-600'
                )}
                style={{ height: `${Math.max(height, 10)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5">
        {monthLabels.map((label, i) => (
          <div 
            key={i}
            className={cn(
              'flex-1 text-center font-mono text-[8px]',
              i === currentMonth ? 'text-amber-500' : 'text-zinc-500'
            )}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function MarketContextPanel({
  region,
  propertyType,
  valuationDate,
  collapsed: initialCollapsed = false,
  onDataLoad,
  className,
}: MarketContextPanelProps) {
  const [data, setData] = useState<MarketContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  
  const currentMonth = (valuationDate || new Date()).getMonth();
  
  // Fetch market data from Data Hub
  useEffect(() => {
    async function fetchMarketData() {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch from Data Hub APIs - economic snapshot and market conditions
        const [economicResponse, conditionsResponse, indicesResponse] = await Promise.all([
          economicApi.getSnapshot(),
          marketApi.getConditions(region, propertyType),
          marketApi.getMarketIndices(region),
        ]);
        
        // Build economic factors from Data Hub economic snapshot
        const economicSnapshot = economicResponse?.data;
        const economicFactors: EconomicFactors = {
          inflation_rate: economicSnapshot?.inflation_rate ?? null,
          interest_rate_policy: economicSnapshot?.interest_rate_policy ?? null,
          mortgage_rate_avg: economicSnapshot?.mortgage_rate_avg ?? null,
          exchange_rate_usd: economicSnapshot?.exchange_rate_usd ?? null,
          gdp_growth: economicSnapshot?.gdp_growth ?? null,
          unemployment_rate: economicSnapshot?.unemployment_rate ?? null,
          snapshot_date: economicSnapshot?.date ? new Date(economicSnapshot.date).toISOString() : undefined,
        };
        
        // Build market conditions from market API response
        const conditionsData = conditionsResponse?.data?.conditions || conditionsResponse?.data;
        const marketConditions: MarketConditions = {
          trend: conditionsData?.market_trend || conditionsData?.trend || 'unknown',
          trend_strength: conditionsData?.trend_strength ?? 0,
          activity_level: conditionsData?.activity_level || conditionsData?.demand_level || 'unknown',
          days_on_market_avg: conditionsData?.days_on_market_avg ?? null,
          supply_demand_ratio: conditionsData?.supply_demand_ratio ?? null,
          price_index: indicesResponse?.data?.price_index ?? conditionsData?.price_index ?? null,
          price_index_change_yoy: conditionsData?.price_index_change_yoy ?? conditionsData?.price_growth_rate ?? null,
          seasonal_factor: conditionsData?.seasonal_factor,
          cycle_phase: conditionsData?.cycle_phase,
          price_trend_12m: conditionsData?.price_trend_12m,
          price_trend_3m: conditionsData?.price_trend_3m,
          price_metrics: conditionsData?.price_metrics,
        };
        
        // Risk premiums - derived from economic data
        const policyRate = economicFactors.interest_rate_policy ?? 29.5;
        const riskPremiums: RiskPremiums = {
          base_discount_rate: policyRate + 4.0, // Policy rate + spread
          risk_free_rate: policyRate,
          market_risk_premium: 4.5,
          cap_rate_range: { min: 6.5, max: 8.5 },
          terminal_cap_rate_range: { min: 7.0, max: 9.0 },
          yield_adjustment: 0.5,
        };
        
        const marketData: MarketContextData = {
          economic: economicFactors,
          market: marketConditions,
          risk_premiums: riskPremiums,
          last_updated: conditionsResponse?.data?.last_updated || economicSnapshot?.date || new Date().toISOString(),
        };
        
        setData(marketData);
        onDataLoad?.(marketData);
      } catch (err: any) {
        console.error('Failed to fetch market data from Data Hub:', err);
        setError(err.message || 'Failed to load market data. Please check Data Hub connection.');
        // Do not set mock data - show error state to user
      } finally {
        setLoading(false);
      }
    }
    
    fetchMarketData();
  }, [region, propertyType, onDataLoad]);
  
  const handleRefresh = () => {
    setLoading(true);
    // Re-trigger useEffect by changing a dep would be better, but for now just reload
    window.location.reload();
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
  
  const getTrendDirection = (trend: string): 'up' | 'down' | 'stable' => {
    if (trend === 'rising') return 'up';
    if (trend === 'falling') return 'down';
    return 'stable';
  };

  if (loading && !data) {
    return (
      <TerminalPanel 
        title="MARKET DATA CONTEXT" 
        className={className}
        status="loading"
      >
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
            <span className="font-mono text-xs text-zinc-500">Loading market data from Data Hub...</span>
          </div>
        </div>
      </TerminalPanel>
    );
  }

  // Show error state when data fetch failed
  if (error && !data) {
    return (
      <TerminalPanel 
        title="MARKET DATA CONTEXT" 
        className={className}
        status="error"
      >
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <div className="text-center">
            <div className="font-mono text-xs text-red-400 mb-2">Failed to load market data</div>
            <div className="font-mono text-[10px] text-zinc-500 max-w-md">{error}</div>
          </div>
          <button 
            onClick={handleRefresh}
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
      title={`MARKET DATA CONTEXT: ${region.toUpperCase()}`}
      className={className}
      status={error ? 'error' : 'live'}
      timestamp={data ? formatDate(data.last_updated) : undefined}
      action={
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRefresh}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-3 h-3 text-zinc-400" />
          </button>
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
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">TREND:</span>
              <TrendIndicator 
                trend={getTrendDirection(data?.market.trend || 'stable')} 
                value={`${(data?.market.price_index_change_yoy || 0) > 0 ? '+' : ''}${safeToFixed(data?.market.price_index_change_yoy, 1)}%`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">ACTIVITY:</span>
              <ActivityLevel level={data?.market.activity_level || 'moderate'} />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">SEASONAL:</span>
              <span className="font-mono text-xs text-white">{safeToFixed(data?.market.seasonal_factor, 2, '1.00')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Economic Indicators */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Economic Indicators
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <ProgressBar 
                  value={data?.economic.inflation_rate || 0} 
                  max={40}
                  color="red"
                  label="Inflation Rate (YoY)"
                />
              </div>
              <div>
                <ProgressBar 
                  value={data?.economic.gdp_growth || 0} 
                  max={15}
                  color="green"
                  label="GDP Growth (YoY)"
                />
              </div>
              <div>
                <ProgressBar 
                  value={data?.economic.interest_rate_policy || 0} 
                  max={40}
                  color="amber"
                  label="Policy Rate (BoG)"
                />
              </div>
              <div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-zinc-400">USD/GHS Exchange</span>
                    <span className="font-mono text-[10px] text-white">₵{safeToFixed(data?.economic?.exchange_rate_usd, 2)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800">
                    <div className="h-full bg-blue-500" style={{ width: '60%' }} />
                  </div>
                </div>
              </div>
              <div>
                <ProgressBar 
                  value={data?.economic.mortgage_rate_avg || 0} 
                  max={40}
                  color="amber"
                  label="Mortgage Rate (Avg)"
                />
              </div>
              <div>
                <ProgressBar 
                  value={data?.economic.unemployment_rate || 0} 
                  max={15}
                  color="blue"
                  label="Unemployment Rate"
                />
              </div>
            </div>
          </div>
          
          {/* Market Conditions */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Market Conditions: {propertyType || 'Residential'}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-2 bg-zinc-800/30">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Market Trend</div>
                <TrendIndicator 
                  trend={getTrendDirection(data?.market.trend || 'stable')} 
                  value={data?.market.price_index_change_yoy != null 
                    ? `${Number(data.market.price_index_change_yoy) > 0 ? '+' : ''}${safeToFixed(data.market.price_index_change_yoy, 1)}% (12M)`
                    : '— (12M)'
                  }
                />
              </div>
              <div className="text-center p-2 bg-zinc-800/30">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Market Activity</div>
                <ActivityLevel level={data?.market.activity_level || 'moderate'} />
              </div>
              <div className="text-center p-2 bg-zinc-800/30">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Market Cycle</div>
                <MarketCycleIndicator phase={data?.market.cycle_phase} />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Price Index</div>
                <div className="font-mono text-lg text-white">{safeToFixed(data?.market.price_index, 1, '100.0')}</div>
                <div className="font-mono text-[9px] text-zinc-500">Base: 100 (Jan 2024)</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Days on Market</div>
                <div className="font-mono text-lg text-white">{data?.market.days_on_market_avg || '—'}</div>
                <div className="font-mono text-[9px] text-zinc-500">Average</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Supply/Demand</div>
                <div className="font-mono text-lg text-white">
                  {safeToFixed(data?.market.supply_demand_ratio, 2, '1.00')}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">
                  {(data?.market.supply_demand_ratio || 1) > 1.1 ? 'Oversupply' : 
                   (data?.market.supply_demand_ratio || 1) < 0.9 ? 'Undersupply' : 'Balanced'}
                </div>
              </div>
            </div>
          </div>
          
          {/* Risk Premiums */}
          <div className="border border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Percent className="w-3 h-3 text-amber-500" />
              <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
                Derived Risk Premiums
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Base Discount Rate</div>
                <div className="font-mono text-lg text-white">{safeToFixed(data?.risk_premiums?.base_discount_rate, 1, '14.0')}%</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Risk-Free Rate</div>
                <div className="font-mono text-lg text-white">{safeToFixed(data?.risk_premiums?.risk_free_rate, 1, '29.5')}%</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Market Risk Premium</div>
                <div className="font-mono text-lg text-white">{safeToFixed(data?.risk_premiums?.market_risk_premium, 1, '4.5')}%</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Cap Rate Range</div>
                <div className="font-mono text-lg text-white">
                  {safeToFixed(data?.risk_premiums?.cap_rate_range?.min, 1, '6.5')}% - {safeToFixed(data?.risk_premiums?.cap_rate_range?.max, 1, '8.5')}%
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Terminal Cap Rate</div>
                <div className="font-mono text-lg text-white">
                  {safeToFixed(data?.risk_premiums?.terminal_cap_rate_range?.min, 1, '7.0')}% - {safeToFixed(data?.risk_premiums?.terminal_cap_rate_range?.max, 1, '9.0')}%
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">Yield Adjustment</div>
                <div className="font-mono text-lg text-white">+{safeToFixed(data?.risk_premiums?.yield_adjustment, 1, '0.5')}%</div>
                <div className="font-mono text-[9px] text-zinc-500">(inflation)</div>
              </div>
            </div>
            
            <div className="mt-3 p-2 bg-zinc-800/30 border-l-2 border-amber-500">
              <div className="flex items-start gap-2">
                <Info className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="font-mono text-[10px] text-zinc-400">
                  These rates are derived from market analysis and should be reviewed for each specific property circumstance.
                </span>
              </div>
            </div>
          </div>
          
          {/* Data Sources */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <span className="font-mono text-[9px] text-zinc-500">
              Sources: Bank of Ghana, Ghana Statistical Service, PROPMETRIK DB
            </span>
            <span className="font-mono text-[9px] text-zinc-500">
              Last Updated: {data ? formatDate(data.last_updated) : '—'}
            </span>
          </div>
        </div>
      )}
    </TerminalPanel>
  );
}

export default MarketContextPanel;
