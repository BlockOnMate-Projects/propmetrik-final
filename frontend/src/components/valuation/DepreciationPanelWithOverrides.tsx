'use client';

/**
 * Depreciation Panel with Override Capability
 * 
 * Wrapper component that combines:
 * - DepreciationBreakdownPanel (D6) - Display auto-calculated values
 * - DepreciationOverrideDialog (D7) - Override with justification
 * 
 * Usage:
 * ```tsx
 * <DepreciationPanelWithOverrides
 *   data={depreciationData}
 *   onOverrideSubmit={async (data) => {
 *     await saveOverride(data);
 *   }}
 * />
 * ```
 */

import React, { useState, useCallback } from 'react';
import { DepreciationBreakdownPanel, DepreciationBreakdownData } from './DepreciationBreakdownPanel';
import { 
  DepreciationOverrideDialog, 
  DepreciationComponent, 
  OverrideFormData,
  EvidenceType,
} from './DepreciationOverrideDialog';

// =====================================================
// TYPES
// =====================================================

export interface DepreciationOverrideState {
  physical?: {
    rate: number;
    justification: string;
    evidenceType: EvidenceType;
    evidenceReference?: string;
    approvalStatus: 'pending' | 'approved' | 'rejected' | 'not_required';
    submittedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
  };
  functional?: {
    rate: number;
    justification: string;
    evidenceType: EvidenceType;
    evidenceReference?: string;
    approvalStatus: 'pending' | 'approved' | 'rejected' | 'not_required';
    submittedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
  };
  external?: {
    rate: number;
    justification: string;
    evidenceType: EvidenceType;
    evidenceReference?: string;
    approvalStatus: 'pending' | 'approved' | 'rejected' | 'not_required';
    submittedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
  };
}

interface DepreciationPanelWithOverridesProps {
  data: DepreciationBreakdownData;
  overrides?: DepreciationOverrideState;
  onOverrideSubmit: (data: OverrideFormData) => Promise<void>;
  collapsed?: boolean;
  className?: string;
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function DepreciationPanelWithOverrides({
  data,
  overrides,
  onOverrideSubmit,
  collapsed = false,
  className,
}: DepreciationPanelWithOverridesProps) {
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeComponent, setActiveComponent] = useState<DepreciationComponent>('physical');
  
  // Handle override click from breakdown panel
  const handleOverrideClick = useCallback((component: DepreciationComponent) => {
    setActiveComponent(component);
    setDialogOpen(true);
  }, []);
  
  // Handle dialog submit
  const handleSubmit = useCallback(async (formData: OverrideFormData) => {
    await onOverrideSubmit(formData);
  }, [onOverrideSubmit]);
  
  // Get auto-calculated rate for active component
  const getAutoRate = (component: DepreciationComponent): number => {
    switch (component) {
      case 'physical':
        return data.physical.depreciation_rate * 100;
      case 'functional':
        return data.functional.depreciation_rate * 100;
      case 'external':
        return data.external.depreciation_rate * 100;
    }
  };
  
  // Get auto-calculated amount for active component
  const getAutoAmount = (component: DepreciationComponent): number => {
    switch (component) {
      case 'physical':
        return data.rcn * data.physical.depreciation_rate;
      case 'functional':
        return data.rcn * data.functional.depreciation_rate;
      case 'external':
        return data.rcn * data.external.depreciation_rate;
    }
  };
  
  // Get current override for active component
  const getCurrentOverride = (component: DepreciationComponent) => {
    const override = overrides?.[component];
    if (!override) return undefined;
    
    return {
      rate: override.rate,
      justification: override.justification,
      evidenceType: override.evidenceType,
      evidenceReference: override.evidenceReference,
    };
  };
  
  return (
    <>
      <DepreciationBreakdownPanel
        data={data}
        onOverrideClick={handleOverrideClick}
        collapsed={collapsed}
        className={className}
      />
      
      <DepreciationOverrideDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        component={activeComponent}
        autoCalculatedRate={getAutoRate(activeComponent)}
        autoCalculatedAmount={getAutoAmount(activeComponent)}
        rcn={data.rcn}
        currentOverride={getCurrentOverride(activeComponent)}
      />
    </>
  );
}

export default DepreciationPanelWithOverrides;
