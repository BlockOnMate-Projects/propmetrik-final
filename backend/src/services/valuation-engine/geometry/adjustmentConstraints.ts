/**
 * Adjustment Constraint Service
 *
 * Calculates per-element constraints for floor plan adjustments.
 * Ensures users can only make modifications within allowable limits
 * based on structural requirements, building codes, and adjacency rules.
 *
 * @module services/geometry/adjustmentConstraints
 * @version 1.0.0
 */

import type {
  BlenderGeometryResult,
  WallGeometry,
  RoomGeometry,
  GeometryMeasurements,
  RoomType,
} from '../../../types/floorPlanDesign';
import { GHANA_BUILDING_CODE_LI_1630 } from './ghanaBuildingCode';

// ============================================================================
// TYPES
// ============================================================================

export type AdjustmentOperation = 'move' | 'stretch' | 'resize' | 'delete' | 'change_type';

export interface AdjustmentConstraint {
  element_id: string;
  element_type: 'wall' | 'room' | 'opening';
  category: 'structural' | 'partition' | 'functional';

  allowed_operations: AdjustmentOperation[];

  limits: {
    move?: MoveLimits | null;
    stretch?: StretchLimits | null;
    resize?: ResizeLimits | null;
  };

  validation_rules: ConstraintValidationRule[];

  // Human-readable explanation
  explanation: string;
}

export interface MoveLimits {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

export interface StretchLimits {
  min_length: number;
  max_length: number;
}

export interface ResizeLimits {
  min_area_sqm: number;
  max_area_sqm: number;
  min_width_m: number;
  min_length_m: number;
}

export interface ConstraintValidationRule {
  rule: 'maintain_room_minimum' | 'maintain_adjacency' | 'maintain_structure' | 'maintain_code_compliance';
  params: Record<string, unknown>;
}

export interface AdjustmentDelta {
  delta_id: string;
  element_id: string;
  element_type: 'wall' | 'room' | 'opening';
  operation: AdjustmentOperation;

  delta_x?: number;
  delta_y?: number;
  delta_length?: number;
  delta_area?: number;
  new_type?: RoomType;

  original_value: Record<string, unknown>;
  new_value: Record<string, unknown>;

  timestamp: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  element_id: string;
  severity: 'error';
}

export interface ValidationWarning {
  code: string;
  message: string;
  element_id: string;
  severity: 'warning';
  suggestion?: string;
}

// ============================================================================
// ADJUSTMENT CONSTRAINT SERVICE
// ============================================================================

export class AdjustmentConstraintService {
  private geometry: BlenderGeometryResult;

  constructor(geometry: BlenderGeometryResult) {
    this.geometry = geometry;
  }

  /**
   * Calculate constraints for all adjustable elements
   */
  calculateConstraints(): AdjustmentConstraint[] {
    const constraints: AdjustmentConstraint[] = [];

    // Wall constraints
    for (const wall of this.geometry.walls) {
      constraints.push(this.calculateWallConstraints(wall));
    }

    // Room constraints
    for (const room of this.geometry.rooms) {
      constraints.push(this.calculateRoomConstraints(room));
    }

    // Opening constraints
    for (const opening of this.geometry.openings) {
      constraints.push(this.calculateOpeningConstraints(opening));
    }

    return constraints;
  }

  /**
   * Calculate constraints for a specific wall
   */
  private calculateWallConstraints(wall: WallGeometry): AdjustmentConstraint {
    const isExternal = wall.wall_type === 'external';
    const isStructural = wall.is_structural;
    const wallLength = this.calculateWallLength(wall);

    // External walls: only stretch allowed (±10%)
    // Internal structural walls: limited move + stretch
    // Partition walls: full move + delete allowed

    let allowedOperations: AdjustmentOperation[];
    let category: 'structural' | 'partition' | 'functional';
    let moveLimits: MoveLimits | null = null;
    let stretchLimits: StretchLimits | null = null;

    if (isExternal) {
      category = 'structural';
      allowedOperations = ['stretch'];
      stretchLimits = {
        min_length: wallLength * 0.9, // Max 10% reduction
        max_length: wallLength * 1.1, // Max 10% extension
      };
    } else if (isStructural) {
      category = 'structural';
      allowedOperations = ['move', 'stretch'];
      moveLimits = {
        min_x: wall.start_point.x - 1.0, // Max 1m movement
        max_x: wall.start_point.x + 1.0,
        min_y: wall.start_point.y - 1.0,
        max_y: wall.start_point.y + 1.0,
      };
      stretchLimits = {
        min_length: wallLength * 0.85,
        max_length: wallLength * 1.15,
      };
    } else {
      category = 'partition';
      allowedOperations = ['move', 'stretch', 'delete'];
      moveLimits = {
        min_x: wall.start_point.x - 2.0, // Max 2m movement
        max_x: wall.start_point.x + 2.0,
        min_y: wall.start_point.y - 2.0,
        max_y: wall.start_point.y + 2.0,
      };
      stretchLimits = {
        min_length: Math.max(wallLength * 0.5, 0.5), // Min 50% or 0.5m
        max_length: wallLength * 2.0, // Max double length
      };
    }

    return {
      element_id: wall.wall_id,
      element_type: 'wall',
      category,
      allowed_operations: allowedOperations,
      limits: {
        move: moveLimits,
        stretch: stretchLimits,
        resize: null,
      },
      validation_rules: [
        {
          rule: 'maintain_room_minimum',
          params: { affected_rooms: this.getAdjacentRooms(wall) },
        },
        {
          rule: 'maintain_adjacency',
          params: { required_adjacencies: this.getRequiredAdjacencies(wall) },
        },
      ],
      explanation: isExternal
        ? 'External wall - can only stretch ±10%'
        : isStructural
          ? 'Structural wall - limited movement (±1m) and stretch (±15%)'
          : 'Partition wall - can move (±2m), stretch, or delete',
    };
  }

  /**
   * Calculate constraints for a specific room
   */
  private calculateRoomConstraints(room: RoomGeometry): AdjustmentConstraint {
    const roomMeasurement = this.geometry.measurements.rooms.find(
      (m) => m.room_id === room.room_id
    );

    const minAreaSqm = roomMeasurement?.minimum_required_sqm ||
      this.getMinimumRoomSize(room.room_type);
    const currentArea = roomMeasurement?.area_sqm || 0;

    // Calculate allowed resize range
    const minResizeArea = minAreaSqm;
    const maxResizeArea = currentArea * 1.5; // Max 50% increase

    // Calculate minimum dimensions
    const minWidth = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.room_width;
    const minLength = minWidth; // Minimum square room

    return {
      element_id: room.room_id,
      element_type: 'room',
      category: 'functional',
      allowed_operations: ['resize', 'change_type'],
      limits: {
        move: null,
        stretch: null,
        resize: {
          min_area_sqm: minResizeArea,
          max_area_sqm: maxResizeArea,
          min_width_m: minWidth,
          min_length_m: minLength,
        },
      },
      validation_rules: [
        {
          rule: 'maintain_room_minimum',
          params: { room_type: room.room_type, minimum_sqm: minAreaSqm },
        },
        {
          rule: 'maintain_code_compliance',
          params: { code: 'LI_1630' },
        },
      ],
      explanation: `${room.room_type} - minimum ${minAreaSqm} m², resize up to ${maxResizeArea.toFixed(1)} m²`,
    };
  }

  /**
   * Calculate constraints for a specific opening
   */
  private calculateOpeningConstraints(opening: any): AdjustmentConstraint {
    const minDoorWidth = GHANA_BUILDING_CODE_LI_1630.DIMENSION_MINIMUMS.door_width_internal;
    const minWindowWidth = 0.6; // 60cm minimum window

    const minWidth = opening.opening_type === 'door' ? minDoorWidth : minWindowWidth;
    const maxWidth = opening.width_m * 1.5; // Max 50% wider

    return {
      element_id: opening.opening_id,
      element_type: 'opening',
      category: 'functional',
      allowed_operations: ['move', 'resize'],
      limits: {
        move: {
          min_x: opening.position.x - 1.0,
          max_x: opening.position.x + 1.0,
          min_y: opening.position.y - 0.5,
          max_y: opening.position.y + 0.5,
        },
        stretch: {
          min_length: minWidth,
          max_length: maxWidth,
        },
        resize: null,
      },
      validation_rules: [
        {
          rule: 'maintain_code_compliance',
          params: {
            opening_type: opening.opening_type,
            min_width: minWidth,
          },
        },
      ],
      explanation: `${opening.opening_type} - min width ${minWidth}m, can move ±1m along wall`,
    };
  }

  /**
   * Validate proposed adjustments against constraints
   */
  validateAdjustments(deltas: AdjustmentDelta[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const constraints = this.calculateConstraints();

    for (const delta of deltas) {
      const constraint = constraints.find((c) => c.element_id === delta.element_id);

      if (!constraint) {
        errors.push({
          code: 'ELEMENT_NOT_FOUND',
          message: `Element ${delta.element_id} not found in geometry`,
          element_id: delta.element_id,
          severity: 'error',
        });
        continue;
      }

      // Check if operation is allowed
      if (!constraint.allowed_operations.includes(delta.operation)) {
        errors.push({
          code: 'OPERATION_NOT_ALLOWED',
          message: `Operation '${delta.operation}' is not allowed for this ${constraint.element_type}. ${constraint.explanation}`,
          element_id: delta.element_id,
          severity: 'error',
        });
        continue;
      }

      // Check move limits
      if (delta.operation === 'move' && constraint.limits.move) {
        const limits = constraint.limits.move;
        const newX = (delta.original_value.x as number) + (delta.delta_x || 0);
        const newY = (delta.original_value.y as number) + (delta.delta_y || 0);

        if (newX < limits.min_x || newX > limits.max_x) {
          errors.push({
            code: 'MOVE_LIMIT_EXCEEDED_X',
            message: `X movement exceeds allowed range [${limits.min_x.toFixed(2)}, ${limits.max_x.toFixed(2)}]`,
            element_id: delta.element_id,
            severity: 'error',
          });
        }

        if (newY < limits.min_y || newY > limits.max_y) {
          errors.push({
            code: 'MOVE_LIMIT_EXCEEDED_Y',
            message: `Y movement exceeds allowed range [${limits.min_y.toFixed(2)}, ${limits.max_y.toFixed(2)}]`,
            element_id: delta.element_id,
            severity: 'error',
          });
        }
      }

      // Check resize limits
      if (delta.operation === 'resize' && constraint.limits.resize) {
        const limits = constraint.limits.resize;
        const newArea = (delta.original_value.area as number) + (delta.delta_area || 0);

        if (newArea < limits.min_area_sqm) {
          errors.push({
            code: 'ROOM_BELOW_MINIMUM',
            message: `Room size ${newArea.toFixed(1)} m² is below minimum ${limits.min_area_sqm} m² required by building code`,
            element_id: delta.element_id,
            severity: 'error',
          });
        }

        if (newArea > limits.max_area_sqm) {
          warnings.push({
            code: 'ROOM_ABOVE_MAXIMUM',
            message: `Room size ${newArea.toFixed(1)} m² exceeds recommended maximum ${limits.max_area_sqm.toFixed(1)} m²`,
            element_id: delta.element_id,
            severity: 'warning',
            suggestion: 'Consider splitting into multiple rooms',
          });
        }
      }

      // Check stretch limits
      if (delta.operation === 'stretch' && constraint.limits.stretch) {
        const limits = constraint.limits.stretch;
        const newLength = (delta.original_value.length as number) + (delta.delta_length || 0);

        if (newLength < limits.min_length) {
          errors.push({
            code: 'STRETCH_BELOW_MINIMUM',
            message: `New length ${newLength.toFixed(2)}m is below minimum ${limits.min_length.toFixed(2)}m`,
            element_id: delta.element_id,
            severity: 'error',
          });
        }

        if (newLength > limits.max_length) {
          errors.push({
            code: 'STRETCH_ABOVE_MAXIMUM',
            message: `New length ${newLength.toFixed(2)}m exceeds maximum ${limits.max_length.toFixed(2)}m`,
            element_id: delta.element_id,
            severity: 'error',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateWallLength(wall: WallGeometry): number {
    const dx = wall.end_point.x - wall.start_point.x;
    const dy = wall.end_point.y - wall.start_point.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getAdjacentRooms(wall: WallGeometry): string[] {
    return wall.connected_rooms || [];
  }

  private getRequiredAdjacencies(wall: WallGeometry): string[] {
    // Determine which room adjacencies must be maintained
    // e.g., kitchen should remain adjacent to dining
    const adjacencies: string[] = [];

    for (const roomId of wall.connected_rooms || []) {
      const room = this.geometry.rooms.find((r) => r.room_id === roomId);
      if (room?.room_type === 'kitchen') {
        // Kitchen should be adjacent to dining
        const diningRoom = this.geometry.rooms.find((r) => r.room_type === 'dining');
        if (diningRoom) adjacencies.push(diningRoom.room_id);
      }
      if (room?.room_type === 'bathroom') {
        // Bathroom should be near bedrooms
        const bedrooms = this.geometry.rooms.filter(
          (r) => r.room_type === 'bedroom' || r.room_type === 'master_bedroom'
        );
        adjacencies.push(...bedrooms.map((b) => b.room_id));
      }
    }

    return [...new Set(adjacencies)];
  }

  private getMinimumRoomSize(roomType: RoomType): number {
    const minimums: Record<RoomType, number> = {
      living: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.living,
      dining: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.dining,
      kitchen: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.kitchen,
      bedroom: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.bedroom,
      master_bedroom: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.master_bedroom,
      bathroom: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.bathroom,
      toilet: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.toilet,
      corridor: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.corridor,
      storage: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.storage,
      entrance: GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS.entrance,
      garage: 15,
      balcony: 3,
      terrace: 5,
      office: 6,
      laundry: 3,
      utility: 2,
      staircase: 4,
      other: 2,
    };

    return minimums[roomType] || 2;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createAdjustmentConstraintService(
  geometry: BlenderGeometryResult
): AdjustmentConstraintService {
  return new AdjustmentConstraintService(geometry);
}

export default AdjustmentConstraintService;
