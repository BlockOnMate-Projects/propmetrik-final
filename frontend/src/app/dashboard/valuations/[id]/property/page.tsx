'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, Suspense, lazy } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  PropertyTypeBadge,
  AlertBanner,
  Currency,
  StepIndicator,
} from '@/components/ui/terminal'
import { valuationsApi, floorPlanApi } from '@/lib/valuation-api'
import type { Valuation, FloorPlan, FloorPlanRoom, RoomType } from '@/types/valuation'
import type { PropertyMeasurements, RoomMeasurement } from '@/components/valuation/FloorPlanBuilder'
import ComprehensivePropertyForm from '@/components/forms/ComprehensivePropertyForm'
import { type ComprehensivePropertyData } from '@/types/comprehensiveProperty'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Maximize,
  Save,
  Home,
  CheckCircle2,
} from 'lucide-react'

// Lazy load the FloorPlanBuilder (heavy component with Fabric.js)
const FloorPlanBuilder = lazy(() => import('@/components/valuation/FloorPlanBuilder'))

// Room types for Ghana Building Code
const ROOM_TYPES: { value: RoomType; label: string; minArea: number }[] = [
  { value: 'living', label: 'Living Room', minArea: 13 },
  { value: 'dining', label: 'Dining Room', minArea: 9 },
  { value: 'bedroom', label: 'Bedroom', minArea: 9 },
  { value: 'kitchen', label: 'Kitchen', minArea: 4.5 },
  { value: 'bathroom', label: 'Bathroom', minArea: 2.5 },
  { value: 'toilet', label: 'Toilet', minArea: 1.5 },
  { value: 'corridor', label: 'Corridor', minArea: 1.2 },
  { value: 'storage', label: 'Storage', minArea: 1 },
  { value: 'garage', label: 'Garage', minArea: 15 },
  { value: 'balcony', label: 'Balcony', minArea: 2 },
]

// Local simplified room type for floor plan state
interface LocalFloorRoom {
  type: RoomType;
  name: string;
  area: number;
  length: number;
  width: number;
}

interface FloorPlanState {
  floorNumber: number
  name: string
  totalArea: number
  rooms: LocalFloorRoom[]
  isComplete: boolean
  canvasData?: string  // Stores the Fabric.js canvas JSON for this floor
}

export default function PropertySetupPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Floor plans state
  const [floorPlans, setFloorPlans] = useState<FloorPlanState[]>([
    { floorNumber: 0, name: 'Ground Floor', totalArea: 0, rooms: [], isComplete: false }
  ])
  const [activeFloor, setActiveFloor] = useState(0)
  const [showFloorPlanBuilder, setShowFloorPlanBuilder] = useState(false)
  const [currentMeasurements, setCurrentMeasurements] = useState<PropertyMeasurements | null>(null)

  // Property details form - comprehensive data
  const [propertyDetails, setPropertyDetails] = useState<Partial<ComprehensivePropertyData>>({})

  // Fetch valuation data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as Valuation)

        // Pre-fill property details from comprehensive data or existing format
        const property = valuationRes.data.property
        if (property) {
          // Map existing property data to comprehensive format
          setPropertyDetails({
            address: property.address_street || property.address || '',
            city: property.address_city || property.city || '',
            region: property.region || 'greater_accra',
            digital_address: property.digital_address || '',
            property_type: property.property_type || 'house',
            
            // Physical characteristics
            gfa: property.grossFloorArea || property.built_area_sqm || property.gfa || undefined,
            plot_size: property.plotSize || property.plot_size || property.land_area_sqm || undefined,
            land_area: property.landArea || property.land_area_sqm || undefined,
            bedrooms: property.bedrooms || undefined,
            bathrooms: property.bathrooms || undefined,
            total_floors: property.total_floors || property.floors || undefined,
            parking_spaces: property.parking_spaces || undefined,
            year_built: property.year_built || property.yearBuilt || undefined,
            age: property.year_built ? new Date().getFullYear() - property.year_built : undefined,
            
            // Quality & Condition  
            quality_rating: property.quality || property.quality_rating || 'standard',
            condition: property.condition || 'good',
            
            // Use comprehensive data if available, otherwise defaults
            ...(property.comprehensive_data || {})
          })
        }

        // Fetch existing floor plans from backend
        const floorPlansRes = await floorPlanApi.getByValuation(valuationId)
        if (floorPlansRes.data && floorPlansRes.data.length > 0) {
          setFloorPlans(floorPlansRes.data.map((fp: any) => ({
            floorNumber: fp.floor_number ?? fp.floorNumber ?? 0,
            name: fp.floor_label || (fp.floor_number === 0 ? 'Ground Floor' : `Floor ${fp.floor_number}`),
            totalArea: fp.total_area ?? fp.totalArea ?? 0,
            rooms: fp.rooms || [],
            isComplete: true,
            canvasData: fp.canvas_json || fp.canvasData,  // Restore canvas data for editing
          })))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Add new floor
  const addFloor = () => {
    const nextFloorNum = Math.max(...floorPlans.map(f => f.floorNumber)) + 1
    setFloorPlans([
      ...floorPlans,
      { floorNumber: nextFloorNum, name: `Floor ${nextFloorNum}`, totalArea: 0, rooms: [], isComplete: false }
    ])
    setActiveFloor(nextFloorNum)
  }

  // Remove floor
  const removeFloor = (floorNumber: number) => {
    if (floorPlans.length === 1) return
    setFloorPlans(floorPlans.filter(f => f.floorNumber !== floorNumber))
    if (activeFloor === floorNumber) {
      setActiveFloor(floorPlans[0].floorNumber)
    }
  }

  // Handle floor plan builder save
  const handleFloorPlanSave = (data: { totalArea: number; rooms: LocalFloorRoom[] }) => {
    setFloorPlans(floorPlans.map(fp =>
      fp.floorNumber === activeFloor
        ? { ...fp, totalArea: data.totalArea, rooms: data.rooms, isComplete: true }
        : fp
    ))
    setShowFloorPlanBuilder(false)
  }

  // Handle DONE button - save current floor plan
  const handleDoneFloorPlan = () => {
    if (currentMeasurements) {
      // Save floor plan with canvas data for persistence
      setFloorPlans(floorPlans.map(fp =>
        fp.floorNumber === activeFloor
          ? {
            ...fp,
            totalArea: currentMeasurements.builtArea,
            rooms: currentMeasurements.roomBreakdown.map((r: RoomMeasurement) => ({
              type: r.roomType as RoomType,
              name: r.roomName,
              area: r.area,
              length: r.dimensions.length,
              width: r.dimensions.width,
            })),
            isComplete: true,
            canvasData: currentMeasurements.floorPlanData,  // Store the canvas JSON
          }
          : fp
      ));
      setShowFloorPlanBuilder(false);
    } else {
      // Just close if no measurements
      setShowFloorPlanBuilder(false);
    }
  }

  // Calculate totals
  const totalGFA = floorPlans.reduce((sum, fp) => sum + fp.totalArea, 0)
  const totalRooms = floorPlans.reduce((sum, fp) => sum + fp.rooms.length, 0)
  const completedFloors = floorPlans.filter(fp => fp.isComplete).length

  // Save and continue
  const handleSaveAndContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      // Save comprehensive property data first
      if (propertyDetails && Object.keys(propertyDetails).length > 0) {
        // Map comprehensive data to backend format
        const propertyUpdateData = {
          // Basic information
          address_street: propertyDetails.address,
          address_city: propertyDetails.city,
          region: propertyDetails.region,
          digital_address: propertyDetails.digital_address,
          property_type: propertyDetails.property_type,
          
          // Physical characteristics
          built_area_sqm: propertyDetails.gfa,
          plot_size: propertyDetails.plot_size,
          land_area_sqm: propertyDetails.land_area,
          bedrooms: propertyDetails.bedrooms,
          bathrooms: propertyDetails.bathrooms,
          total_floors: propertyDetails.total_floors,
          floor_number: propertyDetails.floor_number,
          parking_spaces: propertyDetails.parking_spaces,
          year_built: propertyDetails.year_built,
          
          // Quality & Condition
          quality: propertyDetails.quality_rating,
          condition: propertyDetails.condition,
          
          // Store comprehensive data for future reference
          comprehensive_data: propertyDetails
        }

        // Update property data via valuation endpoint
        await valuationsApi.updateProperty(valuationId, propertyUpdateData)
      }

      // Save floor plans to backend
      for (const floorPlan of floorPlans) {
        // Only save if there's canvas data (floor plan was drawn)
        const canvasJson = floorPlan.canvasData || JSON.stringify({ objects: [], version: '5.3.0' });

        await floorPlanApi.create(valuationId, {
          canvas_json: canvasJson,
          floor_number: floorPlan.floorNumber,
          floor_label: floorPlan.name,
          scale_pixels_per_meter: 100,  // Default scale
          total_area_sqm: floorPlan.totalArea,
          rooms: floorPlan.rooms,
        })
      }

      // Update valuation progress
      await valuationsApi.update(valuationId, {
        current_step: 2,
        status: 'in_progress',
      })

      // Navigate to next step
      router.push(`/dashboard/valuations/${valuationId}/hbu`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property data')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading property setup...</span>
      </div>
    )
  }

  if (error || !valuation) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <AlertBanner type="error" title="Error" message={error || 'Valuation not found'} />
      </div>
    )
  }

  const property = valuation.property

  // Floor plan builder modal
  if (showFloorPlanBuilder) {
    return (
      <div className="fixed inset-0 bg-black z-50">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFloorPlanBuilder(false)}
              className="p-2 hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <div>
              <h2 className="font-mono text-lg text-white">FLOOR PLAN BUILDER</h2>
              <p className="font-mono text-[10px] text-zinc-500">
                {floorPlans.find(f => f.floorNumber === activeFloor)?.name || `Floor ${activeFloor}`}
              </p>
            </div>
          </div>
          <button
            onClick={handleDoneFloorPlan}
            className="px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
          >
            DONE
          </button>
        </div>
        <div className="h-[calc(100vh-64px)]">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          }>
            <FloorPlanBuilder
              onMeasurementsChange={setCurrentMeasurements}
              initialFloorPlan={floorPlans.find(f => f.floorNumber === activeFloor)?.canvasData}
              readonly={false}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}`}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">STEP 1: PROPERTY SETUP</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              VAL-{valuationId.slice(0, 8).toUpperCase()} • {property?.address || 'Property'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAndContinue}
            disabled={saving || completedFloors === 0}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                SAVE & CONTINUE
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step Progress */}
      <div className="mb-6">
        <StepIndicator
          steps={[
            { id: 1, label: 'Property Setup', status: 'current' },
            { id: 2, label: 'HBU Analysis', status: 'upcoming' },
            { id: 3, label: 'Method Selection', status: 'upcoming' },
            { id: 4, label: 'Valuation', status: 'upcoming' },
            { id: 5, label: 'Reconciliation', status: 'upcoming' },
            { id: 6, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {/* Error Alert */}
      {error && <AlertBanner type="error" title="Error" message={error} />}

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Property Summary */}
        <TerminalPanel title="PROPERTY DETAILS" className="col-span-1">
          <div className="space-y-4">
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">ADDRESS</div>
              <div className="font-mono text-sm text-white">{property?.address || '—'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">LOCATION</div>
              <div className="font-mono text-xs text-zinc-400">{property?.city}, {property?.region}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-1">TYPE</div>
              <PropertyTypeBadge type={property?.property_type || 'residential'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">BEDROOMS</div>
                <div className="font-mono text-lg text-white">{property?.bedrooms || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1">BATHROOMS</div>
                <div className="font-mono text-lg text-white">{property?.bathrooms || '—'}</div>
              </div>
            </div>
          </div>
        </TerminalPanel>

        {/* Measurement Summary */}
        <TerminalPanel title="MEASUREMENTS" className="col-span-2">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">FLOORS</div>
              <div className="font-mono text-2xl text-white">{floorPlans.length}</div>
              <div className="font-mono text-[10px] text-zinc-500">{completedFloors} completed</div>
            </div>
            <div className="p-4 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL GFA</div>
              <div className="font-mono text-2xl text-amber-400">{totalGFA.toLocaleString()}</div>
              <div className="font-mono text-[10px] text-zinc-500">sqm</div>
            </div>
            <div className="p-4 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">TOTAL ROOMS</div>
              <div className="font-mono text-2xl text-white">{totalRooms}</div>
              <div className="font-mono text-[10px] text-zinc-500">across all floors</div>
            </div>
            <div className="p-4 bg-zinc-800/30 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">PLOT SIZE</div>
              <div className="font-mono text-2xl text-white">{property?.plot_size?.toLocaleString() || '—'}</div>
              <div className="font-mono text-[10px] text-zinc-500">sqm</div>
            </div>
          </div>
        </TerminalPanel>
      </div>

      {/* Floor Plans Section */}
      <TerminalPanel title="FLOOR PLANS" className="mt-4">
        {/* Floor Tabs */}
        <div className="flex items-center gap-2 mb-4">
          {floorPlans.map((floor) => (
            <button
              key={floor.floorNumber}
              onClick={() => setActiveFloor(floor.floorNumber)}
              className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${activeFloor === floor.floorNumber
                  ? 'bg-amber-500 text-black font-bold'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
            >
              {floor.isComplete && <CheckCircle2 className="w-3 h-3" />}
              {floor.name.toUpperCase()}
            </button>
          ))}
          <button
            onClick={addFloor}
            className="flex items-center gap-1 px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-xs hover:text-white hover:border-zinc-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            ADD FLOOR
          </button>
        </div>

        {/* Active Floor Content */}
        {floorPlans.map((floor) => (
          floor.floorNumber === activeFloor && (
            <div key={floor.floorNumber} className="space-y-4">
              {/* Floor Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-zinc-400">
                    {floor.totalArea > 0
                      ? `${floor.totalArea.toLocaleString()} sqm • ${floor.rooms.length} rooms`
                      : 'No measurements yet'
                    }
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {floorPlans.length > 1 && (
                    <button
                      onClick={() => removeFloor(floor.floorNumber)}
                      className="flex items-center gap-1 px-3 py-2 bg-red-900/30 text-red-400 font-mono text-xs hover:bg-red-900/50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      REMOVE
                    </button>
                  )}
                  <button
                    onClick={() => setShowFloorPlanBuilder(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
                  >
                    <Maximize className="w-3 h-3" />
                    {floor.isComplete ? 'EDIT FLOOR PLAN' : 'DRAW FLOOR PLAN'}
                  </button>
                </div>
              </div>

              {/* Room Summary */}
              {floor.rooms.length > 0 ? (
                <div className="grid grid-cols-6 gap-3">
                  {floor.rooms.map((room, idx) => {
                    const roomType = ROOM_TYPES.find(r => r.value === room.type)
                    const meetsMinArea = room.area >= (roomType?.minArea || 0)

                    return (
                      <div
                        key={idx}
                        className={`p-3 border ${meetsMinArea ? 'border-zinc-700 bg-zinc-800/30' : 'border-red-500/50 bg-red-900/10'
                          }`}
                      >
                        <div className="font-mono text-[10px] text-zinc-500 mb-1">{room.type.toUpperCase()}</div>
                        <div className={`font-mono text-lg ${meetsMinArea ? 'text-white' : 'text-red-400'}`}>
                          {room.area.toFixed(1)} sqm
                        </div>
                        {!meetsMinArea && (
                          <div className="font-mono text-[9px] text-red-400 mt-1">
                            Min: {roomType?.minArea} sqm
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-zinc-800">
                  <Home className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <div className="font-mono text-sm text-zinc-500 mb-1">No floor plan created yet</div>
                  <div className="font-mono text-[10px] text-zinc-600">
                    Click &ldquo;DRAW FLOOR PLAN&rdquo; to measure rooms and areas
                  </div>
                </div>
              )}
            </div>
          )
        ))}
      </TerminalPanel>

      {/* Comprehensive Property Details */}
      <TerminalPanel title="COMPREHENSIVE PROPERTY DETAILS" className="mt-4">
        <ComprehensivePropertyForm
          data={propertyDetails}
          onChange={setPropertyDetails}
          mode="subject"
          showLocationFields={true}
          showTransactionFields={false}
          className=""
        />
      </TerminalPanel>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}`}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK TO OVERVIEW
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving || completedFloors === 0}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SAVING...
            </>
          ) : (
            <>
              CONTINUE TO HBU ANALYSIS
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
