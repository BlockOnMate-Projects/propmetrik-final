'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { MapPin, Check, AlertCircle, Loader2, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { locationApi, type GhanaPostValidation, type LocationValidation } from '@/lib/projects-api'

// =====================================================
// TYPES
// =====================================================
export interface GhanaLocation {
  gps_code?: string
  gpsCode?: string
  region?: string
  district?: string
  area?: string
  address?: string
  latitude?: number
  longitude?: number
  coordinates?: { lat: number; lng: number }
  confidence?: number
}

// Alias for backward compatibility
export type LocationData = GhanaLocation

interface LocationSelectorProps {
  value: GhanaLocation | null
  onChange: (location: GhanaLocation) => void
  showTraditionalAuthority?: boolean
  required?: boolean
  error?: string
  className?: string
}

// =====================================================
// GHANA REGIONS (16 regions)
// =====================================================
const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Central',
  'Eastern',
  'Volta',
  'Northern',
  'Upper East',
  'Upper West',
  'Brong Ahafo',
  'Oti',
  'Bono East',
  'Ahafo',
  'Savannah',
  'North East',
  'Western North',
]

// Ghana bounding box for validation
const GHANA_BOUNDS = {
  north: 11.175,
  south: 4.736,
  east: 1.199,
  west: -3.255,
}

// =====================================================
// GPS CODE VALIDATION COMPONENT
// =====================================================
function GPSCodeInput({
  value,
  onChange,
  onValidate,
  isValidating,
  validationResult,
}: {
  value: string
  onChange: (value: string) => void
  onValidate: () => void
  isValidating: boolean
  validationResult?: GhanaPostValidation | null
}) {
  // Format GPS code as user types (XX-XXX-XXXX)
  const formatGPSCode = (input: string) => {
    const clean = input.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (clean.length <= 2) return clean
    if (clean.length <= 5) return `${clean.slice(0, 2)}-${clean.slice(2)}`
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 9)}`
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatGPSCode(e.target.value)
    onChange(formatted)
  }

  return (
    <div className="space-y-2">
      <Label className="font-mono text-xs text-zinc-400">
        Ghana PostGPS Code
        <span className="text-zinc-600 ml-2">(e.g., GA-XXX-XXXX)</span>
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={handleChange}
            placeholder="GA-XXX-XXXX"
            className={cn(
              "font-mono uppercase bg-zinc-900 border-zinc-700 text-zinc-100",
              validationResult?.valid && "border-green-600 focus:ring-green-600",
              validationResult?.valid === false && "border-red-600 focus:ring-red-600"
            )}
            maxLength={11}
          />
          {validationResult?.valid && (
            <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
          )}
          {validationResult?.valid === false && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onValidate}
          disabled={isValidating || !value || value.length < 9}
          className="border-zinc-700 hover:bg-zinc-800"
        >
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Validate'
          )}
        </Button>
      </div>
      {validationResult && (
        <div className={cn(
          "text-xs font-mono px-2 py-1",
          validationResult.valid ? "text-green-400 bg-green-900/20" : "text-red-400 bg-red-900/20"
        )}>
          {validationResult.valid ? (
            <>
              ✓ Valid: {validationResult.district}, {validationResult.region}
              {validationResult.confidence && (
                <span className="ml-2 text-zinc-500">
                  ({Math.round(validationResult.confidence * 100)}% confidence)
                </span>
              )}
            </>
          ) : (
            validationResult.error || 'Invalid GPS code'
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================
// COORDINATE PICKER COMPONENT
// =====================================================
function CoordinatePicker({
  latitude,
  longitude,
  onChange,
  onGetLocation,
  isGettingLocation,
}: {
  latitude?: number
  longitude?: number
  onChange: (lat: number, lng: number) => void
  onGetLocation: () => void
  isGettingLocation: boolean
}) {
  const isInGhana = latitude && longitude &&
    latitude >= GHANA_BOUNDS.south &&
    latitude <= GHANA_BOUNDS.north &&
    longitude >= GHANA_BOUNDS.west &&
    longitude <= GHANA_BOUNDS.east

  return (
    <div className="space-y-2">
      <Label className="font-mono text-xs text-zinc-400">GPS Coordinates</Label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Input
            type="number"
            step="0.000001"
            placeholder="Latitude"
            value={latitude || ''}
            onChange={(e) => onChange(parseFloat(e.target.value), longitude || 0)}
            className={cn(
              "font-mono text-sm bg-zinc-900 border-zinc-700 text-zinc-100",
              latitude && !isInGhana && "border-amber-600"
            )}
          />
        </div>
        <div>
          <Input
            type="number"
            step="0.000001"
            placeholder="Longitude"
            value={longitude || ''}
            onChange={(e) => onChange(latitude || 0, parseFloat(e.target.value))}
            className={cn(
              "font-mono text-sm bg-zinc-900 border-zinc-700 text-zinc-100",
              longitude && !isInGhana && "border-amber-600"
            )}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onGetLocation}
          disabled={isGettingLocation}
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          {isGettingLocation ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Getting location...
            </>
          ) : (
            <>
              <Navigation className="h-3 w-3 mr-1" />
              Use current location
            </>
          )}
        </Button>
        {latitude && longitude && (
          <span className={cn(
            "text-xs font-mono",
            isInGhana ? "text-green-400" : "text-amber-400"
          )}>
            {isInGhana ? '✓ Within Ghana bounds' : '⚠ Outside Ghana bounds'}
          </span>
        )}
      </div>
    </div>
  )
}

// =====================================================
// MAIN LOCATION SELECTOR COMPONENT
// =====================================================
export function LocationSelector({
  value,
  onChange,
  showTraditionalAuthority = false,
  required = false,
  error,
  className,
}: LocationSelectorProps) {
  // Use a derived safe value to avoid null checks
  const location = value || {
    region: '',
    district: '',
    area: '',
    address: '',
    gps_code: '',
    latitude: undefined,
    longitude: undefined,
  }
  
  const [isValidating, setIsValidating] = useState(false)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [validationResult, setValidationResult] = useState<GhanaPostValidation | null>(null)
  const [districts, setDistricts] = useState<string[]>([])
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false)

  // Load districts when region changes
  useEffect(() => {
    if (location.region) {
      setIsLoadingDistricts(true)
      locationApi.getDistricts(location.region)
        .then(setDistricts)
        .catch(console.error)
        .finally(() => setIsLoadingDistricts(false))
    } else {
      setDistricts([])
    }
  }, [location.region])

  // Validate GPS code
  const handleValidateGPS = useCallback(async () => {
    if (!location.gps_code) return
    
    setIsValidating(true)
    try {
      const result = await locationApi.validateGPS(location.gps_code)
      setValidationResult(result)
      
      if (result.valid) {
        onChange({
          ...location,
          region: result.region,
          district: result.district,
          address: result.address,
          latitude: result.latitude,
          longitude: result.longitude,
          confidence: result.confidence,
        })
      }
    } catch (err) {
      setValidationResult({
        valid: false,
        gpsCode: location.gps_code,
        error: 'Validation failed. Please try again.',
      })
    } finally {
      setIsValidating(false)
    }
  }, [location, onChange])

  // Get current location
  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setIsGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        
        try {
          // Reverse geocode to get location details
          const result = await locationApi.reverseGeocode(latitude, longitude)
          
          onChange({
            ...location,
            latitude,
            longitude,
            region: result.region || location.region,
            district: result.district || location.district,
            area: result.area || location.area,
            gps_code: result.gpsCode || location.gps_code,
          })
        } catch (err) {
          // Still update coordinates even if reverse geocode fails
          onChange({ ...location, latitude, longitude })
        }
        
        setIsGettingLocation(false)
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Could not get your location. Please enter coordinates manually.')
        setIsGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [location, onChange])

  // Handle coordinate changes
  const handleCoordinateChange = useCallback((lat: number, lng: number) => {
    onChange({ ...location, latitude: lat, longitude: lng })
  }, [location, onChange])

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-amber-500" />
        <span className="font-mono text-xs text-amber-500 tracking-wider">
          PROJECT LOCATION
        </span>
        {required && <span className="text-red-400 text-xs">*</span>}
      </div>

      {/* GPS Code Input */}
      <GPSCodeInput
        value={location.gps_code || ''}
        onChange={(gps_code) => onChange({ ...location, gps_code })}
        onValidate={handleValidateGPS}
        isValidating={isValidating}
        validationResult={validationResult}
      />

      {/* Region & District Selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-zinc-400">Region</Label>
          <Select
            value={location.region || ''}
            onValueChange={(region) => onChange({ ...location, region, district: '' })}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {GHANA_REGIONS.map((region) => (
                <SelectItem 
                  key={region} 
                  value={region}
                  className="text-zinc-100 focus:bg-zinc-800"
                >
                  {region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-zinc-400">District/Assembly</Label>
          <Select
            value={location.district || ''}
            onValueChange={(district) => onChange({ ...location, district })}
            disabled={!location.region || isLoadingDistricts}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
              {isLoadingDistricts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue placeholder="Select district" />
              )}
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
              {districts.map((district) => (
                <SelectItem 
                  key={district} 
                  value={district}
                  className="text-zinc-100 focus:bg-zinc-800"
                >
                  {district}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Area/Locality */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs text-zinc-400">Area/Locality</Label>
        <Input
          value={location.area || ''}
          onChange={(e) => onChange({ ...location, area: e.target.value })}
          placeholder="e.g., Airport Residential, Cantonments"
          className="bg-zinc-900 border-zinc-700 text-zinc-100"
        />
      </div>

      {/* Full Address */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs text-zinc-400">Full Address</Label>
        <Input
          value={location.address || ''}
          onChange={(e) => onChange({ ...location, address: e.target.value })}
          placeholder="Street address or landmark"
          className="bg-zinc-900 border-zinc-700 text-zinc-100"
        />
      </div>

      {/* Coordinates */}
      <CoordinatePicker
        latitude={location.latitude}
        longitude={location.longitude}
        onChange={handleCoordinateChange}
        onGetLocation={handleGetLocation}
        isGettingLocation={isGettingLocation}
      />

      {/* Error message */}
      {error && (
        <p className="font-mono text-[10px] text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}

      {/* Confidence indicator */}
      {location.confidence && (
        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800/50 rounded">
          <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full",
                location.confidence >= 0.8 ? "bg-green-500" :
                location.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${location.confidence * 100}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-400">
            {Math.round(location.confidence * 100)}% confidence
          </span>
        </div>
      )}
    </div>
  )
}

export default LocationSelector
