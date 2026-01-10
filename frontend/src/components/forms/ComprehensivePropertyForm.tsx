'use client'

/**
 * Comprehensive Property Form Component
 * 
 * Reusable form component for collecting detailed property information
 * following RICS Red Book standards and PropMetrik requirements.
 * 
 * Features:
 * - Physical characteristics (size, rooms, age)
 * - Quality and condition ratings
 * - Amenities checklist
 * - Location quality assessments
 * - Legal/tenure information
 * - Flexible layout for different contexts
 */

import { useState, useEffect } from 'react'
import { 
  Building2, 
  MapPin, 
  Calendar, 
  Ruler, 
  Star, 
  Shield,
  Trees,
  Car,
  Zap,
  Droplets,
  Eye,
  Scale,
  Home,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PROPERTY_TYPES,
  QUALITY_RATINGS,
  CONDITIONS,
  TENURE_TYPES,
  VIEW_QUALITIES,
  NEIGHBORHOOD_RATINGS,
  ACCESSIBILITY_RATINGS,
  CONTACT_PREFERENCES,
  DEFAULT_PROPERTY_DATA,
  VALIDATION_RULES,
  type ComprehensivePropertyData,
} from '@/types/comprehensiveProperty'

interface ComprehensivePropertyFormProps {
  data: Partial<ComprehensivePropertyData>
  onChange: (data: Partial<ComprehensivePropertyData>) => void
  mode?: 'subject' | 'comparable' | 'contribution'
  showTransactionFields?: boolean
  showLocationFields?: boolean
  className?: string
  errors?: Record<string, string>
}

const REGIONS = [
  { value: 'greater_accra', label: 'Greater Accra' },
  { value: 'ashanti', label: 'Ashanti' },
  { value: 'western', label: 'Western' },
  { value: 'eastern', label: 'Eastern' },
  { value: 'central', label: 'Central' },
  { value: 'volta', label: 'Volta' },
  { value: 'northern', label: 'Northern' },
  { value: 'upper_east', label: 'Upper East' },
  { value: 'upper_west', label: 'Upper West' },
  { value: 'brong_ahafo', label: 'Brong Ahafo' },
]

export default function ComprehensivePropertyForm({
  data,
  onChange,
  mode = 'subject',
  showTransactionFields = false,
  showLocationFields = true,
  className = '',
  errors = {},
}: ComprehensivePropertyFormProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null)

  // Initialize with defaults
  useEffect(() => {
    if (Object.keys(data).length === 0) {
      onChange({ ...DEFAULT_PROPERTY_DATA })
    }
  }, [data, onChange])

  const updateField = (field: keyof ComprehensivePropertyData, value: any) => {
    onChange({ ...data, [field]: value })
  }

  const updateBooleanField = (field: keyof ComprehensivePropertyData, value: boolean) => {
    onChange({ ...data, [field]: value })
  }

  const isRequired = (field: string) => VALIDATION_RULES.required.includes(field)
  const hasError = (field: string) => !!errors[field]
  const getError = (field: string) => errors[field]

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
        <Building2 className="w-5 h-5 text-amber-500" />
        <div>
          <h3 className="font-mono text-lg text-white">
            {mode === 'subject' ? 'SUBJECT PROPERTY' : 
             mode === 'comparable' ? 'COMPARABLE PROPERTY' : 
             'PROPERTY DETAILS'}
          </h3>
          <p className="font-mono text-[10px] text-zinc-500">
            Complete property information for accurate valuation
          </p>
        </div>
      </div>

      {/* Basic Information */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-sm text-zinc-300">BASIC INFORMATION</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
              ADDRESS {isRequired('address') && '*'}
            </label>
            <input
              type="text"
              value={data.address || ''}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Enter property address"
              className={cn(
                'w-full px-3 py-2 bg-zinc-900 border text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50',
                hasError('address') ? 'border-red-500/50' : 'border-zinc-800'
              )}
            />
            {hasError('address') && (
              <p className="font-mono text-[9px] text-red-400 mt-1">{getError('address')}</p>
            )}
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
              DIGITAL ADDRESS (GHANA POST GPS)
            </label>
            <input
              type="text"
              value={data.digital_address || ''}
              onChange={(e) => updateField('digital_address', e.target.value.toUpperCase())}
              placeholder="e.g., GA-123-4567"
              className="w-full px-3 py-2 bg-zinc-900 border border-amber-500/30 text-amber-400 font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
            <p className="font-mono text-[9px] text-zinc-600 mt-1">For precise geocoding & verification</p>
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
              CITY {isRequired('city') && '*'}
            </label>
            <input
              type="text"
              value={data.city || ''}
              onChange={(e) => updateField('city', e.target.value)}
              placeholder="Enter city"
              className={cn(
                'w-full px-3 py-2 bg-zinc-900 border text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50',
                hasError('city') ? 'border-red-500/50' : 'border-zinc-800'
              )}
            />
            {hasError('city') && (
              <p className="font-mono text-[9px] text-red-400 mt-1">{getError('city')}</p>
            )}
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
              REGION {isRequired('region') && '*'}
            </label>
            <select
              value={data.region || 'greater_accra'}
              onChange={(e) => updateField('region', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
            >
              {REGIONS.map((region) => (
                <option key={region.value} value={region.value}>{region.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
              PROPERTY TYPE {isRequired('property_type') && '*'}
            </label>
            <select
              value={data.property_type || 'house'}
              onChange={(e) => updateField('property_type', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Physical Characteristics */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Ruler className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-sm text-zinc-300">PHYSICAL CHARACTERISTICS</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">GROSS FLOOR AREA (SQM)</label>
            <input
              type="number"
              value={data.gfa || ''}
              onChange={(e) => updateField('gfa', parseFloat(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">PLOT SIZE (SQM)</label>
            <input
              type="number"
              value={data.plot_size || ''}
              onChange={(e) => updateField('plot_size', parseFloat(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">LAND AREA (SQM)</label>
            <input
              type="number"
              value={data.land_area || ''}
              onChange={(e) => updateField('land_area', parseFloat(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">BEDROOMS</label>
            <input
              type="number"
              value={data.bedrooms || ''}
              onChange={(e) => updateField('bedrooms', parseInt(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">BATHROOMS</label>
            <input
              type="number"
              value={data.bathrooms || ''}
              onChange={(e) => updateField('bathrooms', parseInt(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">TOTAL FLOORS</label>
            <input
              type="number"
              value={data.total_floors || ''}
              onChange={(e) => updateField('total_floors', parseInt(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">YEAR BUILT</label>
            <input
              type="number"
              value={data.year_built || ''}
              onChange={(e) => updateField('year_built', parseInt(e.target.value) || undefined)}
              placeholder="e.g. 2020"
              min={VALIDATION_RULES.minYear}
              max={VALIDATION_RULES.maxYear}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">PARKING SPACES</label>
            <input
              type="number"
              value={data.parking_spaces || ''}
              onChange={(e) => updateField('parking_spaces', parseInt(e.target.value) || undefined)}
              placeholder="0"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Floor Number for Apartments */}
          {(data.property_type === 'apartment' || data.property_type === 'condo') && (
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">FLOOR NUMBER</label>
              <input
                type="number"
                value={data.floor_number || ''}
                onChange={(e) => updateField('floor_number', parseInt(e.target.value) || undefined)}
                placeholder="0"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Quality & Condition */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-sm text-zinc-300">QUALITY & CONDITION</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">QUALITY RATING</label>
            <select
              value={data.quality_rating || 'standard'}
              onChange={(e) => updateField('quality_rating', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
            >
              {QUALITY_RATINGS.map((rating) => (
                <option key={rating.value} value={rating.value}>{rating.label}</option>
              ))}
            </select>
            <p className="font-mono text-[9px] text-zinc-600 mt-1">
              {QUALITY_RATINGS.find(r => r.value === data.quality_rating)?.description}
            </p>
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">CONDITION</label>
            <select
              value={data.condition || 'good'}
              onChange={(e) => updateField('condition', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
            >
              {CONDITIONS.map((condition) => (
                <option key={condition.value} value={condition.value}>{condition.label}</option>
              ))}
            </select>
            <p className="font-mono text-[9px] text-zinc-600 mt-1">
              {CONDITIONS.find(c => c.value === data.condition)?.description}
            </p>
          </div>
        </div>
      </div>

      {/* Amenities */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Home className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-sm text-zinc-300">AMENITIES</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'has_pool', label: 'Pool', icon: Droplets },
            { key: 'has_garden', label: 'Garden', icon: Trees },
            { key: 'has_security', label: 'Security', icon: Shield },
            { key: 'has_elevator', label: 'Elevator', icon: Building2 },
            { key: 'has_balcony', label: 'Balcony', icon: Home },
            { key: 'has_terrace', label: 'Terrace', icon: Home },
            { key: 'has_gym', label: 'Gym', icon: Home },
            { key: 'has_generator', label: 'Generator', icon: Zap },
            { key: 'has_solar', label: 'Solar Power', icon: Zap },
            { key: 'has_borehole', label: 'Borehole', icon: Droplets },
            { key: 'has_parking', label: 'Parking', icon: Car },
          ].map((amenity) => {
            const IconComponent = amenity.icon
            return (
              <label key={amenity.key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={data[amenity.key as keyof ComprehensivePropertyData] as boolean || false}
                  onChange={(e) => updateBooleanField(amenity.key as keyof ComprehensivePropertyData, e.target.checked)}
                  className="sr-only"
                />
                <div className={cn(
                  'flex items-center justify-center w-8 h-8 border-2 rounded transition-colors',
                  data[amenity.key as keyof ComprehensivePropertyData]
                    ? 'bg-amber-500 border-amber-500 text-black'
                    : 'border-zinc-600 text-zinc-600 group-hover:border-amber-500/50'
                )}>
                  <IconComponent className="w-4 h-4" />
                </div>
                <span className="font-mono text-sm text-zinc-300">{amenity.label}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Location Quality */}
      {showLocationFields && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-amber-500" />
            <span className="font-mono text-sm text-zinc-300">LOCATION QUALITY</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">VIEW QUALITY</label>
              <select
                value={data.view_quality || 'standard'}
                onChange={(e) => updateField('view_quality', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                {VIEW_QUALITIES.map((view) => (
                  <option key={view.value} value={view.value}>{view.label}</option>
                ))}
              </select>
              <p className="font-mono text-[9px] text-zinc-600 mt-1">
                {VIEW_QUALITIES.find(v => v.value === data.view_quality)?.description}
              </p>
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">NEIGHBORHOOD RATING</label>
              <select
                value={data.neighborhood_rating || 'secondary'}
                onChange={(e) => updateField('neighborhood_rating', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                {NEIGHBORHOOD_RATINGS.map((rating) => (
                  <option key={rating.value} value={rating.value}>{rating.label}</option>
                ))}
              </select>
              <p className="font-mono text-[9px] text-zinc-600 mt-1">
                {NEIGHBORHOOD_RATINGS.find(n => n.value === data.neighborhood_rating)?.description}
              </p>
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">ACCESSIBILITY</label>
              <select
                value={data.accessibility_rating || 'good'}
                onChange={(e) => updateField('accessibility_rating', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                {ACCESSIBILITY_RATINGS.map((access) => (
                  <option key={access.value} value={access.value}>{access.label}</option>
                ))}
              </select>
              <p className="font-mono text-[9px] text-zinc-600 mt-1">
                {ACCESSIBILITY_RATINGS.find(a => a.value === data.accessibility_rating)?.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Legal & Tenure */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-sm text-zinc-300">LEGAL & TENURE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">TENURE TYPE</label>
            <select
              value={data.tenure_type || 'freehold'}
              onChange={(e) => updateField('tenure_type', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
            >
              {TENURE_TYPES.map((tenure) => (
                <option key={tenure.value} value={tenure.value}>{tenure.label}</option>
              ))}
            </select>
            <p className="font-mono text-[9px] text-zinc-600 mt-1">
              {TENURE_TYPES.find(t => t.value === data.tenure_type)?.description}
            </p>
          </div>

          {data.tenure_type === 'leasehold' && (
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">LEASE YEARS REMAINING</label>
              <input
                type="number"
                value={data.lease_years_remaining || ''}
                onChange={(e) => updateField('lease_years_remaining', parseInt(e.target.value) || undefined)}
                placeholder="99"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Owner Information */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Home className="w-4 h-4 text-emerald-500" />
          <span className="font-mono text-sm text-zinc-300">PROPERTY OWNER INFORMATION</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">OWNER NAME</label>
            <input
              type="text"
              value={data.owner_name || ''}
              onChange={(e) => updateField('owner_name', e.target.value)}
              placeholder="Full Name"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">EMAIL ADDRESS</label>
            <input
              type="email"
              value={data.owner_email || ''}
              onChange={(e) => updateField('owner_email', e.target.value)}
              placeholder="owner@example.com"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">PHONE NUMBER</label>
            <input
              type="tel"
              value={data.owner_phone || ''}
              onChange={(e) => updateField('owner_phone', e.target.value)}
              placeholder="+233 XX XXX XXXX"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">CONTACT PREFERENCE</label>
            <select
              value={data.owner_contact_preference || 'email'}
              onChange={(e) => updateField('owner_contact_preference', e.target.value as 'email' | 'phone' | 'mail' | 'any')}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
            >
              {CONTACT_PREFERENCES.map((pref) => (
                <option key={pref.value} value={pref.value}>{pref.label}</option>
              ))}
            </select>
            <p className="font-mono text-[9px] text-zinc-600 mt-1">
              {CONTACT_PREFERENCES.find(p => p.value === data.owner_contact_preference)?.description}
            </p>
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] text-zinc-500 mb-1 block">OWNER MAILING ADDRESS</label>
          <textarea
            value={data.owner_address || ''}
            onChange={(e) => updateField('owner_address', e.target.value)}
            placeholder="Mailing/Contact address (if different from property address)..."
            rows={2}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
          />
          <p className="font-mono text-[9px] text-zinc-600 mt-1">
            Optional: Leave blank if same as property address
          </p>
        </div>
      </div>

      {/* Transaction Fields (for comparables) */}
      {showTransactionFields && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-amber-500" />
            <span className="font-mono text-sm text-zinc-300">TRANSACTION DETAILS</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">SALE PRICE (GHS)</label>
              <input
                type="number"
                value={data.sale_price || ''}
                onChange={(e) => updateField('sale_price', parseFloat(e.target.value) || undefined)}
                placeholder="0"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">SALE DATE</label>
              <input
                type="date"
                value={data.sale_date || ''}
                onChange={(e) => updateField('sale_date', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">TRANSACTION TYPE</label>
              <select
                value={data.transaction_type || 'sale'}
                onChange={(e) => updateField('transaction_type', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="verified_sale">Verified Sale</option>
                <option value="sale">Sale</option>
                <option value="asking_price">Asking Price</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}