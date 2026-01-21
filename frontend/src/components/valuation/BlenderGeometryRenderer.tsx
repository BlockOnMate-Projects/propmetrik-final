'use client';

/**
 * Blender Geometry Renderer
 * 
 * Renders Blender-generated floor plan geometry using Fabric.js.
 * Displays walls, rooms, openings with proper styling and labels.
 * 
 * This is a READ-ONLY renderer - adjustments go through ConstrainedFloorPlanBuilder.
 * 
 * @module components/valuation/BlenderGeometryRenderer
 * @version 1.0.0
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { fabric } from 'fabric';
import { cn } from '@/lib/utils';
import type {
  BlenderGeometryResult,
  BlenderGeometryRendererProps,
  FabricGeometryObject,
  FloorProjection,
  RoomType,
} from '@/types/floorPlanGeometry';

// ============================================================================
// CONSTANTS
// ============================================================================

// Extended room type to handle additional types from Blender
type ExtendedRoomType = RoomType | 'master_bedroom' | 'entrance' | 'utility' | 'terrace' | 'staircase' | 'other' | 'porch';

const ROOM_COLORS: Record<ExtendedRoomType | string, string> = {
  living: '#FEF3C7',      // Amber-100
  dining: '#FDE68A',      // Amber-200
  kitchen: '#FCD34D',     // Amber-300
  bedroom: '#DBEAFE',     // Blue-100
  master_bedroom: '#BFDBFE', // Blue-200
  bathroom: '#D1FAE5',    // Emerald-100
  toilet: '#A7F3D0',      // Emerald-200
  corridor: '#F3F4F6',    // Gray-100
  storage: '#E5E7EB',     // Gray-200
  entrance: '#EDE9FE',    // Violet-100
  garage: '#D1D5DB',      // Gray-300
  balcony: '#CFFAFE',     // Cyan-100
  terrace: '#A5F3FC',     // Cyan-200
  office: '#FCE7F3',      // Pink-100
  laundry: '#E0E7FF',     // Indigo-100
  utility: '#F5F5F4',     // Stone-100
  staircase: '#FEE2E2',   // Red-100
  porch: '#FEF9C3',       // Yellow-100
  other: '#F9FAFB',       // Gray-50
};

const WALL_COLORS = {
  external: '#374151',    // Gray-700
  internal: '#6B7280',    // Gray-500
  partition: '#9CA3AF',   // Gray-400
};

const OPENING_COLORS = {
  door: '#92400E',        // Amber-800
  window: '#0891B2',      // Cyan-600
  archway: '#7C3AED',     // Violet-600
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRoomColor(roomType: RoomType | string): string {
  return ROOM_COLORS[roomType] || ROOM_COLORS.other;
}

function formatArea(areaSqm: number): string {
  return `${areaSqm.toFixed(1)} m²`;
}

function formatDimension(meters: number): string {
  return `${meters.toFixed(2)}m`;
}

// ============================================================================
// BLENDER GEOMETRY RENDERER COMPONENT
// ============================================================================

export default function BlenderGeometryRenderer({
  geometry,
  floorNumber = 0,
  readonly = true,
  onElementSelect,
  highlightedElements = [],
  showDimensions = true,
  showLabels = true,
  className,
}: BlenderGeometryRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  // Get the floor projection to render
  const floorProjection = geometry.fabric_projection.floor_projections.find(
    (fp) => fp.floor_number === floorNumber
  );

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: geometry.fabric_projection.canvas_width,
      height: geometry.fabric_projection.canvas_height,
      backgroundColor: '#ffffff',
      selection: false,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;

    // Cleanup
    return () => {
      canvas.dispose();
    };
  }, [geometry.fabric_projection.canvas_width, geometry.fabric_projection.canvas_height]);

  // Render geometry when floor projection changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !floorProjection) return;

    const canvas = fabricCanvasRef.current;
    
    // Clear existing objects
    canvas.clear();
    canvas.setBackgroundColor('#ffffff', () => {});

    // Render grid
    renderGrid(canvas, geometry.fabric_projection.scale_pixels_per_meter);

    // Render rooms first (bottom layer)
    renderRooms(canvas, floorProjection, geometry);

    // Render walls
    renderWalls(canvas, floorProjection, geometry);

    // Render openings (doors, windows)
    renderOpenings(canvas, floorProjection, geometry);

    // Render labels and dimensions if enabled
    if (showLabels) {
      renderRoomLabels(canvas, floorProjection, geometry);
    }

    if (showDimensions) {
      renderDimensions(canvas, geometry);
    }

    canvas.renderAll();
  }, [floorProjection, geometry, showLabels, showDimensions]);

  // Handle element selection
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;

    const handleSelection = (e: fabric.IEvent) => {
      const target = e.target;
      if (target && (target as any).elementId) {
        const elementId = (target as any).elementId;
        const elementType = (target as any).elementType;
        
        setSelectedElement(elementId);
        onElementSelect?.(elementId, elementType);
      }
    };

    canvas.on('mouse:down', handleSelection);

    return () => {
      canvas.off('mouse:down', handleSelection);
    };
  }, [onElementSelect]);

  // Update highlighted elements
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    
    canvas.forEachObject((obj) => {
      const elementId = (obj as any).elementId;
      if (elementId) {
        const isHighlighted = highlightedElements.includes(elementId);
        const isSelected = elementId === selectedElement;
        
        if (isHighlighted || isSelected) {
          obj.set({
            strokeWidth: 3,
            stroke: isSelected ? '#2563EB' : '#F59E0B',
          });
        } else {
          // Reset to default stroke
          const defaultStroke = (obj as any).defaultStroke || '#374151';
          obj.set({
            strokeWidth: (obj as any).defaultStrokeWidth || 1,
            stroke: defaultStroke,
          });
        }
      }
    });

    canvas.renderAll();
  }, [highlightedElements, selectedElement]);

  return (
    <div className={cn('relative', className)}>
      <canvas ref={canvasRef} />
      
      {/* Floor indicator */}
      <div className="absolute top-2 left-2 bg-white/90 px-3 py-1 rounded-md shadow-sm text-sm font-medium">
        {geometry.measurements.floors.find(f => f.floor_number === floorNumber)?.floor_label || `Floor ${floorNumber}`}
      </div>
      
      {/* Measurements summary */}
      <div className="absolute top-2 right-2 bg-white/90 px-3 py-2 rounded-md shadow-sm text-sm">
        <div className="font-medium">GFA: {formatArea(geometry.measurements.gfa_sqm)}</div>
        <div className="text-gray-600">NIA: {formatArea(geometry.measurements.nia_sqm)}</div>
      </div>
    </div>
  );
}

// ============================================================================
// RENDERING FUNCTIONS
// ============================================================================

function renderGrid(canvas: fabric.Canvas, scalePixelsPerMeter: number) {
  const width = canvas.getWidth() || 800;
  const height = canvas.getHeight() || 600;
  const gridSpacing = scalePixelsPerMeter; // 1 meter grid

  // Minor grid (10cm)
  const minorSpacing = scalePixelsPerMeter / 10;
  for (let x = 0; x < width; x += minorSpacing) {
    const line = new fabric.Line([x, 0, x, height], {
      stroke: '#F3F4F6',
      strokeWidth: 0.5,
      selectable: false,
      evented: false,
    });
    canvas.add(line);
  }
  for (let y = 0; y < height; y += minorSpacing) {
    const line = new fabric.Line([0, y, width, y], {
      stroke: '#F3F4F6',
      strokeWidth: 0.5,
      selectable: false,
      evented: false,
    });
    canvas.add(line);
  }

  // Major grid (1m)
  for (let x = 0; x < width; x += gridSpacing) {
    const line = new fabric.Line([x, 0, x, height], {
      stroke: '#E5E7EB',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    });
    canvas.add(line);
  }
  for (let y = 0; y < height; y += gridSpacing) {
    const line = new fabric.Line([0, y, width, y], {
      stroke: '#E5E7EB',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    });
    canvas.add(line);
  }
}

function renderRooms(
  canvas: fabric.Canvas,
  floorProjection: FloorProjection,
  geometry: BlenderGeometryResult
) {
  const roomObjects = floorProjection.objects.filter(
    (obj) => obj.element_type === 'room'
  );

  for (const roomObj of roomObjects) {
    const props = roomObj.fabric_properties;
    const roomGeom = geometry.rooms.find((r) => r.room_id === roomObj.element_id);
    const roomType = roomGeom?.room_type || 'other';
    
    let fabricObject: fabric.Object;

    if (roomObj.type === 'polygon' && props.points) {
      fabricObject = new fabric.Polygon(props.points as Array<{ x: number; y: number }>, {
        fill: getRoomColor(roomType),
        stroke: '#9CA3AF',
        strokeWidth: 1,
        selectable: false,
        evented: true,
        opacity: 0.8,
        ...props,
      });
    } else if (roomObj.type === 'rect') {
      fabricObject = new fabric.Rect({
        fill: getRoomColor(roomType),
        stroke: '#9CA3AF',
        strokeWidth: 1,
        selectable: false,
        evented: true,
        opacity: 0.8,
        left: props.left as number || 0,
        top: props.top as number || 0,
        width: props.width as number || 100,
        height: props.height as number || 100,
        ...props,
      });
    } else {
      continue;
    }

    // Attach metadata for selection
    (fabricObject as any).elementId = roomObj.element_id;
    (fabricObject as any).elementType = 'room';
    (fabricObject as any).roomType = roomType;
    (fabricObject as any).defaultStroke = '#9CA3AF';
    (fabricObject as any).defaultStrokeWidth = 1;

    canvas.add(fabricObject);
  }
}

function renderWalls(
  canvas: fabric.Canvas,
  floorProjection: FloorProjection,
  geometry: BlenderGeometryResult
) {
  const wallObjects = floorProjection.objects.filter(
    (obj) => obj.element_type === 'wall'
  );

  for (const wallObj of wallObjects) {
    const props = wallObj.fabric_properties;
    const wallGeom = geometry.walls.find((w) => w.wall_id === wallObj.element_id);
    const wallType = wallGeom?.wall_type || 'internal';
    const wallColor = WALL_COLORS[wallType] || WALL_COLORS.internal;
    
    let fabricObject: fabric.Object;

    if (wallObj.type === 'line') {
      fabricObject = new fabric.Line(
        [
          (props.x1 as number) || 0,
          (props.y1 as number) || 0,
          (props.x2 as number) || 100,
          (props.y2 as number) || 0,
        ],
        {
          stroke: wallColor,
          strokeWidth: wallGeom ? wallGeom.thickness_mm / 10 : 15, // Scale thickness
          selectable: false,
          evented: true,
          strokeLineCap: 'round',
        }
      );
    } else if (wallObj.type === 'rect') {
      fabricObject = new fabric.Rect({
        fill: wallColor,
        stroke: '#1F2937',
        strokeWidth: 0.5,
        selectable: false,
        evented: true,
        left: props.left as number || 0,
        top: props.top as number || 0,
        width: props.width as number || 10,
        height: props.height as number || 100,
        ...props,
      });
    } else {
      continue;
    }

    // Attach metadata
    (fabricObject as any).elementId = wallObj.element_id;
    (fabricObject as any).elementType = 'wall';
    (fabricObject as any).wallType = wallType;
    (fabricObject as any).isStructural = wallGeom?.is_structural || false;
    (fabricObject as any).defaultStroke = wallColor;
    (fabricObject as any).defaultStrokeWidth = wallGeom ? wallGeom.thickness_mm / 10 : 15;

    canvas.add(fabricObject);
  }
}

function renderOpenings(
  canvas: fabric.Canvas,
  floorProjection: FloorProjection,
  geometry: BlenderGeometryResult
) {
  const openingObjects = floorProjection.objects.filter(
    (obj) => obj.element_type === 'opening'
  );

  for (const openingObj of openingObjects) {
    const props = openingObj.fabric_properties;
    const openingGeom = geometry.openings.find(
      (o) => o.opening_id === openingObj.element_id
    );
    const openingType = openingGeom?.opening_type || 'door';
    const openingColor = OPENING_COLORS[openingType] || OPENING_COLORS.door;

    // Render opening as a gap in wall with swing arc for doors
    if (openingType === 'door') {
      // Door swing arc
      const arcRadius = openingGeom ? openingGeom.width_m * geometry.fabric_projection.scale_pixels_per_meter : 40;
      const left = (props.left as number) || 0;
      const top = (props.top as number) || 0;

      // Door frame
      const doorFrame = new fabric.Rect({
        left,
        top,
        width: arcRadius,
        height: 5,
        fill: openingColor,
        stroke: '#1F2937',
        strokeWidth: 0.5,
        selectable: false,
        evented: true,
      });

      // Door swing arc (quarter circle)
      const arc = new fabric.Circle({
        left: left,
        top: top - arcRadius,
        radius: arcRadius,
        startAngle: 0,
        endAngle: 90,
        fill: 'transparent',
        stroke: openingColor,
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        opacity: 0.5,
      });

      (doorFrame as any).elementId = openingObj.element_id;
      (doorFrame as any).elementType = 'opening';
      (doorFrame as any).openingType = openingType;

      canvas.add(arc);
      canvas.add(doorFrame);
    } else if (openingType === 'window') {
      // Window representation
      const windowRect = new fabric.Rect({
        left: (props.left as number) || 0,
        top: (props.top as number) || 0,
        width: openingGeom ? openingGeom.width_m * geometry.fabric_projection.scale_pixels_per_meter : 60,
        height: 8,
        fill: '#E0F2FE', // Light blue for glass
        stroke: openingColor,
        strokeWidth: 2,
        selectable: false,
        evented: true,
      });

      (windowRect as any).elementId = openingObj.element_id;
      (windowRect as any).elementType = 'opening';
      (windowRect as any).openingType = openingType;

      canvas.add(windowRect);
    }
  }
}

function renderRoomLabels(
  canvas: fabric.Canvas,
  floorProjection: FloorProjection,
  geometry: BlenderGeometryResult
) {
  for (const room of geometry.rooms.filter(r => r.floor_number === floorProjection.floor_number)) {
    const measurement = geometry.measurements.rooms.find(
      (m) => m.room_id === room.room_id
    );

    if (!measurement) continue;

    // Calculate center position
    const centerX = room.centroid.x * geometry.fabric_projection.scale_pixels_per_meter;
    const centerY = room.centroid.y * geometry.fabric_projection.scale_pixels_per_meter;

    // Room name label
    const nameLabel = new fabric.Text(room.room_name || room.room_type, {
      left: centerX,
      top: centerY - 10,
      fontSize: 12,
      fontFamily: 'Inter, sans-serif',
      fontWeight: '600',
      fill: '#1F2937',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });

    // Area label
    const areaLabel = new fabric.Text(formatArea(measurement.area_sqm), {
      left: centerX,
      top: centerY + 8,
      fontSize: 10,
      fontFamily: 'Inter, sans-serif',
      fill: '#6B7280',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });

    canvas.add(nameLabel);
    canvas.add(areaLabel);
  }
}

function renderDimensions(canvas: fabric.Canvas, geometry: BlenderGeometryResult) {
  const scale = geometry.fabric_projection.scale_pixels_per_meter;

  // Render external dimensions
  for (const wall of geometry.walls.filter((w) => w.wall_type === 'external')) {
    const dx = wall.end_point.x - wall.start_point.x;
    const dy = wall.end_point.y - wall.start_point.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 1) continue; // Skip very short walls

    const midX = ((wall.start_point.x + wall.end_point.x) / 2) * scale;
    const midY = ((wall.start_point.y + wall.end_point.y) / 2) * scale;

    // Offset dimension line outside the building
    const offset = 30;
    const angle = Math.atan2(dy, dx);
    const perpX = -Math.sin(angle) * offset;
    const perpY = Math.cos(angle) * offset;

    const dimensionLabel = new fabric.Text(formatDimension(length), {
      left: midX + perpX,
      top: midY + perpY,
      fontSize: 9,
      fontFamily: 'Inter, sans-serif',
      fill: '#4B5563',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      angle: (angle * 180) / Math.PI,
    });

    canvas.add(dimensionLabel);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getRoomColor, formatArea, formatDimension };
