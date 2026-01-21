/**
 * Professional Floor Plan Builder - Type Definitions
 * 
 * CAD-level types for walls, doors, windows, dimensions, and rooms.
 * Designed for professional property valuation workflows.
 */

// =====================================================
// CORE GEOMETRY TYPES
// =====================================================

export interface Point {
  x: number;
  y: number;
}

export interface Line {
  start: Point;
  end: Point;
}

// =====================================================
// WALL TYPES
// =====================================================

export type WallType = 
  | 'exterior'      // External walls (thicker, load-bearing)
  | 'interior'      // Internal partition walls
  | 'load_bearing'  // Structural walls
  | 'partition';    // Non-structural dividers

export interface Wall {
  id: string;
  type: WallType;
  start: Point;
  end: Point;
  thickness: number;        // in meters (default 0.15m = 15cm)
  height: number;           // in meters (default 2.8m)
  material?: string;        // 'concrete', 'block', 'drywall', etc.
  openings: WallOpening[];  // doors, windows cut into this wall
  connectedWalls: string[]; // IDs of walls that connect to endpoints
  isSelected?: boolean;
}

export interface WallOpening {
  id: string;
  type: 'door' | 'window' | 'archway';
  position: number;         // distance from wall start (0-1 ratio)
  width: number;            // in meters
  height: number;           // in meters
  sillHeight?: number;      // for windows, height from floor
  swingDirection?: 'left' | 'right' | 'double' | 'sliding';
}

// =====================================================
// DOOR & WINDOW TYPES
// =====================================================

export type DoorStyle = 
  | 'single_swing'
  | 'double_swing'
  | 'sliding'
  | 'pocket'
  | 'bifold'
  | 'french';

export type WindowStyle =
  | 'casement'
  | 'sliding'
  | 'fixed'
  | 'awning'
  | 'louver';

export interface Door {
  id: string;
  wallId: string;
  style: DoorStyle;
  width: number;            // in meters (standard: 0.9m)
  height: number;           // in meters (standard: 2.1m)
  position: number;         // ratio along wall (0-1)
  swingAngle: number;       // current swing angle for display
  swingDirection: 'inward' | 'outward';
  hingeSide: 'left' | 'right';
  isSelected?: boolean;
}

export interface Window {
  id: string;
  wallId: string;
  style: WindowStyle;
  width: number;            // in meters
  height: number;           // in meters
  sillHeight: number;       // height from floor (standard: 0.9m)
  position: number;         // ratio along wall (0-1)
  isSelected?: boolean;
}

// =====================================================
// STAIR TYPES
// =====================================================

export type StairDirection = 'up' | 'down';

export type StairStyle = 
  | 'straight'      // Simple straight staircase
  | 'l_shaped'      // L-shaped with landing
  | 'u_shaped'      // U-shaped with landing
  | 'spiral';       // Spiral staircase

export interface Stair {
  id: string;
  x: number;                // x position in cm
  y: number;                // y position in cm
  width: number;            // width in cm (default: 100cm / 1m)
  length: number;           // length in cm (default: 300cm / 3m)
  rotation: number;         // rotation in degrees (0, 90, 180, 270)
  direction: StairDirection;
  style: StairStyle;
  numSteps: number;         // number of steps (typically 12-14 for standard floor)
  isSelected?: boolean;
}

// =====================================================
// DIMENSION TYPES
// =====================================================

export type DimensionType = 
  | 'linear'        // Simple distance between two points
  | 'aligned'       // Along an object (wall)
  | 'angular'       // Angle measurement
  | 'area';         // Room area

export interface Dimension {
  id: string;
  type: DimensionType;
  start: Point;
  end: Point;
  offset: number;           // perpendicular offset from measured line
  value: number;            // calculated value in meters or degrees
  label?: string;           // optional custom label
  isLocked?: boolean;       // prevent auto-update
  associatedObjectId?: string; // wall/room ID this dimension is attached to
}

// =====================================================
// ROOM TYPES
// =====================================================

export type RoomType = 
  | 'bedroom'
  | 'master_bedroom'
  | 'bathroom'
  | 'master_bathroom'
  | 'kitchen'
  | 'living_room'
  | 'dining_room'
  | 'storage'
  | 'corridor'
  | 'porch'
  | 'garage'
  | 'laundry'
  | 'office'
  | 'balcony'
  | 'utility'
  | 'stairwell';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  boundaryWalls: string[];  // IDs of walls that form this room
  area: number;             // calculated area in m²
  perimeter: number;        // calculated perimeter in m
  centroid: Point;          // center point for label placement
  polygon: Point[];         // ordered points defining the room boundary
  floorLevel: number;       // 0 = ground floor
  ceilingHeight: number;    // in meters
  isSelected?: boolean;
}

// =====================================================
// SNAP TYPES
// =====================================================

export type SnapMode = 
  | 'none'
  | 'grid'
  | 'endpoint'
  | 'midpoint'
  | 'perpendicular'
  | 'intersection'
  | 'parallel'
  | 'nearest';

export interface SnapPoint {
  point: Point;
  type: SnapMode;
  sourceObjectId?: string;
  priority: number;         // higher = more important snap
}

export interface SnapSettings {
  enabled: boolean;
  gridSize: number;         // in cm
  tolerance: number;        // snap radius in pixels
  modes: SnapMode[];        // active snap modes
}

// =====================================================
// TOOL TYPES
// =====================================================

export type DrawingTool =
  | 'select'
  | 'wall'
  | 'room'        // Rectangle room tool - draws room box with auto-walls
  | 'door'
  | 'window'
  | 'stair'       // Stair symbol placement
  | 'dimension'
  | 'room_label'  // Click inside room to assign type
  | 'pan'
  | 'zoom';

// =====================================================
// UNDO/REDO TYPES
// =====================================================

export type ActionType =
  | 'ADD_WALL'
  | 'DELETE_WALL'
  | 'ADD_DOOR'
  | 'DELETE_DOOR'
  | 'ADD_WINDOW'
  | 'DELETE_WINDOW'
  | 'ADD_STAIR'
  | 'DELETE_STAIR'
  | 'ADD_ROOM'
  | 'DELETE_ROOM'
  | 'UPDATE_ROOM'
  | 'ADD_DIMENSION'
  | 'DELETE_DIMENSION'
  | 'CLEAR_ALL';

export interface HistoryAction {
  type: ActionType;
  data: any;
  inverseData?: any;
  timestamp: number;
}

export interface HistoryState {
  past: HistoryAction[];
  future: HistoryAction[];
}

// =====================================================
// ROOM TEMPLATE TYPES
// =====================================================

export interface RoomTemplate {
  id: string;
  name: string;
  type: RoomType;
  width: number;   // in meters
  height: number;  // in meters
  icon: string;
  description: string;
}

export interface ToolSettings {
  currentTool: DrawingTool;
  wallType: WallType;
  wallThickness: number;
  doorStyle: DoorStyle;
  doorWidth: number;
  windowStyle: WindowStyle;
  windowWidth: number;
  windowHeight: number;
}

// =====================================================
// FLOOR PLAN STATE
// =====================================================

export interface FloorPlanState {
  id: string;
  name: string;
  floorNumber: number;
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  stairs: Stair[];
  rooms: Room[];
  dimensions: Dimension[];
  scale: number;            // pixels per meter
  gridSize: number;         // in cm
  snapSettings: SnapSettings;
  viewportTransform: number[]; // fabric.js transform matrix
  selectedObjectIds: string[];
}

// =====================================================
// BUILDING SUMMARY
// =====================================================

export interface BuildingSummary {
  totalBuiltArea: number;
  usableArea: number;
  exteriorWallLength: number;
  interiorWallLength: number;
  roomCount: number;
  bedroomCount: number;
  bathroomCount: number;
  kitchenCount: number;
  livingAreaCount: number;
  buildingEfficiency: number;
  layoutQualityScore: number;
  validationIssues: string[];
  validationRecommendations: string[];
  valuationReadiness: number;
}

// =====================================================
// EXPORT TYPES
// =====================================================

export interface FloorPlanExport {
  version: string;
  exportDate: string;
  floorPlan: FloorPlanState;
  summary: BuildingSummary;
  canvasJson: object;       // Fabric.js canvas state
}

// =====================================================
// PROPERTY MEASUREMENTS (for valuation integration)
// =====================================================

export interface PropertyMeasurements {
  builtArea: number;
  usableArea: number;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  livingAreas: number;
  buildingEfficiency: number;
  layoutQualityScore: number;
  roomBreakdown: {
    id: string;
    name: string;
    type: RoomType;
    area: number;
    dimensions: { length: number; width: number };
  }[];
  floorPlanData: string;
  validationResults: {
    isComplete: boolean;
    issues: string[];
    recommendations: string[];
    readiness: number;
  };
}
