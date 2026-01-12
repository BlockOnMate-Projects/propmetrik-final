'use client';

/**
 * Listing Adjustment Panel
 * 
 * RICS/GhIS-compliant panel for adjusting asking prices to estimated achieved prices.
 * This is critical for Ghana market where most comparable data comes from listings,
 * not verified sale transactions.
 * 
 * Key Features:
 * - Evidence type classification (verified sale vs asking price)
 * - Asking-to-achieved discount based on property type and market segment
 * - Market conditions factor (seller's vs buyer's market)
 * - Days on market consideration
 * - Disclosure generation for valuation reports
 * 
 * Per RICS Red Book: "Where only asking prices are available, appropriate adjustments
 * must be made to reflect the likely difference between asking and achieved prices"
 */

import React, { useState, useMemo } from 'react';
import { 
  Info, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingDown,
  FileText,
  Calculator,
  Clock,
} from 'lucide-react';
import { TerminalPanel } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// =====================================================
// TYPES
// =====================================================

export type EvidenceType = 'verified_sale' | 'achieved_price' | 'asking_price' | 'listing';

export interface MarketConditions {
  type: 'sellers' | 'balanced' | 'buyers';
  supplyLevel: 'low' | 'moderate' | 'high';
  demandLevel: 'low' | 'moderate' | 'high';
  avgDaysOnMarket: number;
}

export interface ListingAdjustmentConfig {
  evidenceType: EvidenceType;
  baseAdjustment: number; // Asking-to-achieved base discount (e.g., -12%)
  marketConditionsAdjustment: number; // Additional adjustment based on market
  daysOnMarketAdjustment: number; // Adjustment based on listing duration
  totalAdjustment: number; // Sum of all adjustments
  manualOverride?: number; // User can override calculated adjustment
  notes?: string;
}

export interface ListingAdjustmentPanelProps {
  propertyType: string;
  qualityRating: 'luxury' | 'high' | 'standard' | 'basic' | 'substandard';
  daysOnMarket?: number;
  marketConditions?: MarketConditions;
  askingPrice: number;
  evidenceType?: EvidenceType;
  onAdjustmentChange: (config: ListingAdjustmentConfig) => void;
  readOnly?: boolean;
  className?: string;
}

// =====================================================
// CONSTANTS
// =====================================================

// Ghana market asking-to-achieved discount rates by quality segment
// Based on market research and RICS guidance for emerging markets
const BASE_DISCOUNTS: Record<string, number> = {
  luxury: -20,      // Luxury properties: 15-25% negotiation typical
  high: -15,        // High-end: 12-18% negotiation
  standard: -12,    // Standard: 8-15% negotiation
  basic: -8,        // Basic: 5-10% negotiation
  substandard: -5,  // Substandard: minimal negotiation room
};

// Market conditions adjustments
const MARKET_ADJUSTMENTS = {
  sellers: 5,      // Seller's market: less negotiation (-5% instead of -12%)
  balanced: 0,     // Balanced market: standard adjustment
  buyers: -5,      // Buyer's market: more negotiation (-17% instead of -12%)
};

// Days on market adjustments
const DOM_ADJUSTMENTS = {
  fresh: 2,        // < 30 days: likely closer to asking
  normal: 0,       // 30-90 days: standard adjustment
  stale: -3,       // 90-180 days: more room for negotiation
  veryStale: -5,   // > 180 days: significant negotiation room
};

const EVIDENCE_LABELS: Record<EvidenceType, { label: string; description: string; color: string }> = {
  verified_sale: {
    label: 'Verified Sale',
    description: 'Confirmed transaction with documented sale price from Lands Commission or legal records',
    color: 'text-green-400',
  },
  achieved_price: {
    label: 'Achieved Price',
    description: 'Reported sale price from reliable source (agent confirmation, party disclosure)',
    color: 'text-blue-400',
  },
  asking_price: {
    label: 'Asking Price',
    description: 'Listed asking price - requires adjustment to estimated achieved price',
    color: 'text-yellow-400',
  },
  listing: {
    label: 'Listing',
    description: 'Active listing price - requires significant adjustment consideration',
    color: 'text-orange-400',
  },
};

// =====================================================
// COMPONENT
// =====================================================

export function ListingAdjustmentPanel({
  propertyType,
  qualityRating,
  daysOnMarket,
  marketConditions,
  askingPrice,
  evidenceType = 'asking_price',
  onAdjustmentChange,
  readOnly = false,
  className,
}: ListingAdjustmentPanelProps) {
  const [selectedEvidenceType, setSelectedEvidenceType] = useState<EvidenceType>(evidenceType);
  const [manualOverride, setManualOverride] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  // Calculate base discount based on quality rating
  const baseAdjustment = useMemo(() => {
    if (selectedEvidenceType === 'verified_sale' || selectedEvidenceType === 'achieved_price') {
      return 0; // No adjustment for verified sales
    }
    return BASE_DISCOUNTS[qualityRating] || BASE_DISCOUNTS.standard;
  }, [selectedEvidenceType, qualityRating]);

  // Calculate market conditions adjustment
  const marketConditionsAdjustment = useMemo(() => {
    if (selectedEvidenceType === 'verified_sale' || selectedEvidenceType === 'achieved_price') {
      return 0;
    }
    if (!marketConditions) return 0;
    return MARKET_ADJUSTMENTS[marketConditions.type] || 0;
  }, [selectedEvidenceType, marketConditions]);

  // Calculate days on market adjustment
  const daysOnMarketAdjustment = useMemo(() => {
    if (selectedEvidenceType === 'verified_sale' || selectedEvidenceType === 'achieved_price') {
      return 0;
    }
    if (!daysOnMarket) return 0;
    
    if (daysOnMarket < 30) return DOM_ADJUSTMENTS.fresh;
    if (daysOnMarket <= 90) return DOM_ADJUSTMENTS.normal;
    if (daysOnMarket <= 180) return DOM_ADJUSTMENTS.stale;
    return DOM_ADJUSTMENTS.veryStale;
  }, [selectedEvidenceType, daysOnMarket]);

  // Total calculated adjustment
  const calculatedAdjustment = useMemo(() => {
    return baseAdjustment + marketConditionsAdjustment + daysOnMarketAdjustment;
  }, [baseAdjustment, marketConditionsAdjustment, daysOnMarketAdjustment]);

  // Effective adjustment (manual override or calculated)
  const effectiveAdjustment = manualOverride !== null ? manualOverride : calculatedAdjustment;

  // Adjusted price
  const adjustedPrice = useMemo(() => {
    return askingPrice * (1 + effectiveAdjustment / 100);
  }, [askingPrice, effectiveAdjustment]);

  // Handle evidence type change
  const handleEvidenceTypeChange = (type: EvidenceType) => {
    setSelectedEvidenceType(type);
    const config: ListingAdjustmentConfig = {
      evidenceType: type,
      baseAdjustment: type === 'verified_sale' || type === 'achieved_price' ? 0 : BASE_DISCOUNTS[qualityRating],
      marketConditionsAdjustment: type === 'verified_sale' || type === 'achieved_price' ? 0 : marketConditionsAdjustment,
      daysOnMarketAdjustment: type === 'verified_sale' || type === 'achieved_price' ? 0 : daysOnMarketAdjustment,
      totalAdjustment: type === 'verified_sale' || type === 'achieved_price' ? 0 : calculatedAdjustment,
      manualOverride: manualOverride !== null ? manualOverride : undefined,
      notes,
    };
    onAdjustmentChange(config);
  };

  // Handle manual override
  const handleManualOverride = (value: number | null) => {
    setManualOverride(value);
    onAdjustmentChange({
      evidenceType: selectedEvidenceType,
      baseAdjustment,
      marketConditionsAdjustment,
      daysOnMarketAdjustment,
      totalAdjustment: value !== null ? value : calculatedAdjustment,
      manualOverride: value !== null ? value : undefined,
      notes,
    });
  };

  const isAskingPrice = selectedEvidenceType === 'asking_price' || selectedEvidenceType === 'listing';

  return (
    <TooltipProvider>
      <TerminalPanel
        title="LISTING EVIDENCE ADJUSTMENT"
        className={cn('space-y-4', className)}
      >
        {/* Header with icon */}
        <div className="flex items-center gap-2 -mt-2 mb-3">
          <TrendingDown className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-zinc-400">RICS/GhIS Compliant Asking-to-Achieved Conversion</span>
        </div>
        
        {/* RICS Disclosure Notice */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-[10px] text-amber-300">
              <strong>RICS/GhIS Disclosure:</strong> This comparable evidence is based on 
              {isAskingPrice ? ' asking/listing prices' : ' verified sale prices'}. 
              {isAskingPrice && ' An adjustment has been applied to estimate the likely achieved price.'}
            </div>
          </div>
        </div>

        {/* Evidence Type Selection */}
        <div className="space-y-2">
          <label className="block text-[10px] text-zinc-400 uppercase tracking-wider">
            Evidence Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(EVIDENCE_LABELS) as [EvidenceType, typeof EVIDENCE_LABELS.verified_sale][]).map(([type, config]) => (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => !readOnly && handleEvidenceTypeChange(type)}
                    disabled={readOnly}
                    className={cn(
                      'p-2 rounded border text-left transition-all',
                      selectedEvidenceType === type
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-zinc-700 hover:border-zinc-600',
                      readOnly && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className={cn('text-xs font-medium', config.color)}>
                      {config.label}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">{config.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Adjustment Breakdown - Only show for asking prices */}
        {isAskingPrice && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
                Adjustment Breakdown
              </span>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-zinc-500" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-xs">
                    Adjustments based on Ghana market research: typical negotiation 
                    ranges from 5-25% below asking price depending on property segment.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="bg-zinc-800/50 rounded p-3 space-y-2">
              {/* Base Adjustment */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Base ({qualityRating} segment)</span>
                <span className={cn('font-mono', baseAdjustment < 0 ? 'text-red-400' : 'text-green-400')}>
                  {baseAdjustment > 0 ? '+' : ''}{baseAdjustment}%
                </span>
              </div>

              {/* Market Conditions */}
              {marketConditions && marketConditionsAdjustment !== 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">
                    Market ({marketConditions.type === 'sellers' ? "Seller's" : marketConditions.type === 'buyers' ? "Buyer's" : 'Balanced'})
                  </span>
                  <span className={cn('font-mono', marketConditionsAdjustment < 0 ? 'text-red-400' : 'text-green-400')}>
                    {marketConditionsAdjustment > 0 ? '+' : ''}{marketConditionsAdjustment}%
                  </span>
                </div>
              )}

              {/* Days on Market */}
              {daysOnMarket && daysOnMarketAdjustment !== 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {daysOnMarket} days on market
                  </span>
                  <span className={cn('font-mono', daysOnMarketAdjustment < 0 ? 'text-red-400' : 'text-green-400')}>
                    {daysOnMarketAdjustment > 0 ? '+' : ''}{daysOnMarketAdjustment}%
                  </span>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-zinc-700 my-2" />

              {/* Total Calculated */}
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-zinc-300">Calculated Adjustment</span>
                <span className={cn('font-mono', calculatedAdjustment < 0 ? 'text-red-400' : 'text-green-400')}>
                  {calculatedAdjustment > 0 ? '+' : ''}{calculatedAdjustment}%
                </span>
              </div>
            </div>

            {/* Manual Override */}
            {!readOnly && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-400">Manual Override (%)</label>
                  {manualOverride !== null && (
                    <button
                      onClick={() => handleManualOverride(null)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300"
                    >
                      Use Calculated
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={manualOverride ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseFloat(e.target.value) : null;
                      handleManualOverride(val);
                    }}
                    placeholder={`${calculatedAdjustment}%`}
                    min={-50}
                    max={10}
                    step={1}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono focus:border-cyan-500 outline-none"
                  />
                  <span className="text-xs text-zinc-500">%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result Summary */}
        <div className="bg-zinc-900 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Asking Price</span>
            <span className="text-xs font-mono text-zinc-300">
              ₵{askingPrice.toLocaleString()}
            </span>
          </div>
          
          {isAskingPrice && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Effective Adjustment</span>
                <span className={cn('text-xs font-mono', effectiveAdjustment < 0 ? 'text-red-400' : 'text-green-400')}>
                  {effectiveAdjustment > 0 ? '+' : ''}{effectiveAdjustment}%
                </span>
              </div>
              <div className="border-t border-zinc-700 my-1" />
            </>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-300 font-medium">
              {isAskingPrice ? 'Estimated Achieved Price' : 'Verified Price'}
            </span>
            <span className="text-sm font-mono font-bold text-cyan-400">
              ₵{Math.round(adjustedPrice).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Notes */}
        {!readOnly && (
          <div className="space-y-2">
            <label className="block text-[10px] text-zinc-400 uppercase tracking-wider">
              Adjustment Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document rationale for adjustment selection..."
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none resize-none"
            />
          </div>
        )}

        {/* Evidence Quality Indicator */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-700">
          {selectedEvidenceType === 'verified_sale' ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-[10px] text-green-400">High quality evidence - no adjustment required</span>
            </>
          ) : selectedEvidenceType === 'achieved_price' ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] text-blue-400">Reliable evidence - verify source where possible</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-[10px] text-yellow-400">
                Listing evidence - adjustment applied per RICS/GhIS guidance
              </span>
            </>
          )}
        </div>
      </TerminalPanel>
    </TooltipProvider>
  );
}

// =====================================================
// HELPER: Generate Disclosure Text
// =====================================================

export function generateListingDisclosure(
  comparablesCount: number,
  verifiedCount: number,
  askingPriceCount: number,
  avgAdjustment: number
): string {
  if (askingPriceCount === 0) {
    return `The sales comparison approach utilizes ${comparablesCount} comparable properties, ` +
      `all with verified sale prices. This represents the highest quality of market evidence.`;
  }

  if (verifiedCount === 0) {
    return `**Important Disclosure:** The sales comparison approach utilizes ${comparablesCount} ` +
      `comparable properties based on asking/listing prices. In accordance with RICS Red Book ` +
      `and GhIS standards, adjustments averaging ${Math.abs(avgAdjustment).toFixed(1)}% have been ` +
      `applied to estimate likely achieved prices. The absence of verified sale transactions in ` +
      `Ghana's property market necessitates reliance on listing data as the best available ` +
      `market evidence. The valuer has exercised professional judgment in determining ` +
      `appropriate asking-to-achieved price adjustments based on market segment and conditions.`;
  }

  return `The sales comparison approach utilizes ${comparablesCount} comparable properties, ` +
    `comprising ${verifiedCount} verified sale${verifiedCount !== 1 ? 's' : ''} and ` +
    `${askingPriceCount} listing${askingPriceCount !== 1 ? 's' : ''} with asking prices. ` +
    `For listing-based evidence, adjustments averaging ${Math.abs(avgAdjustment).toFixed(1)}% ` +
    `have been applied to estimate achieved prices in accordance with RICS/GhIS guidance.`;
}

export default ListingAdjustmentPanel;
