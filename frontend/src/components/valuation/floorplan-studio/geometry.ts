// ============================================================================
// Geometry Engine — vectors, arcs, planar graph, automatic room detection
// ============================================================================
import type { Vec, Wall, DetectedRoom, RoomAnchor } from './types';

export const EPS = 1e-9;
/** node snapping tolerance in meters */
const SNAP = 0.015;

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** closest point parameter t on segment ab for point p (clamped 0..1) */
export function projectT(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const d = dot(ab, ab);
  if (d < EPS) return 0;
  return Math.max(0, Math.min(1, dot(sub(p, a), ab) / d));
}

export function distToSeg(p: Vec, a: Vec, b: Vec): number {
  return dist(p, lerp(a, b, projectT(p, a, b)));
}

/** segment intersection: returns [t, u] params if segments ab, cd properly cross or touch */
export function segInt(a: Vec, b: Vec, c: Vec, d: Vec): { t: number; u: number; p: Vec } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null; // parallel
  const t = cross(sub(c, a), s) / denom;
  const u = cross(sub(c, a), r) / denom;
  const e = 1e-7;
  if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)), p: add(a, mul(r, t)) };
}

// ---------------------------------------------------------------------------
// Arcs (bulge convention: bulge = tan(sweep/4); sign = direction)
// ---------------------------------------------------------------------------

export function arcInfo(a: Vec, b: Vec, bulge: number) {
  const chord = dist(a, b);
  const sagitta = (bulge * chord) / 2;
  const radius = ((chord / 2) ** 2 + sagitta ** 2) / (2 * Math.abs(sagitta) || 1);
  const mid = lerp(a, b, 0.5);
  const dir = norm(sub(b, a));
  const n = perp(dir);
  const centerDist = radius - Math.abs(sagitta);
  const center = add(mid, mul(n, bulge > 0 ? -centerDist : centerDist));
  const startAng = Math.atan2(a.y - center.y, a.x - center.x);
  const endAng = Math.atan2(b.y - center.y, b.x - center.x);
  const sweep = 4 * Math.atan(bulge);
  return { center, radius, startAng, endAng, sweep, sagitta };
}

export function arcPoints(a: Vec, b: Vec, bulge: number, n = 16): Vec[] {
  if (!bulge || Math.abs(bulge) < 1e-4) return [a, b];
  const { center, radius, startAng, sweep } = arcInfo(a, b, bulge);
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = startAng + (sweep * i) / n;
    pts.push({ x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) });
  }
  pts[0] = a;
  pts[n] = b;
  return pts;
}

export function arcLength(a: Vec, b: Vec, bulge?: number): number {
  if (!bulge || Math.abs(bulge) < 1e-4) return dist(a, b);
  const { radius, sweep } = arcInfo(a, b, bulge);
  return Math.abs(radius * sweep);
}

export function wallLength(w: Wall): number {
  return arcLength(w.a, w.b, w.bulge);
}

/** point at parameter t (0..1) along a wall (straight or arc) */
export function wallPoint(w: Wall, t: number): Vec {
  if (!w.bulge || Math.abs(w.bulge) < 1e-4) return lerp(w.a, w.b, t);
  const { center, radius, startAng, sweep } = arcInfo(w.a, w.b, w.bulge);
  const ang = startAng + sweep * t;
  return { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) };
}

/** tangent direction at parameter t along a wall */
export function wallDir(w: Wall, t: number): Vec {
  if (!w.bulge || Math.abs(w.bulge) < 1e-4) return norm(sub(w.b, w.a));
  const { center, startAng, sweep } = arcInfo(w.a, w.b, w.bulge);
  const ang = startAng + sweep * t;
  const sign = sweep >= 0 ? 1 : -1;
  return { x: -Math.sin(ang) * sign, y: Math.cos(ang) * sign };
}

// ---------------------------------------------------------------------------
// Planar graph + face extraction (automatic room detection)
// ---------------------------------------------------------------------------

interface Seg {
  a: Vec;
  b: Vec;
  wallId: string;
  thickness: number;
}

export function wallSegments(walls: Wall[]): Seg[] {
  const segs: Seg[] = [];
  for (const w of walls) {
    if (dist(w.a, w.b) < SNAP) continue;
    const pts = arcPoints(w.a, w.b, w.bulge ?? 0, 12);
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ a: pts[i], b: pts[i + 1], wallId: w.id, thickness: w.thickness });
    }
  }
  return segs;
}

const nodeKey = (p: Vec): string => `${Math.round(p.x / SNAP)}:${Math.round(p.y / SNAP)}`;

export interface FaceResult {
  faces: { poly: Vec[]; area: number; keys: string[]; thickSum: number; edgeThk: number[] }[];
}

/**
 * Split all segments at mutual intersections, snap endpoints to a tolerance
 * grid, then extract planar faces by half-edge traversal. Within each
 * connected component the face with the largest |area| is the unbounded outer
 * face and is dropped; every remaining face is an enclosed room candidate.
 */
export function detectFaces(walls: Wall[]): FaceResult {
  const raw = wallSegments(walls);

  // 1) split at intersections (O(n²) is fine at this scale)
  const cuts: number[][] = raw.map(() => [0, 1]);
  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      const hit = segInt(raw[i].a, raw[i].b, raw[j].a, raw[j].b);
      if (hit) {
        cuts[i].push(hit.t);
        cuts[j].push(hit.u);
      }
    }
  }

  interface Edge {
    a: string;
    b: string;
    pa: Vec;
    pb: Vec;
    thickness: number;
  }
  const nodes = new Map<string, Vec>();
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const pa = lerp(raw[i].a, raw[i].b, ts[k]);
      const pb = lerp(raw[i].a, raw[i].b, ts[k + 1]);
      const ka = nodeKey(pa);
      const kb = nodeKey(pb);
      if (ka === kb) continue;
      if (!nodes.has(ka)) nodes.set(ka, pa);
      if (!nodes.has(kb)) nodes.set(kb, pb);
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(ek)) continue;
      seen.add(ek);
      edges.push({ a: ka, b: kb, pa: nodes.get(ka)!, pb: nodes.get(kb)!, thickness: raw[i].thickness });
    }
  }

  // 2) adjacency, sorted by angle
  const adj = new Map<string, { to: string; ang: number; thickness: number }[]>();
  const pushAdj = (from: string, to: string, thickness: number) => {
    const p = nodes.get(from)!;
    const q = nodes.get(to)!;
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, ang, thickness });
  };
  for (const e of edges) {
    pushAdj(e.a, e.b, e.thickness);
    pushAdj(e.b, e.a, e.thickness);
  }
  for (const lst of adj.values()) lst.sort((x, y) => x.ang - y.ang);

  // 3) connected components (union-find on node keys)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const k of nodes.keys()) parent.set(k, k);
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // 4) face traversal: from half-edge (u→v), the next half-edge leaves v via
  //    the neighbor immediately clockwise of u in v's sorted adjacency
  const visited = new Set<string>();
  const faces: { poly: Vec[]; area: number; keys: string[]; thickSum: number; edgeThk: number[]; comp: string }[] = [];
  const thicknessOf = (from: string, to: string): number => {
    const nbrs = adj.get(from);
    const hit = nbrs?.find((n) => n.to === to);
    return hit?.thickness ?? 0.15;
  };

  for (const e of edges) {
    for (const [su, sv] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      const hk = `${su}>${sv}`;
      if (visited.has(hk)) continue;
      const polyKeys: string[] = [];
      const edgeThk: number[] = [];
      let thickSum = 0;
      let u = su;
      let vk = sv;
      let guard = 0;
      let ok = false;
      while (guard++ < 10000) {
        visited.add(`${u}>${vk}`);
        polyKeys.push(u);
        // thickness of the edge leaving poly vertex u toward vk (aligned: edgeThk[i] = poly[i]→poly[i+1])
        const tEdge = thicknessOf(u, vk);
        edgeThk.push(tEdge);
        thickSum += tEdge * dist(nodes.get(u)!, nodes.get(vk)!);
        const nbrs = adj.get(vk)!;
        const backAng = Math.atan2(nodes.get(u)!.y - nodes.get(vk)!.y, nodes.get(u)!.x - nodes.get(vk)!.x);
        // find neighbor with angle just below backAng (clockwise next)
        let best = -1;
        let bestDelta = Infinity;
        for (let i = 0; i < nbrs.length; i++) {
          let delta = backAng - nbrs[i].ang;
          while (delta <= 1e-12) delta += Math.PI * 2;
          if (delta < bestDelta) {
            bestDelta = delta;
            best = i;
          }
        }
        if (best < 0) break;
        const nu = vk;
        const nv = nbrs[best].to;
        u = nu;
        vk = nv;
        if (u === su && vk === sv) {
          ok = true;
          break;
        }
      }
      if (!ok || polyKeys.length < 3) continue;
      const poly = polyKeys.map((k) => nodes.get(k)!);
      const area = signedArea(poly);
      faces.push({ poly, area, keys: polyKeys, thickSum, edgeThk, comp: find(su) });
    }
  }

  // 5) per component drop the largest-|area| face (the unbounded outer walk)
  const byComp = new Map<string, typeof faces>();
  for (const f of faces) {
    if (!byComp.has(f.comp)) byComp.set(f.comp, []);
    byComp.get(f.comp)!.push(f);
  }
  const out: FaceResult['faces'] = [];
  for (const lst of byComp.values()) {
    if (lst.length < 2) continue; // open component, nothing enclosed
    let outer = 0;
    for (let i = 1; i < lst.length; i++) {
      if (Math.abs(lst[i].area) > Math.abs(lst[outer].area)) outer = i;
    }
    for (let i = 0; i < lst.length; i++) {
      if (i === outer) continue;
      if (Math.abs(lst[i].area) < 0.3) continue; // ignore slivers
      out.push({
        poly: lst[i].poly,
        area: Math.abs(lst[i].area),
        keys: lst[i].keys,
        thickSum: lst[i].thickSum,
        edgeThk: lst[i].edgeThk,
      });
    }
  }
  return { faces: out };
}

/**
 * Exact internal (finish-to-finish) boundary of a room face: each wall-centerline
 * edge is offset toward the room interior by half its wall thickness, and
 * consecutive offset lines are intersected (miter join). Handles convex and
 * reflex corners exactly for the polygonal rooms valuation plans consist of.
 * Returns null when the face degenerates (e.g. dead-end wall spurs), letting
 * callers fall back to the perimeter approximation.
 */
export function innerBoundary(poly: Vec[], edgeThk: number[]): Vec[] | null {
  const n = poly.length;
  if (n < 3 || edgeThk.length !== n) return null;
  const orient = signedArea(poly) >= 0 ? 1 : -1;
  // offset line for edge i (poly[i] → poly[i+1]): point + direction
  const lines: { p: Vec; d: Vec }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const d = sub(b, a);
    const L = len(d);
    if (L < 1e-9) return null;
    const dir = { x: d.x / L, y: d.y / L };
    // interior is on the left of edge direction for positively-oriented polygons
    const nIn = mul(perp(dir), orient);
    lines.push({ p: add(a, mul(nIn, edgeThk[i] / 2)), d: dir });
  }
  const inner: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const denom = cross(prev.d, cur.d);
    if (Math.abs(denom) < 1e-9) {
      // collinear/anti-parallel edges (wall spur or straight pass-through node):
      // anti-parallel miter is undefined → degenerate face
      if (dot(prev.d, cur.d) < 0) return null;
      inner.push(cur.p);
      continue;
    }
    const t = cross(sub(cur.p, prev.p), cur.d) / denom;
    inner.push(add(prev.p, mul(prev.d, t)));
  }
  return inner;
}

export function signedArea(poly: Vec[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polyPerimeter(poly: Vec[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

export function polyCentroid(poly: Vec[]): Vec {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  if (Math.abs(a) < EPS) return poly[0];
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function pointInPoly(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** stable key for a face so room assignments survive re-detection */
export function faceKey(poly: Vec[]): string {
  const c = polyCentroid(poly);
  const a = Math.abs(signedArea(poly));
  return `${c.x.toFixed(2)}:${c.y.toFixed(2)}:${a.toFixed(2)}`;
}

/** builds DetectedRoom list and matches user anchors by point-in-polygon */
export function detectRooms(walls: Wall[], anchors: RoomAnchor[]): DetectedRoom[] {
  const { faces } = detectFaces(walls);
  return faces.map((f) => {
    const perim = polyPerimeter(f.poly);
    const avgT = perim > 0 ? f.thickSum / perim : 0.15;
    // exact internal area via miter-offset inner boundary; approximation only
    // as a fallback for degenerate faces (wall spurs etc.)
    const inner = innerBoundary(f.poly, f.edgeThk);
    let net: number;
    let netPerimeter: number;
    let exact = false;
    if (inner) {
      const innerArea = Math.abs(signedArea(inner));
      if (innerArea > 0 && innerArea <= f.area + 1e-6) {
        net = innerArea;
        netPerimeter = polyPerimeter(inner);
        exact = true;
      } else {
        net = Math.max(0, f.area - (perim * avgT) / 2 + f.poly.length * (avgT / 2) ** 2);
        netPerimeter = Math.max(0, perim - f.poly.length * avgT);
      }
    } else {
      net = Math.max(0, f.area - (perim * avgT) / 2 + f.poly.length * (avgT / 2) ** 2);
      netPerimeter = Math.max(0, perim - f.poly.length * avgT);
    }
    const centroid = polyCentroid(f.poly);
    const anchor = anchors.find((an) => pointInPoly({ x: an.x, y: an.y }, f.poly));
    return {
      key: faceKey(f.poly),
      poly: f.poly,
      innerPoly: exact ? inner! : undefined,
      area: f.area,
      netArea: net,
      netExact: exact,
      netPerimeter,
      perimeter: perim,
      centroid,
      anchor,
    };
  });
}

/** outer boundary of the largest connected component (building perimeter) */
export function outerBoundary(walls: Wall[]): Vec[] | null {
  const raw = detectFaces(walls);
  if (raw.faces.length === 0) return null;
  // reconstruct: outer boundary = union of faces is complex; approximate with
  // the convex-ish walk — instead recompute keeping the outer face
  const segs = wallSegments(walls);
  if (segs.length === 0) return null;
  // The outer face polygon equals the dropped max face; re-run cheaply:
  const all = detectAllFaces(walls);
  if (!all.length) return null;
  let outer = all[0];
  for (const f of all) if (Math.abs(f.area) > Math.abs(outer.area)) outer = f;
  return outer.poly;
}

function detectAllFaces(walls: Wall[]) {
  // identical traversal to detectFaces but returns every closed face
  const res: { poly: Vec[]; area: number }[] = [];
  const raw = wallSegments(walls);
  const cuts: number[][] = raw.map(() => [0, 1]);
  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      const hit = segInt(raw[i].a, raw[i].b, raw[j].a, raw[j].b);
      if (hit) {
        cuts[i].push(hit.t);
        cuts[j].push(hit.u);
      }
    }
  }
  const nodes = new Map<string, Vec>();
  const seen = new Set<string>();
  const edges: { a: string; b: string }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const pa = lerp(raw[i].a, raw[i].b, ts[k]);
      const pb = lerp(raw[i].a, raw[i].b, ts[k + 1]);
      const ka = nodeKey(pa);
      const kb = nodeKey(pb);
      if (ka === kb) continue;
      if (!nodes.has(ka)) nodes.set(ka, pa);
      if (!nodes.has(kb)) nodes.set(kb, pb);
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(ek)) continue;
      seen.add(ek);
      edges.push({ a: ka, b: kb });
    }
  }
  const adj = new Map<string, { to: string; ang: number }[]>();
  const pushAdj = (from: string, to: string) => {
    const p = nodes.get(from)!;
    const q = nodes.get(to)!;
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, ang: Math.atan2(q.y - p.y, q.x - p.x) });
  };
  for (const e of edges) {
    pushAdj(e.a, e.b);
    pushAdj(e.b, e.a);
  }
  for (const lst of adj.values()) lst.sort((x, y) => x.ang - y.ang);
  const visited = new Set<string>();
  for (const e of edges) {
    for (const [su, sv] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      if (visited.has(`${su}>${sv}`)) continue;
      const polyKeys: string[] = [];
      let u = su;
      let vk = sv;
      let guard = 0;
      let ok = false;
      while (guard++ < 10000) {
        visited.add(`${u}>${vk}`);
        polyKeys.push(u);
        const nbrs = adj.get(vk)!;
        const backAng = Math.atan2(nodes.get(u)!.y - nodes.get(vk)!.y, nodes.get(u)!.x - nodes.get(vk)!.x);
        let best = -1;
        let bestDelta = Infinity;
        for (let i = 0; i < nbrs.length; i++) {
          let delta = backAng - nbrs[i].ang;
          while (delta <= 1e-12) delta += Math.PI * 2;
          if (delta < bestDelta) {
            bestDelta = delta;
            best = i;
          }
        }
        if (best < 0) break;
        u = vk;
        vk = nbrs[best].to;
        if (u === su && vk === sv) {
          ok = true;
          break;
        }
      }
      if (ok && polyKeys.length >= 3) {
        const poly = polyKeys.map((k) => nodes.get(k)!);
        res.push({ poly, area: signedArea(poly) });
      }
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Wall editing operations
// ---------------------------------------------------------------------------

/** split a wall at parameter t → two walls (straight only for arcs uses chord midpoint) */
export function splitWall(w: Wall, t: number): [Wall, Wall] {
  const p = wallPoint(w, t);
  const mk = (a: Vec, b: Vec, id: string): Wall => ({ ...w, id, a, b, bulge: w.bulge ? w.bulge * 0.5 : undefined });
  return [mk(w.a, p, `${w.id}-1${Math.random().toString(36).slice(2, 5)}`), mk(p, w.b, `${w.id}-2${Math.random().toString(36).slice(2, 5)}`)];
}

/** join two collinear walls sharing an endpoint → single wall, or null */
export function joinWalls(w1: Wall, w2: Wall): Wall | null {
  if (w1.bulge || w2.bulge) return null;
  const pairs: [Vec, Vec, Vec, Vec][] = [
    [w1.a, w1.b, w2.a, w2.b],
    [w1.a, w1.b, w2.b, w2.a],
    [w1.b, w1.a, w2.a, w2.b],
    [w1.b, w1.a, w2.b, w2.a],
  ];
  for (const [a1, b1, a2, b2] of pairs) {
    if (dist(b1, a2) < SNAP * 2) {
      const d1 = norm(sub(b1, a1));
      const d2 = norm(sub(b2, a2));
      if (Math.abs(cross(d1, d2)) < 0.02) {
        return { ...w1, a: a1, b: b2 };
      }
    }
  }
  return null;
}

/** offset a straight wall by d meters perpendicular */
export function offsetWall(w: Wall, d: number): Wall {
  const n = perp(norm(sub(w.b, w.a)));
  return {
    ...w,
    id: `${w.id}-o${Math.random().toString(36).slice(2, 5)}`,
    a: add(w.a, mul(n, d)),
    b: add(w.b, mul(n, d)),
  };
}

/** snap a point to grid / wall endpoints / wall lines */
export function snapPoint(
  p: Vec,
  walls: Wall[],
  opts: { grid: boolean; gridSize: number; corners: boolean; onWalls: boolean; exclude?: string[] },
): { p: Vec; snapped: 'corner' | 'wall' | 'grid' | null } {
  const excl = new Set(opts.exclude ?? []);
  if (opts.corners) {
    for (const w of walls) {
      if (excl.has(w.id)) continue;
      for (const e of [w.a, w.b]) {
        if (dist(p, e) < 0.25) return { p: { ...e }, snapped: 'corner' };
      }
    }
  }
  if (opts.onWalls) {
    for (const w of walls) {
      if (excl.has(w.id) || w.bulge) continue;
      const t = projectT(p, w.a, w.b);
      const q = lerp(w.a, w.b, t);
      if (dist(p, q) < 0.2) return { p: q, snapped: 'wall' };
    }
  }
  if (opts.grid) {
    const g = opts.gridSize;
    return { p: { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }, snapped: 'grid' };
  }
  return { p, snapped: null };
}

// ---------------------------------------------------------------------------
// Room-blocks → walls ("enter measurements, we draw the plan")
// Blocks are axis-aligned rectangles. Edges lying on the same line are swept:
// portions covered by TWO blocks become one shared interior wall, portions
// covered by one block become exterior walls, and collinear runs are merged.
// ---------------------------------------------------------------------------

export interface BlockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedWall {
  a: Vec;
  b: Vec;
  kind: 'exterior' | 'interior';
}

export function blocksToWalls(blocks: BlockRect[]): GeneratedWall[] {
  const K = (n: number) => n.toFixed(3);
  interface LineBucket {
    horiz: boolean;
    c: number;
    ivs: { s: number; e: number }[];
  }
  const lines = new Map<string, LineBucket>();
  const addEdge = (horiz: boolean, c: number, s: number, e: number) => {
    if (e - s < 1e-6) return;
    const key = `${horiz ? 'h' : 'v'}:${K(c)}`;
    if (!lines.has(key)) lines.set(key, { horiz, c, ivs: [] });
    lines.get(key)!.ivs.push({ s, e });
  };
  for (const b of blocks) {
    addEdge(true, b.y, b.x, b.x + b.w);
    addEdge(true, b.y + b.h, b.x, b.x + b.w);
    addEdge(false, b.x, b.y, b.y + b.h);
    addEdge(false, b.x + b.w, b.y, b.y + b.h);
  }
  const out: GeneratedWall[] = [];
  for (const line of lines.values()) {
    const coords = [...new Set(line.ivs.flatMap((iv) => [K(iv.s), K(iv.e)]).map(parseFloat))].sort((a, b) => a - b);
    let run: { s: number; e: number; kind: 'exterior' | 'interior' } | null = null;
    const flush = () => {
      if (!run) return;
      const p = (t: number): Vec => (line.horiz ? { x: t, y: line.c } : { x: line.c, y: t });
      out.push({ a: p(run.s), b: p(run.e), kind: run.kind });
      run = null;
    };
    for (let i = 0; i < coords.length - 1; i++) {
      const mid = (coords[i] + coords[i + 1]) / 2;
      const cover = line.ivs.filter((iv) => iv.s - 1e-6 <= mid && mid <= iv.e + 1e-6).length;
      if (cover === 0) {
        flush();
        continue;
      }
      const kind: 'exterior' | 'interior' = cover >= 2 ? 'interior' : 'exterior';
      if (run && run.kind === kind && Math.abs(run.e - coords[i]) < 1e-6) {
        run.e = coords[i + 1];
      } else {
        flush();
        run = { s: coords[i], e: coords[i + 1], kind };
      }
    }
    flush();
  }
  return out;
}

/**
 * Wall endpoints that connect to nothing — the reason a plan fails to enclose.
 * An endpoint is "connected" when it touches another wall's endpoint or lies
 * on another wall's body (T-junction) within tolerance.
 */
export function openEndpoints(walls: Wall[]): Vec[] {
  const TOL = 0.02;
  const out: Vec[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (dist(w.a, w.b) < 0.01) continue;
    for (const e of [w.a, w.b]) {
      let connected = false;
      for (let j = 0; j < walls.length && !connected; j++) {
        if (j === i) continue;
        const o = walls[j];
        if (dist(e, o.a) < TOL || dist(e, o.b) < TOL) connected = true;
        else if (!o.bulge && distToSeg(e, o.a, o.b) < TOL) connected = true;
      }
      if (!connected) out.push(e);
    }
  }
  return out;
}

export interface CleanupResult {
  walls: Wall[];
  openings: { removedWallIds: Map<string, string> };
  removedStray: number;
  removedDuplicate: number;
  healedGaps: number;
}

/**
 * One-click plan repair for hand-drawn geometry:
 *  1. removes stray near-zero-length wall stubs,
 *  2. removes duplicate walls that lie fully on a longer (or equal) wall —
 *     the silent killer of 3D door openings — recording survivor mapping so
 *     openings can be re-homed,
 *  3. heals near-miss gaps by snapping open endpoints within `gapTol` together.
 */
export function cleanupPlanWalls(input: Wall[], gapTol = 0.15): CleanupResult {
  let walls = input.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } }));
  const removedWallIds = new Map<string, string>(); // removed id → survivor id
  let removedStray = 0;
  let removedDuplicate = 0;
  let healedGaps = 0;

  // 1) strays
  walls = walls.filter((w) => {
    if (w.locked) return true;
    if (dist(w.a, w.b) < 0.05) {
      removedStray++;
      return false;
    }
    return true;
  });

  // 2) duplicates — iterate to stability (duplicate chains exist in practice)
  const liesOn = (b: Wall, a: Wall): boolean => {
    if (a.bulge || b.bulge) return false;
    const tol = (a.thickness + b.thickness) / 2 + 0.01;
    const mid = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
    return distToSeg(b.a, a.a, a.b) < tol && distToSeg(b.b, a.a, a.b) < tol && distToSeg(mid, a.a, a.b) < tol;
  };
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < walls.length; i++) {
      for (let j = 0; j < walls.length; j++) {
        if (i === j) continue;
        const a = walls[i];
        const b = walls[j];
        if (b.locked) continue;
        if (dist(b.a, b.b) > dist(a.a, a.b) + 0.02) continue; // keep the longer wall
        if (liesOn(b, a)) {
          removedWallIds.set(b.id, a.id);
          // chain any earlier removals that pointed at b
          for (const [k, v] of removedWallIds) if (v === b.id) removedWallIds.set(k, a.id);
          walls.splice(j, 1);
          removedDuplicate++;
          changed = true;
          break outer;
        }
      }
    }
  }

  // 3) heal near-miss gaps between open endpoints
  const isOpen = (e: Vec, self: Wall): boolean => {
    for (const o of walls) {
      if (o === self) continue;
      if (dist(e, o.a) < 0.02 || dist(e, o.b) < 0.02) return false;
      if (!o.bulge && distToSeg(e, o.a, o.b) < 0.02) return false;
    }
    return true;
  };
  for (let i = 0; i < walls.length; i++) {
    for (const end of ['a', 'b'] as const) {
      const w = walls[i];
      if (w.locked) continue;
      const e = w[end];
      if (!isOpen(e, w)) continue;
      // nearest connection point on any other wall (endpoint or body) within gapTol
      let best: { p: Vec; d: number } | null = null;
      for (const o of walls) {
        if (o === w) continue;
        for (const oe of [o.a, o.b]) {
          const d = dist(e, oe);
          if (d < gapTol && (!best || d < best.d)) best = { p: { ...oe }, d };
        }
        if (!o.bulge) {
          const t = projectT(e, o.a, o.b);
          const q = lerp(o.a, o.b, t);
          const d = dist(e, q);
          if (d < gapTol && (!best || d < best.d)) best = { p: q, d };
        }
      }
      if (best && best.d > 1e-6) {
        w[end] = best.p;
        healedGaps++;
      }
    }
  }

  return { walls, openings: { removedWallIds }, removedStray, removedDuplicate, healedGaps };
}

export function bbox(pts: Vec[]): { min: Vec; max: Vec } {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const p of pts) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  return { min, max };
}
