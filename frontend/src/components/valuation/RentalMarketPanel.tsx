'use client';

/**
 * Rental Market Analysis Panel
 * 
 * Displays rental comparables for Income Approach rent estimation.
 * Helps valuers estimate market rent for subject property using 
 * rental listing data from the database.
 * 
 * Per Phase 5.2: Rental Comparables Engine for Income Approach
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Home,
  MapPin,
  Bed,
  Bath,
  Ruler,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  DollarSign,
  TrendingUp,
  Loader2,
  Settings2,
  Table,
} from 'lucide-react';
import { TerminalPanel } from '@/components/ui/terminal';
import { 
  rentalComparablesApi, 
  type RentalComparable, 
  type RentalSearchResponse,
  type RentEstimation,
} from '@/lib/valuation-api';
import { cn } from '@/lib/utils';
import { 
  RentalAdjustmentGrid, 
  type RentalSubjectProperty,
  type RentalComparableWithAdjustments,
} from './RentalAdjustmentGrid';

// =====================================================
// TYPES
// =====================================================

export interface RentalMarketPanelProps {
  valuationId: string;
  subjectProperty: {
    gfa_sqm: number | null;
    bedrooms: number | null;
    property_type: string;
    neighborhood: string | null;
  };
  onRentEstimated: (
    rent: number, 
    confidence: number, 
    comparables: RentalComparable[],
    methodology: 'median' | 'weighted_average' | 'manual'
  ) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export interface RentEstimateOutput {
  suggestedMonthlyRent: number;
  rentPerSqm: number;
  confidence: number;
  comparablesUsed: number;
  methodology: 'median' | 'weighted_average' | 'manual';
  justification?: string;
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function StatCard({ 
  label, 
  value, 
  unit = '', 
  subtext,
  highlight = false 
}: { 
  label: string; 
  value: string | number; 
  unit?: string;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'p-3 border',
      highlight ? 'border-amber-500/50 bg-amber-100 dark:bg-amber-900/10' : 'border-border bg-card/50'
    )}>
      <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">{label}</div>
      <div className={cn(
        'font-mono text-lg',
        highlight ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
      )}>
        {value}{unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      </div>
      {subtext && (
        <div className="font-mono text-[10px] text-muted-foreground mt-1">{subtext}</div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const getColor = (c: number) => {
    if (c >= 80) return 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800';
    if (c >= 60) return 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800';
    return 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800';
  };

  const getLabel = (c: number) => {
    if (c >= 80) return 'HIGH';
    if (c >= 60) return 'MODERATE';
    return 'LOW';
  };

  return (
    <span className={cn(
      'px-2 py-0.5 font-mono text-[10px] border',
      getColor(confidence)
    )}>
      {getLabel(confidence)} ({confidence}%)
    </span>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function RentalMarketPanel({
  valuationId,
  subjectProperty,
  onRentEstimated,
  className,
  defaultExpanded = false,
}: RentalMarketPanelProps) {
  // State
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResponse, setSearchResponse] = useState<RentalSearchResponse | null>(null);
  const [comparables, setComparables] = useState<RentalComparable[]>([]);
  
  // Market benchmarks fallback state
  const [benchmark, setBenchmark] = useState<{
    areaName: string;
    listingCount: number;
    avgRentMonthly: number;
    medianRentMonthly: number;
    minRentMonthly: number;
    maxRentMonthly: number;
    avgRentPerSqm: number | null;
    rentByBedrooms: Record<string, { count: number; avg: number; median: number }> | null;
  } | null>(null);
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);
  
  // Search parameters
  const [radiusKm, setRadiusKm] = useState(5);
  const [maxAgeMonths, setMaxAgeMonths] = useState(12);
  
  // Manual override
  const [useManualRent, setUseManualRent] = useState(false);
  const [manualRent, setManualRent] = useState<number>(0);
  const [manualJustification, setManualJustification] = useState('');
  
  // Selected methodology
  const [methodology, setMethodology] = useState<'median' | 'weighted_average'>('weighted_average');

  // View mode: summary (simple table) or adjustments (full grid)
  const [viewMode, setViewMode] = useState<'summary' | 'adjustments'>('summary');
  
  // Adjustments state for each comparable
  const [comparableAdjustments, setComparableAdjustments] = useState<Record<string, Record<string, number>>>({});

  // Convert comparables to adjustment grid format
  const comparablesWithAdjustments = useMemo((): RentalComparableWithAdjustments[] => {
    return comparables.map(comp => ({
      ...comp,
      adjustments: comparableAdjustments[comp.id] || {},
    }));
  }, [comparables, comparableAdjustments]);

  // Convert subject property to adjustment grid format
  const subjectForGrid = useMemo((): RentalSubjectProperty => ({
    gfa_sqm: subjectProperty.gfa_sqm,
    bedrooms: subjectProperty.bedrooms,
    property_type: subjectProperty.property_type,
    neighborhood: subjectProperty.neighborhood,
  }), [subjectProperty]);

  // Handle adjustment changes
  const handleAdjustmentChange = useCallback((compId: string, adjustmentId: string, value: number) => {
    setComparableAdjustments(prev => ({
      ...prev,
      [compId]: {
        ...(prev[compId] || {}),
        [adjustmentId]: value,
      },
    }));
  }, []);

  // Calculate adjusted rent from grid
  const getAdjustedRentFromGrid = useCallback((): number => {
    if (comparablesWithAdjustments.length === 0) return 0;
    
    let totalWeight = 0;
    let weightedSum = 0;
    
    comparablesWithAdjustments.forEach(comp => {
      const totalAdjustment = Object.values(comp.adjustments || {}).reduce(
        (sum, val) => sum + (val || 0), 
        0
      );
      const adjustedRent = comp.asking_rent_monthly * (1 + totalAdjustment / 100);
      const weight = comp.similarity_score / 100;
      
      totalWeight += weight;
      weightedSum += adjustedRent * weight;
    });
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }, [comparablesWithAdjustments]);

  // Search for rental comparables
  const searchRentalComparables = useCallback(async () => {
    if (!valuationId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await rentalComparablesApi.search(valuationId, {
        radiusKm,
        maxAgeMonths,
        propertyType: subjectProperty.property_type,
        bedroomsMin: (subjectProperty.bedrooms || 3) - 1,
        bedroomsMax: (subjectProperty.bedrooms || 3) + 1,
        limit: 15,
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to search rental comparables');
      }
      
      setSearchResponse(response);
      setComparables(response.data || []);
      
      // If few comparables found and we have a neighborhood, fetch benchmark as fallback
      const compCount = response.data?.length || 0;
      if (compCount < 5 && subjectProperty.neighborhood) {
        setLoadingBenchmark(true);
        try {
          const benchmarkResponse = await rentalComparablesApi.getMarketBenchmarks(
            subjectProperty.neighborhood
          );
          if (benchmarkResponse.success && benchmarkResponse.data) {
            setBenchmark(benchmarkResponse.data);
          }
        } catch (benchError) {
          // Benchmark fetch is optional, don't show error
          console.log('Could not fetch benchmark:', benchError);
        } finally {
          setLoadingBenchmark(false);
        }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rental comparables');
    } finally {
      setLoading(false);
    }
  }, [valuationId, radiusKm, maxAgeMonths, subjectProperty]);

  // Initial load when expanded
  useEffect(() => {
    if (expanded && !searchResponse && !loading) {
      searchRentalComparables();
    }
  }, [expanded, searchResponse, loading, searchRentalComparables]);

  // Get rent value based on methodology
  const getSuggestedRent = (): number => {
    if (useManualRent) return manualRent;
    
    // If adjustments have been made, use the adjusted rent
    if (viewMode === 'adjustments' && Object.keys(comparableAdjustments).length > 0) {
      return getAdjustedRentFromGrid();
    }
    
    if (!searchResponse?.meta?.aggregates) return 0;
    
    const { avgRentMonthly, medianRentMonthly, suggestedRentForSubject } = searchResponse.meta.aggregates;
    
    if (methodology === 'median') {
      return medianRentMonthly || 0;
    }
    
    // weighted_average - use suggested or average
    return suggestedRentForSubject || avgRentMonthly || 0;
  };

  const getConfidence = (): number => {
    if (useManualRent) return 50; // Manual entries get lower confidence
    return searchResponse?.meta?.aggregates?.confidence || 0;
  };

  // Handle "Use This Rent" button
  const handleUseRent = () => {
    const rent = getSuggestedRent();
    const confidence = getConfidence();
    const method = useManualRent ? 'manual' : methodology;
    
    onRentEstimated(rent, confidence, comparables, method);
  };

  // Format currency
  const formatCurrency = (value: number | null | undefined): string => {
    if (!value) return '₵0';
    return `₵${value.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  const aggregates = searchResponse?.meta?.aggregates;
  const rentEstimation = searchResponse?.meta?.rentEstimation;
  const gapAnalysis = searchResponse?.meta?.gapAnalysis;
  const comparablesCount = comparables.length;

  return (
    <div className={cn('border border-border', className)}>
      {/* Collapsible Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-card/50 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Home className="w-4 h-4 text-amber-500" />
          <div className="text-left">
            <div className="font-mono text-sm text-foreground">RENTAL MARKET ANALYSIS</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {loading ? 'Searching...' : 
               comparablesCount > 0 ? `${comparablesCount} rental comparable${comparablesCount === 1 ? '' : 's'} found` : 
               'Click to search rental comparables'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rentEstimation && !useManualRent && (
            <span className="font-mono text-sm text-amber-600 dark:text-amber-400">
              {formatCurrency(rentEstimation.suggestedMonthlyRent)}/mo
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 border-t border-border space-y-4">
          {/* Search Controls */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                SEARCH RADIUS
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(parseInt(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <span className="font-mono text-xs text-foreground w-12">{radiusKm} km</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="font-mono text-[10px] text-muted-foreground block mb-1">
                MAX LISTING AGE
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="3"
                  max="24"
                  step="3"
                  value={maxAgeMonths}
                  onChange={(e) => setMaxAgeMonths(parseInt(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <span className="font-mono text-xs text-foreground w-16">{maxAgeMonths} mo</span>
              </div>
            </div>
            <button
              onClick={searchRentalComparables}
              disabled={loading}
              className="px-3 py-2 bg-amber-500 text-foreground font-mono text-xs hover:bg-amber-400 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              SEARCH
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="font-mono text-xs text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
              <span className="font-mono text-xs text-muted-foreground">Searching rental listings...</span>
            </div>
          )}

          {/* Results */}
          {!loading && searchResponse && (
            <>
              {/* Gap Warning */}
              {gapAnalysis && (
                <div className="p-3 bg-amber-100 dark:bg-amber-900/20 border border-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono text-xs text-amber-600 dark:text-amber-400">{gapAnalysis.message}</div>
                    <div className="font-mono text-[10px] text-amber-600 dark:text-amber-400/70 mt-1">
                      Consider expanding search radius or age range, or use manual entry.
                    </div>
                  </div>
                </div>
              )}

              {/* Market Benchmark Fallback (shown when few comparables) */}
              {benchmark && comparablesCount < 5 && (
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-800">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                      MARKET BENCHMARK: {benchmark.areaName}
                    </span>
                    <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400/70">
                      ({benchmark.listingCount} listings in Data Hub)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-900">
                      <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400/70">AVG RENT</div>
                      <div className="font-mono text-sm text-blue-600 dark:text-blue-300">
                        {formatCurrency(benchmark.avgRentMonthly)}
                      </div>
                    </div>
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-900">
                      <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400/70">MEDIAN RENT</div>
                      <div className="font-mono text-sm text-blue-600 dark:text-blue-300">
                        {formatCurrency(benchmark.medianRentMonthly)}
                      </div>
                    </div>
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-900">
                      <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400/70">RANGE</div>
                      <div className="font-mono text-sm text-blue-600 dark:text-blue-300">
                        {formatCurrency(benchmark.minRentMonthly)} - {formatCurrency(benchmark.maxRentMonthly)}
                      </div>
                    </div>
                    {benchmark.avgRentPerSqm && (
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-900">
                        <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400/70">₵/SQM</div>
                        <div className="font-mono text-sm text-blue-600 dark:text-blue-300">
                          {benchmark.avgRentPerSqm.toFixed(1)}
                        </div>
                      </div>
                    )}
                  </div>
                  {benchmark.rentByBedrooms && Object.keys(benchmark.rentByBedrooms).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-800">
                      <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400/70 mb-2">BY BEDROOMS:</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(benchmark.rentByBedrooms).map(([beds, stats]) => (
                          <span 
                            key={beds}
                            className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-900 font-mono text-[10px] text-blue-600 dark:text-blue-300"
                          >
                            {beds}BR: {formatCurrency(stats.median)} <span className="text-blue-600 dark:text-blue-400/70">({stats.count})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 font-mono text-[10px] text-blue-600 dark:text-blue-400/50 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Benchmark computed from Data Hub listings. Use as market context when comparables are limited.
                  </div>
                </div>
              )}

              {/* Market Statistics */}
              {aggregates && comparablesCount > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  <StatCard
                    label="AVG RENT"
                    value={formatCurrency(aggregates.avgRentMonthly)}
                    subtext="per month"
                  />
                  <StatCard
                    label="MEDIAN RENT"
                    value={formatCurrency(aggregates.medianRentMonthly)}
                    subtext="per month"
                  />
                  <StatCard
                    label="RENT RANGE"
                    value={`${formatCurrency(aggregates.minRent)} - ${formatCurrency(aggregates.maxRent)}`}
                    subtext="min to max"
                  />
                  <StatCard
                    label="SUGGESTED RENT"
                    value={formatCurrency(aggregates.suggestedRentForSubject)}
                    subtext={`Based on ${comparablesCount} comp${comparablesCount === 1 ? '' : 's'}`}
                    highlight
                  />
                </div>
              )}

              {/* Comparables Table or Adjustment Grid */}
              {comparablesCount > 0 && (
                <>
                  {/* View Mode Toggle */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewMode('summary')}
                        className={cn(
                          'px-3 py-1.5 font-mono text-[10px] border transition-colors flex items-center gap-1',
                          viewMode === 'summary'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Table className="w-3 h-3" />
                        SUMMARY
                      </button>
                      <button
                        onClick={() => setViewMode('adjustments')}
                        className={cn(
                          'px-3 py-1.5 font-mono text-[10px] border transition-colors flex items-center gap-1',
                          viewMode === 'adjustments'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Settings2 className="w-3 h-3" />
                        ADJUSTMENTS
                      </button>
                    </div>
                    <ConfidenceBadge confidence={aggregates?.confidence || 0} />
                  </div>

                  {/* Summary View - Simple Table */}
                  {viewMode === 'summary' && (
                    <div className="border border-border">
                      <div className="bg-card/50 px-3 py-2 border-b border-border flex items-center justify-between">
                        <span className="font-mono text-xs text-muted-foreground">RENTAL COMPARABLES</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-[10px] font-mono text-muted-foreground border-b border-border bg-card/30">
                              <th className="text-left p-2">PROPERTY</th>
                              <th className="text-center p-2 w-16">BEDS</th>
                              <th className="text-center p-2 w-16">BATHS</th>
                              <th className="text-center p-2 w-20">SIZE</th>
                              <th className="text-right p-2 w-28">RENT/MO</th>
                              <th className="text-right p-2 w-24">₵/SQM</th>
                              <th className="text-center p-2 w-16">DIST</th>
                              <th className="text-center p-2 w-20">DATE</th>
                              <th className="text-center p-2 w-16">SCORE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparables.map((comp) => (
                              <tr key={comp.id} className="border-b border-border/50 hover:bg-card/30">
                                <td className="p-2">
                                  <div className="font-mono text-xs text-foreground truncate max-w-[180px]">
                                    {comp.title || comp.address_street || 'Unknown Property'}
                                  </div>
                                  <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                                    <MapPin className="w-2.5 h-2.5" />
                                    {comp.neighborhood || comp.address_city}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  <span className="font-mono text-xs text-foreground">{comp.bedrooms || '-'}</span>
                                </td>
                                <td className="p-2 text-center">
                                  <span className="font-mono text-xs text-foreground">{comp.bathrooms || '-'}</span>
                                </td>
                                <td className="p-2 text-center">
                                  <span className="font-mono text-xs text-foreground">
                                    {comp.gfa_sqm ? `${comp.gfa_sqm}m²` : '-'}
                                  </span>
                                </td>
                                <td className="p-2 text-right">
                                  <span className="font-mono text-xs text-green-600 dark:text-green-400">
                                    {formatCurrency(comp.asking_rent_monthly)}
                                  </span>
                                </td>
                                <td className="p-2 text-right">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {comp.rent_per_sqm_monthly 
                                      ? `₵${comp.rent_per_sqm_monthly.toFixed(2)}` 
                                      : '-'}
                                  </span>
                                </td>
                                <td className="p-2 text-center">
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {comp.distance_km?.toFixed(1)}km
                                  </span>
                                </td>
                                <td className="p-2 text-center">
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {formatDate(comp.listing_date)}
                                  </span>
                                </td>
                                <td className="p-2 text-center">
                                  <span className={cn(
                                    'font-mono text-[10px] px-1.5 py-0.5',
                                    comp.similarity_score >= 70 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                    comp.similarity_score >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                                    'bg-muted text-muted-foreground'
                                  )}>
                                    {comp.similarity_score}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Adjustments View - Full Grid */}
                  {viewMode === 'adjustments' && (
                    <RentalAdjustmentGrid
                      subject={subjectForGrid}
                      comparables={comparablesWithAdjustments}
                      onAdjustmentChange={handleAdjustmentChange}
                      showWeights={true}
                    />
                  )}
                </>
              )}

              {/* No Results */}
              {comparablesCount === 0 && !gapAnalysis && (
                <div className="py-8 text-center">
                  <Info className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <div className="font-mono text-xs text-muted-foreground">
                    No rental comparables found. Try expanding search parameters.
                  </div>
                </div>
              )}

              {/* Methodology Selection & Action */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-start gap-6">
                  {/* Methodology Toggle */}
                  <div className="flex-1">
                    <label className="font-mono text-[10px] text-muted-foreground block mb-2">
                      ESTIMATION METHOD
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setUseManualRent(false); setMethodology('weighted_average'); }}
                        className={cn(
                          'px-3 py-1.5 font-mono text-[10px] border transition-colors',
                          !useManualRent && methodology === 'weighted_average'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        WEIGHTED AVG
                      </button>
                      <button
                        onClick={() => { setUseManualRent(false); setMethodology('median'); }}
                        className={cn(
                          'px-3 py-1.5 font-mono text-[10px] border transition-colors',
                          !useManualRent && methodology === 'median'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        MEDIAN
                      </button>
                      <button
                        onClick={() => setUseManualRent(true)}
                        className={cn(
                          'px-3 py-1.5 font-mono text-[10px] border transition-colors',
                          useManualRent
                            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        MANUAL
                      </button>
                    </div>
                  </div>

                  {/* Manual Entry */}
                  {useManualRent && (
                    <div className="flex-1">
                      <label className="font-mono text-[10px] text-muted-foreground block mb-2">
                        MANUAL RENT (₵/month)
                      </label>
                      <input
                        type="number"
                        value={manualRent || ''}
                        onChange={(e) => setManualRent(parseFloat(e.target.value) || 0)}
                        placeholder="Enter monthly rent"
                        className="w-full px-3 py-1.5 bg-background border border-border text-foreground font-mono text-xs"
                      />
                    </div>
                  )}

                  {/* Justification for Manual */}
                  {useManualRent && (
                    <div className="flex-1">
                      <label className="font-mono text-[10px] text-muted-foreground block mb-2">
                        JUSTIFICATION
                      </label>
                      <input
                        type="text"
                        value={manualJustification}
                        onChange={(e) => setManualJustification(e.target.value)}
                        placeholder="Reason for manual entry"
                        className="w-full px-3 py-1.5 bg-background border border-border text-foreground font-mono text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Result Summary & Action Button */}
                <div className="mt-4 flex items-center justify-between p-3 bg-card/50 border border-border">
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground mb-1">
                      {useManualRent ? 'MANUAL RENT ENTRY' : `ESTIMATED MARKET RENT (${methodology.toUpperCase().replace('_', ' ')})`}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xl text-amber-600 dark:text-amber-400">
                        {formatCurrency(getSuggestedRent())}
                        <span className="text-sm text-muted-foreground">/month</span>
                      </span>
                      {!useManualRent && <ConfidenceBadge confidence={getConfidence()} />}
                    </div>
                  </div>
                  <button
                    onClick={handleUseRent}
                    disabled={getSuggestedRent() === 0}
                    className="px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    USE THIS RENT
                  </button>
                </div>

                {/* Disclosure Note */}
                <div className="mt-3 p-2 bg-blue-100 dark:bg-blue-900/10 border border-blue-900/30 flex items-start gap-2">
                  <Info className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400/80">
                    {useManualRent 
                      ? 'Manual entry will be flagged in the valuation report. Provide justification for RICS/GhIS compliance.'
                      : `Market rent derived from ${comparablesCount} rental comparable${comparablesCount === 1 ? '' : 's'} within ${radiusKm}km radius. Evidence-based per RICS/IVS standards.`
                    }
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default RentalMarketPanel;
