'use client';

/**
 * Floor Plan Builder Component — Konva Edition
 *
 * Interactive floor plan creation using Konva + react-konva for property valuation.
 * Draw rooms (rectangle / polygon), measure areas, classify room types, export.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Stage, Layer, Rect, Line, Text, Circle, Group } from 'react-konva';
import Konva from 'konva';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Pencil, Square, Move, Trash2, Download, Upload, Grid3X3,
  ZoomIn, ZoomOut, RotateCcw, Ruler, Home, Bath, UtensilsCrossed,
  Sofa, Bed, ArchiveRestore, DoorOpen,
} from 'lucide-react';

// =====================================================
// TYPES
// =====================================================

export type RoomType =
  | 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining'
  | 'storage' | 'corridor' | 'porch' | 'garage' | 'laundry' | 'office';

export interface Point { x: number; y: number; }

export interface RoomMeasurement {
  id: string;
  roomName: string;
  roomType: RoomType;
  area: number;
  dimensions: { length: number; width: number; height?: number; };
  coordinates: Point[];
  adjacentRooms: string[];
}

export interface FloorPlanSpecs {
  totalBuiltArea: number;
  usableArea: number;
  rooms: RoomMeasurement[];
  buildingEfficiency: number;
  layoutQualityScore: number;
}

export interface PropertyMeasurements {
  builtArea: number;
  usableArea: number;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  livingAreas: number;
  buildingEfficiency: number;
  layoutQualityScore: number;
  roomBreakdown: RoomMeasurement[];
  floorPlanData: string;
  validationResults?: {
    isComplete: boolean;
    issues: string[];
    recommendations: string[];
    readiness: number;
  };
}

interface FloorPlanBuilderProps {
  onMeasurementsChange?: (measurements: PropertyMeasurements) => void;
  initialFloorPlan?: string | object;
  readonly?: boolean;
  width?: number;
  height?: number;
}

// =====================================================
// CONSTANTS
// =====================================================

const ROOM_COLORS: Record<RoomType, string> = {
  bedroom: 'rgba(147, 197, 253, 0.4)',
  bathroom: 'rgba(167, 243, 208, 0.4)',
  kitchen: 'rgba(253, 224, 71, 0.4)',
  living: 'rgba(252, 211, 77, 0.4)',
  dining: 'rgba(251, 191, 36, 0.4)',
  storage: 'rgba(209, 213, 219, 0.4)',
  corridor: 'rgba(229, 231, 235, 0.4)',
  porch: 'rgba(196, 181, 253, 0.4)',
  garage: 'rgba(156, 163, 175, 0.4)',
  laundry: 'rgba(147, 197, 253, 0.4)',
  office: 'rgba(254, 202, 202, 0.4)',
};

const ROOM_ICONS: Record<RoomType, React.ReactNode> = {
  bedroom: <Bed className="h-4 w-4" />,
  bathroom: <Bath className="h-4 w-4" />,
  kitchen: <UtensilsCrossed className="h-4 w-4" />,
  living: <Sofa className="h-4 w-4" />,
  dining: <UtensilsCrossed className="h-4 w-4" />,
  storage: <ArchiveRestore className="h-4 w-4" />,
  corridor: <DoorOpen className="h-4 w-4" />,
  porch: <Home className="h-4 w-4" />,
  garage: <Square className="h-4 w-4" />,
  laundry: <Square className="h-4 w-4" />,
  office: <Square className="h-4 w-4" />,
};

const MINIMUM_ROOM_SIZES: Record<RoomType, number> = {
  bedroom: 9, bathroom: 3, kitchen: 4, living: 12, dining: 8,
  storage: 1, corridor: 1, porch: 2, garage: 15, laundry: 3, office: 6,
};

// =====================================================
// COMPONENT
// =====================================================

export default function FloorPlanBuilder({
  onMeasurementsChange,
  initialFloorPlan,
  readonly = false,
  width = 1000,
  height = 700,
}: FloorPlanBuilderProps) {
  const stageRef = useRef<Konva.Stage>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [rooms, setRooms] = useState<RoomMeasurement[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [scale, setScale] = useState(100);
  const [gridSize, setGridSize] = useState(10);
  const [snapMode, setSnapMode] = useState<'grid' | 'none'>('grid');
  const [tool, setTool] = useState<'select' | 'rectangle' | 'polygon'>('rectangle');
  const [zoom, setZoom] = useState(1);

  // Room dialog
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<{
    points: Point[];
    area: number;
    dimensions: { length: number; width: number };
  } | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType>('bedroom');

  // Load initial floor plan
  useEffect(() => {
    if (!initialFloorPlan) return;
    try {
      const parsed = typeof initialFloorPlan === 'string' ? JSON.parse(initialFloorPlan) : initialFloorPlan;
      if (parsed.rooms) setRooms(parsed.rooms);
      if (parsed.scale) setScale(parsed.scale);
      if (parsed.gridSize) setGridSize(parsed.gridSize);
    } catch (err) {
      console.error('Failed to load floor plan:', err);
    }
  }, [initialFloorPlan]);

  // =====================================================
  // HELPERS
  // =====================================================

  const snapPointToGrid = useCallback((point: Point): Point => {
    if (snapMode !== 'grid') return point;
    const gridSpacing = (gridSize / 100) * scale;
    return {
      x: Math.round(point.x / gridSpacing) * gridSpacing,
      y: Math.round(point.y / gridSpacing) * gridSpacing,
    };
  }, [snapMode, gridSize, scale]);

  const calculatePolygonArea = (points: Point[]): number => {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;
    return area / (scale * scale);
  };

  const calculateRoomDimensions = (points: Point[]) => {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      length: (Math.max(...xs) - Math.min(...xs)) / scale,
      width: (Math.max(...ys) - Math.min(...ys)) / scale,
    };
  };

  const getPointerPos = useCallback((e: Konva.KonvaEventObject<MouseEvent>): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const pos = stage.getPointerPosition();
    if (!pos) return { x: 0, y: 0 };
    return { x: pos.x / zoom, y: pos.y / zoom };
  }, [zoom]);

  // =====================================================
  // GRID (memoized)
  // =====================================================

  const gridLines = useMemo(() => {
    const lines: { points: number[]; stroke: string; strokeWidth: number }[] = [];
    const gridSpacing = (gridSize / 100) * scale;
    const majorSpacing = gridSpacing * 10;
    for (let x = 0; x <= width; x += gridSpacing) {
      const isMajor = Math.abs(x % majorSpacing) < 0.1;
      lines.push({
        points: [x, 0, x, height],
        stroke: isMajor ? '#d0d0d0' : '#e8e8e8',
        strokeWidth: isMajor ? 1 : 0.5,
      });
    }
    for (let y = 0; y <= height; y += gridSpacing) {
      const isMajor = Math.abs(y % majorSpacing) < 0.1;
      lines.push({
        points: [0, y, width, y],
        stroke: isMajor ? '#d0d0d0' : '#e8e8e8',
        strokeWidth: isMajor ? 1 : 0.5,
      });
    }
    return lines;
  }, [gridSize, scale, width, height]);

  // =====================================================
  // MOUSE HANDLERS
  // =====================================================

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readonly) return;
    const pos = snapPointToGrid(getPointerPos(e));

    if (tool === 'rectangle') {
      setStartPoint(pos);
      setIsDrawing(true);
    } else if (tool === 'polygon') {
      if (!isDrawing) {
        setIsDrawing(true);
        setCurrentPoints([pos]);
      } else {
        setCurrentPoints(prev => [...prev, pos]);
      }
    }
  }, [readonly, tool, isDrawing, snapPointToGrid, getPointerPos]);

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;
    const pos = snapPointToGrid(getPointerPos(e));
    setCurrentPoint(pos);
  }, [isDrawing, snapPointToGrid, getPointerPos]);

  const handleMouseUp = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || tool !== 'rectangle' || !startPoint) return;
    const pos = snapPointToGrid(getPointerPos(e));
    const w = Math.abs(pos.x - startPoint.x);
    const h = Math.abs(pos.y - startPoint.y);
    if (w > 10 && h > 10) {
      const left = Math.min(startPoint.x, pos.x);
      const top = Math.min(startPoint.y, pos.y);
      const right = Math.max(startPoint.x, pos.x);
      const bottom = Math.max(startPoint.y, pos.y);
      const points = [
        { x: left, y: top }, { x: right, y: top },
        { x: right, y: bottom }, { x: left, y: bottom },
      ];
      const area = calculatePolygonArea(points);
      const dimensions = calculateRoomDimensions(points);
      const existingCount = rooms.length;
      setPendingRoom({ points, area, dimensions });
      setNewRoomName(`Room ${existingCount + 1}`);
      setShowRoomDialog(true);
    }
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [isDrawing, tool, startPoint, snapPointToGrid, getPointerPos, rooms.length]);

  const handleDblClick = useCallback(() => {
    if (tool === 'polygon' && currentPoints.length >= 3) {
      const area = calculatePolygonArea(currentPoints);
      const dimensions = calculateRoomDimensions(currentPoints);
      setPendingRoom({ points: currentPoints, area, dimensions });
      setNewRoomName(`Polygon Room ${rooms.length + 1}`);
      setShowRoomDialog(true);
      setCurrentPoints([]);
      setIsDrawing(false);
      setCurrentPoint(null);
    }
  }, [tool, currentPoints, rooms.length]);

  // =====================================================
  // ROOM CREATE / CONFIRM / CANCEL
  // =====================================================

  const confirmRoom = () => {
    if (!pendingRoom) return;
    const roomId = `room_${Date.now()}`;
    const newRoom: RoomMeasurement = {
      id: roomId,
      roomName: newRoomName,
      roomType: newRoomType,
      area: Math.round(pendingRoom.area * 100) / 100,
      dimensions: {
        length: Math.round(pendingRoom.dimensions.length * 100) / 100,
        width: Math.round(pendingRoom.dimensions.width * 100) / 100,
      },
      coordinates: pendingRoom.points,
      adjacentRooms: [],
    };
    const updatedRooms = [...rooms, newRoom];
    setRooms(updatedRooms);
    setShowRoomDialog(false);
    setPendingRoom(null);
    setNewRoomName('');
    setNewRoomType('bedroom');
    setTool('select');
    updateMeasurements(updatedRooms);
  };

  const cancelRoom = () => {
    setShowRoomDialog(false);
    setPendingRoom(null);
    setNewRoomName('');
    setNewRoomType('bedroom');
  };

  // =====================================================
  // VALIDATION
  // =====================================================

  const validateBuildingPlan = useCallback((roomList: RoomMeasurement[]) => {
    const validation = { isComplete: false, issues: [] as string[], recommendations: [] as string[], readiness: 0 };
    const bedrooms = roomList.filter(r => r.roomType === 'bedroom').length;
    const bathrooms = roomList.filter(r => r.roomType === 'bathroom').length;
    const kitchens = roomList.filter(r => r.roomType === 'kitchen').length;
    const livingAreas = roomList.filter(r => r.roomType === 'living').length;
    if (bedrooms === 0) validation.issues.push('No bedrooms defined');
    if (bathrooms === 0) validation.issues.push('No bathrooms defined');
    if (kitchens === 0) validation.issues.push('No kitchen defined');
    if (livingAreas === 0) validation.issues.push('No living area defined');
    roomList.forEach(room => {
      const minSize = MINIMUM_ROOM_SIZES[room.roomType];
      if (room.area < minSize) validation.issues.push(`${room.roomName} (${room.area.toFixed(1)}m²) is below minimum ${minSize}m² for ${room.roomType}`);
    });
    const totalArea = roomList.reduce((sum, room) => sum + room.area, 0);
    if (totalArea < 30) validation.issues.push('Total built area is too small for accurate valuation (minimum 30m²)');
    const efficiency = totalArea > 0 ? roomList.filter(room => !['corridor', 'storage'].includes(room.roomType)).reduce((sum, room) => sum + room.area, 0) / totalArea : 0;
    if (efficiency < 0.7) validation.recommendations.push('Consider reducing corridor/storage space to improve efficiency');
    if (bedrooms > 0 && bathrooms / bedrooms < 0.5) validation.recommendations.push('Consider adding more bathrooms (ideal: 1 bathroom per 2 bedrooms)');
    let readinessScore = 0;
    if (bedrooms > 0) readinessScore += 25;
    if (bathrooms > 0) readinessScore += 25;
    if (kitchens > 0) readinessScore += 20;
    if (livingAreas > 0) readinessScore += 20;
    if (totalArea >= 30) readinessScore += 10;
    validation.readiness = readinessScore;
    validation.isComplete = validation.issues.length === 0 && readinessScore >= 90;
    return validation;
  }, []);

  // =====================================================
  // MEASUREMENTS
  // =====================================================

  const calculateLayoutQualityScore = (roomList: RoomMeasurement[]): number => {
    let score = 100;
    const bedrooms = roomList.filter(r => r.roomType === 'bedroom');
    const bathrooms = roomList.filter(r => r.roomType === 'bathroom');
    if (bedrooms.length > 0 && bathrooms.length / bedrooms.length < 0.5) score -= 10;
    roomList.forEach(room => { if (room.area < MINIMUM_ROOM_SIZES[room.roomType]) score -= 5; });
    return Math.max(0, Math.min(100, score));
  };

  const saveFloorPlan = useCallback((): string => {
    return JSON.stringify({ rooms, scale, gridSize });
  }, [rooms, scale, gridSize]);

  const updateMeasurements = useCallback((updatedRooms: RoomMeasurement[]) => {
    if (!onMeasurementsChange) return;
    const totalBuiltArea = updatedRooms.reduce((sum, r) => sum + r.area, 0);
    const usableArea = updatedRooms.filter(r => !['corridor', 'storage'].includes(r.roomType)).reduce((sum, r) => sum + r.area, 0);
    const validation = validateBuildingPlan(updatedRooms);
    onMeasurementsChange({
      builtArea: Math.round(totalBuiltArea * 100) / 100,
      usableArea: Math.round(usableArea * 100) / 100,
      bedrooms: updatedRooms.filter(r => r.roomType === 'bedroom').length,
      bathrooms: updatedRooms.filter(r => r.roomType === 'bathroom').length,
      kitchens: updatedRooms.filter(r => r.roomType === 'kitchen').length,
      livingAreas: updatedRooms.filter(r => r.roomType === 'living').length,
      buildingEfficiency: totalBuiltArea > 0 ? usableArea / totalBuiltArea : 0,
      layoutQualityScore: calculateLayoutQualityScore(updatedRooms),
      roomBreakdown: updatedRooms,
      floorPlanData: JSON.stringify({ rooms: updatedRooms, scale, gridSize }),
      validationResults: validation,
    });
  }, [onMeasurementsChange, validateBuildingPlan, scale, gridSize]);

  // =====================================================
  // ACTIONS
  // =====================================================

  const deleteSelectedRoom = () => {
    if (!selectedRoom) return;
    const updatedRooms = rooms.filter(r => r.id !== selectedRoom);
    setRooms(updatedRooms);
    setSelectedRoom(null);
    updateMeasurements(updatedRooms);
  };

  const handleClear = () => {
    setRooms([]);
    setCurrentPoints([]);
    setIsDrawing(false);
    setSelectedRoom(null);
    if (onMeasurementsChange) updateMeasurements([]);
  };

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.5));
  const handleReset = () => setZoom(1);

  const handleExport = () => {
    const json = saveFloorPlan();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'floor-plan.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.rooms) { setRooms(parsed.rooms); updateMeasurements(parsed.rooms); }
        if (parsed.scale) setScale(parsed.scale);
        if (parsed.gridSize) setGridSize(parsed.gridSize);
      } catch {}
    };
    reader.readAsText(file);
  };

  // =====================================================
  // PREVIEW SHAPE
  // =====================================================

  const preview = useMemo(() => {
    if (!isDrawing || !currentPoint) return null;
    if (tool === 'rectangle' && startPoint) {
      const left = Math.min(startPoint.x, currentPoint.x);
      const top = Math.min(startPoint.y, currentPoint.y);
      const w = Math.abs(currentPoint.x - startPoint.x);
      const h = Math.abs(currentPoint.y - startPoint.y);
      const wM = (w / scale).toFixed(2);
      const hM = (h / scale).toFixed(2);
      const aM = ((w * h) / (scale * scale)).toFixed(2);
      return { type: 'rect' as const, left, top, w, h, wM, hM, aM };
    }
    if (tool === 'polygon' && currentPoints.length > 0) {
      const last = currentPoints[currentPoints.length - 1];
      const dist = Math.sqrt((currentPoint.x - last.x) ** 2 + (currentPoint.y - last.y) ** 2);
      const dM = (dist / scale).toFixed(2);
      const mid = { x: (last.x + currentPoint.x) / 2, y: (last.y + currentPoint.y) / 2 };
      return { type: 'polygon' as const, last, current: currentPoint, dM, mid };
    }
    return null;
  }, [isDrawing, currentPoint, tool, startPoint, currentPoints, scale]);

  // =====================================================
  // SPECS
  // =====================================================

  const specs: FloorPlanSpecs = useMemo(() => {
    const totalBuiltArea = rooms.reduce((sum, r) => sum + r.area, 0);
    const usableArea = rooms.filter(r => !['corridor', 'storage'].includes(r.roomType)).reduce((sum, r) => sum + r.area, 0);
    return {
      totalBuiltArea: Math.round(totalBuiltArea * 100) / 100,
      usableArea: Math.round(usableArea * 100) / 100,
      rooms,
      buildingEfficiency: totalBuiltArea > 0 ? usableArea / totalBuiltArea : 0,
      layoutQualityScore: calculateLayoutQualityScore(rooms),
    };
  }, [rooms]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (readonly) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case 'r': if (!e.ctrlKey) { setTool('rectangle'); e.preventDefault(); } break;
        case 'p': if (!e.ctrlKey) { setTool('polygon'); e.preventDefault(); } break;
        case 's': if (!e.ctrlKey) { setTool('select'); e.preventDefault(); } break;
        case 'escape':
          if (isDrawing) { setIsDrawing(false); setCurrentPoints([]); setStartPoint(null); setCurrentPoint(null); e.preventDefault(); }
          break;
        case 'delete': case 'backspace':
          if (tool === 'select') { deleteSelectedRoom(); e.preventDefault(); }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [readonly, isDrawing, tool, selectedRoom]);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 border-r pr-2">
              <Button variant={tool === 'select' ? 'default' : 'outline'} size="sm" onClick={() => setTool('select')} title="Select Tool (S)">
                <Move className="h-4 w-4 mr-1" />Select
              </Button>
              <Button variant={tool === 'rectangle' ? 'default' : 'outline'} size="sm" onClick={() => setTool('rectangle')} disabled={readonly} title="Rectangle Tool (R)">
                <Square className="h-4 w-4 mr-1" />Rectangle
              </Button>
              <Button variant={tool === 'polygon' ? 'default' : 'outline'} size="sm" onClick={() => setTool('polygon')} disabled={readonly} title="Polygon Tool (P)">
                <Pencil className="h-4 w-4 mr-1" />Polygon
              </Button>
            </div>
            <div className="flex items-center gap-1 border-r pr-2">
              <Button variant={snapMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setSnapMode(snapMode === 'grid' ? 'none' : 'grid')} title="Grid Snap">
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{snapMode === 'grid' ? 'Grid' : 'Free'}</span>
            </div>
            <div className="flex items-center gap-1 border-r pr-2">
              <Button variant="outline" size="sm" onClick={handleZoomIn}><ZoomIn className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={handleZoomOut}><ZoomOut className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-1 border-r pr-2">
              <Button variant="outline" size="sm" onClick={deleteSelectedRoom} disabled={readonly || !selectedRoom}><Trash2 className="h-4 w-4" /></Button>
              <Button variant="destructive" size="sm" onClick={handleClear} disabled={readonly}>Clear</Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
              <label>
                <Button variant="outline" size="sm" asChild disabled={readonly}><span><Upload className="h-4 w-4 mr-1" />Import</span></Button>
                <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={readonly} />
              </label>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-sm">Scale:</Label>
              <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">1m = 50px</SelectItem>
                  <SelectItem value="100">1m = 100px</SelectItem>
                  <SelectItem value="150">1m = 150px</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!readonly && (
            <div className="mt-2 text-sm text-muted-foreground flex flex-wrap gap-4">
              {tool === 'rectangle' && <div><strong>Rectangle:</strong> Click and drag to create rectangles</div>}
              {tool === 'polygon' && <div><strong>Polygon:</strong> Click to add points, double-click to complete</div>}
              {tool === 'select' && <div><strong>Select:</strong> Click rooms to select, DEL to delete</div>}
              <div className="text-xs"><strong>Shortcuts:</strong> R=Rectangle, P=Polygon, S=Select, ESC=Cancel, DEL=Delete</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="border rounded-lg overflow-hidden" style={{ width: width + 2, height: height + 2 }}>
              <Stage
                ref={stageRef}
                width={width}
                height={height}
                scaleX={zoom}
                scaleY={zoom}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDblClick={handleDblClick}
                style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
              >
                {/* Background */}
                <Layer listening={false}>
                  <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
                  {gridLines.map((line, i) => (
                    <Line key={i} points={line.points} stroke={line.stroke} strokeWidth={line.strokeWidth} />
                  ))}
                </Layer>

                {/* Rooms */}
                <Layer>
                  {rooms.map(room => {
                    const flatPoints = room.coordinates.flatMap(p => [p.x, p.y]);
                    const xs = room.coordinates.map(p => p.x);
                    const ys = room.coordinates.map(p => p.y);
                    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
                    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                    const isSelected = selectedRoom === room.id;
                    return (
                      <React.Fragment key={room.id}>
                        <Line
                          points={flatPoints}
                          closed
                          fill={ROOM_COLORS[room.roomType]}
                          stroke={isSelected ? '#2563eb' : '#3b82f6'}
                          strokeWidth={isSelected ? 3 : 2}
                          onClick={() => tool === 'select' && setSelectedRoom(room.id)}
                          onTap={() => tool === 'select' && setSelectedRoom(room.id)}
                        />
                        <Text
                          x={cx} y={cy - 6}
                          text={`${room.roomName}\n${room.area.toFixed(1)}m²`}
                          fontSize={12} fill="#1f2937" align="center"
                          offsetX={30} listening={false}
                        />
                      </React.Fragment>
                    );
                  })}
                </Layer>

                {/* Preview */}
                <Layer listening={false}>
                  {preview?.type === 'rect' && (
                    <>
                      <Rect x={preview.left} y={preview.top} width={preview.w} height={preview.h}
                        fill="rgba(59,130,246,0.2)" stroke="#3b82f6" strokeWidth={2} dash={[5, 5]} />
                      <Text x={preview.left + preview.w / 2} y={preview.top - 20} text={`${preview.wM}m`}
                        fontSize={12} fill="#1e40af" align="center" offsetX={20} />
                      <Text x={preview.left - 30} y={preview.top + preview.h / 2} text={`${preview.hM}m`}
                        fontSize={12} fill="#1e40af" align="center" offsetX={10} />
                      <Text x={preview.left + preview.w / 2} y={preview.top + preview.h / 2} text={`${preview.aM}m²`}
                        fontSize={14} fill="#dc2626" align="center" offsetX={20} />
                    </>
                  )}
                  {preview?.type === 'polygon' && (
                    <>
                      <Line points={[preview.last.x, preview.last.y, preview.current.x, preview.current.y]}
                        stroke="#3b82f6" strokeWidth={2} dash={[5, 5]} />
                      <Text x={preview.mid.x} y={preview.mid.y - 10} text={`${preview.dM}m`}
                        fontSize={11} fill="#059669" align="center" offsetX={15} />
                    </>
                  )}
                  {/* Polygon points */}
                  {tool === 'polygon' && currentPoints.length > 0 && (
                    <>
                      <Line
                        points={currentPoints.flatMap(p => [p.x, p.y])}
                        stroke="#3b82f6" strokeWidth={2}
                      />
                      {currentPoints.map((p, i) => (
                        <Circle key={i} x={p.x} y={p.y} radius={4} fill="#3b82f6" />
                      ))}
                    </>
                  )}
                </Layer>
              </Stage>
            </div>
          </CardContent>
        </Card>

        {/* Summary Panel */}
        <Card className="w-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5" />Building Plan Summary</CardTitle>
            <CardDescription>Measurements and valuation readiness</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const validation = validateBuildingPlan(rooms);
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valuation Ready</span>
                    <Badge variant={validation.readiness >= 90 ? 'default' : validation.readiness >= 70 ? 'secondary' : 'destructive'}>{validation.readiness}%</Badge>
                  </div>
                  {validation.issues.length > 0 && (
                    <div className="text-xs text-red-600">
                      <strong>Issues:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {validation.issues.slice(0, 2).map((issue, i) => <li key={i}>{issue}</li>)}
                        {validation.issues.length > 2 && <li>...and {validation.issues.length - 2} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Built Area</span><span className="font-medium">{specs.totalBuiltArea.toFixed(1)} m²</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Usable Area</span><span className="font-medium">{specs.usableArea.toFixed(1)} m²</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Efficiency</span><span className="font-medium">{(specs.buildingEfficiency * 100).toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Layout Score</span><Badge variant={specs.layoutQualityScore >= 80 ? 'default' : specs.layoutQualityScore >= 60 ? 'secondary' : 'destructive'}>{specs.layoutQualityScore}/100</Badge></div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2">
              {(['bedroom', 'bathroom', 'kitchen', 'living'] as RoomType[]).map(type => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  {ROOM_ICONS[type]}<span className="capitalize">{type}s:</span><span className="font-medium">{rooms.filter(r => r.roomType === type).length}</span>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Rooms</h4>
              {rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rooms added yet. Draw on the canvas to add rooms.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {rooms.map(room => (
                    <div key={room.id} className="flex items-center justify-between p-2 rounded bg-muted text-sm">
                      <div className="flex items-center gap-2">{ROOM_ICONS[room.roomType]}<span>{room.roomName}</span></div>
                      <span className="text-muted-foreground">{room.area.toFixed(1)} m²</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Room Details Dialog */}
      <Dialog open={showRoomDialog} onOpenChange={setShowRoomDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Room Details</DialogTitle>
            <DialogDescription>
              Area: {pendingRoom?.area.toFixed(1)} m² | Dimensions: {pendingRoom?.dimensions.length.toFixed(1)}m x {pendingRoom?.dimensions.width.toFixed(1)}m
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="roomName">Room Name</Label>
              <Input id="roomName" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="e.g., Master Bedroom" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roomType">Room Type</Label>
              <Select value={newRoomType} onValueChange={(v) => setNewRoomType(v as RoomType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(ROOM_COLORS).map(type => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">{ROOM_ICONS[type as RoomType]}<span className="capitalize">{type}</span></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pendingRoom && pendingRoom.area < MINIMUM_ROOM_SIZES[newRoomType] && (
              <div className="p-2 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                ⚠️ This room is below the minimum recommended size of {MINIMUM_ROOM_SIZES[newRoomType]} m² for a {newRoomType}.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelRoom}>Cancel</Button>
            <Button onClick={confirmRoom} disabled={!newRoomName.trim()}>Add Room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
