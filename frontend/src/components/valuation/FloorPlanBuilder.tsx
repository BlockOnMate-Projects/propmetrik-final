'use client';

/**
 * Floor Plan Builder Component
 * 
 * Interactive floor plan creation using Fabric.js for property valuation.
 * Allows users to draw rooms, measure areas, and generate valuation inputs.
 * 
 * Features:
 * - Grid-based drawing canvas
 * - Room polygon creation
 * - Real-time area calculation
 * - Room type classification
 * - Export to valuation system
 * - Save/load floor plans
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Pencil,
  Square,
  Move,
  Trash2,
  Download,
  Upload,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  Ruler,
  Home,
  Bath,
  UtensilsCrossed,
  Sofa,
  Bed,
  ArchiveRestore,
  DoorOpen,
} from 'lucide-react';

// =====================================================
// TYPES
// =====================================================

export type RoomType = 
  | 'bedroom' 
  | 'bathroom' 
  | 'kitchen' 
  | 'living' 
  | 'dining' 
  | 'storage' 
  | 'corridor' 
  | 'porch'
  | 'garage'
  | 'laundry'
  | 'office';

export interface Point {
  x: number;
  y: number;
}

export interface RoomMeasurement {
  id: string;
  roomName: string;
  roomType: RoomType;
  area: number; // in square meters
  dimensions: {
    length: number;
    width: number;
    height?: number;
  };
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
  initialFloorPlan?: string;
  readonly?: boolean;
  width?: number;
  height?: number;
}

// =====================================================
// CONSTANTS
// =====================================================

const ROOM_COLORS: Record<RoomType, string> = {
  bedroom: 'rgba(147, 197, 253, 0.4)', // blue
  bathroom: 'rgba(167, 243, 208, 0.4)', // green
  kitchen: 'rgba(253, 224, 71, 0.4)', // yellow
  living: 'rgba(252, 211, 77, 0.4)', // amber
  dining: 'rgba(251, 191, 36, 0.4)', // orange
  storage: 'rgba(209, 213, 219, 0.4)', // gray
  corridor: 'rgba(229, 231, 235, 0.4)', // light gray
  porch: 'rgba(196, 181, 253, 0.4)', // purple
  garage: 'rgba(156, 163, 175, 0.4)', // dark gray
  laundry: 'rgba(147, 197, 253, 0.4)', // blue
  office: 'rgba(254, 202, 202, 0.4)', // red
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
  bedroom: 9, // 9 sqm minimum for bedroom (Ghana building code)
  bathroom: 3, // 3 sqm minimum
  kitchen: 4, // 4 sqm minimum
  living: 12, // 12 sqm minimum
  dining: 8, // 8 sqm minimum
  storage: 1, // 1 sqm minimum
  corridor: 1, // 1 sqm minimum
  porch: 2, // 2 sqm minimum
  garage: 15, // 15 sqm minimum
  laundry: 3, // 3 sqm minimum
  office: 6, // 6 sqm minimum
};

// =====================================================
// FLOOR PLAN BUILDER COMPONENT
// =====================================================

export default function FloorPlanBuilder({
  onMeasurementsChange,
  initialFloorPlan,
  readonly = false,
  width = 1000,
  height = 700,
}: FloorPlanBuilderProps) {
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  // Enhanced state for professional CAD functionality
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [previewObject, setPreviewObject] = useState<fabric.Object | null>(null);
  const [rooms, setRooms] = useState<RoomMeasurement[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [scale, setScale] = useState(100); // pixels per meter
  const [gridSize, setGridSize] = useState(10); // 10cm grid
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [tool, setTool] = useState<'select' | 'rectangle' | 'circle' | 'line' | 'polygon'>('rectangle');
  const [zoom, setZoom] = useState(1);
  const [snapMode, setSnapMode] = useState<'grid' | 'object' | 'none'>('grid');

  // Room dialog state
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<{
    polygon: fabric.Polygon;
    area: number;
    dimensions: { length: number; width: number };
  } | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType>('bedroom');

  // =====================================================
  // CANVAS INITIALIZATION
  // =====================================================

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Fabric.js canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: '#ffffff',
      selection: tool === 'select',
    });

    fabricCanvasRef.current = canvas;

    // Add grid
    addGridBackground(canvas);

    // Load initial floor plan if provided
    if (initialFloorPlan) {
      loadFloorPlan(initialFloorPlan);
    }

    // Cleanup
    return () => {
      canvas.dispose();
    };
  }, []);

  // Update selection mode when tool changes
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.selection = tool === 'select';
    fabricCanvasRef.current.forEachObject((obj) => {
      obj.selectable = tool === 'select' && !readonly;
    });
  }, [tool, readonly]);

  // =====================================================
  // GRID DRAWING
  // =====================================================

  const addGridBackground = useCallback((canvas: fabric.Canvas) => {
    const gridSpacing = (gridSize / 100) * scale; // Convert cm to pixels

    // Remove existing grid
    const existingGrid = canvas.getObjects().find((obj) => (obj as any).isGrid);
    if (existingGrid) {
      canvas.remove(existingGrid);
    }

    const gridLines: fabric.Line[] = [];

    // Vertical lines
    for (let x = 0; x <= canvas.width!; x += gridSpacing) {
      const line = new fabric.Line([x, 0, x, canvas.height!], {
        stroke: x % (gridSpacing * 10) === 0 ? '#d0d0d0' : '#e8e8e8',
        strokeWidth: x % (gridSpacing * 10) === 0 ? 1 : 0.5,
        selectable: false,
        evented: false,
      });
      gridLines.push(line);
    }

    // Horizontal lines
    for (let y = 0; y <= canvas.height!; y += gridSpacing) {
      const line = new fabric.Line([0, y, canvas.width!, y], {
        stroke: y % (gridSpacing * 10) === 0 ? '#d0d0d0' : '#e8e8e8',
        strokeWidth: y % (gridSpacing * 10) === 0 ? 1 : 0.5,
        selectable: false,
        evented: false,
      });
      gridLines.push(line);
    }

    const gridGroup = new fabric.Group(gridLines, {
      selectable: false,
      evented: false,
    });
    (gridGroup as any).isGrid = true;

    canvas.add(gridGroup);
    canvas.sendToBack(gridGroup);
  }, [gridSize, scale]);

  // =====================================================
  // ENHANCED DRAWING HANDLERS (AutoCAD-style)
  // =====================================================

  const snapPointToGrid = useCallback((point: Point): Point => {
    if (snapMode !== 'grid') return point;
    const gridSpacing = (gridSize / 100) * scale;
    return {
      x: Math.round(point.x / gridSpacing) * gridSpacing,
      y: Math.round(point.y / gridSpacing) * gridSpacing,
    };
  }, [snapMode, gridSize, scale]);

  const clearPreviewObject = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    
    // Remove all preview objects (rectangles, lines, and measurement labels)
    const previewObjects = fabricCanvasRef.current.getObjects().filter(
      (obj) => (obj as any).isPreview
    );
    previewObjects.forEach((obj) => fabricCanvasRef.current?.remove(obj));
    setPreviewObject(null);
  }, []);

  // Preview line functions
  const drawPreviewLine = useCallback((from: Point, to: Point) => {
    if (!fabricCanvasRef.current) return;

    // Remove existing preview
    clearPreviewLines();

    const line = new fabric.Line([from.x, from.y, to.x, to.y], {
      stroke: '#3b82f6',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    (line as any).isPreview = true;

    fabricCanvasRef.current.add(line);
  }, []);

  const clearPreviewLines = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    const previewObjects = fabricCanvasRef.current.getObjects().filter(
      (obj) => (obj as any).isPreview
    );
    previewObjects.forEach((obj) => fabricCanvasRef.current?.remove(obj));
  }, []);

  // RECTANGLE TOOL (AutoCAD-style click-and-drag)
  const handleRectangleMouseDown = useCallback((e: fabric.IEvent) => {
    if (!fabricCanvasRef.current || readonly) return;
    
    const pointer = fabricCanvasRef.current.getPointer(e.e);
    const snappedPoint = snapPointToGrid(pointer as Point);
    
    setStartPoint(snappedPoint);
    setIsDrawing(true);
    
    // Clear any existing preview
    clearPreviewObject();
  }, [snapPointToGrid, readonly, clearPreviewObject]);

  const handleRectangleMouseMove = useCallback((e: fabric.IEvent) => {
    if (!isDrawing || !startPoint || !fabricCanvasRef.current) return;
    
    const pointer = fabricCanvasRef.current.getPointer(e.e);
    const snappedPoint = snapPointToGrid(pointer as Point);
    
    // Clear previous preview
    clearPreviewObject();
    
    const left = Math.min(startPoint.x, snappedPoint.x);
    const top = Math.min(startPoint.y, snappedPoint.y);
    const width = Math.abs(snappedPoint.x - startPoint.x);
    const height = Math.abs(snappedPoint.y - startPoint.y);
    
    // Create preview rectangle
    const rect = new fabric.Rect({
      left,
      top,
      width,
      height,
      fill: 'rgba(59, 130, 246, 0.2)',
      stroke: '#3b82f6',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    
    // Add real-time measurement labels
    const widthInMeters = (width / scale).toFixed(2);
    const heightInMeters = (height / scale).toFixed(2);
    const areaInSqMeters = ((width * height) / (scale * scale)).toFixed(2);
    
    // Width label (top center)
    const widthLabel = new fabric.Text(`${widthInMeters}m`, {
      left: left + width / 2,
      top: top - 20,
      fontSize: 12,
      fill: '#1e40af',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      selectable: false,
      evented: false,
    });
    
    // Height label (left center)
    const heightLabel = new fabric.Text(`${heightInMeters}m`, {
      left: left - 30,
      top: top + height / 2,
      fontSize: 12,
      fill: '#1e40af',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      selectable: false,
      evented: false,
    });
    
    // Area label (center)
    const areaLabel = new fabric.Text(`${areaInSqMeters}m²`, {
      left: left + width / 2,
      top: top + height / 2,
      fontSize: 14,
      fill: '#dc2626',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      selectable: false,
      evented: false,
    });
    
    // Mark as preview objects
    (rect as any).isPreview = true;
    (widthLabel as any).isPreview = true;
    (heightLabel as any).isPreview = true;
    (areaLabel as any).isPreview = true;
    
    fabricCanvasRef.current.add(rect);
    fabricCanvasRef.current.add(widthLabel);
    fabricCanvasRef.current.add(heightLabel);
    fabricCanvasRef.current.add(areaLabel);
    
    setPreviewObject(rect);
  }, [isDrawing, startPoint, snapPointToGrid, clearPreviewObject, scale]);

  const handleRectangleMouseUp = useCallback((e: fabric.IEvent) => {
    if (!isDrawing || !startPoint || !fabricCanvasRef.current) return;
    
    const pointer = fabricCanvasRef.current.getPointer(e.e);
    const snappedPoint = snapPointToGrid(pointer as Point);
    
    // Clear preview
    clearPreviewObject();
    
    // Only create room if rectangle has meaningful size
    const width = Math.abs(snappedPoint.x - startPoint.x);
    const height = Math.abs(snappedPoint.y - startPoint.y);
    
    if (width > 10 && height > 10) { // Minimum 10px in each dimension
      createRectangleRoom(startPoint, snappedPoint);
    }
    
    // Reset drawing state
    setIsDrawing(false);
    setStartPoint(null);
  }, [isDrawing, startPoint, snapPointToGrid, clearPreviewObject]);

  // POLYGON TOOL (original multi-point system, improved)
  const handlePolygonMouseDown = useCallback((e: fabric.IEvent) => {
    if (readonly) return;
    if (!fabricCanvasRef.current) return;

    const pointer = fabricCanvasRef.current.getPointer(e.e);
    const snappedPoint = snapPointToGrid(pointer as Point);

    if (!isDrawing) {
      setIsDrawing(true);
      setCurrentPoints([snappedPoint]);
    } else {
      setCurrentPoints((prev) => [...prev, snappedPoint]);
    }
  }, [readonly, isDrawing, snapPointToGrid]);

  const handlePolygonMouseMove = useCallback((e: fabric.IEvent) => {
    if (!isDrawing || tool !== 'polygon' || !fabricCanvasRef.current) return;

    const pointer = fabricCanvasRef.current.getPointer(e.e);
    const snappedPoint = snapPointToGrid(pointer as Point);

    // Clear previous preview
    clearPreviewLines();

    // Draw preview line from last point to current mouse position
    if (currentPoints.length > 0) {
      const lastPoint = currentPoints[currentPoints.length - 1];
      drawPreviewLine(lastPoint, snappedPoint);
      
      // Add distance measurement
      const distance = Math.sqrt(
        Math.pow(snappedPoint.x - lastPoint.x, 2) + 
        Math.pow(snappedPoint.y - lastPoint.y, 2)
      );
      const distanceInMeters = (distance / scale).toFixed(2);
      
      const midPoint = {
        x: (lastPoint.x + snappedPoint.x) / 2,
        y: (lastPoint.y + snappedPoint.y) / 2
      };
      
      const distanceLabel = new fabric.Text(`${distanceInMeters}m`, {
        left: midPoint.x,
        top: midPoint.y - 10,
        fontSize: 11,
        fill: '#059669',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        selectable: false,
        evented: false,
      });
      
      (distanceLabel as any).isPreview = true;
      fabricCanvasRef.current.add(distanceLabel);
    }
  }, [isDrawing, tool, currentPoints, snapPointToGrid, drawPreviewLine, clearPreviewLines, scale]);

  const handlePolygonDoubleClick = useCallback(() => {
    if (currentPoints.length >= 3) {
      createPolygonRoom(currentPoints);
      setCurrentPoints([]);
      setIsDrawing(false);
      clearPreviewLines();
    }
  }, [currentPoints]);

  // MAIN MOUSE EVENT HANDLER (routes to appropriate tool)
  const handleCanvasMouseDown = useCallback((e: fabric.IEvent) => {
    switch (tool) {
      case 'rectangle':
        handleRectangleMouseDown(e);
        break;
      case 'polygon':
        handlePolygonMouseDown(e);
        break;
      case 'select':
        // Let Fabric.js handle selection
        break;
      default:
        break;
    }
  }, [tool, handleRectangleMouseDown, handlePolygonMouseDown]);

  const handleCanvasMouseMove = useCallback((e: fabric.IEvent) => {
    switch (tool) {
      case 'rectangle':
        handleRectangleMouseMove(e);
        break;
      case 'polygon':
        handlePolygonMouseMove(e);
        break;
      default:
        break;
    }
  }, [tool, handleRectangleMouseMove, handlePolygonMouseMove]);

  const handleCanvasMouseUp = useCallback((e: fabric.IEvent) => {
    switch (tool) {
      case 'rectangle':
        handleRectangleMouseUp(e);
        break;
      default:
        break;
    }
  }, [tool, handleRectangleMouseUp]);

  // Setup canvas events with enhanced handling
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    canvas.on('mouse:down', handleCanvasMouseDown);
    canvas.on('mouse:move', handleCanvasMouseMove);
    canvas.on('mouse:up', handleCanvasMouseUp);
    canvas.on('mouse:dblclick', handlePolygonDoubleClick);
    
    // Handle object selection
    canvas.on('selection:created', (e) => {
      if (e.selected && e.selected[0]) {
        const obj = e.selected[0] as any;
        if (obj.roomId) {
          setSelectedRoom(obj.roomId);
        }
      }
    });
    
    canvas.on('selection:cleared', () => {
      setSelectedRoom(null);
    });

    // Keyboard shortcuts (AutoCAD-style)
    const handleKeyPress = (e: KeyboardEvent) => {
      if (readonly) return;
      
      switch (e.key.toLowerCase()) {
        case 'r':
          if (!e.ctrlKey && !e.altKey) {
            setTool('rectangle');
            e.preventDefault();
          }
          break;
        case 'p':
          if (!e.ctrlKey && !e.altKey) {
            setTool('polygon');
            e.preventDefault();
          }
          break;
        case 's':
          if (!e.ctrlKey && !e.altKey) {
            setTool('select');
            e.preventDefault();
          }
          break;
        case 'escape':
          // Cancel current operation
          if (isDrawing) {
            setIsDrawing(false);
            setCurrentPoints([]);
            setStartPoint(null);
            clearPreviewObject();
            clearPreviewLines();
            e.preventDefault();
          }
          break;
        case 'delete':
        case 'backspace':
          if (tool === 'select') {
            deleteSelectedRoom();
            e.preventDefault();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      canvas.off('mouse:down', handleCanvasMouseDown);
      canvas.off('mouse:move', handleCanvasMouseMove);
      canvas.off('mouse:up', handleCanvasMouseUp);
      canvas.off('mouse:dblclick', handlePolygonDoubleClick);
      canvas.off('selection:created');
      canvas.off('selection:cleared');
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp, handlePolygonDoubleClick, readonly, isDrawing, tool, clearPreviewObject]);

  // =====================================================\n  // ENHANCED ROOM CREATION (Multiple Shape Support)\n  // =====================================================

  const createRectangleRoom = (startPt: Point, endPt: Point) => {
    if (!fabricCanvasRef.current) return;

    // Convert rectangle to polygon points for consistency
    const left = Math.min(startPt.x, endPt.x);
    const top = Math.min(startPt.y, endPt.y);
    const right = Math.max(startPt.x, endPt.x);
    const bottom = Math.max(startPt.y, endPt.y);
    
    const points: Point[] = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];

    createRoomFromPoints(points, 'rectangle');
  };

  const createPolygonRoom = (points: Point[]) => {
    createRoomFromPoints(points, 'polygon');
  };

  const createRoomFromPoints = (points: Point[], shapeType: string) => {
    if (!fabricCanvasRef.current) return;

    const polygon = new fabric.Polygon(points, {
      fill: ROOM_COLORS.bedroom,
      stroke: '#3b82f6',
      strokeWidth: 2,
      selectable: true,
      hasControls: true,
    });

    fabricCanvasRef.current.add(polygon);

    // Calculate measurements
    const area = calculatePolygonArea(points);
    const dimensions = calculateRoomDimensions(points);

    // Auto-generate room name based on shape and count
    const existingRooms = rooms.filter(r => r.roomType === 'bedroom').length;
    const defaultName = shapeType === 'rectangle' ? 
      `Room ${existingRooms + 1}` : 
      `Polygon Room ${existingRooms + 1}`;

    // Show dialog to get room details
    setPendingRoom({ polygon, area, dimensions });
    setNewRoomName(defaultName);
    setShowRoomDialog(true);
  };

  const calculatePolygonArea = (points: Point[]): number => {
    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    area = Math.abs(area) / 2;

    // Convert from pixels² to m²
    const pixelsPerSqM = Math.pow(scale, 2);
    return area / pixelsPerSqM;
  };

  const calculateRoomDimensions = (points: Point[]): { length: number; width: number } => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Convert pixels to meters
    const meterConversion = 1 / scale;

    return {
      length: (maxX - minX) * meterConversion,
      width: (maxY - minY) * meterConversion,
    };
  };

  const confirmRoom = () => {
    if (!pendingRoom || !fabricCanvasRef.current) return;

    const roomId = `room_${Date.now()}`;

    // Update polygon color based on room type
    pendingRoom.polygon.set({
      fill: ROOM_COLORS[newRoomType],
      stroke: '#1e40af',
    });
    
    // Store room ID on the polygon for tracking
    (pendingRoom.polygon as any).roomId = roomId;

    // Add room label
    const bounds = pendingRoom.polygon.getBoundingRect();
    const label = new fabric.Text(
      `${newRoomName}\n${pendingRoom.area.toFixed(1)}m²`,
      {
        left: bounds.left + bounds.width / 2,
        top: bounds.top + bounds.height / 2,
        fontSize: 12,
        fill: '#1f2937',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      }
    );

    fabricCanvasRef.current.add(label);

    // Create room measurement
    const newRoom: RoomMeasurement = {
      id: roomId,
      roomName: newRoomName,
      roomType: newRoomType,
      area: Math.round(pendingRoom.area * 100) / 100,
      dimensions: {
        length: Math.round(pendingRoom.dimensions.length * 100) / 100,
        width: Math.round(pendingRoom.dimensions.width * 100) / 100,
      },
      coordinates: pendingRoom.polygon.points as Point[],
      adjacentRooms: [],
    };

    setRooms((prev) => [...prev, newRoom]);

    // Reset dialog state
    setShowRoomDialog(false);
    setPendingRoom(null);
    setNewRoomName('');
    setNewRoomType('bedroom');
    
    // Auto-switch to select mode after creating room
    setTool('select');

    // Notify parent of changes
    updateMeasurements([...rooms, newRoom]);
  };

  const cancelRoom = () => {
    if (pendingRoom && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(pendingRoom.polygon);
    }
    setShowRoomDialog(false);
    setPendingRoom(null);
    setNewRoomName('');
    setNewRoomType('bedroom');
  };

  // =====================================================
  // BUILDING PLAN VALIDATION FOR VALUATION
  // =====================================================

  const validateBuildingPlan = useCallback((roomList: RoomMeasurement[]) => {
    const validation = {
      isComplete: false,
      issues: [] as string[],
      recommendations: [] as string[],
      readiness: 0, // percentage ready for valuation
    };

    // Check minimum room requirements
    const bedrooms = roomList.filter(r => r.roomType === 'bedroom').length;
    const bathrooms = roomList.filter(r => r.roomType === 'bathroom').length;
    const kitchens = roomList.filter(r => r.roomType === 'kitchen').length;
    const livingAreas = roomList.filter(r => r.roomType === 'living').length;

    // Minimum requirements for residential valuation
    if (bedrooms === 0) validation.issues.push('No bedrooms defined');
    if (bathrooms === 0) validation.issues.push('No bathrooms defined');
    if (kitchens === 0) validation.issues.push('No kitchen defined');
    if (livingAreas === 0) validation.issues.push('No living area defined');

    // Size validations
    roomList.forEach(room => {
      const minSize = MINIMUM_ROOM_SIZES[room.roomType];
      if (room.area < minSize) {
        validation.issues.push(`${room.roomName} (${room.area.toFixed(1)}m²) is below minimum ${minSize}m² for ${room.roomType}`);
      }
    });

    // Total area validation
    const totalArea = roomList.reduce((sum, room) => sum + room.area, 0);
    if (totalArea < 30) {
      validation.issues.push('Total built area is too small for accurate valuation (minimum 30m²)');
    }

    // Layout quality checks
    const efficiency = roomList
      .filter(room => !['corridor', 'storage'].includes(room.roomType))
      .reduce((sum, room) => sum + room.area, 0) / totalArea;
    
    if (efficiency < 0.7) {
      validation.recommendations.push('Consider reducing corridor/storage space to improve efficiency');
    }

    // Bathroom to bedroom ratio
    if (bedrooms > 0 && bathrooms / bedrooms < 0.5) {
      validation.recommendations.push('Consider adding more bathrooms (ideal: 1 bathroom per 2 bedrooms)');
    }

    // Calculate readiness percentage
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
  // MEASUREMENTS & CALCULATIONS
  // =====================================================

  const updateMeasurements = (updatedRooms: RoomMeasurement[]) => {
    if (!onMeasurementsChange) return;

    const specs = generateFloorPlanSpecs(updatedRooms);
    const measurements = exportToValuationSystem(specs, updatedRooms);
    
    // Include validation results
    const validation = validateBuildingPlan(updatedRooms);
    measurements.validationResults = validation;
    
    onMeasurementsChange(measurements);
  };

  const generateFloorPlanSpecs = (roomList: RoomMeasurement[]): FloorPlanSpecs => {
    const totalBuiltArea = roomList.reduce((sum, room) => sum + room.area, 0);
    const usableArea = roomList
      .filter((room) => !['corridor', 'storage'].includes(room.roomType))
      .reduce((sum, room) => sum + room.area, 0);

    return {
      totalBuiltArea: Math.round(totalBuiltArea * 100) / 100,
      usableArea: Math.round(usableArea * 100) / 100,
      rooms: roomList,
      buildingEfficiency: totalBuiltArea > 0 ? usableArea / totalBuiltArea : 0,
      layoutQualityScore: calculateLayoutQualityScore(roomList),
    };
  };

  const calculateLayoutQualityScore = (roomList: RoomMeasurement[]): number => {
    let score = 100;

    const bedrooms = roomList.filter((r) => r.roomType === 'bedroom');
    const bathrooms = roomList.filter((r) => r.roomType === 'bathroom');

    // Bedroom to bathroom ratio (ideal: 1 bathroom per 2 bedrooms)
    if (bedrooms.length > 0) {
      const bathroomRatio = bathrooms.length / bedrooms.length;
      if (bathroomRatio < 0.5) score -= 10;
    }

    // Room size standards (Ghana building code)
    roomList.forEach((room) => {
      const minSize = MINIMUM_ROOM_SIZES[room.roomType];
      if (room.area < minSize) {
        score -= 5;
      }
    });

    return Math.max(0, Math.min(100, score));
  };

  const exportToValuationSystem = (
    specs: FloorPlanSpecs,
    roomList: RoomMeasurement[]
  ): PropertyMeasurements => {
    return {
      builtArea: specs.totalBuiltArea,
      usableArea: specs.usableArea,
      bedrooms: roomList.filter((r) => r.roomType === 'bedroom').length,
      bathrooms: roomList.filter((r) => r.roomType === 'bathroom').length,
      kitchens: roomList.filter((r) => r.roomType === 'kitchen').length,
      livingAreas: roomList.filter((r) => r.roomType === 'living').length,
      buildingEfficiency: specs.buildingEfficiency,
      layoutQualityScore: specs.layoutQualityScore,
      roomBreakdown: roomList,
      floorPlanData: saveFloorPlan(),
    };
  };

  // =====================================================
  // SAVE / LOAD
  // =====================================================

  const saveFloorPlan = (): string => {
    if (!fabricCanvasRef.current) return '';

    const floorPlanData = {
      canvasData: fabricCanvasRef.current.toJSON(),
      rooms,
      scale,
      gridSize,
    };

    return JSON.stringify(floorPlanData);
  };

  const loadFloorPlan = (floorPlanJson: string) => {
    if (!fabricCanvasRef.current) return;

    try {
      const floorPlanData = JSON.parse(floorPlanJson);

      fabricCanvasRef.current.loadFromJSON(floorPlanData.canvasData, () => {
        setRooms(floorPlanData.rooms || []);
        setScale(floorPlanData.scale || 100);
        setGridSize(floorPlanData.gridSize || 10);
        fabricCanvasRef.current?.renderAll();
      });
    } catch (error) {
      console.error('Failed to load floor plan:', error);
    }
  };

  const handleExport = () => {
    const json = saveFloorPlan();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floor-plan.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const json = e.target?.result as string;
      loadFloorPlan(json);
    };
    reader.readAsText(file);
  };

  // =====================================================
  // CANVAS CONTROLS
  // =====================================================

  const handleZoomIn = () => {
    if (!fabricCanvasRef.current) return;
    const newZoom = Math.min(zoom * 1.2, 3);
    setZoom(newZoom);
    fabricCanvasRef.current.setZoom(newZoom);
  };

  const handleZoomOut = () => {
    if (!fabricCanvasRef.current) return;
    const newZoom = Math.max(zoom / 1.2, 0.5);
    setZoom(newZoom);
    fabricCanvasRef.current.setZoom(newZoom);
  };

  const handleReset = () => {
    if (!fabricCanvasRef.current) return;
    setZoom(1);
    fabricCanvasRef.current.setZoom(1);
    fabricCanvasRef.current.setViewportTransform([1, 0, 0, 1, 0, 0]);
  };

  const handleClear = () => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.clear();
    fabricCanvasRef.current.backgroundColor = '#ffffff';
    addGridBackground(fabricCanvasRef.current);
    setRooms([]);
    setCurrentPoints([]);
    setIsDrawing(false);
  };

  const deleteSelectedRoom = () => {
    if (!fabricCanvasRef.current) return;
    const activeObject = fabricCanvasRef.current.getActiveObject();
    if (activeObject) {
      // Remove from canvas
      fabricCanvasRef.current.remove(activeObject);
      
      // Find and remove from rooms array if it has a roomId
      const roomId = (activeObject as any).roomId;
      if (roomId) {
        const updatedRooms = rooms.filter(room => room.id !== roomId);
        setRooms(updatedRooms);
        
        // Update measurements
        updateMeasurements(updatedRooms);
      }
      
      // Also remove associated labels
      const allObjects = fabricCanvasRef.current.getObjects();
      allObjects.forEach(obj => {
        if ((obj as any).roomId === roomId && obj !== activeObject) {
          fabricCanvasRef.current?.remove(obj);
        }
      });
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  const specs = generateFloorPlanSpecs(rooms);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Enhanced Drawing Tools */}
            <div className="flex items-center gap-1 border-r pr-2">
              <Button
                variant={tool === 'select' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('select')}
                title="Select Tool (S)"
              >
                <Move className="h-4 w-4 mr-1" />
                Select
              </Button>
              <Button
                variant={tool === 'rectangle' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('rectangle')}
                disabled={readonly}
                title="Rectangle Tool (R) - Click and drag to create rectangles"
              >
                <Square className="h-4 w-4 mr-1" />
                Rectangle
              </Button>
              <Button
                variant={tool === 'polygon' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('polygon')}
                disabled={readonly}
                title="Polygon Tool (P) - Click points, double-click to finish"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Polygon
              </Button>
            </div>

            {/* Snap Controls */}
            <div className="flex items-center gap-1 border-r pr-2">
              <Button
                variant={snapMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSnapMode(snapMode === 'grid' ? 'none' : 'grid')}
                title="Grid Snap - Snap to grid points"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {snapMode === 'grid' ? 'Grid' : 'Free'}
              </span>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border-r pr-2">
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 border-r pr-2">
              <Button variant="outline" size="sm" onClick={deleteSelectedRoom} disabled={readonly}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="sm" onClick={handleClear} disabled={readonly}>
                Clear
              </Button>
            </div>

            {/* Save/Load */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <label>
                <Button variant="outline" size="sm" asChild disabled={readonly}>
                  <span>
                    <Upload className="h-4 w-4 mr-1" />
                    Import
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                  disabled={readonly}
                />
              </label>
            </div>

            {/* Scale Control */}
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-sm">Scale:</Label>
              <Select
                value={String(scale)}
                onValueChange={(v) => setScale(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">1m = 50px</SelectItem>
                  <SelectItem value="100">1m = 100px</SelectItem>
                  <SelectItem value="150">1m = 150px</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Enhanced Drawing Instructions */}
          {!readonly && (
            <div className="mt-2 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-4">
                {tool === 'rectangle' && (
                  <div><strong>Rectangle:</strong> Click and drag to create rectangles</div>
                )}
                {tool === 'polygon' && (
                  <div><strong>Polygon:</strong> Click to add points, double-click to complete</div>
                )}
                {tool === 'select' && (
                  <div><strong>Select:</strong> Click objects to select, drag to move</div>
                )}
                <div className="text-xs">
                  <strong>Shortcuts:</strong> R=Rectangle, P=Polygon, S=Select, ESC=Cancel, DEL=Delete
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="flex gap-4">
        {/* Canvas */}
        <Card className="flex-1">
          <CardContent className="p-4">
            <div
              className="border rounded-lg overflow-hidden"
              style={{ width: width + 2, height: height + 2 }}
            >
              <canvas ref={canvasRef} />
            </div>
          </CardContent>
        </Card>

        {/* Summary Panel */}
        <Card className="w-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Building Plan Summary
            </CardTitle>
            <CardDescription>
              Measurements and valuation readiness
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Validation Status */}
            {(() => {
              const validation = validateBuildingPlan(rooms);
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valuation Ready</span>
                    <Badge
                      variant={
                        validation.readiness >= 90
                          ? 'default'
                          : validation.readiness >= 70
                          ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {validation.readiness}%
                    </Badge>
                  </div>
                  {validation.issues.length > 0 && (
                    <div className="text-xs text-red-600">
                      <strong>Issues:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {validation.issues.slice(0, 2).map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                        {validation.issues.length > 2 && (
                          <li>...and {validation.issues.length - 2} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}

            <Separator />
            {/* Area Summary */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Built Area</span>
                <span className="font-medium">{specs.totalBuiltArea.toFixed(1)} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Usable Area</span>
                <span className="font-medium">{specs.usableArea.toFixed(1)} m²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Efficiency</span>
                <span className="font-medium">
                  {(specs.buildingEfficiency * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Layout Score</span>
                <Badge
                  variant={
                    specs.layoutQualityScore >= 80
                      ? 'default'
                      : specs.layoutQualityScore >= 60
                      ? 'secondary'
                      : 'destructive'
                  }
                >
                  {specs.layoutQualityScore}/100
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Room Count */}
            <div className="grid grid-cols-2 gap-2">
              {(['bedroom', 'bathroom', 'kitchen', 'living'] as RoomType[]).map((type) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  {ROOM_ICONS[type]}
                  <span className="capitalize">{type}s:</span>
                  <span className="font-medium">
                    {rooms.filter((r) => r.roomType === type).length}
                  </span>
                </div>
              ))}
            </div>

            <Separator />

            {/* Room List */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Rooms</h4>
              {rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No rooms added yet. Draw on the canvas to add rooms.
                </p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between p-2 rounded bg-muted text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {ROOM_ICONS[room.roomType]}
                        <span>{room.roomName}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {room.area.toFixed(1)} m²
                      </span>
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
              Enter the name and type for this room.
              Area: {pendingRoom?.area.toFixed(1)} m² |
              Dimensions: {pendingRoom?.dimensions.length.toFixed(1)}m x{' '}
              {pendingRoom?.dimensions.width.toFixed(1)}m
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="roomName">Room Name</Label>
              <Input
                id="roomName"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g., Master Bedroom"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomType">Room Type</Label>
              <Select
                value={newRoomType}
                onValueChange={(v) => setNewRoomType(v as RoomType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(ROOM_COLORS).map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        {ROOM_ICONS[type as RoomType]}
                        <span className="capitalize">{type}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Size warning */}
            {pendingRoom &&
              pendingRoom.area < MINIMUM_ROOM_SIZES[newRoomType] && (
                <div className="p-2 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                  ⚠️ This room is below the minimum recommended size of{' '}
                  {MINIMUM_ROOM_SIZES[newRoomType]} m² for a {newRoomType}.
                </div>
              )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelRoom}>
              Cancel
            </Button>
            <Button onClick={confirmRoom} disabled={!newRoomName.trim()}>
              Add Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
