'use client';

/**
 * Legacy Floor Plan Renderer — Konva Edition
 *
 * Renders saved floor plan JSON data (originally from Fabric.js canvas) using Konva.
 * Parses legacy Fabric JSON objects and renders equivalent Konva shapes.
 * READ-ONLY display for migration bridging.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Line, Text, Circle, Group } from 'react-konva';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle, ZoomIn, ZoomOut, Maximize, Info, Clock,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface LegacyCanvasData {
  canvasData?: {
    objects: any[];
    background?: string;
    version?: string;
  };
  objects?: any[];
  version?: string;
}

export interface LegacyFloorPlanRendererProps {
  canvasJson: LegacyCanvasData | null;
  floorPlanId?: string;
  migrationPending?: boolean;
  onRequestMigration?: () => void;
  width?: number;
  height?: number;
  showMigrationBanner?: boolean;
}

export interface RoomSummary {
  name: string;
  type: string;
  area: number;
}

// ============================================================================
// HELPERS — Parse Fabric JSON objects into renderable shapes
// ============================================================================

interface ParsedShape {
  id: string;
  type: 'rect' | 'polygon' | 'line' | 'text' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: number[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  radius?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  isRoom?: boolean;
  roomType?: string;
  roomName?: string;
}

function parseFabricObjects(objects: any[]): { shapes: ParsedShape[]; rooms: RoomSummary[] } {
  const shapes: ParsedShape[] = [];
  const rooms: RoomSummary[] = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const base = {
      id: `legacy_${i}`,
      x: obj.left || 0,
      y: obj.top || 0,
      fill: obj.fill || undefined,
      stroke: obj.stroke || undefined,
      strokeWidth: obj.strokeWidth || 1,
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      opacity: obj.opacity ?? 1,
      isRoom: obj.isRoom || !!obj.roomType,
      roomType: obj.roomType || undefined,
      roomName: obj.name || undefined,
    };

    const type = obj.type?.toLowerCase() || '';

    if (type === 'rect') {
      const w = (obj.width || 0) * (obj.scaleX || 1);
      const h = (obj.height || 0) * (obj.scaleY || 1);
      shapes.push({ ...base, type: 'rect', width: w, height: h });
      if (base.isRoom) {
        rooms.push({ name: base.roomName || 'Unknown', type: base.roomType || 'other', area: Math.round((w * h) / (50 * 50) * 100) / 100 });
      }
    } else if (type === 'polygon' && obj.points) {
      const pts = (obj.points as { x: number; y: number }[]).flatMap(p => [p.x + base.x, p.y + base.y]);
      shapes.push({ ...base, type: 'polygon', points: pts });
      if (base.isRoom) {
        // Shoelace area
        let area = 0;
        const p = obj.points as { x: number; y: number }[];
        for (let j = 0; j < p.length; j++) {
          const k = (j + 1) % p.length;
          area += p[j].x * p[k].y - p[k].x * p[j].y;
        }
        area = Math.abs(area) / 2 / (50 * 50);
        rooms.push({ name: base.roomName || 'Unknown', type: base.roomType || 'other', area: Math.round(area * 100) / 100 });
      }
    } else if (type === 'line') {
      const x1 = obj.x1 || 0;
      const y1 = obj.y1 || 0;
      const x2 = obj.x2 || 0;
      const y2 = obj.y2 || 0;
      shapes.push({ ...base, type: 'line', points: [x1 + base.x, y1 + base.y, x2 + base.x, y2 + base.y] });
    } else if (type === 'text' || type === 'i-text' || type === 'textbox') {
      shapes.push({ ...base, type: 'text', text: obj.text || '', fontSize: obj.fontSize || 14, fontFamily: obj.fontFamily || 'Arial' });
    } else if (type === 'circle') {
      shapes.push({ ...base, type: 'circle', radius: (obj.radius || 10) * (obj.scaleX || 1) });
    } else if (type === 'group' && obj.objects) {
      // Recursively parse group children, offset by group position
      const nested = parseFabricObjects(obj.objects.map((child: any) => ({
        ...child,
        left: (child.left || 0) + base.x,
        top: (child.top || 0) + base.y,
      })));
      shapes.push(...nested.shapes);
      rooms.push(...nested.rooms);
    }
  }

  return { shapes, rooms };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function LegacyFloorPlanRenderer({
  canvasJson,
  floorPlanId,
  migrationPending = false,
  onRequestMigration,
  width = 800,
  height = 600,
  showMigrationBanner = true,
}: LegacyFloorPlanRendererProps) {
  const [zoom, setZoom] = useState(1);

  // Parse objects
  const { shapes, rooms } = useMemo(() => {
    if (!canvasJson) return { shapes: [], rooms: [] };
    let objects: any[] = [];
    if (canvasJson.canvasData?.objects) objects = canvasJson.canvasData.objects;
    else if (canvasJson.objects) objects = canvasJson.objects;
    if (objects.length === 0) return { shapes: [], rooms: [] };
    return parseFabricObjects(objects);
  }, [canvasJson]);

  // Auto-fit: compute bounding rect of all shapes
  const fitScale = useMemo(() => {
    if (shapes.length === 0) return 1;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of shapes) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      if (s.type === 'rect') {
        maxX = Math.max(maxX, s.x + (s.width || 0));
        maxY = Math.max(maxY, s.y + (s.height || 0));
      } else if (s.points) {
        for (let j = 0; j < s.points.length; j += 2) {
          maxX = Math.max(maxX, s.points[j]);
          maxY = Math.max(maxY, s.points[j + 1]);
        }
      } else {
        maxX = Math.max(maxX, s.x + 50);
        maxY = Math.max(maxY, s.y + 20);
      }
    }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return 1;
    return Math.min((width - 40) / contentW, (height - 40) / contentH, 2);
  }, [shapes, width, height]);

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.25));
  const handleResetView = () => setZoom(fitScale);

  // Error / empty states
  if (!canvasJson) {
    return (
      <Card><CardContent className="flex items-center justify-center h-96">
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>No floor plan data available</AlertDescription></Alert>
      </CardContent></Card>
    );
  }

  if (shapes.length === 0) {
    return (
      <Card><CardContent className="flex items-center justify-center h-96">
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>No floor plan data found</AlertDescription></Alert>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Floor Plan</CardTitle>
            <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" />Legacy</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out"><ZoomOut className="h-4 w-4" /></Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In"><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={handleResetView} title="Reset View"><Maximize className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {showMigrationBanner && (
          <Alert className="mx-4 mb-2 border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 text-sm">Legacy Floor Plan</AlertTitle>
            <AlertDescription className="text-amber-700 text-xs">
              This floor plan uses the legacy format.
              {migrationPending ? (
                <span> Migration is in progress...</span>
              ) : onRequestMigration ? (
                <Button variant="link" className="h-auto p-0 text-xs text-amber-800 underline ml-1" onClick={onRequestMigration}>
                  Click to upgrade to the new system.
                </Button>
              ) : (
                <span> It will be automatically upgraded soon.</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="relative border-t" style={{ width, height }}>
          <Stage width={width} height={height} scaleX={zoom} scaleY={zoom}>
            <Layer listening={false}>
              <Rect x={0} y={0} width={width} height={height} fill="#f9fafb" />
            </Layer>
            <Layer listening={false}>
              {shapes.map(shape => {
                if (shape.type === 'rect') {
                  return (
                    <Rect key={shape.id} x={shape.x} y={shape.y} width={shape.width} height={shape.height}
                      fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
                  );
                }
                if (shape.type === 'polygon' && shape.points) {
                  return (
                    <Line key={shape.id} points={shape.points} closed fill={shape.fill}
                      stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
                  );
                }
                if (shape.type === 'line' && shape.points) {
                  return (
                    <Line key={shape.id} points={shape.points} stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
                  );
                }
                if (shape.type === 'text') {
                  return (
                    <Text key={shape.id} x={shape.x} y={shape.y} text={shape.text || ''}
                      fontSize={shape.fontSize} fontFamily={shape.fontFamily} fill={shape.fill} opacity={shape.opacity} />
                  );
                }
                if (shape.type === 'circle') {
                  return (
                    <Circle key={shape.id} x={shape.x} y={shape.y} radius={shape.radius || 10}
                      fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} opacity={shape.opacity} />
                  );
                }
                return null;
              })}
            </Layer>
          </Stage>
          <div className="absolute top-2 left-2 bg-background/50 text-foreground text-xs px-2 py-1 rounded">Read-only view</div>
        </div>

        {rooms.length > 0 && (
          <div className="p-4 border-t bg-muted/50">
            <h4 className="text-sm font-medium mb-2">Rooms Detected</h4>
            <div className="flex flex-wrap gap-2">
              {rooms.map((room, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{room.name}: ~{room.area} sqm</Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Total: ~{rooms.reduce((sum, r) => sum + r.area, 0).toFixed(1)} sqm</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// WRAPPER — Smart renderer choosing V2 vs legacy
// ============================================================================

export interface FloorPlanRendererProps extends Omit<LegacyFloorPlanRendererProps, 'canvasJson'> {
  blenderGeometry?: any;
  legacyCanvasJson?: LegacyCanvasData | null;
  useV2?: boolean;
}

export function FloorPlanRenderer({
  blenderGeometry,
  legacyCanvasJson,
  useV2 = false,
  ...props
}: FloorPlanRendererProps) {
  if (useV2 && blenderGeometry) {
    const BlenderGeometryRenderer = React.lazy(() => import('./KonvaBlenderGeometryRenderer'));
    return (
      <React.Suspense fallback={<div>Loading...</div>}>
        <BlenderGeometryRenderer geometry={blenderGeometry} {...props} />
      </React.Suspense>
    );
  }

  return (
    <LegacyFloorPlanRenderer
      canvasJson={legacyCanvasJson || null}
      showMigrationBanner={useV2 && !blenderGeometry}
      {...props}
    />
  );
}
