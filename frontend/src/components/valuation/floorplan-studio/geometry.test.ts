import { describe, expect, it } from 'vitest';
import { blocksToWalls, detectFaces, detectRooms, outerBoundary, signedArea, splitWall, joinWalls, arcLength } from './geometry';
import type { Wall } from './types';

const W = (a: [number, number], b: [number, number], id: string, kind: Wall['kind'] = 'exterior'): Wall => ({
  id,
  a: { x: a[0], y: a[1] },
  b: { x: b[0], y: b[1] },
  thickness: 0.2,
  height: 3,
  kind,
});

describe('room detection', () => {
  it('detects a single rectangular room', () => {
    const walls = [W([0, 0], [4, 0], 'w1'), W([4, 0], [4, 3], 'w2'), W([4, 3], [0, 3], 'w3'), W([0, 3], [0, 0], 'w4')];
    const { faces } = detectFaces(walls);
    expect(faces.length).toBe(1);
    expect(faces[0].area).toBeCloseTo(12, 1);
  });

  it('detects two rooms split by an interior wall', () => {
    const walls = [
      W([0, 0], [6, 0], 'w1'),
      W([6, 0], [6, 4], 'w2'),
      W([6, 4], [0, 4], 'w3'),
      W([0, 4], [0, 0], 'w4'),
      W([2.5, 0], [2.5, 4], 'w5', 'interior'),
    ];
    const { faces } = detectFaces(walls);
    expect(faces.length).toBe(2);
    const areas = faces.map((f) => f.area).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(10, 1); // 2.5×4
    expect(areas[1]).toBeCloseTo(14, 1); // 3.5×4
  });

  it('handles T-junction intersections (auto wall splitting)', () => {
    // interior wall meets outer wall mid-span — intersection computed, not pre-split
    const walls = [
      W([0, 0], [8, 0], 'w1'),
      W([8, 0], [8, 5], 'w2'),
      W([8, 5], [0, 5], 'w3'),
      W([0, 5], [0, 0], 'w4'),
      W([3, 0], [3, 5], 'w5', 'interior'),
      W([3, 2.5], [8, 2.5], 'w6', 'interior'),
    ];
    const { faces } = detectFaces(walls);
    expect(faces.length).toBe(3);
    const total = faces.reduce((s, f) => s + f.area, 0);
    expect(total).toBeCloseTo(40, 1);
  });

  it('matches room anchors to faces', () => {
    const walls = [W([0, 0], [4, 0], 'w1'), W([4, 0], [4, 3], 'w2'), W([4, 3], [0, 3], 'w3'), W([0, 3], [0, 0], 'w4')];
    const rooms = detectRooms(walls, [{ id: 'r1', x: 2, y: 1.5, type: 'Kitchen' }]);
    expect(rooms.length).toBe(1);
    expect(rooms[0].anchor?.type).toBe('Kitchen');
    expect(rooms[0].netArea).toBeLessThan(rooms[0].area);
    expect(rooms[0].netArea).toBeGreaterThan(9); // ~ (4-0.2)×(3-0.2)=10.6
  });

  it('returns the outer boundary polygon', () => {
    const walls = [W([0, 0], [4, 0], 'w1'), W([4, 0], [4, 3], 'w2'), W([4, 3], [0, 3], 'w3'), W([0, 3], [0, 0], 'w4')];
    const b = outerBoundary(walls);
    expect(b).not.toBeNull();
    expect(Math.abs(signedArea(b!))).toBeCloseTo(12, 1);
  });

  it('ignores open (non-enclosing) walls', () => {
    const walls = [W([0, 0], [4, 0], 'w1'), W([4, 0], [4, 3], 'w2')];
    const { faces } = detectFaces(walls);
    expect(faces.length).toBe(0);
  });

  it('detects rooms in two separate buildings', () => {
    const walls = [
      W([0, 0], [3, 0], 'a1'), W([3, 0], [3, 3], 'a2'), W([3, 3], [0, 3], 'a3'), W([0, 3], [0, 0], 'a4'),
      W([10, 0], [14, 0], 'b1'), W([14, 0], [14, 2], 'b2'), W([14, 2], [10, 2], 'b3'), W([10, 2], [10, 0], 'b4'),
    ];
    const { faces } = detectFaces(walls);
    expect(faces.length).toBe(2);
  });
});

describe('exact net internal areas (miter-offset inner boundary)', () => {
  it('rectangle: net area is exactly (W−t)×(D−t)', () => {
    // 4×3 centerline, walls 0.2 thick → internal 3.8×2.8 = 10.64 m², perimeter 13.2 m
    const walls = [W([0, 0], [4, 0], 'w1'), W([4, 0], [4, 3], 'w2'), W([4, 3], [0, 3], 'w3'), W([0, 3], [0, 0], 'w4')];
    const [room] = detectRooms(walls, []);
    expect(room.netExact).toBe(true);
    expect(room.netArea).toBeCloseTo(10.64, 6);
    expect(room.netPerimeter).toBeCloseTo(13.2, 6);
    expect(room.innerPoly).toBeDefined();
  });

  it('mixed thickness: shared interior wall offsets by its own half-thickness', () => {
    // 6×4 shell (t=0.2) split at x=2.5 by an interior wall (t=0.15)
    // left room: (2.5−0.1−0.075) × (4−0.2) = 2.325 × 3.8 = 8.835
    // right room: (3.5−0.075−0.1) × 3.8 = 3.325 × 3.8 = 12.635
    const walls = [
      W([0, 0], [6, 0], 'w1'),
      W([6, 0], [6, 4], 'w2'),
      W([6, 4], [0, 4], 'w3'),
      W([0, 4], [0, 0], 'w4'),
      { ...W([2.5, 0], [2.5, 4], 'w5'), kind: 'interior' as const, thickness: 0.15 },
    ];
    const rooms = detectRooms(walls, []).sort((a, b) => a.netArea - b.netArea);
    expect(rooms.length).toBe(2);
    expect(rooms.every((r) => r.netExact)).toBe(true);
    expect(rooms[0].netArea).toBeCloseTo(8.835, 4);
    expect(rooms[1].netArea).toBeCloseTo(12.635, 4);
  });

  it('L-shaped room: reflex corner handled exactly', () => {
    // L outline area 20, perimeter 20, five convex + one reflex 90° corner, t=0.2:
    // exact inner area = 20 − 20·0.1 + (5−1)·0.01 = 18.04
    const pts: [number, number][] = [[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [0, 4]];
    const walls = pts.map((p, i) => W(p, pts[(i + 1) % pts.length], `L${i}`));
    const [room] = detectRooms(walls, []);
    expect(room.netExact).toBe(true);
    expect(room.area).toBeCloseTo(20, 5);
    expect(room.netArea).toBeCloseTo(18.04, 5);
  });

  it('curved (bulged) walls: net area is exact on the discretized boundary', () => {
    // rectangle whose top wall bows outward (bulge 0.35)
    const walls = [
      W([0, 0], [5, 0], 'w1'),
      W([5, 0], [5, 3], 'w2'),
      { ...W([5, 3], [0, 3], 'w3'), bulge: 0.35 },
      W([0, 3], [0, 0], 'w4'),
    ];
    const [room] = detectRooms(walls, []);
    expect(room).toBeDefined();
    expect(room.netExact).toBe(true); // miter offset works segment-by-segment on the arc polyline
    expect(room.area).toBeGreaterThan(15); // bow adds area beyond 5×3
    expect(room.netArea).toBeLessThan(room.area);
    // sanity: net ≈ gross − perimeter·t/2 within corner-correction tolerance
    const approx = room.area - (room.perimeter * 0.2) / 2;
    expect(Math.abs(room.netArea - approx)).toBeLessThan(0.2);
  });

  it('falls back to approximation for faces with dead-end wall spurs', () => {
    const walls = [
      W([0, 0], [4, 0], 'w1'), W([4, 0], [4, 3], 'w2'), W([4, 3], [0, 3], 'w3'), W([0, 3], [0, 0], 'w4'),
      W([2, 0], [2, 1.2], 'spur', 'interior'), // wall sticking into the room
    ];
    const [room] = detectRooms(walls, []);
    expect(room.netArea).toBeGreaterThan(8);
    expect(room.netArea).toBeLessThan(room.area);
  });
});

describe('open-plan dividers', () => {
  it('a zero-thickness divider splits an open space for area purposes only', () => {
    // 8×4 envelope with a divider at x=5 → living 5×4 and kitchen 3×4, nearly full net areas
    const walls = [
      W([0, 0], [8, 0], 'w1'), W([8, 0], [8, 4], 'w2'), W([8, 4], [0, 4], 'w3'), W([0, 4], [0, 0], 'w4'),
      { ...W([5, 0], [5, 4], 'div'), kind: 'divider' as never, thickness: 0.01 },
    ];
    const rooms = detectRooms(walls, []).sort((a, b) => a.netArea - b.netArea);
    expect(rooms.length).toBe(2);
    // divider costs only 5mm per side — areas stay ~true open-plan portions
    expect(rooms[1].netArea).toBeGreaterThan(18.0); // 5×4 side minus envelope walls only
    expect(rooms[0].netArea).toBeGreaterThan(10.5); // 3×4 side
    expect(rooms[0].netArea + rooms[1].netArea).toBeGreaterThan(29.5);
  });
});

describe('quick plan: blocks → walls', () => {
  it('merges the shared edge of two adjacent rooms into one interior wall', () => {
    const walls = blocksToWalls([
      { x: 0, y: 0, w: 4, h: 3 },
      { x: 4, y: 0, w: 5, h: 3 },
    ]);
    const interior = walls.filter((w) => w.kind === 'interior');
    const exterior = walls.filter((w) => w.kind === 'exterior');
    expect(interior.length).toBe(1); // the shared x=4 edge, exactly once
    expect(exterior.length).toBe(4); // top(9) bottom(9) left(3) right(3) — collinear runs merged
    const top = exterior.find((w) => w.a.y === 0 && w.b.y === 0);
    expect(Math.abs(top!.b.x - top!.a.x)).toBeCloseTo(9, 5);
    // and the generated walls enclose exactly two detectable rooms
    const faces = detectFaces(
      walls.map((w, i) => ({ id: `g${i}`, a: w.a, b: w.b, thickness: 0.15, height: 3, kind: w.kind as never })),
    ).faces;
    expect(faces.length).toBe(2);
    expect(faces.reduce((s, f) => s + f.area, 0)).toBeCloseTo(27, 1);
  });

  it('keeps detached rooms as separate exterior shells', () => {
    const walls = blocksToWalls([
      { x: 0, y: 0, w: 3, h: 3 },
      { x: 10, y: 0, w: 2, h: 6 },
    ]);
    expect(walls.every((w) => w.kind === 'exterior')).toBe(true);
    expect(walls.length).toBe(8);
  });

  it('handles partial edge overlap (corridor shorter than the room)', () => {
    const walls = blocksToWalls([
      { x: 0, y: 0, w: 6, h: 4 },
      { x: 6, y: 1, w: 2, h: 2 }, // corridor butts against part of the right edge
    ]);
    const interior = walls.filter((w) => w.kind === 'interior');
    expect(interior.length).toBe(1);
    expect(Math.abs(interior[0].b.y - interior[0].a.y)).toBeCloseTo(2, 5);
    // right edge of the big room is split into two exterior pieces around the shared span
    const rightPieces = walls.filter((w) => w.kind === 'exterior' && w.a.x === 6 && w.b.x === 6);
    expect(rightPieces.length).toBe(2);
  });
});

describe('wall ops', () => {
  it('splits a wall at t', () => {
    const [w1, w2] = splitWall(W([0, 0], [4, 0], 'w'), 0.25);
    expect(w1.b.x).toBeCloseTo(1);
    expect(w2.a.x).toBeCloseTo(1);
  });
  it('joins collinear walls', () => {
    const j = joinWalls(W([0, 0], [2, 0], 'w1'), W([2, 0], [5, 0], 'w2'));
    expect(j).not.toBeNull();
    expect(j!.b.x).toBeCloseTo(5);
  });
  it('refuses to join non-collinear walls', () => {
    const j = joinWalls(W([0, 0], [2, 0], 'w1'), W([2, 0], [2, 3], 'w2'));
    expect(j).toBeNull();
  });
  it('computes arc length', () => {
    //半 semicircle bulge=1 → radius=1, length=π for chord 2
    expect(arcLength({ x: 0, y: 0 }, { x: 2, y: 0 }, 1)).toBeCloseTo(Math.PI, 2);
  });
});
