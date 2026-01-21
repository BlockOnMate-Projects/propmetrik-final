'use client';

/**
 * Professional Floor Plan Builder
 * 
 * CAD-level floor plan creation with walls, doors, windows, and dimensions.
 * Replaces the basic rectangle/polygon tool with professional architecture tools.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import {
  Move,
  Square,
  Minus,
  DoorOpen,
  LayoutGrid,
  Ruler,
  Trash2,
  Download,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid3X3,
  Magnet,
  MousePointer2,
  PenTool,
  Undo2,
  Redo2,
  Box,
  Tag,
  LayoutTemplate,
} from 'lucide-react';

import {
  Point,
  Wall,
  WallType,
  Door,
  DoorStyle,
  Window,
  WindowStyle,
  Room,
  RoomType,
  Dimension,
  DrawingTool,
  SnapSettings,
  SnapPoint,
  FloorPlanState,
  BuildingSummary,
  PropertyMeasurements,
  HistoryAction,
  HistoryState,
  RoomTemplate,
  Stair,
  StairDirection,
  StairStyle,
} from './types';

import {
  DEFAULT_SCALE,
  DEFAULT_GRID_SIZE,
  WALL_THICKNESS,
  WALL_COLORS,
  DOOR_SIZES,
  DOOR_COLORS,
  WINDOW_SIZES,
  WINDOW_COLORS,
  ROOM_COLORS,
  ROOM_ICONS,
  MINIMUM_ROOM_SIZES,
  SNAP_TOLERANCE,
  SNAP_COLORS,
  DEFAULT_SNAP_MODES,
  DIMENSION_COLORS,
  DIMENSION_OFFSET,
  CANVAS_BACKGROUND,
  GRID_COLOR_MAJOR,
  GRID_COLOR_MINOR,
  SELECTION_COLOR,
  PREVIEW_COLOR,
  ROOM_TEMPLATES,
  STAIR_DEFAULTS,
  STAIR_COLORS,
} from './constants';

import {
  distance,
  midpoint,
  angle,
  angleDegrees,
  snapToGrid,
  snapToOrtho,
  findSnapPoints,
  getBestSnapPoint,
  getWallPolygon,
  getWallLength,
  calculatePolygonArea,
  calculateCentroid,
  calculatePerimeter,
  pixelsToMeters,
  metersToPixels,
  pixelAreaToSquareMeters,
  formatMeasurement,
  formatArea,
  detectRoomsFromWalls,
  lineIntersection,
  nearestPointOnLine,
  createWallsFromRoomRectangle,
  createRoomFromRectangle,
  findRoomAtPoint,
  findEnclosedRegionAtPoint,
  pointInPolygon,
} from './geometry';

// =====================================================
// COMPONENT PROPS
// =====================================================

export interface FloorPlanExportData {
  json: string;           // Full floor plan JSON data
  imageDataUrl: string;   // Base64 PNG for embedding in reports
  measurements: PropertyMeasurements;
}

interface ProfessionalFloorPlanBuilderProps {
  onMeasurementsChange?: (measurements: PropertyMeasurements) => void;
  onFloorPlanChange?: (data: FloorPlanExportData) => void;  // Called when floor plan changes
  initialFloorPlan?: string | object;
  floorNumber?: number;         // Support for multi-floor buildings
  floorLabel?: string;          // e.g., "Ground Floor", "First Floor"
  readonly?: boolean;
  width?: number;
  height?: number;
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function ProfessionalFloorPlanBuilder({
  onMeasurementsChange,
  onFloorPlanChange,
  initialFloorPlan,
  floorNumber = 0,
  floorLabel = 'Ground Floor',
  readonly = false,
  width = 900,
  height = 600,
}: ProfessionalFloorPlanBuilderProps) {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for latest state (to avoid stale closures in event handlers)
  const roomsRef = useRef<Room[]>([]);
  const wallsRef = useRef<Wall[]>([]);
  const isDraggingRoomRef = useRef(false); // Prevent re-render during drag

  // Drawing state
  const [tool, setTool] = useState<DrawingTool>('wall');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);

  // Floor plan data
  const [walls, setWalls] = useState<Wall[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [stairs, setStairs] = useState<Stair[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  // Tool settings
  const [wallType, setWallType] = useState<WallType>('interior');
  const [doorStyle, setDoorStyle] = useState<DoorStyle>('single_swing');
  const [windowStyle, setWindowStyle] = useState<WindowStyle>('casement');

  // View settings
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [zoom, setZoom] = useState(1);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [showGrid, setShowGrid] = useState(true);
  const [orthoMode, setOrthoMode] = useState(true);

  // Snap settings
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    enabled: true,
    gridSize: DEFAULT_GRID_SIZE,
    tolerance: SNAP_TOLERANCE,
    modes: DEFAULT_SNAP_MODES,
  });
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | null>(null);

  // Selection
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Room labeling dialog
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [pendingRoomPolygon, setPendingRoomPolygon] = useState<Point[] | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType>('bedroom');

  // Undo/Redo history
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  const maxHistorySize = 50;

  // Room tool state
  const [roomDrawStart, setRoomDrawStart] = useState<Point | null>(null);
  const [selectedRoomTemplate, setSelectedRoomTemplate] = useState<RoomTemplate | null>(null);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  // Keep refs in sync with state (for event handlers that need latest values)
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);
  
  useEffect(() => {
    wallsRef.current = walls;
  }, [walls]);

  // =====================================================
  // UNDO/REDO SYSTEM
  // =====================================================

  const pushToHistory = useCallback((action: Omit<HistoryAction, 'timestamp'>) => {
    setHistory(prev => ({
      past: [...prev.past.slice(-(maxHistorySize - 1)), { ...action, timestamp: Date.now() }],
      future: [], // Clear future on new action
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      
      const lastAction = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      
      // Reverse the action
      switch (lastAction.type) {
        case 'ADD_WALL':
          setWalls(w => w.filter(wall => wall.id !== lastAction.data.id));
          break;
        case 'DELETE_WALL':
          setWalls(w => [...w, lastAction.data]);
          break;
        case 'ADD_DOOR':
          setDoors(d => d.filter(door => door.id !== lastAction.data.id));
          break;
        case 'DELETE_DOOR':
          setDoors(d => [...d, lastAction.data]);
          break;
        case 'ADD_WINDOW':
          setWindows(w => w.filter(win => win.id !== lastAction.data.id));
          break;
        case 'DELETE_WINDOW':
          setWindows(w => [...w, lastAction.data]);
          break;
        case 'ADD_STAIR':
          setStairs(s => s.filter(stair => stair.id !== lastAction.data.id));
          break;
        case 'DELETE_STAIR':
          setStairs(s => [...s, lastAction.data]);
          break;
        case 'ADD_ROOM':
          setRooms(r => r.filter(room => room.id !== lastAction.data.room.id));
          // Also remove the walls that were added with the room
          if (lastAction.data.walls) {
            const wallIds = lastAction.data.walls.map((w: Wall) => w.id);
            setWalls(w => w.filter(wall => !wallIds.includes(wall.id)));
          }
          break;
        case 'DELETE_ROOM':
          setRooms(r => [...r, lastAction.data]);
          break;
        case 'UPDATE_ROOM':
          setRooms(r => r.map(room => 
            room.id === lastAction.inverseData.id ? lastAction.inverseData : room
          ));
          break;
        case 'ADD_DIMENSION':
          setDimensions(d => d.filter(dim => dim.id !== lastAction.data.id));
          break;
        case 'DELETE_DIMENSION':
          setDimensions(d => [...d, lastAction.data]);
          break;
        case 'CLEAR_ALL':
          // Restore all data
          if (lastAction.inverseData) {
            setWalls(lastAction.inverseData.walls || []);
            setDoors(lastAction.inverseData.doors || []);
            setWindows(lastAction.inverseData.windows || []);
            setStairs(lastAction.inverseData.stairs || []);
            setRooms(lastAction.inverseData.rooms || []);
            setDimensions(lastAction.inverseData.dimensions || []);
          }
          break;
      }
      
      return {
        past: newPast,
        future: [lastAction, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      
      const nextAction = prev.future[0];
      const newFuture = prev.future.slice(1);
      
      // Re-apply the action
      switch (nextAction.type) {
        case 'ADD_WALL':
          setWalls(w => [...w, nextAction.data]);
          break;
        case 'DELETE_WALL':
          setWalls(w => w.filter(wall => wall.id !== nextAction.data.id));
          break;
        case 'ADD_DOOR':
          setDoors(d => [...d, nextAction.data]);
          break;
        case 'DELETE_DOOR':
          setDoors(d => d.filter(door => door.id !== nextAction.data.id));
          break;
        case 'ADD_WINDOW':
          setWindows(w => [...w, nextAction.data]);
          break;
        case 'DELETE_WINDOW':
          setWindows(w => w.filter(win => win.id !== nextAction.data.id));
          break;
        case 'ADD_STAIR':
          setStairs(s => [...s, nextAction.data]);
          break;
        case 'DELETE_STAIR':
          setStairs(s => s.filter(stair => stair.id !== nextAction.data.id));
          break;
        case 'ADD_ROOM':
          if (nextAction.data.walls) {
            setWalls(w => [...w, ...nextAction.data.walls]);
          }
          setRooms(r => [...r, nextAction.data.room]);
          break;
        case 'DELETE_ROOM':
          setRooms(r => r.filter(room => room.id !== nextAction.data.id));
          break;
        case 'UPDATE_ROOM':
          setRooms(r => r.map(room => 
            room.id === nextAction.data.id ? nextAction.data : room
          ));
          break;
        case 'ADD_DIMENSION':
          setDimensions(d => [...d, nextAction.data]);
          break;
        case 'DELETE_DIMENSION':
          setDimensions(d => d.filter(dim => dim.id !== nextAction.data.id));
          break;
        case 'CLEAR_ALL':
          setWalls([]);
          setDoors([]);
          setWindows([]);
          setStairs([]);
          setRooms([]);
          setDimensions([]);
          break;
      }
      
      return {
        past: [...prev.past, nextAction],
        future: newFuture,
      };
    });
  }, []);

  // =====================================================
  // CANVAS INITIALIZATION
  // =====================================================

  // Track canvas ready state
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Prevent re-initialization if canvas already exists
    if (fabricCanvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: CANVAS_BACKGROUND,
      selection: false,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;
    setCanvasReady(true);

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
      setCanvasReady(false);
    };
  }, [width, height]);

  // Load initial floor plan after canvas is ready
  useEffect(() => {
    if (fabricCanvasRef.current && initialFloorPlan) {
      loadFloorPlan(initialFloorPlan);
    }
  }, [initialFloorPlan]);

  // Draw initial grid when canvas is ready
  useEffect(() => {
    if (canvasReady && fabricCanvasRef.current && showGrid) {
      drawGrid(fabricCanvasRef.current);
    }
  }, [canvasReady]);

  // =====================================================
  // GRID DRAWING
  // =====================================================

  const drawGrid = useCallback((canvas: fabric.Canvas) => {
    // Remove existing grid
    const existingGrid = canvas.getObjects().filter((obj: any) => obj.isGrid);
    existingGrid.forEach((obj) => canvas.remove(obj));

    if (!showGrid) return;

    const gridSpacing = (gridSize / 100) * scale; // cm to pixels
    const majorGridSpacing = gridSpacing * 10; // 1m grid

    // Minor grid lines
    for (let x = 0; x <= canvas.width!; x += gridSpacing) {
      const isMajor = x % majorGridSpacing < 0.1;
      const line = new fabric.Line([x, 0, x, canvas.height!], {
        stroke: isMajor ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR,
        strokeWidth: isMajor ? 1 : 0.5,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendToBack(line);
    }

    for (let y = 0; y <= canvas.height!; y += gridSpacing) {
      const isMajor = y % majorGridSpacing < 0.1;
      const line = new fabric.Line([0, y, canvas.width!, y], {
        stroke: isMajor ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR,
        strokeWidth: isMajor ? 1 : 0.5,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendToBack(line);
    }

    canvas.renderAll();
  }, [showGrid, gridSize, scale]);

  // Redraw grid when settings change
  useEffect(() => {
    if (fabricCanvasRef.current) {
      drawGrid(fabricCanvasRef.current);
    }
  }, [showGrid, gridSize, scale, drawGrid]);

  // Update canvas selection mode when tool changes
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.selection = tool === 'select';
      canvas.renderAll();
    }
  }, [tool]);

  // =====================================================
  // SNAP POINT CALCULATION
  // =====================================================

  const calculateSnapPoint = useCallback((rawPoint: Point): Point => {
    if (!snapSettings.enabled) return rawPoint;

    // Find all potential snap points
    const snapPoints = findSnapPoints(rawPoint, walls, snapSettings, scale);
    const best = getBestSnapPoint(snapPoints);

    if (best) {
      setActiveSnapPoint(best);
      return best.point;
    }

    // Fall back to grid snap
    const gridSnapped = snapToGrid(rawPoint, gridSize, scale);
    setActiveSnapPoint({
      point: gridSnapped,
      type: 'grid',
      priority: 0,
    });
    return gridSnapped;
  }, [walls, snapSettings, scale, gridSize]);

  // =====================================================
  // WALL DRAWING
  // =====================================================

  const drawWallPreview = useCallback((start: Point, end: Point) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Clear previous preview
    const previews = canvas.getObjects().filter((obj: any) => obj.isPreview);
    previews.forEach((obj) => canvas.remove(obj));

    // Apply ortho mode
    let finalEnd = end;
    if (orthoMode && drawStart) {
      finalEnd = snapToOrtho(start, end, true);
    }

    // Get wall polygon (with thickness)
    const thickness = WALL_THICKNESS[wallType];
    const tempWall: Wall = {
      id: 'preview',
      type: wallType,
      start,
      end: finalEnd,
      thickness,
      height: 2.8,
      openings: [],
      connectedWalls: [],
    };

    const polygon = getWallPolygon(tempWall, scale);
    
    // Draw wall rectangle
    const wallPolygon = new fabric.Polygon(polygon, {
      fill: PREVIEW_COLOR,
      stroke: WALL_COLORS[wallType].stroke,
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    (wallPolygon as any).isPreview = true;
    canvas.add(wallPolygon);

    // Draw center line
    const centerLine = new fabric.Line([start.x, start.y, finalEnd.x, finalEnd.y], {
      stroke: '#3b82f6',
      strokeWidth: 1,
      strokeDashArray: [3, 3],
      selectable: false,
      evented: false,
    });
    (centerLine as any).isPreview = true;
    canvas.add(centerLine);

    // Draw dimension label
    const wallLength = distance(start, finalEnd) / scale;
    const mid = midpoint(start, finalEnd);
    const dimensionLabel = new fabric.Text(formatMeasurement(wallLength), {
      left: mid.x,
      top: mid.y - 20,
      fontSize: 12,
      fill: DIMENSION_COLORS.text,
      backgroundColor: 'rgba(255,255,255,0.9)',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
    (dimensionLabel as any).isPreview = true;
    canvas.add(dimensionLabel);

    // Draw snap indicator
    if (activeSnapPoint && activeSnapPoint.type !== 'grid') {
      const snapIndicator = new fabric.Circle({
        left: activeSnapPoint.point.x - 6,
        top: activeSnapPoint.point.y - 6,
        radius: 6,
        fill: 'transparent',
        stroke: SNAP_COLORS[activeSnapPoint.type],
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      (snapIndicator as any).isPreview = true;
      canvas.add(snapIndicator);
    }

    canvas.renderAll();
  }, [wallType, scale, orthoMode, activeSnapPoint, drawStart]);

  const createWall = useCallback((start: Point, end: Point) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Apply ortho mode
    let finalEnd = end;
    if (orthoMode) {
      finalEnd = snapToOrtho(start, end, true);
    }

    // Check minimum length
    const lengthM = distance(start, finalEnd) / scale;
    if (lengthM < 0.3) return; // Minimum 30cm wall

    const thickness = WALL_THICKNESS[wallType];
    const newWall: Wall = {
      id: `wall_${Date.now()}`,
      type: wallType,
      start,
      end: finalEnd,
      thickness,
      height: 2.8,
      openings: [],
      connectedWalls: [],
    };

    // Find connected walls
    const connectedAtStart = walls.filter(w => 
      distance(start, w.start) < 5 || distance(start, w.end) < 5
    );
    const connectedAtEnd = walls.filter(w => 
      distance(finalEnd, w.start) < 5 || distance(finalEnd, w.end) < 5
    );
    
    newWall.connectedWalls = [
      ...connectedAtStart.map(w => w.id),
      ...connectedAtEnd.map(w => w.id),
    ];

    setWalls(prev => [...prev, newWall]);

    // Update connected walls to reference this new wall
    setWalls(prev => prev.map(w => {
      if (newWall.connectedWalls.includes(w.id)) {
        return {
          ...w,
          connectedWalls: [...w.connectedWalls, newWall.id],
        };
      }
      return w;
    }));

    // Push to history for undo
    pushToHistory({ type: 'ADD_WALL', data: newWall });

  }, [wallType, scale, orthoMode, walls, pushToHistory]);

  // =====================================================
  // ROOM RECTANGLE TOOL
  // =====================================================

  const drawRoomPreview = useCallback((start: Point, end: Point) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Clear previous preview
    const previews = canvas.getObjects().filter((obj: any) => obj.isPreview);
    previews.forEach((obj) => canvas.remove(obj));

    // Normalize rectangle coordinates
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const width = maxX - minX;
    const height = maxY - minY;

    // Draw room rectangle preview
    const roomRect = new fabric.Rect({
      left: minX,
      top: minY,
      width,
      height,
      fill: 'rgba(59, 130, 246, 0.2)',
      stroke: '#3b82f6',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    (roomRect as any).isPreview = true;
    canvas.add(roomRect);

    // Draw dimension labels
    const widthM = pixelsToMeters(width, scale);
    const heightM = pixelsToMeters(height, scale);
    const areaM = widthM * heightM;

    // Width label (top)
    const widthLabel = new fabric.Text(`${widthM.toFixed(2)}m`, {
      left: minX + width / 2,
      top: minY - 20,
      fontSize: 12,
      fill: DIMENSION_COLORS.text,
      backgroundColor: 'rgba(255,255,255,0.9)',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
    (widthLabel as any).isPreview = true;
    canvas.add(widthLabel);

    // Height label (left)
    const heightLabel = new fabric.Text(`${heightM.toFixed(2)}m`, {
      left: minX - 25,
      top: minY + height / 2,
      fontSize: 12,
      fill: DIMENSION_COLORS.text,
      backgroundColor: 'rgba(255,255,255,0.9)',
      originX: 'center',
      originY: 'center',
      angle: -90,
      selectable: false,
      evented: false,
    });
    (heightLabel as any).isPreview = true;
    canvas.add(heightLabel);

    // Area label (center)
    const areaLabel = new fabric.Text(`${areaM.toFixed(1)}m²`, {
      left: minX + width / 2,
      top: minY + height / 2,
      fontSize: 14,
      fontWeight: 'bold',
      fill: '#3b82f6',
      backgroundColor: 'rgba(255,255,255,0.9)',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
    (areaLabel as any).isPreview = true;
    canvas.add(areaLabel);

    canvas.renderAll();
  }, [scale]);

  const createRoom = useCallback((start: Point, end: Point, roomType: RoomType, roomName?: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Normalize rectangle coordinates
    const topLeft: Point = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
    };
    const bottomRight: Point = {
      x: Math.max(start.x, end.x),
      y: Math.max(start.y, end.y),
    };

    // Check minimum size (1m x 1m)
    const widthM = pixelsToMeters(bottomRight.x - topLeft.x, scale);
    const heightM = pixelsToMeters(bottomRight.y - topLeft.y, scale);
    if (widthM < 1 || heightM < 1) return;

    // Create room rectangle data
    const roomRect = {
      topLeft,
      bottomRight,
      roomType,
      roomName: roomName || `${roomType.charAt(0).toUpperCase() + roomType.slice(1).replace('_', ' ')}`,
    };

    // Create walls for the room - map to interior/exterior only
    const roomWallType: 'interior' | 'exterior' = 
      wallType === 'exterior' ? 'exterior' : 'interior';
    const newWalls = createWallsFromRoomRectangle(roomRect, roomWallType);
    
    // Create room object
    const wallIds = newWalls.map(w => w.id);
    const room = createRoomFromRectangle(roomRect, wallIds, scale);
    room.name = roomRect.roomName;
    room.type = roomType;

    // Add walls and room
    setWalls(prev => [...prev, ...newWalls]);
    setRooms(prev => [...prev, room]);

    // Push to history for undo
    pushToHistory({ 
      type: 'ADD_ROOM', 
      data: { room, walls: newWalls } 
    });

    // Clear preview
    const previews = canvas.getObjects().filter((obj: any) => obj.isPreview);
    previews.forEach((obj) => canvas.remove(obj));
    canvas.renderAll();

  }, [scale, wallType, pushToHistory]);

  const placeRoomTemplate = useCallback((position: Point, template: RoomTemplate) => {
    const widthPx = metersToPixels(template.width, scale);
    const heightPx = metersToPixels(template.height, scale);

    // Snap position to grid
    const snappedPos = snapToGrid(position, gridSize, scale);

    const start: Point = {
      x: snappedPos.x - widthPx / 2,
      y: snappedPos.y - heightPx / 2,
    };
    const end: Point = {
      x: snappedPos.x + widthPx / 2,
      y: snappedPos.y + heightPx / 2,
    };

    createRoom(start, end, template.type, template.name);
    setSelectedRoomTemplate(null);
  }, [scale, gridSize, createRoom]);

  // =====================================================
  // DOOR PLACEMENT
  // =====================================================

  const findWallAtPoint = useCallback((point: Point): Wall | null => {
    for (const wall of walls) {
      const dist = pointToWallDistance(point, wall, scale);
      if (dist < 20) { // 20 pixel tolerance
        return wall;
      }
    }
    return null;
  }, [walls, scale]);

  const pointToWallDistance = (point: Point, wall: Wall, scale: number): number => {
    const thicknessPixels = wall.thickness * scale;
    const halfThickness = thicknessPixels / 2;
    
    // Get perpendicular distance to wall centerline
    const A = point.x - wall.start.x;
    const B = point.y - wall.start.y;
    const C = wall.end.x - wall.start.x;
    const D = wall.end.y - wall.start.y;
    
    const lenSq = C * C + D * D;
    if (lenSq === 0) return distance(point, wall.start);
    
    let param = (A * C + B * D) / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const nearestX = wall.start.x + param * C;
    const nearestY = wall.start.y + param * D;
    
    return distance(point, { x: nearestX, y: nearestY });
  };

  const getPositionOnWall = useCallback((point: Point, wall: Wall): number => {
    const wallLength = distance(wall.start, wall.end);
    const distFromStart = distance(wall.start, nearestPointOnLine(point, wall.start, wall.end));
    return distFromStart / wallLength;
  }, []);

  const placeDoor = useCallback((wall: Wall, position: number) => {
    const doorWidth = DOOR_SIZES[doorStyle].width;
    const doorHeight = DOOR_SIZES[doorStyle].height;
    
    const newDoor: Door = {
      id: `door_${Date.now()}`,
      wallId: wall.id,
      style: doorStyle,
      width: doorWidth,
      height: doorHeight,
      position: Math.max(0.1, Math.min(0.9, position)), // Keep 10% from edges
      swingAngle: 90,
      swingDirection: 'inward',
      hingeSide: 'left',
    };

    setDoors(prev => [...prev, newDoor]);
    pushToHistory({ type: 'ADD_DOOR', data: newDoor });
  }, [doorStyle, pushToHistory]);

  const placeWindow = useCallback((wall: Wall, position: number) => {
    const windowWidth = WINDOW_SIZES[windowStyle].width;
    const windowHeight = WINDOW_SIZES[windowStyle].height;
    
    const newWindow: Window = {
      id: `window_${Date.now()}`,
      wallId: wall.id,
      style: windowStyle,
      width: windowWidth,
      height: windowHeight,
      sillHeight: 0.9,
      position: Math.max(0.1, Math.min(0.9, position)),
    };

    setWindows(prev => [...prev, newWindow]);
    pushToHistory({ type: 'ADD_WINDOW', data: newWindow });
  }, [windowStyle, pushToHistory]);

  // =====================================================
  // STAIR PLACEMENT
  // =====================================================

  const placeStair = useCallback((position: Point) => {
    const newStair: Stair = {
      id: `stair_${Date.now()}`,
      x: (position.x / scale) * 100, // convert from pixels to cm
      y: (position.y / scale) * 100,
      width: STAIR_DEFAULTS.width,
      length: STAIR_DEFAULTS.length,
      rotation: 0,
      direction: 'up',
      style: 'straight',
      numSteps: STAIR_DEFAULTS.numSteps,
    };

    setStairs(prev => [...prev, newStair]);
    pushToHistory({ type: 'ADD_STAIR', data: newStair });
  }, [scale, pushToHistory]);

  // =====================================================
  // RENDER DOORS & WINDOWS
  // =====================================================

  const renderDoorsAndWindows = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove existing door/window objects
    const existing = canvas.getObjects().filter((obj: any) => obj.isDoor || obj.isWindow);
    existing.forEach((obj) => canvas.remove(obj));

    // Draw doors
    for (const door of doors) {
      const wall = walls.find(w => w.id === door.wallId);
      if (!wall) continue;

      const wallAngle = angle(wall.start, wall.end);
      const wallLength = distance(wall.start, wall.end);
      const doorWidthPx = door.width * scale;
      
      // Calculate door position on wall
      const doorCenterDist = door.position * wallLength;
      const doorCenter: Point = {
        x: wall.start.x + Math.cos(wallAngle) * doorCenterDist,
        y: wall.start.y + Math.sin(wallAngle) * doorCenterDist,
      };

      // Door opening (gap in wall representation)
      const doorGap = new fabric.Rect({
        left: doorCenter.x - doorWidthPx / 2,
        top: doorCenter.y - (wall.thickness * scale) / 2,
        width: doorWidthPx,
        height: wall.thickness * scale,
        fill: CANVAS_BACKGROUND,
        stroke: DOOR_COLORS.frame,
        strokeWidth: 2,
        angle: (wallAngle * 180) / Math.PI,
        originX: 'center',
        originY: 'center',
        selectable: tool === 'select',
        hasControls: false,
      });
      (doorGap as any).isDoor = true;
      (doorGap as any).doorId = door.id;
      canvas.add(doorGap);

      // Door swing arc
      const swingRadius = doorWidthPx;
      const arcStartAngle = door.hingeSide === 'left' 
        ? wallAngle 
        : wallAngle + Math.PI;
      const arcEndAngle = door.hingeSide === 'left'
        ? wallAngle + Math.PI / 2
        : wallAngle - Math.PI / 2;

      const hingePoint: Point = {
        x: doorCenter.x + (door.hingeSide === 'left' ? -1 : 1) * Math.cos(wallAngle) * doorWidthPx / 2,
        y: doorCenter.y + (door.hingeSide === 'left' ? -1 : 1) * Math.sin(wallAngle) * doorWidthPx / 2,
      };

      // Draw arc path
      const arcPath = `M ${hingePoint.x} ${hingePoint.y} 
        L ${hingePoint.x + Math.cos(arcStartAngle + Math.PI/2) * swingRadius} ${hingePoint.y + Math.sin(arcStartAngle + Math.PI/2) * swingRadius}
        A ${swingRadius} ${swingRadius} 0 0 1 ${hingePoint.x + Math.cos(arcEndAngle + Math.PI/2) * swingRadius} ${hingePoint.y + Math.sin(arcEndAngle + Math.PI/2) * swingRadius}
        Z`;

      const arc = new fabric.Path(arcPath, {
        fill: DOOR_COLORS.swing_arc,
        stroke: DOOR_COLORS.frame,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (arc as any).isDoor = true;
      canvas.add(arc);
    }

    // Draw windows
    for (const win of windows) {
      const wall = walls.find(w => w.id === win.wallId);
      if (!wall) continue;

      const wallAngle = angle(wall.start, wall.end);
      const wallLength = distance(wall.start, wall.end);
      const windowWidthPx = win.width * scale;
      const thicknessPx = wall.thickness * scale;

      // Calculate window position on wall
      const winCenterDist = win.position * wallLength;
      const winCenter: Point = {
        x: wall.start.x + Math.cos(wallAngle) * winCenterDist,
        y: wall.start.y + Math.sin(wallAngle) * winCenterDist,
      };

      // Window frame (rectangle with glass fill)
      const windowRect = new fabric.Rect({
        left: winCenter.x,
        top: winCenter.y,
        width: windowWidthPx,
        height: thicknessPx,
        fill: WINDOW_COLORS.glass,
        stroke: WINDOW_COLORS.frame,
        strokeWidth: 3,
        angle: (wallAngle * 180) / Math.PI,
        originX: 'center',
        originY: 'center',
        selectable: tool === 'select',
        hasControls: false,
      });
      (windowRect as any).isWindow = true;
      (windowRect as any).windowId = win.id;
      canvas.add(windowRect);

      // Window mullion (center line)
      const perpAngle = wallAngle + Math.PI / 2;
      const mullion = new fabric.Line([
        winCenter.x - Math.cos(perpAngle) * thicknessPx / 2,
        winCenter.y - Math.sin(perpAngle) * thicknessPx / 2,
        winCenter.x + Math.cos(perpAngle) * thicknessPx / 2,
        winCenter.y + Math.sin(perpAngle) * thicknessPx / 2,
      ], {
        stroke: WINDOW_COLORS.frame,
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      (mullion as any).isWindow = true;
      canvas.add(mullion);
    }

    canvas.renderAll();
  }, [doors, windows, walls, scale, tool]);

  // =====================================================
  // STAIR RENDERING
  // =====================================================

  const renderStairs = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove existing stair objects
    const existingStairs = canvas.getObjects().filter((obj: any) => obj.isStair);
    existingStairs.forEach((obj) => canvas.remove(obj));

    for (const stair of stairs) {
      const widthPx = stair.width * scale / 100; // convert cm to meters then to pixels
      const lengthPx = stair.length * scale / 100;
      const stepHeight = lengthPx / stair.numSteps;
      
      // Create stair group
      const stairObjects: fabric.Object[] = [];

      // Background rectangle
      const stairBg = new fabric.Rect({
        left: 0,
        top: 0,
        width: widthPx,
        height: lengthPx,
        fill: STAIR_COLORS.fill,
        stroke: STAIR_COLORS.stroke,
        strokeWidth: 2,
      });
      stairObjects.push(stairBg);

      // Draw step lines (horizontal lines across the stair)
      for (let i = 1; i < stair.numSteps; i++) {
        const y = i * stepHeight;
        const stepLine = new fabric.Line([0, y, widthPx, y], {
          stroke: STAIR_COLORS.steps,
          strokeWidth: 1,
        });
        stairObjects.push(stepLine);
      }

      // Draw direction arrow (zigzag line with arrow)
      const centerX = widthPx / 2;
      const arrowStartY = stair.direction === 'up' ? lengthPx - 20 : 20;
      const arrowEndY = stair.direction === 'up' ? 20 : lengthPx - 20;
      
      // Main arrow line
      const arrowLine = new fabric.Line([centerX, arrowStartY, centerX, arrowEndY], {
        stroke: STAIR_COLORS.arrow,
        strokeWidth: 3,
      });
      stairObjects.push(arrowLine);

      // Arrow head
      const arrowHeadSize = 12;
      const arrowTipY = stair.direction === 'up' ? arrowEndY : arrowEndY;
      const arrowDir = stair.direction === 'up' ? -1 : 1;
      
      const arrowHead = new fabric.Triangle({
        left: centerX,
        top: arrowTipY,
        width: arrowHeadSize,
        height: arrowHeadSize,
        fill: STAIR_COLORS.arrow,
        angle: stair.direction === 'up' ? 0 : 180,
        originX: 'center',
        originY: stair.direction === 'up' ? 'top' : 'bottom',
      });
      stairObjects.push(arrowHead);

      // Direction label
      const dirLabel = new fabric.Text(stair.direction.toUpperCase(), {
        left: centerX,
        top: stair.direction === 'up' ? lengthPx - 35 : 35,
        fontSize: 10,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        fill: STAIR_COLORS.arrow,
        originX: 'center',
        originY: 'center',
      });
      stairObjects.push(dirLabel);

      // Create group
      const stairGroup = new fabric.Group(stairObjects, {
        left: stair.x * scale / 100,
        top: stair.y * scale / 100,
        angle: stair.rotation,
        originX: 'left',
        originY: 'top',
        selectable: tool === 'select',
        hasControls: tool === 'select',
        hasBorders: true,
        lockScalingX: true,
        lockScalingY: true,
      });
      (stairGroup as any).isStair = true;
      (stairGroup as any).stairId = stair.id;
      
      canvas.add(stairGroup);
    }

    canvas.renderAll();
  }, [stairs, scale, tool]);

  // =====================================================
  // DIMENSION LINES
  // =====================================================

  const addDimensionToWall = useCallback((wall: Wall) => {
    const wallLength = getWallLength(wall, scale);
    const wallAngle = angle(wall.start, wall.end);
    const perpAngle = wallAngle + Math.PI / 2;
    
    // Offset dimension line from wall
    const offset = DIMENSION_OFFSET;
    
    const dimStart: Point = {
      x: wall.start.x + Math.cos(perpAngle) * offset,
      y: wall.start.y + Math.sin(perpAngle) * offset,
    };
    const dimEnd: Point = {
      x: wall.end.x + Math.cos(perpAngle) * offset,
      y: wall.end.y + Math.sin(perpAngle) * offset,
    };

    const newDimension: Dimension = {
      id: `dim_${Date.now()}`,
      type: 'linear',
      start: dimStart,
      end: dimEnd,
      offset,
      value: wallLength,
      associatedObjectId: wall.id,
    };

    setDimensions(prev => [...prev, newDimension]);
  }, [scale]);

  const renderDimensions = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove existing dimension objects
    const existing = canvas.getObjects().filter((obj: any) => obj.isDimension);
    existing.forEach((obj) => canvas.remove(obj));

    for (const dim of dimensions) {
      const dimAngle = angle(dim.start, dim.end);
      const perpAngle = dimAngle + Math.PI / 2;
      const dimMid = midpoint(dim.start, dim.end);
      
      // Extension lines (from wall to dimension line)
      const wall = walls.find(w => w.id === dim.associatedObjectId);
      if (wall) {
        const ext1 = new fabric.Line([
          wall.start.x, wall.start.y,
          dim.start.x, dim.start.y,
        ], {
          stroke: DIMENSION_COLORS.extension,
          strokeWidth: 1,
          strokeDashArray: [2, 2],
          selectable: false,
          evented: false,
        });
        (ext1 as any).isDimension = true;
        canvas.add(ext1);

        const ext2 = new fabric.Line([
          wall.end.x, wall.end.y,
          dim.end.x, dim.end.y,
        ], {
          stroke: DIMENSION_COLORS.extension,
          strokeWidth: 1,
          strokeDashArray: [2, 2],
          selectable: false,
          evented: false,
        });
        (ext2 as any).isDimension = true;
        canvas.add(ext2);
      }

      // Main dimension line
      const dimLine = new fabric.Line([
        dim.start.x, dim.start.y,
        dim.end.x, dim.end.y,
      ], {
        stroke: DIMENSION_COLORS.line,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (dimLine as any).isDimension = true;
      canvas.add(dimLine);

      // Arrows at ends
      const arrowSize = 8;
      const arrow1Points = [
        { x: dim.start.x, y: dim.start.y },
        { x: dim.start.x + Math.cos(dimAngle + 0.4) * arrowSize, y: dim.start.y + Math.sin(dimAngle + 0.4) * arrowSize },
        { x: dim.start.x + Math.cos(dimAngle - 0.4) * arrowSize, y: dim.start.y + Math.sin(dimAngle - 0.4) * arrowSize },
      ];
      const arrow1 = new fabric.Polygon(arrow1Points, {
        fill: DIMENSION_COLORS.arrow,
        stroke: DIMENSION_COLORS.arrow,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (arrow1 as any).isDimension = true;
      canvas.add(arrow1);

      const arrow2Points = [
        { x: dim.end.x, y: dim.end.y },
        { x: dim.end.x + Math.cos(dimAngle + Math.PI + 0.4) * arrowSize, y: dim.end.y + Math.sin(dimAngle + Math.PI + 0.4) * arrowSize },
        { x: dim.end.x + Math.cos(dimAngle + Math.PI - 0.4) * arrowSize, y: dim.end.y + Math.sin(dimAngle + Math.PI - 0.4) * arrowSize },
      ];
      const arrow2 = new fabric.Polygon(arrow2Points, {
        fill: DIMENSION_COLORS.arrow,
        stroke: DIMENSION_COLORS.arrow,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (arrow2 as any).isDimension = true;
      canvas.add(arrow2);

      // Dimension text
      const textAngleDeg = (dimAngle * 180) / Math.PI;
      const adjustedAngle = textAngleDeg > 90 || textAngleDeg < -90 ? textAngleDeg + 180 : textAngleDeg;
      
      const dimText = new fabric.Text(formatMeasurement(dim.value), {
        left: dimMid.x,
        top: dimMid.y - 8,
        fontSize: DIMENSION_COLORS.text ? 11 : 11,
        fill: DIMENSION_COLORS.text,
        backgroundColor: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        angle: adjustedAngle,
        selectable: false,
        evented: false,
      });
      (dimText as any).isDimension = true;
      canvas.add(dimText);
    }

    canvas.renderAll();
  }, [dimensions, walls]);

  // Re-render doors, windows, stairs, dimensions when they change
  useEffect(() => {
    renderDoorsAndWindows();
  }, [doors, windows, renderDoorsAndWindows]);

  useEffect(() => {
    renderStairs();
  }, [stairs, renderStairs]);

  useEffect(() => {
    renderDimensions();
  }, [dimensions, renderDimensions]);

  // =====================================================
  // RENDER WALLS ON CANVAS
  // =====================================================

  const renderWalls = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove existing wall objects
    const existingWalls = canvas.getObjects().filter((obj: any) => obj.isWall);
    existingWalls.forEach((obj) => canvas.remove(obj));

    // Draw each wall
    for (const wall of walls) {
      const polygon = getWallPolygon(wall, scale);
      const colors = WALL_COLORS[wall.type];
      
      const wallShape = new fabric.Polygon(polygon, {
        fill: colors.fill,
        stroke: wall.id === selectedWallId ? SELECTION_COLOR : colors.stroke,
        strokeWidth: wall.id === selectedWallId ? 3 : 2,
        selectable: tool === 'select',
        hasControls: false,
        hasBorders: true,
      });
      (wallShape as any).isWall = true;
      (wallShape as any).wallId = wall.id;

      canvas.add(wallShape);

      // Add wall dimension label
      const length = getWallLength(wall, scale);
      const mid = midpoint(wall.start, wall.end);
      const wallAngle = angleDegrees(wall.start, wall.end);
      
      const label = new fabric.Text(formatMeasurement(length), {
        left: mid.x,
        top: mid.y,
        fontSize: 10,
        fill: '#666',
        originX: 'center',
        originY: 'center',
        angle: wallAngle > 90 || wallAngle < -90 ? wallAngle + 180 : wallAngle,
        selectable: false,
        evented: false,
      });
      (label as any).isWall = true;
      (label as any).isWallLabel = true;
      canvas.add(label);
    }

    canvas.renderAll();
  }, [walls, scale, selectedWallId, tool]);

  // Re-render walls when they change
  useEffect(() => {
    // Skip re-rendering if we're in the middle of dragging a room
    if (isDraggingRoomRef.current) return;
    
    renderWalls();
    detectAndRenderRooms();
    notifyMeasurementsChange();
  }, [walls]);

  // =====================================================
  // ROOM DETECTION & RENDERING
  // =====================================================

  const detectAndRenderRooms = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove existing room fills from canvas
    const existingRoomFills = canvas.getObjects().filter((obj: any) => obj.isRoomFill);
    existingRoomFills.forEach((obj) => canvas.remove(obj));

    // Separate user-created rooms (have boundaryWalls) from detected rooms
    const userCreatedRooms = rooms.filter(r => r.boundaryWalls && r.boundaryWalls.length > 0);
    
    // For user-created rooms, update their polygon based on current wall positions
    const updatedUserRooms = userCreatedRooms.map(room => {
      // Find the walls for this room
      const roomWalls = walls.filter(w => room.boundaryWalls.includes(w.id));
      if (roomWalls.length === 4) {
        // Recalculate polygon from wall positions
        const allPoints = roomWalls.flatMap(w => [w.start, w.end]);
        const minX = Math.min(...allPoints.map(p => p.x));
        const maxX = Math.max(...allPoints.map(p => p.x));
        const minY = Math.min(...allPoints.map(p => p.y));
        const maxY = Math.max(...allPoints.map(p => p.y));
        
        const newPolygon = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        const newCentroid = {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
        };
        const areaPixels = calculatePolygonArea(newPolygon);
        const areaSqm = pixelAreaToSquareMeters(areaPixels, scale);
        
        return {
          ...room,
          polygon: newPolygon,
          centroid: newCentroid,
          area: areaSqm,
        };
      }
      return room;
    });

    // Detect additional rooms from walls that aren't part of user-created rooms
    const userWallIds = new Set(userCreatedRooms.flatMap(r => r.boundaryWalls));
    const freeWalls = walls.filter(w => !userWallIds.has(w.id));
    
    // Only detect rooms from free walls if there are enough
    let detectedRooms: Room[] = [];
    if (freeWalls.length >= 4) {
      const detectedPolygons = detectRoomsFromWalls(freeWalls, scale);
      detectedRooms = detectedPolygons.map((polygon, index) => {
        const areaPixels = calculatePolygonArea(polygon);
        const areaSqm = pixelAreaToSquareMeters(areaPixels, scale);
        const centroid = calculateCentroid(polygon);
        const perimeter = calculatePerimeter(polygon) / scale;

        return {
          id: `room_detected_${Date.now()}_${index}`,
          name: `Room ${updatedUserRooms.length + index + 1}`,
          type: 'bedroom' as RoomType,
          boundaryWalls: [], // Detected rooms don't have specific walls
          area: areaSqm,
          perimeter,
          centroid,
          polygon,
          floorLevel: 0,
          ceilingHeight: 2.8,
        };
      });
    }

    // Combine user rooms and detected rooms
    const allRooms = [...updatedUserRooms, ...detectedRooms];

    // Render room fills
    for (const room of allRooms) {
      const colors = ROOM_COLORS[room.type];
      
      // Check if this room has boundary walls (created via room tool)
      const hasBoundaryWalls = room.boundaryWalls && room.boundaryWalls.length > 0;
      const isMovable = hasBoundaryWalls && tool === 'select';
      
      // Calculate room dimensions from polygon bounding box
      const minX = Math.min(...room.polygon.map(p => p.x));
      const maxX = Math.max(...room.polygon.map(p => p.x));
      const minY = Math.min(...room.polygon.map(p => p.y));
      const maxY = Math.max(...room.polygon.map(p => p.y));
      const roomWidth = maxX - minX;
      const roomHeight = maxY - minY;
      const widthM = pixelsToMeters(roomWidth, scale);
      const heightM = pixelsToMeters(roomHeight, scale);
      const dimensionText = `${widthM.toFixed(1)}m × ${heightM.toFixed(1)}m`;

      if (isMovable) {
        // Use Fabric.js Group with Rect for movable rooms (no drag bugs!)
        const roomRect = new fabric.Rect({
          width: roomWidth,
          height: roomHeight,
          fill: colors.fill,
          stroke: colors.stroke,
          strokeWidth: 2,
          strokeDashArray: [5, 5],
          originX: 'left',
          originY: 'top',
        });

        const label = new fabric.Text(`${room.name}\n${dimensionText}\n${formatArea(room.area)}`, {
          left: roomWidth / 2,
          top: roomHeight / 2,
          fontSize: 11,
          fill: colors.label,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          fontWeight: 'bold',
        });

        // Create a group positioned at the room's top-left corner
        const roomGroup = new fabric.Group([roomRect, label], {
          left: minX,
          top: minY,
          selectable: true,
          evented: true,
          hasControls: false,
          hasBorders: true,
          lockRotation: true,
          lockScalingX: true,
          lockScalingY: true,
          hoverCursor: 'move',
          moveCursor: 'move',
        });
        (roomGroup as any).isRoomFill = true;
        (roomGroup as any).isRoomGroup = true;
        (roomGroup as any).roomId = room.id;
        (roomGroup as any).boundaryWalls = room.boundaryWalls || [];
        (roomGroup as any).originalLeft = minX;
        (roomGroup as any).originalTop = minY;
        
        canvas.add(roomGroup);
      } else {
        // Non-movable rooms use simple polygon (no interaction needed)
        const roomFill = new fabric.Polygon(room.polygon, {
          fill: colors.fill,
          stroke: 'transparent',
          strokeWidth: 0,
          selectable: false,
          evented: false,
        });
        (roomFill as any).isRoomFill = true;
        (roomFill as any).roomId = room.id;
        
        canvas.add(roomFill);
        canvas.sendToBack(roomFill);

        // Room label for non-movable rooms
        const label = new fabric.Text(`${room.name}\n${dimensionText}\n${formatArea(room.area)}`, {
          left: room.centroid.x,
          top: room.centroid.y,
          fontSize: 11,
          fill: colors.label,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
          fontWeight: 'bold',
        });
        (label as any).isRoomFill = true;
        canvas.add(label);
      }
    }

    // Move grid to very back
    const gridObjects = canvas.getObjects().filter((obj: any) => obj.isGrid);
    gridObjects.forEach((obj) => canvas.sendToBack(obj));

    // Only update rooms state if there are changes
    if (JSON.stringify(allRooms) !== JSON.stringify(rooms)) {
      setRooms(allRooms);
    }
    canvas.renderAll();
  }, [walls, rooms, scale, tool]);

  // =====================================================
  // MOUSE EVENT HANDLERS
  // =====================================================

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: fabric.IEvent) => {
      if (readonly) return;

      const pointer = canvas.getPointer(e.e);
      const snappedPoint = calculateSnapPoint(pointer as Point);

      if (tool === 'wall') {
        if (!isDrawing) {
          // Start wall
          setIsDrawing(true);
          setDrawStart(snappedPoint);
        } else {
          // Finish wall
          if (drawStart) {
            createWall(drawStart, snappedPoint);
          }
          // Continue drawing from end point (chain walls)
          setDrawStart(snappedPoint);
        }
      } else if (tool === 'room') {
        // Room rectangle tool - first click sets start
        if (!isDrawing) {
          setIsDrawing(true);
          setRoomDrawStart(snappedPoint);
        } else {
          // Second click finalizes room
          if (roomDrawStart) {
            // Show room type dialog before creating
            const normalizedStart: Point = {
              x: Math.min(roomDrawStart.x, snappedPoint.x),
              y: Math.min(roomDrawStart.y, snappedPoint.y),
            };
            const normalizedEnd: Point = {
              x: Math.max(roomDrawStart.x, snappedPoint.x),
              y: Math.max(roomDrawStart.y, snappedPoint.y),
            };
            const widthM = pixelsToMeters(normalizedEnd.x - normalizedStart.x, scale);
            const heightM = pixelsToMeters(normalizedEnd.y - normalizedStart.y, scale);
            
            if (widthM >= 1 && heightM >= 1) {
              setPendingRoomPolygon([normalizedStart, normalizedEnd]);
              setNewRoomName('');
              setNewRoomType('bedroom');
              setShowRoomDialog(true);
            }
          }
          setIsDrawing(false);
          setRoomDrawStart(null);
          // Clear preview
          const previews = canvas.getObjects().filter((obj: any) => obj.isPreview);
          previews.forEach((obj) => canvas.remove(obj));
          canvas.renderAll();
        }
      } else if (tool === 'room_label') {
        // Room label tool - click inside existing room to change type
        const clickedRoom = findRoomAtPoint(snappedPoint, rooms);
        if (clickedRoom) {
          setSelectedRoomId(clickedRoom.id);
          setNewRoomName(clickedRoom.name);
          setNewRoomType(clickedRoom.type);
          setShowRoomDialog(true);
        } else {
          // Check if point is inside an enclosed area (unlabeled room)
          const enclosedPolygon = findEnclosedRegionAtPoint(snappedPoint, walls, scale);
          if (enclosedPolygon) {
            setPendingRoomPolygon([
              { x: Math.min(...enclosedPolygon.map(p => p.x)), y: Math.min(...enclosedPolygon.map(p => p.y)) },
              { x: Math.max(...enclosedPolygon.map(p => p.x)), y: Math.max(...enclosedPolygon.map(p => p.y)) },
            ]);
            setNewRoomName('');
            setNewRoomType('bedroom');
            setShowRoomDialog(true);
          }
        }
      } else if (tool === 'door') {
        // Place door on clicked wall
        const wall = findWallAtPoint(snappedPoint);
        if (wall) {
          const position = getPositionOnWall(snappedPoint, wall);
          placeDoor(wall, position);
        }
      } else if (tool === 'window') {
        // Place window on clicked wall
        const wall = findWallAtPoint(snappedPoint);
        if (wall) {
          const position = getPositionOnWall(snappedPoint, wall);
          placeWindow(wall, position);
        }
      } else if (tool === 'stair') {
        // Place stair at clicked point
        placeStair(snappedPoint);
      } else if (tool === 'dimension') {
        // Add dimension to clicked wall
        const wall = findWallAtPoint(snappedPoint);
        if (wall) {
          addDimensionToWall(wall);
        }
      } else if (tool === 'select') {
        // Handle template placement if one is selected
        if (selectedRoomTemplate) {
          placeRoomTemplate(snappedPoint, selectedRoomTemplate);
          return;
        }
        
        // Handle selection
        const target = e.target as any;
        if (target?.wallId) {
          setSelectedWallId(target.wallId);
          setSelectedRoomId(null);
        } else if (target?.doorId) {
          // Could add door selection here
          setSelectedWallId(null);
          setSelectedRoomId(null);
        } else if (target?.windowId) {
          // Could add window selection here
          setSelectedWallId(null);
          setSelectedRoomId(null);
        } else if (target?.roomId) {
          setSelectedRoomId(target.roomId);
          setSelectedWallId(null);
        } else {
          setSelectedWallId(null);
          setSelectedRoomId(null);
        }
      }
    };

    const handleMouseMove = (e: fabric.IEvent) => {
      const pointer = canvas.getPointer(e.e);
      const snappedPoint = calculateSnapPoint(pointer as Point);
      setCurrentPoint(snappedPoint);

      if (tool === 'wall' && isDrawing && drawStart) {
        drawWallPreview(drawStart, snappedPoint);
      }

      if (tool === 'room' && isDrawing && roomDrawStart) {
        drawRoomPreview(roomDrawStart, snappedPoint);
      }
      
      // Highlight wall under cursor for door/window/dimension tools
      if (tool === 'door' || tool === 'window' || tool === 'dimension') {
        const wall = findWallAtPoint(snappedPoint);
        // Could add hover highlight here
      }
    };

    const handleMouseDblClick = () => {
      if (tool === 'wall' && isDrawing) {
        // Double-click ends wall chain
        setIsDrawing(false);
        setDrawStart(null);
        // Clear preview
        const previews = canvas.getObjects().filter((obj: any) => obj.isPreview);
        previews.forEach((obj) => canvas.remove(obj));
        canvas.renderAll();
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:dblclick', handleMouseDblClick);

    // Handle start of room dragging
    const handleObjectMoving = (e: fabric.IEvent) => {
      const target = e.target as any;
      if (target?.isRoomGroup) {
        isDraggingRoomRef.current = true;
      }
    };

    // Handle room movement - update walls when room drag ends
    const handleObjectModified = (e: fabric.IEvent) => {
      const target = e.target as any;
      
      // Only handle room groups (Groups with isRoomGroup flag)
      if (!target?.isRoomGroup || !target?.boundaryWalls || target.boundaryWalls.length === 0) {
        isDraggingRoomRef.current = false;
        return;
      }
      
      const roomId = target.roomId;
      const boundaryWallIds = [...target.boundaryWalls]; // Copy to avoid closure issues
      
      // Use ref for latest rooms state
      const currentRooms = roomsRef.current;
      const room = currentRooms.find(r => r.id === roomId);
      if (!room) {
        isDraggingRoomRef.current = false;
        return;
      }

      // For Groups: left/top is the new position after dragging
      const newLeft = target.left || 0;
      const newTop = target.top || 0;
      
      // Original position was stored when group was created
      const originalLeft = target.originalLeft || 0;
      const originalTop = target.originalTop || 0;
      
      // Calculate movement delta
      const deltaX = newLeft - originalLeft;
      const deltaY = newTop - originalTop;
      
      // Skip tiny movements
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        isDraggingRoomRef.current = false;
        return;
      }

      console.log('Moving room:', roomId, 'delta:', deltaX.toFixed(0), deltaY.toFixed(0));
      
      // Update all boundary walls by the delta
      setWalls(prevWalls => prevWalls.map(wall => {
        if (boundaryWallIds.includes(wall.id)) {
          return {
            ...wall,
            start: { x: wall.start.x + deltaX, y: wall.start.y + deltaY },
            end: { x: wall.end.x + deltaX, y: wall.end.y + deltaY },
          };
        }
        return wall;
      }));
      
      // Update room centroid and polygon  
      setRooms(prevRooms => prevRooms.map(r => {
        if (r.id === roomId) {
          return {
            ...r,
            centroid: { x: r.centroid.x + deltaX, y: r.centroid.y + deltaY },
            polygon: r.polygon.map(p => ({
              x: p.x + deltaX,
              y: p.y + deltaY,
            })),
          };
        }
        return r;
      }));
      
      // Update the original position for next move
      target.originalLeft = newLeft;
      target.originalTop = newTop;
      
      // Mark drag as complete and trigger re-render after a short delay
      setTimeout(() => {
        isDraggingRoomRef.current = false;
        renderWalls();
        detectAndRenderRooms();
        notifyMeasurementsChange();
      }, 50);
    };

    canvas.on('object:moving', handleObjectMoving);
    canvas.on('object:modified', handleObjectModified);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:dblclick', handleMouseDblClick);
      canvas.off('object:moving', handleObjectMoving);
      canvas.off('object:modified', handleObjectModified);
    };
  }, [canvasReady, tool, isDrawing, drawStart, roomDrawStart, calculateSnapPoint, createWall, drawWallPreview, drawRoomPreview, readonly, findWallAtPoint, getPositionOnWall, placeDoor, placeWindow, addDimensionToWall, rooms, walls, scale, selectedRoomTemplate, placeRoomTemplate]);

  // =====================================================
  // KEYBOARD SHORTCUTS
  // =====================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readonly) return;
      
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w':
          setTool('wall');
          break;
        case 'r':
          setTool('room');
          break;
        case 'l':
          setTool('room_label');
          break;
        case 's':
          setTool('select');
          break;
        case 'd':
          setTool('door');
          break;
        case 'n':
          setTool('window');
          break;
        case 'a':
          setTool('stair');
          break;
        case 'm':
          setTool('dimension');
          break;
        case 'g':
          setSnapSettings(prev => ({ ...prev, enabled: !prev.enabled }));
          break;
        case 'o':
          setOrthoMode(prev => !prev);
          break;
        case 't':
          setShowTemplatePanel(prev => !prev);
          break;
        case 'escape':
          setIsDrawing(false);
          setDrawStart(null);
          setRoomDrawStart(null);
          setSelectedWallId(null);
          setSelectedRoomTemplate(null);
          setShowRoomDialog(false);
          // Clear previews
          const canvas = fabricCanvasRef.current;
          if (canvas) {
            const previews = canvas.getObjects().filter((obj: any) => obj.isPreview);
            previews.forEach((obj) => canvas.remove(obj));
            canvas.renderAll();
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectedWallId) {
            deleteWall(selectedWallId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readonly, selectedWallId, undo, redo]);

  // =====================================================
  // ACTIONS
  // =====================================================

  const deleteWall = useCallback((wallId: string) => {
    const wall = walls.find(w => w.id === wallId);
    if (wall) {
      pushToHistory({ type: 'DELETE_WALL', data: wall });
    }
    setWalls(prev => prev.filter(w => w.id !== wallId));
    setSelectedWallId(null);
  }, [walls, pushToHistory]);

  const handleClear = () => {
    // Save current state for undo
    pushToHistory({
      type: 'CLEAR_ALL',
      data: {},
      inverseData: { walls, doors, windows, stairs, rooms, dimensions },
    });

    setWalls([]);
    setDoors([]);
    setWindows([]);
    setStairs([]);
    setRooms([]);
    setDimensions([]);
    setIsDrawing(false);
    setDrawStart(null);
    setRoomDrawStart(null);
    
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.clear();
      canvas.backgroundColor = CANVAS_BACKGROUND;
      drawGrid(canvas);
    }
  };

  // Room dialog handlers
  const handleConfirmRoom = useCallback(() => {
    if (pendingRoomPolygon && pendingRoomPolygon.length === 2) {
      // Creating a new room from rectangle
      createRoom(pendingRoomPolygon[0], pendingRoomPolygon[1], newRoomType, newRoomName || undefined);
    } else if (selectedRoomId) {
      // Updating existing room type/name
      const oldRoom = rooms.find(r => r.id === selectedRoomId);
      if (oldRoom) {
        const updatedRoom = { ...oldRoom, type: newRoomType, name: newRoomName || oldRoom.name };
        pushToHistory({
          type: 'UPDATE_ROOM',
          data: updatedRoom,
          inverseData: oldRoom,
        });
        setRooms(prev => prev.map(r => r.id === selectedRoomId ? updatedRoom : r));
      }
    }
    
    setShowRoomDialog(false);
    setPendingRoomPolygon(null);
    setSelectedRoomId(null);
  }, [pendingRoomPolygon, selectedRoomId, newRoomType, newRoomName, createRoom, rooms, pushToHistory]);

  const handleZoomIn = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const newZoom = Math.min(zoom * 1.2, 3);
    setZoom(newZoom);
    canvas.setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const newZoom = Math.max(zoom / 1.2, 0.5);
    setZoom(newZoom);
    canvas.setZoom(newZoom);
  };

  const handleResetView = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    setZoom(1);
    canvas.setZoom(1);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  };

  // =====================================================
  // SAVE/LOAD
  // =====================================================

  const saveFloorPlan = useCallback((): string => {
    const floorPlanData = {
      version: '2.0',
      floorNumber,
      floorLabel,
      walls,
      doors,
      windows,
      stairs,
      rooms,
      dimensions,
      scale,
      gridSize,
    };
    return JSON.stringify(floorPlanData);
  }, [walls, doors, windows, stairs, rooms, dimensions, scale, gridSize, floorNumber, floorLabel]);

  const loadFloorPlan = (data: string | object) => {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (parsed.walls) setWalls(parsed.walls);
      if (parsed.doors) setDoors(parsed.doors);
      if (parsed.windows) setWindows(parsed.windows);
      if (parsed.stairs) setStairs(parsed.stairs);
      if (parsed.rooms) setRooms(parsed.rooms);
      if (parsed.dimensions) setDimensions(parsed.dimensions);
      if (parsed.scale) setScale(parsed.scale);
      if (parsed.gridSize) setGridSize(parsed.gridSize);
    } catch (err) {
      console.error('Failed to load floor plan:', err);
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

  const handleExportPNG = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Temporarily hide grid for clean export
    const gridObjects = canvas.getObjects().filter((obj: any) => obj.isGrid);
    gridObjects.forEach((obj) => obj.set('visible', false));
    
    // Temporarily hide preview objects
    const previewObjects = canvas.getObjects().filter((obj: any) => obj.isPreview);
    previewObjects.forEach((obj) => obj.set('visible', false));
    
    canvas.renderAll();

    // Export to PNG with white background
    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2, // 2x resolution for crisp prints
    });

    // Restore grid visibility
    gridObjects.forEach((obj) => obj.set('visible', true));
    previewObjects.forEach((obj) => obj.set('visible', true));
    canvas.renderAll();

    // Download
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'floor-plan.png';
    a.click();
  };

  const handleExportSVG = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Temporarily hide grid for clean export
    const gridObjects = canvas.getObjects().filter((obj: any) => obj.isGrid);
    gridObjects.forEach((obj) => obj.set('visible', false));
    
    // Temporarily hide preview objects
    const previewObjects = canvas.getObjects().filter((obj: any) => obj.isPreview);
    previewObjects.forEach((obj) => obj.set('visible', false));
    
    canvas.renderAll();

    // Export to SVG
    const svg = canvas.toSVG();

    // Restore grid visibility
    gridObjects.forEach((obj) => obj.set('visible', true));
    previewObjects.forEach((obj) => obj.set('visible', true));
    canvas.renderAll();

    // Download
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floor-plan.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Get floor plan as base64 PNG for embedding in reports
   * This is used by the report generation service
   */
  const getFloorPlanImage = useCallback((): string => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return '';

    // Temporarily hide grid for clean export
    const gridObjects = canvas.getObjects().filter((obj: any) => obj.isGrid);
    gridObjects.forEach((obj) => obj.set('visible', false));
    
    const previewObjects = canvas.getObjects().filter((obj: any) => obj.isPreview);
    previewObjects.forEach((obj) => obj.set('visible', false));
    
    canvas.renderAll();

    // Export to PNG
    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2,
    });

    // Restore visibility
    gridObjects.forEach((obj) => obj.set('visible', true));
    previewObjects.forEach((obj) => obj.set('visible', true));
    canvas.renderAll();

    return dataURL;
  }, []);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      loadFloorPlan(json);
    };
    reader.readAsText(file);
  };

  // =====================================================
  // MEASUREMENTS CALLBACK
  // =====================================================

  const notifyMeasurementsChange = useCallback(() => {
    const totalArea = rooms.reduce((sum, r) => sum + r.area, 0);
    const usableArea = rooms
      .filter(r => !['corridor', 'storage', 'stairwell'].includes(r.type))
      .reduce((sum, r) => sum + r.area, 0);

    const measurements: PropertyMeasurements = {
      builtArea: totalArea,
      usableArea,
      bedrooms: rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length,
      bathrooms: rooms.filter(r => r.type === 'bathroom' || r.type === 'master_bathroom').length,
      kitchens: rooms.filter(r => r.type === 'kitchen').length,
      livingAreas: rooms.filter(r => r.type === 'living_room').length,
      buildingEfficiency: totalArea > 0 ? usableArea / totalArea : 0,
      layoutQualityScore: calculateLayoutScore(),
      roomBreakdown: rooms.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        area: r.area,
        dimensions: { length: 0, width: 0 }, // TODO: calculate from polygon
      })),
      floorPlanData: saveFloorPlan(),
      validationResults: validateFloorPlan(),
    };

    // Notify parent of measurements change
    if (onMeasurementsChange) {
      onMeasurementsChange(measurements);
    }

    // Notify parent of full floor plan data including image
    if (onFloorPlanChange) {
      onFloorPlanChange({
        json: saveFloorPlan(),
        imageDataUrl: getFloorPlanImage(),
        measurements,
      });
    }
  }, [rooms, onMeasurementsChange, onFloorPlanChange, saveFloorPlan, getFloorPlanImage]);

  const calculateLayoutScore = (): number => {
    let score = 100;
    
    const bedrooms = rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom');
    const bathrooms = rooms.filter(r => r.type === 'bathroom' || r.type === 'master_bathroom');
    
    // Bathroom ratio
    if (bedrooms.length > 0 && bathrooms.length / bedrooms.length < 0.5) {
      score -= 10;
    }

    // Room size checks
    for (const room of rooms) {
      const minSize = MINIMUM_ROOM_SIZES[room.type];
      if (room.area < minSize) {
        score -= 5;
      }
    }

    return Math.max(0, Math.min(100, score));
  };

  const validateFloorPlan = () => {
    const issues: string[] = [];
    const recommendations: string[] = [];

    const bedrooms = rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom');
    const bathrooms = rooms.filter(r => r.type === 'bathroom' || r.type === 'master_bathroom');
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const livingAreas = rooms.filter(r => r.type === 'living_room');

    if (bedrooms.length === 0) issues.push('No bedrooms defined');
    if (bathrooms.length === 0) issues.push('No bathrooms defined');
    if (kitchens.length === 0) issues.push('No kitchen defined');
    if (livingAreas.length === 0) issues.push('No living area defined');

    for (const room of rooms) {
      const minSize = MINIMUM_ROOM_SIZES[room.type];
      if (room.area < minSize) {
        issues.push(`${room.name} is below minimum size (${room.area.toFixed(1)}m² < ${minSize}m²)`);
      }
    }

    let readiness = 0;
    if (bedrooms.length > 0) readiness += 25;
    if (bathrooms.length > 0) readiness += 25;
    if (kitchens.length > 0) readiness += 20;
    if (livingAreas.length > 0) readiness += 20;
    if (rooms.reduce((sum, r) => sum + r.area, 0) >= 30) readiness += 10;

    return {
      isComplete: issues.length === 0 && readiness >= 90,
      issues,
      recommendations,
      readiness,
    };
  };

  // =====================================================
  // BUILDING SUMMARY
  // =====================================================

  const summary: BuildingSummary = {
    totalBuiltArea: rooms.reduce((sum, r) => sum + r.area, 0),
    usableArea: rooms.filter(r => !['corridor', 'storage'].includes(r.type)).reduce((sum, r) => sum + r.area, 0),
    exteriorWallLength: walls.filter(w => w.type === 'exterior').reduce((sum, w) => sum + getWallLength(w, scale), 0),
    interiorWallLength: walls.filter(w => w.type === 'interior').reduce((sum, w) => sum + getWallLength(w, scale), 0),
    roomCount: rooms.length,
    bedroomCount: rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length,
    bathroomCount: rooms.filter(r => r.type === 'bathroom' || r.type === 'master_bathroom').length,
    kitchenCount: rooms.filter(r => r.type === 'kitchen').length,
    livingAreaCount: rooms.filter(r => r.type === 'living_room').length,
    buildingEfficiency: 0,
    layoutQualityScore: calculateLayoutScore(),
    validationIssues: validateFloorPlan().issues,
    validationRecommendations: validateFloorPlan().recommendations,
    valuationReadiness: validateFloorPlan().readiness,
  };

  summary.buildingEfficiency = summary.totalBuiltArea > 0 
    ? summary.usableArea / summary.totalBuiltArea 
    : 0;

  // =====================================================
  // RENDER UI
  // =====================================================

  return (
    <div className="flex flex-col h-full bg-zinc-900" ref={containerRef}>
      {/* Room Type Dialog */}
      {showRoomDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 rounded-lg p-4 w-80 border border-zinc-700 shadow-xl">
            <h3 className="text-white font-bold mb-4">
              {selectedRoomId ? 'Edit Room' : 'Create Room'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Room Name</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g., Master Bedroom"
                  className="w-full bg-zinc-700 text-white text-sm px-3 py-2 rounded border border-zinc-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Room Type</label>
                <select
                  value={newRoomType}
                  onChange={(e) => setNewRoomType(e.target.value as RoomType)}
                  className="w-full bg-zinc-700 text-white text-sm px-3 py-2 rounded border border-zinc-600 focus:border-amber-500 focus:outline-none"
                >
                  <optgroup label="Bedrooms">
                    <option value="bedroom">🛏️ Bedroom</option>
                    <option value="master_bedroom">🛏️ Master Bedroom</option>
                  </optgroup>
                  <optgroup label="Bathrooms">
                    <option value="bathroom">🚿 Bathroom</option>
                    <option value="master_bathroom">🛁 Master Bathroom</option>
                  </optgroup>
                  <optgroup label="Living Areas">
                    <option value="living_room">🛋️ Living Room</option>
                    <option value="dining_room">🍽️ Dining Room</option>
                    <option value="kitchen">🍳 Kitchen</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="office">💼 Office</option>
                    <option value="storage">📦 Storage</option>
                    <option value="corridor">🚪 Corridor</option>
                    <option value="garage">🚗 Garage</option>
                    <option value="laundry">🧺 Laundry</option>
                    <option value="balcony">🌳 Balcony</option>
                    <option value="porch">🏠 Porch</option>
                    <option value="utility">🔧 Utility</option>
                    <option value="stairwell">🔼 Stairwell</option>
                  </optgroup>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRoomDialog(false);
                  setPendingRoomPolygon(null);
                  setSelectedRoomId(null);
                }}
                className="flex-1 px-3 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRoom}
                className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-black font-bold rounded"
              >
                {selectedRoomId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-zinc-800 border-b border-zinc-700">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton
            active={tool === 'select'}
            onClick={() => setTool('select')}
            title="Select (S)"
          >
            <MousePointer2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === 'wall'}
            onClick={() => setTool('wall')}
            title="Wall Tool (W)"
            disabled={readonly}
          >
            <Minus className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === 'room'}
            onClick={() => setTool('room')}
            title="Room Tool (R) - Draw room rectangle"
            disabled={readonly}
          >
            <Box className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === 'room_label'}
            onClick={() => setTool('room_label')}
            title="Room Label Tool (L) - Click room to assign type"
            disabled={readonly}
          >
            <Tag className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === 'door'}
            onClick={() => setTool('door')}
            title="Door Tool (D)"
            disabled={readonly}
          >
            <DoorOpen className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === 'window'}
            onClick={() => setTool('window')}
            title="Window Tool (N)"
            disabled={readonly}
          >
            <LayoutGrid className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={tool === 'stair'}
            onClick={() => setTool('stair')}
            title="Stair Tool (A)"
            disabled={readonly}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4v-4h4v-4h4v-4h4"/>
              <path d="M20 4v4"/>
              <path d="M4 20v-4"/>
            </svg>
          </ToolButton>
          <ToolButton
            active={tool === 'dimension'}
            onClick={() => setTool('dimension')}
            title="Dimension Tool (M)"
            disabled={readonly}
          >
            <Ruler className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton
            onClick={undo}
            title="Undo (Ctrl+Z)"
            disabled={readonly || history.past.length === 0}
          >
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            onClick={redo}
            title="Redo (Ctrl+Shift+Z)"
            disabled={readonly || history.future.length === 0}
          >
            <Redo2 className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Room Templates */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton
            active={showTemplatePanel}
            onClick={() => setShowTemplatePanel(!showTemplatePanel)}
            title="Room Templates (T)"
            disabled={readonly}
          >
            <LayoutTemplate className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Wall Type Selector */}
        {(tool === 'wall' || tool === 'room') && (
          <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
            <select
              value={wallType}
              onChange={(e) => setWallType(e.target.value as WallType)}
              className="bg-zinc-700 text-white text-xs px-2 py-1 rounded border border-zinc-600"
            >
              <option value="exterior">Exterior (23cm)</option>
              <option value="interior">Interior (15cm)</option>
              <option value="partition">Partition (10cm)</option>
            </select>
          </div>
        )}

        {/* Snap & Ortho */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton
            active={snapSettings.enabled}
            onClick={() => setSnapSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
            title="Snap (G)"
          >
            <Magnet className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={orthoMode}
            onClick={() => setOrthoMode(!orthoMode)}
            title="Ortho Mode (O) - Lock to 90°"
          >
            <PenTool className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={showGrid}
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Grid"
          >
            <Grid3X3 className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton onClick={handleZoomIn} title="Zoom In">
            <ZoomIn className="h-4 w-4" />
          </ToolButton>
          <span className="text-xs text-zinc-400 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <ToolButton onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={handleResetView} title="Reset View">
            <RotateCcw className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton
            onClick={() => selectedWallId && deleteWall(selectedWallId)}
            title="Delete Selected"
            disabled={!selectedWallId}
          >
            <Trash2 className="h-4 w-4" />
          </ToolButton>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Clear
          </button>
        </div>

        {/* Export/Import */}
        <div className="flex items-center gap-1">
          <ToolButton onClick={handleExport} title="Export JSON">
            <Download className="h-4 w-4" />
          </ToolButton>
          <button
            onClick={handleExportPNG}
            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
            title="Export as PNG image"
          >
            PNG
          </button>
          <button
            onClick={handleExportSVG}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
            title="Export as SVG vector"
          >
            SVG
          </button>
          <label>
            <ToolButton title="Import JSON" disabled={readonly}>
              <Upload className="h-4 w-4" />
            </ToolButton>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
              disabled={readonly}
            />
          </label>
        </div>

        {/* Floor Label & Scale */}
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400 font-bold">{floorLabel}</span>
            <span className="text-xs text-zinc-500">(Floor {floorNumber})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Scale:</span>
            <select
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="bg-zinc-700 text-white text-xs px-2 py-1 rounded border border-zinc-600"
            >
              <option value={50}>1m = 50px</option>
              <option value={100}>1m = 100px</option>
              <option value={150}>1m = 150px</option>
            </select>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-3 py-1 bg-zinc-800 text-xs text-zinc-400 border-b border-zinc-700">
        {tool === 'wall' && (
          <span>
            <strong>Wall:</strong> Click to start, move to draw, click to place. Double-click to finish chain.
            {orthoMode && <span className="text-amber-400 ml-2">[ORTHO ON]</span>}
          </span>
        )}
        {tool === 'room' && (
          <span>
            <strong>Room:</strong> Click and drag to draw a room rectangle. Room type dialog will appear.
          </span>
        )}
        {tool === 'room_label' && (
          <span>
            <strong>Label:</strong> Click inside a room to assign or change its type and name.
          </span>
        )}
        {tool === 'select' && (
          <span>
            <strong>Select:</strong> Drag rooms to move. Click walls to select. DEL to delete.
            {selectedRoomTemplate && <span className="text-amber-400 ml-2">Click canvas to place template: {selectedRoomTemplate.name}</span>}
          </span>
        )}
        {tool === 'door' && <span><strong>Door:</strong> Click on a wall to place door.</span>}
        {tool === 'window' && <span><strong>Window:</strong> Click on a wall to place window.</span>}
        {tool === 'stair' && <span><strong>Stair:</strong> Click anywhere to place stairs. Arrow shows direction (up/down).</span>}
        {tool === 'dimension' && <span><strong>Dimension:</strong> Click on a wall to add dimension line.</span>}
        <span className="float-right">
          W=Wall R=Room L=Label D=Door A=Stair T=Templates Ctrl+Z=Undo ESC=Cancel
        </span>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Room Templates Panel */}
        {showTemplatePanel && (
          <div className="w-48 bg-zinc-800 border-r border-zinc-700 p-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-white">Room Templates</h4>
              <button
                onClick={() => setShowTemplatePanel(false)}
                className="text-zinc-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-2">Click template, then click canvas to place</p>
            <div className="space-y-1">
              {ROOM_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    setSelectedRoomTemplate(template);
                    setTool('select');
                  }}
                  className={`w-full text-left p-2 rounded text-xs transition-colors ${
                    selectedRoomTemplate?.id === template.id
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{template.icon}</span>
                    <div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-zinc-400 text-[10px]">{template.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {selectedRoomTemplate && (
              <button
                onClick={() => setSelectedRoomTemplate(null)}
                className="w-full mt-2 p-2 text-xs bg-zinc-600 hover:bg-zinc-500 text-white rounded"
              >
                Cancel Template
              </button>
            )}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-zinc-950 p-4">
          <div className="inline-block border border-zinc-700 rounded">
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Summary Panel */}
        <div className="w-64 bg-zinc-800 border-l border-zinc-700 p-3 overflow-y-auto">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            Building Summary
          </h3>

          {/* Readiness */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">Valuation Ready</span>
              <span className={`font-bold ${
                summary.valuationReadiness >= 90 ? 'text-green-400' :
                summary.valuationReadiness >= 70 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {summary.valuationReadiness}%
              </span>
            </div>
            {summary.validationIssues.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                <ul className="list-disc list-inside">
                  {summary.validationIssues.slice(0, 3).map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <hr className="border-zinc-700 my-3" />

          {/* Areas */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">Total Built Area</span>
              <span className="text-white font-mono">{summary.totalBuiltArea.toFixed(1)} m²</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Usable Area</span>
              <span className="text-white font-mono">{summary.usableArea.toFixed(1)} m²</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Efficiency</span>
              <span className="text-white font-mono">{(summary.buildingEfficiency * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Layout Score</span>
              <span className={`font-mono ${
                summary.layoutQualityScore >= 80 ? 'text-green-400' : 
                summary.layoutQualityScore >= 60 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {summary.layoutQualityScore}/100
              </span>
            </div>
          </div>

          <hr className="border-zinc-700 my-3" />

          {/* Room Counts */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-zinc-400">🛏️ Bedrooms:</span>
              <span className="text-white">{summary.bedroomCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400">🚿 Bathrooms:</span>
              <span className="text-white">{summary.bathroomCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400">🍳 Kitchens:</span>
              <span className="text-white">{summary.kitchenCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400">🛋️ Living:</span>
              <span className="text-white">{summary.livingAreaCount}</span>
            </div>
          </div>

          <hr className="border-zinc-700 my-3" />

          {/* Rooms List */}
          <h4 className="text-xs font-bold text-zinc-300 mb-2">Rooms</h4>
          {rooms.length === 0 ? (
            <p className="text-xs text-zinc-500">Draw walls to create rooms</p>
          ) : (
            <div className="space-y-1">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex justify-between items-center p-1 rounded bg-zinc-700/50 text-xs"
                >
                  <span className="text-zinc-300">{room.name}</span>
                  <span className="text-zinc-400 font-mono">{room.area.toFixed(1)}m²</span>
                </div>
              ))}
            </div>
          )}

          <hr className="border-zinc-700 my-3" />

          {/* Wall Stats */}
          <h4 className="text-xs font-bold text-zinc-300 mb-2">Walls</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">Total Walls</span>
              <span className="text-white">{walls.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Exterior</span>
              <span className="text-white font-mono">{summary.exteriorWallLength.toFixed(1)}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Interior</span>
              <span className="text-white font-mono">{summary.interiorWallLength.toFixed(1)}m</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

interface ToolButtonProps {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function ToolButton({ active, onClick, title, disabled, children }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-amber-500 text-black'
          : disabled
          ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
      }`}
    >
      {children}
    </button>
  );
}
