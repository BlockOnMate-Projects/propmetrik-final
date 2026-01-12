'use client';

/**
 * Comparable Detail Card
 * 
 * Comprehensive card for displaying and editing comparable property details
 * with all RICS-compliant adjustment fields:
 * - Physical: size, age, condition, quality, bedrooms, bathrooms, floor level
 * - Location: neighborhood, view quality, accessibility
 * - Legal/Economic: tenure, financing terms, sale conditions
 * - Amenities: parking, pool, garden, security
 */

import React, { useState } from 'react';
import { 
  MapPin, 
  Calendar, 
  Ruler, 
  Building2,
  Bed,
  Bath,
  Car,
  Trees,
  Shield,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertTriangle,
  Star,
  Edit3,
  Lock,
  Unlock,
  FileText,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =====================================================
// TYPES
// =====================================================

export interface ComparableProperty {
  id: string;
  property_id?: string;
  
  // Basic Info
  address?: string;
  full_address?: string;
  city?: string;
  district?: string;
  region?: string;
  digital_address?: string;
  
  // Transaction Details
  sale_price: number;
  sale_date: string;
  transaction_type?: 'sale' | 'listing' | 'verified_sale';
  
  // Evidence Type (RICS/GhIS compliant)
  evidence_type?: 'verified_sale' | 'achieved_price' | 'asking_price' | 'listing';
  listing_adjustment?: number; // Asking-to-achieved adjustment percentage
  days_on_market?: number;
  
  // Physical Characteristics
  property_type: string;
  gfa: number;
  plot_size?: number;
  year_built?: number;
  age?: number;
  bedrooms?: number;
  bathrooms?: number;
  
  // RICS Extended Fields
  quality_rating?: 'luxury' | 'high' | 'standard' | 'basic' | 'substandard';
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  floor_number?: number;
  total_floors?: number;
  view_quality?: 'panoramic' | 'ocean' | 'city' | 'garden' | 'standard' | 'limited' | 'obstructed';
  parking_spaces?: number;
  
  // Amenities
  has_pool?: boolean;
  has_garden?: boolean;
  has_security?: boolean;
  has_elevator?: boolean;
  
  // Legal/Economic
  tenure_type?: 'freehold' | 'leasehold' | 'stool_land' | 'state_land';
  lease_years_remaining?: number;
  financing_terms?: 'cash' | 'conventional' | 'owner_financing' | 'below_market';
  sale_conditions?: 'arms_length' | 'related_party' | 'distress' | 'auction';
  
  // Location Quality
  neighborhood_rating?: 'prime_plus' | 'prime' | 'prime_minus' | 'secondary' | 'tertiary';
  accessibility_rating?: 'excellent' | 'good' | 'fair' | 'poor';
  
  // Calculated Fields
  distance_km?: number;
  similarity_score?: number;
  quality_score?: number;
  price_per_sqm?: number;
}

export interface ComparableAdjustments {
  // Physical Adjustments
  size: number;
  age: number;
  condition: number;
  quality: number;
  bedrooms: number;
  bathrooms: number;
  floor_level: number;
  
  // Location Adjustments
  location: number;
  view: number;
  accessibility: number;
  neighborhood: number;
  
  // Time/Market Adjustments
  time: number;
  market_conditions: number;
  
  // Legal/Economic Adjustments
  tenure: number;
  financing: number;
  sale_conditions: number;
  
  // Amenity Adjustments
  parking: number;
  pool: number;
  garden: number;
  security: number;
}

interface ComparableDetailCardProps {
  comparable: ComparableProperty;
  adjustments?: Partial<ComparableAdjustments>;
  subjectProperty?: Partial<ComparableProperty>;
  isSelected?: boolean;
  isExpanded?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  onAdjustmentChange?: (category: keyof ComparableAdjustments, value: number) => void;
  onExpand?: (expanded: boolean) => void;
  readOnly?: boolean;
  showMap?: boolean;
  className?: string;
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function QualityBadge({ rating }: { rating?: string }) {
  const ratings: Record<string, { label: string; color: string; stars: number }> = {
    luxury: { label: 'Luxury', color: 'text-purple-400 bg-purple-500/20', stars: 5 },
    high: { label: 'High', color: 'text-blue-400 bg-blue-500/20', stars: 4 },
    standard: { label: 'Standard', color: 'text-green-400 bg-green-500/20', stars: 3 },
    basic: { label: 'Basic', color: 'text-yellow-400 bg-yellow-500/20', stars: 2 },
    substandard: { label: 'Below', color: 'text-red-400 bg-red-500/20', stars: 1 },
  };
  
  const r = ratings[rating || 'standard'] || ratings.standard;
  
  return (
    <span className={cn('px-1.5 py-0.5 text-[9px] font-mono uppercase rounded', r.color)}>
      {r.label}
    </span>
  );
}

function ConditionBadge({ condition }: { condition?: string }) {
  const conditions: Record<string, { label: string; color: string }> = {
    excellent: { label: 'Excellent', color: 'text-green-400' },
    good: { label: 'Good', color: 'text-blue-400' },
    fair: { label: 'Fair', color: 'text-yellow-400' },
    poor: { label: 'Poor', color: 'text-red-400' },
  };
  
  const c = conditions[condition || 'good'] || conditions.good;
  
  return (
    <span className={cn('font-mono text-xs', c.color)}>{c.label}</span>
  );
}

function TenureBadge({ tenure }: { tenure?: string }) {
  const tenures: Record<string, { label: string; color: string }> = {
    freehold: { label: 'Freehold', color: 'text-green-400' },
    leasehold: { label: 'Leasehold', color: 'text-blue-400' },
    stool_land: { label: 'Stool Land', color: 'text-amber-400' },
    state_land: { label: 'State Land', color: 'text-purple-400' },
  };
  
  const t = tenures[tenure || 'freehold'] || tenures.freehold;
  
  return (
    <span className={cn('font-mono text-xs', t.color)}>{t.label}</span>
  );
}

function ViewQualityBadge({ view }: { view?: string }) {
  const views: Record<string, { label: string; icon: React.ReactNode }> = {
    panoramic: { label: 'Panoramic', icon: <Star className="w-3 h-3 text-amber-400" /> },
    ocean: { label: 'Ocean View', icon: <Eye className="w-3 h-3 text-blue-400" /> },
    city: { label: 'City View', icon: <Building2 className="w-3 h-3 text-purple-400" /> },
    garden: { label: 'Garden', icon: <Trees className="w-3 h-3 text-green-400" /> },
    standard: { label: 'Standard', icon: <Eye className="w-3 h-3 text-zinc-400" /> },
    limited: { label: 'Limited', icon: <Eye className="w-3 h-3 text-yellow-400" /> },
    obstructed: { label: 'Obstructed', icon: <AlertTriangle className="w-3 h-3 text-red-400" /> },
  };
  
  const v = views[view || 'standard'] || views.standard;
  
  return (
    <span className="flex items-center gap-1 font-mono text-xs text-zinc-400">
      {v.icon}
      {v.label}
    </span>
  );
}

function AdjustmentInput({ 
  value, 
  onChange, 
  min = -30, 
  max = 30,
  label,
  readOnly = false,
}: { 
  value: number; 
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  readOnly?: boolean;
}) {
  const displayValue = value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-zinc-400';
  
  if (readOnly) {
    return (
      <span className={cn('font-mono text-xs font-bold', color)}>
        {displayValue}%
      </span>
    );
  }
  
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={0.5}
        className={cn(
          'w-14 px-1 py-0.5 bg-black border border-zinc-700 font-mono text-[10px] text-center',
          color
        )}
      />
      <span className="font-mono text-[10px] text-zinc-500">%</span>
    </div>
  );
}

function StatRow({ 
  icon, 
  label, 
  value, 
  subjectValue,
  adjustment,
  onAdjustmentChange,
  readOnly,
}: { 
  icon: React.ReactNode;
  label: string;
  value: string | number | React.ReactNode;
  subjectValue?: string | number;
  adjustment?: number;
  onAdjustmentChange?: (value: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-zinc-800/50 last:border-0">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-zinc-500">{icon}</span>
        <span className="font-mono text-[10px] text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {subjectValue !== undefined && (
          <span className="font-mono text-[10px] text-zinc-500 w-16 text-right">
            Subj: {subjectValue}
          </span>
        )}
        <span className="font-mono text-xs text-white w-20 text-right">{value}</span>
        {adjustment !== undefined && onAdjustmentChange && (
          <div className="w-20">
            <AdjustmentInput 
              value={adjustment} 
              onChange={onAdjustmentChange}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function ComparableDetailCard({
  comparable,
  adjustments = {},
  subjectProperty,
  isSelected = false,
  isExpanded = false,
  onSelect,
  onRemove,
  onAdjustmentChange,
  onExpand,
  readOnly = false,
  showMap = false,
  className,
}: ComparableDetailCardProps) {
  const [expanded, setExpanded] = useState(isExpanded);
  
  // Calculate totals
  const allAdjustments = adjustments as ComparableAdjustments;
  const totalAdjustment = Object.values(allAdjustments).reduce((sum, val) => sum + (val || 0), 0);
  const pricePerSqm = comparable.gfa ? comparable.sale_price / comparable.gfa : 0;
  const adjustedPrice = comparable.sale_price * (1 + totalAdjustment / 100);
  const adjustedPricePerSqm = comparable.gfa ? adjustedPrice / comparable.gfa : 0;
  
  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onExpand?.(newExpanded);
  };
  
  // Calculate age if not provided
  const age = comparable.age ?? (comparable.year_built 
    ? new Date().getFullYear() - comparable.year_built 
    : undefined);
  
  return (
    <div 
      className={cn(
        'border bg-zinc-900/50 transition-all',
        isSelected ? 'border-amber-500' : 'border-zinc-800',
        className
      )}
    >
      {/* Header */}
      <div 
        className={cn(
          'flex items-center justify-between px-3 py-2 cursor-pointer',
          isSelected ? 'bg-amber-500/10' : 'bg-zinc-800/30'
        )}
        onClick={onSelect}
      >
        <div className="flex items-center gap-3 flex-1">
          {onSelect && (
            <div 
              className={cn(
                'w-4 h-4 border rounded-sm flex items-center justify-center',
                isSelected ? 'border-amber-500 bg-amber-500' : 'border-zinc-600'
              )}
            >
              {isSelected && <Check className="w-3 h-3 text-black" />}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3 text-zinc-500 flex-shrink-0" />
              <span className="font-mono text-xs text-white truncate">
                {comparable.full_address || comparable.address || 'Unknown Address'}
              </span>
              <QualityBadge rating={comparable.quality_rating} />
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-[10px] text-zinc-500">
                {comparable.property_type} • {comparable.gfa} sqm
              </span>
              {comparable.distance_km !== undefined && (
                <span className="font-mono text-[10px] text-zinc-500">
                  {comparable.distance_km.toFixed(1)} km
                </span>
              )}
              {comparable.similarity_score !== undefined && (
                <span className="font-mono text-[10px] text-green-400">
                  {Math.round(comparable.similarity_score * 100)}% match
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Price Info */}
          <div className="text-right">
            <div className="font-mono text-sm text-white">
              ₵{comparable.sale_price.toLocaleString()}
            </div>
            <div className="font-mono text-[10px] text-zinc-500">
              ₵{Math.round(pricePerSqm).toLocaleString()}/sqm
            </div>
          </div>
          
          {/* Adjustment Summary */}
          <div className="text-right">
            <div className={cn(
              'font-mono text-sm font-bold',
              totalAdjustment > 0 ? 'text-green-400' : 
              totalAdjustment < 0 ? 'text-red-400' : 'text-zinc-400'
            )}>
              {totalAdjustment > 0 ? '+' : ''}{totalAdjustment.toFixed(1)}%
            </div>
            <div className="font-mono text-[10px] text-amber-400">
              ₵{Math.round(adjustedPrice).toLocaleString()}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleExpand}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1 hover:bg-red-900/50 rounded transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400 hover:text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="p-3 border-t border-zinc-800">
          <div className="grid grid-cols-3 gap-4">
            {/* Physical Characteristics */}
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-amber-500 uppercase tracking-wider mb-2">
                Physical Characteristics
              </div>
              
              <StatRow
                icon={<Ruler className="w-3 h-3" />}
                label="GFA (sqm)"
                value={comparable.gfa}
                subjectValue={subjectProperty?.gfa}
                adjustment={adjustments.size}
                onAdjustmentChange={(v) => onAdjustmentChange?.('size', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Calendar className="w-3 h-3" />}
                label="Age (years)"
                value={age ?? '—'}
                subjectValue={subjectProperty?.age}
                adjustment={adjustments.age}
                onAdjustmentChange={(v) => onAdjustmentChange?.('age', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Building2 className="w-3 h-3" />}
                label="Condition"
                value={<ConditionBadge condition={comparable.condition} />}
                adjustment={adjustments.condition}
                onAdjustmentChange={(v) => onAdjustmentChange?.('condition', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Star className="w-3 h-3" />}
                label="Quality"
                value={<QualityBadge rating={comparable.quality_rating} />}
                adjustment={adjustments.quality}
                onAdjustmentChange={(v) => onAdjustmentChange?.('quality', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Bed className="w-3 h-3" />}
                label="Bedrooms"
                value={comparable.bedrooms ?? '—'}
                subjectValue={subjectProperty?.bedrooms}
                adjustment={adjustments.bedrooms}
                onAdjustmentChange={(v) => onAdjustmentChange?.('bedrooms', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Bath className="w-3 h-3" />}
                label="Bathrooms"
                value={comparable.bathrooms ?? '—'}
                subjectValue={subjectProperty?.bathrooms}
                adjustment={adjustments.bathrooms}
                onAdjustmentChange={(v) => onAdjustmentChange?.('bathrooms', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Layers className="w-3 h-3" />}
                label="Floor Level"
                value={comparable.floor_number ? `Floor ${comparable.floor_number}${comparable.total_floors ? ` of ${comparable.total_floors}` : ''}` : '—'}
                adjustment={adjustments.floor_level}
                onAdjustmentChange={(v) => onAdjustmentChange?.('floor_level', v)}
                readOnly={readOnly}
              />
            </div>
            
            {/* Location & View */}
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-amber-500 uppercase tracking-wider mb-2">
                Location & View
              </div>
              
              <StatRow
                icon={<MapPin className="w-3 h-3" />}
                label="Neighborhood"
                value={comparable.neighborhood_rating?.replace('_', ' ') || 'Standard'}
                adjustment={adjustments.neighborhood}
                onAdjustmentChange={(v) => onAdjustmentChange?.('neighborhood', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Eye className="w-3 h-3" />}
                label="View Quality"
                value={<ViewQualityBadge view={comparable.view_quality} />}
                adjustment={adjustments.view}
                onAdjustmentChange={(v) => onAdjustmentChange?.('view', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Building2 className="w-3 h-3" />}
                label="Accessibility"
                value={comparable.accessibility_rating || 'Good'}
                adjustment={adjustments.accessibility}
                onAdjustmentChange={(v) => onAdjustmentChange?.('accessibility', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<MapPin className="w-3 h-3" />}
                label="Location Adj."
                value="—"
                adjustment={adjustments.location}
                onAdjustmentChange={(v) => onAdjustmentChange?.('location', v)}
                readOnly={readOnly}
              />
              
              <div className="font-mono text-[10px] text-amber-500 uppercase tracking-wider mb-2 mt-4">
                Amenities
              </div>
              
              <StatRow
                icon={<Car className="w-3 h-3" />}
                label="Parking Spaces"
                value={comparable.parking_spaces ?? '—'}
                subjectValue={subjectProperty?.parking_spaces}
                adjustment={adjustments.parking}
                onAdjustmentChange={(v) => onAdjustmentChange?.('parking', v)}
                readOnly={readOnly}
              />
              
              <div className="flex items-center gap-3 py-1">
                <span className={cn(
                  'font-mono text-[10px] px-1.5 py-0.5 rounded',
                  comparable.has_pool ? 'text-blue-400 bg-blue-500/20' : 'text-zinc-600 bg-zinc-800'
                )}>
                  Pool
                </span>
                <span className={cn(
                  'font-mono text-[10px] px-1.5 py-0.5 rounded',
                  comparable.has_garden ? 'text-green-400 bg-green-500/20' : 'text-zinc-600 bg-zinc-800'
                )}>
                  Garden
                </span>
                <span className={cn(
                  'font-mono text-[10px] px-1.5 py-0.5 rounded',
                  comparable.has_security ? 'text-amber-400 bg-amber-500/20' : 'text-zinc-600 bg-zinc-800'
                )}>
                  Security
                </span>
              </div>
            </div>
            
            {/* Legal/Economic & Time */}
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-amber-500 uppercase tracking-wider mb-2">
                Legal / Economic
              </div>
              
              <StatRow
                icon={<FileText className="w-3 h-3" />}
                label="Tenure"
                value={<TenureBadge tenure={comparable.tenure_type} />}
                adjustment={adjustments.tenure}
                onAdjustmentChange={(v) => onAdjustmentChange?.('tenure', v)}
                readOnly={readOnly}
              />
              
              {comparable.tenure_type === 'leasehold' && comparable.lease_years_remaining && (
                <div className="flex items-center justify-between py-1">
                  <span className="font-mono text-[10px] text-zinc-400 pl-5">
                    Lease Remaining
                  </span>
                  <span className="font-mono text-xs text-white">
                    {comparable.lease_years_remaining} years
                  </span>
                </div>
              )}
              
              <StatRow
                icon={<DollarSign className="w-3 h-3" />}
                label="Financing"
                value={comparable.financing_terms?.replace('_', ' ') || 'Cash'}
                adjustment={adjustments.financing}
                onAdjustmentChange={(v) => onAdjustmentChange?.('financing', v)}
                readOnly={readOnly}
              />
              
              <StatRow
                icon={<Shield className="w-3 h-3" />}
                label="Sale Conditions"
                value={comparable.sale_conditions?.replace('_', ' ') || "Arm's Length"}
                adjustment={adjustments.sale_conditions}
                onAdjustmentChange={(v) => onAdjustmentChange?.('sale_conditions', v)}
                readOnly={readOnly}
              />
              
              <div className="font-mono text-[10px] text-amber-500 uppercase tracking-wider mb-2 mt-4">
                Time Adjustment
              </div>
              
              <StatRow
                icon={<Calendar className="w-3 h-3" />}
                label="Listing Date"
                value={new Date(comparable.sale_date).toLocaleDateString('en-GB', { 
                  day: '2-digit', 
                  month: 'short', 
                  year: 'numeric' 
                })}
                adjustment={adjustments.time}
                onAdjustmentChange={(v) => onAdjustmentChange?.('time', v)}
                readOnly={readOnly}
              />
              
              {/* Transaction Type */}
              <div className="mt-3 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-400">Transaction</span>
                  <span className={cn(
                    'font-mono text-[10px] px-1.5 py-0.5 rounded',
                    comparable.transaction_type === 'verified_sale' 
                      ? 'text-green-400 bg-green-500/20' 
                      : comparable.transaction_type === 'listing'
                        ? 'text-yellow-400 bg-yellow-500/20'
                        : 'text-blue-400 bg-blue-500/20'
                  )}>
                    {comparable.transaction_type === 'verified_sale' 
                      ? 'Verified Sale' 
                      : comparable.transaction_type === 'listing'
                        ? 'Listing'
                        : 'Sale'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Adjustment Summary Footer */}
          <div className="mt-4 pt-3 border-t border-zinc-800">
            <div className="grid grid-cols-5 gap-4 text-center">
              <div>
                <div className="font-mono text-[10px] text-zinc-500">Original Price</div>
                <div className="font-mono text-sm text-white">
                  ₵{comparable.sale_price.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500">Original ₵/sqm</div>
                <div className="font-mono text-sm text-white">
                  ₵{Math.round(pricePerSqm).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500">Total Adjustment</div>
                <div className={cn(
                  'font-mono text-sm font-bold',
                  totalAdjustment > 0 ? 'text-green-400' : 
                  totalAdjustment < 0 ? 'text-red-400' : 'text-zinc-400'
                )}>
                  {totalAdjustment > 0 ? '+' : ''}{totalAdjustment.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500">Adjusted Price</div>
                <div className="font-mono text-sm text-amber-400 font-bold">
                  ₵{Math.round(adjustedPrice).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500">Adjusted ₵/sqm</div>
                <div className="font-mono text-sm text-amber-400 font-bold">
                  ₵{Math.round(adjustedPricePerSqm).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Import DollarSign icon at top
import { DollarSign as DollarSignIcon } from 'lucide-react';

export default ComparableDetailCard;
