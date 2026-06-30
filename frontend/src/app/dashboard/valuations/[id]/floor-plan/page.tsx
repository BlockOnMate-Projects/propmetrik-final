'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  StepIndicator,
} from '@/components/ui/terminal'
import { valuationsApi, floorPlanApi } from '@/lib/valuation-api'
import type { Valuation, FloorPlan, RoomType } from '@/types/valuation'
import type { PropertyMeasurements } from '@/components/valuation/professional-floor-plan/types'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Home,
  CheckCircle2,
  Pencil,
} from 'lucide-react'

// Dynamically load the Professional FloorPlanBuilder with SSR disabled (Konva requires browser Canvas API)
const ProfessionalFloorPlanBuilder = dynamic(
  () => import('@/components/valuation/professional-floor-plan').then(m => ({ default: m.ProfessionalFloorPlanBuilder })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-card border border-border">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    ),
  }
)

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
  type: RoomType
  name: string
  area: number
  length: number
  width: number
}

interface FloorPlanState {
  floorNumber: number
  name: string
  totalArea: number
  rooms: LocalFloorRoom[]
  isComplete: boolean
  canvasData?: string
  imageDataUrl?: string
}

export default function FloorPlanPage() {
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
  const [currentFloorPlanImage, setCurrentFloorPlanImage] = useState<string | null>(null)

  // Handle floor plan changes including image capture
  const handleFloorPlanChange = (data: { json: string; imageDataUrl: string; measurements: PropertyMeasurements }) => {
    setCurrentMeasurements(data.measurements)
    setCurrentFloorPlanImage(data.imageDataUrl)
  }

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

        // Fetch existing floor plans from backend
        const floorPlansRes = await floorPlanApi.getByValuation(valuationId)
        if (floorPlansRes.data && floorPlansRes.data.length > 0) {
          setFloorPlans(floorPlansRes.data.map((fp: any) => ({
            floorNumber: fp.floor_number ?? fp.floorNumber ?? 0,
            name: fp.floor_label || (fp.floor_number === 0 ? 'Ground Floor' : `Floor ${fp.floor_number}`),
            totalArea: fp.total_area ?? fp.totalArea ?? 0,
            rooms: fp.rooms || [],
            isComplete: true,
            canvasData: fp.canvas_json || fp.canvasData,
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

  // Handle DONE button - save current floor plan
  const handleDoneFloorPlan = () => {
    if (currentMeasurements) {
      setFloorPlans(floorPlans.map(fp =>
        fp.floorNumber === activeFloor
          ? {
            ...fp,
            totalArea: currentMeasurements.builtArea,
            rooms: currentMeasurements.roomBreakdown.map((r) => ({
              type: r.type as RoomType,
              name: r.name,
              area: r.area,
              length: r.dimensions.length,
              width: r.dimensions.width,
            })),
            isComplete: true,
            canvasData: currentMeasurements.floorPlanData,
            imageDataUrl: currentFloorPlanImage || undefined,
          }
          : fp
      ))
      setShowFloorPlanBuilder(false)
      setCurrentFloorPlanImage(null)
    } else {
      setShowFloorPlanBuilder(false)
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

      // Save floor plans to backend
      for (const floorPlan of floorPlans) {
        const canvasJson = floorPlan.canvasData || JSON.stringify({ objects: [], version: '5.3.0' })

        const result = await floorPlanApi.create(valuationId, {
          canvas_json: canvasJson,
          floor_number: floorPlan.floorNumber,
          floor_label: floorPlan.name,
          scale_pixels_per_meter: 100,
          total_area_sqm: floorPlan.totalArea,
          rooms: floorPlan.rooms,
        })

        // Upload floor plan image if available
        if (result.success && result.data?.id && floorPlan.imageDataUrl) {
          await floorPlanApi.uploadImage(result.data.id, floorPlan.imageDataUrl)
        }
      }

      // Update valuation progress — floor plan is step 2, advance to step 3
      await valuationsApi.update(valuationId, {
        current_step: 3,
        status: 'in_progress',
      })

      // Navigate to HBU Analysis
      router.push(`/dashboard/valuations/${valuationId}/hbu`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save floor plans')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-muted-foreground">Loading floor plans...</span>
      </div>
    )
  }

  if (error || !valuation) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4">
        <AlertBanner type="error" title="Error" message={error || 'Valuation not found'} />
      </div>
    )
  }

  const property = valuation.property as any

  // Floor plan builder full-screen overlay
  if (showFloorPlanBuilder) {
    return (
      <div className="fixed inset-0 bg-background z-50">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFloorPlanBuilder(false)}
              className="p-2 hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h2 className="font-mono text-lg text-foreground">PROFESSIONAL FLOOR PLAN BUILDER</h2>
              <p className="font-mono text-[10px] text-muted-foreground">
                {floorPlans.find(f => f.floorNumber === activeFloor)?.name || `Floor ${activeFloor}`}
              </p>
            </div>
          </div>
          <button
            onClick={handleDoneFloorPlan}
            className="px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
          >
            DONE
          </button>
        </div>
        <div className="h-[calc(100vh-64px)]">
            <ProfessionalFloorPlanBuilder
              key={activeFloor}
              floorNumber={activeFloor}
              floorLabel={floorPlans.find(f => f.floorNumber === activeFloor)?.name || `Floor ${activeFloor}`}
              valuationId={valuationId}
              onMeasurementsChange={setCurrentMeasurements}
              onFloorPlanChange={handleFloorPlanChange}
              initialFloorPlan={floorPlans.find(f => f.floorNumber === activeFloor)?.canvasData}
              readonly={false}
              width={1200}
              height={700}
            />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}`}
            className="p-2 hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-foreground">STEP 2: FLOOR PLANS</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              VAL-{valuationId.slice(0, 8).toUpperCase()} • {property?.address || 'Property'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
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
            { id: 1, label: 'Property Setup', status: 'completed' },
            { id: 2, label: 'Floor Plans', status: 'current' },
            { id: 3, label: 'HBU Analysis', status: 'upcoming' },
            { id: 4, label: 'Method Selection', status: 'upcoming' },
            { id: 5, label: 'Valuation', status: 'upcoming' },
            { id: 6, label: 'Reconciliation', status: 'upcoming' },
            { id: 7, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {/* Error Alert */}
      {error && <AlertBanner type="error" title="Error" message={error} />}

      {/* Measurements Summary */}
      <TerminalPanel title="MEASUREMENTS SUMMARY" className="mb-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-muted/30 border border-border">
            <div className="font-mono text-[10px] text-muted-foreground mb-1">FLOORS</div>
            <div className="font-mono text-2xl text-foreground">{floorPlans.length}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{completedFloors} completed</div>
          </div>
          <div className="p-4 bg-muted/30 border border-border">
            <div className="font-mono text-[10px] text-muted-foreground mb-1">TOTAL GFA</div>
            <div className="font-mono text-2xl text-amber-600 dark:text-amber-400">{totalGFA.toLocaleString()}</div>
            <div className="font-mono text-[10px] text-muted-foreground">sqm</div>
          </div>
          <div className="p-4 bg-muted/30 border border-border">
            <div className="font-mono text-[10px] text-muted-foreground mb-1">TOTAL ROOMS</div>
            <div className="font-mono text-2xl text-foreground">{totalRooms}</div>
            <div className="font-mono text-[10px] text-muted-foreground">across all floors</div>
          </div>
          <div className="p-4 bg-muted/30 border border-border">
            <div className="font-mono text-[10px] text-muted-foreground mb-1">PLOT SIZE</div>
            <div className="font-mono text-2xl text-foreground">
              {(property?.plotSize || property?.plot_size || property?.landArea || property?.land_area)?.toLocaleString() || '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">sqm</div>
          </div>
        </div>
      </TerminalPanel>

      {/* Floor Plans Section */}
      <TerminalPanel title="FLOOR PLANS">
        {/* Floor Tabs */}
        <div className="flex items-center gap-2 mb-4">
          {floorPlans.map((floor) => (
            <button
              key={floor.floorNumber}
              onClick={() => setActiveFloor(floor.floorNumber)}
              className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${activeFloor === floor.floorNumber
                ? 'bg-amber-500 text-foreground font-bold'
                : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
            >
              {floor.isComplete && <CheckCircle2 className="w-3 h-3" />}
              {floor.name.toUpperCase()}
            </button>
          ))}
          <button
            onClick={addFloor}
            className="flex items-center gap-1 px-3 py-2 bg-card border border-border text-muted-foreground font-mono text-xs hover:text-foreground hover:border-border transition-colors"
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
                  <span className="font-mono text-sm text-muted-foreground">
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
                      className="flex items-center gap-1 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-mono text-xs hover:bg-red-900/50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      REMOVE
                    </button>
                  )}
                  <button
                    onClick={() => setShowFloorPlanBuilder(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    {floor.isComplete ? 'EDIT FLOOR PLAN' : 'DRAW FLOOR PLAN'}
                  </button>
                </div>
              </div>

              {/* Room Summary */}
              {floor.rooms.length > 0 ? (
                <div className="grid grid-cols-6 gap-3">
                  {floor.rooms.map((room, idx) => {
                    const roomType = ROOM_TYPES.find(r => r.value === room.type)
                    const roomArea = room.area ?? 0
                    const meetsMinArea = roomArea >= (roomType?.minArea || 0)

                    return (
                      <div
                        key={idx}
                        className={`p-3 border ${meetsMinArea ? 'border-border bg-muted/30' : 'border-red-500/50 bg-red-100 dark:bg-red-900/10'}`}
                      >
                        <div className="font-mono text-[10px] text-muted-foreground mb-1">{(room.type || 'room').toUpperCase()}</div>
                        <div className={`font-mono text-lg ${meetsMinArea ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}>
                          {roomArea.toFixed(1)} sqm
                        </div>
                        {!meetsMinArea && (
                          <div className="font-mono text-[9px] text-red-600 dark:text-red-400 mt-1">
                            Min: {roomType?.minArea || 0} sqm
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-border">
                  <Home className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <div className="font-mono text-sm text-muted-foreground mb-1">No floor plan created yet</div>
                  <div className="font-mono text-[10px] text-muted-foreground mb-4">
                    Use the professional floor plan builder to draw walls, add doors/windows, and define rooms
                  </div>
                  <button
                    onClick={() => setShowFloorPlanBuilder(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-foreground font-mono text-xs font-bold hover:bg-amber-400 transition-colors mx-auto"
                  >
                    <Pencil className="w-3 h-3" />
                    DRAW FLOOR PLAN
                  </button>
                </div>
              )}
            </div>
          )
        ))}
      </TerminalPanel>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}/property`}
          className="px-6 py-3 bg-muted text-muted-foreground font-mono text-sm hover:text-foreground transition-colors"
        >
          ← BACK TO PROPERTY SETUP
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-foreground font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
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
