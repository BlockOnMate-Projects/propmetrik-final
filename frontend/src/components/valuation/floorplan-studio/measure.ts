// ============================================================================
// Measurement Engine — derives every valuation metric from the model.
// Recomputed on every edit (memoized by store revision).
// ============================================================================
import type { BuildingMetrics, Floor, FloorMetrics, Project } from './types';
import { detectRooms, outerBoundary, polyPerimeter, signedArea, wallLength } from './geometry';

export function measureFloor(floor: Floor): FloorMetrics {
  const rooms = detectRooms(floor.walls, floor.rooms);
  const boundary = outerBoundary(floor.walls);

  let wallLen = 0;
  let extLen = 0;
  let avgExtT = 0.23;
  let extCount = 0;
  for (const w of floor.walls) {
    if (w.kind === 'divider') continue; // area boundary only, not fabric
    const l = wallLength(w);
    wallLen += l;
    if (w.kind === 'exterior') {
      extLen += l;
      avgExtT += w.thickness;
      extCount++;
    }
  }
  if (extCount) avgExtT = avgExtT / (extCount + 1);

  let windowArea = 0;
  let doorArea = 0;
  let windowCount = 0;
  let doorCount = 0;
  let openingWallCut = 0; // wall elevation area removed by openings
  for (const o of floor.openings) {
    if (o.kind === 'window') {
      windowArea += o.width * o.height;
      windowCount++;
    } else {
      doorArea += o.width * o.height;
      doorCount++;
    }
    openingWallCut += o.width * o.height;
  }

  // wall elevation area (both faces counted once): Σ length × height − openings
  let wallArea = 0;
  for (const w of floor.walls) if (w.kind !== 'divider') wallArea += wallLength(w) * (w.height || floor.height);
  wallArea = Math.max(0, wallArea - openingWallCut);

  // GFA: outer boundary at wall centerline + outer half of exterior walls
  const boundaryArea = boundary ? Math.abs(signedArea(boundary)) : 0;
  const grossFloorArea = boundary ? boundaryArea + (polyPerimeter(boundary) * avgExtT) / 2 : 0;
  const netFloorArea = rooms.reduce((s, r) => s + r.netArea, 0);
  const perimeter = boundary ? polyPerimeter(boundary) : 0;

  return {
    floorId: floor.id,
    rooms,
    boundary,
    grossFloorArea,
    netFloorArea,
    footprint: grossFloorArea,
    perimeter,
    wallLength: wallLen,
    wallArea,
    ceilingArea: netFloorArea,
    windowArea,
    doorArea,
    windowCount,
    doorCount,
    roomCount: rooms.length,
  };
}

export function measureBuilding(project: Project): BuildingMetrics {
  const floors = project.floors.map(measureFloor);
  const totalGFA = floors.reduce((s, f) => s + f.grossFloorArea, 0);
  const totalNFA = floors.reduce((s, f) => s + f.netFloorArea, 0);
  const ground = project.floors.find((f) => f.level === 0) ?? project.floors[0];
  const groundMetrics = floors.find((f) => f.floorId === ground?.id);
  const aboveGround = project.floors.filter((f) => f.level >= 0);
  const buildingHeight =
    aboveGround.reduce((s, f) => s + f.height, 0) + (project.roof.kind === 'flat' ? 0.3 : project.roof.height);
  return {
    floors,
    totalGFA,
    totalNFA,
    footprint: groundMetrics?.footprint ?? 0,
    buildingHeight,
    totalRooms: floors.reduce((s, f) => s + f.roomCount, 0),
  };
}

export const fmt = (n: number, digits = 2): string =>
  n.toLocaleString('en-GH', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtM = (n: number): string => `${fmt(n)} m`;
export const fmtM2 = (n: number): string => `${fmt(n)} m²`;
