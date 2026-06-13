'use client';

/**
 * Depreciation Override Dialog (D7)
 * 
 * Modal dialog for overriding auto-calculated depreciation values.
 * Per GhIS/RICS standards, valuers must provide:
 * - Specific justification (min 50 chars)
 * - Supporting evidence
 * - Approval for variance > 20%
 * 
 * Reference: RICS Red Book PS 2, GhIS Valuation Standards Section 5
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle,
  Upload,
  FileText,
  Camera,
  Database,
  User,
  Shield,
  Info,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =====================================================
// TYPES
// =====================================================

export type DepreciationComponent = 'physical' | 'functional' | 'external';

export type EvidenceType = 
  | 'inspection'
  | 'photo'
  | 'market_data'
  | 'expert_opinion'
  | 'comparable_analysis'
  | 'engineering_report'
  | 'insurance_assessment';

export interface OverrideFormData {
  component: DepreciationComponent;
  autoCalculatedRate: number;
  overrideRate: number;
  justification: string;
  evidenceType: EvidenceType;
  evidenceReference: string;
  valuerId?: string;
}

export interface OverrideValidationResult {
  isValid: boolean;
  errors: string[];
  requiresApproval: boolean;
  variancePercent: number;
}

interface DepreciationOverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: OverrideFormData) => Promise<void>;
  component: DepreciationComponent;
  autoCalculatedRate: number;
  autoCalculatedAmount: number;
  rcn: number;
  currentOverride?: {
    rate: number;
    justification: string;
    evidenceType: EvidenceType;
    evidenceReference?: string;
  };
  className?: string;
}

// =====================================================
// CONSTANTS
// =====================================================

const MIN_JUSTIFICATION_LENGTH = 50;
const APPROVAL_THRESHOLD_PERCENT = 20;

const EVIDENCE_TYPE_OPTIONS: Array<{
  value: EvidenceType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    value: 'inspection',
    label: 'Property Inspection',
    icon: <FileText className="w-4 h-4" />,
    description: 'On-site inspection report or notes',
  },
  {
    value: 'photo',
    label: 'Photographic Evidence',
    icon: <Camera className="w-4 h-4" />,
    description: 'Photos documenting property condition',
  },
  {
    value: 'market_data',
    label: 'Market Data',
    icon: <Database className="w-4 h-4" />,
    description: 'Comparable sales or market analysis',
  },
  {
    value: 'expert_opinion',
    label: 'Expert Opinion',
    icon: <User className="w-4 h-4" />,
    description: 'Professional judgment with experience basis',
  },
  {
    value: 'comparable_analysis',
    label: 'Comparable Analysis',
    icon: <FileText className="w-4 h-4" />,
    description: 'Detailed comparable property study',
  },
  {
    value: 'engineering_report',
    label: 'Engineering Report',
    icon: <Shield className="w-4 h-4" />,
    description: 'Structural or condition assessment',
  },
  {
    value: 'insurance_assessment',
    label: 'Insurance Assessment',
    icon: <FileText className="w-4 h-4" />,
    description: 'Insurance valuation or claim report',
  },
];

const COMPONENT_CONFIG: Record<DepreciationComponent, {
  title: string;
  color: string;
  description: string;
}> = {
  physical: {
    title: 'Physical Depreciation',
    color: 'blue',
    description: 'Age-related wear and deterioration',
  },
  functional: {
    title: 'Functional Obsolescence',
    color: 'orange',
    description: 'Design or feature deficiencies',
  },
  external: {
    title: 'External Obsolescence',
    color: 'purple',
    description: 'Location and market factors',
  },
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function validateOverride(
  autoRate: number,
  overrideRate: number,
  justification: string,
  evidenceType: EvidenceType | null,
  evidenceReference: string,
): OverrideValidationResult {
  const errors: string[] = [];
  
  // Calculate variance
  let variancePercent = 0;
  if (autoRate === 0) {
    variancePercent = overrideRate > 0 ? 100 : 0;
  } else {
    variancePercent = Math.abs((overrideRate - autoRate) / autoRate) * 100;
  }
  
  // Check rate bounds
  if (overrideRate < 0) {
    errors.push('Override rate cannot be negative');
  }
  if (overrideRate > 100) {
    errors.push('Override rate cannot exceed 100%');
  }
  
  // Check justification
  const trimmedJustification = justification.trim();
  if (!trimmedJustification) {
    errors.push('Justification is required');
  } else if (trimmedJustification.length < MIN_JUSTIFICATION_LENGTH) {
    errors.push(`Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters (currently ${trimmedJustification.length})`);
  }
  
  // Check evidence
  if (!evidenceType) {
    errors.push('Evidence type is required');
  } else if (evidenceType !== 'expert_opinion' && !evidenceReference.trim()) {
    errors.push('Evidence reference is required for non-expert-opinion overrides');
  }
  
  const requiresApproval = variancePercent > APPROVAL_THRESHOLD_PERCENT;
  
  return {
    isValid: errors.length === 0,
    errors,
    requiresApproval,
    variancePercent,
  };
}

// =====================================================
// COMPONENTS
// =====================================================

function RateComparison({
  autoRate,
  overrideRate,
  rcn,
  color,
}: {
  autoRate: number;
  overrideRate: number;
  rcn: number;
  color: string;
}) {
  const autoAmount = rcn * (autoRate / 100);
  const overrideAmount = rcn * (overrideRate / 100);
  const difference = overrideRate - autoRate;
  const amountDiff = overrideAmount - autoAmount;
  
  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-card rounded-lg border border-border">
      <div>
        <div className="text-[10px] text-muted-foreground uppercase mb-1">Auto-Calculated</div>
        <div className="text-xl font-mono text-muted-foreground">{autoRate.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground font-mono">₵{autoAmount.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase mb-1">Your Override</div>
        <div className={cn(
          'text-xl font-mono font-bold',
          color === 'blue' ? 'text-blue-600 dark:text-blue-400' : 
          color === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-purple-600 dark:text-purple-400'
        )}>
          {overrideRate.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground font-mono">₵{overrideAmount.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase mb-1">Difference</div>
        <div className={cn(
          'text-xl font-mono font-bold',
          difference > 0 ? 'text-red-600 dark:text-red-400' : difference < 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
        )}>
          {difference > 0 ? '+' : ''}{difference.toFixed(1)}%
        </div>
        <div className={cn(
          'text-xs font-mono',
          amountDiff > 0 ? 'text-red-600 dark:text-red-400' : amountDiff < 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
        )}>
          {amountDiff > 0 ? '+' : ''}₵{amountDiff.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function EvidenceTypeSelector({
  value,
  onChange,
  error,
}: {
  value: EvidenceType | null;
  onChange: (type: EvidenceType) => void;
  error?: boolean;
}) {
  return (
    <div className={cn(
      'grid grid-cols-2 gap-2',
      error && 'ring-1 ring-red-500 rounded-lg p-1'
    )}>
      {EVIDENCE_TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg border transition-all text-left',
            value === option.value
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-border bg-card/50 hover:border-border'
          )}
        >
          <div className={cn(
            'mt-0.5',
            value === option.value ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
          )}>
            {option.icon}
          </div>
          <div>
            <div className={cn(
              'text-sm font-medium',
              value === option.value ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {option.label}
            </div>
            <div className="text-[10px] text-muted-foreground">{option.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ApprovalWarning({ variancePercent }: { variancePercent: number }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
          Supervisor Approval Required
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Your override has a variance of {variancePercent.toFixed(1)}% from the auto-calculated value.
          Per GhIS standards, variances exceeding {APPROVAL_THRESHOLD_PERCENT}% require supervisor approval
          before the override can be finalized.
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          The override will be submitted for review and you will be notified once approved.
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function DepreciationOverrideDialog({
  isOpen,
  onClose,
  onSubmit,
  component,
  autoCalculatedRate,
  autoCalculatedAmount,
  rcn,
  currentOverride,
  className,
}: DepreciationOverrideDialogProps) {
  // Form state
  const [overrideRate, setOverrideRate] = useState<number>(
    currentOverride?.rate ?? autoCalculatedRate
  );
  const [justification, setJustification] = useState<string>(
    currentOverride?.justification ?? ''
  );
  const [evidenceType, setEvidenceType] = useState<EvidenceType | null>(
    currentOverride?.evidenceType ?? null
  );
  const [evidenceReference, setEvidenceReference] = useState<string>(
    currentOverride?.evidenceReference ?? ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Validation
  const validation = validateOverride(
    autoCalculatedRate,
    overrideRate,
    justification,
    evidenceType,
    evidenceReference
  );
  
  const config = COMPONENT_CONFIG[component];
  
  // Reset form when dialog opens with new data
  useEffect(() => {
    if (isOpen) {
      setOverrideRate(currentOverride?.rate ?? autoCalculatedRate);
      setJustification(currentOverride?.justification ?? '');
      setEvidenceType(currentOverride?.evidenceType ?? null);
      setEvidenceReference(currentOverride?.evidenceReference ?? '');
      setSubmitError(null);
    }
  }, [isOpen, autoCalculatedRate, currentOverride]);
  
  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!validation.isValid || !evidenceType) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      await onSubmit({
        component,
        autoCalculatedRate,
        overrideRate,
        justification: justification.trim(),
        evidenceType,
        evidenceReference: evidenceReference.trim(),
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit override');
    } finally {
      setIsSubmitting(false);
    }
  }, [validation, evidenceType, component, autoCalculatedRate, overrideRate, justification, evidenceReference, onSubmit, onClose]);
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className={cn(
        'relative w-full max-w-2xl max-h-[90vh] overflow-y-auto',
        'bg-background border border-border rounded-xl shadow-2xl',
        className
      )}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-background">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Override {config.title}
            </h2>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Rate Comparison */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Rate Comparison
            </label>
            <RateComparison
              autoRate={autoCalculatedRate}
              overrideRate={overrideRate}
              rcn={rcn}
              color={config.color}
            />
          </div>
          
          {/* Override Rate Input */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Override Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={overrideRate}
                onChange={(e) => setOverrideRate(parseFloat(e.target.value) || 0)}
                className={cn(
                  'w-full px-4 py-3 bg-card border rounded-lg',
                  'text-foreground font-mono text-lg',
                  'focus:outline-none focus:ring-2',
                  config.color === 'blue' ? 'border-blue-500/30 focus:ring-blue-500/50' :
                  config.color === 'orange' ? 'border-orange-500/30 focus:ring-orange-500/50' :
                  'border-purple-500/30 focus:ring-purple-500/50'
                )}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
          </div>
          
          {/* Approval Warning */}
          {validation.requiresApproval && (
            <ApprovalWarning variancePercent={validation.variancePercent} />
          )}
          
          {/* Justification */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Justification <span className="text-red-600 dark:text-red-400">*</span>
              <span className="text-muted-foreground ml-2">
                (min {MIN_JUSTIFICATION_LENGTH} characters, currently {justification.trim().length})
              </span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explain why you are overriding the auto-calculated value. Include specific observations, market conditions, or property characteristics that justify this adjustment..."
              rows={4}
              className={cn(
                'w-full px-4 py-3 bg-card border rounded-lg',
                'text-foreground text-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                'placeholder:text-muted-foreground',
                justification.trim().length < MIN_JUSTIFICATION_LENGTH && justification.length > 0
                  ? 'border-yellow-500/50'
                  : 'border-border'
              )}
            />
            {justification.length > 0 && justification.trim().length < MIN_JUSTIFICATION_LENGTH && (
              <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                {MIN_JUSTIFICATION_LENGTH - justification.trim().length} more characters needed
              </p>
            )}
          </div>
          
          {/* Evidence Type */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Evidence Type <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <EvidenceTypeSelector
              value={evidenceType}
              onChange={setEvidenceType}
              error={validation.errors.some(e => e.includes('Evidence type'))}
            />
          </div>
          
          {/* Evidence Reference */}
          {evidenceType && evidenceType !== 'expert_opinion' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-2">
                Evidence Reference <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={evidenceReference}
                  onChange={(e) => setEvidenceReference(e.target.value)}
                  placeholder="File path, URL, report number, or document reference..."
                  className={cn(
                    'flex-1 px-4 py-3 bg-card border rounded-lg',
                    'text-foreground text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                    'placeholder:text-muted-foreground',
                    'border-border'
                  )}
                />
                <button
                  type="button"
                  className="px-4 py-3 bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-700 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          
          {/* Expert Opinion Note */}
          {evidenceType === 'expert_opinion' && (
            <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-blue-600 dark:text-blue-400">Expert Opinion Selected</div>
                <div className="text-xs text-muted-foreground mt-1">
                  No external evidence reference is required. Your professional judgment and 
                  experience-based justification will be recorded.
                </div>
              </div>
            </div>
          )}
          
          {/* Validation Errors */}
          {validation.errors.length > 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                Please fix the following issues:
              </div>
              <ul className="space-y-1">
                {validation.errors.map((error, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-red-600 dark:text-red-400">•</span>
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Submit Error */}
          {submitError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">{submitError}</div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between p-4 border-t border-border bg-background">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {validation.requiresApproval && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Requires Approval
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!validation.isValid || isSubmitting}
              className={cn(
                'px-6 py-2 rounded-lg font-medium text-sm transition-all',
                'flex items-center gap-2',
                validation.isValid && !isSubmitting
                  ? 'bg-blue-600 text-foreground hover:bg-blue-500'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : validation.requiresApproval ? (
                <>
                  <Shield className="w-4 h-4" />
                  Submit for Approval
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Apply Override
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DepreciationOverrideDialog;
