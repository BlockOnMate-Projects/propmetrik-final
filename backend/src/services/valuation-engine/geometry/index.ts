/**
 * Geometry Services Index
 *
 * Exports all geometry-related services for floor plan generation.
 * NOTE: BlenderGeometryService was removed - floor plans now use pure Fabric.js on frontend
 *
 * @module services/valuation-engine/geometry
 */

// Ghana Building Code
export {
  GHANA_BUILDING_CODE_LI_1630,
  validateAgainstBuildingCode,
  getMinimumRoomSize,
  getSetbackRequirements,
  requiresNaturalLight,
  requiresVentilation,
  type CodeViolation,
  type ValidationResult,
  type ViolationSeverity,
} from './ghanaBuildingCode';

// Room Size Validator
export {
  validateRoom,
  validateRoomProgram,
  suggestRoomSizes,
  getTypicalRoomProportions,
  type RoomValidationResult,
  type RoomProgramValidationResult,
} from './roomSizeValidator';

// Accessibility Validator
export {
  ACCESSIBILITY_STANDARDS,
  validateAccessibility,
  isWheelchairAccessibleDoor,
  isWheelchairAccessibleCorridor,
  calculateRampLength,
  validateStairs,
  getAccessibilityRequirements,
  type AccessibilityLevel,
  type AccessibilityViolation,
  type AccessibilityValidationResult,
} from './accessibilityValidator';

// Re-export types from floorPlanDesign for convenience
export type {
  LLMDesignIntent,
  BlenderGeometryResult,
  Point3D,
  WallGeometry,
  RoomGeometry,
  OpeningGeometry,
  GeometryMeasurements,
} from '../../../types/floorPlanDesign';
