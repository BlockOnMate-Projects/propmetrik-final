/**
 * Professional Floor Plan Builder - Constants
 * 
 * CAD-level constants for walls, doors, windows, colors, and building codes.
 */

import { RoomType, WallType, DoorStyle, WindowStyle, SnapMode, RoomTemplate } from './types';

// =====================================================
// SCALE & GRID CONSTANTS
// =====================================================

export const DEFAULT_SCALE = 100; // pixels per meter
export const DEFAULT_GRID_SIZE = 10; // 10cm grid
export const MIN_SCALE = 25;
export const MAX_SCALE = 200;

// =====================================================
// WALL CONSTANTS
// =====================================================

export const WALL_THICKNESS: Record<WallType, number> = {
  exterior: 0.23,       // 23cm - typical concrete block
  interior: 0.15,       // 15cm - standard partition
  load_bearing: 0.23,   // 23cm - structural
  partition: 0.10,      // 10cm - thin partition/drywall
};

export const WALL_COLORS: Record<WallType, { fill: string; stroke: string }> = {
  exterior: { fill: '#374151', stroke: '#1f2937' },      // dark gray
  interior: { fill: '#6b7280', stroke: '#4b5563' },      // medium gray
  load_bearing: { fill: '#374151', stroke: '#1f2937' },  // dark gray
  partition: { fill: '#9ca3af', stroke: '#6b7280' },     // light gray
};

export const DEFAULT_WALL_HEIGHT = 2.8; // meters

// =====================================================
// DOOR CONSTANTS
// =====================================================

export const DOOR_SIZES: Record<DoorStyle, { width: number; height: number }> = {
  single_swing: { width: 0.90, height: 2.10 },
  double_swing: { width: 1.50, height: 2.10 },
  sliding: { width: 1.80, height: 2.10 },
  pocket: { width: 0.90, height: 2.10 },
  bifold: { width: 1.20, height: 2.10 },
  french: { width: 1.50, height: 2.10 },
};

export const DOOR_COLORS = {
  frame: '#92400e',     // brown
  panel: '#fbbf24',     // amber/wood
  swing_arc: 'rgba(59, 130, 246, 0.3)', // blue arc
  selected: '#3b82f6',  // blue
};

// =====================================================
// WINDOW CONSTANTS
// =====================================================

export const WINDOW_SIZES: Record<WindowStyle, { width: number; height: number }> = {
  casement: { width: 1.20, height: 1.20 },
  sliding: { width: 1.80, height: 1.20 },
  fixed: { width: 1.50, height: 1.50 },
  awning: { width: 1.00, height: 0.60 },
  louver: { width: 0.60, height: 1.20 },
};

export const DEFAULT_SILL_HEIGHT = 0.90; // meters from floor

export const WINDOW_COLORS = {
  frame: '#1e40af',     // dark blue
  glass: 'rgba(147, 197, 253, 0.5)', // light blue transparent
  selected: '#3b82f6',  // blue
};

// =====================================================
// STAIR CONSTANTS
// =====================================================

export const STAIR_DEFAULTS = {
  width: 100,           // 100cm (1 meter) - standard stair width
  length: 300,          // 300cm (3 meters) - typical run length
  numSteps: 14,         // standard floor height / riser height
  riserHeight: 18,      // cm per step
  treadDepth: 25,       // cm per step
};

export const STAIR_COLORS = {
  fill: 'rgba(156, 163, 175, 0.4)',   // gray transparent
  stroke: '#4b5563',                   // dark gray
  steps: '#6b7280',                    // medium gray
  arrow: '#1f2937',                    // dark for direction arrow
  selected: '#3b82f6',                 // blue
};

// =====================================================
// ROOM COLORS (with proper opacity for fills)
// =====================================================

export const ROOM_COLORS: Record<RoomType, { fill: string; stroke: string; label: string }> = {
  bedroom:        { fill: 'rgba(147, 197, 253, 0.3)', stroke: '#3b82f6', label: '#1e40af' },
  master_bedroom: { fill: 'rgba(99, 102, 241, 0.3)',  stroke: '#6366f1', label: '#4338ca' },
  bathroom:       { fill: 'rgba(167, 243, 208, 0.3)', stroke: '#10b981', label: '#047857' },
  master_bathroom:{ fill: 'rgba(52, 211, 153, 0.3)',  stroke: '#34d399', label: '#059669' },
  kitchen:        { fill: 'rgba(253, 224, 71, 0.3)',  stroke: '#eab308', label: '#a16207' },
  living_room:    { fill: 'rgba(252, 211, 77, 0.3)',  stroke: '#f59e0b', label: '#b45309' },
  dining_room:    { fill: 'rgba(251, 191, 36, 0.3)',  stroke: '#f59e0b', label: '#b45309' },
  storage:        { fill: 'rgba(209, 213, 219, 0.3)', stroke: '#6b7280', label: '#374151' },
  corridor:       { fill: 'rgba(229, 231, 235, 0.2)', stroke: '#9ca3af', label: '#6b7280' },
  porch:          { fill: 'rgba(196, 181, 253, 0.3)', stroke: '#8b5cf6', label: '#6d28d9' },
  garage:         { fill: 'rgba(156, 163, 175, 0.3)', stroke: '#6b7280', label: '#374151' },
  laundry:        { fill: 'rgba(147, 197, 253, 0.3)', stroke: '#3b82f6', label: '#1e40af' },
  office:         { fill: 'rgba(254, 202, 202, 0.3)', stroke: '#ef4444', label: '#b91c1c' },
  balcony:        { fill: 'rgba(196, 181, 253, 0.3)', stroke: '#8b5cf6', label: '#6d28d9' },
  utility:        { fill: 'rgba(209, 213, 219, 0.3)', stroke: '#6b7280', label: '#374151' },
  stairwell:      { fill: 'rgba(251, 191, 36, 0.3)',  stroke: '#f59e0b', label: '#b45309' },
};

export const ROOM_ICONS: Record<RoomType, string> = {
  bedroom: '🛏️',
  master_bedroom: '🛏️',
  bathroom: '🚿',
  master_bathroom: '🛁',
  kitchen: '🍳',
  living_room: '🛋️',
  dining_room: '🍽️',
  storage: '📦',
  corridor: '🚪',
  porch: '🏠',
  garage: '🚗',
  laundry: '🧺',
  office: '💼',
  balcony: '🌳',
  utility: '🔧',
  stairwell: '🔼',
};

// =====================================================
// GHANA BUILDING CODE - MINIMUM ROOM SIZES (m²)
// =====================================================

export const MINIMUM_ROOM_SIZES: Record<RoomType, number> = {
  bedroom: 9,           // 9 m² minimum
  master_bedroom: 12,   // 12 m² recommended
  bathroom: 3,          // 3 m² minimum
  master_bathroom: 4.5, // 4.5 m² recommended
  kitchen: 5,           // 5 m² minimum
  living_room: 12,      // 12 m² minimum
  dining_room: 8,       // 8 m² minimum
  storage: 1,           // 1 m² minimum
  corridor: 1.2,        // 1.2m width minimum (as area proxy)
  porch: 3,             // 3 m² minimum
  garage: 15,           // 15 m² for single car
  laundry: 3,           // 3 m² minimum
  office: 6,            // 6 m² minimum
  balcony: 2,           // 2 m² minimum
  utility: 2,           // 2 m² minimum
  stairwell: 6,         // 6 m² for proper stairwell
};

// =====================================================
// SNAP CONSTANTS
// =====================================================

export const SNAP_TOLERANCE = 15; // pixels
export const SNAP_COLORS: Record<SnapMode, string> = {
  none: 'transparent',
  grid: '#9ca3af',
  endpoint: '#ef4444',      // red
  midpoint: '#22c55e',      // green
  perpendicular: '#3b82f6', // blue
  intersection: '#f59e0b',  // amber
  parallel: '#8b5cf6',      // purple
  nearest: '#6b7280',       // gray
};

export const SNAP_PRIORITY: Record<SnapMode, number> = {
  intersection: 100,
  endpoint: 90,
  perpendicular: 80,
  midpoint: 70,
  parallel: 60,
  nearest: 40,
  grid: 30,
  none: 0,
};

export const DEFAULT_SNAP_MODES: SnapMode[] = [
  'endpoint',
  'midpoint',
  'perpendicular',
  'intersection',
  'grid',
];

// =====================================================
// DIMENSION CONSTANTS
// =====================================================

export const DIMENSION_COLORS = {
  line: '#374151',
  text: '#1f2937',
  extension: '#9ca3af',
  arrow: '#374151',
};

export const DIMENSION_OFFSET = 30; // pixels from wall
export const DIMENSION_ARROW_SIZE = 8; // pixels
export const DIMENSION_FONT_SIZE = 11;
export const DIMENSION_PRECISION = 2; // decimal places

// =====================================================
// CANVAS CONSTANTS
// =====================================================

export const CANVAS_BACKGROUND = '#ffffff';
export const GRID_COLOR_MAJOR = '#d1d5db';
export const GRID_COLOR_MINOR = '#e5e7eb';

export const SELECTION_COLOR = '#3b82f6';
export const HOVER_COLOR = '#60a5fa';
export const PREVIEW_COLOR = 'rgba(59, 130, 246, 0.5)';

// =====================================================
// KEYBOARD SHORTCUTS
// =====================================================

export const KEYBOARD_SHORTCUTS = {
  select: 's',
  wall: 'w',
  room: 'r',        // Rectangle room tool
  door: 'd',
  window: 'n',
  stair: 'a',       // Stair tool (A for stairs/Access)
  dimension: 'm',
  roomLabel: 'l',   // Room label tool
  delete: 'Delete',
  escape: 'Escape',
  undo: 'z',
  redo: 'y',
  pan: ' ', // spacebar
  zoomIn: '+',
  zoomOut: '-',
  snapToggle: 'g',
  orthoToggle: 'o',
};

// =====================================================
// ROOM TEMPLATES
// =====================================================

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'bedroom-small',
    name: 'Small Bedroom',
    type: 'bedroom',
    width: 3,
    height: 3,
    icon: '🛏️',
    description: '3m × 3m (9m²)',
  },
  {
    id: 'bedroom-standard',
    name: 'Standard Bedroom',
    type: 'bedroom',
    width: 3.5,
    height: 4,
    icon: '🛏️',
    description: '3.5m × 4m (14m²)',
  },
  {
    id: 'master-bedroom',
    name: 'Master Bedroom',
    type: 'master_bedroom',
    width: 4,
    height: 5,
    icon: '🛏️',
    description: '4m × 5m (20m²)',
  },
  {
    id: 'bathroom-small',
    name: 'Small Bathroom',
    type: 'bathroom',
    width: 2,
    height: 2,
    icon: '🚿',
    description: '2m × 2m (4m²)',
  },
  {
    id: 'bathroom-standard',
    name: 'Standard Bathroom',
    type: 'bathroom',
    width: 2.5,
    height: 3,
    icon: '🚿',
    description: '2.5m × 3m (7.5m²)',
  },
  {
    id: 'master-bathroom',
    name: 'Master Bathroom',
    type: 'master_bathroom',
    width: 3,
    height: 3.5,
    icon: '🛁',
    description: '3m × 3.5m (10.5m²)',
  },
  {
    id: 'kitchen-small',
    name: 'Small Kitchen',
    type: 'kitchen',
    width: 2.5,
    height: 3,
    icon: '🍳',
    description: '2.5m × 3m (7.5m²)',
  },
  {
    id: 'kitchen-standard',
    name: 'Standard Kitchen',
    type: 'kitchen',
    width: 3.5,
    height: 4,
    icon: '🍳',
    description: '3.5m × 4m (14m²)',
  },
  {
    id: 'living-room',
    name: 'Living Room',
    type: 'living_room',
    width: 4,
    height: 5,
    icon: '🛋️',
    description: '4m × 5m (20m²)',
  },
  {
    id: 'dining-room',
    name: 'Dining Room',
    type: 'dining_room',
    width: 3,
    height: 4,
    icon: '🍽️',
    description: '3m × 4m (12m²)',
  },
  {
    id: 'office',
    name: 'Home Office',
    type: 'office',
    width: 3,
    height: 3,
    icon: '💼',
    description: '3m × 3m (9m²)',
  },
  {
    id: 'storage',
    name: 'Storage Room',
    type: 'storage',
    width: 2,
    height: 2,
    icon: '📦',
    description: '2m × 2m (4m²)',
  },
  {
    id: 'corridor',
    name: 'Corridor',
    type: 'corridor',
    width: 1.2,
    height: 3,
    icon: '🚪',
    description: '1.2m × 3m (3.6m²)',
  },
  {
    id: 'garage-single',
    name: 'Single Garage',
    type: 'garage',
    width: 3,
    height: 6,
    icon: '🚗',
    description: '3m × 6m (18m²)',
  },
  {
    id: 'garage-double',
    name: 'Double Garage',
    type: 'garage',
    width: 6,
    height: 6,
    icon: '🚗',
    description: '6m × 6m (36m²)',
  },
];

// =====================================================
// ORTHO MODE (lock to 90° angles)
// =====================================================

export const ORTHO_ANGLES = [0, 90, 180, 270]; // degrees
export const ORTHO_TOLERANCE = 5; // degrees

// =====================================================
// VALIDATION THRESHOLDS
// =====================================================

export const VALIDATION = {
  MIN_WALL_LENGTH: 0.5,     // minimum wall length in meters
  MAX_WALL_LENGTH: 50,      // maximum wall length in meters
  MIN_ROOM_AREA: 1,         // minimum room area in m²
  MIN_DOOR_WIDTH: 0.6,      // minimum door width in meters
  MIN_WINDOW_WIDTH: 0.3,    // minimum window width in meters
  MIN_BUILDING_AREA: 20,    // minimum total building area for valuation
  IDEAL_BATHROOM_RATIO: 0.5, // 1 bathroom per 2 bedrooms
  IDEAL_EFFICIENCY: 0.85,   // 85% usable area
};
