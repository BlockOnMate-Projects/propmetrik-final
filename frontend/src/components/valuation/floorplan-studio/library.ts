// ============================================================================
// Object Library — parametric 2D symbols + 3D box hints, drag & drop source
// ============================================================================
import type { LayerId } from './types';

export interface LibDef {
  id: string;
  name: string;
  category: 'Furniture' | 'Kitchen' | 'Bathroom' | 'Exterior' | 'Electrical' | 'Plumbing';
  /** default footprint, meters */
  w: number;
  h: number;
  /** 3D extrusion height, meters */
  z: number;
  /** elevation off the floor for 3D (e.g. wall cabinets) */
  elev?: number;
  color: string;
  layer: LayerId;
  /** simplified 2D glyph: 'rect' | 'circle' | 'bed' | 'sofa' | 'chair' | 'table' | 'tv' | 'sink' | 'stove' | 'fridge' | 'toilet' | 'basin' | 'shower' | 'tub' | 'tree' | 'car' | 'fence' | 'gate' | 'socket' | 'light' | 'pipe' */
  glyph: string;
}

export const LIBRARY: LibDef[] = [
  // Furniture
  { id: 'sofa-3', name: 'Sofa (3-seat)', category: 'Furniture', w: 2.1, h: 0.9, z: 0.8, color: '#8b5cf6', layer: 'furniture', glyph: 'sofa' },
  { id: 'sofa-2', name: 'Sofa (2-seat)', category: 'Furniture', w: 1.6, h: 0.9, z: 0.8, color: '#8b5cf6', layer: 'furniture', glyph: 'sofa' },
  { id: 'chair', name: 'Chair', category: 'Furniture', w: 0.5, h: 0.5, z: 0.9, color: '#a78bfa', layer: 'furniture', glyph: 'chair' },
  { id: 'armchair', name: 'Armchair', category: 'Furniture', w: 0.85, h: 0.85, z: 0.8, color: '#a78bfa', layer: 'furniture', glyph: 'sofa' },
  { id: 'dining-table', name: 'Dining table (6)', category: 'Furniture', w: 1.8, h: 1.0, z: 0.75, color: '#d97706', layer: 'furniture', glyph: 'table' },
  { id: 'coffee-table', name: 'Coffee table', category: 'Furniture', w: 1.1, h: 0.6, z: 0.45, color: '#d97706', layer: 'furniture', glyph: 'table' },
  { id: 'tv', name: 'TV + console', category: 'Furniture', w: 1.6, h: 0.45, z: 1.2, color: '#334155', layer: 'furniture', glyph: 'tv' },
  { id: 'cabinet', name: 'Cabinet', category: 'Furniture', w: 1.2, h: 0.5, z: 1.0, color: '#92400e', layer: 'furniture', glyph: 'rect' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Furniture', w: 1.8, h: 0.6, z: 2.2, color: '#92400e', layer: 'furniture', glyph: 'rect' },
  { id: 'bed-double', name: 'Bed (double)', category: 'Furniture', w: 1.6, h: 2.0, z: 0.55, color: '#6366f1', layer: 'furniture', glyph: 'bed' },
  { id: 'bed-king', name: 'Bed (king)', category: 'Furniture', w: 1.9, h: 2.1, z: 0.55, color: '#6366f1', layer: 'furniture', glyph: 'bed' },
  { id: 'bed-single', name: 'Bed (single)', category: 'Furniture', w: 1.0, h: 2.0, z: 0.55, color: '#6366f1', layer: 'furniture', glyph: 'bed' },
  { id: 'desk', name: 'Desk', category: 'Furniture', w: 1.4, h: 0.7, z: 0.75, color: '#0891b2', layer: 'furniture', glyph: 'table' },
  // Kitchen
  { id: 'k-sink', name: 'Kitchen sink', category: 'Kitchen', w: 0.9, h: 0.6, z: 0.9, color: '#0ea5e9', layer: 'plumbing', glyph: 'sink' },
  { id: 'stove', name: 'Stove / cooker', category: 'Kitchen', w: 0.6, h: 0.6, z: 0.9, color: '#ef4444', layer: 'furniture', glyph: 'stove' },
  { id: 'fridge', name: 'Refrigerator', category: 'Kitchen', w: 0.75, h: 0.75, z: 1.8, color: '#64748b', layer: 'electrical', glyph: 'fridge' },
  { id: 'k-cabinet', name: 'Base cabinet run', category: 'Kitchen', w: 2.4, h: 0.6, z: 0.9, color: '#78716c', layer: 'furniture', glyph: 'rect' },
  { id: 'k-island', name: 'Island', category: 'Kitchen', w: 1.8, h: 0.9, z: 0.9, color: '#78716c', layer: 'furniture', glyph: 'rect' },
  // Bathroom
  { id: 'toilet', name: 'Toilet (WC)', category: 'Bathroom', w: 0.4, h: 0.7, z: 0.75, color: '#e2e8f0', layer: 'plumbing', glyph: 'toilet' },
  { id: 'basin', name: 'Basin', category: 'Bathroom', w: 0.55, h: 0.45, z: 0.85, color: '#e2e8f0', layer: 'plumbing', glyph: 'basin' },
  { id: 'shower', name: 'Shower', category: 'Bathroom', w: 0.9, h: 0.9, z: 2.0, color: '#7dd3fc', layer: 'plumbing', glyph: 'shower' },
  { id: 'tub', name: 'Bathtub', category: 'Bathroom', w: 1.7, h: 0.75, z: 0.55, color: '#bae6fd', layer: 'plumbing', glyph: 'tub' },
  // Exterior
  { id: 'tree', name: 'Tree', category: 'Exterior', w: 2.0, h: 2.0, z: 4.0, color: '#16a34a', layer: 'furniture', glyph: 'tree' },
  { id: 'shrub', name: 'Shrub', category: 'Exterior', w: 0.8, h: 0.8, z: 0.9, color: '#22c55e', layer: 'furniture', glyph: 'tree' },
  { id: 'car', name: 'Vehicle', category: 'Exterior', w: 1.8, h: 4.5, z: 1.5, color: '#475569', layer: 'furniture', glyph: 'car' },
  { id: 'fence', name: 'Fence panel', category: 'Exterior', w: 2.4, h: 0.1, z: 1.8, color: '#57534e', layer: 'furniture', glyph: 'fence' },
  { id: 'gate', name: 'Gate', category: 'Exterior', w: 3.0, h: 0.12, z: 1.8, color: '#57534e', layer: 'furniture', glyph: 'gate' },
  // Electrical / Plumbing symbols
  { id: 'socket', name: 'Socket outlet', category: 'Electrical', w: 0.15, h: 0.15, z: 0.05, elev: 0.4, color: '#eab308', layer: 'electrical', glyph: 'socket' },
  { id: 'light', name: 'Ceiling light', category: 'Electrical', w: 0.3, h: 0.3, z: 0.05, elev: 2.7, color: '#facc15', layer: 'electrical', glyph: 'light' },
  { id: 'db', name: 'Distribution board', category: 'Electrical', w: 0.4, h: 0.15, z: 0.6, elev: 1.5, color: '#f59e0b', layer: 'electrical', glyph: 'rect' },
  { id: 'wh', name: 'Water heater', category: 'Plumbing', w: 0.5, h: 0.5, z: 0.9, elev: 1.8, color: '#38bdf8', layer: 'plumbing', glyph: 'circle' },
  { id: 'floor-drain', name: 'Floor drain', category: 'Plumbing', w: 0.15, h: 0.15, z: 0.02, color: '#0284c7', layer: 'plumbing', glyph: 'circle' },
];

export const libDef = (id: string): LibDef => LIBRARY.find((d) => d.id === id) ?? LIBRARY[0];

export const LIB_CATEGORIES = ['Furniture', 'Kitchen', 'Bathroom', 'Exterior', 'Electrical', 'Plumbing'] as const;
