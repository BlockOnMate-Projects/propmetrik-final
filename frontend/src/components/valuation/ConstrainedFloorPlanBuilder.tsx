'use client';

/**
 * Constrained Floor Plan Builder
 * 
 * A controlled floor plan editor that renders Blender geometry and allows
 * only constrained adjustments. No freehand drawing - all modifications
 * are deltas that trigger Blender regeneration.
 * 
 * Key Principles:
 * - Blender geometry is authoritative
 * - User adjustments are deltas (not absolute coordinates)
 * - Constraints prevent invalid modifications
 * - All changes are audited
 * 
 * @module components/valuation/ConstrainedFloorPlanBuilder
 * @version 1.0.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Move,
  Maximize2,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Undo2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Layers,
  Ruler,
  Type,
  Info,
} from 'lucide-react';
import type {
  BlenderGeometryResult,
  ConstrainedFloorPlanBuilderProps,
  AdjustmentConstraint,
  AdjustmentDelta,
  UserAdjustmentDeltas,
  AdjustmentOperation,
  RoomType,
} from '@/types/floorPlanGeometry';

// Helper to generate UUIDs (browser native)
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ============================================================================
// CONSTANTS
// ============================================================================

// Extended room types for floor plan builder (includes additional types not in base RoomType)
type ExtendedRoomType = RoomType | 'master_bedroom' | 'entrance' | 'utility' | 'terrace' | 'staircase' | 'other' | 'porch';

const ROOM_COLORS: Record<ExtendedRoomType | string, string> = {
  living: '#FEF3C7',
  dining: '#FDE68A',
  kitchen: '#FCD34D',
  bedroom: '#DBEAFE',
  master_bedroom: '#BFDBFE',
  bathroom: '#D1FAE5',
  toilet: '#A7F3D0',
  corridor: '#F3F4F6',
  storage: '#E5E7EB',
  entrance: '#EDE9FE',
  garage: '#D1D5DB',
  balcony: '#CFFAFE',
  terrace: '#A5F3FC',
  office: '#FCE7F3',
  laundry: '#E0E7FF',
  utility: '#F5F5F4',
  staircase: '#FEE2E2',
  porch: '#FEF9C3',
  other: '#F9FAFB',
};

const ROOM_TYPE_OPTIONS: { value: ExtendedRoomType; label: string }[] = [
  { value: 'living', label: 'Living Room' },
  { value: 'dining', label: 'Dining Room' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'master_bedroom', label: 'Master Bedroom' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'toilet', label: 'Toilet' },
  { value: 'corridor', label: 'Corridor' },
  { value: 'storage', label: 'Storage' },
  { value: 'entrance', label: 'Entrance' },
  { value: 'garage', label: 'Garage' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'office', label: 'Office' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'utility', label: 'Utility' },
  { value: 'porch', label: 'Porch' },
  { value: 'other', label: 'Other' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function ConstrainedFloorPlanBuilder({
  valuationId,
  blenderGeometry,
  onAdjustmentSubmit,
  readonly = false,
  className,
}: ConstrainedFloorPlanBuilderProps) {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<string | null>(null);
  const [pendingAdjustments, setPendingAdjustments] = useState<AdjustmentDelta[]>([]);
  const [constraints, setConstraints] = useState<AdjustmentConstraint[]>([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [activeTool, setActiveTool] = useState<'select' | 'move' | 'resize'>('select');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showConstraintDialog, setShowConstraintDialog] = useState(false);
  const [justificationText, setJustificationText] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType | null>(null);

  // Get available floors
  const availableFloors = blenderGeometry?.measurements.floors || [];
  const currentFloorData = availableFloors.find(f => f.floor_number === currentFloor);

  // ============================================================================
  // CANVAS INITIALIZATION
  // ============================================================================

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: blenderGeometry?.fabric_projection.canvas_width || 800,
      height: blenderGeometry?.fabric_projection.canvas_height || 600,
      backgroundColor: '#ffffff',
      selection: false,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;

    return () => {
      canvas.dispose();
    };
  }, [blenderGeometry?.fabric_projection.canvas_width, blenderGeometry?.fabric_projection.canvas_height]);

  // ============================================================================
  // RENDER GEOMETRY
  // ============================================================================

  const renderGeometry = useCallback(() => {
    if (!fabricCanvasRef.current || !blenderGeometry) return;

    const canvas = fabricCanvasRef.current;
    const scale = blenderGeometry.fabric_projection.scale_pixels_per_meter;
    const floorProjection = blenderGeometry.fabric_projection.floor_projections.find(
      fp => fp.floor_number === currentFloor
    );

    if (!floorProjection) return;

    // Clear canvas
    canvas.clear();
    canvas.setBackgroundColor('#ffffff', () => {});

    // Render grid
    renderGrid(canvas, scale);

    // Render rooms
    for (const obj of floorProjection.objects.filter(o => o.element_type === 'room')) {
      const roomGeom = blenderGeometry.rooms.find(r => r.room_id === obj.element_id);
      const roomType = roomGeom?.room_type || 'other';
      const props = obj.fabric_properties;

      const roomFill = ROOM_COLORS[roomType] || ROOM_COLORS.other;

      let fabricObj: fabric.Object;

      if (obj.type === 'polygon' && props.points) {
        fabricObj = new fabric.Polygon(props.points as Array<{ x: number; y: number }>, {
          fill: roomFill,
          stroke: '#9CA3AF',
          strokeWidth: 1,
          selectable: !readonly && activeTool !== 'select',
          evented: true,
          opacity: 0.8,
          hasControls: activeTool === 'resize',
          hasBorders: true,
          lockRotation: true,
          ...props,
        });
      } else if (obj.type === 'rect') {
        fabricObj = new fabric.Rect({
          fill: roomFill,
          stroke: '#9CA3AF',
          strokeWidth: 1,
          selectable: !readonly && activeTool !== 'select',
          evented: true,
          opacity: 0.8,
          hasControls: activeTool === 'resize',
          hasBorders: true,
          lockRotation: true,
          left: (props.left as number) || 0,
          top: (props.top as number) || 0,
          width: (props.width as number) || 100,
          height: (props.height as number) || 100,
          ...props,
        });
      } else {
        continue;
      }

      // Attach metadata
      (fabricObj as any).elementId = obj.element_id;
      (fabricObj as any).elementType = 'room';
      (fabricObj as any).roomType = roomType;
      (fabricObj as any).originalLeft = fabricObj.left;
      (fabricObj as any).originalTop = fabricObj.top;
      (fabricObj as any).originalWidth = (fabricObj as any).width || 100;
      (fabricObj as any).originalHeight = (fabricObj as any).height || 100;

      canvas.add(fabricObj);
    }

    // Render walls
    for (const obj of floorProjection.objects.filter(o => o.element_type === 'wall')) {
      const wallGeom = blenderGeometry.walls.find(w => w.wall_id === obj.element_id);
      const props = obj.fabric_properties;
      const isExternal = wallGeom?.wall_type === 'external';
      const wallColor = isExternal ? '#374151' : '#6B7280';

      if (obj.type === 'line') {
        const line = new fabric.Line(
          [
            (props.x1 as number) || 0,
            (props.y1 as number) || 0,
            (props.x2 as number) || 100,
            (props.y2 as number) || 0,
          ],
          {
            stroke: wallColor,
            strokeWidth: wallGeom ? wallGeom.thickness_mm / 10 : 15,
            selectable: !readonly && !isExternal && activeTool !== 'select',
            evented: true,
            strokeLineCap: 'round',
            hasControls: false,
          }
        );

        (line as any).elementId = obj.element_id;
        (line as any).elementType = 'wall';
        (line as any).isStructural = wallGeom?.is_structural;
        (line as any).wallType = wallGeom?.wall_type;

        canvas.add(line);
      }
    }

    // Render labels
    if (showLabels) {
      for (const room of blenderGeometry.rooms.filter(r => r.floor_number === currentFloor)) {
        const measurement = blenderGeometry.measurements.rooms.find(m => m.room_id === room.room_id);
        if (!measurement) continue;

        const centerX = room.centroid.x * scale;
        const centerY = room.centroid.y * scale;

        const label = new fabric.Text(room.room_name || room.room_type, {
          left: centerX,
          top: centerY - 8,
          fontSize: 11,
          fontFamily: 'Inter, sans-serif',
          fontWeight: '600',
          fill: '#1F2937',
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });

        const areaLabel = new fabric.Text(`${measurement.area_sqm.toFixed(1)} m²`, {
          left: centerX,
          top: centerY + 8,
          fontSize: 9,
          fontFamily: 'Inter, sans-serif',
          fill: '#6B7280',
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });

        canvas.add(label);
        canvas.add(areaLabel);
      }
    }

    canvas.renderAll();
  }, [blenderGeometry, currentFloor, readonly, activeTool, showLabels]);

  // Re-render when geometry or settings change
  useEffect(() => {
    renderGeometry();
  }, [renderGeometry, showDimensions]);

  // ============================================================================
  // CANVAS EVENT HANDLERS
  // ============================================================================

  useEffect(() => {
    if (!fabricCanvasRef.current || readonly) return;

    const canvas = fabricCanvasRef.current;

    // Selection handler
    const handleSelection = (e: fabric.IEvent) => {
      const target = e.target;
      if (target && (target as any).elementId) {
        setSelectedElement((target as any).elementId);
        setSelectedElementType((target as any).elementType);

        // Highlight selected
        target.set({
          stroke: '#2563EB',
          strokeWidth: 3,
        });
        canvas.renderAll();
      }
    };

    // Deselection handler
    const handleDeselection = () => {
      setSelectedElement(null);
      setSelectedElementType(null);
      renderGeometry(); // Reset styling
    };

    // Movement handler - records delta
    const handleModified = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || !(target as any).elementId) return;

      const elementId = (target as any).elementId;
      const elementType = (target as any).elementType;
      const originalLeft = (target as any).originalLeft || 0;
      const originalTop = (target as any).originalTop || 0;

      // Calculate delta in meters
      const scale = blenderGeometry?.fabric_projection.scale_pixels_per_meter || 20;
      const deltaX = ((target.left || 0) - originalLeft) / scale;
      const deltaY = ((target.top || 0) - originalTop) / scale;

      // Only record if there's actual movement
      if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
        const delta: AdjustmentDelta = {
          delta_id: generateUUID(),
          element_id: elementId,
          element_type: elementType,
          operation: 'move',
          delta_x: deltaX,
          delta_y: deltaY,
          original_value: {
            x: originalLeft / scale,
            y: originalTop / scale,
          },
          new_value: {
            x: (target.left || 0) / scale,
            y: (target.top || 0) / scale,
          },
          timestamp: new Date().toISOString(),
        };

        setPendingAdjustments(prev => [...prev, delta]);

        // Update original position for next delta
        (target as any).originalLeft = target.left;
        (target as any).originalTop = target.top;
      }
    };

    // Scaling handler - records resize delta
    const handleScaled = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || !(target as any).elementId) return;

      const elementId = (target as any).elementId;
      const elementType = (target as any).elementType;
      const originalWidth = (target as any).originalWidth || 100;
      const originalHeight = (target as any).originalHeight || 100;

      const newWidth = ((target as any).width || 100) * (target.scaleX || 1);
      const newHeight = ((target as any).height || 100) * (target.scaleY || 1);

      const scale = blenderGeometry?.fabric_projection.scale_pixels_per_meter || 20;
      const deltaWidth = (newWidth - originalWidth) / scale;
      const deltaHeight = (newHeight - originalHeight) / scale;

      if (Math.abs(deltaWidth) > 0.01 || Math.abs(deltaHeight) > 0.01) {
        const delta: AdjustmentDelta = {
          delta_id: generateUUID(),
          element_id: elementId,
          element_type: elementType,
          operation: 'resize',
          delta_length: deltaWidth, // Using length for width
          delta_area: (deltaWidth * newHeight + deltaHeight * newWidth) / scale,
          original_value: {
            width: originalWidth / scale,
            height: originalHeight / scale,
          },
          new_value: {
            width: newWidth / scale,
            height: newHeight / scale,
          },
          timestamp: new Date().toISOString(),
        };

        setPendingAdjustments(prev => [...prev, delta]);
      }
    };

    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', handleDeselection);
    canvas.on('object:modified', handleModified);
    canvas.on('object:scaled', handleScaled);

    return () => {
      canvas.off('selection:created', handleSelection);
      canvas.off('selection:updated', handleSelection);
      canvas.off('selection:cleared', handleDeselection);
      canvas.off('object:modified', handleModified);
      canvas.off('object:scaled', handleScaled);
    };
  }, [blenderGeometry, readonly, renderGeometry]);

  // ============================================================================
  // CONSTRAINT CHECKING
  // ============================================================================

  const checkConstraintViolation = useCallback(
    (delta: AdjustmentDelta): string | null => {
      if (!blenderGeometry) return null;

      // Check room minimum sizes
      if (delta.element_type === 'room' && delta.operation === 'resize') {
        const roomMeasurement = blenderGeometry.measurements.rooms.find(
          r => r.room_id === delta.element_id
        );

        if (roomMeasurement) {
          const newArea = roomMeasurement.area_sqm + (delta.delta_area || 0);
          if (newArea < roomMeasurement.minimum_required_sqm) {
            return `Room would be below minimum size (${roomMeasurement.minimum_required_sqm} m² required)`;
          }
        }
      }

      // Check wall movement constraints
      if (delta.element_type === 'wall' && delta.operation === 'move') {
        const wall = blenderGeometry.walls.find(w => w.wall_id === delta.element_id);
        if (wall?.is_structural || wall?.wall_type === 'external') {
          return 'Cannot move structural or external walls';
        }
      }

      return null;
    },
    [blenderGeometry]
  );

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleApplyAdjustments = async () => {
    if (pendingAdjustments.length === 0) return;

    // Validate justification
    if (justificationText.trim().length < 10) {
      setShowConstraintDialog(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const adjustmentRequest: UserAdjustmentDeltas = {
        adjustment_id: generateUUID(),
        valuation_id: valuationId,
        base_geometry_version: blenderGeometry?.version || '',
        adjustments: pendingAdjustments,
        timestamp: new Date().toISOString(),
        justification: justificationText.trim(),
      };

      await onAdjustmentSubmit(adjustmentRequest);
      
      // Clear pending adjustments on success
      setPendingAdjustments([]);
      setJustificationText('');
      setShowConstraintDialog(false);
    } catch (error) {
      console.error('Failed to submit adjustments:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscardAdjustments = () => {
    setPendingAdjustments([]);
    setJustificationText('');
    renderGeometry(); // Reset to original positions
  };

  const handleUndoLastAdjustment = () => {
    setPendingAdjustments(prev => prev.slice(0, -1));
    renderGeometry();
  };

  const handleChangeRoomType = () => {
    if (!selectedElement || !newRoomType) return;

    const delta: AdjustmentDelta = {
      delta_id: generateUUID(),
      element_id: selectedElement,
      element_type: 'room',
      operation: 'change_type',
      new_type: newRoomType,
      original_value: {
        room_type: blenderGeometry?.rooms.find(r => r.room_id === selectedElement)?.room_type,
      },
      new_value: {
        room_type: newRoomType,
      },
      timestamp: new Date().toISOString(),
    };

    setPendingAdjustments(prev => [...prev, delta]);
    setNewRoomType(null);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!blenderGeometry) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="flex items-center justify-center h-[600px]">
          <div className="text-center text-gray-500">
            <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No geometry available</p>
            <p className="text-sm">Generate a design intent first</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Toolbar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            {/* Tool buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant={activeTool === 'select' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTool('select')}
                disabled={readonly}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <Button
                variant={activeTool === 'move' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTool('move')}
                disabled={readonly}
              >
                <Move className="h-4 w-4 mr-1" />
                Adjust Walls
              </Button>
              <Button
                variant={activeTool === 'resize' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTool('resize')}
                disabled={readonly}
              >
                <Maximize2 className="h-4 w-4 mr-1" />
                Resize Room
              </Button>

              <Separator orientation="vertical" className="h-6" />

              {/* Display toggles */}
              <Button
                variant={showLabels ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowLabels(!showLabels)}
              >
                <Type className="h-4 w-4" />
              </Button>
              <Button
                variant={showDimensions ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowDimensions(!showDimensions)}
              >
                <Ruler className="h-4 w-4" />
              </Button>
            </div>

            {/* Floor selector */}
            <div className="flex items-center gap-2">
              <Label className="text-sm">Floor:</Label>
              <Select
                value={currentFloor.toString()}
                onValueChange={(v) => setCurrentFloor(parseInt(v, 10))}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableFloors.map((floor) => (
                    <SelectItem key={floor.floor_number} value={floor.floor_number.toString()}>
                      {floor.floor_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Measurements summary */}
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-gray-500">GFA:</span>{' '}
                <span className="font-medium">
                  {blenderGeometry.measurements.gfa_sqm.toFixed(1)} m²
                </span>
              </div>
              <div>
                <span className="text-gray-500">NIA:</span>{' '}
                <span className="font-medium">
                  {blenderGeometry.measurements.nia_sqm.toFixed(1)} m²
                </span>
              </div>
              <div>
                <span className="text-gray-500">Efficiency:</span>{' '}
                <span className="font-medium">
                  {(blenderGeometry.measurements.efficiency_ratio * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canvas */}
      <div ref={containerRef} className="relative border rounded-lg overflow-hidden bg-white">
        <canvas ref={canvasRef} />

        {/* Floor indicator */}
        <div className="absolute top-2 left-2 bg-white/90 px-3 py-1 rounded-md shadow-sm text-sm font-medium">
          {currentFloorData?.floor_label || `Floor ${currentFloor}`}
        </div>

        {/* Readonly indicator */}
        {readonly && (
          <div className="absolute top-2 right-2 bg-gray-100 px-3 py-1 rounded-md shadow-sm flex items-center gap-1 text-sm">
            <Lock className="h-3 w-3" />
            View Only
          </div>
        )}
      </div>

      {/* Selected element panel */}
      {selectedElement && selectedElementType && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Selected: {selectedElementType}</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex items-center gap-4">
              <Badge variant="outline">{selectedElement}</Badge>

              {selectedElementType === 'room' && !readonly && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Change Type:</Label>
                  <Select
                    value={newRoomType || ''}
                    onValueChange={(v) => setNewRoomType(v as RoomType)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!newRoomType}
                    onClick={handleChangeRoomType}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending adjustments panel */}
      {pendingAdjustments.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Pending Adjustments ({pendingAdjustments.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndoLastAdjustment}
                  disabled={pendingAdjustments.length === 0}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscardAdjustments}
                >
                  <X className="h-4 w-4 mr-1" />
                  Discard All
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowConstraintDialog(true)}
                  disabled={isSubmitting}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Apply & Regenerate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {pendingAdjustments.map((adj, idx) => {
                const violation = checkConstraintViolation(adj);
                return (
                  <div
                    key={adj.delta_id}
                    className={cn(
                      'text-xs p-2 rounded',
                      violation ? 'bg-red-100 text-red-800' : 'bg-white'
                    )}
                  >
                    <span className="font-medium">{adj.operation}</span>: {adj.element_type}{' '}
                    {adj.element_id.slice(0, 8)}...
                    {adj.delta_x !== undefined && (
                      <span className="ml-2">
                        ΔX: {adj.delta_x.toFixed(2)}m, ΔY: {adj.delta_y?.toFixed(2)}m
                      </span>
                    )}
                    {violation && (
                      <span className="ml-2 text-red-600">⚠ {violation}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Justification Dialog */}
      <Dialog open={showConstraintDialog} onOpenChange={setShowConstraintDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justify Adjustments</DialogTitle>
            <DialogDescription>
              Explain why you're making these adjustments. This will be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="justification">Justification (min. 10 characters)</Label>
            <Textarea
              id="justification"
              value={justificationText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJustificationText(e.target.value)}
              placeholder="e.g., Client requested larger master bedroom, corridor width optimized for wheelchair access..."
              className="mt-2"
              rows={3}
            />
            {justificationText.length > 0 && justificationText.length < 10 && (
              <p className="text-xs text-red-500 mt-1">
                Please provide at least 10 characters of justification.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConstraintDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyAdjustments}
              disabled={justificationText.trim().length < 10 || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Apply Adjustments
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// HELPER: RENDER GRID
// ============================================================================

function renderGrid(canvas: fabric.Canvas, scalePixelsPerMeter: number) {
  const width = canvas.getWidth() || 800;
  const height = canvas.getHeight() || 600;

  // Minor grid (10cm)
  const minorSpacing = scalePixelsPerMeter / 10;
  for (let x = 0; x < width; x += minorSpacing) {
    canvas.add(
      new fabric.Line([x, 0, x, height], {
        stroke: '#F3F4F6',
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
      })
    );
  }
  for (let y = 0; y < height; y += minorSpacing) {
    canvas.add(
      new fabric.Line([0, y, width, y], {
        stroke: '#F3F4F6',
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
      })
    );
  }

  // Major grid (1m)
  for (let x = 0; x < width; x += scalePixelsPerMeter) {
    canvas.add(
      new fabric.Line([x, 0, x, height], {
        stroke: '#E5E7EB',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      })
    );
  }
  for (let y = 0; y < height; y += scalePixelsPerMeter) {
    canvas.add(
      new fabric.Line([0, y, width, y], {
        stroke: '#E5E7EB',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      })
    );
  }
}
