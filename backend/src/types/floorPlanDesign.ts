/**
 * Floor Plan Design Types
 * 
 * Comprehensive type definitions for the floor plan enhancement system.
 * Includes LLM design intents, geometry results, and adjustment deltas.
 * 
 * @module types/floorPlanDesign
 * @version 1.0.0
 * @since 2026-01-14
 */

import { z } from 'zod';

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type PropertyType = 
  | 'single_family'
  | 'multi_family'
  | 'apartment'
  | 'townhouse'
  | 'compound'
  | 'commercial'
  | 'mixed_use'
  | 'industrial';

export type ConstructionType =
  | 'concrete_block'
  | 'sandcrete_block'
  | 'burnt_brick'
  | 'mud_brick'
  | 'timber_frame'
  | 'steel_frame'
  | 'reinforced_concrete'
  | 'prefabricated';

export type LayoutStyle = 
  | 'colonial'
  | 'modern'
  | 'compound'
  | 'apartment'
  | 'bungalow'
  | 'split_level';

export type CirculationType =
  | 'central_corridor'
  | 'side_corridor'
  | 'open_flow'
  | 'gallery'
  | 'courtyard';

export type Orientation = 'north' | 'south' | 'east' | 'west';

export type RoomImportance = 'primary' | 'secondary' | 'ancillary';

export type AssumptionCategory = 'dimension' | 'layout' | 'construction' | 'code';

export type DesignIntentStatus = 
  | 'generated'
  | 'validated'
  | 'applied'
  | 'rejected'
  | 'superseded';

export type GeometryVersionStatus =
  | 'draft'
  | 'validated'
  | 'approved'
  | 'locked'
  | 'superseded';

export type AuditAction =
  | 'create_floor_plan'
  | 'update_canvas'
  | 'generate_design_intent'
  | 'apply_design_intent'
  | 'regenerate_geometry'
  | 'adjust_room'
  | 'adjust_wall'
  | 'add_room'
  | 'delete_room'
  | 'lock_floor_plan'
  | 'unlock_floor_plan'
  | 'validate_geometry'
  | 'approve_geometry';

export type ActorType = 'user' | 'system' | 'llm' | 'blender';

export type ElementCategory = 
  | 'structural'
  | 'partition'
  | 'opening'
  | 'fixture';

export type AdjustmentType =
  | 'move'
  | 'resize'
  | 'rotate'
  | 'delete'
  | 'change_type';

// ============================================================================
// PROPERTY FEATURES (Input for LLM)
// ============================================================================

export interface PropertyFeatures {
  bedrooms: number;
  bathrooms: number;
  total_area_sqm: number;
  property_type: PropertyType;
  floors: number;
  year_built?: number;
  construction_type?: ConstructionType;
  lot_dimensions?: {
    width_m: number;
    depth_m: number;
  };
  setbacks?: {
    front_m: number;
    rear_m: number;
    side_m: number;
  };
  user_preferences?: UserLayoutPreferences;
}

export interface UserLayoutPreferences {
  preferred_style?: LayoutStyle;
  open_plan_kitchen?: boolean;
  master_ensuite?: boolean;
  separate_dining?: boolean;
  garage_spaces?: number;
  outdoor_living?: boolean;
  home_office?: boolean;
  additional_requirements?: string[];
}

// ============================================================================
// LAYOUT STRATEGY (LLM Output)
// ============================================================================

export interface LayoutStrategy {
  template_id: string;
  style: LayoutStyle;
  circulation_type: CirculationType;
  primary_orientation?: Orientation;
  entrance_position?: 'front_center' | 'front_left' | 'front_right' | 'side';
  kitchen_style?: 'galley' | 'l_shaped' | 'u_shaped' | 'island' | 'open';
  staircase_position?: 'central' | 'front' | 'rear' | 'side';
  courtyard?: boolean;
}

// ============================================================================
// ROOM PROGRAM (LLM Output)
// ============================================================================

export interface RoomProgram {
  room_id: string;
  room_type: RoomType;
  room_name?: string;
  target_area_sqm: number;
  min_area_sqm: number;
  max_area_sqm?: number;
  importance: RoomImportance;
  adjacency_requirements: string[]; // Room types that should be adjacent
  natural_light_required: boolean;
  ventilation_required: boolean;
  floor_number: number;
  special_requirements?: string[];
}

// Room types from existing floorPlanService
export type RoomType = 
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroom'
  | 'master_bedroom'
  | 'bathroom'
  | 'toilet'
  | 'corridor'
  | 'storage'
  | 'garage'
  | 'balcony'
  | 'terrace'
  | 'office'
  | 'laundry'
  | 'utility'
  | 'entrance'
  | 'staircase'
  | 'other';

// ============================================================================
// DESIGN ASSUMPTIONS (LLM Output)
// ============================================================================

export interface DesignAssumption {
  assumption_id: string;
  category: AssumptionCategory;
  assumption: string;
  default_value: string | number;
  unit?: string;
  confidence: number; // 0-1
  source: string;
  overridable: boolean;
  applied: boolean;
  user_override?: string | number;
}

// ============================================================================
// LAYOUT ALTERNATIVES (LLM Output)
// ============================================================================

export interface LayoutAlternative {
  alternative_id: string;
  name: string;
  description: string;
  layout_strategy: LayoutStrategy;
  room_program: RoomProgram[];
  tradeoffs: string[];
  suitability_score: number; // 0-100
}

// ============================================================================
// LLM DESIGN INTENT (Complete LLM Output)
// ============================================================================

export interface LLMDesignIntent {
  version: '1.0.0';
  timestamp: string;
  model_id: string;
  request_id: string;
  
  input_features: PropertyFeatures;
  layout_strategy: LayoutStrategy;
  room_program: RoomProgram[];
  assumptions: DesignAssumption[];
  alternatives?: LayoutAlternative[];
  
  // Metadata
  generation_time_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

// ============================================================================
// BLENDER GEOMETRY RESULT
// ============================================================================

export interface BlenderGeometryResult {
  version: string;
  geometry_hash: string;
  generated_at: string;
  
  // Authoritative measurements
  measurements: GeometryMeasurements;
  
  // Geometry data
  walls: WallGeometry[];
  rooms: RoomGeometry[];
  floors: FloorGeometry[];
  openings: OpeningGeometry[];
  
  // 2D projection for Fabric.js
  fabric_projection: FabricProjection;
  
  // Validation
  validation: GeometryValidation;
  
  // Processing info
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

export interface FabricProjection {
  canvas_width: number;
  canvas_height: number;
  scale_pixels_per_meter: number;
  origin: { x: number; y: number };
  floor_projections: FloorProjection[];
}

export interface FloorProjection {
  floor_number: number;
  objects: FabricObject[];
}

export interface FabricObject {
  type: 'polygon' | 'rect' | 'line' | 'text' | 'group';
  element_id: string;
  element_type: 'room' | 'wall' | 'opening' | 'dimension' | 'label';
  fabric_properties: Record<string, unknown>;
}

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
// USER ADJUSTMENT DELTAS
// ============================================================================

export interface UserAdjustmentDeltas {
  adjustment_id: string;
  valuation_id: string;
  floor_plan_id: string;
  geometry_version_id: string;
  
  timestamp: string;
  user_id: string;
  
  adjustments: AdjustmentDelta[];
  justification: string;
  
  // Validation
  local_validation_passed?: boolean;
  local_validation_errors?: string[];
}

export interface AdjustmentDelta {
  element_id: string;
  element_type: ElementCategory;
  adjustment_type: AdjustmentType;
  
  before: ElementState;
  after: ElementState;
  
  constraints_applied: ConstraintApplication[];
}

export interface ElementState {
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  rotation?: number;
  room_type?: RoomType;
  properties?: Record<string, unknown>;
}

export interface ConstraintApplication {
  constraint_id: string;
  constraint_type: string;
  was_enforced: boolean;
  original_value: number | string;
  constrained_value: number | string;
}

// ============================================================================
// ADJUSTMENT CONSTRAINTS
// ============================================================================

export interface AdjustmentConstraint {
  element_id: string;
  element_type: ElementCategory;
  allowed_adjustments: AdjustmentType[];
  
  position_limits?: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
  };
  
  size_limits?: {
    min_width: number;
    max_width: number;
    min_height: number;
    max_height: number;
    min_area: number;
    max_area: number;
  };
  
  requires_justification: boolean;
  validation_rules: ValidationRule[];
}

export interface ValidationRule {
  rule_id: string;
  rule_type: 'min_size' | 'max_size' | 'adjacency' | 'structural' | 'code';
  description: string;
  check: string; // Expression or function name
  error_message: string;
}

// ============================================================================
// GEOMETRY VERSION (Database Model)
// ============================================================================

export interface GeometryVersion {
  id: string;
  valuation_id: string;
  floor_plan_id?: string;
  version_number: number;
  geometry_hash: string;
  blender_output: BlenderGeometryResult;
  fabric_projection: FabricProjection;
  measurements: GeometryMeasurements;
  validation_result?: GeometryValidation;
  status: GeometryVersionStatus;
  created_by?: string;
  created_at: string;
  superseded_at?: string;
  superseded_by?: string;
}

// ============================================================================
// AUDIT LOG ENTRY (Database Model)
// ============================================================================

export interface AuditLogEntry {
  id: string;
  valuation_id: string;
  floor_plan_id?: string;
  geometry_version_id?: string;
  design_intent_id?: string;
  
  action: AuditAction;
  actor_id?: string;
  actor_type: ActorType;
  
  adjustment_deltas?: UserAdjustmentDeltas;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  
  justification?: string;
  validation_passed?: boolean;
  validation_errors?: ValidationError[];
  
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  processing_duration_ms?: number;
}

// ============================================================================
// DESIGN INTENT (Database Model)
// ============================================================================

export interface DesignIntentRecord {
  id: string;
  valuation_id: string;
  
  llm_model: string;
  llm_provider: string;
  llm_request_id?: string;
  llm_version: string;
  
  input_features: PropertyFeatures;
  layout_strategy: LayoutStrategy;
  room_program: RoomProgram[];
  assumptions: DesignAssumption[];
  alternatives?: LayoutAlternative[];
  
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  generation_time_ms?: number;
  
  status: DesignIntentStatus;
  created_at: string;
  created_by?: string;
  
  applied_at?: string;
  applied_geometry_version_id?: string;
  
  rejected_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  
  user_rating?: number;
  user_feedback?: string;
}

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

export const PropertyFeaturesSchema = z.object({
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20),
  total_area_sqm: z.number().positive().max(10000),
  property_type: z.enum([
    'single_family', 'multi_family', 'apartment', 'townhouse',
    'compound', 'commercial', 'mixed_use', 'industrial'
  ]),
  floors: z.number().int().min(1).max(10),
  year_built: z.number().int().min(1800).max(2100).optional(),
  construction_type: z.enum([
    'concrete_block', 'sandcrete_block', 'burnt_brick', 'mud_brick',
    'timber_frame', 'steel_frame', 'reinforced_concrete', 'prefabricated'
  ]).optional(),
  lot_dimensions: z.object({
    width_m: z.number().positive(),
    depth_m: z.number().positive(),
  }).optional(),
  setbacks: z.object({
    front_m: z.number().min(0),
    rear_m: z.number().min(0),
    side_m: z.number().min(0),
  }).optional(),
});

export const LayoutStrategySchema = z.object({
  template_id: z.string().min(1),
  style: z.enum(['colonial', 'modern', 'compound', 'apartment', 'bungalow', 'split_level']),
  circulation_type: z.enum(['central_corridor', 'side_corridor', 'open_flow', 'gallery', 'courtyard']),
  primary_orientation: z.enum(['north', 'south', 'east', 'west']).optional(),
  entrance_position: z.enum(['front_center', 'front_left', 'front_right', 'side']).optional(),
  kitchen_style: z.enum(['galley', 'l_shaped', 'u_shaped', 'island', 'open']).optional(),
});

export const RoomProgramSchema = z.object({
  room_id: z.string().uuid(),
  room_type: z.string(),
  room_name: z.string().optional(),
  target_area_sqm: z.number().positive(),
  min_area_sqm: z.number().positive(),
  max_area_sqm: z.number().positive().optional(),
  importance: z.enum(['primary', 'secondary', 'ancillary']),
  adjacency_requirements: z.array(z.string()),
  natural_light_required: z.boolean(),
  ventilation_required: z.boolean(),
  floor_number: z.number().int().min(0),
});

export const DesignAssumptionSchema = z.object({
  assumption_id: z.string().uuid(),
  category: z.enum(['dimension', 'layout', 'construction', 'code']),
  assumption: z.string().min(1),
  default_value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
  overridable: z.boolean(),
  applied: z.boolean(),
  user_override: z.union([z.string(), z.number()]).optional(),
});

export const LLMDesignIntentSchema = z.object({
  version: z.literal('1.0.0'),
  timestamp: z.string().datetime(),
  model_id: z.string().min(1),
  request_id: z.string().min(1),
  input_features: PropertyFeaturesSchema,
  layout_strategy: LayoutStrategySchema,
  room_program: z.array(RoomProgramSchema),
  assumptions: z.array(DesignAssumptionSchema),
  alternatives: z.array(z.any()).optional(),
});

export const AdjustmentDeltaSchema = z.object({
  element_id: z.string().uuid(),
  element_type: z.enum(['structural', 'partition', 'opening', 'fixture']),
  adjustment_type: z.enum(['move', 'resize', 'rotate', 'delete', 'change_type']),
  before: z.object({
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
    rotation: z.number().optional(),
    room_type: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
  }),
  after: z.object({
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
    rotation: z.number().optional(),
    room_type: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
  }),
  constraints_applied: z.array(z.object({
    constraint_id: z.string(),
    constraint_type: z.string(),
    was_enforced: z.boolean(),
    original_value: z.union([z.number(), z.string()]),
    constrained_value: z.union([z.number(), z.string()]),
  })),
});

export const UserAdjustmentDeltasSchema = z.object({
  adjustment_id: z.string().uuid(),
  valuation_id: z.string().uuid(),
  floor_plan_id: z.string().uuid(),
  geometry_version_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  user_id: z.string().uuid(),
  adjustments: z.array(AdjustmentDeltaSchema),
  justification: z.string().min(10, 'Justification must be at least 10 characters'),
});
