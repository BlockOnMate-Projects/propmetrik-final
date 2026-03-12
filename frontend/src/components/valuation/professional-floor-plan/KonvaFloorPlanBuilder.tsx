'use client';

/**
 * Professional Floor Plan Builder — Konva Edition
 *
 * CAD-level floor plan creation with walls, doors, windows, stairs, dimensions.
 * Uses Konva + react-konva for reliable canvas rendering with native drag / resize.
 *
 * Architecture: all data lives in React state (walls, doors, windows, rooms …).
 * The <Stage> is a pure rendering target rebuilt declaratively from state.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Line, Text, Circle, Group, Arrow, RegularPolygon, Transformer } from 'react-konva';
import Konva from 'konva';

import {
  Move, Square, Minus, DoorOpen, LayoutGrid, Ruler, Trash2, Download,
  Upload, ZoomIn, ZoomOut, RotateCcw, Grid3X3, Magnet, MousePointer2,
  PenTool, Undo2, Redo2, Box, Tag, LayoutTemplate,
} from 'lucide-react';

import {
  Point, Wall, WallType, Door, DoorStyle, Window as WindowType, WindowStyle,
  Room, RoomType, Dimension, DrawingTool, SnapSettings, SnapPoint,
  FloorPlanState, BuildingSummary, PropertyMeasurements, HistoryAction,
  HistoryState, RoomTemplate, Stair, StairDirection, StairStyle,
} from './types';

import {
  DEFAULT_SCALE, DEFAULT_GRID_SIZE, WALL_THICKNESS, WALL_COLORS,
  DOOR_SIZES, DOOR_COLORS, WINDOW_SIZES, WINDOW_COLORS, ROOM_COLORS,
  ROOM_ICONS, MINIMUM_ROOM_SIZES, SNAP_TOLERANCE, SNAP_COLORS,
  DEFAULT_SNAP_MODES, DIMENSION_COLORS, DIMENSION_OFFSET, CANVAS_BACKGROUND,
  GRID_COLOR_MAJOR, GRID_COLOR_MINOR, SELECTION_COLOR, PREVIEW_COLOR,
  ROOM_TEMPLATES, STAIR_DEFAULTS, STAIR_COLORS,
} from './constants';

import {
  distance, midpoint, angle, angleDegrees, snapToGrid, snapToOrtho,
  findSnapPoints, getBestSnapPoint, getWallPolygon, getWallLength,
  calculatePolygonArea, calculateCentroid, calculatePerimeter,
  pixelsToMeters, metersToPixels, pixelAreaToSquareMeters,
  formatMeasurement, formatArea, detectRoomsFromWalls, lineIntersection,
  nearestPointOnLine, createWallsFromRoomRectangle, createRoomFromRectangle,
  findRoomAtPoint, findEnclosedRegionAtPoint, pointInPolygon,
} from './geometry';

// =====================================================
// EXPORT DATA INTERFACE
// =====================================================

export interface FloorPlanExportData {
  json: string;
  imageDataUrl: string;
  measurements: PropertyMeasurements;
}

// =====================================================
// COMPONENT PROPS
// =====================================================

interface ProfessionalFloorPlanBuilderProps {
  onMeasurementsChange?: (measurements: PropertyMeasurements) => void;
  onFloorPlanChange?: (data: FloorPlanExportData) => void;
  initialFloorPlan?: string | object;
  floorNumber?: number;
  floorLabel?: string;
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
  width = 1200,
  height = 800,
}: ProfessionalFloorPlanBuilderProps) {
  // Konva refs
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const roomNodeRefs = useRef<Map<string, Konva.Group>>(new Map());

  // Refs for latest state (avoid stale closures in event handlers)
  const roomsRef = useRef<Room[]>([]);
  const wallsRef = useRef<Wall[]>([]);
  const isDraggingRoomRef = useRef(false);

  // Drawing state
  const [tool, setTool] = useState<DrawingTool>('wall');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);

  // Floor plan data
  const [walls, setWalls] = useState<Wall[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [windows, setWindows] = useState<WindowType[]>([]);
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

  // Keep refs in sync
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => { wallsRef.current = walls; }, [walls]);

  // =====================================================
  // UNDO / REDO
  // =====================================================

  const pushToHistory = useCallback((action: Omit<HistoryAction, 'timestamp'>) => {
    setHistory(prev => ({
      past: [...prev.past.slice(-(maxHistorySize - 1)), { ...action, timestamp: Date.now() }],
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      const lastAction = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      switch (lastAction.type) {
        case 'ADD_WALL': setWalls(w => w.filter(wall => wall.id !== lastAction.data.id)); break;
        case 'DELETE_WALL': setWalls(w => [...w, lastAction.data]); break;
        case 'ADD_DOOR': setDoors(d => d.filter(door => door.id !== lastAction.data.id)); break;
        case 'DELETE_DOOR': setDoors(d => [...d, lastAction.data]); break;
        case 'ADD_WINDOW': setWindows(w => w.filter(win => win.id !== lastAction.data.id)); break;
        case 'DELETE_WINDOW': setWindows(w => [...w, lastAction.data]); break;
        case 'ADD_STAIR': setStairs(s => s.filter(st => st.id !== lastAction.data.id)); break;
        case 'DELETE_STAIR': setStairs(s => [...s, lastAction.data]); break;
        case 'ADD_ROOM':
          setRooms(r => r.filter(room => room.id !== lastAction.data.room.id));
          if (lastAction.data.walls) {
            const wallIds = lastAction.data.walls.map((w: Wall) => w.id);
            setWalls(w => w.filter(wall => !wallIds.includes(wall.id)));
          }
          break;
        case 'DELETE_ROOM': setRooms(r => [...r, lastAction.data]); break;
        case 'UPDATE_ROOM': setRooms(r => r.map(room => room.id === lastAction.inverseData.id ? lastAction.inverseData : room)); break;
        case 'ADD_DIMENSION': setDimensions(d => d.filter(dim => dim.id !== lastAction.data.id)); break;
        case 'DELETE_DIMENSION': setDimensions(d => [...d, lastAction.data]); break;
        case 'CLEAR_ALL':
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
      return { past: newPast, future: [lastAction, ...prev.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      const nextAction = prev.future[0];
      const newFuture = prev.future.slice(1);
      switch (nextAction.type) {
        case 'ADD_WALL': setWalls(w => [...w, nextAction.data]); break;
        case 'DELETE_WALL': setWalls(w => w.filter(wall => wall.id !== nextAction.data.id)); break;
        case 'ADD_DOOR': setDoors(d => [...d, nextAction.data]); break;
        case 'DELETE_DOOR': setDoors(d => d.filter(door => door.id !== nextAction.data.id)); break;
        case 'ADD_WINDOW': setWindows(w => [...w, nextAction.data]); break;
        case 'DELETE_WINDOW': setWindows(w => w.filter(win => win.id !== nextAction.data.id)); break;
        case 'ADD_STAIR': setStairs(s => [...s, nextAction.data]); break;
        case 'DELETE_STAIR': setStairs(s => s.filter(st => st.id !== nextAction.data.id)); break;
        case 'ADD_ROOM':
          if (nextAction.data.walls) setWalls(w => [...w, ...nextAction.data.walls]);
          setRooms(r => [...r, nextAction.data.room]);
          break;
        case 'DELETE_ROOM': setRooms(r => r.filter(room => room.id !== nextAction.data.id)); break;
        case 'UPDATE_ROOM': setRooms(r => r.map(room => room.id === nextAction.data.id ? nextAction.data : room)); break;
        case 'ADD_DIMENSION': setDimensions(d => [...d, nextAction.data]); break;
        case 'DELETE_DIMENSION': setDimensions(d => d.filter(dim => dim.id !== nextAction.data.id)); break;
        case 'CLEAR_ALL': setWalls([]); setDoors([]); setWindows([]); setStairs([]); setRooms([]); setDimensions([]); break;
      }
      return { past: [...prev.past, nextAction], future: newFuture };
    });
  }, []);

  // =====================================================
  // LOAD INITIAL FLOOR PLAN
  // =====================================================

  const loadFloorPlan = useCallback((data: string | object) => {
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
  }, []);

  useEffect(() => {
    if (initialFloorPlan) loadFloorPlan(initialFloorPlan);
  }, [initialFloorPlan, loadFloorPlan]);

  // =====================================================
  // SNAP POINT CALCULATION
  // =====================================================

  const calculateSnapPoint = useCallback((rawPoint: Point): Point => {
    if (!snapSettings.enabled) return rawPoint;
    const snapPoints = findSnapPoints(rawPoint, walls, snapSettings, scale);
    const best = getBestSnapPoint(snapPoints);
    if (best) { setActiveSnapPoint(best); return best.point; }
    const gridSnapped = snapToGrid(rawPoint, gridSize, scale);
    setActiveSnapPoint({ point: gridSnapped, type: 'grid', priority: 0 });
    return gridSnapped;
  }, [walls, snapSettings, scale, gridSize]);

  // =====================================================
  // WALL CREATION
  // =====================================================

  const createWall = useCallback((start: Point, end: Point) => {
    let finalEnd = end;
    if (orthoMode) finalEnd = snapToOrtho(start, end, true);
    const lengthM = distance(start, finalEnd) / scale;
    if (lengthM < 0.3) return;

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

    const connectedAtStart = walls.filter(w => distance(start, w.start) < 5 || distance(start, w.end) < 5);
    const connectedAtEnd = walls.filter(w => distance(finalEnd, w.start) < 5 || distance(finalEnd, w.end) < 5);
    newWall.connectedWalls = [...connectedAtStart.map(w => w.id), ...connectedAtEnd.map(w => w.id)];

    setWalls(prev => [...prev, newWall]);
    setWalls(prev => prev.map(w => {
      if (newWall.connectedWalls.includes(w.id)) {
        return { ...w, connectedWalls: [...w.connectedWalls, newWall.id] };
      }
      return w;
    }));
    pushToHistory({ type: 'ADD_WALL', data: newWall });
  }, [wallType, scale, orthoMode, walls, pushToHistory]);

  // =====================================================
  // ROOM CREATION
  // =====================================================

  const createRoom = useCallback((start: Point, end: Point, roomType: RoomType, roomName?: string) => {
    const topLeft: Point = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) };
    const bottomRight: Point = { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) };
    const widthM = pixelsToMeters(bottomRight.x - topLeft.x, scale);
    const heightM = pixelsToMeters(bottomRight.y - topLeft.y, scale);
    if (widthM < 1 || heightM < 1) return;

    const roomRect = {
      topLeft,
      bottomRight,
      roomType,
      roomName: roomName || `${roomType.charAt(0).toUpperCase() + roomType.slice(1).replace('_', ' ')}`,
    };

    const roomWallType: 'interior' | 'exterior' = wallType === 'exterior' ? 'exterior' : 'interior';
    const newWalls = createWallsFromRoomRectangle(roomRect, roomWallType);
    const wallIds = newWalls.map(w => w.id);
    const room = createRoomFromRectangle(roomRect, wallIds, scale);
    room.name = roomRect.roomName;
    room.type = roomType;

    setWalls(prev => [...prev, ...newWalls]);
    setRooms(prev => [...prev, room]);
    pushToHistory({ type: 'ADD_ROOM', data: { room, walls: newWalls } });
  }, [scale, wallType, pushToHistory]);

  const placeRoomTemplate = useCallback((position: Point, template: RoomTemplate) => {
    const widthPx = metersToPixels(template.width, scale);
    const heightPx = metersToPixels(template.height, scale);
    const snappedPos = snapToGrid(position, gridSize, scale);
    const start: Point = { x: snappedPos.x - widthPx / 2, y: snappedPos.y - heightPx / 2 };
    const end: Point = { x: snappedPos.x + widthPx / 2, y: snappedPos.y + heightPx / 2 };
    createRoom(start, end, template.type, template.name);
    setSelectedRoomTemplate(null);
  }, [scale, gridSize, createRoom]);

  // =====================================================
  // DOOR / WINDOW / STAIR / DIMENSION PLACEMENT
  // =====================================================

  const pointToWallDistance = (point: Point, wall: Wall, sc: number): number => {
    const A = point.x - wall.start.x;
    const B = point.y - wall.start.y;
    const C = wall.end.x - wall.start.x;
    const D = wall.end.y - wall.start.y;
    const lenSq = C * C + D * D;
    if (lenSq === 0) return distance(point, wall.start);
    let param = (A * C + B * D) / lenSq;
    param = Math.max(0, Math.min(1, param));
    return distance(point, { x: wall.start.x + param * C, y: wall.start.y + param * D });
  };

  const findWallAtPoint = useCallback((point: Point): Wall | null => {
    for (const wall of walls) {
      if (pointToWallDistance(point, wall, scale) < 20) return wall;
    }
    return null;
  }, [walls, scale]);

  const getPositionOnWall = useCallback((point: Point, wall: Wall): number => {
    const wallLength = distance(wall.start, wall.end);
    const distFromStart = distance(wall.start, nearestPointOnLine(point, wall.start, wall.end));
    return distFromStart / wallLength;
  }, []);

  const placeDoor = useCallback((wall: Wall, position: number) => {
    const newDoor: Door = {
      id: `door_${Date.now()}`,
      wallId: wall.id,
      style: doorStyle,
      width: DOOR_SIZES[doorStyle].width,
      height: DOOR_SIZES[doorStyle].height,
      position: Math.max(0.1, Math.min(0.9, position)),
      swingAngle: 90,
      swingDirection: 'inward',
      hingeSide: 'left',
    };
    setDoors(prev => [...prev, newDoor]);
    pushToHistory({ type: 'ADD_DOOR', data: newDoor });
  }, [doorStyle, pushToHistory]);

  const placeWindow = useCallback((wall: Wall, position: number) => {
    const newWindow: WindowType = {
      id: `window_${Date.now()}`,
      wallId: wall.id,
      style: windowStyle,
      width: WINDOW_SIZES[windowStyle].width,
      height: WINDOW_SIZES[windowStyle].height,
      sillHeight: 0.9,
      position: Math.max(0.1, Math.min(0.9, position)),
    };
    setWindows(prev => [...prev, newWindow]);
    pushToHistory({ type: 'ADD_WINDOW', data: newWindow });
  }, [windowStyle, pushToHistory]);

  const placeStair = useCallback((position: Point) => {
    const newStair: Stair = {
      id: `stair_${Date.now()}`,
      x: (position.x / scale) * 100,
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

  const addDimensionToWall = useCallback((wall: Wall) => {
    const wallLength = getWallLength(wall, scale);
    const wallAngle = angle(wall.start, wall.end);
    const perpAngle = wallAngle + Math.PI / 2;
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

  // =====================================================
  // ROOM DETECTION
  // =====================================================

  const computeAllRooms = useMemo(() => {
    const userCreatedRooms = rooms.filter(r => r.boundaryWalls && r.boundaryWalls.length > 0);

    const updatedUserRooms = userCreatedRooms.map(room => {
      const roomWalls = walls.filter(w => room.boundaryWalls.includes(w.id));
      if (roomWalls.length === 4) {
        const allPoints = roomWalls.flatMap(w => [w.start, w.end]);
        const minX = Math.min(...allPoints.map(p => p.x));
        const maxX = Math.max(...allPoints.map(p => p.x));
        const minY = Math.min(...allPoints.map(p => p.y));
        const maxY = Math.max(...allPoints.map(p => p.y));
        const newPolygon = [
          { x: minX, y: minY }, { x: maxX, y: minY },
          { x: maxX, y: maxY }, { x: minX, y: maxY },
        ];
        const areaPixels = calculatePolygonArea(newPolygon);
        const areaSqm = pixelAreaToSquareMeters(areaPixels, scale);
        return {
          ...room,
          polygon: newPolygon,
          centroid: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
          area: areaSqm,
        };
      }
      return room;
    });

    const userWallIds = new Set(userCreatedRooms.flatMap(r => r.boundaryWalls));
    const freeWalls = walls.filter(w => !userWallIds.has(w.id));
    let detectedRooms: Room[] = [];
    if (freeWalls.length >= 4) {
      const detectedPolygons = detectRoomsFromWalls(freeWalls, scale);
      detectedRooms = detectedPolygons.map((polygon, index) => {
        const areaPixels = calculatePolygonArea(polygon);
        const areaSqm = pixelAreaToSquareMeters(areaPixels, scale);
        const centroid = calculateCentroid(polygon);
        const perimeter = calculatePerimeter(polygon) / scale;
        return {
          id: `room_detected_${index}`,
          name: `Room ${updatedUserRooms.length + index + 1}`,
          type: 'bedroom' as RoomType,
          boundaryWalls: [],
          area: areaSqm,
          perimeter,
          centroid,
          polygon,
          floorLevel: 0,
          ceilingHeight: 2.8,
        };
      });
    }

    return [...updatedUserRooms, ...detectedRooms];
  }, [rooms, walls, scale]);

  // =====================================================
  // GRID LINES (memoized)
  // =====================================================

  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines: { points: number[]; stroke: string; strokeWidth: number }[] = [];
    const gridSpacing = (gridSize / 100) * scale;
    const majorGridSpacing = gridSpacing * 10;

    for (let x = 0; x <= width; x += gridSpacing) {
      const isMajor = x % majorGridSpacing < 0.1;
      lines.push({
        points: [x, 0, x, height],
        stroke: isMajor ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR,
        strokeWidth: isMajor ? 1 : 0.5,
      });
    }
    for (let y = 0; y <= height; y += gridSpacing) {
      const isMajor = y % majorGridSpacing < 0.1;
      lines.push({
        points: [0, y, width, y],
        stroke: isMajor ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR,
        strokeWidth: isMajor ? 1 : 0.5,
      });
    }
    return lines;
  }, [showGrid, gridSize, scale, width, height]);

  // =====================================================
  // WALL POLYGONS (memoized)
  // =====================================================

  const wallShapes = useMemo(() => {
    return walls.map(wall => {
      const polygon = getWallPolygon(wall, scale);
      const colors = WALL_COLORS[wall.type];
      const flatPoints = polygon.flatMap(p => [p.x, p.y]);
      const length = getWallLength(wall, scale);
      const mid = midpoint(wall.start, wall.end);
      const wallAngle = angleDegrees(wall.start, wall.end);
      return { wall, flatPoints, colors, length, mid, wallAngle };
    });
  }, [walls, scale]);

  // =====================================================
  // PREVIEW SHAPES
  // =====================================================

  const previewShapes = useMemo(() => {
    if (!drawStart || !currentPoint) return null;

    if (tool === 'wall') {
      let finalEnd = currentPoint;
      if (orthoMode) finalEnd = snapToOrtho(drawStart, currentPoint, true);
      const thickness = WALL_THICKNESS[wallType];
      const tempWall: Wall = {
        id: 'preview', type: wallType, start: drawStart, end: finalEnd,
        thickness, height: 2.8, openings: [], connectedWalls: [],
      };
      const polygon = getWallPolygon(tempWall, scale);
      const flatPoints = polygon.flatMap(p => [p.x, p.y]);
      const wallLength = distance(drawStart, finalEnd) / scale;
      const mid = midpoint(drawStart, finalEnd);
      return { type: 'wall' as const, flatPoints, start: drawStart, end: finalEnd, wallLength, mid };
    }

    if (tool === 'room') {
      const minX = Math.min(drawStart.x, currentPoint.x);
      const maxX = Math.max(drawStart.x, currentPoint.x);
      const minY = Math.min(drawStart.y, currentPoint.y);
      const maxY = Math.max(drawStart.y, currentPoint.y);
      const w = maxX - minX;
      const h = maxY - minY;
      const widthM = pixelsToMeters(w, scale);
      const heightM = pixelsToMeters(h, scale);
      return { type: 'room' as const, x: minX, y: minY, w, h, widthM, heightM, area: widthM * heightM };
    }

    return null;
  }, [drawStart, currentPoint, tool, orthoMode, wallType, scale]);

  // =====================================================
  // DOOR / WINDOW SHAPES (memoized)
  // =====================================================

  const doorShapes = useMemo(() => {
    return doors.map(door => {
      const wall = walls.find(w => w.id === door.wallId);
      if (!wall) return null;
      const wallAngle_ = angle(wall.start, wall.end);
      const wallLength = distance(wall.start, wall.end);
      const doorWidthPx = door.width * scale;
      const doorCenterDist = door.position * wallLength;
      const doorCenter: Point = {
        x: wall.start.x + Math.cos(wallAngle_) * doorCenterDist,
        y: wall.start.y + Math.sin(wallAngle_) * doorCenterDist,
      };
      return { door, doorCenter, wallAngle: wallAngle_, doorWidthPx, thicknessPx: wall.thickness * scale };
    }).filter(Boolean) as { door: Door; doorCenter: Point; wallAngle: number; doorWidthPx: number; thicknessPx: number }[];
  }, [doors, walls, scale]);

  const windowShapes = useMemo(() => {
    return windows.map(win => {
      const wall = walls.find(w => w.id === win.wallId);
      if (!wall) return null;
      const wallAngle_ = angle(wall.start, wall.end);
      const wallLength = distance(wall.start, wall.end);
      const windowWidthPx = win.width * scale;
      const winCenterDist = win.position * wallLength;
      const winCenter: Point = {
        x: wall.start.x + Math.cos(wallAngle_) * winCenterDist,
        y: wall.start.y + Math.sin(wallAngle_) * winCenterDist,
      };
      return { win, winCenter, wallAngle: wallAngle_, windowWidthPx, thicknessPx: wall.thickness * scale };
    }).filter(Boolean) as { win: WindowType; winCenter: Point; wallAngle: number; windowWidthPx: number; thicknessPx: number }[];
  }, [windows, walls, scale]);

  // =====================================================
  // STAIR SHAPES (memoized)
  // =====================================================

  const stairShapes = useMemo(() => {
    return stairs.map(stair => {
      const widthPx = stair.width * scale / 100;
      const lengthPx = stair.length * scale / 100;
      const stepHeight = lengthPx / stair.numSteps;
      const x = stair.x * scale / 100;
      const y = stair.y * scale / 100;
      return { stair, widthPx, lengthPx, stepHeight, x, y };
    });
  }, [stairs, scale]);

  // =====================================================
  // DIMENSION SHAPES (memoized)
  // =====================================================

  const dimensionShapes = useMemo(() => {
    return dimensions.map(dim => {
      const dimAngle = angle(dim.start, dim.end);
      const dimMid = midpoint(dim.start, dim.end);
      const wall = walls.find(w => w.id === dim.associatedObjectId);
      const textAngleDeg = (dimAngle * 180) / Math.PI;
      const adjustedAngle = textAngleDeg > 90 || textAngleDeg < -90 ? textAngleDeg + 180 : textAngleDeg;
      return { dim, dimAngle, dimMid, wall, adjustedAngle };
    });
  }, [dimensions, walls]);

  // =====================================================
  // CANVAS EVENT HANDLERS
  // =====================================================

  const getPointerPos = useCallback((e: Konva.KonvaEventObject<MouseEvent>): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const pos = stage.getPointerPosition();
    if (!pos) return { x: 0, y: 0 };
    // Account for zoom/pan
    const transform = stage.getAbsoluteTransform().copy().invert();
    const point = transform.point(pos);
    return { x: point.x, y: point.y };
  }, []);

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readonly) return;
    const pos = getPointerPos(e);
    const snappedPoint = calculateSnapPoint(pos);

    // Template placement
    if (selectedRoomTemplate) {
      placeRoomTemplate(snappedPoint, selectedRoomTemplate);
      return;
    }

    switch (tool) {
      case 'wall':
        if (isDrawing && drawStart) {
          createWall(drawStart, snappedPoint);
          setDrawStart(snappedPoint); // chain
        } else {
          setIsDrawing(true);
          setDrawStart(snappedPoint);
        }
        break;

      case 'room':
        if (!roomDrawStart) {
          setRoomDrawStart(snappedPoint);
          setDrawStart(snappedPoint);
        } else {
          const normalizedStart: Point = {
            x: Math.min(roomDrawStart.x, snappedPoint.x),
            y: Math.min(roomDrawStart.y, snappedPoint.y),
          };
          const normalizedEnd: Point = {
            x: Math.max(roomDrawStart.x, snappedPoint.x),
            y: Math.max(roomDrawStart.y, snappedPoint.y),
          };
          const w = pixelsToMeters(normalizedEnd.x - normalizedStart.x, scale);
          const h = pixelsToMeters(normalizedEnd.y - normalizedStart.y, scale);
          if (w >= 1 && h >= 1) {
            setPendingRoomPolygon([normalizedStart, normalizedEnd]);
            setNewRoomName('');
            setNewRoomType('bedroom');
            setShowRoomDialog(true);
          }
          setRoomDrawStart(null);
          setDrawStart(null);
          setCurrentPoint(null);
        }
        break;

      case 'room_label': {
        const allRooms = computeAllRooms;
        const clickedRoom = allRooms.find(r => pointInPolygon(snappedPoint, r.polygon));
        if (clickedRoom) {
          setSelectedRoomId(clickedRoom.id);
          setNewRoomName(clickedRoom.name);
          setNewRoomType(clickedRoom.type);
          setShowRoomDialog(true);
        } else {
          const region = findEnclosedRegionAtPoint(snappedPoint, walls, scale);
          if (region && region.length >= 3) {
            setPendingRoomPolygon(region);
            setNewRoomName('');
            setNewRoomType('bedroom');
            setShowRoomDialog(true);
          }
        }
        break;
      }

      case 'select': {
        // Check wall selection first, then room selection
        const clickedWall = findWallAtPoint(snappedPoint);
        if (clickedWall) {
          setSelectedWallId(clickedWall.id);
          setSelectedRoomId(null);
        } else {
          setSelectedWallId(null);
          // Check if a user-created room was clicked
          const allRooms = computeAllRooms;
          const clickedRoom = allRooms.find(r => r.boundaryWalls && r.boundaryWalls.length > 0 && pointInPolygon(snappedPoint, r.polygon));
          setSelectedRoomId(clickedRoom ? clickedRoom.id : null);
        }
        break;
      }

      case 'door': {
        const wall = findWallAtPoint(snappedPoint);
        if (wall) {
          const position = getPositionOnWall(snappedPoint, wall);
          placeDoor(wall, position);
        }
        break;
      }

      case 'window': {
        const wall = findWallAtPoint(snappedPoint);
        if (wall) {
          const position = getPositionOnWall(snappedPoint, wall);
          placeWindow(wall, position);
        }
        break;
      }

      case 'stair':
        placeStair(snappedPoint);
        break;

      case 'dimension': {
        const wall = findWallAtPoint(snappedPoint);
        if (wall) addDimensionToWall(wall);
        break;
      }
    }
  }, [readonly, tool, isDrawing, drawStart, roomDrawStart, calculateSnapPoint,
      createWall, selectedRoomTemplate, placeRoomTemplate, findWallAtPoint,
      getPositionOnWall, placeDoor, placeWindow, placeStair, addDimensionToWall,
      scale, computeAllRooms, walls, getPointerPos]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = getPointerPos(e);
    const snappedPoint = calculateSnapPoint(pos);

    if (tool === 'wall' && isDrawing && drawStart) {
      setCurrentPoint(snappedPoint);
    }
    if (tool === 'room' && roomDrawStart) {
      setCurrentPoint(snappedPoint);
    }
  }, [tool, isDrawing, drawStart, roomDrawStart, calculateSnapPoint, getPointerPos]);

  const handleStageDblClick = useCallback(() => {
    if (tool === 'wall' && isDrawing) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentPoint(null);
    }
  }, [tool, isDrawing]);

  // =====================================================
  // ROOM DRAGGING
  // =====================================================

  const handleRoomDragStart = useCallback(() => {
    isDraggingRoomRef.current = true;
  }, []);

  const handleRoomDragEnd = useCallback((roomId: string, boundaryWallIds: string[],
    origX: number, origY: number, newX: number, newY: number) => {
    const deltaX = newX - origX;
    const deltaY = newY - origY;

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
      isDraggingRoomRef.current = false;
      return;
    }

    // Update walls
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
          polygon: r.polygon.map(p => ({ x: p.x + deltaX, y: p.y + deltaY })),
        };
      }
      return r;
    }));

    setTimeout(() => { isDraggingRoomRef.current = false; }, 50);
  }, []);

  // =====================================================
  // ROOM RESIZE (via Transformer)
  // =====================================================

  const handleRoomTransformEnd = useCallback((roomId: string, boundaryWallIds: string[]) => {
    const node = roomNodeRefs.current.get(roomId);
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const nodeX = node.x();
    const nodeY = node.y();

    // Get the room's current bounds from state
    const room = roomsRef.current.find(r => r.id === roomId);
    if (!room) return;

    const origMinX = Math.min(...room.polygon.map(p => p.x));
    const origMinY = Math.min(...room.polygon.map(p => p.y));
    const origMaxX = Math.max(...room.polygon.map(p => p.x));
    const origMaxY = Math.max(...room.polygon.map(p => p.y));
    const origW = origMaxX - origMinX;
    const origH = origMaxY - origMinY;

    // Enforce minimum room size (1m × 1m in pixels)
    const minPx = metersToPixels(1, scale);
    const newW = Math.max(origW * scaleX, minPx);
    const newH = Math.max(origH * scaleY, minPx);

    const newMinX = nodeX;
    const newMinY = nodeY;
    const newMaxX = newMinX + newW;
    const newMaxY = newMinY + newH;

    // Update boundary walls to match new room bounds
    setWalls(prevWalls => prevWalls.map(wall => {
      if (!boundaryWallIds.includes(wall.id)) return wall;
      const mapX = (px: number) => newMinX + ((px - origMinX) / origW) * newW;
      const mapY = (py: number) => newMinY + ((py - origMinY) / origH) * newH;
      return {
        ...wall,
        start: { x: mapX(wall.start.x), y: mapY(wall.start.y) },
        end: { x: mapX(wall.end.x), y: mapY(wall.end.y) },
      };
    }));

    // Update room polygon, centroid, and area
    setRooms(prevRooms => prevRooms.map(r => {
      if (r.id !== roomId) return r;
      const newPolygon = [
        { x: newMinX, y: newMinY },
        { x: newMaxX, y: newMinY },
        { x: newMaxX, y: newMaxY },
        { x: newMinX, y: newMaxY },
      ];
      const areaPixels = calculatePolygonArea(newPolygon);
      const areaSqm = pixelAreaToSquareMeters(areaPixels, scale);
      return {
        ...r,
        polygon: newPolygon,
        centroid: { x: (newMinX + newMaxX) / 2, y: (newMinY + newMaxY) / 2 },
        area: areaSqm,
      };
    }));

    // Reset the node's transform so it doesn't compound on next render
    node.scaleX(1);
    node.scaleY(1);
  }, [scale]);

  // Attach the Transformer to the selected room node
  // Use requestAnimationFrame to ensure refs are settled after render
  useEffect(() => {
    const attachTransformer = () => {
      const tr = transformerRef.current;
      if (!tr) return;

      if (selectedRoomId && tool === 'select') {
        const node = roomNodeRefs.current.get(selectedRoomId);
        if (node) {
          tr.nodes([node]);
          tr.getLayer()?.batchDraw();
          return;
        }
      }
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
    };
    // Delay to allow React to flush DOM & refs
    const raf = requestAnimationFrame(attachTransformer);
    return () => cancelAnimationFrame(raf);
  }, [selectedRoomId, tool, computeAllRooms]);

  // =====================================================
  // DELETE ACTIONS (must be before keyboard shortcuts)
  // =====================================================

  const deleteWall = useCallback((wallId: string) => {
    const wall = walls.find(w => w.id === wallId);
    if (wall) pushToHistory({ type: 'DELETE_WALL', data: wall });
    setWalls(prev => prev.filter(w => w.id !== wallId));
    setSelectedWallId(null);
  }, [walls, pushToHistory]);

  const deleteRoom = useCallback((roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    pushToHistory({ type: 'DELETE_ROOM', data: room });
    setRooms(prev => prev.filter(r => r.id !== roomId));
    if (room.boundaryWalls && room.boundaryWalls.length > 0) {
      setWalls(prev => prev.filter(w => !room.boundaryWalls.includes(w.id)));
    }
    setSelectedRoomId(null);
  }, [rooms, pushToHistory]);

  // =====================================================
  // KEYBOARD SHORTCUTS
  // =====================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readonly) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w': setTool('wall'); break;
        case 'r': setTool('room'); break;
        case 'l': setTool('room_label'); break;
        case 's': setTool('select'); break;
        case 'd': setTool('door'); break;
        case 'n': setTool('window'); break;
        case 'a': setTool('stair'); break;
        case 'm': setTool('dimension'); break;
        case 'g': setSnapSettings(prev => ({ ...prev, enabled: !prev.enabled })); break;
        case 'o': setOrthoMode(prev => !prev); break;
        case 't': setShowTemplatePanel(prev => !prev); break;
        case 'escape':
          setIsDrawing(false);
          setDrawStart(null);
          setRoomDrawStart(null);
          setCurrentPoint(null);
          setSelectedWallId(null);
          setSelectedRoomId(null);
          setSelectedRoomTemplate(null);
          setShowRoomDialog(false);
          break;
        case 'delete':
        case 'backspace':
          if (selectedWallId) deleteWall(selectedWallId);
          else if (selectedRoomId) deleteRoom(selectedRoomId);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readonly, selectedWallId, selectedRoomId, deleteWall, deleteRoom, undo, redo]);

  // =====================================================
  // ACTIONS
  // =====================================================

  const handleClear = () => {
    pushToHistory({
      type: 'CLEAR_ALL',
      data: {},
      inverseData: { walls, doors, windows, stairs, rooms, dimensions },
    });
    setWalls([]); setDoors([]); setWindows([]); setStairs([]);
    setRooms([]); setDimensions([]);
    setIsDrawing(false); setDrawStart(null); setRoomDrawStart(null); setCurrentPoint(null);
  };

  const handleConfirmRoom = useCallback(() => {
    if (pendingRoomPolygon && pendingRoomPolygon.length === 2) {
      createRoom(pendingRoomPolygon[0], pendingRoomPolygon[1], newRoomType, newRoomName || undefined);
    } else if (selectedRoomId) {
      const oldRoom = rooms.find(r => r.id === selectedRoomId);
      if (oldRoom) {
        const updatedRoom = { ...oldRoom, type: newRoomType, name: newRoomName || oldRoom.name };
        pushToHistory({ type: 'UPDATE_ROOM', data: updatedRoom, inverseData: oldRoom });
        setRooms(prev => prev.map(r => r.id === selectedRoomId ? updatedRoom : r));
      }
    }
    setShowRoomDialog(false);
    setPendingRoomPolygon(null);
    setSelectedRoomId(null);
  }, [pendingRoomPolygon, selectedRoomId, newRoomType, newRoomName, createRoom, rooms, pushToHistory]);

  // =====================================================
  // ZOOM
  // =====================================================

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 3);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.5);
    setZoom(newZoom);
  };

  const handleResetView = () => {
    setZoom(1);
    const stage = stageRef.current;
    if (stage) { stage.position({ x: 0, y: 0 }); }
  };

  // =====================================================
  // SAVE / LOAD / EXPORT
  // =====================================================

  const saveFloorPlan = useCallback((): string => {
    return JSON.stringify({
      version: '2.0', floorNumber, floorLabel,
      walls, doors, windows, stairs, rooms, dimensions, scale, gridSize,
    });
  }, [walls, doors, windows, stairs, rooms, dimensions, scale, gridSize, floorNumber, floorLabel]);

  const getFloorPlanImage = useCallback((): string => {
    const stage = stageRef.current;
    if (!stage) return '';
    return stage.toDataURL({ pixelRatio: 2 });
  }, []);

  const handleExport = () => {
    const json = saveFloorPlan();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'floor-plan.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = dataURL; a.download = 'floor-plan.png'; a.click();
  };

  const handleExportSVG = () => {
    // Konva doesn't natively export SVG — export high-res PNG instead
    const stage = stageRef.current;
    if (!stage) return;
    const dataURL = stage.toDataURL({ pixelRatio: 3 });
    const a = document.createElement('a');
    a.href = dataURL; a.download = 'floor-plan.png'; a.click();
  };

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

  const calculateLayoutScore = useCallback((): number => {
    let score = 100;
    const bedrooms = rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom');
    const bathrooms = rooms.filter(r => r.type === 'bathroom' || r.type === 'master_bathroom');
    if (bedrooms.length > 0 && bathrooms.length / bedrooms.length < 0.5) score -= 10;
    for (const room of rooms) {
      const minSize = MINIMUM_ROOM_SIZES[room.type];
      if (room.area < minSize) score -= 5;
    }
    return Math.max(0, Math.min(100, score));
  }, [rooms]);

  const validateFloorPlan = useCallback(() => {
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
      if (room.area < minSize) issues.push(`${room.name} is below minimum size (${room.area.toFixed(1)}m² < ${minSize}m²)`);
    }

    let readiness = 0;
    if (bedrooms.length > 0) readiness += 25;
    if (bathrooms.length > 0) readiness += 25;
    if (kitchens.length > 0) readiness += 20;
    if (livingAreas.length > 0) readiness += 20;
    if (rooms.reduce((sum, r) => sum + r.area, 0) >= 30) readiness += 10;

    return { isComplete: issues.length === 0 && readiness >= 90, issues, recommendations, readiness };
  }, [rooms]);

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
        id: r.id, name: r.name, type: r.type, area: r.area,
        dimensions: { length: 0, width: 0 },
      })),
      floorPlanData: saveFloorPlan(),
      validationResults: validateFloorPlan(),
    };

    if (onMeasurementsChange) onMeasurementsChange(measurements);
    if (onFloorPlanChange) {
      onFloorPlanChange({ json: saveFloorPlan(), imageDataUrl: getFloorPlanImage(), measurements });
    }
  }, [rooms, onMeasurementsChange, onFloorPlanChange, saveFloorPlan, getFloorPlanImage, calculateLayoutScore, validateFloorPlan]);

  // Trigger measurements callback when data changes
  useEffect(() => {
    if (!isDraggingRoomRef.current) notifyMeasurementsChange();
  }, [walls, rooms, doors, windows, stairs, dimensions]);

  // =====================================================
  // AUTO-SAVE to localStorage
  // =====================================================

  const autoSaveKey = `propmetrik_floorplan_${floorNumber}`;

  // Save to localStorage whenever floor plan data changes (debounced)
  useEffect(() => {
    // Don't save empty state or during drag
    if (walls.length === 0 && rooms.length === 0) return;
    const timer = setTimeout(() => {
      try {
        const data = JSON.stringify({
          version: '2.0', floorNumber, floorLabel,
          walls, doors, windows, stairs, rooms, dimensions, scale, gridSize,
          _savedAt: Date.now(),
        });
        localStorage.setItem(autoSaveKey, data);
      } catch (err) {
        console.warn('Auto-save failed:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [walls, doors, windows, stairs, rooms, dimensions, scale, gridSize, floorNumber, floorLabel, autoSaveKey]);

  // Load from localStorage on mount if no initialFloorPlan was provided
  useEffect(() => {
    if (initialFloorPlan) return; // initialFloorPlan takes precedence
    try {
      const saved = localStorage.getItem(autoSaveKey);
      if (saved) {
        loadFloorPlan(saved);
      }
    } catch (err) {
      console.warn('Auto-load failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveKey]);

  // =====================================================
  // BUILDING SUMMARY
  // =====================================================

  const summary: BuildingSummary = useMemo(() => {
    const validation = validateFloorPlan();
    const totalBuiltArea = rooms.reduce((sum, r) => sum + r.area, 0);
    const usableArea = rooms.filter(r => !['corridor', 'storage'].includes(r.type)).reduce((sum, r) => sum + r.area, 0);
    return {
      totalBuiltArea,
      usableArea,
      exteriorWallLength: walls.filter(w => w.type === 'exterior').reduce((sum, w) => sum + getWallLength(w, scale), 0),
      interiorWallLength: walls.filter(w => w.type === 'interior').reduce((sum, w) => sum + getWallLength(w, scale), 0),
      roomCount: rooms.length,
      bedroomCount: rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length,
      bathroomCount: rooms.filter(r => r.type === 'bathroom' || r.type === 'master_bathroom').length,
      kitchenCount: rooms.filter(r => r.type === 'kitchen').length,
      livingAreaCount: rooms.filter(r => r.type === 'living_room').length,
      buildingEfficiency: totalBuiltArea > 0 ? usableArea / totalBuiltArea : 0,
      layoutQualityScore: calculateLayoutScore(),
      validationIssues: validation.issues,
      validationRecommendations: validation.recommendations,
      valuationReadiness: validation.readiness,
    };
  }, [rooms, walls, scale, calculateLayoutScore, validateFloorPlan]);

  // =====================================================
  // RENDER
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
                onClick={() => { setShowRoomDialog(false); setPendingRoomPolygon(null); setSelectedRoomId(null); }}
                className="flex-1 px-3 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRoom}
                className="flex-1 px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white font-bold rounded"
              >
                {selectedRoomId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-zinc-800 border-b border-zinc-700 flex-wrap">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton active={tool === 'select'} onClick={() => setTool('select')} title="Select (S)">
            <MousePointer2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === 'wall'} onClick={() => setTool('wall')} title="Wall Tool (W)" disabled={readonly}>
            <Minus className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === 'room'} onClick={() => setTool('room')} title="Room Tool (R)" disabled={readonly}>
            <Box className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === 'room_label'} onClick={() => setTool('room_label')} title="Room Label (L)" disabled={readonly}>
            <Tag className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === 'door'} onClick={() => setTool('door')} title="Door (D)" disabled={readonly}>
            <DoorOpen className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === 'window'} onClick={() => setTool('window')} title="Window (N)" disabled={readonly}>
            <LayoutGrid className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === 'stair'} onClick={() => setTool('stair')} title="Stair (A)" disabled={readonly}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4v-4h4v-4h4v-4h4" /><path d="M20 4v4" /><path d="M4 20v-4" />
            </svg>
          </ToolButton>
          <ToolButton active={tool === 'dimension'} onClick={() => setTool('dimension')} title="Dimension (M)" disabled={readonly}>
            <Ruler className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton onClick={undo} title="Undo (Ctrl+Z)" disabled={readonly || history.past.length === 0}>
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={redo} title="Redo (Ctrl+Shift+Z)" disabled={readonly || history.future.length === 0}>
            <Redo2 className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Templates */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton active={showTemplatePanel} onClick={() => setShowTemplatePanel(!showTemplatePanel)} title="Templates (T)" disabled={readonly}>
            <LayoutTemplate className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Wall Type */}
        {(tool === 'wall' || tool === 'room') && (
          <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
            <select value={wallType} onChange={(e) => setWallType(e.target.value as WallType)}
              className="bg-zinc-700 text-white text-xs px-2 py-1 rounded border border-zinc-600">
              <option value="exterior">Exterior (23cm)</option>
              <option value="interior">Interior (15cm)</option>
              <option value="partition">Partition (10cm)</option>
            </select>
          </div>
        )}

        {/* Snap & Ortho */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton active={snapSettings.enabled} onClick={() => setSnapSettings(prev => ({ ...prev, enabled: !prev.enabled }))} title="Snap (G)">
            <Magnet className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={orthoMode} onClick={() => setOrthoMode(!orthoMode)} title="Ortho (O)">
            <PenTool className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={showGrid} onClick={() => setShowGrid(!showGrid)} title="Grid">
            <Grid3X3 className="h-4 w-4" />
          </ToolButton>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton onClick={handleZoomIn} title="Zoom In"><ZoomIn className="h-4 w-4" /></ToolButton>
          <span className="text-xs text-zinc-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <ToolButton onClick={handleZoomOut} title="Zoom Out"><ZoomOut className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={handleResetView} title="Reset"><RotateCcw className="h-4 w-4" /></ToolButton>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
          <ToolButton onClick={() => {
            if (selectedWallId) deleteWall(selectedWallId);
            else if (selectedRoomId) deleteRoom(selectedRoomId);
          }} title="Delete (Del)" disabled={!selectedWallId && !selectedRoomId}>
            <Trash2 className="h-4 w-4" />
          </ToolButton>
          <button onClick={handleClear} className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded">Clear</button>
        </div>

        {/* Export */}
        <div className="flex items-center gap-1">
          <ToolButton onClick={handleExport} title="Export JSON"><Download className="h-4 w-4" /></ToolButton>
          <button onClick={handleExportPNG} className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded">PNG</button>
          <button onClick={handleExportSVG} className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">SVG</button>
          <label>
            <ToolButton title="Import JSON" disabled={readonly}><Upload className="h-4 w-4" /></ToolButton>
            <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={readonly} />
          </label>
        </div>

        {/* Floor & Scale */}
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400 font-bold">{floorLabel}</span>
            <span className="text-xs text-zinc-500">(Floor {floorNumber})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Scale:</span>
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}
              className="bg-zinc-700 text-white text-xs px-2 py-1 rounded border border-zinc-600">
              <option value={25}>1m = 25px (large plans)</option>
              <option value={35}>1m = 35px</option>
              <option value={50}>1m = 50px (default)</option>
              <option value={75}>1m = 75px</option>
              <option value={100}>1m = 100px (detail)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-3 py-1 bg-zinc-800 text-xs text-zinc-400 border-b border-zinc-700">
        {tool === 'wall' && (
          <span><strong>Wall:</strong> Click to start, move to draw, click to place. Double-click to finish chain.
            {orthoMode && <span className="text-amber-400 ml-2">[ORTHO ON]</span>}
          </span>
        )}
        {tool === 'room' && <span><strong>Room:</strong> Click and drag to draw a room rectangle. Room type dialog will appear.</span>}
        {tool === 'room_label' && <span><strong>Label:</strong> Click inside a room to assign type and name.</span>}
        {tool === 'select' && (
          <span><strong>Select:</strong> Drag rooms to move. Click walls to select. DEL to delete.
            {selectedRoomTemplate && <span className="text-amber-400 ml-2">Click canvas to place: {selectedRoomTemplate.name}</span>}
          </span>
        )}
        {tool === 'door' && <span><strong>Door:</strong> Click on a wall to place door.</span>}
        {tool === 'window' && <span><strong>Window:</strong> Click on a wall to place window.</span>}
        {tool === 'stair' && <span><strong>Stair:</strong> Click to place stairs.</span>}
        {tool === 'dimension' && <span><strong>Dimension:</strong> Click on a wall to add dimension line.</span>}
        <span className="float-right">W=Wall R=Room L=Label D=Door A=Stair T=Templates Ctrl+Z=Undo ESC=Cancel</span>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Templates Panel */}
        {showTemplatePanel && (
          <div className="w-48 bg-zinc-800 border-r border-zinc-700 p-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-white">Room Templates</h4>
              <button onClick={() => setShowTemplatePanel(false)} className="text-zinc-400 hover:text-white text-xs">✕</button>
            </div>
            <p className="text-xs text-zinc-500 mb-2">Click template, then click canvas to place</p>
            <div className="space-y-1">
              {ROOM_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => { setSelectedRoomTemplate(template); setTool('select'); }}
                  className={`w-full text-left p-2 rounded text-xs transition-colors ${
                    selectedRoomTemplate?.id === template.id
                      ? 'bg-amber-500 text-white'
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
              <button onClick={() => setSelectedRoomTemplate(null)}
                className="w-full mt-2 p-2 text-xs bg-zinc-600 hover:bg-zinc-500 text-white rounded">
                Cancel Template
              </button>
            )}
          </div>
        )}

        {/* Konva Canvas */}
        <div className="flex-1 overflow-auto bg-zinc-950 p-4">
          <div className="inline-block border border-zinc-700 rounded">
            <Stage
              ref={stageRef}
              width={width}
              height={height}
              scaleX={zoom}
              scaleY={zoom}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onDblClick={handleStageDblClick}
              style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
            >
              {/* Background + Grid */}
              <Layer listening={false}>
                <Rect x={0} y={0} width={width} height={height} fill={CANVAS_BACKGROUND} />
                {gridLines.map((line, i) => (
                  <Line key={`grid-${i}`} points={line.points} stroke={line.stroke}
                    strokeWidth={line.strokeWidth} listening={false} />
                ))}
              </Layer>

              {/* Rooms (fills) */}
              <Layer listening={false}>
                {computeAllRooms.filter(r => !(r.boundaryWalls && r.boundaryWalls.length > 0 && tool === 'select')).map(room => {
                  const colors = ROOM_COLORS[room.type];
                  const flatPoints = room.polygon.flatMap(p => [p.x, p.y]);
                  const minX = Math.min(...room.polygon.map(p => p.x));
                  const maxX = Math.max(...room.polygon.map(p => p.x));
                  const minY = Math.min(...room.polygon.map(p => p.y));
                  const maxY = Math.max(...room.polygon.map(p => p.y));
                  const rw = maxX - minX;
                  const rh = maxY - minY;
                  const widthM = pixelsToMeters(rw, scale);
                  const heightM = pixelsToMeters(rh, scale);
                  return (
                    <React.Fragment key={room.id}>
                      <Line points={flatPoints} closed fill={colors.fill} listening={false} />
                      <Text
                        x={room.centroid.x} y={room.centroid.y - 12}
                        text={`${room.name}\n${widthM.toFixed(1)}m × ${heightM.toFixed(1)}m\n${formatArea(room.area)}`}
                        fontSize={11} fill={colors.label} fontStyle="bold"
                        align="center" offsetX={40} listening={false}
                      />
                    </React.Fragment>
                  );
                })}
              </Layer>

              {/* Movable rooms — draggable & resizable groups */}
              <Layer>
                {computeAllRooms.filter(r => r.boundaryWalls && r.boundaryWalls.length > 0 && tool === 'select').map(room => {
                  const colors = ROOM_COLORS[room.type];
                  const minX = Math.min(...room.polygon.map(p => p.x));
                  const maxX = Math.max(...room.polygon.map(p => p.x));
                  const minY = Math.min(...room.polygon.map(p => p.y));
                  const maxY = Math.max(...room.polygon.map(p => p.y));
                  const rw = maxX - minX;
                  const rh = maxY - minY;
                  const widthM = pixelsToMeters(rw, scale);
                  const heightM = pixelsToMeters(rh, scale);
                  // Boost fill opacity so the shape is clearly visible
                  const solidFill = colors.fill.replace(/[\d.]+\)$/, '0.5)');
                  const isSelected = selectedRoomId === room.id;
                  return (
                    <Group
                      key={room.id}
                      ref={(node: Konva.Group | null) => {
                        if (node) roomNodeRefs.current.set(room.id, node);
                        else roomNodeRefs.current.delete(room.id);
                      }}
                      x={minX}
                      y={minY}
                      scaleX={1}
                      scaleY={1}
                      draggable
                      onMouseDown={(e) => {
                        // Stop propagation so the Stage handler doesn't override selection
                        e.cancelBubble = true;
                        setSelectedRoomId(room.id);
                        setSelectedWallId(null);
                      }}
                      onTap={(e) => {
                        e.cancelBubble = true;
                        setSelectedRoomId(room.id);
                        setSelectedWallId(null);
                      }}
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grab';
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = '';
                      }}
                      onDragStart={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grabbing';
                        handleRoomDragStart();
                      }}
                      onDragEnd={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grab';
                        const node = e.target;
                        handleRoomDragEnd(
                          room.id,
                          room.boundaryWalls,
                          minX, minY,
                          node.x(), node.y()
                        );
                      }}
                      onTransformEnd={() => {
                        handleRoomTransformEnd(room.id, room.boundaryWalls);
                      }}
                    >
                      {/* Solid room fill — the actual visible shape */}
                      <Rect
                        width={rw} height={rh}
                        fill={solidFill}
                        stroke={isSelected ? '#2563eb' : SELECTION_COLOR}
                        strokeWidth={isSelected ? 3 : 2}
                        cornerRadius={2}
                        shadowColor={isSelected ? 'rgba(37,99,235,0.5)' : 'rgba(59,130,246,0.35)'}
                        shadowBlur={isSelected ? 12 : 8}
                        shadowOffsetX={0}
                        shadowOffsetY={2}
                        shadowEnabled
                      />
                      {/* Inner dashed guide to hint at movability */}
                      <Rect
                        width={rw} height={rh}
                        fill="transparent"
                        stroke={colors.stroke}
                        strokeWidth={1}
                        dash={[6, 4]}
                        listening={false}
                      />
                      <Text
                        x={rw / 2} y={rh / 2 - 12}
                        text={`${room.name}\n${widthM.toFixed(1)}m × ${heightM.toFixed(1)}m\n${formatArea(room.area)}`}
                        fontSize={11} fill={colors.label} fontStyle="bold"
                        align="center" offsetX={40} listening={false}
                      />
                    </Group>
                  );
                })}
                {/* Transformer for resizing selected room */}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={false}
                  keepRatio={false}
                  enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
                  boundBoxFunc={(oldBox, newBox) => {
                    // Enforce minimum 1m × 1m
                    const minPx = metersToPixels(1, scale);
                    if (newBox.width < minPx || newBox.height < minPx) {
                      return oldBox;
                    }
                    return newBox;
                  }}
                  anchorFill="#3b82f6"
                  anchorStroke="#1d4ed8"
                  anchorSize={8}
                  anchorCornerRadius={2}
                  borderStroke="#3b82f6"
                  borderStrokeWidth={1}
                  borderDash={[4, 4]}
                />
              </Layer>

              {/* Walls + Doors + Windows + Stairs */}
              <Layer>
                {wallShapes.map(({ wall, flatPoints, colors, length, mid, wallAngle }) => (
                  <React.Fragment key={wall.id}>
                    <Line
                      points={flatPoints} closed
                      fill={colors.fill}
                      stroke={wall.id === selectedWallId ? SELECTION_COLOR : colors.stroke}
                      strokeWidth={wall.id === selectedWallId ? 3 : 2}
                    />
                    <Text
                      x={mid.x} y={mid.y}
                      text={formatMeasurement(length)}
                      fontSize={10} fill="#666"
                      offsetX={15} offsetY={5}
                      rotation={wallAngle > 90 || wallAngle < -90 ? wallAngle + 180 : wallAngle}
                      listening={false}
                    />
                  </React.Fragment>
                ))}
                {doorShapes.map(({ door, doorCenter, wallAngle: wa, doorWidthPx, thicknessPx }) => (
                  <Rect
                    key={door.id}
                    x={doorCenter.x} y={doorCenter.y}
                    width={doorWidthPx} height={thicknessPx}
                    fill={CANVAS_BACKGROUND}
                    stroke={DOOR_COLORS.frame}
                    strokeWidth={2}
                    rotation={(wa * 180) / Math.PI}
                    offsetX={doorWidthPx / 2} offsetY={thicknessPx / 2}
                  />
                ))}
                {windowShapes.map(({ win, winCenter, wallAngle: wa, windowWidthPx, thicknessPx }) => (
                  <React.Fragment key={win.id}>
                    <Rect
                      x={winCenter.x} y={winCenter.y}
                      width={windowWidthPx} height={thicknessPx}
                      fill={WINDOW_COLORS.glass}
                      stroke={WINDOW_COLORS.frame}
                      strokeWidth={3}
                      rotation={(wa * 180) / Math.PI}
                      offsetX={windowWidthPx / 2} offsetY={thicknessPx / 2}
                    />
                    <Line
                      points={[
                        winCenter.x - Math.cos(wa + Math.PI / 2) * thicknessPx / 2,
                        winCenter.y - Math.sin(wa + Math.PI / 2) * thicknessPx / 2,
                        winCenter.x + Math.cos(wa + Math.PI / 2) * thicknessPx / 2,
                        winCenter.y + Math.sin(wa + Math.PI / 2) * thicknessPx / 2,
                      ]}
                      stroke={WINDOW_COLORS.frame} strokeWidth={2} listening={false}
                    />
                  </React.Fragment>
                ))}
                {stairShapes.map(({ stair, widthPx, lengthPx, stepHeight, x, y }) => (
                  <Group key={stair.id} x={x} y={y} rotation={stair.rotation}>
                    <Rect width={widthPx} height={lengthPx} fill={STAIR_COLORS.fill} stroke={STAIR_COLORS.stroke} strokeWidth={2} />
                    {Array.from({ length: stair.numSteps - 1 }, (_, i) => (
                      <Line key={i} points={[0, (i + 1) * stepHeight, widthPx, (i + 1) * stepHeight]}
                        stroke={STAIR_COLORS.steps} strokeWidth={1} />
                    ))}
                    <Arrow
                      points={[
                        widthPx / 2, stair.direction === 'up' ? lengthPx - 20 : 20,
                        widthPx / 2, stair.direction === 'up' ? 20 : lengthPx - 20,
                      ]}
                      stroke={STAIR_COLORS.arrow} fill={STAIR_COLORS.arrow}
                      strokeWidth={3} pointerLength={10} pointerWidth={10}
                    />
                    <Text
                      x={widthPx / 2} y={stair.direction === 'up' ? lengthPx - 35 : 25}
                      text={stair.direction.toUpperCase()}
                      fontSize={10} fill={STAIR_COLORS.arrow} fontStyle="bold"
                      align="center" offsetX={10}
                    />
                  </Group>
                ))}
              </Layer>

              {/* Dimensions + Preview + Snap */}
              <Layer listening={false}>
                {dimensionShapes.map(({ dim, dimAngle: da, dimMid, wall: dWall, adjustedAngle }) => (
                  <React.Fragment key={dim.id}>
                    {dWall && (
                      <>
                        <Line points={[dWall.start.x, dWall.start.y, dim.start.x, dim.start.y]}
                          stroke={DIMENSION_COLORS.extension} strokeWidth={1} dash={[2, 2]} />
                        <Line points={[dWall.end.x, dWall.end.y, dim.end.x, dim.end.y]}
                          stroke={DIMENSION_COLORS.extension} strokeWidth={1} dash={[2, 2]} />
                      </>
                    )}
                    <Arrow
                      points={[dim.start.x, dim.start.y, dim.end.x, dim.end.y]}
                      stroke={DIMENSION_COLORS.line} strokeWidth={1}
                      pointerLength={6} pointerWidth={6}
                      fill={DIMENSION_COLORS.arrow}
                    />
                    <Text
                      x={dimMid.x} y={dimMid.y - 8}
                      text={formatMeasurement(dim.value)}
                      fontSize={11} fill={DIMENSION_COLORS.text}
                      align="center" offsetX={15}
                      rotation={adjustedAngle}
                    />
                  </React.Fragment>
                ))}
                {previewShapes && previewShapes.type === 'wall' && (
                  <>
                    <Line points={previewShapes.flatPoints} closed fill={PREVIEW_COLOR}
                      stroke={WALL_COLORS[wallType].stroke} strokeWidth={2} dash={[5, 5]} />
                    <Line points={[previewShapes.start.x, previewShapes.start.y, previewShapes.end.x, previewShapes.end.y]}
                      stroke="#3b82f6" strokeWidth={1} dash={[3, 3]} />
                    <Text x={previewShapes.mid.x} y={previewShapes.mid.y - 20}
                      text={formatMeasurement(previewShapes.wallLength)}
                      fontSize={12} fill={DIMENSION_COLORS.text}
                      align="center" offsetX={20} />
                  </>
                )}
                {previewShapes && previewShapes.type === 'room' && (
                  <>
                    <Rect x={previewShapes.x} y={previewShapes.y}
                      width={previewShapes.w} height={previewShapes.h}
                      fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6"
                      strokeWidth={2} dash={[5, 5]} />
                    <Text x={previewShapes.x + previewShapes.w / 2} y={previewShapes.y - 20}
                      text={`${previewShapes.widthM.toFixed(2)}m`}
                      fontSize={12} fill={DIMENSION_COLORS.text} align="center" offsetX={20} />
                    <Text x={previewShapes.x - 25} y={previewShapes.y + previewShapes.h / 2}
                      text={`${previewShapes.heightM.toFixed(2)}m`}
                      fontSize={12} fill={DIMENSION_COLORS.text} rotation={-90} offsetX={10} />
                    <Text x={previewShapes.x + previewShapes.w / 2} y={previewShapes.y + previewShapes.h / 2}
                      text={`${previewShapes.area.toFixed(1)}m²`}
                      fontSize={14} fill="#3b82f6" fontStyle="bold" align="center" offsetX={20} />
                  </>
                )}
                {activeSnapPoint && activeSnapPoint.type !== 'grid' && (
                  <Circle
                    x={activeSnapPoint.point.x} y={activeSnapPoint.point.y}
                    radius={6} fill="transparent"
                    stroke={SNAP_COLORS[activeSnapPoint.type]} strokeWidth={2}
                  />
                )}
              </Layer>
            </Stage>
          </div>
        </div>

        {/* Summary Panel */}
        <div className="w-64 bg-zinc-800 border-l border-zinc-700 p-3 overflow-y-auto">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Ruler className="h-4 w-4" />Building Summary
          </h3>

          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">Valuation Ready</span>
              <span className={`font-bold ${
                summary.valuationReadiness >= 90 ? 'text-green-400' :
                summary.valuationReadiness >= 70 ? 'text-amber-400' : 'text-red-400'
              }`}>{summary.valuationReadiness}%</span>
            </div>
            {summary.validationIssues.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                <ul className="list-disc list-inside">
                  {summary.validationIssues.slice(0, 3).map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}
          </div>

          <hr className="border-zinc-700 my-3" />

          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-zinc-400">Total Built Area</span><span className="text-white font-mono">{summary.totalBuiltArea.toFixed(1)} m²</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Usable Area</span><span className="text-white font-mono">{summary.usableArea.toFixed(1)} m²</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Efficiency</span><span className="text-white font-mono">{(summary.buildingEfficiency * 100).toFixed(0)}%</span></div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Layout Score</span>
              <span className={`font-mono ${summary.layoutQualityScore >= 80 ? 'text-green-400' : summary.layoutQualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {summary.layoutQualityScore}/100
              </span>
            </div>
          </div>

          <hr className="border-zinc-700 my-3" />

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1"><span className="text-zinc-400">🛏️ Bedrooms:</span><span className="text-white">{summary.bedroomCount}</span></div>
            <div className="flex items-center gap-1"><span className="text-zinc-400">🚿 Bathrooms:</span><span className="text-white">{summary.bathroomCount}</span></div>
            <div className="flex items-center gap-1"><span className="text-zinc-400">🍳 Kitchens:</span><span className="text-white">{summary.kitchenCount}</span></div>
            <div className="flex items-center gap-1"><span className="text-zinc-400">🛋️ Living:</span><span className="text-white">{summary.livingAreaCount}</span></div>
          </div>

          <hr className="border-zinc-700 my-3" />

          <h4 className="text-xs font-bold text-zinc-300 mb-2">Rooms</h4>
          {rooms.length === 0 ? (
            <p className="text-xs text-zinc-500">Draw walls to create rooms</p>
          ) : (
            <div className="space-y-1">
              {rooms.map((room) => (
                <div key={room.id} className="flex justify-between items-center p-1 rounded bg-zinc-700/50 text-xs">
                  <span className="text-zinc-300">{room.name}</span>
                  <span className="text-zinc-400 font-mono">{room.area.toFixed(1)}m²</span>
                </div>
              ))}
            </div>
          )}

          <hr className="border-zinc-700 my-3" />

          <h4 className="text-xs font-bold text-zinc-300 mb-2">Walls</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-zinc-400">Total Walls</span><span className="text-white">{walls.length}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Exterior</span><span className="text-white font-mono">{summary.exteriorWallLength.toFixed(1)}m</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Interior</span><span className="text-white font-mono">{summary.interiorWallLength.toFixed(1)}m</span></div>
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
          ? 'bg-amber-500 text-white'
          : disabled
          ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
      }`}
    >
      {children}
    </button>
  );
}
