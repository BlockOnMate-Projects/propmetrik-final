/**
 * Room Size Validator
 * 
 * Validates room sizes and dimensions against Ghana Building Code LI 1630.
 * Provides detailed validation for individual rooms and room programs.
 * 
 * @module services/geometry/roomSizeValidator
 * @version 1.0.0
 * @since 2026-01-14
 */

import type { RoomType, RoomProgram, RoomGeometry } from '../../../types/floorPlanDesign';
import { GHANA_BUILDING_CODE_LI_1630, getMinimumRoomSize } from './ghanaBuildingCode';

// ============================================================================
// TYPES
// ============================================================================

export interface RoomValidationResult {
  room_id: string;
  room_type: RoomType;
  room_name?: string;
  valid: boolean;
  area_sqm: number;
  min_area_sqm: number;
  area_deficit_sqm: number;
  width_m: number;
  min_width_m: number;
  width_valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface RoomProgramValidationResult {
  valid: boolean;
  total_area_sqm: number;
  min_total_area_sqm: number;
  room_results: RoomValidationResult[];
  summary: {
    rooms_valid: number;
    rooms_invalid: number;
    total_area_deficit_sqm: number;
    critical_failures: string[];
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a single room against building code requirements
 */
export function validateRoom(
  room: RoomGeometry | RoomProgram,
  isProgram: boolean = false
): RoomValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Extract room properties based on type
  const roomId = isProgram
    ? (room as RoomProgram).room_id
    : (room as RoomGeometry).room_id;
  const roomType = isProgram
    ? (room as RoomProgram).room_type
    : (room as RoomGeometry).room_type;
  const roomName = isProgram
    ? (room as RoomProgram).room_name
    : (room as RoomGeometry).room_name;

  // Get area
  let areaSqm: number;
  let widthM: number;

  if (isProgram) {
    const program = room as RoomProgram;
    areaSqm = program.target_area_sqm;
    // Estimate width from area (assume square-ish room)
    widthM = Math.sqrt(areaSqm);
  } else {
    const geometry = room as RoomGeometry;
    const bbox = geometry.bounding_box;
    const width = Math.abs(bbox.max.x - bbox.min.x);
    const depth = Math.abs(bbox.max.y - bbox.min.y);
    widthM = Math.min(width, depth);

    // Calculate area from vertices if available
    if (geometry.vertices && geometry.vertices.length >= 3) {
      areaSqm = calculatePolygonArea(geometry.vertices.map(v => ({ x: v.x, y: v.y })));
    } else {
      areaSqm = width * depth;
    }
  }

  // Get minimum requirements
  const minAreaSqm = getMinimumRoomSize(roomType);
  const minWidthM = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.room_width;

  // Validate area
  const areaDeficit = Math.max(0, minAreaSqm - areaSqm);
  if (areaSqm < minAreaSqm) {
    errors.push(
      `${roomName || roomType} area (${areaSqm.toFixed(1)} sqm) is below minimum (${minAreaSqm} sqm)`
    );
    suggestions.push(
      `Increase room area by ${areaDeficit.toFixed(1)} sqm to meet Ghana Building Code LI 1630`
    );
  } else if (areaSqm < minAreaSqm * 1.1) {
    warnings.push(
      `${roomName || roomType} area (${areaSqm.toFixed(1)} sqm) is close to minimum (${minAreaSqm} sqm)`
    );
    suggestions.push(
      `Consider adding ${(minAreaSqm * 1.1 - areaSqm).toFixed(1)} sqm for comfort margin`
    );
  }

  // Validate width (only for actual geometry, not program)
  const widthValid = widthM >= minWidthM;
  if (!widthValid && !isProgram) {
    errors.push(
      `${roomName || roomType} width (${widthM.toFixed(2)}m) is below minimum (${minWidthM}m)`
    );
    suggestions.push(
      `Adjust room proportions to ensure minimum width of ${minWidthM}m`
    );
  }

  // Room-specific validations
  validateRoomSpecificRequirements(roomType, areaSqm, widthM, warnings, suggestions);

  return {
    room_id: roomId,
    room_type: roomType,
    room_name: roomName,
    valid: errors.length === 0,
    area_sqm: areaSqm,
    min_area_sqm: minAreaSqm,
    area_deficit_sqm: areaDeficit,
    width_m: widthM,
    min_width_m: minWidthM,
    width_valid: widthValid,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validate a complete room program
 */
export function validateRoomProgram(
  rooms: RoomProgram[],
  totalAvailableArea: number
): RoomProgramValidationResult {
  const results: RoomValidationResult[] = [];
  let totalMinArea = 0;
  let totalTargetArea = 0;
  const criticalFailures: string[] = [];

  // Validate each room
  for (const room of rooms) {
    const result = validateRoom(room, true);
    results.push(result);
    totalMinArea += result.min_area_sqm;
    totalTargetArea += result.area_sqm;

    if (!result.valid && room.importance === 'primary') {
      criticalFailures.push(result.errors[0] || `${room.room_type} failed validation`);
    }
  }

  // Check total area feasibility
  const roomsValid = results.filter(r => r.valid).length;
  const roomsInvalid = results.filter(r => !r.valid).length;
  const totalAreaDeficit = results.reduce((sum, r) => sum + r.area_deficit_sqm, 0);

  // Check if program fits in available area
  if (totalTargetArea > totalAvailableArea * 1.1) {
    criticalFailures.push(
      `Room program total (${totalTargetArea.toFixed(0)} sqm) exceeds available area (${totalAvailableArea.toFixed(0)} sqm)`
    );
  }

  // Account for circulation (typically 15-20% of area)
  const estimatedCirculation = totalAvailableArea * 0.15;
  const usableArea = totalAvailableArea - estimatedCirculation;

  if (totalMinArea > usableArea) {
    criticalFailures.push(
      `Minimum room requirements (${totalMinArea.toFixed(0)} sqm) exceed usable area after circulation (${usableArea.toFixed(0)} sqm)`
    );
  }

  return {
    valid: criticalFailures.length === 0 && roomsInvalid === 0,
    total_area_sqm: totalTargetArea,
    min_total_area_sqm: totalMinArea,
    room_results: results,
    summary: {
      rooms_valid: roomsValid,
      rooms_invalid: roomsInvalid,
      total_area_deficit_sqm: totalAreaDeficit,
      critical_failures: criticalFailures,
    },
  };
}

/**
 * Suggest optimal room sizes based on total available area
 */
export function suggestRoomSizes(
  roomTypes: RoomType[],
  totalAreaSqm: number,
  priorities: Partial<Record<RoomType, 'generous' | 'standard' | 'compact'>> = {}
): Map<RoomType, number> {
  const suggestions = new Map<RoomType, number>();

  // Calculate minimum total
  let minTotal = 0;
  for (const roomType of roomTypes) {
    minTotal += getMinimumRoomSize(roomType);
  }

  // Account for circulation (15%)
  const usableArea = totalAreaSqm * 0.85;

  if (usableArea < minTotal) {
    // Can't fit all rooms at minimum, return minimums
    for (const roomType of roomTypes) {
      suggestions.set(roomType, getMinimumRoomSize(roomType));
    }
    return suggestions;
  }

  // Distribute extra space based on priorities
  const extraSpace = usableArea - minTotal;
  const primaryRooms = roomTypes.filter(r =>
    ['living', 'master_bedroom', 'kitchen'].includes(r)
  );
  const secondaryRooms = roomTypes.filter(r =>
    ['bedroom', 'dining', 'bathroom'].includes(r)
  );
  const ancillaryRooms = roomTypes.filter(r =>
    !primaryRooms.includes(r) && !secondaryRooms.includes(r)
  );

  // Allocation weights
  const weights = {
    primary: 0.5,
    secondary: 0.35,
    ancillary: 0.15,
  };

  // Distribute extra space
  const primaryExtra = (extraSpace * weights.primary) / (primaryRooms.length || 1);
  const secondaryExtra = (extraSpace * weights.secondary) / (secondaryRooms.length || 1);
  const ancillaryExtra = (extraSpace * weights.ancillary) / (ancillaryRooms.length || 1);

  for (const roomType of roomTypes) {
    const minSize = getMinimumRoomSize(roomType);
    const priority = priorities[roomType] || 'standard';

    let baseExtra: number;
    if (primaryRooms.includes(roomType)) {
      baseExtra = primaryExtra;
    } else if (secondaryRooms.includes(roomType)) {
      baseExtra = secondaryExtra;
    } else {
      baseExtra = ancillaryExtra;
    }

    // Adjust for priority
    const priorityMultiplier = priority === 'generous' ? 1.3 : priority === 'compact' ? 0.7 : 1.0;
    const suggestedSize = minSize + (baseExtra * priorityMultiplier);

    suggestions.set(roomType, Math.round(suggestedSize * 10) / 10);
  }

  return suggestions;
}

/**
 * Calculate typical room proportions
 */
export function getTypicalRoomProportions(
  roomType: RoomType
): { aspectRatio: number; description: string } {
  const proportions: Record<RoomType, { aspectRatio: number; description: string }> = {
    living: { aspectRatio: 1.5, description: '3:2 ratio, wider than deep' },
    dining: { aspectRatio: 1.2, description: '6:5 ratio, nearly square' },
    kitchen: { aspectRatio: 1.8, description: 'Galley: 2:1, L-shape: 1.5:1' },
    bedroom: { aspectRatio: 1.3, description: '4:3 ratio, rectangular' },
    master_bedroom: { aspectRatio: 1.4, description: '3:2 ratio with ensuite space' },
    bathroom: { aspectRatio: 1.5, description: '3:2 ratio, allows fixture layout' },
    toilet: { aspectRatio: 0.7, description: '2:3 ratio, narrow and deep' },
    corridor: { aspectRatio: 5.0, description: 'Long and narrow, 1m+ width' },
    storage: { aspectRatio: 1.5, description: 'Variable, shelving access' },
    garage: { aspectRatio: 2.0, description: '2:1 ratio for vehicle access' },
    balcony: { aspectRatio: 3.0, description: 'Long and narrow for views' },
    terrace: { aspectRatio: 1.2, description: 'Nearly square for flexibility' },
    office: { aspectRatio: 1.3, description: '4:3 ratio for desk layout' },
    laundry: { aspectRatio: 1.0, description: 'Square for appliances' },
    utility: { aspectRatio: 1.2, description: 'Flexible layout' },
    entrance: { aspectRatio: 1.0, description: 'Square for circulation' },
    staircase: { aspectRatio: 2.5, description: 'Based on stair run requirements' },
    other: { aspectRatio: 1.0, description: 'Default square' },
  };

  return proportions[roomType] || proportions.other;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Add room-specific validation requirements
 */
function validateRoomSpecificRequirements(
  roomType: RoomType,
  areaSqm: number,
  widthM: number,
  warnings: string[],
  suggestions: string[]
): void {
  switch (roomType) {
    case 'kitchen':
      if (widthM < 1.8) {
        warnings.push('Kitchen width is below recommended 1.8m for work triangle');
        suggestions.push('Consider widening kitchen for better workflow');
      }
      break;

    case 'bathroom':
      if (areaSqm < 4.0) {
        warnings.push('Bathroom may be too compact for standard fixtures');
        suggestions.push('Allow 4+ sqm for toilet, sink, and shower/tub');
      }
      break;

    case 'master_bedroom':
      if (areaSqm < 14.0) {
        warnings.push('Master bedroom may be too small for ensuite bathroom');
        suggestions.push('Consider 14+ sqm to accommodate ensuite (11 sqm bedroom + 3 sqm ensuite)');
      }
      break;

    case 'garage':
      if (widthM < 3.0) {
        warnings.push('Garage width may be too narrow for standard vehicles');
        suggestions.push('Minimum 3.0m width for single car, 5.5m for double');
      }
      break;

    case 'corridor':
      if (widthM < 1.2) {
        warnings.push('Corridor width is below recommended 1.2m for comfortable circulation');
      }
      break;
  }
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

export default {
  validateRoom,
  validateRoomProgram,
  suggestRoomSizes,
  getTypicalRoomProportions,
};
