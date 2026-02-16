/**
 * Bloomberg-Style Terminal Components
 * 
 * Professional UI components with Bloomberg Terminal aesthetic.
 * Dark theme, monospace fonts, amber accents.
 */

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react';

// =====================================================
// TERMINAL PANEL
// =====================================================

interface PanelProps {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  status?: 'live' | 'loading' | 'error';
  timestamp?: string;
}

export function TerminalPanel({
  title,
  children,
  className,
  action,
  status,
  timestamp
}: PanelProps) {
  return (
    <div className={cn('border border-zinc-800 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-amber-500 tracking-wider uppercase">{title}</span>
          {status === 'live' && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="font-mono text-[9px] text-green-500">LIVE</span>
            </span>
          )}
          {status === 'loading' && (
            <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              <span className="font-mono text-[9px] text-red-500">ERROR</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {timestamp && (
            <span className="font-mono text-[9px] text-zinc-500">{timestamp}</span>
          )}
          {action}
        </div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// =====================================================
// METRIC DISPLAY
// =====================================================

interface MetricProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: number;
  changeLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'amber' | 'green' | 'red' | 'blue';
}

export function Metric({
  label,
  value,
  unit,
  change,
  changeLabel,
  size = 'md',
  color = 'default'
}: MetricProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const colorClasses = {
    default: 'text-white',
    amber: 'text-amber-500',
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
  };

  return (
    <div className="text-center">
      <div className={cn('font-mono', sizeClasses[size], colorClasses[color])}>
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
        {unit && <span className="text-zinc-500 text-sm ml-1">{unit}</span>}
      </div>
      <div className="font-mono text-[10px] text-zinc-500 uppercase">{label}</div>
      {change !== undefined && (
        <div className={cn(
          'font-mono text-[10px] mt-1 flex items-center justify-center gap-1',
          change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-zinc-500'
        )}>
          {change > 0 ? <TrendingUp className="w-3 h-3" /> :
            change < 0 ? <TrendingDown className="w-3 h-3" /> :
              <Minus className="w-3 h-3" />}
          <span>{change > 0 ? '+' : ''}{change}%</span>
          {changeLabel && <span className="text-zinc-500">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}

// =====================================================
// STATUS BADGE
// =====================================================

type StatusType =
  | 'draft'
  | 'in_progress'
  | 'pending_review'
  | 'under_review'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'pending'
  | 'active'
  | 'paused'
  | 'error';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-zinc-800', text: 'text-zinc-400', label: 'DRAFT' },
  in_progress: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'IN PROGRESS' },
  pending_review: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', label: 'PENDING REVIEW' },
  under_review: { bg: 'bg-purple-900/50', text: 'text-purple-400', label: 'UNDER REVIEW' },
  approved: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'APPROVED' },
  completed: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'COMPLETED' },
  rejected: { bg: 'bg-red-900/50', text: 'text-red-400', label: 'REJECTED' },
  pending: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', label: 'PENDING' },
  active: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'ACTIVE' },
  paused: { bg: 'bg-orange-900/50', text: 'text-orange-400', label: 'PAUSED' },
  error: { bg: 'bg-red-900/50', text: 'text-red-400', label: 'ERROR' },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] || { bg: 'bg-zinc-800', text: 'text-zinc-400', label: status.toUpperCase() };

  return (
    <span className={cn(
      'inline-flex items-center font-mono',
      config.bg,
      config.text,
      size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
    )}>
      {config.label}
    </span>
  );
}

// =====================================================
// PRIORITY INDICATOR
// =====================================================

type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

interface PriorityBadgeProps {
  priority: PriorityLevel | string;
}

const priorityConfig: Record<string, { text: string; label: string }> = {
  critical: { text: 'text-red-500', label: 'CRIT' },
  high: { text: 'text-red-400', label: 'HIGH' },
  medium: { text: 'text-yellow-400', label: 'MED' },
  low: { text: 'text-zinc-400', label: 'LOW' },
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority.toLowerCase()] || priorityConfig.medium;

  return (
    <span className={cn('font-mono text-[10px]', config.text)}>
      {config.label}
    </span>
  );
}

// =====================================================
// CONFIDENCE INDICATOR
// =====================================================

interface ConfidenceBarProps {
  score: number; // 0-100 or 0-1
  showValue?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBar({ score, showValue = true, size = 'sm' }: ConfidenceBarProps) {
  // Normalize to 0-100
  const normalized = score > 1 ? score : score * 100;

  const getColor = (val: number) => {
    if (val >= 80) return 'bg-green-500';
    if (val >= 60) return 'bg-amber-500';
    if (val >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        'flex-1 bg-zinc-800 overflow-hidden',
        size === 'sm' ? 'h-1.5' : 'h-2'
      )}>
        <div
          className={cn('h-full transition-all', getColor(normalized))}
          style={{ width: `${normalized}%` }}
        />
      </div>
      {showValue && (
        <span className="font-mono text-[10px] text-zinc-400 w-8">
          {normalized.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

// =====================================================
// DATA TABLE
// =====================================================

interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  rowKey?: keyof T;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  loading,
  emptyMessage = 'No data available',
  rowKey = 'id' as keyof T
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
        <span className="ml-2 font-mono text-xs text-zinc-500">Loading...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500 font-mono text-xs">
        {emptyMessage}
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
          {columns.map((col) => (
            <th
              key={String(col.key)}
              className={cn(
                'pb-2',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.width
              )}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono text-xs">
        {data.map((row, idx) => (
          <tr
            key={String(row[rowKey]) || idx}
            onClick={() => onRowClick?.(row)}
            className={cn(
              'border-b border-zinc-800/50',
              onRowClick && 'hover:bg-zinc-800/30 cursor-pointer'
            )}
          >
            {columns.map((col) => {
              const keyStr = String(col.key);
              const value = keyStr.includes('.')
                ? keyStr.split('.').reduce((obj: unknown, k) => (obj as Record<string, unknown>)?.[k], row)
                : row[col.key as keyof T];

              return (
                <td
                  key={String(col.key)}
                  className={cn(
                    'py-2',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  )}
                >
                  {col.render ? col.render(value, row) : String(value ?? '—')}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// =====================================================
// SPARKLINE
// =====================================================

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
}

export function Sparkline({
  data,
  width = 100,
  height = 24,
  color = '#f59e0b',
  showDots = false
}: SparklineProps) {
  if (data.length < 2) return null;
  
  // Filter out any NaN or Infinity values
  const validData = data.filter(d => Number.isFinite(d));
  if (validData.length < 2) return null;

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min || 1; // Fallback to 1 if all values are the same

  const points = validData.map((value, i) => {
    const x = (i / (validData.length - 1)) * width;
    // Ensure y is always a valid number
    const normalizedY = range === 0 ? 0.5 : (value - min) / range;
    const y = height - normalizedY * height;
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : height / 2 };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots && points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2}
          fill={color}
        />
      ))}
    </svg>
  );
}

// =====================================================
// STEP INDICATOR
// =====================================================

interface Step {
  id: string | number;
  label: string;
  status: 'completed' | 'current' | 'upcoming' | 'error';
}

interface StepIndicatorProps {
  steps: Step[];
  orientation?: 'horizontal' | 'vertical';
}

export function StepIndicator({ steps, orientation = 'horizontal' }: StepIndicatorProps) {
  const getStepIcon = (status: Step['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'current':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <div className="w-4 h-4 rounded-full border border-zinc-600" />;
    }
  };

  if (orientation === 'vertical') {
    return (
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              {getStepIcon(step.status)}
              {i < steps.length - 1 && (
                <div className={cn(
                  'w-px h-8 mt-1',
                  step.status === 'completed' ? 'bg-green-400' : 'bg-zinc-700'
                )} />
              )}
            </div>
            <div>
              <span className={cn(
                'font-mono text-xs',
                step.status === 'current' ? 'text-amber-500' :
                  step.status === 'completed' ? 'text-green-400' :
                    step.status === 'error' ? 'text-red-400' : 'text-zinc-500'
              )}>
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-2">
            {getStepIcon(step.status)}
            <span className={cn(
              'font-mono text-[10px]',
              step.status === 'current' ? 'text-amber-500' :
                step.status === 'completed' ? 'text-green-400' :
                  step.status === 'error' ? 'text-red-400' : 'text-zinc-500'
            )}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="w-3 h-3 text-zinc-600" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// =====================================================
// CURRENCY DISPLAY
// =====================================================

interface CurrencyProps {
  value: number;
  currency?: 'GHS' | 'USD';
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
  compact?: boolean;
}

export function Currency({
  value,
  currency = 'GHS',
  size = 'md',
  showSign = false,
  compact = false
}: CurrencyProps) {
  // Handle null/undefined values
  if (value == null || isNaN(value)) {
    return <span className="text-zinc-500">—</span>;
  }

  const symbol = currency === 'GHS' ? '₵' : '$';

  let displayValue: string;
  if (compact) {
    if (value >= 1_000_000) {
      displayValue = `${(value / 1_000_000).toFixed(1)}M`;
    } else if (value >= 1_000) {
      displayValue = `${(value / 1_000).toFixed(0)}K`;
    } else {
      displayValue = value.toLocaleString('en-US');
    }
  } else {
    displayValue = value.toLocaleString('en-US');
  }

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  };

  return (
    <span className={cn('font-mono text-green-400', sizeClasses[size])}>
      {showSign && value > 0 && '+'}
      {symbol}{displayValue}
    </span>
  );
}

// =====================================================
// ALERT BANNER
// =====================================================

type AlertType = 'info' | 'warning' | 'error' | 'success';

interface AlertBannerProps {
  type: AlertType;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

const alertConfig: Record<AlertType, { bg: string; border: string; icon: React.ReactNode }> = {
  info: {
    bg: 'bg-blue-900/20',
    border: 'border-blue-500/50',
    icon: <div className="w-2 h-2 bg-blue-500 rounded-full" />
  },
  warning: {
    bg: 'bg-yellow-900/20',
    border: 'border-yellow-500/50',
    icon: <AlertTriangle className="w-4 h-4 text-yellow-500" />
  },
  error: {
    bg: 'bg-red-900/20',
    border: 'border-red-500/50',
    icon: <XCircle className="w-4 h-4 text-red-500" />
  },
  success: {
    bg: 'bg-green-900/20',
    border: 'border-green-500/50',
    icon: <CheckCircle2 className="w-4 h-4 text-green-500" />
  },
};

export function AlertBanner({ type, title, message, action }: AlertBannerProps) {
  const config = alertConfig[type];

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border',
      config.bg,
      config.border
    )}>
      {config.icon}
      <div className="flex-1">
        <div className="font-mono text-xs text-white">{title}</div>
        {message && <div className="font-mono text-[10px] text-zinc-400">{message}</div>}
      </div>
      {action}
    </div>
  );
}

// =====================================================
// KEYBOARD SHORTCUT
// =====================================================

interface KeyboardShortcutProps {
  keys: string[];
}

export function KeyboardShortcut({ keys }: KeyboardShortcutProps) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, i) => (
        <React.Fragment key={i}>
          <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono text-[10px] rounded">
            {key}
          </kbd>
          {i < keys.length - 1 && <span className="text-zinc-600">+</span>}
        </React.Fragment>
      ))}
    </span>
  );
}

// =====================================================
// FILTER TABS
// =====================================================

interface FilterTabsProps {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}

export function FilterTabs({ options, value, onChange }: FilterTabsProps) {
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-3 py-1.5 font-mono text-xs transition-colors',
            value === option.value
              ? 'bg-amber-500 text-black font-bold'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={cn(
              'ml-1.5',
              value === option.value ? 'text-black/60' : 'text-zinc-500'
            )}>
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// =====================================================
// PROPERTY TYPE BADGE
// =====================================================

type PropertyTypeLabel = 'residential' | 'commercial' | 'industrial' | 'land' | 'mixed_use' | 'specialized';

interface PropertyTypeBadgeProps {
  type: PropertyTypeLabel | string;
}

const propertyTypeConfig: Record<string, { bg: string; text: string; label: string }> = {
  residential: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'RESIDENTIAL' },
  commercial: { bg: 'bg-purple-900/50', text: 'text-purple-400', label: 'COMMERCIAL' },
  industrial: { bg: 'bg-orange-900/50', text: 'text-orange-400', label: 'INDUSTRIAL' },
  land: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'LAND' },
  mixed_use: { bg: 'bg-cyan-900/50', text: 'text-cyan-400', label: 'MIXED USE' },
  specialized: { bg: 'bg-pink-900/50', text: 'text-pink-400', label: 'SPECIALIZED' },
};

export function PropertyTypeBadge({ type }: PropertyTypeBadgeProps) {
  const config = propertyTypeConfig[type.toLowerCase()] || propertyTypeConfig.residential;

  return (
    <span className={cn(
      'px-1.5 py-0.5 font-mono text-[10px]',
      config.bg,
      config.text
    )}>
      {config.label}
    </span>
  );
}

// =====================================================
// VALUATION METHOD BADGE
// =====================================================

interface MethodBadgeProps {
  method: string;
  isPrimary?: boolean;
}

const methodLabels: Record<string, string> = {
  sales_comparison: 'SALES COMP',
  cost_approach: 'COST',
  income_approach: 'INCOME',
  residual_method: 'RESIDUAL',
  profits_method: 'PROFITS',
  drc_method: 'DRC',
  // Income sub-methods for reconciliation
  direct_capitalisation: 'DIRECT CAP',
  dcf_analysis: 'DCF',
};

export function MethodBadge({ method, isPrimary }: MethodBadgeProps) {
  return (
    <span className={cn(
      'px-1.5 py-0.5 font-mono text-[10px]',
      isPrimary
        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
        : 'bg-zinc-800 text-zinc-400'
    )}>
      {methodLabels[method] || method.toUpperCase()}
    </span>
  );
}

// =====================================================
// DATA METRIC CARD (for Data Hub Analytics)
// =====================================================

interface DataMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  trendLabel?: string;
  sparklineData?: number[];
  icon?: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'yellow';
  status?: 'live' | 'loading' | 'error';
}

export function DataMetricCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  sparklineData,
  icon: Icon,
  color = 'blue',
  status
}: DataMetricCardProps) {
  const colorClasses = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    purple: 'text-purple-400',
    yellow: 'text-yellow-400',
  };

  return (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={cn('w-4 h-4', colorClasses[color])} />}
          <span className="font-mono text-[10px] text-zinc-500 uppercase">{title}</span>
        </div>
        {status && (
          <div className="flex items-center gap-1">
            {status === 'live' && (
              <>
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="font-mono text-[9px] text-green-500">LIVE</span>
              </>
            )}
            {status === 'loading' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
            {status === 'error' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
          </div>
        )}
      </div>
      
      <div className={cn('font-mono text-3xl mb-1', colorClasses[color])}>
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </div>
      
      {subtitle && (
        <div className="font-mono text-[10px] text-zinc-500 mb-2">{subtitle}</div>
      )}
      
      <div className="flex items-center justify-between">
        {trend !== undefined && (
          <div className={cn(
            'font-mono text-[10px] flex items-center gap-1',
            trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-zinc-500'
          )}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : 
             trend < 0 ? <TrendingDown className="w-3 h-3" /> : 
             <Minus className="w-3 h-3" />}
            <span>{trend > 0 ? '+' : ''}{trend}%</span>
            {trendLabel && <span className="text-zinc-500">{trendLabel}</span>}
          </div>
        )}
        
        {sparklineData && sparklineData.length > 0 && (
          <div className="ml-auto">
            <Sparkline data={sparklineData} width={60} height={20} />
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// TIER BADGE (for 5-Tier Data Architecture)
// =====================================================

type DataTier = 'tier1_government' | 'tier2_financial' | 'tier3_partners' | 'tier4_contributions' | 'tier5_public_web';

interface TierBadgeProps {
  tier: DataTier | string;
  showLabel?: boolean;
}

const tierConfig: Record<string, { bg: string; text: string; label: string; short: string }> = {
  tier1_government: { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'GOVERNMENT', short: 'T1' },
  tier2_financial: { bg: 'bg-green-900/50', text: 'text-green-400', label: 'FINANCIAL', short: 'T2' },
  tier3_partners: { bg: 'bg-purple-900/50', text: 'text-purple-400', label: 'PARTNERS', short: 'T3' },
  tier4_contributions: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', label: 'CONTRIBUTIONS', short: 'T4' },
  tier5_public_web: { bg: 'bg-orange-900/50', text: 'text-orange-400', label: 'WEB SCRAPED', short: 'T5' },
};

export function TierBadge({ tier, showLabel = true }: TierBadgeProps) {
  const config = tierConfig[tier] || { bg: 'bg-zinc-800', text: 'text-zinc-400', label: tier.toUpperCase(), short: 'T?' };

  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 font-mono text-[10px]',
      config.bg,
      config.text
    )}>
      {showLabel ? config.label : config.short}
    </span>
  );
}

// =====================================================
// LIVE DATA FEED (Real-time Activity Stream)
// =====================================================

interface DataFeedItem {
  id: string;
  timestamp: Date | string;
  type: 'ingestion' | 'job' | 'error' | 'success' | 'warning';
  source?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface LiveDataFeedProps {
  items: DataFeedItem[];
  maxItems?: number;
  autoScroll?: boolean;
}

export function LiveDataFeed({ items, maxItems = 10, autoScroll = true }: LiveDataFeedProps) {
  const displayItems = items.slice(0, maxItems);

  const getTypeColor = (type: DataFeedItem['type']) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'ingestion': return 'text-blue-400';
      case 'job': return 'text-purple-400';
      default: return 'text-zinc-400';
    }
  };

  const getTypeIcon = (type: DataFeedItem['type']) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      case 'ingestion': return '↓';
      case 'job': return '⚙';
      default: return '•';
    }
  };

  return (
    <div className="space-y-1 font-mono text-xs">
      {displayItems.map((item) => (
        <div key={item.id} className="flex items-start gap-2 py-1 border-b border-zinc-800/50">
          <span className={cn('flex-shrink-0', getTypeColor(item.type))}>
            {getTypeIcon(item.type)}
          </span>
          <span className="text-zinc-500 text-[10px] flex-shrink-0 w-16" suppressHydrationWarning>
            {new Date(item.timestamp).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit',
              hour12: false 
            })}
          </span>
          {item.source && (
            <span className="text-zinc-600 text-[10px] flex-shrink-0">
              [{item.source}]
            </span>
          )}
          <span className="text-zinc-300 text-[10px] flex-1 truncate">
            {item.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// =====================================================
// DATA QUALITY INDICATOR
// =====================================================

interface DataQualityIndicatorProps {
  score: number; // 0-100
  label?: string;
  showBreakdown?: boolean;
  breakdown?: {
    completeness?: number;
    accuracy?: number;
    timeliness?: number;
    consistency?: number;
  };
}

export function DataQualityIndicator({ 
  score, 
  label = 'Data Quality', 
  showBreakdown = false,
  breakdown 
}: DataQualityIndicatorProps) {
  const getQualityColor = (val: number) => {
    if (val >= 90) return { bg: 'bg-green-500', text: 'text-green-400', label: 'EXCELLENT' };
    if (val >= 75) return { bg: 'bg-blue-500', text: 'text-blue-400', label: 'GOOD' };
    if (val >= 60) return { bg: 'bg-yellow-500', text: 'text-yellow-400', label: 'FAIR' };
    if (val >= 40) return { bg: 'bg-orange-500', text: 'text-orange-400', label: 'POOR' };
    return { bg: 'bg-red-500', text: 'text-red-400', label: 'CRITICAL' };
  };

  const quality = getQualityColor(score);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] text-zinc-500 uppercase">{label}</span>
          <span className={cn('font-mono text-xs font-bold', quality.text)}>
            {quality.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-zinc-800 overflow-hidden">
            <div 
              className={cn('h-full transition-all', quality.bg)}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="font-mono text-sm text-white w-12 text-right">
            {score.toFixed(0)}%
          </span>
        </div>
      </div>

      {showBreakdown && breakdown && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
          {breakdown.completeness !== undefined && (
            <div>
              <div className="font-mono text-[9px] text-zinc-500 mb-1">COMPLETENESS</div>
              <ConfidenceBar score={breakdown.completeness} size="sm" />
            </div>
          )}
          {breakdown.accuracy !== undefined && (
            <div>
              <div className="font-mono text-[9px] text-zinc-500 mb-1">ACCURACY</div>
              <ConfidenceBar score={breakdown.accuracy} size="sm" />
            </div>
          )}
          {breakdown.timeliness !== undefined && (
            <div>
              <div className="font-mono text-[9px] text-zinc-500 mb-1">TIMELINESS</div>
              <ConfidenceBar score={breakdown.timeliness} size="sm" />
            </div>
          )}
          {breakdown.consistency !== undefined && (
            <div>
              <div className="font-mono text-[9px] text-zinc-500 mb-1">CONSISTENCY</div>
              <ConfidenceBar score={breakdown.consistency} size="sm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================
// ANALYTICS CHART WRAPPER (Bloomberg-styled Recharts)
// =====================================================

interface AnalyticsChartProps {
  title: string;
  children: React.ReactNode;
  height?: number;
  actions?: React.ReactNode;
  timeRange?: string;
}

export function AnalyticsChart({ 
  title, 
  children, 
  height = 300, 
  actions,
  timeRange 
}: AnalyticsChartProps) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-amber-500 uppercase tracking-wider">
            {title}
          </span>
          {timeRange && (
            <span className="font-mono text-[9px] text-zinc-500">
              {timeRange}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4" style={{ height }}>
        {children}
      </div>
    </div>
  );
}
