'use client'

/**
 * Comprehensive Property Form Component
 * 
 * Reusable form component for collecting detailed property information
 * following RICS Red Book standards and PROPMETRIK requirements.
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
  Info,
  FileText
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
  validateValuationDates,
  type ComprehensivePropertyData,
} from '@/types/comprehensiveProperty'

interface ComprehensivePropertyFormProps {
  data: Partial<ComprehensivePropertyData>
  onChange: (data: Partial<ComprehensivePropertyData>) => void
  mode?: 'subject' | 'comparable' | 'contribution'
  showTransactionFields?: boolean
  showLocationFields?: boolean
  showValuationDates?: boolean  // Show RICS/GhIS valuation date fields
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
  showValuationDates = true,  // Default to showing for subject property valuations
  className = '',
  errors = {},
}: ComprehensivePropertyFormProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [dateErrors, setDateErrors] = useState<Record<string, string>>({})

  // Initialize with defaults
  useEffect(() => {
    if (Object.keys(data).length === 0) {
      onChange({ ...DEFAULT_PROPERTY_DATA })
    }
  }, [data, onChange])

  // Validate valuation dates on change (RICS VPS 3 compliance)
  useEffect(() => {
    if (showValuationDates && (data.inspection_date || data.valuation_date)) {
      const validation = validateValuationDates(data)
      setDateErrors(validation.errors)
    }
  }, [data.inspection_date, data.valuation_date, data.instruction_date, data.is_retrospective, showValuationDates])

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

      {/* Valuation Dates Section - RICS Red Book VPS 3 Compliant */}
      {showValuationDates && mode === 'subject' && (
        <div className="space-y-4 border border-amber-500/20 rounded-lg p-4 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span className="font-mono text-sm text-zinc-300">VALUATION DATES</span>
            <span className="font-mono text-[9px] text-amber-500/70 ml-auto">RICS VPS 3 / GhIS Compliant</span>
          </div>
          <p className="font-mono text-[10px] text-zinc-500 -mt-2 mb-3">
            These dates determine exchange rates and market conditions for the valuation per RICS Red Book standards
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                DATE OF INSPECTION *
              </label>
              <input
                type="date"
                value={data.inspection_date || ''}
                onChange={(e) => updateField('inspection_date', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className={cn(
                  'w-full px-3 py-2 bg-zinc-900 border text-white font-mono text-sm focus:outline-none focus:border-amber-500/50',
                  (dateErrors.inspection_date || errors.inspection_date) ? 'border-red-500/50' : 'border-zinc-800'
                )}
              />
              {(dateErrors.inspection_date || errors.inspection_date) && (
                <p className="font-mono text-[9px] text-red-400 mt-1">
                  {dateErrors.inspection_date || errors.inspection_date}
                </p>
              )}
              <p className="font-mono text-[9px] text-zinc-600 mt-1">
                Physical inspection date
              </p>
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                DATE OF VALUATION (EFFECTIVE) *
              </label>
              <input
                type="date"
                value={data.valuation_date || ''}
                onChange={(e) => {
                  const val = e.target.value
                  updateField('valuation_date', val)
                  // Auto-detect retrospective valuation
                  if (val && data.instruction_date) {
                    const isRetro = new Date(val) < new Date(data.instruction_date)
                    if (isRetro !== data.is_retrospective) {
                      updateField('is_retrospective', isRetro)
                    }
                  }
                }}
                className={cn(
                  'w-full px-3 py-2 bg-zinc-900 border text-white font-mono text-sm focus:outline-none focus:border-amber-500/50',
                  (dateErrors.valuation_date || errors.valuation_date) ? 'border-red-500/50' : 'border-zinc-800'
                )}
              />
              {(dateErrors.valuation_date || errors.valuation_date) && (
                <p className="font-mono text-[9px] text-red-400 mt-1">
                  {dateErrors.valuation_date || errors.valuation_date}
                </p>
              )}
              <p className="font-mono text-[9px] text-zinc-600 mt-1">
                FX rates fetched as of this date
              </p>
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                DATE OF INSTRUCTION
              </label>
              <input
                type="date"
                value={data.instruction_date || ''}
                onChange={(e) => {
                  const val = e.target.value
                  updateField('instruction_date', val)
                  // Auto-detect retrospective valuation
                  if (val && data.valuation_date) {
                    const isRetro = new Date(data.valuation_date) < new Date(val)
                    if (isRetro !== data.is_retrospective) {
                      updateField('is_retrospective', isRetro)
                    }
                  }
                }}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              />
              <p className="font-mono text-[9px] text-zinc-600 mt-1">
                When client instructed
              </p>
            </div>

            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                RETROSPECTIVE VALUATION
              </label>
              <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded">
                <button
                  type="button"
                  onClick={() => updateBooleanField('is_retrospective', !data.is_retrospective)}
                  className={cn(
                    'relative w-10 h-5 rounded-full transition-colors duration-200',
                    data.is_retrospective ? 'bg-amber-500' : 'bg-zinc-700'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200',
                    data.is_retrospective ? 'translate-x-5' : 'translate-x-0'
                  )} />
                </button>
                <span className="font-mono text-[10px] text-zinc-400">
                  {data.is_retrospective ? 'Yes - Historic date' : 'No - Current/Future'}
                </span>
              </div>
              {dateErrors.is_retrospective && (
                <p className="font-mono text-[9px] text-amber-400 mt-1">
                  {dateErrors.is_retrospective}
                </p>
              )}
            </div>
          </div>

          {/* RICS VPS 3 Compliance Note */}
          {data.is_retrospective && (
            <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded">
              <p className="font-mono text-[9px] text-amber-400">
                ⚠️ RETROSPECTIVE VALUATION: Per RICS VPS 3, this valuation reflects market conditions and 
                exchange rates as at the effective date ({data.valuation_date}). Special assumptions may apply.
              </p>
            </div>
          )}

          {/* Engagement/Client Information */}
          <div className="mt-4 pt-4 border-t border-amber-500/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-sm text-zinc-300">INSTRUCTING CLIENT</span>
              <span className="font-mono text-[9px] text-zinc-500 ml-auto">Who requested this valuation</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                  CLIENT NAME *
                </label>
                <input
                  type="text"
                  value={data.client_name || ''}
                  onChange={(e) => updateField('client_name', e.target.value)}
                  placeholder="e.g., Mr. Eric Danso or ABC Bank Ltd"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
                <p className="font-mono text-[9px] text-zinc-600 mt-1">
                  Person or entity who instructed the valuation
                </p>
              </div>

              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                  REQUEST TYPE
                </label>
                <select
                  value={data.request_type || 'written'}
                  onChange={(e) => updateField('request_type', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
                >
                  <option value="written">Written Request</option>
                  <option value="verbal">Verbal Communication</option>
                  <option value="online">Online Request</option>
                </select>
                <p className="font-mono text-[9px] text-zinc-600 mt-1">
                  How instruction was received
                </p>
              </div>

              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                  SAME AS OWNER?
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (data.owner_name) {
                      updateField('client_name', data.owner_name)
                      updateField('client_address', data.owner_address || '')
                      updateField('client_email', data.owner_email || '')
                      updateField('client_phone', data.owner_phone || '')
                    }
                  }}
                  disabled={!data.owner_name}
                  className={cn(
                    'w-full px-3 py-2 font-mono text-sm border rounded transition-colors',
                    data.owner_name 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                      : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'
                  )}
                >
                  Copy from Owner
                </button>
                <p className="font-mono text-[9px] text-zinc-600 mt-1">
                  {data.owner_name ? 'Click to copy owner info' : 'Enter owner info first'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                  CLIENT EMAIL
                </label>
                <input
                  type="email"
                  value={data.client_email || ''}
                  onChange={(e) => updateField('client_email', e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                  CLIENT PHONE
                </label>
                <input
                  type="tel"
                  value={data.client_phone || ''}
                  onChange={(e) => updateField('client_phone', e.target.value)}
                  placeholder="+233 XX XXX XXXX"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">
                  CLIENT ADDRESS
                </label>
                <input
                  type="text"
                  value={data.client_address || ''}
                  onChange={(e) => updateField('client_address', e.target.value)}
                  placeholder="Client's address"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Purpose of Valuation */}
      {showValuationDates && mode === 'subject' && (
        <div className="space-y-4 border border-amber-500/20 rounded-lg p-4 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-sm text-zinc-300">PURPOSE OF VALUATION</span>
            <span className="font-mono text-[9px] text-amber-400/70 ml-auto">RICS Red Book Compliant</span>
          </div>
          <p className="font-mono text-[10px] text-zinc-500 -mt-2 mb-3">
            Select the purpose for which this valuation is being conducted
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-3">
            {[
              { value: 'sale', label: 'Market Value (Sale)', description: 'Sale/purchase valuation' },
              { value: 'mortgage', label: 'Mortgage/Lending', description: 'Loan security' },
              { value: 'insurance', label: 'Insurance', description: 'Replacement cost' },
              { value: 'tax', label: 'Tax Assessment', description: 'Property tax basis' },
              { value: 'investment', label: 'Investment', description: 'Returns analysis' },
              { value: 'development', label: 'Development', description: 'Feasibility study' },
              { value: 'rental', label: 'Rental Value', description: 'Market rent' },
              { value: 'accounting', label: 'Financial Reporting', description: 'IFRS Fair Value' },
              { value: 'litigation', label: 'Litigation', description: 'Court/dispute' },
            ].map((purpose) => (
              <button
                key={purpose.value}
                type="button"
                onClick={() => updateField('valuation_purpose', purpose.value)}
                className={cn(
                  'p-3 border text-left transition-colors',
                  data.valuation_purpose === purpose.value
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                )}
              >
                <div className={cn(
                  'font-mono text-sm',
                  data.valuation_purpose === purpose.value ? 'text-amber-400' : 'text-white'
                )}>
                  {purpose.label}
                </div>
                <div className="font-mono text-[9px] text-zinc-500 mt-1">
                  {purpose.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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

      {/* Chapter 3: Report Data Section */}
      <div className="space-y-6 border border-amber-500/30 p-4 bg-amber-500/5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-amber-500" />
          <span className="font-mono text-sm text-amber-300">REPORT DATA (CHAPTER 3)</span>
          <span className="font-mono text-[9px] text-zinc-500 ml-2">Detailed descriptions for valuation report</span>
        </div>

        {/* City Data */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">CITY DATA</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">CITY DESCRIPTION</label>
            <textarea
              value={data.city_description || ''}
              onChange={(e) => updateField('city_description', e.target.value)}
              placeholder="Describe the city/metropolitan area - its history, economic activities, infrastructure, notable features, and development trends..."
              rows={4}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
            <p className="font-mono text-[9px] text-zinc-600 mt-1">e.g., "The property is located within the Sekondi-Takoradi Metropolitan Area..."</p>
          </div>
        </div>

        {/* Neighbourhood Data */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">NEIGHBOURHOOD DATA</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">NEIGHBOURHOOD DESCRIPTION</label>
            <textarea
              value={data.neighbourhood_description || ''}
              onChange={(e) => updateField('neighbourhood_description', e.target.value)}
              placeholder="Describe the neighborhood - location, character, building types, income levels, infrastructure, nearby facilities..."
              rows={4}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">NEIGHBOURHOOD CLASS</label>
              <select
                value={data.neighborhood_class || 'middle_class'}
                onChange={(e) => updateField('neighborhood_class', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="first_class">1st Class</option>
                <option value="high_class">High Class</option>
                <option value="second_class">2nd Class</option>
                <option value="middle_class">Middle Class</option>
                <option value="third_class">3rd Class</option>
                <option value="low_class">Low Class</option>
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">RESIDENT INCOME LEVEL</label>
              <select
                value={data.resident_income_level || 'middle_income'}
                onChange={(e) => updateField('resident_income_level', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="high_income">High Income Earners</option>
                <option value="middle_income">Middle Income Earners</option>
                <option value="low_income">Low Income Earners</option>
                <option value="mixed_income">Mixed Income Levels</option>
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">PRIMARY USE</label>
              <select
                value={data.primary_use || 'residential'}
                onChange={(e) => updateField('primary_use', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="mixed_use">Mixed Use</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location Description */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">LOCATION</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">LOCATION DESCRIPTION</label>
            <textarea
              value={data.location_description || ''}
              onChange={(e) => updateField('location_description', e.target.value)}
              placeholder="Describe the specific location - distance from main roads, landmarks, access points..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Brief Property Description */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">BRIEF DESCRIPTION OF PROPERTY</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">PROPERTY DESCRIPTION</label>
            <textarea
              value={data.brief_description || ''}
              onChange={(e) => updateField('brief_description', e.target.value)}
              placeholder="Brief description of the property - type, layout, land size, coverage..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Grounds and External Works */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">GROUNDS AND EXTERNAL WORKS</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">GROUNDS DESCRIPTION</label>
            <textarea
              value={data.grounds_external_works || ''}
              onChange={(e) => updateField('grounds_external_works', e.target.value)}
              placeholder="Describe the compound - boundary walls, landscaping, paving, water tanks, outbuildings..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Construction Details */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">CONSTRUCTION DETAILS</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">FLOOR FINISH</label>
              <input
                type="text"
                value={data.floor_finish || ''}
                onChange={(e) => updateField('floor_finish', e.target.value)}
                placeholder="e.g., Ceramic tiles in all areas"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">WALL CONSTRUCTION</label>
              <input
                type="text"
                value={data.wall_construction || ''}
                onChange={(e) => updateField('wall_construction', e.target.value)}
                placeholder="e.g., Sandcrete blockwork, plastered and painted"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">DOORS</label>
              <input
                type="text"
                value={data.doors || ''}
                onChange={(e) => updateField('doors', e.target.value)}
                placeholder="e.g., Polished wooden panel and aluminum doors"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">WINDOWS</label>
              <input
                type="text"
                value={data.windows || ''}
                onChange={(e) => updateField('windows', e.target.value)}
                placeholder="e.g., Aluminum sliding windows with insect nets"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">CEILING</label>
              <input
                type="text"
                value={data.ceiling || ''}
                onChange={(e) => updateField('ceiling', e.target.value)}
                placeholder="e.g., Plaster of paris (POP)"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-500 mb-1 block">ROOFING</label>
              <input
                type="text"
                value={data.roofing || ''}
                onChange={(e) => updateField('roofing', e.target.value)}
                placeholder="e.g., Aluminum roofing sheets"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
        </div>

        {/* Fixtures and Fittings */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">FIXTURES AND FITTINGS</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">FIXTURES LIST</label>
            <textarea
              value={data.fixtures_fittings || ''}
              onChange={(e) => updateField('fixtures_fittings', e.target.value)}
              placeholder="e.g., Water closets, wash hand basins, shower sets, air-conditioners..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Drainage/Sanitation */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">DRAINAGE / SANITATION</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">DRAINAGE DESCRIPTION</label>
            <textarea
              value={data.drainage_sanitation || ''}
              onChange={(e) => updateField('drainage_sanitation', e.target.value)}
              placeholder="e.g., Drainage of liquid and solid waste is through PVC pipes into a septic tank..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Condition State */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">GENERAL CONDITION AND STATE OF REPAIR</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">CONDITION NOTES</label>
            <textarea
              value={data.condition_state || ''}
              onChange={(e) => updateField('condition_state', e.target.value)}
              placeholder="Describe the property condition, any defects observed (cracks, dampness, deterioration)..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Services */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">SERVICES</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">SERVICES DESCRIPTION</label>
            <textarea
              value={data.services_description || ''}
              onChange={(e) => updateField('services_description', e.target.value)}
              placeholder="e.g., Water, electricity and telecommunication facilities are available..."
              rows={2}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Land Value Evidence */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">EVIDENCE OF LAND VALUES</div>
          <div>
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">LAND VALUE ANALYSIS</label>
            <textarea
              value={data.land_value_evidence || ''}
              onChange={(e) => updateField('land_value_evidence', e.target.value)}
              placeholder="Describe the land value analysis - infrastructure, drainage, neighborhood factors, adopted value per acre..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>

        {/* Property Risk Assessment (GhIS Section 3) */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] text-amber-400 border-b border-amber-500/20 pb-1">PROPERTY RISK ASSESSMENT</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { key: 'employment_stability', label: 'EMPLOYMENT STABILITY' },
              { key: 'convenience_employment', label: 'CONVENIENCE TO EMPLOYMENT' },
              { key: 'convenience_shopping', label: 'CONVENIENCE TO SHOPPING' },
              { key: 'convenience_school', label: 'CONVENIENCE TO SCHOOL' },
              { key: 'public_transportation', label: 'PUBLIC TRANSPORTATION' },
              { key: 'utilities_adequacy', label: 'ADEQUACY OF UTILITIES' },
              { key: 'recreation_facilities', label: 'RECREATION FACILITIES' },
              { key: 'police_fire_protection', label: 'POLICE & FIRE PROTECTION' },
              { key: 'accessibility', label: 'ACCESSIBILITY' },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <label className="font-mono text-[10px] text-zinc-500 mb-1 block">{label}</label>
                <select
                  value={(data.risk_assessment as any)?.[key] || 'average'}
                  onChange={(e) => {
                    const current = (data.risk_assessment || {}) as any;
                    updateField('risk_assessment', { ...current, [key]: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
                >
                  <option value="good">Good</option>
                  <option value="average">Average</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
            ))}
          </div>
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