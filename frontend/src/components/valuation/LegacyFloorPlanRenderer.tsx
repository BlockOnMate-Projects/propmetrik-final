/**
 * Legacy Floor Plan Renderer
 * 
 * Fallback component for rendering legacy Fabric.js canvas when Blender geometry
 * is unavailable. Provides read-only display of existing floor plans during migration.
 * 
 * @module components/valuation/LegacyFloorPlanRenderer
 * @version 1.0.0
 * @since Phase 5 - Week 15
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Move,
  Maximize,
  Info,
  Clock,
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
  /** Canvas JSON data from database */
  canvasJson: LegacyCanvasData | null;
  /** Floor plan ID for reference */
  floorPlanId?: string;
  /** Whether migration is in progress */
  migrationPending?: boolean;
  /** Callback when user requests migration */
  onRequestMigration?: () => void;
  /** Width of canvas container */
  width?: number;
  /** Height of canvas container */
  height?: number;
  /** Show migration banner */
  showMigrationBanner?: boolean;
}

interface RoomSummary {
  name: string;
  type: string;
  area: number;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: '#f5f5f5',
      selection: false,
      renderOnAddRemove: true,
    });

    fabricCanvasRef.current = canvas;

    // Disable all interactions (read-only)
    canvas.forEachObject((obj: fabric.Object) => {
      obj.set({
        selectable: false,
        evented: false,
      });
    });

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [width, height]);

  // Load canvas data
  useEffect(() => {
    if (!fabricCanvasRef.current || !canvasJson) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const canvas = fabricCanvasRef.current;

      // Extract objects from various formats
      let objects: any[] = [];
      if (canvasJson.canvasData?.objects) {
        objects = canvasJson.canvasData.objects;
      } else if (canvasJson.objects) {
        objects = canvasJson.objects;
      }

      if (objects.length === 0) {
        setError('No floor plan data found');
        setIsLoading(false);
        return;
      }

      // Clear existing objects
      canvas.clear();

      // Add background color
      canvas.setBackgroundColor('#f9fafb', () => {});

      // Load objects
      fabric.util.enlivenObjects(objects, (enlivenedObjects: fabric.Object[]) => {
        const extractedRooms: RoomSummary[] = [];

        for (const obj of enlivenedObjects) {
          // Make all objects read-only
          obj.set({
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            lockMovementX: true,
            lockMovementY: true,
          });

          // Extract room information
          const roomData = (obj as any);
          if (roomData.isRoom || roomData.roomType) {
            extractedRooms.push({
              name: roomData.name || 'Unknown',
              type: roomData.roomType || 'other',
              area: calculateObjectArea(obj),
            });
          }

          canvas.add(obj);
        }

        setRooms(extractedRooms);

        // Fit canvas to content
        fitToContent();

        setIsLoading(false);
      }, 'fabric');

    } catch (err: any) {
      console.error('Error loading legacy canvas:', err);
      setError(`Failed to load floor plan: ${err.message}`);
      setIsLoading(false);
    }
  }, [canvasJson]);

  // Calculate approximate area of an object
  const calculateObjectArea = (obj: fabric.Object): number => {
    const scaleX = obj.scaleX || 1;
    const scaleY = obj.scaleY || 1;
    const width = (obj.width || 0) * scaleX;
    const height = (obj.height || 0) * scaleY;
    // Convert from pixels to sqm (assuming ~50px per meter)
    return Math.round((width * height) / (50 * 50) * 100) / 100;
  };

  // Fit canvas to show all content
  const fitToContent = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();
    if (objects.length === 0) return;

    // Get bounding rect of all objects
    const group = new fabric.Group(objects.map(o => fabric.util.object.clone(o)));
    const boundingRect = group.getBoundingRect();

    // Calculate scale to fit
    const scaleX = (width - 40) / boundingRect.width;
    const scaleY = (height - 40) / boundingRect.height;
    const scale = Math.min(scaleX, scaleY, 2);

    // Center content
    const viewportTransform = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    viewportTransform[0] = scale;
    viewportTransform[3] = scale;
    viewportTransform[4] = (width - boundingRect.width * scale) / 2 - boundingRect.left * scale;
    viewportTransform[5] = (height - boundingRect.height * scale) / 2 - boundingRect.top * scale;

    canvas.setViewportTransform(viewportTransform);
    setZoom(scale);
  }, [width, height]);

  // Zoom handlers
  const handleZoomIn = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const newZoom = Math.min(zoom * 1.2, 4);
    canvas.setZoom(newZoom);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const newZoom = Math.max(zoom / 1.2, 0.25);
    canvas.setZoom(newZoom);
    setZoom(newZoom);
  };

  const handleResetView = () => {
    fitToContent();
  };

  // Render loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading floor plan...</span>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error || !canvasJson) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error || 'No floor plan data available'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Floor Plan</CardTitle>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Legacy
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleResetView} title="Reset View">
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Migration Banner */}
        {showMigrationBanner && (
          <Alert className="mx-4 mb-2 border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 text-sm">Legacy Floor Plan</AlertTitle>
            <AlertDescription className="text-amber-700 text-xs">
              This floor plan uses the legacy format. 
              {migrationPending ? (
                <span> Migration is in progress...</span>
              ) : onRequestMigration ? (
                <Button 
                  variant="link" 
                  className="h-auto p-0 text-xs text-amber-800 underline ml-1"
                  onClick={onRequestMigration}
                >
                  Click to upgrade to the new system.
                </Button>
              ) : (
                <span> It will be automatically upgraded soon.</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Canvas Container */}
        <div 
          ref={containerRef}
          className="relative border-t"
          style={{ width, height }}
        >
          <canvas ref={canvasRef} />

          {/* Read-only indicator */}
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            Read-only view
          </div>
        </div>

        {/* Room Summary */}
        {rooms.length > 0 && (
          <div className="p-4 border-t bg-muted/50">
            <h4 className="text-sm font-medium mb-2">Rooms Detected</h4>
            <div className="flex flex-wrap gap-2">
              {rooms.map((room, index) => (
                <Badge 
                  key={index} 
                  variant="secondary"
                  className="text-xs"
                >
                  {room.name}: ~{room.area} sqm
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Total: ~{rooms.reduce((sum, r) => sum + r.area, 0).toFixed(1)} sqm
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// WRAPPER COMPONENT WITH FEATURE FLAG CHECK
// ============================================================================

export interface FloorPlanRendererProps extends Omit<LegacyFloorPlanRendererProps, 'canvasJson'> {
  /** Blender geometry (if available) */
  blenderGeometry?: any;
  /** Legacy canvas data */
  legacyCanvasJson?: LegacyCanvasData | null;
  /** Use V2 renderer flag */
  useV2?: boolean;
}

/**
 * Smart floor plan renderer that chooses between V2 and legacy based on data availability
 */
export function FloorPlanRenderer({
  blenderGeometry,
  legacyCanvasJson,
  useV2 = false,
  ...props
}: FloorPlanRendererProps) {
  // If V2 is enabled and we have Blender geometry, use the new renderer
  if (useV2 && blenderGeometry) {
    // Import dynamically to avoid circular dependency
    const BlenderGeometryRenderer = React.lazy(() => 
      import('./BlenderGeometryRenderer')
    );

    return (
      <React.Suspense fallback={<div>Loading...</div>}>
        <BlenderGeometryRenderer geometry={blenderGeometry} {...props} />
      </React.Suspense>
    );
  }

  // Otherwise fall back to legacy renderer
  return (
    <LegacyFloorPlanRenderer
      canvasJson={legacyCanvasJson || null}
      showMigrationBanner={useV2 && !blenderGeometry}
      {...props}
    />
  );
}
