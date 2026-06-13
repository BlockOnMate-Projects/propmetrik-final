'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/authed-fetch';
import {
  MapPin,
  Building2,
  TrendingUp,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Home,
  BarChart3,
  Globe,
} from 'lucide-react';

// =====================================================
// TYPES
// =====================================================

interface GeographicDistribution {
  region: string;
  count: number;
  percentage: number;
}

interface RegionalInvestment {
  region: string;
  avg_price: number;
  median_price: number;
  total_listings: number;
  avg_price_per_sqm: number;
  avg_rental_yield?: number;
  property_types: Record<string, number>;
}

interface PriceIndex {
  region: string;
  property_type: string;
  avg_price: number;
  price_per_sqm: number;
  listing_count: number;
  change_pct?: number;
}

interface RentalByRegion {
  region: string;
  avg_rent: number;
  median_rent: number;
  listing_count: number;
  avg_rent_per_sqm?: number;
}

// =====================================================
// API
// =====================================================

const geoApi = {
  async getDistribution(signal?: AbortSignal): Promise<GeographicDistribution[]> {
    try {
      const res = await authedFetch('/api/data-hub/analytics/geographic', { signal });
      const data = await res.json();
      return data.data || [];
    } catch { return []; }
  },
  async getRegionalInvestment(signal?: AbortSignal): Promise<RegionalInvestment[]> {
    try {
      const res = await authedFetch('/api/analytics/market/investment/regional', { signal });
      const data = await res.json();
      return data.data || [];
    } catch { return []; }
  },
  async getPriceIndex(region?: string, signal?: AbortSignal): Promise<PriceIndex[]> {
    try {
      const url = region
        ? `/api/analytics/market/price-index?region=${region}`
        : '/api/analytics/market/price-index';
      const res = await authedFetch(url, { signal });
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : [data.data].filter(Boolean);
    } catch { return []; }
  },
  async getRentalByRegion(signal?: AbortSignal): Promise<RentalByRegion[]> {
    try {
      const res = await authedFetch('/api/analytics/market/rental/by-region', { signal });
      const data = await res.json();
      return data.data || [];
    } catch { return []; }
  },
  async getSupplyDemand(region: string, signal?: AbortSignal) {
    try {
      const res = await authedFetch(`/api/analytics/market/supply-demand?region=${region}`, { signal });
      const data = await res.json();
      return data.data || null;
    } catch { return null; }
  },
};

// =====================================================
// HELPERS
// =====================================================

function formatRegion(r: string) {
  return r
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  actions,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn('border border-border bg-card/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="font-mono text-[10px] text-amber-500 tracking-wider">{title}</span>
        {actions}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ElementType;
}) {
  return (
    <Panel title={label}>
      <div className="text-center py-2">
        {Icon && <Icon className="w-4 h-4 text-amber-500 mx-auto mb-1" />}
        <div className="font-mono text-2xl text-foreground">{value}</div>
        {sub && <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </Panel>
  );
}

// Region bar chart
function RegionBarChart({ data }: { data: GeographicDistribution[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.region} className="group">
          <div className="flex items-center justify-between font-mono text-[10px] mb-0.5">
            <span className="text-muted-foreground">{formatRegion(d.region)}</span>
            <span className="text-muted-foreground">
              {formatNumber(d.count)} ({d.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="h-5 bg-muted/50 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-500 transition-all duration-500"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Price comparison table
function PriceTable({ data }: { data: PriceIndex[] }) {
  if (!data.length) {
    return <div className="font-mono text-xs text-muted-foreground text-center py-4">No price data available</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-[10px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-1.5 pr-3">REGION</th>
            <th className="text-left py-1.5 pr-3">TYPE</th>
            <th className="text-right py-1.5 pr-3">AVG PRICE</th>
            <th className="text-right py-1.5 pr-3">₵/SQM</th>
            <th className="text-right py-1.5">LISTINGS</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
              <td className="py-1.5 pr-3 text-foreground">{formatRegion(row.region || 'all')}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{formatRegion(row.property_type || 'all')}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{formatCurrency(row.avg_price)}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">
                {row.price_per_sqm ? formatCurrency(row.price_per_sqm) : '—'}
              </td>
              <td className="py-1.5 text-right text-muted-foreground">{formatNumber(row.listing_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Rental comparison
function RentalTable({ data }: { data: RentalByRegion[] }) {
  if (!data.length) {
    return <div className="font-mono text-xs text-muted-foreground text-center py-4">No rental data available</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-[10px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left py-1.5 pr-3">REGION</th>
            <th className="text-right py-1.5 pr-3">AVG RENT</th>
            <th className="text-right py-1.5 pr-3">MEDIAN RENT</th>
            <th className="text-right py-1.5">LISTINGS</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-amber-50 dark:hover:bg-amber-500/10">
              <td className="py-1.5 pr-3 text-foreground">{formatRegion(row.region)}</td>
              <td className="py-1.5 pr-3 text-right text-green-600 dark:text-green-400">{formatCurrency(row.avg_rent)}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{formatCurrency(row.median_rent)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatNumber(row.listing_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function GeographicAnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [distribution, setDistribution] = useState<GeographicDistribution[]>([]);
  const [priceIndex, setPriceIndex] = useState<PriceIndex[]>([]);
  const [rental, setRental] = useState<RentalByRegion[]>([]);
  const [regional, setRegional] = useState<RegionalInvestment[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    loadData(ac.signal);
    return () => ac.abort();
  }, []);

  const loadData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const [dist, price, rent, reg] = await Promise.all([
        geoApi.getDistribution(signal),
        geoApi.getPriceIndex(undefined, signal),
        geoApi.getRentalByRegion(signal),
        geoApi.getRegionalInvestment(signal),
      ]);
      if (signal?.aborted) return;
      setDistribution(dist);
      setPriceIndex(price);
      setRental(rent);
      setRegional(reg);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Failed to load geographic data:', e);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const totalProperties = distribution.reduce((s, d) => s + d.count, 0);
  const totalRegions = distribution.length;
  const topRegion = distribution.length ? distribution.reduce((a, b) => (a.count > b.count ? a : b)) : null;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-500" />
            <h1 className="font-mono text-sm text-foreground tracking-wider">GEOGRAPHIC ANALYTICS</h1>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
            Property distribution and regional market comparison across Ghana
          </p>
        </div>
        <button
          onClick={() => {
            const ac = new AbortController();
            loadData(ac.signal);
          }}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] border transition-colors',
            isLoading
              ? 'border-border text-muted-foreground cursor-not-allowed'
              : 'border-border text-muted-foreground hover:border-amber-500 hover:text-amber-500'
          )}
        >
          <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          {isLoading ? 'LOADING...' : 'REFRESH'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
            <span className="font-mono text-xs text-muted-foreground">Loading geographic data...</span>
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="TOTAL PROPERTIES"
              value={formatNumber(totalProperties)}
              icon={Building2}
              sub="across all regions"
            />
            <StatCard
              label="ACTIVE REGIONS"
              value={totalRegions}
              icon={MapPin}
              sub="with property data"
            />
            <StatCard
              label="TOP REGION"
              value={topRegion ? formatRegion(topRegion.region) : '—'}
              icon={TrendingUp}
              sub={topRegion ? `${formatNumber(topRegion.count)} properties` : ''}
            />
            <StatCard
              label="AVG CONCENTRATION"
              value={totalRegions ? `${(totalProperties / totalRegions).toFixed(0)}` : '—'}
              icon={BarChart3}
              sub="properties per region"
            />
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Property Distribution */}
            <Panel title="PROPERTY DISTRIBUTION BY REGION" className="col-span-1">
              {distribution.length > 0 ? (
                <RegionBarChart data={distribution} />
              ) : (
                <div className="font-mono text-xs text-muted-foreground text-center py-8">No distribution data</div>
              )}
            </Panel>

            {/* Regional Investment Comparison */}
            <Panel title="REGIONAL INVESTMENT OVERVIEW" className="col-span-1">
              {regional.length > 0 ? (
                <div className="space-y-3">
                  {regional.map((r) => (
                    <div key={r.region} className="border border-border p-2 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-foreground">{formatRegion(r.region)}</span>
                        <span className="font-mono text-[10px] text-amber-500">
                          {formatNumber(r.total_listings)} listings
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                        <div>
                          <span className="text-muted-foreground">AVG PRICE</span>
                          <div className="text-muted-foreground">{formatCurrency(r.avg_price)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">MEDIAN</span>
                          <div className="text-muted-foreground">{formatCurrency(r.median_price)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">₵/SQM</span>
                          <div className="text-muted-foreground">
                            {r.avg_price_per_sqm ? formatCurrency(r.avg_price_per_sqm) : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="font-mono text-xs text-muted-foreground text-center py-8">
                  No regional investment data
                </div>
              )}
            </Panel>
          </div>

          {/* Price Index + Rental Tables */}
          <div className="grid grid-cols-2 gap-4">
            <Panel title="PRICE INDEX BY REGION & TYPE">
              <PriceTable data={priceIndex} />
            </Panel>

            <Panel title="RENTAL MARKET BY REGION">
              <RentalTable data={rental} />
            </Panel>
          </div>

          {/* Regional Detail Cards */}
          {regional.length > 0 && (
            <Panel title="PROPERTY TYPE BREAKDOWN BY REGION">
              <div className="grid grid-cols-2 gap-4">
                {regional.map((r) => {
                  const types = r.property_types || {};
                  const total = Object.values(types).reduce((s, v) => s + v, 0) || 1;
                  return (
                    <div key={r.region} className="border border-border p-2">
                      <div className="font-mono text-xs text-foreground mb-2">{formatRegion(r.region)}</div>
                      <div className="space-y-1">
                        {Object.entries(types)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <div key={type} className="flex items-center gap-2">
                              <div className="w-24 font-mono text-[10px] text-muted-foreground truncate">
                                {formatRegion(type)}
                              </div>
                              <div className="flex-1 h-3 bg-muted/50 overflow-hidden">
                                <div
                                  className="h-full bg-amber-600/60"
                                  style={{ width: `${(count / total) * 100}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-muted-foreground w-10 text-right">
                                {count}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
