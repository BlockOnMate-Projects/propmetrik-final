/**
 * Floor Plan Geometry Types
 * 
 * TypeScript definitions for Blender geometry rendering and constrained adjustments.
 * Used by Phase 4 frontend components for geometry display and user interactions.
 * 
 * @module types/floorPlanGeometry
 * @version 1.0.0
 */

import type { RoomType as ValuationRoomType } from './valuation';

// Re-export RoomType for use in geometry components
export type RoomType = ValuationRoomType;

// ============================================================================
// GEOMETRY RESULT TYPES (FROM BLENDER)
// ============================================================================

export interface BlenderGeometryResult {
  version: string;
  geometry_hash: string;
  generated_at: string;
  
  measurements: GeometryMeasurements;
  walls: WallGeometry[];
  rooms: RoomGeometry[];
  floors: FloorGeometry[];
  openings: OpeningGeometry[];
  
  fabric_projection: FabricProjection;
  validation: GeometryValidation;
  
  processing_time_ms: number;
  blender_version: string;
}

export interface GeometryMeasurements {
  gfa_sqm: number; // Gross Floor Area
  nia_sqm: number; // Net Internal Area
  efficiency_ratio: number;
  wall_area_sqm: number;
  external_perimeter_m: number;
  rooms: RoomMeasurement[];
  floors: FloorMeasurement[];
  calculation_method: 'blender_mesh' | 'shoelace_2d';
}

export interface RoomMeasurement {
  room_id: string;
  room_name: string;
  room_type: RoomType;
  area_sqm: number;
  perimeter_m: number;
  width_m: number;
  length_m: number;
  height_m: number;
  volume_m3?: number;
  meets_minimum: boolean;
  minimum_required_sqm: number;
}

export interface FloorMeasurement {
  floor_number: number;
  floor_label: string;
  gfa_sqm: number;
  nia_sqm: number;
  room_count: number;
}

export interface WallGeometry {
  wall_id: string;
  wall_type: 'external' | 'internal' | 'partition';
  thickness_mm: number;
  start_point: Point3D;
  end_point: Point3D;
  height_m: number;
  is_structural: boolean;
  connected_rooms: string[];
}

export interface RoomGeometry {
  room_id: string;
  room_type: RoomType;
  room_name: string;
  floor_number: number;
  vertices: Point3D[];
  centroid: Point3D;
  bounding_box: BoundingBox3D;
  wall_ids: string[];
  opening_ids: string[];
}

export interface FloorGeometry {
  floor_number: number;
  floor_label: string;
  elevation_m: number;
  floor_to_floor_height_m: number;
  slab_thickness_mm: number;
  outline: Point3D[];
}

export interface OpeningGeometry {
  opening_id: string;
  opening_type: 'door' | 'window' | 'archway';
  wall_id: string;
  position: Point3D;
  width_m: number;
  height_m: number;
  sill_height_m?: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox3D {
  min: Point3D;
  max: Point3D;
}

// ============================================================================
// FABRIC.JS PROJECTION TYPES
// ============================================================================

export interface FabricProjection {
  canvas_width: number;
  canvas_height: number;
  scale_pixels_per_meter: number;
  origin: { x: number; y: number };
  floor_projections: FloorProjection[];
}

export interface FloorProjection {
  floor_number: number;
  objects: FabricGeometryObject[];
}

export interface FabricGeometryObject {
  type: 'polygon' | 'rect' | 'line' | 'text' | 'group';
  element_id: string;
  element_type: 'room' | 'wall' | 'opening' | 'dimension' | 'label';
  fabric_properties: Record<string, unknown>;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface GeometryValidation {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  code_compliance: CodeCompliance;
}

export interface ValidationError {
  code: string;
  message: string;
  element_id?: string;
  element_type?: string;
  severity: 'error';
}

export interface ValidationWarning {
  code: string;
  message: string;
  element_id?: string;
  element_type?: string;
  severity: 'warning';
  suggestion?: string;
}

export interface CodeCompliance {
  ghana_building_code: boolean;
  minimum_room_sizes: boolean;
  ventilation_requirements: boolean;
  egress_requirements: boolean;
  setback_compliance?: boolean;
  details: ComplianceDetail[];
}

export interface ComplianceDetail {
  code: string;
  requirement: string;
  status: 'pass' | 'fail' | 'not_applicable';
  actual_value?: number | string;
  required_value?: number | string;
}

// ============================================================================
// ADJUSTMENT CONSTRAINT TYPES
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

// ============================================================================
// USER ADJUSTMENT TYPES
// ============================================================================

export interface AdjustmentDelta {
  delta_id: string;
  element_id: string;
  element_type: 'wall' | 'room' | 'opening';
  operation: AdjustmentOperation;
  
  // Delta values (not absolute coordinates)
  delta_x?: number;
  delta_y?: number;
  delta_length?: number;
  delta_area?: number;
  new_type?: RoomType;
  
  // Original values for audit
  original_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  
  timestamp: string;
}

export interface UserAdjustmentDeltas {
  adjustment_id: string;
  valuation_id: string;
  base_geometry_version: string;
  adjustments: AdjustmentDelta[];
  timestamp: string;
  justification: string;
}

// ============================================================================
// COMPONENT PROPS TYPES
// ============================================================================

export interface BlenderGeometryRendererProps {
  geometry: BlenderGeometryResult;
  floorNumber?: number;
  readonly?: boolean;
  onElementSelect?: (elementId: string, elementType: string) => void;
  highlightedElements?: string[];
  showDimensions?: boolean;
  showLabels?: boolean;
  className?: string;
}

export interface ConstrainedFloorPlanBuilderProps {
  valuationId: string;
  blenderGeometry: BlenderGeometryResult | null;
  onAdjustmentSubmit: (adjustments: UserAdjustmentDeltas) => Promise<void>;
  readonly?: boolean;
  className?: string;
}

export interface AdjustmentModeProps {
  canvas: fabric.Canvas;
  selectedElement: string | null;
  constraint: AdjustmentConstraint | null;
  onAdjustment: (delta: AdjustmentDelta) => void;
  onCancel: () => void;
}

export interface ConstraintIndicatorProps {
  constraint: AdjustmentConstraint;
  elementPosition: { x: number; y: number };
  isActive: boolean;
}

// ============================================================================
// REAL-TIME UPDATE TYPES
// ============================================================================

export interface GeometryUpdateEvent {
  type: 'geometry:updated' | 'geometry:error' | 'geometry:progress';
  valuation_id: string;
  data: {
    version?: string;
    measurements?: GeometryMeasurements;
    fabric_projection?: FabricProjection;
    progress?: number;
    error?: string;
  };
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export interface GeometryAuditEntry {
  id: string;
  valuation_id: string;
  geometry_version_id: string;
  action: 'generated' | 'adjusted' | 'approved' | 'locked' | 'reverted';
  actor_id: string;
  actor_type: 'user' | 'system' | 'llm' | 'blender';
  actor_name?: string;
  adjustment_deltas?: AdjustmentDelta[];
  justification?: string;
  geometry_hash?: string;
  measurements?: GeometryMeasurements;
  timestamp: string;
  ip_address?: string;
}

export interface GeometryAuditReport {
  valuation_id: string;
  generated_at: string;
  entry_count: number;
  entries: GeometryAuditEntry[];
  summary: {
    total_adjustments: number;
    total_regenerations: number;
    approval_status: 'pending' | 'approved' | 'locked';
    last_modified_by: string;
    last_modified_at: string;
    gfa_change_sqm: number;
  };
}
