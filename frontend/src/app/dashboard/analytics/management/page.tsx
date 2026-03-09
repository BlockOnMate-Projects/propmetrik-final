'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/authed-fetch';
import {
  Landmark,
  TrendingUp,
  RefreshCw,
  DollarSign,
  Percent,
  Building2,
  Home,
  BarChart3,
  ArrowUpRight,
  PiggyBank,
} from 'lucide-react';

// =====================================================
// TYPES
// =====================================================

interface ManagementKPIs {
  avg_cap_rate: number;
  avg_monthly_rent: number;
  avg_annual_noi: number;
  avg_gross_yield: number;
  total_rental_properties: number;
  total_sale_properties: number;
}

interface CapRateBenchmark {
  region: string;
  property_type: string;
  cap_rate_min: number;
  cap_rate_max: number;
  cap_rate_median: number;
  cap_rate_mean: number;
  sample_size: number;
}

interface RentalSummary {
  region: string;
  property_type: string;
  listing_count: string;
  avg_rent: string;
  median_rent: string;
  min_rent: string;
  max_rent: string;
}

interface NOIBreakdown {
  region: string;
  property_type: string;
  listing_count: number;
  avg_monthly_rent: number;
  median_monthly_rent: number;
  annual_gross_income: number;
  estimated_noi: number;
  operating_expense_ratio: number;
}

interface YieldData {
  region: string;
  property_type: string;
  avg_monthly_rent: number;
  avg_sale_price: number;
  gross_rental_yield: number;
  net_rental_yield: number;
  rental_listings: number;
  sale_listings: number;
}

interface ManagementData {
  kpis: ManagementKPIs;
  cap_rates: CapRateBenchmark[];
  rental_summary: RentalSummary[];
  noi_breakdown: NOIBreakdown[];
  yields: YieldData[];
}

// =====================================================
// HELPERS
// =====================================================

function formatRegion(r: string) {
  return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `GH₵${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `GH₵${(n / 1_000).toFixed(0)}K`;
  return `GH₵${n.toFixed(0)}`;
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

// =====================================================
// COMPONENTS
// =====================================================

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'border bg-zinc-900/50 p-4',
      highlight ? 'border-amber-500/50' : 'border-zinc-800'
    )}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-amber-500" />}
        <span className="font-mono text-[10px] text-zinc-500 tracking-wider">{label}</span>
      </div>
      <div className="font-mono text-2xl text-white">{value}</div>
      {sub && <div className="font-mono text-[10px] text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

// Cap rate gauge
function CapRateBar({ min, max, median, mean }: { min: number; max: number; median: number; mean: number }) {
  const scale = 20; // max 20% scale
  return (
    <div className="relative h-4 bg-zinc-800 overflow-hidden">
      {/* Range bar */}
      <div
        className="absolute h-full bg-amber-600/40"
        style={{
          left: `${(min / scale) * 100}%`,
          width: `${((max - min) / scale) * 100}%`,
        }}
      />
      {/* Median marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-amber-400"
        style={{ left: `${(median / scale) * 100}%` }}
      />
      {/* Mean marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-green-400"
        style={{ left: `${(mean / scale) * 100}%` }}
      />
    </div>
  );
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function ManagementMetricsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<ManagementData | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  useEffect(() => {
    const ac = new AbortController();
    loadData(ac.signal);
    return () => ac.abort();
  }, [selectedRegion]);

  const loadData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const url =
        selectedRegion === 'all'
          ? '/api/analytics/management/summary'
          : `/api/analytics/management/summary?region=${selectedRegion}`;
      const res = await authedFetch(url, { signal });
      const json = await res.json();
      if (signal?.aborted) return;
      setData(json.data || null);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Failed to load management data:', e);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const regions = data
    ? [...new Set(data.cap_rates.map((c) => c.region))].sort()
    : [];

  const kpis = data?.kpis;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-500" />
            <h1 className="font-mono text-sm text-white tracking-wider">
              PROPERTY MANAGEMENT METRICS
            </h1>
          </div>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
            Cap Rate, NOI, Average Rent, Rental Yields & Returns
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Region filter */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="font-mono text-[10px] bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1 focus:border-amber-500 focus:outline-none"
          >
            <option value="all">ALL REGIONS</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {formatRegion(r)}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const ac = new AbortController();
              loadData(ac.signal);
            }}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] border transition-colors',
              isLoading
                ? 'border-zinc-700 text-zinc-500 cursor-not-allowed'
                : 'border-zinc-700 text-zinc-300 hover:border-amber-500 hover:text-amber-500'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
            {isLoading ? 'LOADING...' : 'REFRESH'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
            <span className="font-mono text-xs text-zinc-400">Loading management metrics...</span>
          </div>
        </div>
      )}

      {!isLoading && data && kpis && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-6 gap-3">
            <KPICard
              label="AVG CAP RATE"
              value={`${kpis.avg_cap_rate.toFixed(1)}%`}
              icon={Percent}
              sub="across all property types"
              highlight
            />
            <KPICard
              label="AVG MONTHLY RENT"
              value={formatCurrency(kpis.avg_monthly_rent)}
              icon={DollarSign}
              sub={`${formatNumber(kpis.total_rental_properties)} rental properties`}
            />
            <KPICard
              label="AVG ANNUAL NOI"
              value={formatCurrency(kpis.avg_annual_noi)}
              icon={PiggyBank}
              sub="30% operating expenses"
            />
            <KPICard
              label="GROSS YIELD"
              value={`${kpis.avg_gross_yield.toFixed(1)}%`}
              icon={TrendingUp}
              sub="rent-to-price ratio"
            />
            <KPICard
              label="RENTAL PROPERTIES"
              value={formatNumber(kpis.total_rental_properties)}
              icon={Home}
              sub="active rental listings"
            />
            <KPICard
              label="SALE PROPERTIES"
              value={formatNumber(kpis.total_sale_properties)}
              icon={Building2}
              sub="active sale listings"
            />
          </div>

          {/* Cap Rate Benchmarks */}
          <Panel title="CAP RATE BENCHMARKS BY REGION & TYPE">
            {data.cap_rates.length > 0 ? (
              <div className="space-y-3">
                {data.cap_rates.map((cr, i) => (
                  <div key={i} className="border border-zinc-800 p-2 hover:bg-zinc-800/20">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white">
                          {formatRegion(cr.region)}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {formatRegion(cr.property_type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[10px]">
                        <span className="text-zinc-500">n={cr.sample_size}</span>
                        <span className="text-amber-400">
                          median {(cr.cap_rate_median * 100).toFixed(1)}%
                        </span>
                        <span className="text-green-400">
                          mean {(cr.cap_rate_mean * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <CapRateBar
                      min={cr.cap_rate_min * 100}
                      max={cr.cap_rate_max * 100}
                      median={cr.cap_rate_median * 100}
                      mean={cr.cap_rate_mean * 100}
                    />
                    <div className="flex justify-between font-mono text-[8px] text-zinc-600 mt-0.5">
                      <span>{(cr.cap_rate_min * 100).toFixed(1)}%</span>
                      <span>{(cr.cap_rate_max * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 pt-2 border-t border-zinc-800 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-amber-400" />
                    <span className="text-zinc-500">Median</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-green-400" />
                    <span className="text-zinc-500">Mean</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-3 bg-amber-600/40" />
                    <span className="text-zinc-500">Range (Min-Max)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="font-mono text-xs text-zinc-600 text-center py-6">No cap rate data</div>
            )}
          </Panel>

          {/* NOI + Yields Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* NOI Breakdown */}
            <Panel title="NET OPERATING INCOME (NOI)">
              {data.noi_breakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-[10px]">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left py-1.5 pr-2">REGION</th>
                        <th className="text-left py-1.5 pr-2">TYPE</th>
                        <th className="text-right py-1.5 pr-2">AVG RENT/MO</th>
                        <th className="text-right py-1.5 pr-2">ANNUAL GROSS</th>
                        <th className="text-right py-1.5">EST. NOI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.noi_breakdown.map((noi, i) => (
                        <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-1.5 pr-2 text-white">{formatRegion(noi.region)}</td>
                          <td className="py-1.5 pr-2 text-zinc-400">{formatRegion(noi.property_type)}</td>
                          <td className="py-1.5 pr-2 text-right text-zinc-300">
                            {formatCurrency(noi.avg_monthly_rent)}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-zinc-300">
                            {formatCurrency(noi.annual_gross_income)}
                          </td>
                          <td className="py-1.5 text-right text-green-400">{formatCurrency(noi.estimated_noi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="font-mono text-[8px] text-zinc-600 mt-2">
                    * NOI = Annual Gross Income × (1 - 30% operating expenses)
                  </div>
                </div>
              ) : (
                <div className="font-mono text-xs text-zinc-600 text-center py-6">No NOI data</div>
              )}
            </Panel>

            {/* Rental Yields / Returns */}
            <Panel title="RENTAL YIELDS & RETURNS">
              {data.yields.length > 0 ? (
                <div className="space-y-3">
                  {data.yields.map((y, i) => {
                    const colors = y.gross_rental_yield >= 10 ? 'text-green-400' : y.gross_rental_yield >= 6 ? 'text-amber-400' : 'text-red-400';
                    return (
                      <div key={i} className="border border-zinc-800 p-2 hover:bg-zinc-800/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-white">
                            {formatRegion(y.region)}{' '}
                            <span className="text-zinc-500">{formatRegion(y.property_type)}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <ArrowUpRight className={cn('w-3 h-3', colors)} />
                            <span className={cn('font-mono text-xs font-bold', colors)}>
                              {y.gross_rental_yield.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 font-mono text-[10px]">
                          <div>
                            <span className="text-zinc-500">RENT/MO</span>
                            <div className="text-zinc-300">{formatCurrency(y.avg_monthly_rent)}</div>
                          </div>
                          <div>
                            <span className="text-zinc-500">SALE PRICE</span>
                            <div className="text-zinc-300">{formatCurrency(y.avg_sale_price)}</div>
                          </div>
                          <div>
                            <span className="text-zinc-500">GROSS YIELD</span>
                            <div className={colors}>{y.gross_rental_yield.toFixed(2)}%</div>
                          </div>
                          <div>
                            <span className="text-zinc-500">NET YIELD</span>
                            <div className="text-zinc-300">{y.net_rental_yield.toFixed(2)}%</div>
                          </div>
                        </div>
                        {/* Yield bar */}
                        <div className="mt-1.5 h-2 bg-zinc-800 overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all duration-500',
                              y.gross_rental_yield >= 10
                                ? 'bg-green-500'
                                : y.gross_rental_yield >= 6
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            )}
                            style={{ width: `${Math.min(y.gross_rental_yield * 5, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="font-mono text-xs text-zinc-600 text-center py-6">
                  No yield data (need both rental & sale properties in same region+type)
                </div>
              )}
            </Panel>
          </div>

          {/* Rental Summary Table */}
          <Panel title="RENTAL MARKET SUMMARY">
            {data.rental_summary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-[10px]">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="text-left py-1.5 pr-2">REGION</th>
                      <th className="text-left py-1.5 pr-2">TYPE</th>
                      <th className="text-right py-1.5 pr-2">COUNT</th>
                      <th className="text-right py-1.5 pr-2">AVG RENT</th>
                      <th className="text-right py-1.5 pr-2">MEDIAN</th>
                      <th className="text-right py-1.5 pr-2">MIN</th>
                      <th className="text-right py-1.5">MAX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rental_summary.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-1.5 pr-2 text-white">{formatRegion(r.region)}</td>
                        <td className="py-1.5 pr-2 text-zinc-400">{formatRegion(r.property_type)}</td>
                        <td className="py-1.5 pr-2 text-right text-zinc-400">{r.listing_count}</td>
                        <td className="py-1.5 pr-2 text-right text-green-400">
                          {formatCurrency(parseFloat(r.avg_rent))}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-zinc-300">
                          {formatCurrency(parseFloat(r.median_rent))}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-zinc-500">
                          {formatCurrency(parseFloat(r.min_rent))}
                        </td>
                        <td className="py-1.5 text-right text-zinc-500">
                          {formatCurrency(parseFloat(r.max_rent))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="font-mono text-xs text-zinc-600 text-center py-6">No rental data</div>
            )}
          </Panel>
        </>
      )}

      {!isLoading && !data && (
        <div className="flex items-center justify-center py-20">
          <span className="font-mono text-xs text-zinc-500">No management data available</span>
        </div>
      )}
    </div>
  );
}
