/**
 * Ghana Building Code LI 1630
 * 
 * Comprehensive building code validation for Ghana properties.
 * Based on Ghana Building Code Legislative Instrument 1630.
 * 
 * @module services/geometry/ghanaBuildingCode
 * @version 1.0.0
 * @since 2026-01-14
 */

import type {
  BlenderGeometryResult,
  RoomType,
  RoomGeometry,
  WallGeometry,
  OpeningGeometry,
} from '../../../types/floorPlanDesign';

// ============================================================================
// BUILDING CODE CONSTANTS
// ============================================================================

/**
 * Ghana Building Code LI 1630 Requirements
 */
export const GHANA_BUILDING_CODE_LI_1630 = {
  // Minimum room sizes (in sqm)
  ROOM_MINIMUMS: {
    living: 12.0,
    living_room: 12.0,
    dining: 9.0,
    dining_room: 9.0,
    kitchen: 5.5,
    master_bedroom: 11.0,
    bedroom: 9.0,
    bathroom: 3.0,
    toilet: 1.5,
    storage: 2.0,
    store: 2.0,
    utility: 2.0,
    laundry: 3.0,
    entrance: 2.0,
    corridor: 1.8,
    staircase: 3.0,
    office: 9.0,
    garage: 15.0,
    balcony: 3.0,
    terrace: 4.0,
    other: 2.0,
  } as Record<RoomType | string, number>,

  // Minimum dimensions (in meters)
  DIMENSION_MINIMUMS: {
    room_width: 2.4,
    corridor_width: 1.0,
    door_width_internal: 0.9,
    door_width_external: 1.0,
    window_sill_height: 0.9,
    ceiling_height_residential: 2.7,
    ceiling_height_commercial: 2.8,
    window_area_ratio: 0.10, // 10% of floor area
  },

  // Wall thickness (in mm)
  WALL_THICKNESS: {
    external: 230, // Sandcrete block
    internal: 150, // Partition walls
    load_bearing: 200, // Internal load-bearing
  },

  // Floor height (in meters)
  FLOOR_HEIGHT: {
    residential: 2.7,
    commercial: 2.8,
    industrial: 3.0,
    minimum: 2.6,
  },

  // Staircase requirements
  STAIRCASE: {
    min_width: 0.9,
    max_riser: 0.19,
    min_tread: 0.25,
    headroom: 2.0,
    max_flight_without_landing: 16, // risers
  },

  // Ventilation requirements
  VENTILATION: {
    window_area_ratio: 0.10, // 10% of floor area minimum
    cross_ventilation_required: ['bedroom', 'master_bedroom', 'living', 'living_room'],
  },

  // Setback requirements (in meters)
  SETBACKS: {
    residential: {
      front: 4.5,
      rear: 3.0,
      side: 1.5,
    },
    commercial: {
      front: 6.0,
      rear: 3.0,
      side: 3.0,
    },
    industrial: {
      front: 9.0,
      rear: 6.0,
      side: 6.0,
    },
  },

  // Fire safety
  FIRE_SAFETY: {
    max_travel_distance_residential: 30, // meters to exit
    max_travel_distance_commercial: 45,
    min_exit_width: 0.9,
    min_exits_per_floor: {
      area_below_500: 1,
      area_500_to_1000: 2,
      area_above_1000: 3,
    },
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface CodeViolation {
  code: string;
  severity: ViolationSeverity;
  element_id?: string;
  element_type?: string;
  message: string;
  reference: string;
  actual_value?: number | string;
  required_value?: number | string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: CodeViolation[];
  warnings: CodeViolation[];
  info: CodeViolation[];
  summary: {
    total_violations: number;
    critical_errors: number;
    code_sections_checked: string[];
    compliance_score: number; // 0-100
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate geometry against Ghana Building Code LI 1630
 */
export function validateAgainstBuildingCode(
  geometry: BlenderGeometryResult,
  propertyType: 'residential' | 'commercial' | 'industrial' = 'residential'
): ValidationResult {
  const violations: CodeViolation[] = [];
  const sectionsChecked: string[] = [];

  // Check room sizes
  sectionsChecked.push('Schedule 1: Minimum Room Sizes');
  validateRoomSizes(geometry.rooms, violations);

  // Check room dimensions
  sectionsChecked.push('Section 4: Minimum Dimensions');
  validateRoomDimensions(geometry.rooms, violations);

  // Check wall thickness
  sectionsChecked.push('Section 3: Wall Construction');
  validateWallThickness(geometry.walls, violations);

  // Check openings (doors/windows)
  sectionsChecked.push('Section 5: Openings');
  validateOpenings(geometry.openings, geometry.rooms, violations);

  // Check floor heights
  sectionsChecked.push('Section 2: Floor Heights');
  validateFloorHeights(geometry.floors, propertyType, violations);

  // Check corridor widths
  sectionsChecked.push('Section 4.3: Circulation');
  validateCorridorWidths(geometry.rooms, violations);

  // Check ventilation
  sectionsChecked.push('Section 6: Ventilation');
  validateVentilation(geometry.rooms, geometry.openings, violations);

  // Categorize violations
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const info = violations.filter(v => v.severity === 'info');

  // Calculate compliance score
  const maxScore = 100;
  const errorPenalty = errors.length * 15;
  const warningPenalty = warnings.length * 5;
  const complianceScore = Math.max(0, maxScore - errorPenalty - warningPenalty);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    summary: {
      total_violations: violations.length,
      critical_errors: errors.length,
      code_sections_checked: sectionsChecked,
      compliance_score: complianceScore,
    },
  };
}

/**
 * Validate room sizes against minimums
 */
function validateRoomSizes(
  rooms: RoomGeometry[],
  violations: CodeViolation[]
): void {
  for (const room of rooms) {
    const roomType = room.room_type;
    const minSize = GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS[roomType];

    if (!minSize) continue; // Unknown room type

    // Get room area from bounding box if not directly available
    const roomArea = calculateRoomArea(room);

    if (roomArea < minSize) {
      violations.push({
        code: 'LI1630-ROOM-SIZE',
        severity: 'error',
        element_id: room.room_id,
        element_type: 'room',
        message: `${room.room_name || roomType} (${roomArea.toFixed(1)} sqm) is below minimum (${minSize} sqm)`,
        reference: 'Ghana Building Code LI 1630, Schedule 1',
        actual_value: roomArea,
        required_value: minSize,
        suggestion: `Increase room area by ${(minSize - roomArea).toFixed(1)} sqm`,
      });
    } else if (roomArea < minSize * 1.1) {
      violations.push({
        code: 'LI1630-ROOM-SIZE-WARNING',
        severity: 'warning',
        element_id: room.room_id,
        element_type: 'room',
        message: `${room.room_name || roomType} (${roomArea.toFixed(1)} sqm) is close to minimum (${minSize} sqm)`,
        reference: 'Ghana Building Code LI 1630, Schedule 1',
        actual_value: roomArea,
        required_value: minSize,
      });
    }
  }
}

/**
 * Validate room dimensions (width, length)
 */
function validateRoomDimensions(
  rooms: RoomGeometry[],
  violations: CodeViolation[]
): void {
  const minWidth = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.room_width;

  for (const room of rooms) {
    // Skip corridors and circulation spaces
    if (['corridor', 'entrance', 'staircase'].includes(room.room_type)) {
      continue;
    }

    const bbox = room.bounding_box;
    const width = Math.abs(bbox.max.x - bbox.min.x);
    const depth = Math.abs(bbox.max.y - bbox.min.y);
    const minDimension = Math.min(width, depth);

    if (minDimension < minWidth) {
      violations.push({
        code: 'LI1630-ROOM-WIDTH',
        severity: 'error',
        element_id: room.room_id,
        element_type: 'room',
        message: `${room.room_name || room.room_type} minimum dimension (${minDimension.toFixed(2)}m) is below ${minWidth}m`,
        reference: 'Ghana Building Code LI 1630, Section 4.1',
        actual_value: minDimension,
        required_value: minWidth,
      });
    }
  }
}

/**
 * Validate wall thickness
 */
function validateWallThickness(
  walls: WallGeometry[],
  violations: CodeViolation[]
): void {
  for (const wall of walls) {
    const expectedThickness = wall.wall_type === 'external'
      ? GHANA_BUILDING_CODE_LI_1630.WALL_THICKNESS.external
      : wall.is_structural
        ? GHANA_BUILDING_CODE_LI_1630.WALL_THICKNESS.load_bearing
        : GHANA_BUILDING_CODE_LI_1630.WALL_THICKNESS.internal;

    if (wall.thickness_mm < expectedThickness * 0.9) {
      violations.push({
        code: 'LI1630-WALL-THICKNESS',
        severity: 'warning',
        element_id: wall.wall_id,
        element_type: 'wall',
        message: `${wall.wall_type} wall thickness (${wall.thickness_mm}mm) below standard (${expectedThickness}mm)`,
        reference: 'Ghana Building Code LI 1630, Section 3.2',
        actual_value: wall.thickness_mm,
        required_value: expectedThickness,
      });
    }
  }
}

/**
 * Validate openings (doors and windows)
 */
function validateOpenings(
  openings: OpeningGeometry[],
  rooms: RoomGeometry[],
  violations: CodeViolation[]
): void {
  const minDoorWidthInternal = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.door_width_internal;
  const minDoorWidthExternal = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.door_width_external;

  for (const opening of openings) {
    if (opening.opening_type === 'door') {
      // Check door width
      // Assume external if connected to entrance or corridor
      const isExternal = false; // Would need wall context to determine
      const minWidth = isExternal ? minDoorWidthExternal : minDoorWidthInternal;

      if (opening.width_m < minWidth) {
        violations.push({
          code: 'LI1630-DOOR-WIDTH',
          severity: 'error',
          element_id: opening.opening_id,
          element_type: 'opening',
          message: `Door width (${opening.width_m.toFixed(2)}m) is below minimum (${minWidth}m)`,
          reference: 'Ghana Building Code LI 1630, Section 5.1',
          actual_value: opening.width_m,
          required_value: minWidth,
        });
      }
    }

    if (opening.opening_type === 'window') {
      // Check window sill height for safety
      const minSillHeight = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.window_sill_height;
      if (opening.sill_height_m && opening.sill_height_m < minSillHeight) {
        violations.push({
          code: 'LI1630-WINDOW-SILL',
          severity: 'warning',
          element_id: opening.opening_id,
          element_type: 'opening',
          message: `Window sill height (${opening.sill_height_m.toFixed(2)}m) is below recommended (${minSillHeight}m)`,
          reference: 'Ghana Building Code LI 1630, Section 5.2',
          actual_value: opening.sill_height_m,
          required_value: minSillHeight,
        });
      }
    }
  }
}

/**
 * Validate floor heights
 */
function validateFloorHeights(
  floors: Array<{ floor_to_floor_height_m: number; floor_number: number; floor_label: string }>,
  propertyType: 'residential' | 'commercial' | 'industrial',
  violations: CodeViolation[]
): void {
  const minHeight = propertyType === 'residential'
    ? GHANA_BUILDING_CODE_LI_1630.FLOOR_HEIGHT.residential
    : propertyType === 'commercial'
      ? GHANA_BUILDING_CODE_LI_1630.FLOOR_HEIGHT.commercial
      : GHANA_BUILDING_CODE_LI_1630.FLOOR_HEIGHT.industrial;

  for (const floor of floors) {
    if (floor.floor_to_floor_height_m < minHeight) {
      violations.push({
        code: 'LI1630-FLOOR-HEIGHT',
        severity: 'error',
        element_type: 'floor',
        message: `${floor.floor_label} height (${floor.floor_to_floor_height_m.toFixed(2)}m) is below minimum (${minHeight}m)`,
        reference: 'Ghana Building Code LI 1630, Section 2.1',
        actual_value: floor.floor_to_floor_height_m,
        required_value: minHeight,
      });
    }
  }
}

/**
 * Validate corridor widths
 */
function validateCorridorWidths(
  rooms: RoomGeometry[],
  violations: CodeViolation[]
): void {
  const minWidth = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.corridor_width;

  for (const room of rooms) {
    if (room.room_type === 'corridor') {
      const bbox = room.bounding_box;
      const width = Math.min(
        Math.abs(bbox.max.x - bbox.min.x),
        Math.abs(bbox.max.y - bbox.min.y)
      );

      if (width < minWidth) {
        violations.push({
          code: 'LI1630-CORRIDOR-WIDTH',
          severity: 'error',
          element_id: room.room_id,
          element_type: 'room',
          message: `Corridor width (${width.toFixed(2)}m) is below minimum (${minWidth}m)`,
          reference: 'Ghana Building Code LI 1630, Section 4.3',
          actual_value: width,
          required_value: minWidth,
        });
      }
    }
  }
}

/**
 * Validate ventilation requirements
 */
function validateVentilation(
  rooms: RoomGeometry[],
  openings: OpeningGeometry[],
  violations: CodeViolation[]
): void {
  const requiredRatio = GHANA_BUILDING_CODE_LI_1630.VENTILATION.window_area_ratio;
  const requiresCrossVent = GHANA_BUILDING_CODE_LI_1630.VENTILATION.cross_ventilation_required;

  for (const room of rooms) {
    // Check if room requires ventilation check
    if (!['living', 'living_room', 'bedroom', 'master_bedroom', 'kitchen'].includes(room.room_type)) {
      continue;
    }

    // Get windows in this room
    const roomWindows = openings.filter(
      o => o.opening_type === 'window' && room.opening_ids.includes(o.opening_id)
    );

    const roomArea = calculateRoomArea(room);
    const windowArea = roomWindows.reduce((sum, w) => sum + (w.width_m * w.height_m), 0);
    const actualRatio = windowArea / roomArea;

    if (actualRatio < requiredRatio) {
      violations.push({
        code: 'LI1630-VENTILATION',
        severity: 'warning',
        element_id: room.room_id,
        element_type: 'room',
        message: `${room.room_name || room.room_type} window area ratio (${(actualRatio * 100).toFixed(1)}%) is below minimum (${requiredRatio * 100}%)`,
        reference: 'Ghana Building Code LI 1630, Section 6.1',
        actual_value: actualRatio,
        required_value: requiredRatio,
        suggestion: `Add ${((requiredRatio - actualRatio) * roomArea).toFixed(1)} sqm of window area`,
      });
    }
  }
}

/**
 * Calculate room area from geometry
 */
function calculateRoomArea(room: RoomGeometry): number {
  // If vertices available, use shoelace formula
  if (room.vertices && room.vertices.length >= 3) {
    return calculatePolygonArea(room.vertices.map(v => ({ x: v.x, y: v.y })));
  }

  // Otherwise use bounding box
  const bbox = room.bounding_box;
  return Math.abs((bbox.max.x - bbox.min.x) * (bbox.max.y - bbox.min.y));
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(vertices: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }

  return Math.abs(area / 2);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get minimum room size for a room type
 */
export function getMinimumRoomSize(roomType: RoomType | string): number {
  return GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS[roomType] || 2.0;
}

/**
 * Get setback requirements for property type
 */
export function getSetbackRequirements(
  propertyType: 'residential' | 'commercial' | 'industrial' = 'residential'
): { front: number; rear: number; side: number } {
  return GHANA_BUILDING_CODE_LI_1630.SETBACKS[propertyType];
}

/**
 * Check if room type requires natural light
 */
export function requiresNaturalLight(roomType: RoomType): boolean {
  const requiresLight: RoomType[] = [
    'living',
    'dining',
    'bedroom',
    'master_bedroom',
    'kitchen',
    'office',
  ];
  return requiresLight.includes(roomType);
}

/**
 * Check if room type requires ventilation
 */
export function requiresVentilation(roomType: RoomType): boolean {
  const requiresVent: RoomType[] = [
    'living',
    'dining',
    'bedroom',
    'master_bedroom',
    'kitchen',
    'bathroom',
    'toilet',
    'laundry',
  ];
  return requiresVent.includes(roomType);
}

export default GHANA_BUILDING_CODE_LI_1630;
