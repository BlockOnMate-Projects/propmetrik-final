'use client';

/**
 * Constrained Floor Plan Builder — Konva Edition
 *
 * Renders Blender geometry with constrained adjustments using Konva + react-konva.
 * Only deltas are recorded — no freehand drawing — all changes trigger Blender regeneration.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva';
import Konva from 'konva';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Move, Maximize2, RefreshCw, Check, X, AlertTriangle,
  Undo2, Lock, Eye, Ruler, Type, Layers,
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

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ============================================================================
// CONSTANTS
// ============================================================================

type ExtendedRoomType = RoomType | 'master_bedroom' | 'entrance' | 'utility' | 'terrace' | 'staircase' | 'other' | 'porch';

const ROOM_COLORS: Record<ExtendedRoomType | string, string> = {
  living: '#FEF3C7', dining: '#FDE68A', kitchen: '#FCD34D',
  bedroom: '#DBEAFE', master_bedroom: '#BFDBFE',
  bathroom: '#D1FAE5', toilet: '#A7F3D0',
  corridor: '#F3F4F6', storage: '#E5E7EB', entrance: '#EDE9FE',
  garage: '#D1D5DB', balcony: '#CFFAFE', terrace: '#A5F3FC',
  office: '#FCE7F3', laundry: '#E0E7FF', utility: '#F5F5F4',
  staircase: '#FEE2E2', porch: '#FEF9C3', other: '#F9FAFB',
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

const WALL_COLORS: Record<string, string> = {
  external: '#374151', internal: '#6B7280', partition: '#9CA3AF',
};

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
  const stageRef = useRef<Konva.Stage>(null);

  // State
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<string | null>(null);
  const [pendingAdjustments, setPendingAdjustments] = useState<AdjustmentDelta[]>([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [activeTool, setActiveTool] = useState<'select' | 'move' | 'resize'>('select');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showConstraintDialog, setShowConstraintDialog] = useState(false);
  const [justificationText, setJustificationText] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType | null>(null);

  // Track original positions for delta calculation
  const originalPositions = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const availableFloors = blenderGeometry?.measurements.floors || [];
  const currentFloorData = availableFloors.find(f => f.floor_number === currentFloor);

  const canvasWidth = blenderGeometry?.fabric_projection.canvas_width || 800;
  const canvasHeight = blenderGeometry?.fabric_projection.canvas_height || 600;
  const scale = blenderGeometry?.fabric_projection.scale_pixels_per_meter || 20;

  const floorProjection = blenderGeometry?.fabric_projection.floor_projections.find(
    fp => fp.floor_number === currentFloor
  );

  // ============================================================================
  // GRID (memoized)
  // ============================================================================

  const gridLines = useMemo(() => {
    const lines: { points: number[]; stroke: string; strokeWidth: number }[] = [];
    const minorSpacing = scale / 10;
    for (let x = 0; x < canvasWidth; x += minorSpacing) {
      lines.push({ points: [x, 0, x, canvasHeight], stroke: '#F3F4F6', strokeWidth: 0.5 });
    }
    for (let y = 0; y < canvasHeight; y += minorSpacing) {
      lines.push({ points: [0, y, canvasWidth, y], stroke: '#F3F4F6', strokeWidth: 0.5 });
    }
    for (let x = 0; x < canvasWidth; x += scale) {
      lines.push({ points: [x, 0, x, canvasHeight], stroke: '#E5E7EB', strokeWidth: 1 });
    }
    for (let y = 0; y < canvasHeight; y += scale) {
      lines.push({ points: [0, y, canvasWidth, y], stroke: '#E5E7EB', strokeWidth: 1 });
    }
    return lines;
  }, [canvasWidth, canvasHeight, scale]);

  // ============================================================================
  // ROOM / WALL ELEMENTS
  // ============================================================================

  const roomObjects = useMemo(() => {
    if (!floorProjection || !blenderGeometry) return [];
    return floorProjection.objects
      .filter(o => o.element_type === 'room')
      .map(obj => {
        const roomGeom = blenderGeometry.rooms.find(r => r.room_id === obj.element_id);
        const roomType = roomGeom?.room_type || 'other';
        const props = obj.fabric_properties;
        const isSelected = selectedElement === obj.element_id;
        return { obj, roomType, props, isSelected };
      });
  }, [floorProjection, blenderGeometry, selectedElement]);

  const wallObjects = useMemo(() => {
    if (!floorProjection || !blenderGeometry) return [];
    return floorProjection.objects
      .filter(o => o.element_type === 'wall')
      .map(obj => {
        const wallGeom = blenderGeometry.walls.find(w => w.wall_id === obj.element_id);
        const wallType = wallGeom?.wall_type || 'internal';
        const isExternal = wallType === 'external';
        const wallColor = WALL_COLORS[wallType] || WALL_COLORS.internal;
        const props = obj.fabric_properties;
        const isSelected = selectedElement === obj.element_id;
        return { obj, wallType, wallColor, isExternal, wallGeom, props, isSelected };
      });
  }, [floorProjection, blenderGeometry, selectedElement]);

  const roomLabels = useMemo(() => {
    if (!showLabels || !blenderGeometry || !floorProjection) return [];
    return blenderGeometry.rooms
      .filter(r => r.floor_number === floorProjection.floor_number)
      .map(room => {
        const measurement = blenderGeometry.measurements.rooms.find(m => m.room_id === room.room_id);
        if (!measurement) return null;
        return { room, measurement, cx: room.centroid.x * scale, cy: room.centroid.y * scale };
      })
      .filter(Boolean) as { room: typeof blenderGeometry.rooms[0]; measurement: typeof blenderGeometry.measurements.rooms[0]; cx: number; cy: number }[];
  }, [showLabels, blenderGeometry, floorProjection, scale]);

  // Store original positions when geometry loads
  useEffect(() => {
    if (!floorProjection) return;
    const pos: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const obj of floorProjection.objects) {
      const p = obj.fabric_properties;
      pos[obj.element_id] = {
        x: (p.left as number) || 0,
        y: (p.top as number) || 0,
        width: (p.width as number) || 100,
        height: (p.height as number) || 100,
      };
    }
    originalPositions.current = pos;
  }, [floorProjection]);

  // ============================================================================
  // DRAG / TRANSFORM HANDLERS
  // ============================================================================

  const handleDragEnd = useCallback((elementId: string, elementType: string, e: Konva.KonvaEventObject<DragEvent>) => {
    if (readonly || activeTool === 'select') return;
    const node = e.target;
    const orig = originalPositions.current[elementId];
    if (!orig) return;

    const deltaX = (node.x() - orig.x) / scale;
    const deltaY = (node.y() - orig.y) / scale;

    if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
      const delta: AdjustmentDelta = {
        delta_id: generateUUID(),
        element_id: elementId,
        element_type: elementType as 'wall' | 'room' | 'opening',
        operation: 'move',
        delta_x: deltaX,
        delta_y: deltaY,
        original_value: { x: orig.x / scale, y: orig.y / scale },
        new_value: { x: node.x() / scale, y: node.y() / scale },
        timestamp: new Date().toISOString(),
      };
      setPendingAdjustments(prev => [...prev, delta]);
      originalPositions.current[elementId] = { ...orig, x: node.x(), y: node.y() };
    }
  }, [readonly, activeTool, scale]);

  const handleTransformEnd = useCallback((elementId: string, elementType: string, e: Konva.KonvaEventObject<Event>) => {
    if (readonly || activeTool !== 'resize') return;
    const node = e.target;
    const orig = originalPositions.current[elementId];
    if (!orig) return;

    const newWidth = node.width() * node.scaleX();
    const newHeight = node.height() * node.scaleY();
    const deltaWidth = (newWidth - orig.width) / scale;
    const deltaHeight = (newHeight - orig.height) / scale;

    if (Math.abs(deltaWidth) > 0.01 || Math.abs(deltaHeight) > 0.01) {
      const delta: AdjustmentDelta = {
        delta_id: generateUUID(),
        element_id: elementId,
        element_type: elementType as 'wall' | 'room' | 'opening',
        operation: 'resize',
        delta_length: deltaWidth,
        delta_area: (deltaWidth * newHeight + deltaHeight * newWidth) / scale,
        original_value: { width: orig.width / scale, height: orig.height / scale },
        new_value: { width: newWidth / scale, height: newHeight / scale },
        timestamp: new Date().toISOString(),
      };
      setPendingAdjustments(prev => [...prev, delta]);
    }

    // Reset scale, apply to width/height
    node.scaleX(1);
    node.scaleY(1);
    node.width(newWidth);
    node.height(newHeight);
  }, [readonly, activeTool, scale]);

  // ============================================================================
  // CONSTRAINT CHECKING
  // ============================================================================

  const checkConstraintViolation = useCallback((delta: AdjustmentDelta): string | null => {
    if (!blenderGeometry) return null;
    if (delta.element_type === 'room' && delta.operation === 'resize') {
      const roomMeasurement = blenderGeometry.measurements.rooms.find(r => r.room_id === delta.element_id);
      if (roomMeasurement) {
        const newArea = roomMeasurement.area_sqm + (delta.delta_area || 0);
        if (newArea < roomMeasurement.minimum_required_sqm)
          return `Room would be below minimum size (${roomMeasurement.minimum_required_sqm} m² required)`;
      }
    }
    if (delta.element_type === 'wall' && delta.operation === 'move') {
      const wall = blenderGeometry.walls.find(w => w.wall_id === delta.element_id);
      if (wall?.is_structural || wall?.wall_type === 'external')
        return 'Cannot move structural or external walls';
    }
    return null;
  }, [blenderGeometry]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleApplyAdjustments = async () => {
    if (pendingAdjustments.length === 0) return;
    if (justificationText.trim().length < 10) { setShowConstraintDialog(true); return; }
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
  };

  const handleUndoLastAdjustment = () => {
    setPendingAdjustments(prev => prev.slice(0, -1));
  };

  const handleChangeRoomType = () => {
    if (!selectedElement || !newRoomType) return;
    const delta: AdjustmentDelta = {
      delta_id: generateUUID(),
      element_id: selectedElement,
      element_type: 'room',
      operation: 'change_type',
      new_type: newRoomType,
      original_value: { room_type: blenderGeometry?.rooms.find(r => r.room_id === selectedElement)?.room_type },
      new_value: { room_type: newRoomType },
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
          <div className="text-center text-muted-foreground">
            <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No geometry available</p>
            <p className="text-sm">Generate a design intent first</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isDraggable = !readonly && (activeTool === 'move' || activeTool === 'resize');

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Toolbar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant={activeTool === 'select' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTool('select')} disabled={readonly}>
                <Eye className="h-4 w-4 mr-1" />View
              </Button>
              <Button variant={activeTool === 'move' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTool('move')} disabled={readonly}>
                <Move className="h-4 w-4 mr-1" />Adjust Walls
              </Button>
              <Button variant={activeTool === 'resize' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTool('resize')} disabled={readonly}>
                <Maximize2 className="h-4 w-4 mr-1" />Resize Room
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <Button variant={showLabels ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowLabels(!showLabels)}>
                <Type className="h-4 w-4" />
              </Button>
              <Button variant={showDimensions ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowDimensions(!showDimensions)}>
                <Ruler className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm">Floor:</Label>
              <Select value={currentFloor.toString()} onValueChange={(v) => setCurrentFloor(parseInt(v, 10))}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableFloors.map((floor) => (
                    <SelectItem key={floor.floor_number} value={floor.floor_number.toString()}>{floor.floor_label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div><span className="text-muted-foreground">GFA:</span> <span className="font-medium">{blenderGeometry.measurements.gfa_sqm.toFixed(1)} m²</span></div>
              <div><span className="text-muted-foreground">NIA:</span> <span className="font-medium">{blenderGeometry.measurements.nia_sqm.toFixed(1)} m²</span></div>
              <div><span className="text-muted-foreground">Efficiency:</span> <span className="font-medium">{(blenderGeometry.measurements.efficiency_ratio * 100).toFixed(1)}%</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canvas */}
      <div className="relative border rounded-lg overflow-hidden bg-card">
        <Stage ref={stageRef} width={canvasWidth} height={canvasHeight}>
          {/* Grid */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#ffffff" />
            {gridLines.map((line, i) => (
              <Line key={i} points={line.points} stroke={line.stroke} strokeWidth={line.strokeWidth} />
            ))}
          </Layer>

          {/* Rooms */}
          <Layer>
            {roomObjects.map(({ obj, roomType, props, isSelected }) => {
              const x = (props.left as number) || 0;
              const y = (props.top as number) || 0;
              const w = (props.width as number) || 100;
              const h = (props.height as number) || 100;

              if (obj.type === 'polygon' && props.points) {
                const pts = (props.points as { x: number; y: number }[]).flatMap(p => [p.x, p.y]);
                return (
                  <Line
                    key={obj.element_id}
                    points={pts}
                    closed
                    fill={ROOM_COLORS[roomType] || ROOM_COLORS.other}
                    stroke={isSelected ? '#2563EB' : '#9CA3AF'}
                    strokeWidth={isSelected ? 3 : 1}
                    opacity={0.8}
                    draggable={isDraggable}
                    onClick={() => { setSelectedElement(obj.element_id); setSelectedElementType('room'); }}
                    onDragEnd={(e) => handleDragEnd(obj.element_id, 'room', e)}
                  />
                );
              }

              return (
                <Rect
                  key={obj.element_id}
                  x={x} y={y} width={w} height={h}
                  fill={ROOM_COLORS[roomType] || ROOM_COLORS.other}
                  stroke={isSelected ? '#2563EB' : '#9CA3AF'}
                  strokeWidth={isSelected ? 3 : 1}
                  opacity={0.8}
                  draggable={isDraggable}
                  onClick={() => { setSelectedElement(obj.element_id); setSelectedElementType('room'); }}
                  onDragEnd={(e) => handleDragEnd(obj.element_id, 'room', e)}
                  onTransformEnd={(e) => handleTransformEnd(obj.element_id, 'room', e)}
                />
              );
            })}
          </Layer>

          {/* Walls */}
          <Layer>
            {wallObjects.map(({ obj, wallColor, isExternal, wallGeom, props, isSelected }) => {
              if (obj.type === 'line') {
                return (
                  <Line
                    key={obj.element_id}
                    points={[
                      (props.x1 as number) || 0, (props.y1 as number) || 0,
                      (props.x2 as number) || 100, (props.y2 as number) || 0,
                    ]}
                    stroke={isSelected ? '#2563EB' : wallColor}
                    strokeWidth={isSelected ? 3 : (wallGeom ? wallGeom.thickness_mm / 10 : 15)}
                    lineCap="round"
                    draggable={isDraggable && !isExternal && !(wallGeom?.is_structural)}
                    onClick={() => { setSelectedElement(obj.element_id); setSelectedElementType('wall'); }}
                    onDragEnd={(e) => handleDragEnd(obj.element_id, 'wall', e)}
                  />
                );
              }
              return null;
            })}
          </Layer>

          {/* Labels */}
          <Layer listening={false}>
            {roomLabels.map(({ room, measurement, cx, cy }) => (
              <React.Fragment key={room.room_id}>
                <Text x={cx} y={cy - 8} text={room.room_name || room.room_type}
                  fontSize={11} fontFamily="Inter, sans-serif" fontStyle="bold"
                  fill="#1F2937" align="center" offsetX={35} />
                <Text x={cx} y={cy + 8} text={`${measurement.area_sqm.toFixed(1)} m²`}
                  fontSize={9} fontFamily="Inter, sans-serif" fill="#6B7280"
                  align="center" offsetX={20} />
              </React.Fragment>
            ))}
          </Layer>
        </Stage>

        {/* Floor indicator */}
        <div className="absolute top-2 left-2 bg-card/90 px-3 py-1 rounded-md shadow-sm text-sm font-medium">
          {currentFloorData?.floor_label || `Floor ${currentFloor}`}
        </div>

        {readonly && (
          <div className="absolute top-2 right-2 bg-muted px-3 py-1 rounded-md shadow-sm flex items-center gap-1 text-sm">
            <Lock className="h-3 w-3" />View Only
          </div>
        )}
      </div>

      {/* Selected element panel */}
      {selectedElement && selectedElementType && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Selected: {selectedElementType}</CardTitle></CardHeader>
          <CardContent className="py-2">
            <div className="flex items-center gap-4">
              <Badge variant="outline">{selectedElement}</Badge>
              {selectedElementType === 'room' && !readonly && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Change Type:</Label>
                  <Select value={newRoomType || ''} onValueChange={(v) => setNewRoomType(v as RoomType)}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!newRoomType} onClick={handleChangeRoomType}>Apply</Button>
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
                <Button variant="ghost" size="sm" onClick={handleUndoLastAdjustment} disabled={pendingAdjustments.length === 0}>
                  <Undo2 className="h-4 w-4 mr-1" />Undo
                </Button>
                <Button variant="outline" size="sm" onClick={handleDiscardAdjustments}>
                  <X className="h-4 w-4 mr-1" />Discard All
                </Button>
                <Button size="sm" onClick={() => setShowConstraintDialog(true)} disabled={isSubmitting}>
                  <Check className="h-4 w-4 mr-1" />Apply & Regenerate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {pendingAdjustments.map((adj) => {
                const violation = checkConstraintViolation(adj);
                return (
                  <div key={adj.delta_id} className={cn('text-xs p-2 rounded', violation ? 'bg-red-100 text-red-800' : 'bg-card')}>
                    <span className="font-medium">{adj.operation}</span>: {adj.element_type} {adj.element_id.slice(0, 8)}...
                    {adj.delta_x !== undefined && (
                      <span className="ml-2">ΔX: {adj.delta_x.toFixed(2)}m, ΔY: {adj.delta_y?.toFixed(2)}m</span>
                    )}
                    {violation && <span className="ml-2 text-red-600">⚠ {violation}</span>}
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
            <DialogDescription>Explain why you're making these adjustments. This will be logged for audit purposes.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="justification">Justification (min. 10 characters)</Label>
            <Textarea id="justification" value={justificationText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJustificationText(e.target.value)}
              placeholder="e.g., Client requested larger master bedroom, corridor width optimized for wheelchair access..."
              className="mt-2" rows={3} />
            {justificationText.length > 0 && justificationText.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Please provide at least 10 characters of justification.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConstraintDialog(false)}>Cancel</Button>
            <Button onClick={handleApplyAdjustments} disabled={justificationText.trim().length < 10 || isSubmitting}>
              {isSubmitting ? (<><RefreshCw className="h-4 w-4 mr-1 animate-spin" />Regenerating...</>) : (<><Check className="h-4 w-4 mr-1" />Apply Adjustments</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
