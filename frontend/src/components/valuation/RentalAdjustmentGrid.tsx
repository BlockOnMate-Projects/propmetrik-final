'use client';

/**
 * Rental Adjustment Grid
 * 
 * RICS-compliant adjustment matrix for rental comparables.
 * Used in Income Approach to derive market rent estimate.
 * 
 * Rental-specific adjustments:
 * - Size (GFA): ±20% (smaller range than sales)
 * - Bedrooms: 3% per bedroom difference (±15%)
 * - Furnishing: Furnished +15%, Semi +8% (-15% to +15%)
 * - Amenities: Pool +5%, Gym +3%, Security +3% (±15%)
 * - Parking: 2% per space difference (±10%)
 * - Floor Level: 1.5% per floor for apartments (±10%)
 * - Age/Condition: 0.3% per year (±10%)
 * - Location: Neighborhood premium table (±20%)
 * 
 * Per comp.md Phase 5.3: Rental Adjustments
 */

import React, { useMemo, useState, useCallback } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Lock,
  Unlock,
  Calculator,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { TerminalPanel } from '@/components/ui/terminal';
import { cn } from '@/lib/utils';
import { 
  NEIGHBORHOOD_PREMIUMS, 
  getNeighborhoodPremium, 
  calculateNeighborhoodAdjustment,
} from './AdjustmentGrid';

// =====================================================
// TYPES
// =====================================================

export interface RentalSubjectProperty {
  id?: string;
  address?: string;
  
  // Physical
  gfa_sqm: number | null;
  bedrooms: number | null;
  bathrooms?: number | null;
  age?: number | null;
  year_built?: number | null;
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  floor_number?: number | null;
  property_type: string;
  
  // Furnishing & Amenities
  furnishing?: 'furnished' | 'semi-furnished' | 'unfurnished';
  has_pool?: boolean;
  has_gym?: boolean;
  has_security?: boolean;
  has_generator?: boolean;
  parking_spaces?: number | null;
  
  // Location
  neighborhood?: string | null;
}

export interface RentalComparableWithAdjustments {
  id: string;
  title?: string;
  address?: string;
  address_street?: string;
  address_city?: string;
  neighborhood?: string | null;
  
  // Rental details
  asking_rent_monthly: number;
  rent_per_sqm_monthly?: number | null;
  listing_date: string;
  
  // Physical
  gfa_sqm: number | null;
  bedrooms: number | null;
  bathrooms?: number | null;
  age?: number | null;
  year_built?: number | null;
  condition?: string;
  floor_number?: number | null;
  property_type: string;
  
  // Furnishing & Amenities
  furnishing?: string;
  has_pool?: boolean;
  has_gym?: boolean;
  has_security?: boolean;
  has_generator?: boolean;
  parking_spaces?: number | null;
  amenities?: string[];
  
  // Scoring
  distance_km?: number;
  similarity_score: number;
  data_source?: string;
  
  // Adjustments (percentage values)
  adjustments: Record<string, number>;
  
  // Calculated
  totalAdjustment?: number;
  adjustedRent?: number;
  adjustedRentPerSqm?: number | null;
  isLocked?: boolean;
  weight?: number;
}

interface RentalAdjustmentCategory {
  id: string;
  label: string;
  description: string;
  items: RentalAdjustmentItem[];
  collapsed?: boolean;
}

interface RentalAdjustmentItem {
  id: string;
  label: string;
  unit?: string;
  maxAdjustment?: number;
  getSubjectValue: (subject: RentalSubjectProperty) => string | number | undefined | null;
  getCompValue: (comp: RentalComparableWithAdjustments) => string | number | undefined | null;
  formatValue?: (value: any) => string;
  autoCalculate?: (subject: RentalSubjectProperty, comp: RentalComparableWithAdjustments) => number;
}

export interface RentalAdjustmentGridProps {
  subject: RentalSubjectProperty;
  comparables: RentalComparableWithAdjustments[];
  onAdjustmentChange: (compId: string, adjustmentId: string, value: number) => void;
  onWeightChange?: (compId: string, weight: number) => void;
  onLockToggle?: (compId: string) => void;
  onAutoCalculate?: (compId: string) => void;
  readOnly?: boolean;
  showWeights?: boolean;
  className?: string;
}

// =====================================================
// RENTAL ADJUSTMENT CATEGORIES CONFIGURATION
// =====================================================

const FURNISHING_ADJUSTMENTS: Record<string, number> = {
  'furnished': 15,
  'semi-furnished': 8,
  'semi_furnished': 8,
  'unfurnished': 0,
  'unknown': 0,
};

/**
 * Get furnishing adjustment
 * Adjusts comp rent to match subject furnishing level
 */
const getFurnishingAdjustment = (subjectFurnishing: string | undefined, compFurnishing: string | undefined): number => {
  const subjectLevel = FURNISHING_ADJUSTMENTS[subjectFurnishing || 'unfurnished'] ?? 0;
  const compLevel = FURNISHING_ADJUSTMENTS[compFurnishing || 'unfurnished'] ?? 0;
  
  // If subject is furnished and comp is unfurnished, comp needs positive adjustment
  // because an unfurnished comparable's rent would need to be higher to match furnished subject
  return subjectLevel - compLevel;
};

/**
 * Parse amenities from string array or object
 */
const hasAmenity = (comp: RentalComparableWithAdjustments, amenity: string): boolean => {
  // Check direct boolean flags first
  if (amenity === 'pool' && comp.has_pool) return true;
  if (amenity === 'gym' && comp.has_gym) return true;
  if (amenity === 'security' && comp.has_security) return true;
  if (amenity === 'generator' && comp.has_generator) return true;
  
  // Check amenities array
  if (comp.amenities && Array.isArray(comp.amenities)) {
    return comp.amenities.some(a => 
      a.toLowerCase().includes(amenity.toLowerCase())
    );
  }
  
  return false;
};

/**
 * Calculate age from year built
 */
const calculateAge = (yearBuilt: number | null | undefined): number | null => {
  if (!yearBuilt) return null;
  return new Date().getFullYear() - yearBuilt;
};

// =====================================================
// RENTAL-SPECIFIC ADJUSTMENT CATEGORIES
// =====================================================

export const RENTAL_ADJUSTMENT_CATEGORIES: RentalAdjustmentCategory[] = [
  {
    id: 'rental_details',
    label: 'Rental Details',
    description: 'Monthly rent and listing information',
    items: [
      {
        id: 'asking_rent',
        label: 'Asking Rent',
        getSubjectValue: () => '—',
        getCompValue: (c) => c.asking_rent_monthly,
        formatValue: (v) => typeof v === 'number' ? `₵${v.toLocaleString()}` : v || '—',
      },
      {
        id: 'rent_per_sqm',
        label: 'Rent per m²',
        unit: '₵/m²/mo',
        getSubjectValue: () => '—',
        getCompValue: (c) => c.rent_per_sqm_monthly,
        formatValue: (v) => typeof v === 'number' ? `₵${v.toFixed(2)}` : v || '—',
      },
      {
        id: 'listing_date',
        label: 'Listing Date',
        getSubjectValue: () => '—',
        getCompValue: (c) => c.listing_date,
        formatValue: (v) => v ? new Date(v).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : '—',
      },
    ],
  },
  {
    id: 'physical',
    label: 'Physical Characteristics',
    description: 'Size and building attributes',
    items: [
      {
        id: 'gfa',
        label: 'GFA (m²)',
        unit: 'sqm',
        maxAdjustment: 20, // Smaller range for rentals
        getSubjectValue: (s) => s.gfa_sqm,
        getCompValue: (c) => c.gfa_sqm,
        formatValue: (v) => v ? `${v}m²` : '—',
        autoCalculate: (s, c) => {
          if (!s.gfa_sqm || !c.gfa_sqm) return 0;
          // Size adjustment: (subject - comp) / comp × 100
          const diff = ((s.gfa_sqm - c.gfa_sqm) / c.gfa_sqm) * 100;
          return Math.max(-20, Math.min(20, diff));
        },
      },
      {
        id: 'bedrooms',
        label: 'Bedrooms',
        maxAdjustment: 15, // Higher impact on rent
        getSubjectValue: (s) => s.bedrooms,
        getCompValue: (c) => c.bedrooms,
        formatValue: (v) => v?.toString() || '—',
        autoCalculate: (s, c) => {
          if (s.bedrooms === null || s.bedrooms === undefined || 
              c.bedrooms === null || c.bedrooms === undefined) return 0;
          // 3% per bedroom difference
          const diff = (s.bedrooms - c.bedrooms) * 3;
          return Math.max(-15, Math.min(15, diff));
        },
      },
      {
        id: 'bathrooms',
        label: 'Bathrooms',
        maxAdjustment: 10,
        getSubjectValue: (s) => s.bathrooms,
        getCompValue: (c) => c.bathrooms,
        formatValue: (v) => v?.toString() || '—',
        autoCalculate: (s, c) => {
          if (!s.bathrooms || !c.bathrooms) return 0;
          // 2% per bathroom difference
          const diff = (s.bathrooms - c.bathrooms) * 2;
          return Math.max(-10, Math.min(10, diff));
        },
      },
      {
        id: 'floor_level',
        label: 'Floor Level',
        maxAdjustment: 10,
        getSubjectValue: (s) => s.floor_number,
        getCompValue: (c) => c.floor_number,
        formatValue: (v) => v ? `Floor ${v}` : '—',
        autoCalculate: (s, c) => {
          // Only applicable for apartments
          if (!s.property_type?.toLowerCase().includes('apartment') &&
              !s.property_type?.toLowerCase().includes('flat')) return 0;
          if (!s.floor_number || !c.floor_number) return 0;
          // 1.5% per floor difference (higher floors = premium)
          const diff = (s.floor_number - c.floor_number) * 1.5;
          return Math.max(-10, Math.min(10, diff));
        },
      },
      {
        id: 'age_condition',
        label: 'Age/Condition',
        maxAdjustment: 10,
        getSubjectValue: (s) => {
          const age = s.age ?? calculateAge(s.year_built);
          return age !== null ? `${age} yrs` : s.condition || '—';
        },
        getCompValue: (c) => {
          const age = c.age ?? calculateAge(c.year_built);
          return age !== null ? `${age} yrs` : c.condition || '—';
        },
        autoCalculate: (s, c) => {
          const subjectAge = s.age ?? calculateAge(s.year_built);
          const compAge = c.age ?? calculateAge(c.year_built);
          
          if (subjectAge === null || compAge === null) {
            // Fall back to condition comparison
            const conditionRanks: Record<string, number> = {
              'excellent': 4, 'good': 3, 'fair': 2, 'poor': 1
            };
            const subRank = conditionRanks[s.condition || 'good'] || 3;
            const compRank = conditionRanks[c.condition || 'good'] || 3;
            return (subRank - compRank) * 2.5; // 2.5% per condition level
          }
          
          // 0.3% per year difference (less impact than sales)
          const diff = (compAge - subjectAge) * 0.3;
          return Math.max(-10, Math.min(10, diff));
        },
      },
    ],
  },
  {
    id: 'furnishing_amenities',
    label: 'Furnishing & Amenities',
    description: 'Furnishing level and property amenities',
    items: [
      {
        id: 'furnishing',
        label: 'Furnishing',
        maxAdjustment: 15, // Major rental factor
        getSubjectValue: (s) => s.furnishing || 'unfurnished',
        getCompValue: (c) => c.furnishing || 'unfurnished',
        formatValue: (v) => {
          const labels: Record<string, string> = {
            'furnished': 'Furnished',
            'semi-furnished': 'Semi-Furnished',
            'semi_furnished': 'Semi-Furnished',
            'unfurnished': 'Unfurnished',
          };
          return labels[v] || 'Unknown';
        },
        autoCalculate: (s, c) => {
          return getFurnishingAdjustment(s.furnishing, c.furnishing);
        },
      },
      {
        id: 'pool',
        label: 'Swimming Pool',
        maxAdjustment: 5,
        getSubjectValue: (s) => s.has_pool ? 'Yes' : 'No',
        getCompValue: (c) => hasAmenity(c, 'pool') ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          const subjectHas = s.has_pool;
          const compHas = hasAmenity(c, 'pool');
          if (subjectHas && !compHas) return 5;  // Subject has pool, comp doesn't
          if (!subjectHas && compHas) return -5; // Comp has pool, subject doesn't
          return 0;
        },
      },
      {
        id: 'gym',
        label: 'Gym/Fitness',
        maxAdjustment: 3,
        getSubjectValue: (s) => s.has_gym ? 'Yes' : 'No',
        getCompValue: (c) => hasAmenity(c, 'gym') ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          const subjectHas = s.has_gym;
          const compHas = hasAmenity(c, 'gym');
          if (subjectHas && !compHas) return 3;
          if (!subjectHas && compHas) return -3;
          return 0;
        },
      },
      {
        id: 'security',
        label: '24hr Security',
        maxAdjustment: 3,
        getSubjectValue: (s) => s.has_security ? 'Yes' : 'No',
        getCompValue: (c) => hasAmenity(c, 'security') ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          const subjectHas = s.has_security;
          const compHas = hasAmenity(c, 'security');
          if (subjectHas && !compHas) return 3;
          if (!subjectHas && compHas) return -3;
          return 0;
        },
      },
      {
        id: 'generator',
        label: 'Generator/Backup Power',
        maxAdjustment: 3,
        getSubjectValue: (s) => s.has_generator ? 'Yes' : 'No',
        getCompValue: (c) => hasAmenity(c, 'generator') ? 'Yes' : 'No',
        autoCalculate: (s, c) => {
          const subjectHas = s.has_generator;
          const compHas = hasAmenity(c, 'generator');
          if (subjectHas && !compHas) return 3;
          if (!subjectHas && compHas) return -3;
          return 0;
        },
      },
      {
        id: 'parking',
        label: 'Parking Spaces',
        maxAdjustment: 10,
        getSubjectValue: (s) => s.parking_spaces ?? 0,
        getCompValue: (c) => c.parking_spaces ?? 0,
        formatValue: (v) => `${v} space${v !== 1 ? 's' : ''}`,
        autoCalculate: (s, c) => {
          const subjectSpaces = s.parking_spaces ?? 0;
          const compSpaces = c.parking_spaces ?? 0;
          // 2% per parking space difference
          const diff = (subjectSpaces - compSpaces) * 2;
          return Math.max(-10, Math.min(10, diff));
        },
      },
    ],
  },
  {
    id: 'location',
    label: 'Location',
    description: 'Neighborhood and accessibility factors',
    items: [
      {
        id: 'neighborhood',
        label: 'Neighborhood',
        maxAdjustment: 20, // Same as sales
        getSubjectValue: (s) => s.neighborhood || 'Unknown',
        getCompValue: (c) => c.neighborhood || c.address_city || 'Unknown',
        autoCalculate: (s, c) => {
          const adjustment = calculateNeighborhoodAdjustment(
            s.neighborhood || '',
            c.neighborhood || c.address_city || ''
          );
          return Math.max(-20, Math.min(20, adjustment));
        },
      },
      {
        id: 'distance',
        label: 'Distance from Subject',
        getSubjectValue: () => '0 km',
        getCompValue: (c) => c.distance_km,
        formatValue: (v) => typeof v === 'number' ? `${v.toFixed(1)} km` : '—',
      },
    ],
  },
];

// =====================================================
// HELPER COMPONENTS
// =====================================================

function AdjustmentInput({
  value,
  onChange,
  disabled,
  maxAdjustment = 25,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  maxAdjustment?: number;
}) {
  const [localValue, setLocalValue] = useState(value.toString());

  const handleBlur = () => {
    const num = parseFloat(localValue) || 0;
    const clamped = Math.max(-maxAdjustment, Math.min(maxAdjustment, num));
    onChange(clamped);
    setLocalValue(clamped.toString());
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn(
          'w-14 px-1 py-0.5 bg-black border text-center font-mono text-[10px]',
          disabled ? 'border-zinc-800 text-zinc-600' : 'border-zinc-700 text-white',
          value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : ''
        )}
        step="0.1"
      />
      <span className="text-[10px] text-zinc-600">%</span>
    </div>
  );
}

function CategoryHeader({
  category,
  expanded,
  onToggle,
}: {
  category: RentalAdjustmentCategory;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800"
    >
      <div className="flex items-center gap-2">
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-zinc-500" />
        ) : (
          <ChevronDown className="w-3 h-3 text-zinc-500" />
        )}
        <span className="font-mono text-xs text-amber-400">{category.label}</span>
      </div>
      <span className="font-mono text-[9px] text-zinc-600">{category.description}</span>
    </button>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function RentalAdjustmentGrid({
  subject,
  comparables,
  onAdjustmentChange,
  onWeightChange,
  onLockToggle,
  onAutoCalculate,
  readOnly = false,
  showWeights = false,
  className,
}: RentalAdjustmentGridProps) {
  // Collapsed categories state
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
  const comparablesWithTotals = useMemo(() => {
    return comparables.map(comp => {
      // Sum all adjustments
      const totalAdjustment = Object.values(comp.adjustments || {}).reduce(
        (sum, val) => sum + (val || 0), 
        0
      );
      
      // Apply adjustment to asking rent
      const adjustedRent = comp.asking_rent_monthly * (1 + totalAdjustment / 100);
      
      // Calculate adjusted rent per sqm
      const adjustedRentPerSqm = comp.gfa_sqm && comp.gfa_sqm > 0 
        ? adjustedRent / comp.gfa_sqm 
        : null;
      
      return {
        ...comp,
        totalAdjustment,
        adjustedRent,
        adjustedRentPerSqm,
      };
    });
  }, [comparables]);

  // Calculate weighted average rent
  const weightedAverageRent = useMemo(() => {
    let totalWeight = 0;
    let weightedSum = 0;
    
    comparablesWithTotals.forEach(comp => {
      const weight = comp.weight ?? (comp.similarity_score / 100);
      totalWeight += weight;
      weightedSum += (comp.adjustedRent || 0) * weight;
    });
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }, [comparablesWithTotals]);

  // Calculate median rent
  const medianRent = useMemo(() => {
    const rents = comparablesWithTotals
      .map(c => c.adjustedRent || 0)
      .filter(r => r > 0)
      .sort((a, b) => a - b);
    
    if (rents.length === 0) return 0;
    const mid = Math.floor(rents.length / 2);
    return rents.length % 2 !== 0 
      ? rents[mid] 
      : (rents[mid - 1] + rents[mid]) / 2;
  }, [comparablesWithTotals]);

  // Auto-calculate all adjustments for a comparable
  const handleAutoCalculate = useCallback((compId: string) => {
    const comp = comparables.find(c => c.id === compId);
    if (!comp) return;
    
    RENTAL_ADJUSTMENT_CATEGORIES.forEach(category => {
      category.items.forEach(item => {
        if (item.autoCalculate) {
          const value = item.autoCalculate(subject, comp);
          onAdjustmentChange(compId, item.id, value);
        }
      });
    });
    
    onAutoCalculate?.(compId);
  }, [subject, comparables, onAdjustmentChange, onAutoCalculate]);

  // Auto-calculate all comparables
  const handleAutoCalculateAll = useCallback(() => {
    comparables.forEach(comp => {
      if (!comp.isLocked) {
        handleAutoCalculate(comp.id);
      }
    });
  }, [comparables, handleAutoCalculate]);

  if (comparables.length === 0) {
    return (
      <TerminalPanel title="RENTAL ADJUSTMENTS" className={className}>
        <div className="py-8 text-center">
          <Info className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
          <div className="font-mono text-xs text-zinc-500">
            No rental comparables selected. Add comparables from the Rental Market Panel.
          </div>
        </div>
      </TerminalPanel>
    );
  }

  return (
    <div className={cn('border border-zinc-800', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Calculator className="w-4 h-4 text-amber-500" />
          <div>
            <div className="font-mono text-sm text-white">RENTAL ADJUSTMENTS</div>
            <div className="font-mono text-[10px] text-zinc-500">
              Apply Ghana market adjustments to rental comparables
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoCalculateAll}
            disabled={readOnly}
            className="px-3 py-1.5 bg-amber-500 text-white font-mono text-[10px] hover:bg-amber-400 disabled:opacity-50 flex items-center gap-1"
          >
            <Calculator className="w-3 h-3" />
            AUTO-CALCULATE ALL
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          {/* Table Header */}
          <thead>
            <tr className="bg-zinc-900/30 border-b border-zinc-800">
              <th className="text-left p-3 font-mono text-[10px] text-zinc-500 w-48">
                ATTRIBUTE
              </th>
              <th className="text-center p-3 font-mono text-[10px] text-amber-500 border-l border-zinc-800 w-28">
                SUBJECT
              </th>
              {comparablesWithTotals.map((comp, idx) => (
                <th 
                  key={comp.id} 
                  className="text-center p-3 border-l border-zinc-800 min-w-[140px]"
                >
                  <div className="font-mono text-[10px] text-zinc-400">
                    COMP {idx + 1}
                  </div>
                  <div className="font-mono text-[9px] text-zinc-600 truncate max-w-[130px] mx-auto">
                    {comp.title || comp.address_street || 'Unknown'}
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <button
                      onClick={() => handleAutoCalculate(comp.id)}
                      disabled={readOnly || comp.isLocked}
                      title="Auto-calculate adjustments"
                      className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30"
                    >
                      <Calculator className="w-3 h-3 text-zinc-500" />
                    </button>
                    {onLockToggle && (
                      <button
                        onClick={() => onLockToggle(comp.id)}
                        disabled={readOnly}
                        title={comp.isLocked ? 'Unlock adjustments' : 'Lock adjustments'}
                        className="p-1 hover:bg-zinc-800 rounded"
                      >
                        {comp.isLocked ? (
                          <Lock className="w-3 h-3 text-amber-500" />
                        ) : (
                          <Unlock className="w-3 h-3 text-zinc-500" />
                        )}
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Categories */}
            {RENTAL_ADJUSTMENT_CATEGORIES.map(category => {
              const isCollapsed = collapsedCategories.has(category.id);
              
              return (
                <React.Fragment key={category.id}>
                  {/* Category Header Row */}
                  <tr className="bg-zinc-900/50">
                    <td 
                      colSpan={2 + comparablesWithTotals.length}
                      className="p-0"
                    >
                      <CategoryHeader
                        category={category}
                        expanded={!isCollapsed}
                        onToggle={() => toggleCategory(category.id)}
                      />
                    </td>
                  </tr>

                  {/* Category Items */}
                  {!isCollapsed && category.items.map(item => (
                    <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/20">
                      {/* Item Label */}
                      <td className="p-2 pl-6">
                        <div className="font-mono text-[10px] text-zinc-400">
                          {item.label}
                          {item.maxAdjustment && (
                            <span className="text-zinc-600 ml-1">
                              (±{item.maxAdjustment}%)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Subject Value */}
                      <td className="p-2 text-center border-l border-zinc-800">
                        <span className="font-mono text-[10px] text-amber-400">
                          {item.formatValue 
                            ? item.formatValue(item.getSubjectValue(subject))
                            : item.getSubjectValue(subject)?.toString() || '—'}
                        </span>
                      </td>

                      {/* Comparable Values + Adjustments */}
                      {comparablesWithTotals.map(comp => {
                        const compValue = item.getCompValue(comp);
                        const adjustment = comp.adjustments?.[item.id] ?? 0;
                        const hasAutoCalc = !!item.autoCalculate;
                        
                        return (
                          <td key={comp.id} className="p-2 text-center border-l border-zinc-800">
                            {/* Value */}
                            <div className="font-mono text-[10px] text-zinc-400 mb-1">
                              {item.formatValue 
                                ? item.formatValue(compValue)
                                : compValue?.toString() || '—'}
                            </div>
                            
                            {/* Adjustment Input (if applicable) */}
                            {hasAutoCalc && (
                              <AdjustmentInput
                                value={adjustment}
                                onChange={(val) => onAdjustmentChange(comp.id, item.id, val)}
                                disabled={readOnly || comp.isLocked}
                                maxAdjustment={item.maxAdjustment}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}

            {/* Totals Section */}
            <tr className="bg-zinc-900/30 border-t-2 border-zinc-700">
              <td className="p-3 font-mono text-xs text-zinc-400">
                GROSS ADJUSTMENT
              </td>
              <td className="p-3 text-center border-l border-zinc-800">—</td>
              {comparablesWithTotals.map(comp => (
                <td key={comp.id} className="p-3 text-center border-l border-zinc-800">
                  <span className={cn(
                    'font-mono text-sm font-bold',
                    (comp.totalAdjustment || 0) > 25 || (comp.totalAdjustment || 0) < -25
                      ? 'text-red-400' // Warning for excessive adjustment
                      : (comp.totalAdjustment || 0) > 0 
                        ? 'text-green-400' 
                        : (comp.totalAdjustment || 0) < 0 
                          ? 'text-red-400' 
                          : 'text-white'
                  )}>
                    {(comp.totalAdjustment || 0) > 0 ? '+' : ''}
                    {(comp.totalAdjustment || 0).toFixed(1)}%
                  </span>
                  {Math.abs(comp.totalAdjustment || 0) > 25 && (
                    <div className="flex items-center justify-center mt-1">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      <span className="font-mono text-[8px] text-red-400 ml-1">HIGH</span>
                    </div>
                  )}
                </td>
              ))}
            </tr>

            <tr className="bg-zinc-900/50">
              <td className="p-3 font-mono text-xs text-amber-400">
                ADJUSTED RENT
              </td>
              <td className="p-3 text-center border-l border-zinc-800">—</td>
              {comparablesWithTotals.map(comp => (
                <td key={comp.id} className="p-3 text-center border-l border-zinc-800">
                  <span className="font-mono text-sm text-green-400 font-bold">
                    ₵{(comp.adjustedRent || 0).toLocaleString('en-GH', { maximumFractionDigits: 0 })}
                  </span>
                  <div className="font-mono text-[9px] text-zinc-500">
                    /month
                  </div>
                </td>
              ))}
            </tr>

            <tr className="bg-zinc-900/50">
              <td className="p-3 font-mono text-xs text-zinc-400">
                ADJUSTED ₵/m²
              </td>
              <td className="p-3 text-center border-l border-zinc-800">—</td>
              {comparablesWithTotals.map(comp => (
                <td key={comp.id} className="p-3 text-center border-l border-zinc-800">
                  <span className="font-mono text-xs text-zinc-400">
                    {comp.adjustedRentPerSqm 
                      ? `₵${comp.adjustedRentPerSqm.toFixed(2)}/m²`
                      : '—'}
                  </span>
                </td>
              ))}
            </tr>

            {/* Weights (optional) */}
            {showWeights && (
              <tr className="bg-zinc-900/30">
                <td className="p-3 font-mono text-xs text-zinc-400">
                  WEIGHT
                </td>
                <td className="p-3 text-center border-l border-zinc-800">—</td>
                {comparablesWithTotals.map(comp => (
                  <td key={comp.id} className="p-3 text-center border-l border-zinc-800">
                    <input
                      type="number"
                      value={(comp.weight ?? (comp.similarity_score / 100)).toFixed(2)}
                      onChange={(e) => onWeightChange?.(comp.id, parseFloat(e.target.value) || 0)}
                      disabled={readOnly}
                      className="w-16 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs text-center"
                      step="0.05"
                      min="0"
                      max="1"
                    />
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="px-4 py-3 bg-zinc-900/50 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="font-mono text-[10px] text-zinc-500">WEIGHTED AVG RENT</div>
              <div className="font-mono text-lg text-amber-400">
                ₵{weightedAverageRent.toLocaleString('en-GH', { maximumFractionDigits: 0 })}
                <span className="text-sm text-zinc-500">/mo</span>
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500">MEDIAN RENT</div>
              <div className="font-mono text-lg text-white">
                ₵{medianRent.toLocaleString('en-GH', { maximumFractionDigits: 0 })}
                <span className="text-sm text-zinc-500">/mo</span>
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500">COMPARABLES</div>
              <div className="font-mono text-lg text-white">
                {comparablesWithTotals.length}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="font-mono text-[10px] text-green-400">
              ADJUSTMENTS COMPLETE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RentalAdjustmentGrid;
