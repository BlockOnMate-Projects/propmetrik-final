'use client';

/**
 * Land Value Panel
 * 
 * Multi-method land value calculation with reconciliation.
 * Supports three methods:
 * - Comparable Land Sales (auto-calculated)
 * - Residual GDV-Based (auto-calculated)
 * - User-Entered (100% override)
 * 
 * Weight distribution based on comparable strength (per GhIS/RICS):
 * | Comparable Strength | Residual | Comparable |
 * |---------------------|----------|------------|
 * | Weak                | 70%      | 30%        |
 * | Balanced            | 50%      | 50%        |
 * | Strong              | 30%      | 70%        |
 * 
 * User-entered value is a 100% OVERRIDE that bypasses reconciliation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Scale,
  FileText,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { landValueApi } from '@/lib/valuation-api';

// ============================================================================
// TYPES
// ============================================================================

export interface LandValueMethodDetail {
  value: number;
  value_per_sqm: number;
  confidence: number;
  weight: number;
  weighted_contribution: number;
  method_specific?: Record<string, any>;
}

export interface LandComparableSummary {
  id: string;
  distance_km: number;
  sale_date: string;
  sale_price_per_sqm: number;
  adjusted_price_per_sqm: number;
  similarity_score: number;
  adjustment_factor: number;
}

export interface LandValueResult {
  success: boolean;
  final_land_value: number;
  final_land_value_per_sqm: number;
  land_area_sqm: number;
  confidence_score: number;
  primary_method: string;
  is_user_override: boolean;
  user_justification?: string;
  methods?: {
    residual?: LandValueMethodDetail;
    comparable?: LandValueMethodDetail;
  };
  comparables_summary?: {
    count_found: number;
    count_used: number;
    strength: 'weak' | 'balanced' | 'strong';
    top_comparables: LandComparableSummary[];
  };
  reconciliation?: {
    method_weights: Record<string, number>;
    weight_justification: string;
    value_spread_pct: number;
    outlier_flags: string[];
  };
  comparable_strength: 'weak' | 'balanced' | 'strong' | 'N/A';
  disclosure_required: boolean;
  disclosure_text: string;
  cached: boolean;
  error?: string;
}

type MethodStatus = 'idle' | 'loading' | 'success' | 'failed' | 'excluded';

interface MethodCardData {
  method: string;
  label: string;
  icon: React.ReactNode;
  value: number | null;
  valuePerSqm: number | null;
  confidence: number | null;
  weight: number;
  status: MethodStatus;
  error?: string;
  details?: any;
}

interface LandValuePanelProps {
  valuationId: string;
  plotSizeSqm: number;
  region: string;
  propertyType?: string;
  onLandValueChange?: (value: number, method: string) => void;
  collapsed?: boolean;
  className?: string;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ConfidenceBar({ confidence, size = 'md' }: { confidence: number; size?: 'sm' | 'md' | 'lg' }) {
  const percentage = Math.round(confidence * 100);
  const getColor = (conf: number) => {
    if (conf >= 0.75) return 'bg-green-500';
    if (conf >= 0.5) return 'bg-amber-500';
    return 'bg-red-500';
  };
  
  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2' };
  
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 bg-zinc-700 rounded-full overflow-hidden", heights[size])}>
        <div
          className={cn("h-full transition-all duration-300", getColor(confidence))}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-zinc-400 w-8">{percentage}%</span>
    </div>
  );
}

function MethodStatusBadge({ status }: { status: MethodStatus }) {
  const styles = {
    idle: 'bg-zinc-700 text-zinc-400',
    loading: 'bg-blue-500/20 text-blue-400',
    success: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    excluded: 'bg-amber-500/20 text-amber-400',
  };
  
  const labels = {
    idle: 'Pending',
    loading: 'Calculating...',
    success: 'Active',
    failed: 'Failed',
    excluded: 'Excluded',
  };
  
  return (
    <span className={cn("px-2 py-0.5 rounded text-[9px] font-medium uppercase", styles[status])}>
      {status === 'loading' && <Loader2 className="w-2.5 h-2.5 inline mr-1 animate-spin" />}
      {labels[status]}
    </span>
  );
}

function WeightBadge({ weight }: { weight: number }) {
  if (weight === 0) return null;
  
  return (
    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[9px] font-mono">
      {(weight * 100).toFixed(0)}%
    </span>
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `₵ ${value.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
}

function formatPerSqm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `₵ ${value.toLocaleString('en-GH', { maximumFractionDigits: 0 })}/sqm`;
}

// ============================================================================
// METHOD CARD COMPONENT
// ============================================================================

interface MethodCardProps {
  data: MethodCardData;
  isSelected: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
  disabled?: boolean;
}

function MethodCard({ data, isSelected, onSelect, onViewDetails, disabled }: MethodCardProps) {
  const isUserEntered = data.method === 'user_entered';
  
  return (
    <div
      className={cn(
        "relative p-4 border rounded-lg transition-all cursor-pointer",
        isSelected
          ? "border-amber-500 bg-amber-500/10"
          : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
        disabled && "opacity-50 cursor-not-allowed",
        data.status === 'failed' && "border-red-500/50"
      )}
      onClick={() => !disabled && onSelect()}
    >
      {/* Selection indicator */}
      <div className={cn(
        "absolute top-3 left-3 w-4 h-4 rounded-full border-2 flex items-center justify-center",
        isSelected ? "border-amber-500 bg-amber-500" : "border-zinc-500"
      )}>
        {isSelected && <Check className="w-2.5 h-2.5 text-zinc-900" />}
      </div>
      
      {/* Header */}
      <div className="flex items-start justify-between mb-3 ml-6">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">{data.icon}</span>
          <span className="text-xs font-medium text-white uppercase tracking-wide">
            {data.label}
          </span>
        </div>
        <MethodStatusBadge status={data.status} />
      </div>
      
      {/* Value */}
      <div className="mb-3 ml-6">
        <div className="text-2xl font-mono font-semibold text-white">
          {formatCurrency(data.value)}
        </div>
        {data.valuePerSqm !== null && (
          <div className="text-[10px] font-mono text-zinc-500">
            {formatPerSqm(data.valuePerSqm)}
          </div>
        )}
      </div>
      
      {/* Weight & Confidence */}
      {data.status === 'success' && !isUserEntered && (
        <div className="space-y-2 ml-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">Weight:</span>
            <WeightBadge weight={data.weight} />
          </div>
          {data.confidence !== null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">Conf:</span>
              <div className="flex-1 max-w-[80px]">
                <ConfidenceBar confidence={data.confidence} size="sm" />
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Error message */}
      {data.status === 'failed' && data.error && (
        <div className="mt-2 ml-6 text-[10px] text-red-400 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>{data.error}</span>
        </div>
      )}
      
      {/* View Details button */}
      {data.status === 'success' && data.details && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          className="mt-3 ml-6 flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View Details
        </button>
      )}
      
      {/* User entered placeholder */}
      {isUserEntered && data.status === 'idle' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          className="mt-2 ml-6 flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300 transition-colors"
        >
          <Edit2 className="w-3 h-3" />
          Enter Value
        </button>
      )}
    </div>
  );
}

// ============================================================================
// COMPARABLE DETAILS MODAL
// ============================================================================

interface ComparableDetailsModalProps {
  open: boolean;
  onClose: () => void;
  comparables: LandComparableSummary[];
  methodDetail?: LandValueMethodDetail;
  strength: 'weak' | 'balanced' | 'strong';
}

function ComparableDetailsModal({ open, onClose, comparables, methodDetail, strength }: ComparableDetailsModalProps) {
  const strengthColors = {
    weak: 'text-red-400 bg-red-500/10',
    balanced: 'text-amber-400 bg-amber-500/10',
    strong: 'text-green-400 bg-green-500/10',
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-500" />
            Comparable Land Sales Analysis
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {comparables.length} comparable land sales analyzed
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
            <div>
              <div className="text-xs text-zinc-500 uppercase">Comparable Strength</div>
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium uppercase mt-1 inline-block", strengthColors[strength])}>
                {strength}
              </span>
            </div>
            {methodDetail && (
              <>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 uppercase">Indicated Value</div>
                  <div className="text-lg font-mono font-semibold text-white">
                    {formatCurrency(methodDetail.value)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 uppercase">Per sqm</div>
                  <div className="font-mono text-amber-400">
                    {formatPerSqm(methodDetail.value_per_sqm)}
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* Comparables table */}
          <div className="border border-zinc-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-3 py-2 text-left text-zinc-400 font-medium">ID</th>
                  <th className="px-3 py-2 text-right text-zinc-400 font-medium">Distance</th>
                  <th className="px-3 py-2 text-right text-zinc-400 font-medium">Sale Date</th>
                  <th className="px-3 py-2 text-right text-zinc-400 font-medium">Price/sqm</th>
                  <th className="px-3 py-2 text-right text-zinc-400 font-medium">Adjusted</th>
                  <th className="px-3 py-2 text-right text-zinc-400 font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {comparables.map((comp) => (
                  <tr key={comp.id} className="hover:bg-zinc-800/50">
                    <td className="px-3 py-2 font-mono text-zinc-300">{comp.id}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{comp.distance_km.toFixed(1)} km</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{comp.sale_date}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">
                      {formatPerSqm(comp.sale_price_per_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-400">
                      {formatPerSqm(comp.adjusted_price_per_sqm)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="w-12 ml-auto">
                        <ConfidenceBar confidence={comp.similarity_score} size="sm" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// RESIDUAL DETAILS MODAL
// ============================================================================

interface ResidualDetailsModalProps {
  open: boolean;
  onClose: () => void;
  methodDetail?: LandValueMethodDetail;
}

function ResidualDetailsModal({ open, onClose, methodDetail }: ResidualDetailsModalProps) {
  const specific = methodDetail?.method_specific || {};
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-500" />
            Residual (GDV-Based) Analysis
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Land value derived from development potential
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
            <div>
              <div className="text-xs text-zinc-500 uppercase">Residual Land Value</div>
              <div className="text-xl font-mono font-semibold text-white mt-1">
                {formatCurrency(methodDetail?.value)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500 uppercase">Per sqm</div>
              <div className="font-mono text-amber-400">
                {formatPerSqm(methodDetail?.value_per_sqm)}
              </div>
            </div>
          </div>
          
          {/* Breakdown */}
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Gross Development Value (GDV)</span>
              <span className="font-mono text-white">{formatCurrency(specific.gdv)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Total Buildable Area</span>
              <span className="font-mono text-white">{specific.total_buildable_sqm?.toLocaleString()} sqm</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Less: Total Development Costs</span>
              <span className="font-mono text-red-400">-{formatCurrency(specific.total_costs)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-700">
              <span className="text-zinc-400">Developer Profit Margin</span>
              <span className="font-mono text-zinc-300">{((specific.developer_profit_pct || 0.20) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between py-2 pt-3 border-t border-amber-500/30">
              <span className="text-amber-400 font-medium">Residual Land Value</span>
              <span className="font-mono font-semibold text-amber-400">{formatCurrency(methodDetail?.value)}</span>
            </div>
          </div>
          
          {/* Confidence */}
          {methodDetail?.confidence && (
            <div className="p-3 bg-zinc-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500 uppercase">Confidence Score</span>
                <span className="font-mono text-xs text-zinc-300">{(methodDetail.confidence * 100).toFixed(0)}%</span>
              </div>
              <ConfidenceBar confidence={methodDetail.confidence} size="md" />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// USER OVERRIDE MODAL
// ============================================================================

interface UserOverrideModalProps {
  open: boolean;
  onClose: () => void;
  landAreaSqm: number;
  currentValue?: number;
  currentJustification?: string;
  onSubmit: (value: number, justification: string) => void;
  saving?: boolean;
}

function UserOverrideModal({ 
  open, 
  onClose, 
  landAreaSqm,
  currentValue,
  currentJustification,
  onSubmit,
  saving 
}: UserOverrideModalProps) {
  const [value, setValue] = useState<string>(currentValue?.toString() || '');
  const [justification, setJustification] = useState(currentJustification || '');
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (open) {
      setValue(currentValue?.toString() || '');
      setJustification(currentJustification || '');
      setError(null);
    }
  }, [open, currentValue, currentJustification]);
  
  const numericValue = parseFloat(value) || 0;
  const perSqm = landAreaSqm > 0 ? numericValue / landAreaSqm : 0;
  
  const handleSubmit = () => {
    if (!value || numericValue <= 0) {
      setError('Please enter a valid land value');
      return;
    }
    if (!justification || justification.length < 10) {
      setError('Please provide a justification (minimum 10 characters)');
      return;
    }
    setError(null);
    onSubmit(numericValue, justification);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-amber-500" />
            Enter Land Value
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            User-entered values override all automated calculations
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200">
              <strong>Override Notice:</strong> Entering a value here will bypass the automated 
              Comparable and Residual calculations. This requires professional justification.
            </div>
          </div>
          
          {/* Value input */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Land Value (GHS)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">₵</span>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-white font-mono focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
            {numericValue > 0 && landAreaSqm > 0 && (
              <div className="mt-1 text-xs text-zinc-500 font-mono">
                = {formatPerSqm(perSqm)} × {landAreaSqm.toLocaleString()} sqm
              </div>
            )}
          </div>
          
          {/* Justification */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Justification <span className="text-red-400">*</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Provide professional justification for this value (e.g., based on recent transaction for adjacent plot at GHS X)"
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-none"
            />
            <div className="mt-1 text-xs text-zinc-500">
              {justification.length}/500 characters (min 10)
            </div>
          </div>
          
          {/* Error */}
          {error && (
            <div className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || !value || !justification}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Apply Override'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DISCLOSURE ALERT
// ============================================================================

interface DisclosureAlertProps {
  text: string;
  required: boolean;
}

function DisclosureAlert({ text, required }: DisclosureAlertProps) {
  if (!required || !text) return null;
  
  return (
    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
      <FileText className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-[10px] text-amber-500 uppercase font-medium mb-1">
          RICS Disclosure Required
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandValuePanel({
  valuationId,
  plotSizeSqm,
  region,
  propertyType = 'residential',
  onLandValueChange,
  collapsed: initialCollapsed = false,
  className,
}: LandValuePanelProps) {
  // State
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LandValueResult | null>(null);
  
  // Modal states
  const [showComparableDetails, setShowComparableDetails] = useState(false);
  const [showResidualDetails, setShowResidualDetails] = useState(false);
  const [showUserOverride, setShowUserOverride] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  
  // Calculate land value
  const calculateLandValue = useCallback(async (userOverride?: { value: number; justification: string }) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await landValueApi.calculate(valuationId, {
        user_entered_value: userOverride?.value,
        user_justification: userOverride?.justification,
        force_recalculate: true,
      });
      
      if (response.success && response.data) {
        setResult(response.data);
        onLandValueChange?.(response.data.final_land_value, response.data.primary_method);
      } else {
        setError(response.error || 'Failed to calculate land value');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [valuationId, onLandValueChange]);
  
  // Load existing data on mount
  useEffect(() => {
    const loadExistingData = async () => {
      try {
        const response = await landValueApi.getByValuation(valuationId);
        if (response.success && response.data?.calculation_result) {
          setResult(response.data.calculation_result);
        }
      } catch {
        // No existing data, that's fine
      }
    };
    
    loadExistingData();
  }, [valuationId]);
  
  // Handle user override submission
  const handleUserOverride = async (value: number, justification: string) => {
    setSavingOverride(true);
    try {
      await calculateLandValue({ value, justification });
      setShowUserOverride(false);
    } finally {
      setSavingOverride(false);
    }
  };
  
  // Build method card data
  const methodCards: MethodCardData[] = [
    {
      method: 'comparable',
      label: 'Comparable Land Sales',
      icon: <MapPin className="w-4 h-4" />,
      value: result?.methods?.comparable?.value ?? null,
      valuePerSqm: result?.methods?.comparable?.value_per_sqm ?? null,
      confidence: result?.methods?.comparable?.confidence ?? null,
      weight: result?.methods?.comparable?.weight ?? 0,
      status: loading ? 'loading' : result?.methods?.comparable ? 'success' : 'idle',
      details: result?.methods?.comparable,
    },
    {
      method: 'residual',
      label: 'Residual (GDV)',
      icon: <Building2 className="w-4 h-4" />,
      value: result?.methods?.residual?.value ?? null,
      valuePerSqm: result?.methods?.residual?.value_per_sqm ?? null,
      confidence: result?.methods?.residual?.confidence ?? null,
      weight: result?.methods?.residual?.weight ?? 0,
      status: loading ? 'loading' : result?.methods?.residual ? 'success' : 'idle',
      details: result?.methods?.residual,
    },
    {
      method: 'user_entered',
      label: 'User-Entered',
      icon: <Edit2 className="w-4 h-4" />,
      value: result?.is_user_override ? result.final_land_value : null,
      valuePerSqm: result?.is_user_override ? result.final_land_value_per_sqm : null,
      confidence: result?.is_user_override ? 1.0 : null,
      weight: result?.is_user_override ? 1.0 : 0,
      status: result?.is_user_override ? 'success' : 'idle',
    },
  ];
  
  const primaryMethod = result?.primary_method || 'comparable';
  
  return (
    <div className={cn("bg-zinc-900 border border-zinc-800 rounded-lg", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-amber-500" />
          <div>
            <h3 className="text-sm font-medium text-white">Land Value</h3>
            {result && (
              <span className="text-xs text-zinc-500 font-mono">
                {formatCurrency(result.final_land_value)} ({formatPerSqm(result.final_land_value_per_sqm)})
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {result && (
            <div className="flex items-center gap-2 mr-4">
              <span className="text-[10px] text-zinc-500 uppercase">Confidence</span>
              <div className="w-16">
                <ConfidenceBar confidence={result.confidence_score} size="sm" />
              </div>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              calculateLandValue();
            }}
            disabled={loading}
            className="h-8 px-2"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </div>
      
      {/* Content */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}
          
          {/* Method Cards Grid */}
          <div className="grid grid-cols-3 gap-3">
            {methodCards.map((card) => (
              <MethodCard
                key={card.method}
                data={card}
                isSelected={!result?.is_user_override && card.method === primaryMethod}
                onSelect={() => {
                  if (card.method === 'user_entered') {
                    setShowUserOverride(true);
                  }
                }}
                onViewDetails={() => {
                  if (card.method === 'comparable') {
                    setShowComparableDetails(true);
                  } else if (card.method === 'residual') {
                    setShowResidualDetails(true);
                  } else if (card.method === 'user_entered') {
                    setShowUserOverride(true);
                  }
                }}
                disabled={loading}
              />
            ))}
          </div>
          
          {/* Reconciled Value */}
          {result && !result.is_user_override && (
            <div className="p-4 bg-zinc-800 border border-amber-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-amber-500 uppercase font-medium mb-1">
                    Reconciled Land Value
                  </div>
                  <div className="text-2xl font-mono font-semibold text-white">
                    {formatCurrency(result.final_land_value)}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-1">
                    {formatPerSqm(result.final_land_value_per_sqm)} × {plotSizeSqm.toLocaleString()} sqm
                  </div>
                </div>
                
                <div className="text-right space-y-2">
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Confidence</div>
                    <div className="w-24 mt-1">
                      <ConfidenceBar confidence={result.confidence_score} size="md" />
                    </div>
                  </div>
                  {result.reconciliation && (
                    <div className="text-[10px] text-zinc-400">
                      Methods: {Object.entries(result.reconciliation.method_weights)
                        .map(([m, w]) => `${m} (${(w * 100).toFixed(0)}%)`)
                        .join(' + ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* User Override Result */}
          {result?.is_user_override && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-amber-500 uppercase font-medium mb-1 flex items-center gap-1">
                    <Edit2 className="w-3 h-3" />
                    User-Entered Land Value
                  </div>
                  <div className="text-2xl font-mono font-semibold text-white">
                    {formatCurrency(result.final_land_value)}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono mt-1">
                    {formatPerSqm(result.final_land_value_per_sqm)} × {plotSizeSqm.toLocaleString()} sqm
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUserOverride(true)}
                  className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </div>
              
              {result.user_justification && (
                <div className="mt-3 pt-3 border-t border-amber-500/20">
                  <div className="text-[10px] text-zinc-500 uppercase mb-1">Justification</div>
                  <p className="text-xs text-zinc-300">{result.user_justification}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Disclosure */}
          {result && (
            <DisclosureAlert 
              text={result.disclosure_text} 
              required={result.disclosure_required} 
            />
          )}
          
          {/* Info footer */}
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <HelpCircle className="w-3 h-3" />
            <span>
              Weights based on {result?.comparable_strength || 'balanced'} comparable evidence 
              (per GhIS/RICS guidance)
            </span>
          </div>
        </div>
      )}
      
      {/* Modals */}
      <ComparableDetailsModal
        open={showComparableDetails}
        onClose={() => setShowComparableDetails(false)}
        comparables={result?.comparables_summary?.top_comparables || []}
        methodDetail={result?.methods?.comparable}
        strength={result?.comparable_strength === 'N/A' ? 'balanced' : (result?.comparable_strength || 'balanced')}
      />
      
      <ResidualDetailsModal
        open={showResidualDetails}
        onClose={() => setShowResidualDetails(false)}
        methodDetail={result?.methods?.residual}
      />
      
      <UserOverrideModal
        open={showUserOverride}
        onClose={() => setShowUserOverride(false)}
        landAreaSqm={plotSizeSqm}
        currentValue={result?.is_user_override ? result.final_land_value : undefined}
        currentJustification={result?.user_justification}
        onSubmit={handleUserOverride}
        saving={savingOverride}
      />
    </div>
  );
}

export default LandValuePanel;
