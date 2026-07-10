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
 * - Floor plan image storage for report appendices
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

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
  // Image storage for report appendices
  image_url?: string;
  image_generated_at?: Date;
  image_width?: number;
  image_height?: number;
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
    // v2 studio documents carry exact engine-computed measurements (boundary GFA,
    // miter-offset net areas); prefer them over the sum-of-rooms approximation
    const measurements = this.providedMeasurements(input.canvas_json) ?? this.calculateMeasurements(rooms);
    
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
      measurements = this.providedMeasurements(input.canvas_json) ?? this.calculateMeasurements(rooms);
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
   * Recalculate rooms from existing canvas data
   * This is useful when the room extraction logic has been updated
   */
  async recalculate(id: string): Promise<FloorPlan | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.is_locked) {
      throw new Error('Floor plan is locked and cannot be modified');
    }

    // Re-extract rooms from existing canvas
    const rooms = this.extractRoomsFromCanvas(
      existing.canvas_json,
      existing.scale_pixels_per_meter
    );
    const measurements = this.providedMeasurements(existing.canvas_json) ?? this.calculateMeasurements(rooms);

    const query = `
      UPDATE valuation_floor_plans SET
        gross_building_area_sqm = $2,
        net_usable_area_sqm = $3,
        efficiency_ratio = $4,
        rooms = $5,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const values = [
      id,
      measurements.grossArea,
      measurements.netUsableArea,
      measurements.efficiencyRatio,
      JSON.stringify(rooms)
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
   * Supports both legacy Fabric.js format and new Professional Floor Plan Builder format
   */
  extractRoomsFromCanvas(canvas: FloorPlanCanvas, scalePixelsPerMeter: number): Room[] {
    const rooms: Room[] = [];
    
    // NEW FORMAT: Professional Floor Plan Builder sends rooms directly in the canvas JSON
    // Format: { version: "2.0", rooms: [{id, name, type, area, perimeter, ...}], walls: [...], ... }
    const canvasAny = canvas as any;
    if (canvasAny?.rooms && Array.isArray(canvasAny.rooms) && canvasAny.rooms.length > 0) {
      logger.debug('Extracting rooms from Professional Floor Plan Builder format', { 
        roomCount: canvasAny.rooms.length 
      });
      
      for (const room of canvasAny.rooms) {
        const roomType = this.normalizeRoomType(room.type);
        const standards = this.getGhanaBuildingStandard(roomType);
        const meetsMinimum = standards ? (room.area || 0) >= standards.minimum_area_sqm : true;
        
        // Generate UUID if room.id is not a valid UUID format
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room.id || '');
        const roomId = isValidUUID ? room.id : uuidv4();
        
        rooms.push({
          id: roomId,
          name: room.name || 'Room',
          type: roomType,
          area_sqm: Math.round((room.area || 0) * 100) / 100,
          perimeter_m: Math.round((room.perimeter || 0) * 100) / 100,
          vertices: room.polygon || [],
          length_m: undefined, // Calculated from polygon if needed
          width_m: undefined,
          meets_minimum_size: meetsMinimum,
          minimum_size_sqm: standards?.minimum_area_sqm || 0,
          validation_notes: meetsMinimum ? undefined : `Below minimum size of ${standards?.minimum_area_sqm}sqm`,
          fill_color: room.fillColor || '#E8F5E9',
        });
      }
      
      return rooms;
    }
    
    // LEGACY FORMAT: Fabric.js objects array
    // Safety check: ensure canvas.objects is iterable
    // Handle both direct objects and nested canvasData structure
    let objects = canvas?.objects;
    if (!objects && (canvas as any)?.canvasData?.objects) {
      objects = (canvas as any).canvasData.objects;
    }
    
    if (!objects || !Array.isArray(objects)) {
      return rooms;
    }
    
    // First pass: collect all text labels that might be room labels
    const textLabels: Map<string, { text: string; left: number; top: number }> = new Map();
    for (const obj of objects) {
      if (obj.type === 'text' && obj.text) {
        const key = `${Math.round(obj.left || 0)}_${Math.round(obj.top || 0)}`;
        textLabels.set(key, { text: obj.text, left: obj.left || 0, top: obj.top || 0 });
      }
    }
    
    for (const obj of objects) {
      // Extract polygons - either with explicit roomType OR any polygon (treat as room)
      if (obj.type === 'polygon') {
        // Check if polygon has roomType OR if it's a reasonably sized shape (likely a room)
        const hasRoomType = !!obj.roomType;
        const hasReasonableSize = (obj.width || 0) > 50 && (obj.height || 0) > 50;
        
        if (hasRoomType || hasReasonableSize) {
          // Try to find an associated text label for this polygon
          const roomLabel = this.findNearestTextLabel(obj, textLabels);
          const room = this.extractRoomFromPolygon(obj, scalePixelsPerMeter, undefined, roomLabel);
          if (room) rooms.push(room);
        }
      }
      // Also check for rect objects (rectangles are commonly used for rooms)
      if (obj.type === 'rect' && (obj.width || 0) > 50 && (obj.height || 0) > 50) {
        const roomLabel = this.findNearestTextLabel(obj, textLabels);
        const room = this.extractRoomFromRect(obj, scalePixelsPerMeter, roomLabel);
        if (room) rooms.push(room);
      }
      // Also check for groups containing room polygons
      if (obj.type === 'group' && obj.objects) {
        for (const groupObj of obj.objects) {
          if (groupObj.type === 'polygon') {
            const hasRoomType = !!groupObj.roomType;
            const hasReasonableSize = (groupObj.width || 0) > 50 && (groupObj.height || 0) > 50;
            if (hasRoomType || hasReasonableSize) {
              const room = this.extractRoomFromPolygon(groupObj, scalePixelsPerMeter, obj);
              if (room) rooms.push(room);
            }
          }
        }
      }
    }
    
    return rooms;
  }

  /**
   * Find the nearest text label to a shape (for associating room names)
   */
  private findNearestTextLabel(
    shape: FabricObject, 
    textLabels: Map<string, { text: string; left: number; top: number }>
  ): string | undefined {
    const shapeCenter = {
      x: (shape.left || 0) + ((shape.width || 0) * (shape.scaleX || 1)) / 2,
      y: (shape.top || 0) + ((shape.height || 0) * (shape.scaleY || 1)) / 2
    };
    
    let nearestLabel: string | undefined;
    let nearestDistance = Infinity;
    
    for (const [, label] of textLabels) {
      const distance = Math.sqrt(
        Math.pow(label.left - shapeCenter.x, 2) + 
        Math.pow(label.top - shapeCenter.y, 2)
      );
      
      // Only consider labels within the shape bounds (roughly)
      const maxDistance = Math.max(shape.width || 0, shape.height || 0);
      if (distance < nearestDistance && distance < maxDistance) {
        nearestDistance = distance;
        nearestLabel = label.text;
      }
    }
    
    return nearestLabel;
  }

  /**
   * Extract room data from a rectangle object
   */
  private extractRoomFromRect(
    rect: FabricObject, 
    scale: number,
    labelText?: string
  ): Room | null {
    const width = ((rect.width || 0) * (rect.scaleX || 1)) / scale;
    const height = ((rect.height || 0) * (rect.scaleY || 1)) / scale;
    const areaMeters = width * height;
    const perimeterMeters = 2 * (width + height);
    
    if (areaMeters < 1) return null; // Too small to be a room
    
    // Parse room name and type from label if available
    let roomName = rect.name || labelText?.split('\n')[0] || 'Room';
    let roomType: RoomType = (rect.roomType as RoomType) || this.inferRoomTypeFromName(roomName);
    
    const standards = this.getGhanaBuildingStandard(roomType);
    const meetsMinimum = standards ? areaMeters >= standards.minimum_area_sqm : true;
    
    return {
      id: rect.id || uuidv4(),
      name: roomName,
      type: roomType,
      area_sqm: Math.round(areaMeters * 100) / 100,
      perimeter_m: Math.round(perimeterMeters * 100) / 100,
      vertices: [],
      length_m: Math.round(Math.max(width, height) * 100) / 100,
      width_m: Math.round(Math.min(width, height) * 100) / 100,
      meets_minimum_size: meetsMinimum,
      minimum_size_sqm: standards?.minimum_area_sqm || 0,
      fill_color: rect.fill || '#E5E7EB'
    };
  }

  /**
   * Infer room type from room name
   */
  private inferRoomTypeFromName(name: string): RoomType {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('bedroom') || nameLower.includes('bed')) return 'bedroom';
    if (nameLower.includes('living') || nameLower.includes('lounge')) return 'living';
    if (nameLower.includes('kitchen')) return 'kitchen';
    if (nameLower.includes('bathroom') || nameLower.includes('bath')) return 'bathroom';
    if (nameLower.includes('toilet') || nameLower.includes('wc')) return 'bathroom';
    if (nameLower.includes('dining')) return 'dining';
    if (nameLower.includes('store') || nameLower.includes('storage')) return 'storage';
    if (nameLower.includes('garage')) return 'garage';
    if (nameLower.includes('balcony')) return 'porch';
    if (nameLower.includes('porch')) return 'porch';
    if (nameLower.includes('laundry')) return 'laundry';
    if (nameLower.includes('office') || nameLower.includes('study')) return 'office';
    if (nameLower.includes('corridor') || nameLower.includes('hall')) return 'corridor';
    return 'other';
  }

  /**
   * Extract room data from a polygon object
   */
  private extractRoomFromPolygon(
    polygon: FabricObject, 
    scale: number,
    parent?: FabricObject,
    labelText?: string
  ): Room | null {
    // For polygons without points, calculate area from bounding box
    if (!polygon.points || polygon.points.length < 3) {
      // Fall back to bounding box calculation
      const width = ((polygon.width || 0) * (polygon.scaleX || 1)) / scale;
      const height = ((polygon.height || 0) * (polygon.scaleY || 1)) / scale;
      const areaMeters = width * height;
      
      if (areaMeters < 1) return null; // Too small
      
      // Parse room name from label or polygon name
      let roomName = polygon.name || labelText?.split('\n')[0] || 'Room';
      let roomType: RoomType = (polygon.roomType as RoomType) || this.inferRoomTypeFromName(roomName);
      
      const standards = this.getGhanaBuildingStandard(roomType);
      const meetsMinimum = standards ? areaMeters >= standards.minimum_area_sqm : true;
      
      return {
        id: polygon.id || uuidv4(),
        name: roomName,
        type: roomType,
        area_sqm: Math.round(areaMeters * 100) / 100,
        perimeter_m: Math.round(2 * (width + height) * 100) / 100,
        vertices: [],
        length_m: Math.round(Math.max(width, height) * 100) / 100,
        width_m: Math.round(Math.min(width, height) * 100) / 100,
        meets_minimum_size: meetsMinimum,
        minimum_size_sqm: standards?.minimum_area_sqm || 0,
        fill_color: polygon.fill || '#E5E7EB'
      };
    }
    
    // Parse room name from label or polygon name
    let roomName = polygon.name || labelText?.split('\n')[0] || 'Room';
    const roomType = this.normalizeRoomType(polygon.roomType || this.inferRoomTypeFromName(roomName));
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
  /**
   * v2 canvas documents include measurements computed by the editor's exact
   * geometry engine: { grossArea, netUsableArea, efficiencyRatio }. Returns
   * null for legacy documents so the sum-of-rooms fallback applies.
   */
  private providedMeasurements(canvasJson: unknown): {
    grossArea: number;
    netUsableArea: number;
    efficiencyRatio: number;
  } | null {
    const canvas = typeof canvasJson === 'string' ? this.safeParse(canvasJson) : canvasJson;
    const m = (canvas as { measurements?: { grossArea?: unknown; netUsableArea?: unknown; efficiencyRatio?: unknown } } | null)
      ?.measurements;
    if (!m || typeof m.grossArea !== 'number' || typeof m.netUsableArea !== 'number' || !isFinite(m.grossArea)) {
      return null;
    }
    const gross = Math.round(m.grossArea * 100) / 100;
    const net = Math.round(m.netUsableArea * 100) / 100;
    const eff =
      typeof m.efficiencyRatio === 'number' && isFinite(m.efficiencyRatio)
        ? Math.round(m.efficiencyRatio * 10000) / 10000
        : gross > 0
          ? Math.round((net / gross) * 10000) / 10000
          : 0;
    return { grossArea: gross, netUsableArea: net, efficiencyRatio: eff };
  }

  private safeParse(s: string): unknown {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

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
    if (!type) return 'other';
    
    const normalized = type.toLowerCase().replace(/[_-]/g, ' ').trim();
    
    // Map frontend room types to backend room types
    const typeMap: Record<string, RoomType> = {
      'bedroom': 'bedroom',
      'small bedroom': 'bedroom',
      'standard bedroom': 'bedroom',
      'master bedroom': 'bedroom',
      'bathroom': 'bathroom',
      'small bathroom': 'bathroom',
      'master bathroom': 'bathroom',
      'kitchen': 'kitchen',
      'living': 'living',
      'living room': 'living',
      'livingroom': 'living',
      'dining': 'dining',
      'dining room': 'dining',
      'storage': 'storage',
      'storage room': 'storage',
      'corridor': 'corridor',
      'hallway': 'corridor',
      'porch': 'porch',
      'balcony': 'porch',
      'garage': 'garage',
      'laundry': 'laundry',
      'laundry room': 'laundry',
      'office': 'office',
      'study': 'office',
    };
    
    return typeMap[normalized] || 'other';
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
      // Image storage for report appendices
      image_url: row.image_url,
      image_generated_at: row.image_generated_at ? new Date(row.image_generated_at) : undefined,
      image_width: row.image_width ? parseInt(row.image_width) : undefined,
      image_height: row.image_height ? parseInt(row.image_height) : undefined,
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

  // --------------------------------------------------------------------------
  // IMAGE STORAGE FOR REPORT APPENDICES
  // --------------------------------------------------------------------------

  /**
   * Save floor plan image (PNG) to MinIO storage
   * @param planId - Floor plan ID
   * @param imageDataUrl - Base64 data URL (e.g., "data:image/png;base64,...")
   * @param width - Image width in pixels
   * @param height - Image height in pixels
   * @returns Updated floor plan with image_url
   */
  async saveImage(
    planId: string, 
    imageDataUrl: string,
    width?: number,
    height?: number
  ): Promise<FloorPlan | null> {
    const floorPlan = await this.getById(planId);
    if (!floorPlan) {
      logger.error('Floor plan not found for image save', { planId });
      return null;
    }

    // Extract base64 data from data URL
    const matches = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid image data URL format');
    }

    const imageFormat = matches[1]; // png, jpeg, etc.
    const base64Data = matches[2];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Generate storage key: floor-plans/{valuation_id}/floor-{floor_number}.png
    const objectKey = `floor-plans/${floorPlan.valuation_id}/floor-${floorPlan.floor_number}.${imageFormat}`;
    const bucket = buckets.uploads || 'propmetrik-uploads';

    try {
      // Upload to MinIO
      await uploadFile(
        bucket,
        objectKey,
        imageBuffer,
        `image/${imageFormat}`,
        {
          'x-amz-meta-floor-plan-id': planId,
          'x-amz-meta-valuation-id': floorPlan.valuation_id,
          'x-amz-meta-floor-number': String(floorPlan.floor_number),
        }
      );

      const imageUrl = `minio://${bucket}/${objectKey}`;
      
      logger.info('Floor plan image saved to MinIO', { 
        planId, 
        imageUrl,
        size: imageBuffer.length,
        width,
        height
      });

      // Update database with image URL
      const query = `
        UPDATE valuation_floor_plans SET
          image_url = $2,
          image_generated_at = NOW(),
          image_width = $3,
          image_height = $4,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [planId, imageUrl, width || null, height || null]);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to update floor plan with image URL');
      }

      return this.mapRowToFloorPlan(result.rows[0]);
    } catch (error: any) {
      logger.error('Failed to save floor plan image', { 
        planId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get presigned URL for floor plan image
   * @param planId - Floor plan ID
   * @param expiresInSeconds - URL expiry time (default 1 hour)
   * @returns Presigned download URL or null if no image
   */
  async getImageUrl(planId: string, expiresInSeconds: number = 3600): Promise<string | null> {
    const floorPlan = await this.getById(planId);
    if (!floorPlan || !floorPlan.image_url) {
      return null;
    }

    // Parse minio:// URL
    const match = floorPlan.image_url.match(/^minio:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      logger.warn('Invalid image URL format', { imageUrl: floorPlan.image_url });
      return null;
    }

    const [, bucket, key] = match;
    
    try {
      return await getPresignedDownloadUrl(bucket, key, expiresInSeconds);
    } catch (error: any) {
      logger.error('Failed to generate presigned URL for floor plan image', {
        planId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get all floor plan images for a valuation with presigned URLs
   * @param valuationId - Valuation ID
   * @returns Array of floor plans with presigned image URLs
   */
  async getImagesForValuation(valuationId: string): Promise<Array<{
    planId: string;
    floorNumber: number;
    floorLabel: string;
    imageUrl: string | null;
    grossBuildingAreaSqm: number | null;
  }>> {
    const floorPlans = await this.getByValuationId(valuationId);
    
    const results = await Promise.all(
      floorPlans.map(async (fp) => ({
        planId: fp.id,
        floorNumber: fp.floor_number,
        floorLabel: fp.floor_label,
        imageUrl: fp.image_url ? await this.getImageUrl(fp.id) : null,
        grossBuildingAreaSqm: fp.gross_building_area_sqm || null,
      }))
    );

    return results;
  }
}

// Export singleton instance
export const floorPlanService = new FloorPlanService();
export default floorPlanService;
