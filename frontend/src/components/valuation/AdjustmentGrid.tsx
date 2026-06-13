'use client';

/**
 * Adjustment Grid
 * 
 * Full RICS-compliant adjustment matrix showing:
 * - Subject property vs all comparables side by side
 * - Physical, Location, Legal/Economic adjustment categories
 * - All sub-items with auto-calculated and manual adjustments
 * - Gross adjustment and adjusted price per comparable
 * 
 * Per valuation.md Step 6.1: Sales Comparison Approach specification
 */

import React, { useMemo, useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  Calculator,
} from 'lucide-react';
import { TerminalPanel } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import { getTenureRiskAdjustment, TENURE_TYPES } from '@/types/comprehensiveProperty';

// =====================================================
// GHANA-SPECIFIC NEIGHBORHOOD PREMIUMS
// Loaded from database, but cached here for fast access
// =====================================================

export const NEIGHBORHOOD_PREMIUMS: Record<string, number> = {
  // Prime+ (30%+ premium)
  'airport_residential': 1.30,
  'airport residential': 1.30,
  'cantonments': 1.28,
  'ridge': 1.25,
  
  // Prime (15-25% premium)
  'roman_ridge': 1.22,
  'roman ridge': 1.22,
  'east_legon': 1.20,
  'east legon': 1.20,
  'labone': 1.18,
  'osu': 1.15,
  'switchback_road': 1.18,
  'switchback road': 1.18,
  'ringway_estates': 1.15,
  'ringway estates': 1.15,
  
  // Prime Minus (5-15% premium)
  'dzorwulu': 1.12,
  'abelemkpe': 1.10,
  'north_ridge': 1.12,
  'north ridge': 1.12,
  'tesano': 1.08,
  'adjiringanor': 1.10,
  'asylum_down': 1.05,
  'asylum down': 1.05,
  
  // Secondary (Baseline ±5%)
  'achimota': 1.00,
  'dansoman': 0.98,
  'spintex': 1.02,
  'spintex_road': 1.02,
  'spintex road': 1.02,
  'sakumono': 0.98,
  'teshie': 0.95,
  'nungua': 0.95,
  'adenta': 0.95,
  'madina': 0.92,
  'dome': 0.95,
  
  // Tertiary (10-20% discount)
  'tema': 0.90,
  'tema_community_1': 0.90,
  'kasoa': 0.82,
  'ashaiman': 0.80,
  'lashibi': 0.88,
  'agbogba': 0.88,
  'pokuase': 0.85,
};

/**
 * Get neighborhood premium factor
 * Returns 1.0 (neutral) if not found
 */
export const getNeighborhoodPremium = (neighborhood: string): number => {
  if (!neighborhood) return 1.0;
  const normalized = neighborhood.toLowerCase().trim();
  return NEIGHBORHOOD_PREMIUMS[normalized] ?? 1.0;
};

/**
 * Calculate neighborhood adjustment percentage between two neighborhoods
 */
export const calculateNeighborhoodAdjustment = (subjectNeighborhood: string, compNeighborhood: string): number => {
  const subjectPremium = getNeighborhoodPremium(subjectNeighborhood);
  const compPremium = getNeighborhoodPremium(compNeighborhood);
  
  // Adjustment = (subject_premium / comp_premium - 1) * 100
  // If subject is in better neighborhood, positive adjustment
  const adjustment = ((subjectPremium / compPremium) - 1) * 100;
  
  // Cap at ±30%
  return Math.max(-30, Math.min(30, adjustment));
};

// =====================================================
// TYPES
// =====================================================

export interface SubjectProperty {
  id?: string;
  address?: string;
  
  // Physical
  gfa: number;
  plot_size?: number;
  bedrooms?: number;
  bathrooms?: number;
  age?: number;
  year_built?: number;
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  quality_rating?: 'luxury' | 'high' | 'standard' | 'basic' | 'substandard';
  floor_number?: number;
  
  // Location
  neighborhood?: string; // Actual neighborhood name for premium lookup
  neighborhood_rating?: string;
  view_quality?: string;
  accessibility_rating?: string;
  
  // Legal
  tenure_type?: string;
  
  // Amenities
  parking_spaces?: number;
  has_pool?: boolean;
  has_garden?: boolean;
  has_security?: boolean;
}

export interface ComparableWithAdjustments {
  id: string;
  address?: string;
  full_address?: string;
  
  // Evidence type tracking (RICS/GhIS compliance)
  evidence_type?: 'verified_sale' | 'achieved_price' | 'asking_price' | 'listing';
  listing_adjustment?: number; // Asking-to-achieved adjustment percentage
  days_on_market?: number;
  
  // Transaction - prices normalized to GHS
  sale_price: number;  // Price in GHS (converted if originally USD)
  sale_date: string;
  
  // Currency conversion info
  price_original?: number;  // Original price in source currency
  price_currency?: string;  // Original currency (GHS or USD)
  asking_price_ghs?: number;  // Asking price converted to GHS
  fx_rate_used?: number;  // FX rate used for conversion
  
  // Physical
  gfa: number;
  plot_size?: number;
  bedrooms?: number;
  bathrooms?: number;
  age?: number;
  year_built?: number;
  condition?: string;
  quality_rating?: string;
  floor_number?: number;
  
  // Location
  neighborhood?: string; // Actual neighborhood name for premium lookup
  neighborhood_rating?: string;
  view_quality?: string;
  accessibility_rating?: string;
  
  // Legal
  tenure_type?: string;
  financing_terms?: string;
  sale_conditions?: string;
  
  // Amenities
  parking_spaces?: number;
  has_pool?: boolean;
  has_garden?: boolean;
  has_security?: boolean;
  
  // Adjustments (percentage values)
  adjustments: Record<string, number>;
  
  // Calculated
  totalAdjustment?: number;
  adjustedPrice?: number;
  adjustedPricePerSqm?: number;
  isLocked?: boolean;
  weight?: number;
}

interface AdjustmentCategory {
  id: string;
  label: string;
  description: string;
  items: AdjustmentItem[];
  collapsed?: boolean;
}

interface AdjustmentItem {
  id: string;
  label: string;
  unit?: string;
  maxAdjustment?: number;
  getSubjectValue: (subject: SubjectProperty) => string | number | undefined;
  getCompValue: (comp: ComparableWithAdjustments) => string | number | undefined;
  formatValue?: (value: any) => string;
  autoCalculate?: (subject: SubjectProperty, comp: ComparableWithAdjustments) => number;
}

interface AdjustmentGridProps {
  subject: SubjectProperty;
  comparables: ComparableWithAdjustments[];
  onAdjustmentChange: (compId: string, adjustmentId: string, value: number) => void;
  onWeightChange?: (compId: string, weight: number) => void;
  onLockToggle?: (compId: string) => void;
  onAutoCalculate?: (compId: string) => void;
  readOnly?: boolean;
  showWeights?: boolean;
  className?: string;
}

// =====================================================
// ADJUSTMENT CATEGORIES CONFIGURATION
// =====================================================

const ADJUSTMENT_CATEGORIES: AdjustmentCategory[] = [
  {
    id: 'listing_adjustment',
    label: 'Listing Evidence Adjustment',
    description: 'Adjustment for asking price to estimated achieved price (RICS/GhIS compliant)',
    items: [
      {
        id: 'listing_type',
        label: 'Evidence Type',
        getSubjectValue: () => '—',
        getCompValue: (c) => (c as any).evidence_type || 'asking_price',
        formatValue: (v) => {
          const types: Record<string, string> = {
            'verified_sale': 'Verified Sale',
            'achieved_price': 'Achieved Price', 
            'asking_price': 'Asking Price',
            'listing': 'Listing',
          };
          return types[v] || 'Asking Price';
        },
      },
      {
        id: 'listing_adjustment',
        label: 'Asking-to-Achieved Adj.',
        unit: '%',
        maxAdjustment: 30,
        getSubjectValue: () => '—',
        getCompValue: (c) => {
          // Show the current listing adjustment if set
          const adj = (c as any).listing_adjustment;
          return adj !== undefined && adj !== null ? `${adj}%` : 'Not Set';
        },
        autoCalculate: (_, c) => {
          // Auto-calculate based on evidence type and property type
          const evidenceType = (c as any).evidence_type || 'asking_price';
          if (evidenceType === 'verified_sale' || evidenceType === 'achieved_price') {
            return 0; // No adjustment needed for verified sales
          }
          
          // Default adjustments based on typical Ghana market conditions
          // Luxury/High-end: typically 15-25% negotiation
          // Standard: typically 10-15% negotiation
          // Basic: typically 5-10% negotiation
          const qualityRating = c.quality_rating || 'standard';
          const baseAdjustments: Record<string, number> = {
            'luxury': -20,
            'high': -15,
            'standard': -12,
            'basic': -8,
            'substandard': -5,
          };
          
          return baseAdjustments[qualityRating] || -12; // Default -12% for unknown
        },
      },
      {
        id: 'listing_days_on_market',
        label: 'Days on Market',
        unit: 'days',
        maxAdjustment: 10,
        getSubjectValue: () => '—',
        getCompValue: (c) => (c as any).days_on_market || '—',
        autoCalculate: (_, c) => {
          // Properties on market longer typically have more room for negotiation
          const days = (c as any).days_on_market;
          if (!days) return 0;
          if (days > 180) return -5; // Long time on market = more negotiation room
          if (days > 90) return -3;
          if (days < 30) return 2; // Quick sales often closer to asking
          return 0;
        },
      },
    ],
  },
  {
    id: 'transaction',
    label: 'Transaction',
    description: 'Sale price and date information',
    items: [
      {
        id: 'sale_price',
        label: 'Asking Price', // Changed from 'Sale Price' to 'Asking Price' per RICS terminology
        getSubjectValue: () => '—',
        getCompValue: (c) => c.sale_price,
        formatValue: (v) => typeof v === 'number' ? `₵${v.toLocaleString()}` : v,
      },
      {
        id: 'sale_date',
        label: 'Listing Date', // Changed from 'Sale Date' to 'Listing Date'
        getSubjectValue: () => '—',
        getCompValue: (c) => c.sale_date,
        formatValue: (v) => v ? new Date(v).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : '—',
      },
    ],
  },
  {
    id: 'physical',
    label: 'Physical Characteristics',
    description: 'Building and site physical attributes',
    items: [
      {
        id: 'gfa',
        label: 'GFA (m²)',
        unit: 'sqm',
        maxAdjustment: 25,
        getSubjectValue: (s) => s.gfa,
        getCompValue: (c) => c.gfa,
        autoCalculate: (s, c) => {
          if (!s.gfa || !c.gfa) return 0;
          const diff = (s.gfa - c.gfa) / c.gfa;
          return Math.max(-25, Math.min(25, diff * 100));
        },
      },
      {
        id: 'plot_size',
        label: 'Plot Size (m²)',
        unit: 'sqm',
        maxAdjustment: 20,
        getSubjectValue: (s) => s.plot_size,
        getCompValue: (c) => c.plot_size,
        autoCalculate: (s, c) => {
          if (!s.plot_size || !c.plot_size) return 0;
          const diff = (s.plot_size - c.plot_size) / c.plot_size;
          return Math.max(-20, Math.min(20, diff * 50));
        },
      },
      {
        id: 'bedrooms',
        label: 'Bedrooms',
        unit: 'count',
        maxAdjustment: 5,
        getSubjectValue: (s) => s.bedrooms,
        getCompValue: (c) => c.bedrooms,
        autoCalculate: (s, c) => {
          if (!s.bedrooms || !c.bedrooms) return 0;
          return (s.bedrooms - c.bedrooms) * 2.5; // 2.5% per bedroom
        },
      },
      {
        id: 'bathrooms',
        label: 'Bathrooms',
        unit: 'count',
        maxAdjustment: 4,
        getSubjectValue: (s) => s.bathrooms,
        getCompValue: (c) => c.bathrooms,
        autoCalculate: (s, c) => {
          if (!s.bathrooms || !c.bathrooms) return 0;
          return (s.bathrooms - c.bathrooms) * 2; // 2% per bathroom
        },
      },
      {
        id: 'age',
        label: 'Age (years)',
        unit: 'years',
        maxAdjustment: 15,
        getSubjectValue: (s) => s.age ?? (s.year_built ? new Date().getFullYear() - s.year_built : undefined),
        getCompValue: (c) => c.age ?? (c.year_built ? new Date().getFullYear() - c.year_built : undefined),
        autoCalculate: (s, c) => {
          const subjectAge = s.age ?? (s.year_built ? new Date().getFullYear() - s.year_built : 0);
          const compAge = c.age ?? (c.year_built ? new Date().getFullYear() - c.year_built : 0);
          if (!subjectAge || !compAge) return 0;
          return (compAge - subjectAge) * 0.5; // 0.5% per year difference
        },
      },
      {
        id: 'condition',
        label: 'Condition',
        unit: 'rating',
        maxAdjustment: 15,
        getSubjectValue: (s) => s.condition,
        getCompValue: (c) => c.condition,
        formatValue: (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—',
        autoCalculate: (s, c) => {
          const ratings: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1 };
          const subjectRating = ratings[s.condition || 'good'] || 3;
          const compRating = ratings[c.condition || 'good'] || 3;
          return (subjectRating - compRating) * 5; // 5% per level
        },
      },
      {
        id: 'quality',
        label: 'Quality Rating',
        unit: 'rating',
        maxAdjustment: 20,
        getSubjectValue: (s) => s.quality_rating,
        getCompValue: (c) => c.quality_rating,
        formatValue: (v) => v ? v.charAt(0).toUpperCase() + v.slice(1).replace('_', ' ') : '—',
        autoCalculate: (s, c) => {
          const ratings: Record<string, number> = { luxury: 5, high: 4, standard: 3, basic: 2, substandard: 1 };
          const subjectRating = ratings[s.quality_rating || 'standard'] || 3;
          const compRating = ratings[c.quality_rating || 'standard'] || 3;
          return (subjectRating - compRating) * 5; // 5% per level
        },
      },
      {
        id: 'floor_level',
        label: 'Floor Level',
        unit: 'floor',
        maxAdjustment: 10,
        getSubjectValue: (s) => s.floor_number ? `Floor ${s.floor_number}` : 'N/A',
        getCompValue: (c) => c.floor_number ? `Floor ${c.floor_number}` : 'N/A',
        autoCalculate: (s, c) => {
          if (!s.floor_number || !c.floor_number) return 0;
          return (s.floor_number - c.floor_number) * 2; // 2% per floor
        },
      },
    ],
  },
  {
    id: 'location',
    label: 'Location (Ghana Premiums)',
    description: 'Neighborhood premiums, view, and accessibility - uses Ghana market data',
    items: [
      {
        id: 'neighborhood_premium',
        label: 'Neighborhood Premium',
        unit: '%',
        maxAdjustment: 35,
        getSubjectValue: (s) => {
          const premium = getNeighborhoodPremium(s.neighborhood || '');
          return premium !== 1.0 ? `${((premium - 1) * 100).toFixed(0)}%` : '0% (Baseline)';
        },
        getCompValue: (c) => {
          const premium = getNeighborhoodPremium((c as any).neighborhood || '');
          return premium !== 1.0 ? `${((premium - 1) * 100).toFixed(0)}%` : '0% (Baseline)';
        },
        autoCalculate: (s, c) => {
          // Use Ghana neighborhood premium lookup
          const subjectNeighborhood = s.neighborhood || '';
          const compNeighborhood = (c as any).neighborhood || '';
          return calculateNeighborhoodAdjustment(subjectNeighborhood, compNeighborhood);
        },
      },
      {
        id: 'neighborhood_rating',
        label: 'Neighborhood Rating',
        unit: 'rating',
        maxAdjustment: 25,
        getSubjectValue: (s) => s.neighborhood_rating,
        getCompValue: (c) => c.neighborhood_rating,
        formatValue: (v) => v ? v.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—',
        autoCalculate: (s, c) => {
          // Fallback if neighborhood names not available
          const ratings: Record<string, number> = { prime_plus: 5, prime: 4, prime_minus: 3, secondary: 2, tertiary: 1 };
          const subjectRating = ratings[s.neighborhood_rating || 'secondary'] || 2;
          const compRating = ratings[c.neighborhood_rating || 'secondary'] || 2;
          return (subjectRating - compRating) * 5;
        },
      },
      {
        id: 'view',
        label: 'View Quality',
        unit: 'rating',
        maxAdjustment: 10,
        getSubjectValue: (s) => s.view_quality,
        getCompValue: (c) => c.view_quality,
        formatValue: (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—',
        autoCalculate: (s, c) => {
          const ratings: Record<string, number> = { 
            panoramic: 7, ocean: 6, city: 5, garden: 4, standard: 3, limited: 2, obstructed: 1 
          };
          const subjectRating = ratings[s.view_quality || 'standard'] || 3;
          const compRating = ratings[c.view_quality || 'standard'] || 3;
          return (subjectRating - compRating) * 2;
        },
      },
      {
        id: 'accessibility',
        label: 'Accessibility',
        unit: 'rating',
        maxAdjustment: 8,
        getSubjectValue: (s) => s.accessibility_rating,
        getCompValue: (c) => c.accessibility_rating,
        formatValue: (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—',
      },
    ],
  },
  {
    id: 'legal_economic',
    label: 'Legal / Economic (Ghana Title Risk)',
    description: 'Tenure risk, financing, and sale conditions - Ghana-specific adjustments per GhIS guidance',
    items: [
      {
        id: 'tenure',
        label: 'Tenure Type',
        unit: 'category',
        maxAdjustment: 30,
        getSubjectValue: (s) => s.tenure_type,
        getCompValue: (c) => c.tenure_type,
        formatValue: (v) => {
          // Use Ghana tenure labels
          const tenure = TENURE_TYPES.find(t => t.value === v);
          return tenure?.label || (v ? v.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—');
        },
        autoCalculate: (s, c) => {
          // Use Ghana-specific tenure risk adjustments
          // Adjustment = subject_risk - comp_risk
          // If subject has better tenure, positive adjustment (comp needs to be adjusted UP)
          // If subject has worse tenure, negative adjustment
          const subjectRisk = getTenureRiskAdjustment(s.tenure_type || 'freehold');
          const compRisk = getTenureRiskAdjustment(c.tenure_type || 'freehold');
          
          // The adjustment is the difference in risk
          // If comp has -15% risk and subject has 0% risk, adjustment = 0 - (-15) = +15%
          return subjectRisk - compRisk;
        },
      },
      {
        id: 'financing',
        label: 'Financing Terms',
        unit: 'category',
        maxAdjustment: 5,
        getSubjectValue: () => 'Cash',
        getCompValue: (c) => c.financing_terms,
        formatValue: (v) => v ? v.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Cash',
        autoCalculate: (_, c) => {
          // Adjust if financing was below market
          if (c.financing_terms === 'below_market') return 3;
          if (c.financing_terms === 'owner_financing') return 1;
          return 0;
        },
      },
      {
        id: 'sale_conditions',
        label: 'Sale Conditions',
        unit: 'category',
        maxAdjustment: 10,
        getSubjectValue: () => "Arm's Length",
        getCompValue: (c) => c.sale_conditions,
        formatValue: (v) => v ? v.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : "Arm's Length",
        autoCalculate: (_, c) => {
          // Adjust for non-arm's length transactions
          if (c.sale_conditions === 'distress') return 10;
          if (c.sale_conditions === 'auction') return 5;
          if (c.sale_conditions === 'related_party') return -5;
          return 0;
        },
      },
    ],
  },
  {
    id: 'time',
    label: 'Time Adjustment',
    description: 'Market conditions change since sale date',
    items: [
      {
        id: 'time',
        label: 'Months Since Sale',
        unit: 'months',
        maxAdjustment: 15,
        getSubjectValue: () => 0,
        getCompValue: (c) => {
          const saleDate = new Date(c.sale_date);
          const now = new Date();
          return Math.round((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        },
        autoCalculate: (_, c) => {
          const saleDate = new Date(c.sale_date);
          const now = new Date();
          const months = (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          // 0.5% per month appreciation (6% annual)
          return Math.min(15, months * 0.5);
        },
      },
    ],
  },
  {
    id: 'amenities',
    label: 'Amenities',
    description: 'Parking, pool, garden, security features',
    items: [
      {
        id: 'parking',
        label: 'Parking Spaces',
        unit: 'count',
        maxAdjustment: 10,
        getSubjectValue: (s) => s.parking_spaces,
        getCompValue: (c) => c.parking_spaces,
        autoCalculate: (s, c) => {
          const subjectSpaces = s.parking_spaces || 0;
          const compSpaces = c.parking_spaces || 0;
          // GHS 15,000 per space, roughly 0.5-1% of typical property value
          return (subjectSpaces - compSpaces) * 0.5;
        },
      },
      {
        id: 'pool',
        label: 'Swimming Pool',
        getSubjectValue: (s) => s.has_pool ? 'Yes' : 'No',
        getCompValue: (c) => c.has_pool ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          if (s.has_pool && !c.has_pool) return 3;
          if (!s.has_pool && c.has_pool) return -3;
          return 0;
        },
      },
      {
        id: 'garden',
        label: 'Garden',
        getSubjectValue: (s) => s.has_garden ? 'Yes' : 'No',
        getCompValue: (c) => c.has_garden ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          if (s.has_garden && !c.has_garden) return 2;
          if (!s.has_garden && c.has_garden) return -2;
          return 0;
        },
      },
      {
        id: 'security',
        label: 'Security Features',
        getSubjectValue: (s) => s.has_security ? 'Yes' : 'No',
        getCompValue: (c) => c.has_security ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          if (s.has_security && !c.has_security) return 2;
          if (!s.has_security && c.has_security) return -2;
          return 0;
        },
      },
    ],
  },
];

// =====================================================
// HELPER COMPONENTS
// =====================================================

function AdjustmentCell({ 
  value, 
  onChange,
  maxAdjustment = 30,
  readOnly = false,
  isLocked = false,
}: { 
  value: number; 
  onChange: (value: number) => void;
  maxAdjustment?: number;
  readOnly?: boolean;
  isLocked?: boolean;
}) {
  const color = value > 0 ? 'text-green-600 dark:text-green-400' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  const absValue = Math.abs(value);
  const isWarning = absValue > maxAdjustment * 0.8;
  
  if (readOnly || isLocked) {
    return (
      <div className={cn('font-mono text-[10px] text-center', color)}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}%
        {isWarning && <AlertTriangle className="w-2 h-2 inline ml-1 text-yellow-600 dark:text-yellow-400" />}
      </div>
    );
  }
  
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={-maxAdjustment}
      max={maxAdjustment}
      step={0.5}
      className={cn(
        'w-14 px-1 py-0.5 bg-background border font-mono text-[10px] text-center',
        color,
        isWarning ? 'border-yellow-500/50' : 'border-border'
      )}
    />
  );
}

function CategoryRow({
  category,
  isExpanded,
  onToggle,
  columnCount,
}: {
  category: AdjustmentCategory;
  isExpanded: boolean;
  onToggle: () => void;
  columnCount: number;
}) {
  return (
    <tr 
      className="bg-muted/50 cursor-pointer hover:bg-muted"
      onClick={onToggle}
    >
      <td className="py-1.5 px-2 font-mono text-[10px] text-amber-500 uppercase tracking-wider" colSpan={columnCount}>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )}
          <span>{category.label}</span>
          <span className="text-muted-foreground normal-case tracking-normal">— {category.description}</span>
        </div>
      </td>
    </tr>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function AdjustmentGrid({
  subject,
  comparables,
  onAdjustmentChange,
  onWeightChange,
  onLockToggle,
  onAutoCalculate,
  readOnly = false,
  showWeights = false,
  className,
}: AdjustmentGridProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  
  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };
  
  // Calculate totals for each comparable
  const totals = useMemo(() => {
    return comparables.map(comp => {
      const totalAdj = Object.values(comp.adjustments).reduce((sum, val) => sum + (val || 0), 0);
      const adjustedPrice = comp.sale_price * (1 + totalAdj / 100);
      const adjustedPricePerSqm = comp.gfa ? adjustedPrice / comp.gfa : 0;
      return { totalAdj, adjustedPrice, adjustedPricePerSqm };
    });
  }, [comparables]);
  
  const columnCount = 2 + comparables.length * 2; // Element + Subject + (Value + Adj) per comp
  
  return (
    <TerminalPanel 
      title="ADJUSTMENT GRID"
      className={className}
      action={
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-muted-foreground">
            {comparables.length} comparables
          </span>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="text-[10px] font-mono text-muted-foreground border-b border-border">
              <th className="text-left pb-2 px-2 w-32">ELEMENT</th>
              <th className="text-center pb-2 px-2 w-20 bg-amber-500/10">
                <div className="text-amber-500">SUBJECT</div>
              </th>
              {comparables.map((comp, idx) => (
                <React.Fragment key={comp.id}>
                  <th className="text-center pb-2 px-2 w-20">
                    <div className="flex items-center justify-center gap-1">
                      <span>C{idx + 1}</span>
                      {onLockToggle && (
                        <button
                          onClick={() => onLockToggle(comp.id)}
                          className="p-0.5 hover:bg-zinc-700 rounded"
                        >
                          {comp.isLocked ? (
                            <Lock className="w-2.5 h-2.5 text-amber-500" />
                          ) : (
                            <Unlock className="w-2.5 h-2.5 text-muted-foreground" />
                          )}
                        </button>
                      )}
                    </div>
                  </th>
                  <th className="text-center pb-2 px-1 w-16">ADJ%</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {ADJUSTMENT_CATEGORIES.map(category => (
              <React.Fragment key={category.id}>
                <CategoryRow
                  category={category}
                  isExpanded={!collapsedCategories.has(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                  columnCount={columnCount}
                />
                
                {!collapsedCategories.has(category.id) && category.items.map(item => (
                  <tr key={item.id} className="border-b border-border/30 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                    <td className="py-1 px-2 pl-6 font-mono text-[10px] text-muted-foreground">
                      {item.label}
                      {item.maxAdjustment && (
                        <span className="text-muted-foreground ml-1">(±{item.maxAdjustment}%)</span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-center font-mono text-[10px] text-foreground bg-amber-500/5">
                      {item.formatValue 
                        ? item.formatValue(item.getSubjectValue(subject))
                        : item.getSubjectValue(subject) ?? '—'}
                    </td>
                    {comparables.map(comp => {
                      const compValue = item.getCompValue(comp);
                      const adjustmentValue = comp.adjustments[item.id] ?? 0;
                      const isAdjustable = item.id !== 'sale_price' && item.id !== 'sale_date';
                      
                      return (
                        <React.Fragment key={comp.id}>
                          <td className="py-1 px-2 text-center font-mono text-[10px] text-muted-foreground">
                            {item.formatValue 
                              ? item.formatValue(compValue)
                              : compValue ?? '—'}
                          </td>
                          <td className="py-1 px-1 text-center">
                            {isAdjustable ? (
                              <AdjustmentCell
                                value={adjustmentValue}
                                onChange={(v) => onAdjustmentChange(comp.id, item.id, v)}
                                maxAdjustment={item.maxAdjustment}
                                readOnly={readOnly}
                                isLocked={comp.isLocked}
                              />
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
            
            {/* Totals Row */}
            <tr className="bg-muted/50 border-t-2 border-border">
              <td className="py-2 px-2 font-mono text-[10px] text-amber-500 font-bold uppercase">
                GROSS ADJUSTMENT
              </td>
              <td className="py-2 px-2 text-center font-mono text-[10px] text-muted-foreground bg-amber-500/5">
                —
              </td>
              {comparables.map((comp, idx) => (
                <React.Fragment key={comp.id}>
                  <td className="py-2 px-2 text-center">
                    {/* Empty for value column */}
                  </td>
                  <td className="py-2 px-1 text-center">
                    <span className={cn(
                      'font-mono text-xs font-bold',
                      totals[idx].totalAdj > 0 ? 'text-green-600 dark:text-green-400' :
                      totals[idx].totalAdj < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                    )}>
                      {totals[idx].totalAdj > 0 ? '+' : ''}{totals[idx].totalAdj.toFixed(1)}%
                    </span>
                  </td>
                </React.Fragment>
              ))}
            </tr>
            
            {/* Adjusted Price Row */}
            <tr className="bg-muted/30">
              <td className="py-2 px-2 font-mono text-[10px] text-amber-500 font-bold uppercase">
                ADJUSTED PRICE
              </td>
              <td className="py-2 px-2 text-center font-mono text-[10px] text-muted-foreground bg-amber-500/5">
                —
              </td>
              {comparables.map((comp, idx) => (
                <React.Fragment key={comp.id}>
                  <td className="py-2 px-2 text-center" colSpan={2}>
                    <div className="font-mono text-sm text-amber-600 dark:text-amber-400 font-bold">
                      ₵{Math.round(totals[idx].adjustedPrice).toLocaleString()}
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">
                      ₵{Math.round(totals[idx].adjustedPricePerSqm).toLocaleString()}/sqm
                    </div>
                  </td>
                </React.Fragment>
              ))}
            </tr>
            
            {/* Weight Row (optional) */}
            {showWeights && (
              <tr className="bg-green-100 dark:bg-green-900/10 border-t border-green-800/30">
                <td className="py-2 px-2 font-mono text-[10px] text-green-600 dark:text-green-400 font-bold uppercase">
                  WEIGHT
                </td>
                <td className="py-2 px-2 text-center font-mono text-[10px] text-muted-foreground bg-amber-500/5">
                  —
                </td>
                {comparables.map(comp => (
                  <React.Fragment key={comp.id}>
                    <td className="py-2 px-2 text-center" colSpan={2}>
                      {onWeightChange && !readOnly ? (
                        <input
                          type="number"
                          value={(comp.weight || 0) * 100}
                          onChange={(e) => onWeightChange(comp.id, (parseFloat(e.target.value) || 0) / 100)}
                          min={0}
                          max={100}
                          step={5}
                          className="w-16 px-1 py-0.5 bg-background border border-green-700 text-green-600 dark:text-green-400 font-mono text-xs text-center"
                        />
                      ) : (
                        <span className="font-mono text-sm text-green-600 dark:text-green-400 font-bold">
                          {((comp.weight || 0) * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Info Banner - Adjustments are automatic */}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Info className="w-3 h-3" />
          <span className="font-mono text-[10px]">
            Adjustments are automatically calculated based on property differences. Click any cell to override.
          </span>
        </div>
      </div>
    </TerminalPanel>
  );
}

export { ADJUSTMENT_CATEGORIES };
export default AdjustmentGrid;
