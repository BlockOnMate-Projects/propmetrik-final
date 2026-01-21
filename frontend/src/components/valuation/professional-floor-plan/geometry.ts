/**
 * Professional Floor Plan Builder - Geometry Utilities
 * 
 * Mathematical functions for walls, snapping, intersections, and area calculations.
 */

import { Point, Line, Wall, Room, RoomType, SnapPoint, SnapMode, SnapSettings } from './types';
import { SNAP_PRIORITY, SNAP_TOLERANCE, ORTHO_ANGLES, ORTHO_TOLERANCE, WALL_THICKNESS } from './constants';

// =====================================================
// BASIC GEOMETRY
// =====================================================

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate the midpoint between two points
 */
export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Calculate angle between two points (in radians)
 */
export function angle(p1: Point, p2: Point): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Calculate angle in degrees
 */
export function angleDegrees(p1: Point, p2: Point): number {
  return (angle(p1, p2) * 180) / Math.PI;
}

/**
 * Normalize angle to 0-360 range
 */
export function normalizeAngle(degrees: number): number {
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  return degrees;
}

/**
 * Calculate perpendicular distance from point to line
 */
export function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return distance(point, lineStart);
  
  let param = dot / lenSq;
  param = Math.max(0, Math.min(1, param));

  const nearestX = lineStart.x + param * C;
  const nearestY = lineStart.y + param * D;

  return distance(point, { x: nearestX, y: nearestY });
}

/**
 * Get the nearest point on a line segment to a given point
 */
export function nearestPointOnLine(point: Point, lineStart: Point, lineEnd: Point): Point {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return lineStart;
  
  let param = dot / lenSq;
  param = Math.max(0, Math.min(1, param));

  return {
    x: lineStart.x + param * C,
    y: lineStart.y + param * D,
  };
}

/**
 * Check if two line segments intersect and return intersection point
 */
export function lineIntersection(
  line1Start: Point,
  line1End: Point,
  line2Start: Point,
  line2End: Point
): Point | null {
  const x1 = line1Start.x, y1 = line1Start.y;
  const x2 = line1End.x, y2 = line1End.y;
  const x3 = line2Start.x, y3 = line2Start.y;
  const x4 = line2End.x, y4 = line2End.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  if (Math.abs(denom) < 0.0001) return null; // Lines are parallel

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  return null;
}

/**
 * Extend a line to a given length from start point
 */
export function extendLine(start: Point, end: Point, newLength: number): Point {
  const len = distance(start, end);
  if (len === 0) return end;
  
  const ratio = newLength / len;
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

// =====================================================
// ORTHO MODE (90° ANGLES)
// =====================================================

/**
 * Snap angle to nearest orthogonal direction if within tolerance
 */
export function snapToOrtho(startPoint: Point, currentPoint: Point, enabled: boolean): Point {
  if (!enabled) return currentPoint;

  const currentAngle = normalizeAngle(angleDegrees(startPoint, currentPoint));
  const dist = distance(startPoint, currentPoint);

  for (const orthoAngle of ORTHO_ANGLES) {
    if (Math.abs(currentAngle - orthoAngle) <= ORTHO_TOLERANCE ||
        Math.abs(currentAngle - orthoAngle - 360) <= ORTHO_TOLERANCE ||
        Math.abs(currentAngle - orthoAngle + 360) <= ORTHO_TOLERANCE) {
      const radians = (orthoAngle * Math.PI) / 180;
      return {
        x: startPoint.x + Math.cos(radians) * dist,
        y: startPoint.y + Math.sin(radians) * dist,
      };
    }
  }

  // If not near an ortho angle, snap to nearest
  let nearestAngle = ORTHO_ANGLES[0];
  let minDiff = 360;
  
  for (const orthoAngle of ORTHO_ANGLES) {
    const diff = Math.min(
      Math.abs(currentAngle - orthoAngle),
      Math.abs(currentAngle - orthoAngle - 360),
      Math.abs(currentAngle - orthoAngle + 360)
    );
    if (diff < minDiff) {
      minDiff = diff;
      nearestAngle = orthoAngle;
    }
  }

  const radians = (nearestAngle * Math.PI) / 180;
  return {
    x: startPoint.x + Math.cos(radians) * dist,
    y: startPoint.y + Math.sin(radians) * dist,
  };
}

// =====================================================
// GRID SNAPPING
// =====================================================

/**
 * Snap a point to the nearest grid intersection
 */
export function snapToGrid(point: Point, gridSize: number, scale: number): Point {
  const gridSpacing = (gridSize / 100) * scale; // Convert cm to pixels
  return {
    x: Math.round(point.x / gridSpacing) * gridSpacing,
    y: Math.round(point.y / gridSpacing) * gridSpacing,
  };
}

// =====================================================
// ADVANCED SNAPPING
// =====================================================

/**
 * Find all snap points near a given point
 */
export function findSnapPoints(
  point: Point,
  walls: Wall[],
  settings: SnapSettings,
  scale: number
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  const tolerance = SNAP_TOLERANCE;

  if (!settings.enabled) return [];

  // Grid snap
  if (settings.modes.includes('grid')) {
    const gridPoint = snapToGrid(point, settings.gridSize, scale);
    if (distance(point, gridPoint) <= tolerance) {
      snapPoints.push({
        point: gridPoint,
        type: 'grid',
        priority: SNAP_PRIORITY.grid,
      });
    }
  }

  // Wall-based snapping
  for (const wall of walls) {
    // Endpoint snapping
    if (settings.modes.includes('endpoint')) {
      if (distance(point, wall.start) <= tolerance) {
        snapPoints.push({
          point: wall.start,
          type: 'endpoint',
          sourceObjectId: wall.id,
          priority: SNAP_PRIORITY.endpoint,
        });
      }
      if (distance(point, wall.end) <= tolerance) {
        snapPoints.push({
          point: wall.end,
          type: 'endpoint',
          sourceObjectId: wall.id,
          priority: SNAP_PRIORITY.endpoint,
        });
      }
    }

    // Midpoint snapping
    if (settings.modes.includes('midpoint')) {
      const mid = midpoint(wall.start, wall.end);
      if (distance(point, mid) <= tolerance) {
        snapPoints.push({
          point: mid,
          type: 'midpoint',
          sourceObjectId: wall.id,
          priority: SNAP_PRIORITY.midpoint,
        });
      }
    }

    // Nearest point on wall
    if (settings.modes.includes('nearest')) {
      const nearest = nearestPointOnLine(point, wall.start, wall.end);
      if (distance(point, nearest) <= tolerance) {
        snapPoints.push({
          point: nearest,
          type: 'nearest',
          sourceObjectId: wall.id,
          priority: SNAP_PRIORITY.nearest,
        });
      }
    }
  }

  // Intersection snapping
  if (settings.modes.includes('intersection')) {
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const intersection = lineIntersection(
          walls[i].start, walls[i].end,
          walls[j].start, walls[j].end
        );
        if (intersection && distance(point, intersection) <= tolerance) {
          snapPoints.push({
            point: intersection,
            type: 'intersection',
            sourceObjectId: `${walls[i].id}:${walls[j].id}`,
            priority: SNAP_PRIORITY.intersection,
          });
        }
      }
    }
  }

  // Sort by priority (highest first)
  snapPoints.sort((a, b) => b.priority - a.priority);

  return snapPoints;
}

/**
 * Get the best snap point from a list
 */
export function getBestSnapPoint(snapPoints: SnapPoint[]): SnapPoint | null {
  if (snapPoints.length === 0) return null;
  return snapPoints[0]; // Already sorted by priority
}

/**
 * Find perpendicular snap from a point relative to a wall
 */
export function findPerpendicularSnap(
  point: Point,
  fromPoint: Point,
  walls: Wall[],
  tolerance: number
): SnapPoint | null {
  for (const wall of walls) {
    // Get wall angle
    const wallAngle = angle(wall.start, wall.end);
    
    // Perpendicular angles
    const perpAngles = [
      wallAngle + Math.PI / 2,
      wallAngle - Math.PI / 2,
    ];

    // Check if current drawing direction is perpendicular to this wall
    const currentAngle = angle(fromPoint, point);
    
    for (const perpAngle of perpAngles) {
      const angleDiff = Math.abs(normalizeAngle((currentAngle - perpAngle) * 180 / Math.PI));
      if (angleDiff <= 5 || Math.abs(angleDiff - 360) <= 5) {
        // Project point onto perpendicular line
        const dist = distance(fromPoint, point);
        const snappedPoint = {
          x: fromPoint.x + Math.cos(perpAngle) * dist,
          y: fromPoint.y + Math.sin(perpAngle) * dist,
        };
        
        return {
          point: snappedPoint,
          type: 'perpendicular',
          sourceObjectId: wall.id,
          priority: SNAP_PRIORITY.perpendicular,
        };
      }
    }
  }
  
  return null;
}

// =====================================================
// POLYGON & AREA CALCULATIONS
// =====================================================

/**
 * Calculate the area of a polygon using the shoelace formula
 */
export function calculatePolygonArea(points: Point[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * Calculate the centroid of a polygon
 */
export function calculateCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };

  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }

  return {
    x: cx / points.length,
    y: cy / points.length,
  };
}

/**
 * Calculate the perimeter of a polygon
 */
export function calculatePerimeter(points: Point[]): number {
  if (points.length < 2) return 0;

  let perimeter = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perimeter += distance(points[i], points[j]);
  }

  return perimeter;
}

/**
 * Check if a point is inside a polygon
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Get bounding box dimensions
 */
export function getBoundingBox(points: Point[]): { 
  minX: number; 
  minY: number; 
  maxX: number; 
  maxY: number;
  width: number;
  height: number;
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// =====================================================
// WALL-SPECIFIC GEOMETRY
// =====================================================

/**
 * Get the four corner points of a wall (accounting for thickness)
 */
export function getWallPolygon(wall: Wall, scale: number): Point[] {
  const thicknessPixels = wall.thickness * scale;
  const halfThickness = thicknessPixels / 2;
  
  // Calculate perpendicular offset
  const wallAngle = angle(wall.start, wall.end);
  const perpAngle = wallAngle + Math.PI / 2;
  
  const offsetX = Math.cos(perpAngle) * halfThickness;
  const offsetY = Math.sin(perpAngle) * halfThickness;

  return [
    { x: wall.start.x + offsetX, y: wall.start.y + offsetY },
    { x: wall.end.x + offsetX, y: wall.end.y + offsetY },
    { x: wall.end.x - offsetX, y: wall.end.y - offsetY },
    { x: wall.start.x - offsetX, y: wall.start.y - offsetY },
  ];
}

/**
 * Calculate wall length in meters
 */
export function getWallLength(wall: Wall, scale: number): number {
  return distance(wall.start, wall.end) / scale;
}

/**
 * Find walls connected at a point
 */
export function findConnectedWalls(point: Point, walls: Wall[], tolerance: number = 5): Wall[] {
  return walls.filter(wall => 
    distance(point, wall.start) <= tolerance || 
    distance(point, wall.end) <= tolerance
  );
}

/**
 * Calculate proper wall join at intersection
 */
export function calculateWallJoin(wall1: Wall, wall2: Wall, scale: number): Point[] {
  // This returns the miter join points for clean wall intersections
  const intersection = lineIntersection(wall1.start, wall1.end, wall2.start, wall2.end);
  if (!intersection) return [];

  const angle1 = angle(wall1.start, wall1.end);
  const angle2 = angle(wall2.start, wall2.end);
  
  const halfThick1 = (wall1.thickness * scale) / 2;
  const halfThick2 = (wall2.thickness * scale) / 2;
  
  // Calculate miter angle
  const miterAngle = (angle1 + angle2) / 2;
  const miterLength = halfThick1 / Math.cos((angle1 - angle2) / 2);
  
  return [
    {
      x: intersection.x + Math.cos(miterAngle + Math.PI / 2) * miterLength,
      y: intersection.y + Math.sin(miterAngle + Math.PI / 2) * miterLength,
    },
    {
      x: intersection.x - Math.cos(miterAngle + Math.PI / 2) * miterLength,
      y: intersection.y - Math.sin(miterAngle + Math.PI / 2) * miterLength,
    },
  ];
}

// =====================================================
// ROOM DETECTION FROM WALLS (Improved Algorithm)
// =====================================================

/**
 * Detect enclosed rooms from a set of walls using flood fill and polygon containment
 * This replaces the DFS-based approach with a more robust algorithm
 */
export function detectRoomsFromWalls(walls: Wall[], scale: number): Point[][] {
  if (walls.length < 3) return [];

  // Get bounding box of all walls
  const allPoints: Point[] = [];
  for (const wall of walls) {
    allPoints.push(wall.start, wall.end);
  }
  const bounds = getBoundingBox(allPoints);
  
  // Add padding
  const padding = 50;
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;
  const maxX = bounds.maxX + padding;
  const maxY = bounds.maxY + padding;
  
  // Grid resolution for flood fill
  const cellSize = 10; // pixels
  const gridWidth = Math.ceil((maxX - minX) / cellSize);
  const gridHeight = Math.ceil((maxY - minY) / cellSize);
  
  if (gridWidth <= 0 || gridHeight <= 0 || gridWidth > 500 || gridHeight > 500) {
    return fallbackRoomDetection(walls, scale);
  }
  
  // Create wall occupancy grid
  const wallGrid = new Set<string>();
  for (const wall of walls) {
    const polygon = getWallPolygon(wall, scale);
    fillPolygonInGrid(polygon, minX, minY, cellSize, wallGrid);
  }
  
  // Find enclosed regions using flood fill
  const visited = new Set<string>();
  const regions: Point[][][] = [];
  
  for (let gx = 0; gx < gridWidth; gx++) {
    for (let gy = 0; gy < gridHeight; gy++) {
      const key = `${gx},${gy}`;
      if (visited.has(key) || wallGrid.has(key)) continue;
      
      // Flood fill from this cell
      const region = floodFillRegion(gx, gy, gridWidth, gridHeight, wallGrid, visited);
      if (region.length > 0) {
        // Convert grid cells to polygon
        const polygon = gridRegionToPolygon(region, minX, minY, cellSize);
        if (polygon.length >= 4) {
          regions.push([polygon]);
        }
      }
    }
  }
  
  // Filter out the outer region (largest area) and very small regions
  const roomPolygons: Point[][] = [];
  let maxArea = 0;
  let maxAreaIndex = -1;
  
  for (let i = 0; i < regions.length; i++) {
    const polygon = regions[i][0];
    const area = Math.abs(calculatePolygonArea(polygon));
    if (area > maxArea) {
      maxArea = area;
      maxAreaIndex = i;
    }
  }
  
  const minRoomArea = (1 * scale) * (1 * scale); // Minimum 1m² room
  
  for (let i = 0; i < regions.length; i++) {
    if (i === maxAreaIndex) continue; // Skip outer region
    const polygon = regions[i][0];
    const area = Math.abs(calculatePolygonArea(polygon));
    if (area >= minRoomArea) {
      roomPolygons.push(simplifyPolygon(polygon));
    }
  }
  
  return roomPolygons.length > 0 ? roomPolygons : fallbackRoomDetection(walls, scale);
}

/**
 * Fallback to simple cycle detection for basic rectangular layouts
 */
function fallbackRoomDetection(walls: Wall[], scale: number): Point[][] {
  // Build a graph of wall connections
  const graph = new Map<string, Set<string>>();
  const pointToKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
  
  // Build adjacency list
  for (const wall of walls) {
    const startKey = pointToKey(wall.start);
    const endKey = pointToKey(wall.end);
    
    if (!graph.has(startKey)) graph.set(startKey, new Set());
    if (!graph.has(endKey)) graph.set(endKey, new Set());
    
    graph.get(startKey)!.add(endKey);
    graph.get(endKey)!.add(startKey);
  }

  // Find all cycles (simplified - finds rectangular rooms)
  const rooms: Point[][] = [];
  const visited = new Set<string>();
  
  // For each potential starting point
  const graphKeys = Array.from(graph.keys());
  for (const startKey of graphKeys) {
    if (visited.has(startKey)) continue;
    
    // Try to find a cycle using DFS
    const cycle = findCycle(graph, startKey, visited);
    if (cycle && cycle.length >= 4) {
      const points = cycle.map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      });
      rooms.push(points);
    }
  }

  return rooms;
}

/**
 * Fill polygon cells in grid
 */
function fillPolygonInGrid(
  polygon: Point[],
  minX: number,
  minY: number,
  cellSize: number,
  grid: Set<string>
): void {
  const bounds = getBoundingBox(polygon);
  const startGX = Math.floor((bounds.minX - minX) / cellSize);
  const endGX = Math.ceil((bounds.maxX - minX) / cellSize);
  const startGY = Math.floor((bounds.minY - minY) / cellSize);
  const endGY = Math.ceil((bounds.maxY - minY) / cellSize);
  
  for (let gx = startGX; gx <= endGX; gx++) {
    for (let gy = startGY; gy <= endGY; gy++) {
      const cellCenter: Point = {
        x: minX + (gx + 0.5) * cellSize,
        y: minY + (gy + 0.5) * cellSize,
      };
      if (pointInPolygon(cellCenter, polygon)) {
        grid.add(`${gx},${gy}`);
      }
    }
  }
}

/**
 * Flood fill to find a contiguous region
 */
function floodFillRegion(
  startX: number,
  startY: number,
  gridWidth: number,
  gridHeight: number,
  wallGrid: Set<string>,
  visited: Set<string>
): { x: number; y: number }[] {
  const region: { x: number; y: number }[] = [];
  const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
  
  // Check if this region touches the boundary (it's the outside)
  let touchesBoundary = false;
  
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;
    
    if (visited.has(key) || wallGrid.has(key)) continue;
    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
      touchesBoundary = true;
      continue;
    }
    
    visited.add(key);
    region.push({ x, y });
    
    // Check if at boundary
    if (x === 0 || x === gridWidth - 1 || y === 0 || y === gridHeight - 1) {
      touchesBoundary = true;
    }
    
    // Add neighbors
    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }
  
  // If region touches boundary, it's the outside
  if (touchesBoundary) return [];
  
  return region;
}

/**
 * Convert grid region to polygon (convex hull)
 */
function gridRegionToPolygon(
  region: { x: number; y: number }[],
  minX: number,
  minY: number,
  cellSize: number
): Point[] {
  if (region.length === 0) return [];
  
  // Get all corner points of grid cells
  const corners: Point[] = [];
  for (const cell of region) {
    corners.push(
      { x: minX + cell.x * cellSize, y: minY + cell.y * cellSize },
      { x: minX + (cell.x + 1) * cellSize, y: minY + cell.y * cellSize },
      { x: minX + (cell.x + 1) * cellSize, y: minY + (cell.y + 1) * cellSize },
      { x: minX + cell.x * cellSize, y: minY + (cell.y + 1) * cellSize }
    );
  }
  
  // Return convex hull
  return convexHull(corners);
}

/**
 * Compute convex hull using Graham scan
 */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  
  // Find lowest y point (and leftmost if tie)
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y < points[start].y || 
        (points[i].y === points[start].y && points[i].x < points[start].x)) {
      start = i;
    }
  }
  
  // Swap to front
  [points[0], points[start]] = [points[start], points[0]];
  const pivot = points[0];
  
  // Sort by polar angle
  const sorted = points.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
    if (angleA !== angleB) return angleA - angleB;
    return distance(pivot, a) - distance(pivot, b);
  });
  
  // Build hull
  const hull: Point[] = [pivot];
  for (const p of sorted) {
    while (hull.length >= 2 && crossProduct(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
      hull.pop();
    }
    hull.push(p);
  }
  
  return hull;
}

/**
 * Cross product for convex hull
 */
function crossProduct(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Simplify polygon by removing collinear points
 */
function simplifyPolygon(points: Point[], tolerance: number = 5): Point[] {
  if (points.length < 4) return points;
  
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    
    // Check if point is collinear
    const cross = Math.abs(crossProduct(prev, curr, next));
    if (cross > tolerance) {
      result.push(curr);
    }
  }
  
  return result.length >= 3 ? result : points;
}

function findCycle(
  graph: Map<string, Set<string>>,
  start: string,
  globalVisited: Set<string>
): string[] | null {
  const path: string[] = [start];
  const pathSet = new Set<string>([start]);
  
  function dfs(current: string, depth: number): string[] | null {
    if (depth > 8) return null; // Limit search depth
    
    const neighbors = graph.get(current);
    if (!neighbors) return null;
    
    const neighborArray = Array.from(neighbors);
    for (const next of neighborArray) {
      if (next === start && depth >= 3) {
        // Found a cycle back to start
        globalVisited.add(current);
        return path;
      }
      
      if (!pathSet.has(next)) {
        path.push(next);
        pathSet.add(next);
        
        const result = dfs(next, depth + 1);
        if (result) {
          globalVisited.add(next);
          return result;
        }
        
        path.pop();
        pathSet.delete(next);
      }
    }
    
    return null;
  }
  
  return dfs(start, 0);
}

// =====================================================
// COORDINATE CONVERSIONS
// =====================================================

/**
 * Convert pixels to meters
 */
export function pixelsToMeters(pixels: number, scale: number): number {
  return pixels / scale;
}

/**
 * Convert meters to pixels
 */
export function metersToPixels(meters: number, scale: number): number {
  return meters * scale;
}

/**
 * Convert area from pixels² to m²
 */
export function pixelAreaToSquareMeters(pixelArea: number, scale: number): number {
  return pixelArea / (scale * scale);
}

/**
 * Format a measurement for display
 */
export function formatMeasurement(meters: number, precision: number = 2): string {
  return `${meters.toFixed(precision)}m`;
}

/**
 * Format area for display
 */
export function formatArea(squareMeters: number, precision: number = 1): string {
  return `${squareMeters.toFixed(precision)}m²`;
}

// =====================================================
// ROOM CREATION UTILITIES
// =====================================================

export interface RoomRectangle {
  topLeft: Point;
  bottomRight: Point;
  roomType: RoomType;
  roomName: string;
}

/**
 * Create walls from a room rectangle
 * Returns 4 walls forming the perimeter of the room
 */
export function createWallsFromRoomRectangle(
  rect: RoomRectangle,
  wallType: 'interior' | 'exterior' = 'interior',
  existingWallIds: string[] = []
): Wall[] {
  const { topLeft, bottomRight } = rect;
  const timestamp = Date.now();
  const thickness = WALL_THICKNESS[wallType];
  
  // Calculate corner points
  const topRight: Point = { x: bottomRight.x, y: topLeft.y };
  const bottomLeft: Point = { x: topLeft.x, y: bottomRight.y };
  
  // Create 4 walls: top, right, bottom, left (clockwise)
  const walls: Wall[] = [
    {
      id: `wall_room_${timestamp}_top`,
      type: wallType,
      start: topLeft,
      end: topRight,
      thickness,
      height: 2.8,
      openings: [],
      connectedWalls: [],
    },
    {
      id: `wall_room_${timestamp}_right`,
      type: wallType,
      start: topRight,
      end: bottomRight,
      thickness,
      height: 2.8,
      openings: [],
      connectedWalls: [],
    },
    {
      id: `wall_room_${timestamp}_bottom`,
      type: wallType,
      start: bottomRight,
      end: bottomLeft,
      thickness,
      height: 2.8,
      openings: [],
      connectedWalls: [],
    },
    {
      id: `wall_room_${timestamp}_left`,
      type: wallType,
      start: bottomLeft,
      end: topLeft,
      thickness,
      height: 2.8,
      openings: [],
      connectedWalls: [],
    },
  ];
  
  // Set up wall connections (each wall connects to its neighbors)
  walls[0].connectedWalls = [walls[3].id, walls[1].id];
  walls[1].connectedWalls = [walls[0].id, walls[2].id];
  walls[2].connectedWalls = [walls[1].id, walls[3].id];
  walls[3].connectedWalls = [walls[2].id, walls[0].id];
  
  return walls;
}

/**
 * Create a Room object from a rectangle
 */
export function createRoomFromRectangle(
  rect: RoomRectangle,
  wallIds: string[],
  scale: number
): Room {
  const { topLeft, bottomRight, roomType, roomName } = rect;
  
  // Calculate corner points
  const topRight: Point = { x: bottomRight.x, y: topLeft.y };
  const bottomLeft: Point = { x: topLeft.x, y: bottomRight.y };
  
  const polygon = [topLeft, topRight, bottomRight, bottomLeft];
  const areaPixels = calculatePolygonArea(polygon);
  const areaSqm = pixelAreaToSquareMeters(areaPixels, scale);
  const centroid = calculateCentroid(polygon);
  const perimeter = calculatePerimeter(polygon) / scale;
  
  return {
    id: `room_${Date.now()}`,
    name: roomName,
    type: roomType,
    boundaryWalls: wallIds,
    area: areaSqm,
    perimeter,
    centroid,
    polygon,
    floorLevel: 0,
    ceilingHeight: 2.8,
  };
}

/**
 * Find the room that contains a given point
 * Uses ray-casting point-in-polygon algorithm
 */
export function findRoomAtPoint(point: Point, rooms: Room[]): Room | null {
  for (const room of rooms) {
    if (pointInPolygon(point, room.polygon)) {
      return room;
    }
  }
  return null;
}

/**
 * Find enclosed region at a point by detecting walls
 */
export function findEnclosedRegionAtPoint(
  point: Point,
  walls: Wall[],
  scale: number
): Point[] | null {
  // First check if point is inside any wall
  for (const wall of walls) {
    const polygon = getWallPolygon(wall, scale);
    if (pointInPolygon(point, polygon)) {
      return null; // Point is on a wall, not inside a room
    }
  }
  
  // Detect rooms and find which one contains the point
  const roomPolygons = detectRoomsFromWalls(walls, scale);
  
  for (const polygon of roomPolygons) {
    if (pointInPolygon(point, polygon)) {
      return polygon;
    }
  }
  
  return null;
}
