'use client'

/**
 * Labor Costs Panel
 * 
 * Displays labor costs data for construction cost calculations.
 * Shows individual trade rates from the database.
 */

import { useState, useEffect, useCallback } from 'react'
import { constructionApi } from '@/lib/api'
import { LaborRate as ApiLaborRate } from '@/types/data-hub'
import { cn } from '@/lib/utils'
import {
  HardHat,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  Loader2,
  Wrench,
  Hammer,
  Zap,
  Droplets,
  PaintBucket,
  Grid3X3,
  User,
  UserCog,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface LaborCostsPanelProps {
  region: string
  collapsed?: boolean
  className?: string
  onDataLoad?: (data: ApiLaborRate[]) => void
}

// Trade category display configuration
const TRADE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  mason: { label: 'Mason', icon: Grid3X3, color: 'text-orange-600 dark:text-orange-400' },
  carpenter: { label: 'Carpenter', icon: Hammer, color: 'text-amber-600 dark:text-amber-400' },
  plumber: { label: 'Plumber', icon: Droplets, color: 'text-blue-600 dark:text-blue-400' },
  electrician: { label: 'Electrician', icon: Zap, color: 'text-yellow-600 dark:text-yellow-400' },
  painter: { label: 'Painter', icon: PaintBucket, color: 'text-purple-600 dark:text-purple-400' },
  tiler: { label: 'Tiler', icon: Grid3X3, color: 'text-cyan-600 dark:text-cyan-400' },
  steel_fixer: { label: 'Steel Fixer', icon: Wrench, color: 'text-slate-400' },
  foreman: { label: 'Foreman', icon: UserCog, color: 'text-emerald-600 dark:text-emerald-400' },
  general_laborer: { label: 'General Labor', icon: User, color: 'text-muted-foreground' },
  welder: { label: 'Welder', icon: Wrench, color: 'text-red-600 dark:text-red-400' },
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function TrendIndicator({ change }: { change: number | null }) {
  const val = change ?? 0
  if (val > 0) {
    return (
      <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-mono text-[10px]">
        <TrendingUp className="w-3 h-3" />
        +{val.toFixed(1)}%
      </div>
    )
  } else if (val < 0) {
    return (
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-mono text-[10px]">
        <TrendingDown className="w-3 h-3" />
        {val.toFixed(1)}%
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground font-mono text-[10px]">
      <Minus className="w-3 h-3" />
      0.0%
    </div>
  )
}

function LastUpdatedBadge({ date }: { date?: string }) {
  if (!date) return null
  
  const formatted = new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  
  return (
    <span className="flex items-center gap-1 text-muted-foreground font-mono text-[9px]">
      <Clock className="w-2.5 h-2.5" />
      {formatted}
    </span>
  )
}

function getTradeConfig(category: string) {
  return TRADE_CONFIG[category] || { label: category.replace(/_/g, ' '), icon: HardHat, color: 'text-muted-foreground' }
}

// Fallback labor rates when database is unavailable
const FALLBACK_LABOR_RATES: ApiLaborRate[] = [
  { id: 'fallback-1', labor_category: 'foreman', skill_level: 'master', rate_ghs: 350, previous_rate_ghs: 300, rate_change_percent: 16.7, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-2', labor_category: 'electrician', skill_level: 'journeyman', rate_ghs: 240, previous_rate_ghs: 210, rate_change_percent: 14.3, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-3', labor_category: 'plumber', skill_level: 'journeyman', rate_ghs: 220, previous_rate_ghs: 190, rate_change_percent: 15.8, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-4', labor_category: 'steel_fixer', skill_level: 'journeyman', rate_ghs: 210, previous_rate_ghs: 180, rate_change_percent: 16.7, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-5', labor_category: 'carpenter', skill_level: 'journeyman', rate_ghs: 200, previous_rate_ghs: 175, rate_change_percent: 14.3, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-6', labor_category: 'tiler', skill_level: 'journeyman', rate_ghs: 190, previous_rate_ghs: 165, rate_change_percent: 15.2, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-7', labor_category: 'mason', skill_level: 'journeyman', rate_ghs: 180, previous_rate_ghs: 155, rate_change_percent: 16.1, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-8', labor_category: 'painter', skill_level: 'journeyman', rate_ghs: 160, previous_rate_ghs: 140, rate_change_percent: 14.3, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
  { id: 'fallback-9', labor_category: 'general_laborer', skill_level: 'apprentice', rate_ghs: 80, previous_rate_ghs: 70, rate_change_percent: 14.3, rate_type: 'daily', region: 'greater_accra', survey_date: new Date().toISOString() },
]

// =====================================================
// MAIN COMPONENT
// =====================================================

export function LaborCostsPanel({
  region,
  collapsed: initialCollapsed = false,
  className,
  onDataLoad,
}: LaborCostsPanelProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [laborRates, setLaborRates] = useState<ApiLaborRate[]>([])
  const [dataSource, setDataSource] = useState<'database' | 'fallback'>('database')
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)

  // Fetch labor rates from database
  const fetchLaborRates = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await constructionApi.getLaborRates({ region: region as any })
      
      if (response.success && response.data && response.data.length > 0) {
        // Use the actual data from API - no aggregation needed
        // Deduplicate by labor_category (keep highest skill level)
        const categoryMap = new Map<string, ApiLaborRate>()
        
        response.data.forEach((rate) => {
          const existing = categoryMap.get(rate.labor_category)
          if (!existing || rate.rate_ghs > existing.rate_ghs) {
            categoryMap.set(rate.labor_category, rate)
          }
        })
        
        // Sort by rate descending
        const rates = Array.from(categoryMap.values()).sort((a, b) => b.rate_ghs - a.rate_ghs)
        
        setLaborRates(rates)
        setDataSource('database')
        onDataLoad?.(rates)
      } else {
        // Use fallback data when no data returned
        setLaborRates(FALLBACK_LABOR_RATES)
        setDataSource('fallback')
        setError('Using fallback data')
        onDataLoad?.(FALLBACK_LABOR_RATES)
      }
      
      setLastFetchedAt(new Date().toISOString())
    } catch (err) {
      console.error('Failed to fetch labor rates:', err)
      // Use fallback on error
      setLaborRates(FALLBACK_LABOR_RATES)
      setDataSource('fallback')
      setError('Database unavailable')
      onDataLoad?.(FALLBACK_LABOR_RATES)
    } finally {
      setLoading(false)
    }
  }, [region, onDataLoad])

  useEffect(() => {
    fetchLaborRates()
  }, [fetchLaborRates])

  // Calculate statistics
  const avgRate = laborRates.length > 0 
    ? laborRates.reduce((sum, l) => sum + (l.rate_ghs ?? 0), 0) / laborRates.length
    : 0
  const baseLaborRate = 120 // Base 2020 average
  const laborFactor = avgRate > 0 && !isNaN(avgRate) ? avgRate / baseLaborRate : 1
  const skilledRates = laborRates.filter(r => r.labor_category !== 'general_laborer')
  const unskilledRates = laborRates.filter(r => r.labor_category === 'general_laborer')

  return (
    <div className={cn("border border-border bg-card/50", className)}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-border cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-500/10"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 uppercase tracking-wider">
            Labor Costs
          </span>
          {dataSource === 'fallback' && (
            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 font-mono text-[9px] rounded">
              FALLBACK
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              fetchLaborRates()
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={cn("w-3 h-3 text-muted-foreground", loading && "animate-spin")} />
          </button>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              <span className="ml-2 text-xs text-muted-foreground">Loading labor rates...</span>
            </div>
          ) : error && laborRates.length === 0 ? (
            <div className="flex items-center gap-2 text-yellow-500 text-xs py-4 justify-center">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          ) : (
            <>
              {/* Skilled Trades Section */}
              {skilledRates.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] text-muted-foreground uppercase mb-2 flex items-center gap-1">
                    <HardHat className="w-3 h-3" />
                    Skilled Trades ({skilledRates.length})
                  </div>
                  <div className="space-y-1.5">
                    {skilledRates.map((rate) => {
                      const config = getTradeConfig(rate.labor_category)
                      const Icon = config.icon
                      return (
                        <div 
                          key={rate.id}
                          className="flex items-center justify-between p-2 bg-muted/50 border border-border/50 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn("w-4 h-4", config.color)} />
                            <div>
                              <span className="font-mono text-xs text-zinc-200">
                                {config.label}
                              </span>
                              <span className="font-mono text-[9px] text-muted-foreground ml-2 capitalize">
                                {rate.skill_level}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <TrendIndicator change={rate.rate_change_percent} />
                            <div className="text-right">
                              <span className="font-mono text-sm text-foreground">
                                ₵{(rate.rate_ghs ?? 0).toLocaleString()}
                              </span>
                              <span className="font-mono text-[9px] text-muted-foreground ml-1">/day</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Unskilled Labor Section */}
              {unskilledRates.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] text-muted-foreground uppercase mb-2 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    General Labor
                  </div>
                  <div className="space-y-1.5">
                    {unskilledRates.map((rate) => {
                      const config = getTradeConfig(rate.labor_category)
                      const Icon = config.icon
                      return (
                        <div 
                          key={rate.id}
                          className="flex items-center justify-between p-2 bg-muted/50 border border-border/50 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn("w-4 h-4", config.color)} />
                            <span className="font-mono text-xs text-zinc-200">
                              {config.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <TrendIndicator change={rate.rate_change_percent} />
                            <div className="text-right">
                              <span className="font-mono text-sm text-foreground">
                                ₵{(rate.rate_ghs ?? 0).toLocaleString()}
                              </span>
                              <span className="font-mono text-[9px] text-muted-foreground ml-1">/day</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Summary Stats */}
              <div className="pt-3 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">LABOR FACTOR</div>
                    <div className="font-mono text-[9px] text-muted-foreground">
                      vs 2020 baseline (₵{baseLaborRate}/day)
                    </div>
                  </div>
                  <div className={cn(
                    "font-mono text-lg font-bold",
                    laborFactor > 1.2 ? 'text-red-600 dark:text-red-400' : laborFactor > 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                  )}>
                    {laborFactor.toFixed(2)}x
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="font-mono text-[10px] text-muted-foreground">AVG DAILY RATE</span>
                  <span className="font-mono text-sm text-amber-600 dark:text-amber-400">
                    ₵{Math.round(avgRate).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground">TOTAL TRADES</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {laborRates.length}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
