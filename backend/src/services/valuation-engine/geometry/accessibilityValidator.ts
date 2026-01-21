/**
 * Accessibility Validator
 * 
 * Validates accessibility requirements for buildings based on
 * Ghana Building Code LI 1630 and international accessibility standards.
 * 
 * @module services/geometry/accessibilityValidator
 * @version 1.0.0
 * @since 2026-01-14
 */

import type {
  BlenderGeometryResult,
  OpeningGeometry,
  RoomGeometry,
  WallGeometry,
} from '../../../types/floorPlanDesign';

// ============================================================================
// ACCESSIBILITY STANDARDS
// ============================================================================

/**
 * Accessibility requirements based on Ghana Building Code and universal design principles
 */
export const ACCESSIBILITY_STANDARDS = {
  // Door requirements
  DOORS: {
    min_width_standard: 0.9, // meters
    min_width_accessible: 1.0, // meters (wheelchair accessible)
    min_height: 2.1, // meters
    max_threshold_height: 0.013, // 13mm max threshold
    clear_opening_width: 0.8, // minimum clear opening
    maneuvering_clearance: 1.5, // meters in front of door
  },

  // Corridor requirements
  CORRIDORS: {
    min_width_standard: 1.0, // meters
    min_width_accessible: 1.2, // meters (wheelchair passage)
    min_width_passing: 1.5, // meters (two wheelchairs passing)
    turning_space: 1.5, // diameter for 180° turn
  },

  // Ramp requirements
  RAMPS: {
    max_slope: 1 / 12, // 8.33% grade
    max_slope_short: 1 / 8, // 12.5% for ramps under 1.5m
    max_rise_per_run: 0.75, // meters before landing required
    min_width: 0.9, // meters
    landing_length: 1.5, // meters at top and bottom
  },

  // Staircase requirements
  STAIRCASES: {
    min_width: 0.9, // meters
    max_riser_height: 0.19, // meters
    min_tread_depth: 0.25, // meters
    min_headroom: 2.0, // meters
    handrail_height: [0.86, 0.96], // meters range
    handrail_extension: 0.3, // meters beyond top and bottom
    max_risers_per_flight: 16,
  },

  // Room accessibility
  ROOMS: {
    wheelchair_turning_radius: 1.5, // meters
    min_bathroom_accessible: 5.0, // sqm for wheelchair accessible
    grab_bar_height: [0.75, 0.9], // meters range
    toilet_side_clearance: 0.45, // meters on transfer side
    sink_knee_clearance: 0.68, // meters height
  },

  // Elevator requirements (for multi-story buildings)
  ELEVATORS: {
    min_car_width: 1.1, // meters
    min_car_depth: 1.4, // meters
    min_door_width: 0.9, // meters
    required_above_floors: 3, // floors before elevator required
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type AccessibilityLevel = 'full' | 'basic' | 'none';

export interface AccessibilityViolation {
  code: string;
  severity: 'error' | 'warning' | 'info';
  element_id?: string;
  element_type?: string;
  message: string;
  standard: string;
  actual_value?: number | string;
  required_value?: number | string;
  remediation?: string;
}

export interface AccessibilityValidationResult {
  accessible: boolean;
  level: AccessibilityLevel;
  score: number; // 0-100
  violations: AccessibilityViolation[];
  summary: {
    doors_compliant: number;
    doors_total: number;
    corridors_compliant: boolean;
    bathrooms_accessible: number;
    bathrooms_total: number;
    vertical_circulation: 'stairs_only' | 'elevator' | 'single_floor';
    recommendations: string[];
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate building accessibility
 */
export function validateAccessibility(
  geometry: BlenderGeometryResult,
  requireFullAccessibility: boolean = false
): AccessibilityValidationResult {
  const violations: AccessibilityViolation[] = [];
  const recommendations: string[] = [];

  // Track compliance counts
  let doorsCompliant = 0;
  let doorsTotal = 0;
  let bathroomsAccessible = 0;
  let bathroomsTotal = 0;
  let corridorsCompliant = true;

  // Validate doors
  for (const opening of geometry.openings) {
    if (opening.opening_type === 'door') {
      doorsTotal++;
      const doorResult = validateDoorAccessibility(opening, requireFullAccessibility);
      if (doorResult.compliant) {
        doorsCompliant++;
      } else {
        violations.push(...doorResult.violations);
      }
    }
  }

  // Validate corridors
  const corridorRooms = geometry.rooms.filter(r => r.room_type === 'corridor');
  for (const corridor of corridorRooms) {
    const corridorResult = validateCorridorAccessibility(corridor, requireFullAccessibility);
    if (!corridorResult.compliant) {
      corridorsCompliant = false;
      violations.push(...corridorResult.violations);
    }
  }

  // Validate bathrooms
  const bathrooms = geometry.rooms.filter(r =>
    r.room_type === 'bathroom' || r.room_type === 'toilet'
  );
  bathroomsTotal = bathrooms.length;
  for (const bathroom of bathrooms) {
    const bathroomResult = validateBathroomAccessibility(bathroom);
    if (bathroomResult.accessible) {
      bathroomsAccessible++;
    } else if (requireFullAccessibility) {
      violations.push(...bathroomResult.violations);
    }
  }

  // Validate vertical circulation
  const floorCount = geometry.floors.length;
  let verticalCirculation: 'stairs_only' | 'elevator' | 'single_floor' = 'single_floor';

  if (floorCount > 1) {
    verticalCirculation = 'stairs_only';
    if (floorCount >= ACCESSIBILITY_STANDARDS.ELEVATORS.required_above_floors) {
      violations.push({
        code: 'ACC-ELEVATOR',
        severity: requireFullAccessibility ? 'error' : 'warning',
        element_type: 'building',
        message: `Building with ${floorCount} floors may require elevator for accessibility`,
        standard: 'Ghana Building Code / ADA Guidelines',
        required_value: 'Elevator or lift',
        remediation: 'Install passenger elevator with accessible dimensions',
      });
      recommendations.push('Consider adding elevator for multi-floor accessibility');
    }
  }

  // Generate recommendations
  if (doorsCompliant < doorsTotal) {
    recommendations.push(
      `Widen ${doorsTotal - doorsCompliant} doors to ${ACCESSIBILITY_STANDARDS.DOORS.min_width_accessible}m for wheelchair access`
    );
  }

  if (bathroomsAccessible === 0 && bathroomsTotal > 0) {
    recommendations.push(
      'Designate at least one accessible bathroom with grab bars and wheelchair clearance'
    );
  }

  if (!corridorsCompliant) {
    recommendations.push(
      `Widen corridors to minimum ${ACCESSIBILITY_STANDARDS.CORRIDORS.min_width_accessible}m for wheelchair passage`
    );
  }

  // Calculate accessibility score
  const doorScore = doorsTotal > 0 ? (doorsCompliant / doorsTotal) * 30 : 30;
  const corridorScore = corridorsCompliant ? 30 : 10;
  const bathroomScore = bathroomsTotal > 0 ? (bathroomsAccessible / bathroomsTotal) * 25 : 25;
  const verticalScore = verticalCirculation === 'single_floor' ? 15 :
    (violations.some(v => v.code === 'ACC-ELEVATOR') ? 5 : 15);

  const score = Math.round(doorScore + corridorScore + bathroomScore + verticalScore);

  // Determine accessibility level
  // When requireFullAccessibility is true, any error-level violations means not accessible
  const errorViolations = violations.filter(v => v.severity === 'error');
  let level: AccessibilityLevel;

  if (requireFullAccessibility && errorViolations.length > 0) {
    // Full accessibility required but violations exist - fail
    level = 'none';
  } else if (score >= 80 && errorViolations.length === 0) {
    level = 'full';
  } else if (score >= 50) {
    level = 'basic';
  } else {
    level = 'none';
  }

  return {
    accessible: level !== 'none',
    level,
    score,
    violations,
    summary: {
      doors_compliant: doorsCompliant,
      doors_total: doorsTotal,
      corridors_compliant: corridorsCompliant,
      bathrooms_accessible: bathroomsAccessible,
      bathrooms_total: bathroomsTotal,
      vertical_circulation: verticalCirculation,
      recommendations,
    },
  };
}

/**
 * Validate door accessibility
 */
function validateDoorAccessibility(
  door: OpeningGeometry,
  requireFull: boolean
): { compliant: boolean; violations: AccessibilityViolation[] } {
  const violations: AccessibilityViolation[] = [];
  const minWidth = requireFull
    ? ACCESSIBILITY_STANDARDS.DOORS.min_width_accessible
    : ACCESSIBILITY_STANDARDS.DOORS.min_width_standard;

  if (door.width_m < minWidth) {
    violations.push({
      code: 'ACC-DOOR-WIDTH',
      severity: requireFull ? 'error' : 'warning',
      element_id: door.opening_id,
      element_type: 'door',
      message: `Door width (${door.width_m.toFixed(2)}m) is below ${requireFull ? 'accessible' : 'standard'} minimum (${minWidth}m)`,
      standard: 'Ghana Building Code / ADA Guidelines',
      actual_value: door.width_m,
      required_value: minWidth,
      remediation: `Widen door to at least ${minWidth}m`,
    });
  }

  if (door.height_m < ACCESSIBILITY_STANDARDS.DOORS.min_height) {
    violations.push({
      code: 'ACC-DOOR-HEIGHT',
      severity: 'error',
      element_id: door.opening_id,
      element_type: 'door',
      message: `Door height (${door.height_m.toFixed(2)}m) is below minimum (${ACCESSIBILITY_STANDARDS.DOORS.min_height}m)`,
      standard: 'Ghana Building Code',
      actual_value: door.height_m,
      required_value: ACCESSIBILITY_STANDARDS.DOORS.min_height,
    });
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

/**
 * Validate corridor accessibility
 */
function validateCorridorAccessibility(
  corridor: RoomGeometry,
  requireFull: boolean
): { compliant: boolean; violations: AccessibilityViolation[] } {
  const violations: AccessibilityViolation[] = [];

  const bbox = corridor.bounding_box;
  const width = Math.min(
    Math.abs(bbox.max.x - bbox.min.x),
    Math.abs(bbox.max.y - bbox.min.y)
  );

  const minWidth = requireFull
    ? ACCESSIBILITY_STANDARDS.CORRIDORS.min_width_accessible
    : ACCESSIBILITY_STANDARDS.CORRIDORS.min_width_standard;

  if (width < minWidth) {
    violations.push({
      code: 'ACC-CORRIDOR-WIDTH',
      severity: requireFull ? 'error' : 'warning',
      element_id: corridor.room_id,
      element_type: 'corridor',
      message: `Corridor width (${width.toFixed(2)}m) is below ${requireFull ? 'accessible' : 'standard'} minimum (${minWidth}m)`,
      standard: 'Ghana Building Code / ADA Guidelines',
      actual_value: width,
      required_value: minWidth,
      remediation: `Widen corridor to at least ${minWidth}m for wheelchair passage`,
    });
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

/**
 * Validate bathroom accessibility
 */
function validateBathroomAccessibility(
  bathroom: RoomGeometry
): { accessible: boolean; violations: AccessibilityViolation[] } {
  const violations: AccessibilityViolation[] = [];

  // Calculate bathroom area
  const bbox = bathroom.bounding_box;
  const width = Math.abs(bbox.max.x - bbox.min.x);
  const depth = Math.abs(bbox.max.y - bbox.min.y);
  const area = width * depth;

  const minArea = ACCESSIBILITY_STANDARDS.ROOMS.min_bathroom_accessible;
  const turningRadius = ACCESSIBILITY_STANDARDS.ROOMS.wheelchair_turning_radius;

  if (area < minArea) {
    violations.push({
      code: 'ACC-BATHROOM-SIZE',
      severity: 'warning',
      element_id: bathroom.room_id,
      element_type: 'bathroom',
      message: `Bathroom area (${area.toFixed(1)} sqm) is below accessible minimum (${minArea} sqm)`,
      standard: 'ADA Guidelines for Accessible Bathrooms',
      actual_value: area,
      required_value: minArea,
      remediation: 'Enlarge bathroom to accommodate wheelchair turning and transfer space',
    });
  }

  // Check if there's enough space for wheelchair turning
  const minDimension = Math.min(width, depth);
  if (minDimension < turningRadius) {
    violations.push({
      code: 'ACC-BATHROOM-TURNING',
      severity: 'warning',
      element_id: bathroom.room_id,
      element_type: 'bathroom',
      message: `Bathroom dimension (${minDimension.toFixed(2)}m) doesn't allow wheelchair turning (${turningRadius}m required)`,
      standard: 'ADA Guidelines',
      actual_value: minDimension,
      required_value: turningRadius,
    });
  }

  return {
    accessible: violations.length === 0,
    violations,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a doorway is wheelchair accessible
 */
export function isWheelchairAccessibleDoor(door: OpeningGeometry): boolean {
  return door.width_m >= ACCESSIBILITY_STANDARDS.DOORS.min_width_accessible;
}

/**
 * Check if a corridor allows wheelchair passage
 */
export function isWheelchairAccessibleCorridor(width: number): boolean {
  return width >= ACCESSIBILITY_STANDARDS.CORRIDORS.min_width_accessible;
}

/**
 * Calculate ramp length needed for a given rise
 */
export function calculateRampLength(riseMeters: number, maxSlope?: number): number {
  const slope = maxSlope || ACCESSIBILITY_STANDARDS.RAMPS.max_slope;
  return riseMeters / slope;
}

/**
 * Check if stairs meet accessibility standards
 */
export function validateStairs(
  riserHeight: number,
  treadDepth: number,
  width: number,
  risersPerFlight: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (riserHeight > ACCESSIBILITY_STANDARDS.STAIRCASES.max_riser_height) {
    issues.push(`Riser height ${(riserHeight * 100).toFixed(0)}cm exceeds maximum ${(ACCESSIBILITY_STANDARDS.STAIRCASES.max_riser_height * 100).toFixed(0)}cm`);
  }

  if (treadDepth < ACCESSIBILITY_STANDARDS.STAIRCASES.min_tread_depth) {
    issues.push(`Tread depth ${(treadDepth * 100).toFixed(0)}cm is below minimum ${(ACCESSIBILITY_STANDARDS.STAIRCASES.min_tread_depth * 100).toFixed(0)}cm`);
  }

  if (width < ACCESSIBILITY_STANDARDS.STAIRCASES.min_width) {
    issues.push(`Stair width ${width.toFixed(2)}m is below minimum ${ACCESSIBILITY_STANDARDS.STAIRCASES.min_width}m`);
  }

  if (risersPerFlight > ACCESSIBILITY_STANDARDS.STAIRCASES.max_risers_per_flight) {
    issues.push(`${risersPerFlight} risers per flight exceeds maximum ${ACCESSIBILITY_STANDARDS.STAIRCASES.max_risers_per_flight}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Get accessibility requirements summary for building type
 */
export function getAccessibilityRequirements(
  buildingType: 'residential' | 'commercial' | 'public',
  floors: number
): {
  elevator_required: boolean;
  accessible_entrance_required: boolean;
  accessible_bathroom_required: boolean;
  accessible_parking_required: boolean;
} {
  const isPublic = buildingType === 'public' || buildingType === 'commercial';

  return {
    elevator_required: floors >= ACCESSIBILITY_STANDARDS.ELEVATORS.required_above_floors,
    accessible_entrance_required: isPublic,
    accessible_bathroom_required: isPublic,
    accessible_parking_required: isPublic,
  };
}

export default {
  ACCESSIBILITY_STANDARDS,
  validateAccessibility,
  isWheelchairAccessibleDoor,
  isWheelchairAccessibleCorridor,
  calculateRampLength,
  validateStairs,
  getAccessibilityRequirements,
};
