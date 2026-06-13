'use client'

import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// =====================================================
// TYPES
// =====================================================
interface MetricCardProps {
  label: string
  value: number | string
  previousValue?: number | string
  format?: 'number' | 'currency' | 'percentage'
  currency?: string
  prefix?: string
  suffix?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: number
  icon?: React.ElementType
  status?: 'success' | 'warning' | 'danger' | 'neutral'
  isLoading?: boolean
  onClick?: () => void
  className?: string
}

interface MetricGridProps {
  children: React.ReactNode
  columns?: 2 | 3 | 4
  className?: string
}

// =====================================================
// ANIMATED COUNTER
// =====================================================
function AnimatedCounter({
  value,
  format = 'number',
  currency = 'GHS',
  prefix = '',
  suffix = '',
}: {
  value: number
  format?: 'number' | 'currency' | 'percentage'
  currency?: string
  prefix?: string
  suffix?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 1000 // ms
    const steps = 30
    const stepDuration = duration / steps
    const increment = (value - displayValue) / steps
    let current = displayValue

    const timer = setInterval(() => {
      current += increment
      if ((increment > 0 && current >= value) || (increment < 0 && current <= value)) {
        current = value
        clearInterval(timer)
      }
      setDisplayValue(current)
    }, stepDuration)

    return () => clearInterval(timer)
  }, [value])

  const formatValue = (val: number): string => {
    if (format === 'currency') {
      return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val)
    }
    if (format === 'percentage') {
      return `${val.toFixed(1)}%`
    }
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M`
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1)}K`
    }
    return val.toFixed(0)
  }

  return (
    <span>
      {prefix}
      {formatValue(displayValue)}
      {suffix}
    </span>
  )
}

// =====================================================
// TREND INDICATOR
// =====================================================
function TrendIndicator({
  trend,
  value,
}: {
  trend: 'up' | 'down' | 'neutral'
  value?: number
}) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  const colorClass = {
    up: 'text-green-600 dark:text-green-400 bg-green-400/10',
    down: 'text-red-600 dark:text-red-400 bg-red-400/10',
    neutral: 'text-muted-foreground bg-zinc-400/10',
  }[trend]

  return (
    <div className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded', colorClass)}>
      <Icon className="h-3 w-3" />
      {value !== undefined && (
        <span className="font-mono text-[10px] font-medium">
          {trend === 'down' ? '' : '+'}{value}%
        </span>
      )}
    </div>
  )
}

// =====================================================
// STATUS ICON
// =====================================================
function StatusIcon({ status }: { status: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const config = {
    success: { icon: CheckCircle, color: 'text-green-500' },
    warning: { icon: AlertTriangle, color: 'text-amber-500' },
    danger: { icon: XCircle, color: 'text-red-500' },
    neutral: { icon: Building2, color: 'text-muted-foreground' },
  }[status]

  const Icon = config.icon
  return <Icon className={cn('h-5 w-5', config.color)} />
}

// =====================================================
// METRIC CARD COMPONENT
// =====================================================
export function MetricCard({
  label,
  value,
  previousValue,
  format = 'number',
  currency = 'GHS',
  prefix = '',
  suffix = '',
  trend,
  trendValue,
  icon: Icon = Building2,
  status = 'neutral',
  isLoading = false,
  onClick,
  className,
}: MetricCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value) || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden border border-border bg-card/50 p-4 transition-colors',
        onClick && 'cursor-pointer hover:border-border hover:bg-card',
        className
      )}
    >
      {/* Background gradient based on status */}
      <div
        className={cn(
          'absolute inset-0 opacity-5',
          status === 'success' && 'bg-gradient-to-br from-green-500 to-transparent',
          status === 'warning' && 'bg-gradient-to-br from-amber-500 to-transparent',
          status === 'danger' && 'bg-gradient-to-br from-red-500 to-transparent'
        )}
      />

      {/* Content */}
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
          </div>
          {trend && <TrendIndicator trend={trend} value={trendValue} />}
        </div>

        {/* Value */}
        <div className="flex items-baseline justify-between">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <>
              <div className="font-mono text-2xl font-semibold text-zinc-100">
                {typeof value === 'string' ? (
                  value
                ) : (
                  <AnimatedCounter
                    value={numericValue}
                    format={format}
                    currency={currency}
                    prefix={prefix}
                    suffix={suffix}
                  />
                )}
              </div>
              <StatusIcon status={status} />
            </>
          )}
        </div>

        {/* Previous value comparison */}
        {previousValue !== undefined && !isLoading && (
          <p className="font-mono text-[10px] text-muted-foreground mt-1">
            vs. previous: {previousValue}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// =====================================================
// METRIC GRID COMPONENT
// =====================================================
export function MetricGrid({
  children,
  columns = 4,
  className,
}: MetricGridProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns]

  return (
    <div className={cn('grid gap-4', gridCols, className)}>
      {children}
    </div>
  )
}

// =====================================================
// PORTFOLIO METRICS COMPONENT (Complete Dashboard)
// =====================================================
interface PortfolioMetrics {
  totalProjects: number
  projectsByStatus: Record<string, number>
  totalBudget: { amount: number; currency: string }
  totalSpent: { amount: number; currency: string }
  budgetUtilization: number
  avgProgress: number
  projectsAtRisk: number
  monthOverMonthChange: number
}

interface PortfolioMetricCardsProps {
  metrics: PortfolioMetrics | null
  isLoading?: boolean
  onCardClick?: (metric: string) => void
  className?: string
}

export function PortfolioMetricCards({
  metrics,
  isLoading = false,
  onCardClick,
  className,
}: PortfolioMetricCardsProps) {
  if (!metrics && !isLoading) {
    return (
      <MetricGrid className={className}>
        <div className="col-span-full text-center py-8 text-muted-foreground">
          <span className="font-mono text-sm">No metrics available</span>
        </div>
      </MetricGrid>
    )
  }

  return (
    <MetricGrid className={className}>
      <MetricCard
        label="Total Projects"
        value={metrics?.totalProjects || 0}
        icon={Building2}
        trend={metrics?.monthOverMonthChange ? (metrics.monthOverMonthChange > 0 ? 'up' : metrics.monthOverMonthChange < 0 ? 'down' : 'neutral') : undefined}
        trendValue={metrics?.monthOverMonthChange ? Math.abs(metrics.monthOverMonthChange) : undefined}
        status="neutral"
        isLoading={isLoading}
        onClick={() => onCardClick?.('totalProjects')}
      />

      <MetricCard
        label="Total Budget"
        value={metrics?.totalBudget?.amount || 0}
        format="currency"
        currency={metrics?.totalBudget?.currency || 'GHS'}
        icon={DollarSign}
        status="neutral"
        isLoading={isLoading}
        onClick={() => onCardClick?.('totalBudget')}
      />

      <MetricCard
        label="Budget Utilized"
        value={metrics?.budgetUtilization || 0}
        format="percentage"
        icon={TrendingUp}
        status={
          (metrics?.budgetUtilization || 0) > 90
            ? 'warning'
            : (metrics?.budgetUtilization || 0) > 100
            ? 'danger'
            : 'success'
        }
        isLoading={isLoading}
        onClick={() => onCardClick?.('budgetUtilization')}
      />

      <MetricCard
        label="Projects at Risk"
        value={metrics?.projectsAtRisk || 0}
        icon={AlertTriangle}
        status={
          (metrics?.projectsAtRisk || 0) > 3
            ? 'danger'
            : (metrics?.projectsAtRisk || 0) > 0
            ? 'warning'
            : 'success'
        }
        isLoading={isLoading}
        onClick={() => onCardClick?.('projectsAtRisk')}
      />

      <MetricCard
        label="Avg. Progress"
        value={metrics?.avgProgress || 0}
        format="percentage"
        icon={Clock}
        status={
          (metrics?.avgProgress || 0) >= 50
            ? 'success'
            : (metrics?.avgProgress || 0) >= 25
            ? 'neutral'
            : 'warning'
        }
        isLoading={isLoading}
        onClick={() => onCardClick?.('avgProgress')}
      />

      <MetricCard
        label="Active"
        value={metrics?.projectsByStatus?.['under_construction'] || 0}
        icon={Building2}
        status="success"
        isLoading={isLoading}
        onClick={() => onCardClick?.('active')}
      />

      <MetricCard
        label="Planning"
        value={metrics?.projectsByStatus?.['planning'] || 0}
        icon={Clock}
        status="neutral"
        isLoading={isLoading}
        onClick={() => onCardClick?.('planning')}
      />

      <MetricCard
        label="Completed"
        value={metrics?.projectsByStatus?.['completed'] || 0}
        icon={CheckCircle}
        status="success"
        isLoading={isLoading}
        onClick={() => onCardClick?.('completed')}
      />
    </MetricGrid>
  )
}

export default MetricCard
