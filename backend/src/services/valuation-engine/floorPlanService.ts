/**
 * Floor Plan Service
 * Backend service for Fabric.js floor plan persistence and measurement extraction
 * 
 * Features:
 * - CRUD operations for floor plans
 * - Measurement extraction from Fabric.js canvas
 * - Room breakdown analysis
 * - Ghana Building Code validation
 * - Multi-floor support
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface FloorPlanCanvas {
  version: string;
  objects: FabricObject[];
  background?: string;
}

export interface FabricObject {
  type: string;
  left: number;
  top: number;
  width?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
  fill?: string;
  stroke?: string;
  name?: string;
  roomType?: string;
  [key: string]: any;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  area_sqm: number;
  perimeter_m: number;
  vertices: Array<{ x: number; y: number }>;
  length_m?: number;
  width_m?: number;
  meets_minimum_size: boolean;
  minimum_size_sqm: number;
  validation_notes?: string;
  fill_color: string;
}

export type RoomType = 
  | 'bedroom' 
  | 'bathroom' 
  | 'kitchen' 
  | 'living' 
  | 'dining' 
  | 'storage' 
  | 'corridor' 
  | 'porch' 
  | 'garage' 
  | 'laundry' 
  | 'office'
  | 'other';

export interface FloorPlan {
  id: string;
  valuation_id: string;
  property_id?: string;
  canvas_json: FloorPlanCanvas;
  canvas_version: string;
  scale_pixels_per_meter: number;
  calibration_reference?: string;
  gross_building_area_sqm?: number;
  net_usable_area_sqm?: number;
  site_boundary_sqm?: number;
  site_coverage_ratio?: number;
  efficiency_ratio?: number;
  rooms: Room[];
  floor_number: number;
  floor_label: string;
  is_locked: boolean;
  locked_at?: Date;
  locked_by?: string;
  has_scale_reference: boolean;
  measurement_confidence: MeasurementConfidence;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export type MeasurementConfidence = 'verified' | 'measured' | 'estimated' | 'rough';

export interface CreateFloorPlanInput {
  valuation_id: string;
  property_id?: string;
  canvas_json: FloorPlanCanvas;
  scale_pixels_per_meter?: number;
  calibration_reference?: string;
  floor_number?: number;
  floor_label?: string;
  has_scale_reference?: boolean;
  measurement_confidence?: MeasurementConfidence;
  created_by?: string;
}

export interface UpdateFloorPlanInput {
  canvas_json?: FloorPlanCanvas;
  scale_pixels_per_meter?: number;
  calibration_reference?: string;
  floor_label?: string;
  has_scale_reference?: boolean;
  measurement_confidence?: MeasurementConfidence;
}

export interface GhanaBuildingStandard {
  room_type: RoomType;
  property_type: string;
  minimum_area_sqm: number;
  recommended_area_sqm: number;
  minimum_width_m: number;
  minimum_height_m: number;
  notes?: string;
}

export interface FloorPlanSummary {
  total_floors: number;
  total_gross_area_sqm: number;
  total_net_area_sqm: number;
  room_counts: Record<RoomType, number>;
  validation_issues: ValidationIssue[];
  efficiency_ratio: number;
}

export interface ValidationIssue {
  room_id: string;
  room_name: string;
  room_type: RoomType;
  issue_type: 'below_minimum' | 'below_recommended' | 'missing_requirement';
  message: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// FLOOR PLAN SERVICE
// ============================================================================

class FloorPlanService {
  
  // --------------------------------------------------------------------------
  // CRUD OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Create a new floor plan (or update if exists for same valuation_id + floor_number)
   */
  async create(input: CreateFloorPlanInput): Promise<FloorPlan> {
    const id = uuidv4();
    const rooms = this.extractRoomsFromCanvas(input.canvas_json, input.scale_pixels_per_meter || 20);
    const measurements = this.calculateMeasurements(rooms);
    
    // Use UPSERT to handle duplicate (valuation_id, floor_number) constraint
    const query = `
      INSERT INTO valuation_floor_plans (
        id, valuation_id, property_id, canvas_json, canvas_version,
        scale_pixels_per_meter, calibration_reference,
        gross_building_area_sqm, net_usable_area_sqm, efficiency_ratio,
        rooms, floor_number, floor_label,
        has_scale_reference, measurement_confidence, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (valuation_id, floor_number) 
      DO UPDATE SET
        canvas_json = EXCLUDED.canvas_json,
        canvas_version = EXCLUDED.canvas_version,
        scale_pixels_per_meter = EXCLUDED.scale_pixels_per_meter,
        calibration_reference = EXCLUDED.calibration_reference,
        gross_building_area_sqm = EXCLUDED.gross_building_area_sqm,
        net_usable_area_sqm = EXCLUDED.net_usable_area_sqm,
        efficiency_ratio = EXCLUDED.efficiency_ratio,
        rooms = EXCLUDED.rooms,
        floor_label = EXCLUDED.floor_label,
        has_scale_reference = EXCLUDED.has_scale_reference,
        measurement_confidence = EXCLUDED.measurement_confidence,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      id,
      input.valuation_id,
      input.property_id || null,
      JSON.stringify(input.canvas_json),
      input.canvas_json.version || '5.3.0',
      input.scale_pixels_per_meter || 20,
      input.calibration_reference || null,
      measurements.grossArea,
      measurements.netUsableArea,
      measurements.efficiencyRatio,
      JSON.stringify(rooms),
      input.floor_number || 0,
      input.floor_label || 'Ground Floor',
      input.has_scale_reference || false,
      input.measurement_confidence || 'estimated',
      input.created_by || null
    ];
    
    const result = await pool.query(query, values);
    const floorPlan = this.mapRowToFloorPlan(result.rows[0]);
    
    // Insert individual rooms for querying (delete existing first for upsert case)
    await pool.query('DELETE FROM valuation_floor_plan_rooms WHERE floor_plan_id = $1', [floorPlan.id]);
    await this.insertRooms(floorPlan.id, rooms);
    
    return floorPlan;
  }

  /**
   * Get floor plan by ID
   */
  async getById(id: string): Promise<FloorPlan | null> {
    const query = 'SELECT * FROM valuation_floor_plans WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    return this.mapRowToFloorPlan(result.rows[0]);
  }

  /**
   * Get all floor plans for a valuation
   */
  async getByValuationId(valuationId: string): Promise<FloorPlan[]> {
    const query = `
      SELECT * FROM valuation_floor_plans 
      WHERE valuation_id = $1 
      ORDER BY floor_number ASC
    `;
    const result = await pool.query(query, [valuationId]);
    return result.rows.map(this.mapRowToFloorPlan);
  }

  /**
   * Update a floor plan
   */
  async update(id: string, input: UpdateFloorPlanInput): Promise<FloorPlan | null> {
    // Check if locked
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.is_locked) {
      throw new Error('Floor plan is locked and cannot be modified');
    }

    let rooms = existing.rooms;
    let measurements = {
      grossArea: existing.gross_building_area_sqm,
      netUsableArea: existing.net_usable_area_sqm,
      efficiencyRatio: existing.efficiency_ratio
    };

    // Recalculate if canvas changed
    if (input.canvas_json) {
      const scale = input.scale_pixels_per_meter || existing.scale_pixels_per_meter;
      rooms = this.extractRoomsFromCanvas(input.canvas_json, scale);
      measurements = this.calculateMeasurements(rooms);
    }

    const query = `
      UPDATE valuation_floor_plans SET
        canvas_json = COALESCE($2, canvas_json),
        scale_pixels_per_meter = COALESCE($3, scale_pixels_per_meter),
        calibration_reference = COALESCE($4, calibration_reference),
        gross_building_area_sqm = $5,
        net_usable_area_sqm = $6,
        efficiency_ratio = $7,
        rooms = $8,
        floor_label = COALESCE($9, floor_label),
        has_scale_reference = COALESCE($10, has_scale_reference),
        measurement_confidence = COALESCE($11, measurement_confidence),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const values = [
      id,
      input.canvas_json ? JSON.stringify(input.canvas_json) : null,
      input.scale_pixels_per_meter || null,
      input.calibration_reference || null,
      measurements.grossArea,
      measurements.netUsableArea,
      measurements.efficiencyRatio,
      JSON.stringify(rooms),
      input.floor_label || null,
      input.has_scale_reference,
      input.measurement_confidence || null
    ];

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) return null;
    
    // Update rooms table
    await this.deleteRooms(id);
    await this.insertRooms(id, rooms);
    
    return this.mapRowToFloorPlan(result.rows[0]);
  }

  /**
   * Delete a floor plan
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    if (existing.is_locked) {
      throw new Error('Floor plan is locked and cannot be deleted');
    }

    const query = 'DELETE FROM valuation_floor_plans WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Lock a floor plan (prevents further edits)
   */
  async lock(id: string, userId: string): Promise<FloorPlan | null> {
    const query = `
      UPDATE valuation_floor_plans SET
        is_locked = true,
        locked_at = NOW(),
        locked_by = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id, userId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToFloorPlan(result.rows[0]);
  }

  /**
   * Unlock a floor plan (admin only)
   */
  async unlock(id: string): Promise<FloorPlan | null> {
    const query = `
      UPDATE valuation_floor_plans SET
        is_locked = false,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.mapRowToFloorPlan(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // MEASUREMENT EXTRACTION
  // --------------------------------------------------------------------------

  /**
   * Extract room data from Fabric.js canvas JSON
   */
  extractRoomsFromCanvas(canvas: FloorPlanCanvas, scalePixelsPerMeter: number): Room[] {
    const rooms: Room[] = [];
    
    // Safety check: ensure canvas.objects is iterable
    if (!canvas?.objects || !Array.isArray(canvas.objects)) {
      return rooms;
    }
    
    for (const obj of canvas.objects) {
      if (obj.type === 'polygon' && obj.roomType) {
        const room = this.extractRoomFromPolygon(obj, scalePixelsPerMeter);
        if (room) rooms.push(room);
      }
      // Also check for groups containing room polygons
      if (obj.type === 'group' && obj.objects) {
        for (const groupObj of obj.objects) {
          if (groupObj.type === 'polygon' && groupObj.roomType) {
            const room = this.extractRoomFromPolygon(groupObj, scalePixelsPerMeter, obj);
            if (room) rooms.push(room);
          }
        }
      }
    }
    
    return rooms;
  }

  /**
   * Extract room data from a polygon object
   */
  private extractRoomFromPolygon(
    polygon: FabricObject, 
    scale: number,
    parent?: FabricObject
  ): Room | null {
    if (!polygon.points || polygon.points.length < 3) return null;
    
    const roomType = this.normalizeRoomType(polygon.roomType || 'other');
    const standards = this.getGhanaBuildingStandard(roomType);
    
    // Convert points to meters
    const verticesMeters = polygon.points.map(p => ({
      x: p.x / scale,
      y: p.y / scale
    }));
    
    // Calculate area using Shoelace formula
    const areaMeters = this.calculatePolygonArea(verticesMeters);
    const perimeterMeters = this.calculatePolygonPerimeter(verticesMeters);
    
    // Calculate bounding box dimensions
    const { length, width } = this.calculateBoundingBox(verticesMeters);
    
    // Validate against Ghana Building Code
    const meetsMinimum = standards ? areaMeters >= standards.minimum_area_sqm : true;
    
    let validationNotes: string | undefined;
    if (standards && !meetsMinimum) {
      validationNotes = `${polygon.name || roomType} is ${areaMeters.toFixed(2)} sqm, below minimum ${standards.minimum_area_sqm} sqm`;
    } else if (standards && areaMeters < standards.recommended_area_sqm) {
      validationNotes = `${polygon.name || roomType} is below recommended ${standards.recommended_area_sqm} sqm`;
    }
    
    return {
      id: polygon.id || uuidv4(),
      name: polygon.name || `${roomType.charAt(0).toUpperCase() + roomType.slice(1)}`,
      type: roomType,
      area_sqm: Math.round(areaMeters * 100) / 100,
      perimeter_m: Math.round(perimeterMeters * 100) / 100,
      vertices: polygon.points,
      length_m: Math.round(length * 100) / 100,
      width_m: Math.round(width * 100) / 100,
      meets_minimum_size: meetsMinimum,
      minimum_size_sqm: standards?.minimum_area_sqm || 0,
      validation_notes: validationNotes,
      fill_color: polygon.fill || '#E5E7EB'
    };
  }

  /**
   * Calculate area of polygon using Shoelace formula
   */
  calculatePolygonArea(vertices: Array<{ x: number; y: number }>): number {
    const n = vertices.length;
    if (n < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  /**
   * Calculate perimeter of polygon
   */
  calculatePolygonPerimeter(vertices: Array<{ x: number; y: number }>): number {
    const n = vertices.length;
    if (n < 2) return 0;
    
    let perimeter = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = vertices[j].x - vertices[i].x;
      const dy = vertices[j].y - vertices[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    
    return perimeter;
  }

  /**
   * Calculate bounding box dimensions
   */
  private calculateBoundingBox(vertices: Array<{ x: number; y: number }>): { length: number; width: number } {
    if (vertices.length === 0) return { length: 0, width: 0 };
    
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const dimX = maxX - minX;
    const dimY = maxY - minY;
    
    return {
      length: Math.max(dimX, dimY),
      width: Math.min(dimX, dimY)
    };
  }

  /**
   * Calculate aggregate measurements from rooms
   */
  calculateMeasurements(rooms: Room[]): {
    grossArea: number;
    netUsableArea: number;
    efficiencyRatio: number;
  } {
    const grossArea = rooms.reduce((sum, r) => sum + r.area_sqm, 0);
    
    // Net usable excludes corridors, storage, and circulation
    const nonUsableTypes: RoomType[] = ['corridor', 'storage', 'porch'];
    const netUsableArea = rooms
      .filter(r => !nonUsableTypes.includes(r.type))
      .reduce((sum, r) => sum + r.area_sqm, 0);
    
    const efficiencyRatio = grossArea > 0 ? netUsableArea / grossArea : 0;
    
    return {
      grossArea: Math.round(grossArea * 100) / 100,
      netUsableArea: Math.round(netUsableArea * 100) / 100,
      efficiencyRatio: Math.round(efficiencyRatio * 10000) / 10000
    };
  }

  // --------------------------------------------------------------------------
  // GHANA BUILDING CODE VALIDATION
  // --------------------------------------------------------------------------

  /**
   * Get Ghana Building Code standards for a room type
   */
  async getGhanaBuildingStandards(): Promise<GhanaBuildingStandard[]> {
    const query = 'SELECT * FROM ghana_building_code_standards WHERE property_type = $1';
    const result = await pool.query(query, ['residential']);
    return result.rows;
  }

  /**
   * Get standard for specific room type (synchronous, uses cached/static data)
   */
  private getGhanaBuildingStandard(roomType: RoomType): GhanaBuildingStandard | null {
    const standards: Record<RoomType, GhanaBuildingStandard> = {
      bedroom: { room_type: 'bedroom', property_type: 'residential', minimum_area_sqm: 9.0, recommended_area_sqm: 12.0, minimum_width_m: 2.5, minimum_height_m: 2.7 },
      bathroom: { room_type: 'bathroom', property_type: 'residential', minimum_area_sqm: 3.0, recommended_area_sqm: 4.5, minimum_width_m: 1.5, minimum_height_m: 2.4 },
      kitchen: { room_type: 'kitchen', property_type: 'residential', minimum_area_sqm: 5.0, recommended_area_sqm: 9.0, minimum_width_m: 2.0, minimum_height_m: 2.7 },
      living: { room_type: 'living', property_type: 'residential', minimum_area_sqm: 12.0, recommended_area_sqm: 18.0, minimum_width_m: 3.0, minimum_height_m: 2.7 },
      dining: { room_type: 'dining', property_type: 'residential', minimum_area_sqm: 8.0, recommended_area_sqm: 12.0, minimum_width_m: 2.5, minimum_height_m: 2.7 },
      storage: { room_type: 'storage', property_type: 'residential', minimum_area_sqm: 1.5, recommended_area_sqm: 3.0, minimum_width_m: 1.0, minimum_height_m: 2.4 },
      corridor: { room_type: 'corridor', property_type: 'residential', minimum_area_sqm: 1.0, recommended_area_sqm: 1.5, minimum_width_m: 1.0, minimum_height_m: 2.4 },
      porch: { room_type: 'porch', property_type: 'residential', minimum_area_sqm: 4.0, recommended_area_sqm: 8.0, minimum_width_m: 2.0, minimum_height_m: 2.4 },
      garage: { room_type: 'garage', property_type: 'residential', minimum_area_sqm: 15.0, recommended_area_sqm: 30.0, minimum_width_m: 3.0, minimum_height_m: 2.4 },
      laundry: { room_type: 'laundry', property_type: 'residential', minimum_area_sqm: 3.0, recommended_area_sqm: 6.0, minimum_width_m: 1.5, minimum_height_m: 2.4 },
      office: { room_type: 'office', property_type: 'residential', minimum_area_sqm: 6.0, recommended_area_sqm: 9.0, minimum_width_m: 2.0, minimum_height_m: 2.7 },
      other: { room_type: 'other', property_type: 'residential', minimum_area_sqm: 0, recommended_area_sqm: 0, minimum_width_m: 0, minimum_height_m: 2.4 }
    };
    
    return standards[roomType] || null;
  }

  /**
   * Validate all floor plans for a valuation against Ghana Building Code
   */
  async validateAgainstBuildingCode(valuationId: string): Promise<ValidationIssue[]> {
    const floorPlans = await this.getByValuationId(valuationId);
    const issues: ValidationIssue[] = [];
    
    for (const plan of floorPlans) {
      for (const room of plan.rooms) {
        const standard = this.getGhanaBuildingStandard(room.type);
        if (!standard) continue;
        
        if (room.area_sqm < standard.minimum_area_sqm) {
          issues.push({
            room_id: room.id,
            room_name: room.name,
            room_type: room.type,
            issue_type: 'below_minimum',
            message: `${room.name} (${room.area_sqm} sqm) is below minimum ${standard.minimum_area_sqm} sqm`,
            severity: 'error'
          });
        } else if (room.area_sqm < standard.recommended_area_sqm) {
          issues.push({
            room_id: room.id,
            room_name: room.name,
            room_type: room.type,
            issue_type: 'below_recommended',
            message: `${room.name} (${room.area_sqm} sqm) is below recommended ${standard.recommended_area_sqm} sqm`,
            severity: 'warning'
          });
        }
      }
    }
    
    return issues;
  }

  // --------------------------------------------------------------------------
  // SUMMARY & AGGREGATION
  // --------------------------------------------------------------------------

  /**
   * Get summary of all floor plans for a valuation
   */
  async getSummary(valuationId: string): Promise<FloorPlanSummary> {
    const floorPlans = await this.getByValuationId(valuationId);
    const validationIssues = await this.validateAgainstBuildingCode(valuationId);
    
    const allRooms = floorPlans.flatMap(fp => fp.rooms);
    
    const roomCounts: Record<RoomType, number> = {
      bedroom: 0, bathroom: 0, kitchen: 0, living: 0, dining: 0,
      storage: 0, corridor: 0, porch: 0, garage: 0, laundry: 0, office: 0, other: 0
    };
    
    for (const room of allRooms) {
      roomCounts[room.type] = (roomCounts[room.type] || 0) + 1;
    }
    
    const totalGrossArea = floorPlans.reduce((sum, fp) => sum + (fp.gross_building_area_sqm || 0), 0);
    const totalNetArea = floorPlans.reduce((sum, fp) => sum + (fp.net_usable_area_sqm || 0), 0);
    
    return {
      total_floors: floorPlans.length,
      total_gross_area_sqm: Math.round(totalGrossArea * 100) / 100,
      total_net_area_sqm: Math.round(totalNetArea * 100) / 100,
      room_counts: roomCounts,
      validation_issues: validationIssues,
      efficiency_ratio: totalGrossArea > 0 
        ? Math.round((totalNetArea / totalGrossArea) * 10000) / 10000 
        : 0
    };
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private normalizeRoomType(type: string): RoomType {
    const normalized = type.toLowerCase().replace(/[^a-z]/g, '');
    const validTypes: RoomType[] = [
      'bedroom', 'bathroom', 'kitchen', 'living', 'dining',
      'storage', 'corridor', 'porch', 'garage', 'laundry', 'office'
    ];
    return validTypes.includes(normalized as RoomType) ? normalized as RoomType : 'other';
  }

  private mapRowToFloorPlan(row: any): FloorPlan {
    return {
      id: row.id,
      valuation_id: row.valuation_id,
      property_id: row.property_id,
      canvas_json: typeof row.canvas_json === 'string' ? JSON.parse(row.canvas_json) : row.canvas_json,
      canvas_version: row.canvas_version,
      scale_pixels_per_meter: parseFloat(row.scale_pixels_per_meter),
      calibration_reference: row.calibration_reference,
      gross_building_area_sqm: row.gross_building_area_sqm ? parseFloat(row.gross_building_area_sqm) : undefined,
      net_usable_area_sqm: row.net_usable_area_sqm ? parseFloat(row.net_usable_area_sqm) : undefined,
      site_boundary_sqm: row.site_boundary_sqm ? parseFloat(row.site_boundary_sqm) : undefined,
      site_coverage_ratio: row.site_coverage_ratio ? parseFloat(row.site_coverage_ratio) : undefined,
      efficiency_ratio: row.efficiency_ratio ? parseFloat(row.efficiency_ratio) : undefined,
      rooms: typeof row.rooms === 'string' ? JSON.parse(row.rooms) : row.rooms,
      floor_number: row.floor_number,
      floor_label: row.floor_label,
      is_locked: row.is_locked,
      locked_at: row.locked_at ? new Date(row.locked_at) : undefined,
      locked_by: row.locked_by,
      has_scale_reference: row.has_scale_reference,
      measurement_confidence: row.measurement_confidence,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  private async insertRooms(floorPlanId: string, rooms: Room[]): Promise<void> {
    if (rooms.length === 0) return;
    
    const query = `
      INSERT INTO valuation_floor_plan_rooms (
        id, floor_plan_id, room_name, room_type, area_sqm, perimeter_m,
        length_m, width_m, vertices, meets_minimum_size, minimum_size_sqm,
        validation_notes, fill_color, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;
    
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      await pool.query(query, [
        room.id,
        floorPlanId,
        room.name,
        room.type,
        room.area_sqm,
        room.perimeter_m,
        room.length_m || null,
        room.width_m || null,
        JSON.stringify(room.vertices),
        room.meets_minimum_size,
        room.minimum_size_sqm,
        room.validation_notes || null,
        room.fill_color,
        i
      ]);
    }
  }

  private async deleteRooms(floorPlanId: string): Promise<void> {
    await pool.query('DELETE FROM valuation_floor_plan_rooms WHERE floor_plan_id = $1', [floorPlanId]);
  }
}

// Export singleton instance
export const floorPlanService = new FloorPlanService();
export default floorPlanService;
