'use client';

/**
 * Depreciation Breakdown Panel (D6)
 * 
 * Displays auto-calculated depreciation values with full breakdown:
 * - Physical Depreciation: Age-Life method with condition adjustment
 * - Functional Obsolescence: Auto-detected from property specifications
 * - External Obsolescence: Environmental, locational, economic, regulatory factors
 * 
 * Features:
 * - Auto-calculated values with inputs used
 * - Confidence indicators
 * - Expandable detail sections
 * - Override capability (D7 - pending)
 * 
 * Reference: RICS Red Book, GhIS Valuation Standards
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Building2,
  Settings2,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Info,
  Calendar,
  Clock,
  TrendingDown,
  Shield,
  Wrench,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =====================================================
// TYPES
// =====================================================

export interface PhysicalDepreciationData {
  depreciation_rate: number;
  depreciation_percent: number;
  actual_age: number;
  effective_age: number;
  economic_life: number;
  remaining_life: number;
  method: string;
  inputs_used: {
    year_built?: number;
    condition?: string;
    condition_factor?: number;
    construction_type?: string;
    last_renovation?: number;
    renovation_adjustment?: number;
  };
  auto_calculated: boolean;
  confidence: number;
  notes: string[];
}

export interface FunctionalObsolescenceItem {
  item_key: string;
  type: 'deficiency_curable' | 'deficiency_incurable' | 'superadequacy' | 'outdated_design';
  curable: boolean;
  description: string;
  rate: number;
  rate_range: [number, number];
  detection_logic: string;
  data_used: Record<string, any>;
}

export interface FunctionalObsolescenceData {
  depreciation_rate: number;
  depreciation_percent: number;
  items_detected: FunctionalObsolescenceItem[];
  total_items: number;
  curable_rate: number;
  incurable_rate: number;
  auto_calculated: boolean;
  confidence: number;
  requires_review: boolean;
  notes: string[];
}

export interface ExternalObsolescenceData {
  depreciation_rate: number;
  depreciation_percent: number;
  factors_detected: Array<{
    factor_key: string;
    category: 'environmental' | 'locational' | 'economic' | 'regulatory';
    description: string;
    rate: number;
    rate_range: [number, number];
    data_field: string;
    data_value: any;
    threshold_used: string;
    data_source: string;
  }>;
  category_breakdown: Record<string, number>;
  total_factors: number;
  auto_calculated: boolean;
  confidence: number;
  requires_review: boolean;
  data_sources_used: string[];
  notes: string[];
}

export interface DepreciationBreakdownData {
  physical: PhysicalDepreciationData;
  functional: FunctionalObsolescenceData;
  external: ExternalObsolescenceData;
  total: {
    rate: number;
    percent: number;
    amount: number;
    was_capped: boolean;
    cap_applied?: number;
  };
  reconciliation: {
    auto_calculated: boolean;
    confidence: number;
    requires_review: boolean;
    methodology_notes: string[];
  };
  rcn: number;
}

interface DepreciationBreakdownPanelProps {
  data: DepreciationBreakdownData;
  onOverrideClick?: (component: 'physical' | 'functional' | 'external') => void;
  collapsed?: boolean;
  className?: string;
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const level = confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  const colors = {
    high: 'text-green-600 dark:text-green-400 bg-green-400/10 border-green-500/30',
    medium: 'text-yellow-600 dark:text-yellow-400 bg-yellow-400/10 border-yellow-500/30',
    low: 'text-red-600 dark:text-red-400 bg-red-400/10 border-red-500/30',
  };
  
  return (
    <span className={cn(
      'px-2 py-0.5 text-[10px] font-mono border rounded',
      colors[level]
    )}>
      {(confidence * 100).toFixed(0)}% confidence
    </span>
  );
}

function RateDisplay({ 
  rate, 
  amount, 
  label,
  color = 'blue'
}: { 
  rate: number; 
  amount?: number;
  label: string;
  color?: 'blue' | 'orange' | 'purple' | 'green';
}) {
  const colorClasses = {
    blue: 'border-blue-500 bg-blue-500/10',
    orange: 'border-orange-500 bg-orange-500/10',
    purple: 'border-purple-500 bg-purple-500/10',
    green: 'border-green-500 bg-green-500/10',
  };
  
  return (
    <div className={cn('p-3 border rounded-lg', colorClasses[color])}>
      <div className="text-[10px] text-muted-foreground uppercase mb-1">{label}</div>
      <div className="text-2xl font-mono font-bold text-foreground">
        {(rate * 100).toFixed(1)}%
      </div>
      {amount !== undefined && (
        <div className="text-sm font-mono text-muted-foreground mt-1">
          ₵{amount.toLocaleString()}
        </div>
      )}
    </div>
  );
}

function InputsUsedRow({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex justify-between text-xs py-1 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground font-mono">{value}</span>
    </div>
  );
}

function DetectedItemRow({ 
  item, 
  index 
}: { 
  item: FunctionalObsolescenceItem;
  index: number;
}) {
  const typeColors = {
    'deficiency_curable': 'text-yellow-600 dark:text-yellow-400',
    'deficiency_incurable': 'text-orange-600 dark:text-orange-400',
    'superadequacy': 'text-purple-600 dark:text-purple-400',
    'outdated_design': 'text-blue-600 dark:text-blue-400',
  };
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-foreground">{item.description}</span>
          <span className={cn(
            'px-1.5 py-0.5 text-[9px] rounded uppercase font-mono',
            item.curable ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'
          )}>
            {item.curable ? 'Curable' : 'Incurable'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className={cn('font-mono', typeColors[item.type])}>
            {(item.rate * 100).toFixed(1)}%
          </span>
          <span>Range: {(item.rate_range[0] * 100).toFixed(1)}-{(item.rate_range[1] * 100).toFixed(1)}%</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 italic">
          {item.detection_logic}
        </div>
      </div>
    </div>
  );
}

function ExternalFactorRow({ 
  factor 
}: { 
  factor: ExternalObsolescenceData['factors_detected'][0];
}) {
  const categoryColors = {
    'environmental': 'bg-red-500/20 text-red-600 dark:text-red-400',
    'locational': 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    'economic': 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    'regulatory': 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
  };
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className={cn(
        'px-1.5 py-0.5 text-[9px] rounded uppercase font-mono flex-shrink-0',
        categoryColors[factor.category]
      )}>
        {factor.category}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground mb-1">{factor.description}</div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-mono text-orange-600 dark:text-orange-400">
            {(factor.rate * 100).toFixed(1)}%
          </span>
          <span>Threshold: {factor.threshold_used}</span>
          <span>Source: {factor.data_source}</span>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// SECTION COMPONENTS
// =====================================================

function PhysicalDepreciationSection({ 
  data,
  rcn,
  expanded,
  onToggle,
  onOverrideClick,
}: { 
  data: PhysicalDepreciationData;
  rcn: number;
  expanded: boolean;
  onToggle: () => void;
  onOverrideClick?: () => void;
}) {
  const amount = rcn * data.depreciation_rate;
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-card/50 hover:bg-card transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">Physical Depreciation</div>
            <div className="text-xs text-muted-foreground">Modified Age-Life Method</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-lg font-mono font-bold text-blue-600 dark:text-blue-400">
              {(data.depreciation_rate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              ₵{amount.toLocaleString()}
            </div>
          </div>
          <ConfidenceIndicator confidence={data.confidence} />
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 border-t border-border bg-background/50">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-card rounded border border-border">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                <Calendar className="w-3 h-3" />
                Actual Age
              </div>
              <div className="text-xl font-mono text-foreground">
                {data.actual_age} <span className="text-xs text-muted-foreground">years</span>
              </div>
            </div>
            <div className="p-3 bg-card rounded border border-border">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                <Clock className="w-3 h-3" />
                Effective Age
              </div>
              <div className="text-xl font-mono text-foreground">
                {data.effective_age.toFixed(1)} <span className="text-xs text-muted-foreground">years</span>
              </div>
            </div>
            <div className="p-3 bg-card rounded border border-border">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                <TrendingDown className="w-3 h-3" />
                Economic Life
              </div>
              <div className="text-xl font-mono text-foreground">
                {data.economic_life} <span className="text-xs text-muted-foreground">years</span>
              </div>
            </div>
            <div className="p-3 bg-card rounded border border-border">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                <Shield className="w-3 h-3" />
                Remaining Life
              </div>
              <div className="text-xl font-mono text-foreground">
                {data.remaining_life.toFixed(1)} <span className="text-xs text-muted-foreground">years</span>
              </div>
            </div>
          </div>
          
          {/* Inputs Used */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Inputs Used
            </div>
            <div className="bg-card rounded border border-border p-3">
              <InputsUsedRow label="Year Built" value={data.inputs_used.year_built} />
              <InputsUsedRow label="Condition" value={data.inputs_used.condition} />
              <InputsUsedRow label="Condition Factor" value={data.inputs_used.condition_factor?.toFixed(2)} />
              <InputsUsedRow label="Construction Type" value={data.inputs_used.construction_type} />
              <InputsUsedRow label="Last Renovation" value={data.inputs_used.last_renovation} />
              <InputsUsedRow label="Renovation Adjustment" value={
                data.inputs_used.renovation_adjustment 
                  ? `${(data.inputs_used.renovation_adjustment * 100).toFixed(0)}%` 
                  : undefined
              } />
            </div>
          </div>
          
          {/* Notes */}
          {data.notes.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2">Notes</div>
              <div className="space-y-1">
                {data.notes.map((note, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Auto-calculated badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {data.auto_calculated ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400">Auto-calculated</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-xs text-yellow-600 dark:text-yellow-400">Manual calculation required</span>
                </>
              )}
            </div>
            {onOverrideClick && (
              <button
                onClick={onOverrideClick}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Wrench className="w-3 h-3" />
                Override
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FunctionalObsolescenceSection({ 
  data,
  rcn,
  expanded,
  onToggle,
  onOverrideClick,
}: { 
  data: FunctionalObsolescenceData;
  rcn: number;
  expanded: boolean;
  onToggle: () => void;
  onOverrideClick?: () => void;
}) {
  const amount = rcn * data.depreciation_rate;
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-card/50 hover:bg-card transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Settings2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">Functional Obsolescence</div>
            <div className="text-xs text-muted-foreground">
              {data.total_items} items detected
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-lg font-mono font-bold text-orange-600 dark:text-orange-400">
              {(data.depreciation_rate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              ₵{amount.toLocaleString()}
            </div>
          </div>
          <ConfidenceIndicator confidence={data.confidence} />
          {data.requires_review && (
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 border-t border-border bg-background/50">
          {/* Curable vs Incurable */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-card rounded border border-green-500/30">
              <div className="text-[10px] text-green-600 dark:text-green-400 mb-1">CURABLE</div>
              <div className="text-xl font-mono text-foreground">
                {(data.curable_rate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Can be fixed by owner</div>
            </div>
            <div className="p-3 bg-card rounded border border-red-500/30">
              <div className="text-[10px] text-red-600 dark:text-red-400 mb-1">INCURABLE</div>
              <div className="text-xl font-mono text-foreground">
                {(data.incurable_rate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Cannot be economically fixed</div>
            </div>
          </div>
          
          {/* Detected Items */}
          {data.items_detected.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Detected Issues
              </div>
              <div className="bg-card rounded border border-border p-3">
                {data.items_detected.map((item, i) => (
                  <DetectedItemRow key={item.item_key} item={item} index={i} />
                ))}
              </div>
            </div>
          )}
          
          {data.items_detected.length === 0 && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">No functional obsolescence detected</span>
              </div>
            </div>
          )}
          
          {/* Notes */}
          {data.notes.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2">Notes</div>
              <div className="space-y-1">
                {data.notes.map((note, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {data.auto_calculated ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400">Auto-detected</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-xs text-yellow-600 dark:text-yellow-400">Manual review needed</span>
                </>
              )}
            </div>
            {onOverrideClick && (
              <button
                onClick={onOverrideClick}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Wrench className="w-3 h-3" />
                Override
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExternalObsolescenceSection({ 
  data,
  rcn,
  expanded,
  onToggle,
  onOverrideClick,
}: { 
  data: ExternalObsolescenceData;
  rcn: number;
  expanded: boolean;
  onToggle: () => void;
  onOverrideClick?: () => void;
}) {
  const amount = rcn * data.depreciation_rate;
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-card/50 hover:bg-card transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">External Obsolescence</div>
            <div className="text-xs text-muted-foreground">
              {data.total_factors} factors from {data.data_sources_used.length} sources
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-lg font-mono font-bold text-purple-600 dark:text-purple-400">
              {(data.depreciation_rate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              ₵{amount.toLocaleString()}
            </div>
          </div>
          <ConfidenceIndicator confidence={data.confidence} />
          {data.requires_review && (
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 border-t border-border bg-background/50">
          {/* Category Breakdown */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {Object.entries(data.category_breakdown).map(([category, rate]) => {
              const categoryColors: Record<string, string> = {
                'environmental': 'border-red-500/30 bg-red-500/10',
                'locational': 'border-yellow-500/30 bg-yellow-500/10',
                'economic': 'border-blue-500/30 bg-blue-500/10',
                'regulatory': 'border-purple-500/30 bg-purple-500/10',
              };
              return (
                <div 
                  key={category} 
                  className={cn('p-2 rounded border text-center', categoryColors[category])}
                >
                  <div className="text-[9px] text-muted-foreground uppercase mb-1">{category}</div>
                  <div className="text-sm font-mono text-foreground font-bold">
                    {((rate as number) * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Detected Factors */}
          {data.factors_detected.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Detected Factors
              </div>
              <div className="bg-card rounded border border-border p-3">
                {data.factors_detected.map((factor) => (
                  <ExternalFactorRow key={factor.factor_key} factor={factor} />
                ))}
              </div>
            </div>
          )}
          
          {data.factors_detected.length === 0 && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">No external obsolescence factors detected</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Based on available location and market data
              </div>
            </div>
          )}
          
          {/* Data Sources */}
          {data.data_sources_used.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2">Data Sources</div>
              <div className="flex flex-wrap gap-2">
                {data.data_sources_used.map((source) => (
                  <span 
                    key={source}
                    className="px-2 py-1 text-[10px] bg-muted text-muted-foreground rounded font-mono"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Notes */}
          {data.notes.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-2">Notes</div>
              <div className="space-y-1">
                {data.notes.map((note, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {data.auto_calculated ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400">Auto-calculated</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-xs text-yellow-600 dark:text-yellow-400">Insufficient data</span>
                </>
              )}
            </div>
            {onOverrideClick && (
              <button
                onClick={onOverrideClick}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Wrench className="w-3 h-3" />
                Override
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function DepreciationBreakdownPanel({
  data,
  onOverrideClick,
  collapsed: initialCollapsed = false,
  className,
}: DepreciationBreakdownPanelProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['physical']));
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };
  
  const totalDepreciation = data.total.amount;
  const depreciatedValue = data.rcn - totalDepreciation;
  
  return (
    <div className={cn('bg-background border border-border rounded-lg', className)}>
      {/* Panel Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4 border-b border-border"
      >
        <div className="flex items-center gap-3">
          <TrendingDown className="w-5 h-5 text-muted-foreground" />
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">Depreciation Analysis</div>
            <div className="text-xs text-muted-foreground">RICS/GhIS Compliant Calculations</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-red-600 dark:text-red-400">
              -{(data.total.rate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              ₵{totalDepreciation.toLocaleString()} total
            </div>
          </div>
          {data.total.was_capped && (
            <span className="px-2 py-1 text-[10px] bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded font-mono">
              CAPPED
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <RateDisplay 
              rate={data.physical.depreciation_rate} 
              amount={data.rcn * data.physical.depreciation_rate}
              label="Physical"
              color="blue"
            />
            <RateDisplay 
              rate={data.functional.depreciation_rate} 
              amount={data.rcn * data.functional.depreciation_rate}
              label="Functional"
              color="orange"
            />
            <RateDisplay 
              rate={data.external.depreciation_rate} 
              amount={data.rcn * data.external.depreciation_rate}
              label="External"
              color="purple"
            />
            <div className="p-3 border rounded-lg border-green-500 bg-green-500/10">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">Depreciated Value</div>
              <div className="text-2xl font-mono font-bold text-green-600 dark:text-green-400">
                ₵{depreciatedValue.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                RCN - Depreciation
              </div>
            </div>
          </div>
          
          {/* RCN Reference */}
          <div className="flex items-center justify-between px-3 py-2 bg-card rounded border border-border">
            <span className="text-xs text-muted-foreground">Replacement Cost New (RCN)</span>
            <span className="text-sm font-mono text-foreground">₵{data.rcn.toLocaleString()}</span>
          </div>
          
          {/* Methodology Notes */}
          {data.reconciliation.methodology_notes.length > 0 && (
            <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded">
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-1">
                <HelpCircle className="w-3 h-3" />
                Methodology Notes
              </div>
              <div className="space-y-1">
                {data.reconciliation.methodology_notes.map((note, i) => (
                  <div key={i} className="text-xs text-muted-foreground">{note}</div>
                ))}
              </div>
            </div>
          )}
          
          {/* Expandable Sections */}
          <div className="space-y-3">
            <PhysicalDepreciationSection
              data={data.physical}
              rcn={data.rcn}
              expanded={expandedSections.has('physical')}
              onToggle={() => toggleSection('physical')}
              onOverrideClick={onOverrideClick ? () => onOverrideClick('physical') : undefined}
            />
            
            <FunctionalObsolescenceSection
              data={data.functional}
              rcn={data.rcn}
              expanded={expandedSections.has('functional')}
              onToggle={() => toggleSection('functional')}
              onOverrideClick={onOverrideClick ? () => onOverrideClick('functional') : undefined}
            />
            
            <ExternalObsolescenceSection
              data={data.external}
              rcn={data.rcn}
              expanded={expandedSections.has('external')}
              onToggle={() => toggleSection('external')}
              onOverrideClick={onOverrideClick ? () => onOverrideClick('external') : undefined}
            />
          </div>
          
          {/* Overall Confidence */}
          <div className="flex items-center justify-between p-3 bg-card rounded border border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Overall Calculation Confidence</span>
              {data.reconciliation.requires_review && (
                <span className="px-2 py-0.5 text-[9px] bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded">
                  Review Recommended
                </span>
              )}
            </div>
            <ConfidenceIndicator confidence={data.reconciliation.confidence} />
          </div>
        </div>
      )}
    </div>
  );
}

export default DepreciationBreakdownPanel;
