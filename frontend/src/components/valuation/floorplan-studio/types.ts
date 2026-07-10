// ============================================================================
// Floor Plan Studio — data model
// All geometry is stored in METERS in world space. Rendering scales to px.
// ============================================================================

export interface Vec {
  x: number;
  y: number;
}

export type WallKind = 'exterior' | 'interior' | 'partition' | 'divider';

export interface Wall {
  id: string;
  a: Vec;
  b: Vec;
  /** wall thickness in meters */
  thickness: number;
  /** wall height in meters (defaults to floor height) */
  height: number;
  kind: WallKind;
  /** arc bulge = tan(sweep/4), 0 or undefined = straight (DXF convention) */
  bulge?: number;
  locked?: boolean;
}

export type DoorSub = 'single' | 'double' | 'sliding' | 'folding' | 'glass' | 'opening';
export type WindowSub = 'sliding' | 'casement' | 'fixed' | 'louver' | 'bay';

export interface Opening {
  id: string;
  wallId: string;
  kind: 'door' | 'window';
  sub: DoorSub | WindowSub;
  /** position along wall centerline, 0..1 */
  t: number;
  /** opening width in meters */
  width: number;
  /** opening height in meters */
  height: number;
  /** sill height (windows) in meters */
  sill: number;
  /** door swing side */
  flip: boolean;
  /** door swing direction */
  swing: 1 | -1;
}

export type StairKind = 'straight' | 'l' | 'u' | 'spiral';

export interface Stair {
  id: string;
  kind: StairKind;
  x: number;
  y: number;
  /** rotation degrees */
  rot: number;
  /** stair width in meters */
  width: number;
  /** run length in meters (straight leg) */
  length: number;
  locked?: boolean;
}

export type LayerId =
  | 'walls'
  | 'doors'
  | 'windows'
  | 'furniture'
  | 'text'
  | 'dimensions'
  | 'electrical'
  | 'plumbing';

export interface Furniture {
  id: string;
  /** id into the object library registry */
  def: string;
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  layer: LayerId;
  locked?: boolean;
  group?: string;
}

export const ROOM_TYPES = [
  'Living Room',
  'Bedroom',
  'Kitchen',
  'Dining Room',
  'Bathroom',
  'Toilet',
  'Office',
  'Store',
  'Laundry',
  'Utility Room',
  'Hallway',
  'Stair Hall',
  'Balcony',
  'Garage',
  'Veranda',
  'Other',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_COLORS: Record<RoomType, string> = {
  'Living Room': '#f59e0b',
  Bedroom: '#818cf8',
  Kitchen: '#fbbf24',
  'Dining Room': '#fb923c',
  Bathroom: '#34d399',
  Toilet: '#2dd4bf',
  Office: '#f87171',
  Store: '#9ca3af',
  Laundry: '#7dd3fc',
  'Utility Room': '#a3a3a3',
  Hallway: '#d4d4d8',
  'Stair Hall': '#c4b5fd',
  Balcony: '#86efac',
  Garage: '#94a3b8',
  Veranda: '#bef264',
  Other: '#e5e7eb',
};

/** a planned room entered as measurements — draggable block, later converted to walls */
export interface RoomBlock {
  id: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  /** width (m) */
  w: number;
  /** depth (m) */
  h: number;
}

/** a user-placed marker inside an enclosed face that names the room */
export interface RoomAnchor {
  id: string;
  x: number;
  y: number;
  type: RoomType;
  name?: string;
}

export interface Dimension {
  id: string;
  a: Vec;
  b: Vec;
  /** perpendicular offset of the dimension line, meters */
  offset: number;
}

export interface BgImage {
  /** data URL */
  src: string;
  x: number;
  y: number;
  /** meters per image pixel */
  scale: number;
  opacity: number;
  rotation: number;
}

export interface Floor {
  id: string;
  name: string;
  /** stacking order; 0 = ground, -1 = basement, 0.5 = mezzanine */
  level: number;
  /** floor-to-floor height, meters */
  height: number;
  walls: Wall[];
  openings: Opening[];
  stairs: Stair[];
  furniture: Furniture[];
  rooms: RoomAnchor[];
  dims: Dimension[];
  /** planned room blocks awaiting wall generation (Quick Plan mode) */
  blocks?: RoomBlock[];
  bg?: BgImage;
  /** read-only: plan frozen (e.g. after the valuation report is issued) */
  locked?: boolean;
}

/** immutable labeled snapshot of the whole plan (audit/version trail) */
export interface PlanVersion {
  id: string;
  label: string;
  createdAt: string;
  floors: Floor[];
  roof: Roof;
}

export type RoofKind = 'flat' | 'gable' | 'hip' | 'shed';

export interface Roof {
  kind: RoofKind;
  /** ridge height above top plate, meters */
  height: number;
  /** eaves overhang, meters */
  overhang: number;
}

export interface Project {
  id: string;
  name: string;
  floors: Floor[];
  roof: Roof;
  versions?: PlanVersion[];
  createdAt: string;
  updatedAt: string;
  /** app + schema version for forward migration */
  version: 1;
}

// ---------------------------------------------------------------------------
// Derived (computed, never persisted)
// ---------------------------------------------------------------------------

export interface DetectedRoom {
  key: string;
  poly: Vec[];
  /** exact finish-to-finish boundary (miter-offset), when computable */
  innerPoly?: Vec[];
  /** gross area at wall centerlines, m² */
  area: number;
  /** net internal area, m² — exact when netExact is true */
  netArea: number;
  /** true when netArea comes from the exact inner boundary (not approximation) */
  netExact: boolean;
  /** internal finish-to-finish perimeter, m */
  netPerimeter: number;
  perimeter: number;
  centroid: Vec;
  anchor?: RoomAnchor;
}

export interface FloorMetrics {
  floorId: string;
  rooms: DetectedRoom[];
  /** outer boundary polygon (wall centerlines) if enclosed */
  boundary: Vec[] | null;
  grossFloorArea: number;
  netFloorArea: number;
  footprint: number;
  perimeter: number;
  wallLength: number;
  wallArea: number;
  ceilingArea: number;
  windowArea: number;
  doorArea: number;
  windowCount: number;
  doorCount: number;
  roomCount: number;
}

export interface BuildingMetrics {
  floors: FloorMetrics[];
  totalGFA: number;
  totalNFA: number;
  footprint: number;
  buildingHeight: number;
  totalRooms: number;
}

export const DEFAULTS = {
  // divider = open-plan area boundary, not a physical wall
  wallThickness: { exterior: 0.23, interior: 0.15, partition: 0.1, divider: 0.01 } as Record<WallKind, number>,
  floorHeight: 3.0,
  doorWidth: { single: 0.9, double: 1.5, sliding: 1.8, folding: 1.4, glass: 1.0, opening: 1.2 } as Record<DoorSub, number>,
  doorHeight: 2.1,
  windowWidth: { sliding: 1.5, casement: 1.2, fixed: 1.0, louver: 0.8, bay: 2.4 } as Record<WindowSub, number>,
  windowHeight: 1.2,
  windowSill: 0.9,
  riserIdeal: 0.175,
  treadDepth: 0.28,
};

export const uid = (): string => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------------------
// Backend integration: PropMetrik valuation-engine room types (12-value enum)
// Types are pre-normalized here so persistence never relies on fuzzy matching.
// ---------------------------------------------------------------------------
export type BackendRoomType =
  | 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining' | 'storage'
  | 'corridor' | 'porch' | 'garage' | 'laundry' | 'office' | 'other';

export const BACKEND_ROOM_TYPE: Record<RoomType, BackendRoomType> = {
  'Living Room': 'living',
  Bedroom: 'bedroom',
  Kitchen: 'kitchen',
  'Dining Room': 'dining',
  Bathroom: 'bathroom',
  Toilet: 'bathroom',
  Office: 'office',
  Store: 'storage',
  Laundry: 'laundry',
  'Utility Room': 'storage',
  Hallway: 'corridor',
  'Stair Hall': 'corridor',
  Balcony: 'porch',
  Garage: 'garage',
  Veranda: 'porch',
  Other: 'other',
};
