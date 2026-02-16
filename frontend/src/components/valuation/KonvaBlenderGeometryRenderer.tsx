'use client';

/**
 * Blender Geometry Renderer — Konva Edition
 *
 * Renders Blender-generated floor plan geometry using Konva + react-konva.
 * READ-ONLY renderer — adjustments go through ConstrainedFloorPlanBuilder.
 */

import React, { useRef, useState, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Line, Circle, Text, Arc, Group } from 'react-konva';
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

type ExtendedRoomType = RoomType | 'master_bedroom' | 'entrance' | 'utility' | 'terrace' | 'staircase' | 'other' | 'porch';

const ROOM_COLORS: Record<ExtendedRoomType | string, string> = {
  living: '#FEF3C7',
  dining: '#FDE68A',
  kitchen: '#FCD34D',
  bedroom: '#DBEAFE',
  master_bedroom: '#BFDBFE',
  bathroom: '#D1FAE5',
  toilet: '#A7F3D0',
  corridor: '#F3F4F6',
  storage: '#E5E7EB',
  entrance: '#EDE9FE',
  garage: '#D1D5DB',
  balcony: '#CFFAFE',
  terrace: '#A5F3FC',
  office: '#FCE7F3',
  laundry: '#E0E7FF',
  utility: '#F5F5F4',
  staircase: '#FEE2E2',
  porch: '#FEF9C3',
  other: '#F9FAFB',
};

const WALL_COLORS: Record<string, string> = {
  external: '#374151',
  internal: '#6B7280',
  partition: '#9CA3AF',
};

const OPENING_COLORS: Record<string, string> = {
  door: '#92400E',
  window: '#0891B2',
  archway: '#7C3AED',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getRoomColor(roomType: RoomType | string): string {
  return ROOM_COLORS[roomType] || ROOM_COLORS.other;
}

export function formatArea(areaSqm: number): string {
  return `${areaSqm.toFixed(1)} m²`;
}

export function formatDimension(meters: number): string {
  return `${meters.toFixed(2)}m`;
}

// ============================================================================
// COMPONENT
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
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

  const canvasWidth = geometry.fabric_projection.canvas_width;
  const canvasHeight = geometry.fabric_projection.canvas_height;
  const scale = geometry.fabric_projection.scale_pixels_per_meter;

  const floorProjection = geometry.fabric_projection.floor_projections.find(
    (fp) => fp.floor_number === floorNumber
  );

  // Handle element click
  const handleElementClick = useCallback((elementId: string, elementType: string) => {
    setSelectedElement(elementId);
    onElementSelect?.(elementId, elementType);
  }, [onElementSelect]);

  // ========================== GRID ==========================
  const gridLines = useMemo(() => {
    const lines: { points: number[]; stroke: string; strokeWidth: number }[] = [];
    const minorSpacing = scale / 10;
    for (let x = 0; x < canvasWidth; x += minorSpacing) {
      lines.push({ points: [x, 0, x, canvasHeight], stroke: '#F3F4F6', strokeWidth: 0.5 });
    }
    for (let y = 0; y < canvasHeight; y += minorSpacing) {
      lines.push({ points: [0, y, canvasWidth, y], stroke: '#F3F4F6', strokeWidth: 0.5 });
    }
    for (let x = 0; x < canvasWidth; x += scale) {
      lines.push({ points: [x, 0, x, canvasHeight], stroke: '#E5E7EB', strokeWidth: 1 });
    }
    for (let y = 0; y < canvasHeight; y += scale) {
      lines.push({ points: [0, y, canvasWidth, y], stroke: '#E5E7EB', strokeWidth: 1 });
    }
    return lines;
  }, [canvasWidth, canvasHeight, scale]);

  // ========================== ROOMS ==========================
  const roomElements = useMemo(() => {
    if (!floorProjection) return [];
    return floorProjection.objects
      .filter(obj => obj.element_type === 'room')
      .map(obj => {
        const roomGeom = geometry.rooms.find(r => r.room_id === obj.element_id);
        const roomType = roomGeom?.room_type || 'other';
        const props = obj.fabric_properties;
        const isHighlighted = highlightedElements.includes(obj.element_id);
        const isSelected = selectedElement === obj.element_id;
        const strokeColor = isSelected ? '#2563EB' : isHighlighted ? '#F59E0B' : '#9CA3AF';
        const strokeWidth = isSelected || isHighlighted ? 3 : 1;

        return { obj, roomType, props, strokeColor, strokeWidth };
      });
  }, [floorProjection, geometry.rooms, highlightedElements, selectedElement]);

  // ========================== WALLS ==========================
  const wallElements = useMemo(() => {
    if (!floorProjection) return [];
    return floorProjection.objects
      .filter(obj => obj.element_type === 'wall')
      .map(obj => {
        const wallGeom = geometry.walls.find(w => w.wall_id === obj.element_id);
        const wallType = wallGeom?.wall_type || 'internal';
        const wallColor = WALL_COLORS[wallType] || WALL_COLORS.internal;
        const props = obj.fabric_properties;
        const isHighlighted = highlightedElements.includes(obj.element_id);
        const isSelected = selectedElement === obj.element_id;
        const strokeColor = isSelected ? '#2563EB' : isHighlighted ? '#F59E0B' : wallColor;
        const strokeWidth = isSelected || isHighlighted ? 3 : (wallGeom ? wallGeom.thickness_mm / 10 : 15);
        return { obj, wallType, props, strokeColor, strokeWidth };
      });
  }, [floorProjection, geometry.walls, highlightedElements, selectedElement]);

  // ========================== OPENINGS ==========================
  const openingElements = useMemo(() => {
    if (!floorProjection) return [];
    return floorProjection.objects
      .filter(obj => obj.element_type === 'opening')
      .map(obj => {
        const openingGeom = geometry.openings.find(o => o.opening_id === obj.element_id);
        const openingType = openingGeom?.opening_type || 'door';
        const openingColor = OPENING_COLORS[openingType] || OPENING_COLORS.door;
        const props = obj.fabric_properties;
        return { obj, openingType, openingColor, openingGeom, props };
      });
  }, [floorProjection, geometry.openings]);

  // ========================== LABELS ==========================
  const roomLabels = useMemo(() => {
    if (!showLabels || !floorProjection) return [];
    return geometry.rooms
      .filter(r => r.floor_number === floorProjection.floor_number)
      .map(room => {
        const measurement = geometry.measurements.rooms.find(m => m.room_id === room.room_id);
        if (!measurement) return null;
        const cx = room.centroid.x * scale;
        const cy = room.centroid.y * scale;
        return { room, measurement, cx, cy };
      })
      .filter(Boolean) as { room: typeof geometry.rooms[0]; measurement: typeof geometry.measurements.rooms[0]; cx: number; cy: number }[];
  }, [showLabels, floorProjection, geometry, scale]);

  // ========================== DIMENSIONS ==========================
  const dimensionLabels = useMemo(() => {
    if (!showDimensions) return [];
    return geometry.walls
      .filter(w => w.wall_type === 'external')
      .map(wall => {
        const dx = wall.end_point.x - wall.start_point.x;
        const dy = wall.end_point.y - wall.start_point.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) return null;

        const midX = ((wall.start_point.x + wall.end_point.x) / 2) * scale;
        const midY = ((wall.start_point.y + wall.end_point.y) / 2) * scale;
        const offset = 30;
        const angle = Math.atan2(dy, dx);
        const perpX = -Math.sin(angle) * offset;
        const perpY = Math.cos(angle) * offset;

        return {
          x: midX + perpX,
          y: midY + perpY,
          text: formatDimension(length),
          rotation: (angle * 180) / Math.PI,
          wallId: wall.wall_id,
        };
      })
      .filter(Boolean) as { x: number; y: number; text: string; rotation: number; wallId: string }[];
  }, [showDimensions, geometry.walls, scale]);

  return (
    <div className={cn('relative', className)}>
      <Stage width={canvasWidth} height={canvasHeight}>
        {/* Grid layer */}
        <Layer listening={false}>
          <Rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#ffffff" />
          {gridLines.map((line, i) => (
            <Line key={i} points={line.points} stroke={line.stroke} strokeWidth={line.strokeWidth} />
          ))}
        </Layer>

        {/* Rooms layer */}
        <Layer>
          {roomElements.map(({ obj, roomType, props, strokeColor, strokeWidth }) => {
            if (obj.type === 'polygon' && props.points) {
              const pts = props.points as { x: number; y: number }[];
              const flatPts = pts.flatMap(p => [p.x, p.y]);
              return (
                <Line
                  key={obj.element_id}
                  points={flatPts}
                  closed
                  fill={getRoomColor(roomType)}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={0.8}
                  onClick={() => handleElementClick(obj.element_id, 'room')}
                  onTap={() => handleElementClick(obj.element_id, 'room')}
                />
              );
            }
            if (obj.type === 'rect') {
              return (
                <Rect
                  key={obj.element_id}
                  x={(props.left as number) || 0}
                  y={(props.top as number) || 0}
                  width={(props.width as number) || 100}
                  height={(props.height as number) || 100}
                  fill={getRoomColor(roomType)}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={0.8}
                  onClick={() => handleElementClick(obj.element_id, 'room')}
                  onTap={() => handleElementClick(obj.element_id, 'room')}
                />
              );
            }
            return null;
          })}
        </Layer>

        {/* Walls layer */}
        <Layer>
          {wallElements.map(({ obj, props, strokeColor, strokeWidth }) => {
            if (obj.type === 'line') {
              return (
                <Line
                  key={obj.element_id}
                  points={[
                    (props.x1 as number) || 0,
                    (props.y1 as number) || 0,
                    (props.x2 as number) || 100,
                    (props.y2 as number) || 0,
                  ]}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  lineCap="round"
                  onClick={() => handleElementClick(obj.element_id, 'wall')}
                  onTap={() => handleElementClick(obj.element_id, 'wall')}
                />
              );
            }
            if (obj.type === 'rect') {
              return (
                <Rect
                  key={obj.element_id}
                  x={(props.left as number) || 0}
                  y={(props.top as number) || 0}
                  width={(props.width as number) || 10}
                  height={(props.height as number) || 100}
                  fill={strokeColor}
                  stroke="#1F2937"
                  strokeWidth={0.5}
                  onClick={() => handleElementClick(obj.element_id, 'wall')}
                  onTap={() => handleElementClick(obj.element_id, 'wall')}
                />
              );
            }
            return null;
          })}
        </Layer>

        {/* Openings layer */}
        <Layer>
          {openingElements.map(({ obj, openingType, openingColor, openingGeom, props }) => {
            const left = (props.left as number) || 0;
            const top = (props.top as number) || 0;

            if (openingType === 'door') {
              const arcRadius = openingGeom ? openingGeom.width_m * scale : 40;
              return (
                <Group key={obj.element_id}>
                  {/* Door swing arc */}
                  <Arc
                    x={left}
                    y={top}
                    innerRadius={0}
                    outerRadius={arcRadius}
                    angle={90}
                    rotation={-90}
                    fill="transparent"
                    stroke={openingColor}
                    strokeWidth={1}
                    dash={[5, 5]}
                    opacity={0.5}
                    listening={false}
                  />
                  {/* Door frame */}
                  <Rect
                    x={left}
                    y={top}
                    width={arcRadius}
                    height={5}
                    fill={openingColor}
                    stroke="#1F2937"
                    strokeWidth={0.5}
                    onClick={() => handleElementClick(obj.element_id, 'opening')}
                    onTap={() => handleElementClick(obj.element_id, 'opening')}
                  />
                </Group>
              );
            }
            if (openingType === 'window') {
              const windowWidth = openingGeom ? openingGeom.width_m * scale : 60;
              return (
                <Rect
                  key={obj.element_id}
                  x={left}
                  y={top}
                  width={windowWidth}
                  height={8}
                  fill="#E0F2FE"
                  stroke={openingColor}
                  strokeWidth={2}
                  onClick={() => handleElementClick(obj.element_id, 'opening')}
                  onTap={() => handleElementClick(obj.element_id, 'opening')}
                />
              );
            }
            return null;
          })}
        </Layer>

        {/* Labels layer */}
        <Layer listening={false}>
          {roomLabels.map(({ room, measurement, cx, cy }) => (
            <React.Fragment key={room.room_id}>
              <Text
                x={cx}
                y={cy - 10}
                text={room.room_name || room.room_type}
                fontSize={12}
                fontFamily="Inter, sans-serif"
                fontStyle="bold"
                fill="#1F2937"
                align="center"
                offsetX={40}
              />
              <Text
                x={cx}
                y={cy + 8}
                text={formatArea(measurement.area_sqm)}
                fontSize={10}
                fontFamily="Inter, sans-serif"
                fill="#6B7280"
                align="center"
                offsetX={25}
              />
            </React.Fragment>
          ))}

          {/* Dimension labels */}
          {dimensionLabels.map((dim) => (
            <Text
              key={dim.wallId}
              x={dim.x}
              y={dim.y}
              text={dim.text}
              fontSize={9}
              fontFamily="Inter, sans-serif"
              fill="#4B5563"
              align="center"
              rotation={dim.rotation}
              offsetX={15}
              offsetY={5}
            />
          ))}
        </Layer>
      </Stage>

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
