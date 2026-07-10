// ============================================================================
// 2D Canvas Engine — Konva. World units are METERS (stage scale = px/m).
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle, Group, Text, Arc, Shape, Image as KImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useStore } from '../store';
import type { Vec, Wall, Opening, Furniture, Stair, DetectedRoom } from '../types';
import { DEFAULTS, ROOM_COLORS, uid } from '../types';
import {
  add,
  arcPoints,
  bbox,
  openEndpoints,
  detectRooms,
  dist,
  distToSeg,
  lerp,
  mul,
  norm,
  perp,
  pointInPoly,
  projectT,
  snapPoint,
  sub,
  wallDir,
  wallPoint,
  wallLength,
} from '../geometry';
import { fmt } from '../measure';
import { libDef } from '../library';

interface View {
  x: number;
  y: number;
  s: number;
}

function useHtmlImage(src?: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImg(null);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = src;
  }, [src]);
  return img;
}

const HANDLE = '#38bdf8';
const SEL = '#0ea5e9';

export default function Editor2D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x: 90, y: 70, s: 52 });
  const [cursor, setCursor] = useState<Vec>({ x: 0, y: 0 });
  const [snapMark, setSnapMark] = useState<Vec | null>(null);

  // draft tool state
  const [wallPts, setWallPts] = useState<Vec[]>([]);
  const [rectStart, setRectStart] = useState<Vec | null>(null);
  const [arcDraft, setArcDraft] = useState<{ a?: Vec; b?: Vec }>({});
  const [dimDraft, setDimDraft] = useState<Vec[]>([]);
  const [calDraft, setCalDraft] = useState<Vec[]>([]);
  const [marquee, setMarquee] = useState<{ a: Vec; b: Vec } | null>(null);
  const [typedLen, setTypedLen] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const spaceDown = useRef(false);
  const shiftDown = useRef(false);

  const s = useStore();
  const floor = s.project.floors.find((f) => f.id === s.floorId)!;
  const floorLocked = !!floor.locked;
  const rooms: DetectedRoom[] = useMemo(
    () => detectRooms(floor.walls, floor.rooms),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.rev, s.floorId],
  );
  const openEnds = useMemo(
    () => openEndpoints(floor.walls),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.rev, s.floorId],
  );

  const bgImg = useHtmlImage(floor.bg?.src);

  // resize observer — `sized` guards fit-to-view until the real size is known
  const sized = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) sized.current = true;
      setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // expose stage for export engine
  useEffect(() => {
    if (stageRef.current) window.__fpStage = stageRef.current;
  });

  // keyboard: space = pan, shift = free angle, digits = exact wall length
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = true;
      if (e.key === 'Shift') shiftDown.current = true;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        setWallPts([]);
        setRectStart(null);
        setArcDraft({});
        setDimDraft([]);
        setCalDraft([]);
        setTypedLen('');
        s.setPlacing({ placingDef: null });
        s.clearSelection();
      }
      // CAD-style: while drawing walls, type a length (e.g. "3.5") + Enter
      if (s.tool === 'wall' && wallPts.length > 0) {
        if (/^[0-9.]$/.test(e.key)) {
          setTypedLen((t) => (e.key === '.' && t.includes('.') ? t : (t + e.key).slice(0, 6)));
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          setTypedLen((t) => t.slice(0, -1));
          return;
        }
        if (e.key === 'Enter') {
          const L = parseFloat(typedLen);
          if (Number.isFinite(L) && L > 0.05) {
            placeWallPointAtLength(L);
            setTypedLen('');
          } else {
            commitWallRun();
          }
          return;
        }
      } else if (e.key === 'Enter') {
        commitWallRun();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
      if (e.key === 'Shift') shiftDown.current = false;
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallPts, s.wallKind, s.tool, typedLen, cursor]);

  const toWorld = useCallback(
    (sx: number, sy: number): Vec => ({ x: (sx - view.x) / view.s, y: (sy - view.y) / view.s }),
    [view],
  );

  const pointerWorld = (): Vec => {
    const st = stageRef.current;
    const p = st?.getPointerPosition();
    return p ? toWorld(p.x, p.y) : { x: 0, y: 0 };
  };

  const doSnap = (p: Vec, exclude?: string[]) => {
    const r = snapPoint(p, floor.walls, {
      grid: s.snap.grid,
      gridSize: s.snap.size,
      corners: s.snap.corners,
      onWalls: s.snap.walls,
      exclude,
    });
    setSnapMark(r.snapped && r.snapped !== 'grid' ? r.p : null);
    return r.p;
  };

  // ------------------------------------------------------------------ zoom/pan
  // Figma-style: two-finger scroll pans, pinch / Ctrl(⌘)+scroll zooms
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const st = stageRef.current!;
      const pointer = st.getPointerPosition()!;
      const factor = Math.exp(-e.evt.deltaY * 0.012);
      const ns = Math.min(500, Math.max(6, view.s * factor));
      const wx = (pointer.x - view.x) / view.s;
      const wy = (pointer.y - view.y) / view.s;
      setView({ s: ns, x: pointer.x - wx * ns, y: pointer.y - wy * ns });
    } else {
      setView((v) => ({ s: v.s, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  const panState = useRef<{ start: Vec; view: View } | null>(null);
  const pinchState = useRef<{ d: number; view: View; c: Vec } | null>(null);

  // ---------------------------------------------------------------- touch
  const touchCenter = (t: TouchList): Vec => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });
  const touchDist = (t: TouchList): number => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length === 2) {
      e.evt.preventDefault();
      pinchState.current = { d: touchDist(e.evt.touches), view, c: touchCenter(e.evt.touches) };
      return;
    }
    onStageMouseDown(e as unknown as KonvaEventObject<MouseEvent>);
  };
  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length === 2 && pinchState.current) {
      e.evt.preventDefault();
      const ps = pinchState.current;
      const rect = containerRef.current!.getBoundingClientRect();
      const c = touchCenter(e.evt.touches);
      const factor = touchDist(e.evt.touches) / ps.d;
      const ns = Math.min(500, Math.max(6, ps.view.s * factor));
      const cx = ps.c.x - rect.left;
      const cy = ps.c.y - rect.top;
      const wx = (cx - ps.view.x) / ps.view.s;
      const wy = (cy - ps.view.y) / ps.view.s;
      setView({
        s: ns,
        x: c.x - rect.left - wx * ns,
        y: c.y - rect.top - wy * ns,
      });
      return;
    }
    onStageMouseMove();
  };
  const onTouchEnd = () => {
    pinchState.current = null;
    onStageMouseUp();
  };

  /** angle-lock helper: snap direction from `from` to nearest 45° when close (Shift = free) */
  const angleSnap = (from: Vec, to: Vec): Vec => {
    if (shiftDown.current) return to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const L = Math.hypot(dx, dy);
    if (L < 0.05) return to;
    const ang = Math.atan2(dy, dx);
    const step = Math.PI / 4;
    const snapped = Math.round(ang / step) * step;
    let diff = ang - snapped;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) > (12 * Math.PI) / 180) return to;
    return { x: from.x + Math.cos(snapped) * L, y: from.y + Math.sin(snapped) * L };
  };

  /** the point the wall tool would place right now (corner > angle-lock > grid) */
  const wallPreviewPoint = (): Vec => {
    const last = wallPts[wallPts.length - 1];
    if (!last) return doSnap(cursor);
    // closing takes priority
    if (wallPts.length >= 3 && dist(cursor, wallPts[0]) < 0.35) return wallPts[0];
    const r = snapPoint(cursor, floor.walls, { grid: false, gridSize: s.snap.size, corners: s.snap.corners, onWalls: false });
    if (r.snapped === 'corner') return r.p;
    const locked = angleSnap(last, cursor);
    if (s.snap.grid) {
      const g = s.snap.size;
      return { x: Math.round(locked.x / g) * g, y: Math.round(locked.y / g) * g };
    }
    return locked;
  };

  /** place the next wall point at an exact typed length along the current direction */
  const placeWallPointAtLength = (L: number) => {
    const last = wallPts[wallPts.length - 1];
    if (!last) return;
    const preview = wallPreviewPoint();
    let d = sub(preview, last);
    if (Math.hypot(d.x, d.y) < 0.01) d = { x: 1, y: 0 };
    const n = norm(d);
    setWallPts((pts) => [...pts, { x: last.x + n.x * L, y: last.y + n.y * L }]);
  };

  // ------------------------------------------------------------------ tools
  const commitWallRun = () => {
    setWallPts((pts) => {
      if (pts.length >= 2) {
        const t = DEFAULTS.wallThickness[s.wallKind];
        const ws = [] as Omit<Wall, 'id'>[];
        for (let i = 0; i < pts.length - 1; i++) {
          ws.push({ a: pts[i], b: pts[i + 1], thickness: t, height: floor.height, kind: s.wallKind });
        }
        s.addWalls(ws);
      }
      return [];
    });
  };

  const wallAtPoint = (p: Vec, tol = 0.3): { wall: Wall; t: number } | null => {
    let best: { wall: Wall; t: number; d: number } | null = null;
    for (const w of floor.walls) {
      if (w.bulge) {
        // sample arc
        const pts = arcPoints(w.a, w.b, w.bulge, 24);
        for (let i = 0; i < pts.length - 1; i++) {
          const d = distToSeg(p, pts[i], pts[i + 1]);
          if (d < tol && (!best || d < best.d)) {
            const t = (i + projectT(p, pts[i], pts[i + 1])) / (pts.length - 1);
            best = { wall: w, t, d };
          }
        }
      } else {
        const d = distToSeg(p, w.a, w.b);
        if (d < tol && (!best || d < best.d)) best = { wall: w, t: projectT(p, w.a, w.b), d };
      }
    }
    return best ? { wall: best.wall, t: best.t } : null;
  };

  const commitRect = (a: Vec, b: Vec) => {
    if (Math.abs(b.x - a.x) < 0.3 || Math.abs(b.y - a.y) < 0.3) return false;
    const t = DEFAULTS.wallThickness[s.wallKind];
    const pts: Vec[] = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    s.addWalls(
      pts.map((q, i) => ({ a: q, b: pts[(i + 1) % 4], thickness: t, height: floor.height, kind: s.wallKind })),
    );
    return true;
  };

  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const st = stageRef.current!;
    const pointer = st.getPointerPosition()!;
    const button = e.evt.button ?? 0; // touch events have no button
    const isMiddle = button === 1;
    if (isMiddle || spaceDown.current) {
      panState.current = { start: { x: pointer.x, y: pointer.y }, view };
      return;
    }
    if (button === 2) {
      // right-click finishes the current wall run
      if (s.tool === 'wall') commitWallRun();
      return;
    }
    if (button !== 0) return;
    // locked plans are read-only: allow selection/inspection, block creation tools
    if (floorLocked && s.tool !== 'select') return;
    const raw = toWorld(pointer.x, pointer.y);
    const p = doSnap(raw);

    switch (s.tool) {
      case 'wall': {
        // close the loop if clicking near the first point
        if (wallPts.length >= 3 && dist(raw, wallPts[0]) < 0.35) {
          const t = DEFAULTS.wallThickness[s.wallKind];
          const ws: Omit<Wall, 'id'>[] = [];
          for (let i = 0; i < wallPts.length - 1; i++)
            ws.push({ a: wallPts[i], b: wallPts[i + 1], thickness: t, height: floor.height, kind: s.wallKind });
          ws.push({ a: wallPts[wallPts.length - 1], b: wallPts[0], thickness: t, height: floor.height, kind: s.wallKind });
          s.addWalls(ws);
          setWallPts([]);
          setTypedLen('');
        } else if (wallPts.length) {
          const L = parseFloat(typedLen);
          if (Number.isFinite(L) && L > 0.05) {
            placeWallPointAtLength(L);
            setTypedLen('');
          } else {
            setWallPts((pts) => [...pts, wallPreviewPoint()]);
          }
        } else {
          setWallPts([p]);
        }
        break;
      }
      case 'rect': {
        if (!rectStart) setRectStart(p);
        else {
          if (commitRect(rectStart, p)) setRectStart(null);
        }
        break;
      }
      case 'arc': {
        if (!arcDraft.a) setArcDraft({ a: p });
        else if (!arcDraft.b) setArcDraft({ a: arcDraft.a, b: p });
        else {
          // third click: bulge from sagitta
          const a = arcDraft.a;
          const b = arcDraft.b;
          const mid = lerp(a, b, 0.5);
          const n = perp(norm(sub(b, a)));
          const sag = (raw.x - mid.x) * n.x + (raw.y - mid.y) * n.y;
          const chord = dist(a, b);
          const bulge = Math.max(-1.5, Math.min(1.5, (-2 * sag) / chord));
          s.addWall({ a, b, thickness: DEFAULTS.wallThickness[s.wallKind], height: floor.height, kind: s.wallKind, bulge });
          setArcDraft({});
        }
        break;
      }
      case 'room': {
        const face = rooms.find((r) => pointInPoly(raw, r.poly));
        if (face?.anchor) s.updateRoom(face.anchor.id, { type: s.roomType });
        else s.setRoomAnchor(raw.x, raw.y, s.roomType);
        break;
      }
      case 'door':
      case 'window': {
        const hit = wallAtPoint(raw);
        if (hit) {
          const isDoor = s.tool === 'door';
          const width = isDoor ? DEFAULTS.doorWidth[s.doorSub] : DEFAULTS.windowWidth[s.windowSub];
          s.addOpening({
            wallId: hit.wall.id,
            kind: isDoor ? 'door' : 'window',
            sub: isDoor ? s.doorSub : s.windowSub,
            t: hit.t,
            width,
            height: isDoor ? DEFAULTS.doorHeight : DEFAULTS.windowHeight,
            sill: isDoor ? 0 : DEFAULTS.windowSill,
            flip: false,
            swing: 1,
          });
        }
        break;
      }
      case 'stair': {
        const k = s.stairKind;
        s.addStair({
          kind: k,
          x: p.x,
          y: p.y,
          rot: 0,
          width: k === 'spiral' ? 1.6 : 1.0,
          length: k === 'straight' ? 4.2 : 2.8,
        });
        s.setTool('select');
        break;
      }
      case 'furniture': {
        if (s.placingDef) {
          const def = libDef(s.placingDef);
          const id = s.addFurniture({
            def: def.id,
            x: p.x - def.w / 2,
            y: p.y - def.h / 2,
            rot: 0,
            w: def.w,
            h: def.h,
            layer: def.layer,
          });
          if (!e.evt.shiftKey) {
            s.setPlacing({ placingDef: null });
            s.setTool('select');
            s.select([id]);
          }
        }
        break;
      }
      case 'dimension': {
        const pts = [...dimDraft, p];
        if (pts.length === 3) {
          const [a, b, c] = pts;
          const n = perp(norm(sub(b, a)));
          const off = (c.x - a.x) * n.x + (c.y - a.y) * n.y;
          s.addDim({ a, b, offset: off });
          setDimDraft([]);
        } else setDimDraft(pts);
        break;
      }
      case 'calibrate': {
        const pts = [...calDraft, raw];
        if (pts.length === 2 && floor.bg) {
          const measured = dist(pts[0], pts[1]);
          const real = parseFloat(prompt(`Measured ${fmt(measured)} m on screen.\nEnter the REAL length in meters:`) ?? '');
          if (real > 0 && measured > 0) {
            s.updateBg({ scale: (floor.bg.scale * real) / measured });
          }
          setCalDraft([]);
          s.setTool('select');
        } else setCalDraft(pts);
        break;
      }
      case 'select': {
        if (e.target === st || e.target.name() === 'room-fill' || e.target.name() === 'bg') {
          // room fill click selects its anchor
          if (e.target.name() === 'room-fill') {
            const face = rooms.find((r) => pointInPoly(raw, r.poly));
            if (face?.anchor) {
              s.select([face.anchor.id], e.evt.shiftKey);
              return;
            }
          }
          if (!e.evt.shiftKey) s.clearSelection();
          setMarquee({ a: raw, b: raw });
        }
        break;
      }
    }
  };

  const onStageMouseMove = () => {
    const st = stageRef.current!;
    const pointer = st.getPointerPosition();
    if (!pointer) return;
    if (panState.current) {
      const { start, view: v0 } = panState.current;
      setView({ s: v0.s, x: v0.x + (pointer.x - start.x), y: v0.y + (pointer.y - start.y) });
      return;
    }
    const raw = toWorld(pointer.x, pointer.y);
    setCursor(raw);
    if (['wall', 'rect', 'arc', 'dimension', 'furniture', 'stair'].includes(s.tool)) doSnap(raw);
    if (marquee) setMarquee({ a: marquee.a, b: raw });
  };

  const onStageMouseUp = () => {
    panState.current = null;
    // drag-to-draw rectangle: release far from the start corner commits
    if (s.tool === 'rect' && rectStart) {
      const p = doSnap(pointerWorld());
      if (dist(p, rectStart) > 0.5 && commitRect(rectStart, p)) setRectStart(null);
    }
    if (marquee) {
      const { a, b } = marquee;
      const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
      const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
      if (dist(a, b) > 0.1) {
        const ids: string[] = [];
        for (const w of floor.walls) {
          const m = lerp(w.a, w.b, 0.5);
          if (m.x >= min.x && m.x <= max.x && m.y >= min.y && m.y <= max.y) ids.push(w.id);
        }
        for (const f of floor.furniture) {
          const cx = f.x + f.w / 2;
          const cy = f.y + f.h / 2;
          if (cx >= min.x && cx <= max.x && cy >= min.y && cy <= max.y) ids.push(f.id);
        }
        for (const st2 of floor.stairs) {
          if (st2.x >= min.x && st2.x <= max.x && st2.y >= min.y && st2.y <= max.y) ids.push(st2.id);
        }
        for (const b of floor.blocks ?? []) {
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          if (cx >= min.x && cx <= max.x && cy >= min.y && cy <= max.y) ids.push(b.id);
        }
        if (ids.length) s.select(ids, true);
      }
      setMarquee(null);
    }
  };

  const onStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (s.tool === 'wall') {
      commitWallRun();
      return;
    }
    if (s.tool === 'select' && !floorLocked) {
      const raw = pointerWorld();
      const hit = wallAtPoint(raw, 0.25);
      if (hit && !hit.wall.locked) {
        s.splitWallAt(hit.wall.id, hit.t);
      }
    }
  };

  // ------------------------------------------------------- grid geometry
  const gridLines = useMemo(() => {
    if (!s.showGrid) return { minor: [] as number[][], major: [] as number[][] };
    const w0 = toWorld(0, 0);
    const w1 = toWorld(size.w, size.h);
    const step = view.s < 18 ? 5 : view.s < 45 ? 1 : 0.5;
    const minor: number[][] = [];
    const major: number[][] = [];
    const x0 = Math.floor(w0.x / step) * step;
    const y0 = Math.floor(w0.y / step) * step;
    for (let x = x0; x <= w1.x; x += step) {
      (Math.abs(x % 5) < 1e-9 || Math.abs((x % 5) - 5) < 1e-9 ? major : minor).push([x, w0.y, x, w1.y]);
    }
    for (let y = y0; y <= w1.y; y += step) {
      (Math.abs(y % 5) < 1e-9 || Math.abs((y % 5) - 5) < 1e-9 ? major : minor).push([w0.x, y, w1.x, y]);
    }
    return { minor, major };
  }, [view, size, s.showGrid, toWorld]);

  // ------------------------------------------------------- transformer wiring
  useEffect(() => {
    const tr = trRef.current;
    const st = stageRef.current;
    if (!tr || !st) return;
    const nodes = floorLocked
      ? []
      : (s.selection
          .map((id) => st.findOne(`#furn-${id}`) ?? st.findOne(`#block-${id}`))
          .filter(Boolean) as Konva.Node[]);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [s.selection, s.rev, floorLocked]);

  // ------------------------------------------------------- render helpers
  const strokeFor = (w: Wall) =>
    s.selection.includes(w.id)
      ? SEL
      : hoverId === w.id && s.tool === 'select'
        ? '#3b82f6'
        : w.kind === 'exterior'
          ? '#1e293b'
          : w.kind === 'interior'
            ? '#334155'
            : '#64748b';

  const wallsLocked = s.layers.walls.locked;

  const renderOpening = (o: Opening) => {
    const w = floor.walls.find((x) => x.id === o.wallId);
    if (!w) return null;
    const c = wallPoint(w, o.t);
    const d = wallDir(w, o.t);
    const ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
    const selected = s.selection.includes(o.id);
    const layerOk = o.kind === 'door' ? s.layers.doors : s.layers.windows;
    if (!layerOk.visible) return null;
    const draggable = s.tool === 'select' && !layerOk.locked && !floorLocked;

    const common = {
      x: c.x,
      y: c.y,
      rotation: ang,
      draggable,
      onDragStart: () => queueMicrotask(() => s.commit()),
      onDragMove: (e: KonvaEventObject<DragEvent>) => {
        const p = { x: e.target.x(), y: e.target.y() };
        const t = w.bulge ? o.t : projectT(p, w.a, w.b);
        const q = wallPoint(w, t);
        e.target.position(q);
        s.mutate((f) => {
          f.openings = f.openings.map((x) => (x.id === o.id ? { ...x, t } : x));
        }, false, true);
      },
      onDragEnd: () => s.bumpRev(),
      onClick: (e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        s.select([o.id], e.evt.shiftKey);
      },
    };

    // live distance readouts to each wall end (shown while selected/dragging)
    const L = wallLength(w);
    const dStart = Math.max(0, o.t * L - o.width / 2);
    const dEnd = Math.max(0, L - o.t * L - o.width / 2);
    const yOff = w.thickness / 2 + 0.3;
    const readouts =
      selected && !w.bulge ? (
        <>
          <Line points={[-o.width / 2 - dStart, yOff, -o.width / 2, yOff]} stroke="#0f766e" strokeWidth={0.02} listening={false} />
          <Line points={[-o.width / 2 - dStart, yOff - 0.1, -o.width / 2 - dStart, yOff + 0.1]} stroke="#0f766e" strokeWidth={0.02} listening={false} />
          <Line points={[-o.width / 2, yOff - 0.1, -o.width / 2, yOff + 0.1]} stroke="#0f766e" strokeWidth={0.02} listening={false} />
          <Text text={`${fmt(dStart)}`} x={-o.width / 2 - dStart / 2 - 0.5} y={yOff + 0.08} width={1} align="center" fontSize={0.22} fill="#0f766e" listening={false} />
          <Line points={[o.width / 2, yOff, o.width / 2 + dEnd, yOff]} stroke="#0f766e" strokeWidth={0.02} listening={false} />
          <Line points={[o.width / 2 + dEnd, yOff - 0.1, o.width / 2 + dEnd, yOff + 0.1]} stroke="#0f766e" strokeWidth={0.02} listening={false} />
          <Line points={[o.width / 2, yOff - 0.1, o.width / 2, yOff + 0.1]} stroke="#0f766e" strokeWidth={0.02} listening={false} />
          <Text text={`${fmt(dEnd)}`} x={o.width / 2 + dEnd / 2 - 0.5} y={yOff + 0.08} width={1} align="center" fontSize={0.22} fill="#0f766e" listening={false} />
        </>
      ) : null;

    if (o.kind === 'door') {
      const r = o.width;
      const side = o.flip ? -1 : 1;
      const q = o.width / 4;
      return (
        <Group key={o.id} {...common}>
          {/* wall cut */}
          <Rect x={-o.width / 2} y={-w.thickness / 2 - 0.01} width={o.width} height={w.thickness + 0.02} fill="#f8fafc" />
          {/* leaf + swing */}
          {o.sub === 'opening' ? (
            <>
              <Line points={[-o.width / 2, -w.thickness / 2, -o.width / 2, w.thickness / 2]} stroke={selected ? SEL : '#94a3b8'} strokeWidth={0.03} />
              <Line points={[o.width / 2, -w.thickness / 2, o.width / 2, w.thickness / 2]} stroke={selected ? SEL : '#94a3b8'} strokeWidth={0.03} />
            </>
          ) : o.sub === 'sliding' ? (
            <>
              <Line points={[-o.width / 2, -0.05 * side, o.width * 0.1, -0.05 * side]} stroke="#b45309" strokeWidth={0.05} />
              <Line points={[-o.width * 0.1, 0.05 * side, o.width / 2, 0.05 * side]} stroke="#b45309" strokeWidth={0.05} />
            </>
          ) : o.sub === 'folding' ? (
            <Line
              points={[-o.width / 2, 0, -o.width / 2 + q, -0.22 * side, -o.width / 2 + 2 * q, 0, -o.width / 2 + 3 * q, -0.22 * side, o.width / 2, 0]}
              stroke={selected ? SEL : '#b45309'}
              strokeWidth={0.035}
            />
          ) : o.sub === 'glass' ? (
            <>
              <Arc
                x={(-o.width / 2) * o.swing}
                y={0}
                innerRadius={0}
                outerRadius={r}
                angle={90}
                rotation={o.swing > 0 ? -90 : 180}
                stroke="#0284c7"
                strokeWidth={0.02}
                dash={[0.08, 0.06]}
                scaleY={side}
              />
              <Line points={[(-o.width / 2) * o.swing, 0, (-o.width / 2) * o.swing, -r * side]} stroke="#38bdf8" strokeWidth={0.06} opacity={0.8} />
            </>
          ) : o.sub === 'double' ? (
            <>
              <Arc x={-o.width / 2} y={0} innerRadius={0} outerRadius={r / 2} angle={90} rotation={side > 0 ? -90 * s0(o) : 0} stroke="#b45309" strokeWidth={0.02} fill="rgba(180,83,9,0.08)" scaleY={side} />
              <Arc x={o.width / 2} y={0} innerRadius={0} outerRadius={r / 2} angle={90} rotation={side > 0 ? 180 : 90} stroke="#b45309" strokeWidth={0.02} fill="rgba(180,83,9,0.08)" scaleY={side} />
            </>
          ) : (
            <Arc
              x={(-o.width / 2) * o.swing}
              y={0}
              innerRadius={0}
              outerRadius={r}
              angle={90}
              rotation={o.swing > 0 ? -90 : 180}
              stroke={selected ? SEL : '#b45309'}
              strokeWidth={0.025}
              fill="rgba(180,83,9,0.08)"
              scaleY={side}
            />
          )}
          {selected && <Rect x={-o.width / 2} y={-0.25} width={o.width} height={0.5} stroke={SEL} strokeWidth={0.03} dash={[0.1, 0.08]} />}
          {readouts}
        </Group>
      );
    }
    // window
    return (
      <Group key={o.id} {...common}>
        <Rect x={-o.width / 2} y={-w.thickness / 2} width={o.width} height={w.thickness} fill="#f8fafc" stroke={selected ? SEL : '#0284c7'} strokeWidth={0.02} />
        <Line points={[-o.width / 2, 0, o.width / 2, 0]} stroke={selected ? SEL : '#0284c7'} strokeWidth={0.03} />
        {o.sub === 'bay' && (
          <Line
            points={[-o.width / 2, -w.thickness / 2, -o.width / 3, -w.thickness / 2 - 0.35, o.width / 3, -w.thickness / 2 - 0.35, o.width / 2, -w.thickness / 2]}
            stroke="#0284c7"
            strokeWidth={0.03}
          />
        )}
        {readouts}
      </Group>
    );
  };

  const s0 = (_o: Opening) => 1;

  const renderStair = (st: Stair) => {
    const selected = s.selection.includes(st.id);
    const steps = Math.max(2, Math.round(floor.height / DEFAULTS.riserIdeal));
    const draggable = s.tool === 'select' && !st.locked && !floorLocked;
    const treads: React.ReactNode[] = [];
    if (st.kind === 'spiral') {
      const r = st.width;
      for (let i = 0; i < steps; i++) {
        const a0 = (360 / steps) * i;
        treads.push(<Arc key={i} x={0} y={0} innerRadius={0.15} outerRadius={r} angle={360 / steps - 4} rotation={a0} stroke="#475569" strokeWidth={0.02} />);
      }
    } else {
      const legSteps = st.kind === 'straight' ? steps : Math.ceil(steps / 2);
      const treadD = st.length / legSteps;
      for (let i = 0; i < legSteps; i++) {
        treads.push(<Line key={i} points={[0, i * treadD, st.width, i * treadD]} stroke="#475569" strokeWidth={0.02} />);
      }
      treads.push(<Rect key="frame" x={0} y={0} width={st.width} height={st.length} stroke="#334155" strokeWidth={0.03} />);
      if (st.kind !== 'straight') {
        const off = st.kind === 'l' ? st.width : st.width * 2 + 0.1;
        for (let i = 0; i < legSteps; i++) {
          treads.push(
            <Line key={`b${i}`} points={[st.width + (st.kind === 'u' ? 0.1 : 0), i * treadD, st.width + (st.kind === 'u' ? 0.1 : 0) + st.width, i * treadD]} stroke="#475569" strokeWidth={0.02} x={0} y={0} />,
          );
        }
        treads.push(<Rect key="frame2" x={st.width + (st.kind === 'u' ? 0.1 : 0)} y={0} width={st.width} height={st.length} stroke="#334155" strokeWidth={0.03} />);
        void off;
      }
      // direction arrow
      treads.push(<Line key="arrow" points={[st.width / 2, st.length - 0.2, st.width / 2, 0.25]} stroke="#0f172a" strokeWidth={0.03} />);
      treads.push(<Line key="ah" points={[st.width / 2 - 0.12, 0.45, st.width / 2, 0.22, st.width / 2 + 0.12, 0.45]} stroke="#0f172a" strokeWidth={0.03} />);
    }
    return (
      <Group
        key={st.id}
        x={st.x}
        y={st.y}
        rotation={st.rot}
        draggable={draggable}
        onDragStart={() => queueMicrotask(() => s.commit())}
        onDragEnd={(e) => {
          s.mutate((f) => {
            f.stairs = f.stairs.map((x) => (x.id === st.id ? { ...x, x: e.target.x(), y: e.target.y() } : x));
          }, false);
        }}
        onClick={(e) => {
          e.cancelBubble = true;
          s.select([st.id], e.evt.shiftKey);
        }}
      >
        {treads}
        {selected && <Rect x={-0.1} y={-0.1} width={(st.kind === 'spiral' ? st.width * 2 : st.width * (st.kind === 'straight' ? 1 : 2)) + 0.3} height={(st.kind === 'spiral' ? st.width * 2 : st.length) + 0.2} stroke={SEL} strokeWidth={0.03} dash={[0.12, 0.08]} />}
      </Group>
    );
  };

  const glyphFor = (f: Furniture): React.ReactNode => {
    const def = libDef(f.def);
    const w = f.w;
    const h = f.h;
    const stroke = '#475569';
    const sw = 0.03;
    switch (def.glyph) {
      case 'bed':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#eef2ff" cornerRadius={0.05} />
            <Rect x={0.08} y={0.08} width={w - 0.16} height={0.35} stroke={stroke} strokeWidth={0.02} fill="#c7d2fe" cornerRadius={0.05} />
            <Line points={[0, h * 0.35, w, h * 0.35]} stroke={stroke} strokeWidth={0.02} />
          </>
        );
      case 'sofa':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#ede9fe" cornerRadius={0.12} />
            <Rect x={0.06} y={0.06} width={w - 0.12} height={h - 0.3} stroke={stroke} strokeWidth={0.02} fill="#ddd6fe" cornerRadius={0.08} />
          </>
        );
      case 'chair':
        return <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#ede9fe" cornerRadius={0.08} />;
      case 'table':
        return <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#fef3c7" cornerRadius={0.05} />;
      case 'tv':
        return <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#1e293b" />;
      case 'sink':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#e0f2fe" />
            <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) * 0.3} stroke={stroke} strokeWidth={0.02} />
          </>
        );
      case 'stove':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#fee2e2" />
            {[0.25, 0.75].flatMap((fx) => [0.25, 0.75].map((fy) => <Circle key={`${fx}${fy}`} x={w * fx} y={h * fy} radius={0.09} stroke={stroke} strokeWidth={0.02} />))}
          </>
        );
      case 'fridge':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#f1f5f9" />
            <Line points={[0, h * 0.4, w, h * 0.4]} stroke={stroke} strokeWidth={0.02} />
          </>
        );
      case 'toilet':
        return (
          <>
            <Rect width={w} height={h * 0.35} stroke={stroke} strokeWidth={0.02} fill="#f8fafc" />
            <Circle x={w / 2} y={h * 0.65} radius={w * 0.45} stroke={stroke} strokeWidth={0.02} fill="#f8fafc" />
          </>
        );
      case 'basin':
        return <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2} stroke={stroke} strokeWidth={sw} fill="#f0f9ff" />;
      case 'shower':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#ecfeff" />
            <Line points={[0, 0, w, h]} stroke={stroke} strokeWidth={0.02} />
            <Line points={[w, 0, 0, h]} stroke={stroke} strokeWidth={0.02} />
          </>
        );
      case 'tub':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#e0f2fe" cornerRadius={0.1} />
            <Rect x={0.08} y={0.08} width={w - 0.16} height={h - 0.16} stroke={stroke} strokeWidth={0.02} cornerRadius={0.15} />
          </>
        );
      case 'tree':
        return <Circle x={w / 2} y={h / 2} radius={w / 2} stroke="#15803d" strokeWidth={sw} fill="rgba(34,197,94,0.25)" />;
      case 'car':
        return (
          <>
            <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill="#e2e8f0" cornerRadius={0.25} />
            <Rect x={0.12} y={h * 0.22} width={w - 0.24} height={h * 0.28} stroke={stroke} strokeWidth={0.02} cornerRadius={0.1} />
          </>
        );
      case 'fence':
      case 'gate':
        return <Rect width={w} height={Math.max(h, 0.1)} stroke={stroke} strokeWidth={sw} fill={def.glyph === 'gate' ? '#fef9c3' : '#e7e5e4'} />;
      case 'socket':
        return <Circle x={w / 2} y={h / 2} radius={w / 2} stroke="#a16207" strokeWidth={sw} fill="#fef08a" />;
      case 'light':
        return (
          <>
            <Circle x={w / 2} y={h / 2} radius={w / 2} stroke="#a16207" strokeWidth={sw} />
            <Line points={[0, 0, w, h]} stroke="#a16207" strokeWidth={0.02} />
            <Line points={[w, 0, 0, h]} stroke="#a16207" strokeWidth={0.02} />
          </>
        );
      case 'circle':
        return <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2} stroke={stroke} strokeWidth={sw} fill={def.color + '33'} />;
      default:
        return <Rect width={w} height={h} stroke={stroke} strokeWidth={sw} fill={def.color + '22'} cornerRadius={0.04} />;
    }
  };

  const renderFurniture = (f: Furniture) => {
    const def = libDef(f.def);
    const layerState = s.layers[f.layer] ?? s.layers.furniture;
    if (!layerState.visible) return null;
    const selected = s.selection.includes(f.id);
    const draggable = s.tool === 'select' && !f.locked && !layerState.locked && !floorLocked;
    return (
      <Group
        key={f.id}
        id={`furn-${f.id}`}
        x={f.x + f.w / 2}
        y={f.y + f.h / 2}
        offsetX={f.w / 2}
        offsetY={f.h / 2}
        rotation={f.rot}
        draggable={draggable}
        onDragStart={() => queueMicrotask(() => s.commit())}
        onDragEnd={(e) => {
          const nx = e.target.x() - f.w / 2;
          const ny = e.target.y() - f.h / 2;
          const dx = nx - f.x;
          const dy = ny - f.y;
          const moveIds = f.group ? floor.furniture.filter((x) => x.group === f.group).map((x) => x.id) : [f.id];
          s.mutate((fl) => {
            fl.furniture = fl.furniture.map((x) => (moveIds.includes(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x));
          }, false);
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          s.mutate((fl) => {
            fl.furniture = fl.furniture.map((x) =>
              x.id === f.id
                ? {
                    ...x,
                    w: Math.max(0.1, f.w * sx),
                    h: Math.max(0.1, f.h * sy),
                    rot: node.rotation(),
                    x: node.x() - (f.w * sx) / 2,
                    y: node.y() - (f.h * sy) / 2,
                  }
                : x,
            );
          });
        }}
        onMouseEnter={() => setHoverId(f.id)}
        onMouseLeave={() => setHoverId((h) => (h === f.id ? null : h))}
        onClick={(e) => {
          e.cancelBubble = true;
          const ids = f.group ? floor.furniture.filter((x) => x.group === f.group).map((x) => x.id) : [f.id];
          s.select(ids, e.evt.shiftKey);
        }}
      >
        {glyphFor(f)}
        {hoverId === f.id && !selected && s.tool === 'select' && (
          <Rect x={-0.05} y={-0.05} width={f.w + 0.1} height={f.h + 0.1} stroke="#3b82f6" strokeWidth={0.02} />
        )}
        {selected && <Rect x={-0.05} y={-0.05} width={f.w + 0.1} height={f.h + 0.1} stroke={SEL} strokeWidth={0.025} dash={[0.1, 0.07]} />}
        {f.locked && <Text text="🔒" fontSize={0.25} x={f.w / 2 - 0.12} y={f.h / 2 - 0.12} />}
      </Group>
    );
  };

  // dimension entity rendering
  const renderDim = (d: { id: string; a: Vec; b: Vec; offset: number }) => {
    if (!s.layers.dimensions.visible) return null;
    const n = perp(norm(sub(d.b, d.a)));
    const a2 = add(d.a, mul(n, d.offset));
    const b2 = add(d.b, mul(n, d.offset));
    const mid = lerp(a2, b2, 0.5);
    const L = dist(d.a, d.b);
    const selected = s.selection.includes(d.id);
    const col = selected ? SEL : '#0f766e';
    return (
      <Group key={d.id} onClick={(e) => { e.cancelBubble = true; s.select([d.id], e.evt.shiftKey); }}>
        <Line points={[d.a.x, d.a.y, a2.x, a2.y]} stroke={col} strokeWidth={0.015} />
        <Line points={[d.b.x, d.b.y, b2.x, b2.y]} stroke={col} strokeWidth={0.015} />
        <Line points={[a2.x, a2.y, b2.x, b2.y]} stroke={col} strokeWidth={0.02} hitStrokeWidth={0.2} />
        <Text text={`${fmt(L)} m`} x={mid.x - 0.6} y={mid.y - 0.32} width={1.2} align="center" fontSize={0.22} fill={col} />
      </Group>
    );
  };

  // ------------------------------------------------------- minimap + rulers (DOM canvases)
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const rulerXRef = useRef<HTMLCanvasElement>(null);
  const rulerYRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // minimap
    const cv = minimapRef.current;
    if (cv) {
      const ctx = cv.getContext('2d')!;
      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(0, 0, W, H);
      const pts = floor.walls.flatMap((w) => [w.a, w.b]);
      if (pts.length) {
        const bb = bbox(pts);
        const pad = 1;
        const sx = (W - 16) / (bb.max.x - bb.min.x + pad * 2 || 1);
        const sy = (H - 16) / (bb.max.y - bb.min.y + pad * 2 || 1);
        const sc = Math.min(sx, sy);
        const ox = 8 - (bb.min.x - pad) * sc;
        const oy = 8 - (bb.min.y - pad) * sc;
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.2;
        for (const w of floor.walls) {
          ctx.beginPath();
          ctx.moveTo(w.a.x * sc + ox, w.a.y * sc + oy);
          ctx.lineTo(w.b.x * sc + ox, w.b.y * sc + oy);
          ctx.stroke();
        }
        // viewport rect
        const tl = toWorld(0, 0);
        const br = toWorld(size.w, size.h);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(tl.x * sc + ox, tl.y * sc + oy, (br.x - tl.x) * sc, (br.y - tl.y) * sc);
        // stash for click-to-jump
        (cv as any).__map = { sc, ox, oy };
      }
    }
    // rulers
    const drawRuler = (canvas: HTMLCanvasElement | null, horizontal: boolean) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#475569';
      ctx.font = '9px sans-serif';
      const step = view.s < 18 ? 5 : 1;
      if (horizontal) {
        const w0 = (0 - view.x) / view.s;
        const w1 = (W - view.x) / view.s;
        for (let x = Math.floor(w0 / step) * step; x <= w1; x += step) {
          const px = x * view.s + view.x;
          ctx.beginPath();
          ctx.moveTo(px, H);
          ctx.lineTo(px, H - (Math.abs(x % 5) < 1e-9 ? 12 : 7));
          ctx.stroke();
          if (Math.abs(x % (step * (view.s < 40 ? 5 : 1))) < 1e-9) ctx.fillText(`${x}`, px + 2, 10);
        }
      } else {
        const w0 = (0 - view.y) / view.s;
        const w1 = (H - view.y) / view.s;
        for (let y = Math.floor(w0 / step) * step; y <= w1; y += step) {
          const py = y * view.s + view.y;
          ctx.beginPath();
          ctx.moveTo(W, py);
          ctx.lineTo(W - (Math.abs(y % 5) < 1e-9 ? 12 : 7), py);
          ctx.stroke();
          if (Math.abs(y % (step * (view.s < 40 ? 5 : 1))) < 1e-9) ctx.fillText(`${y}`, 2, py - 2);
        }
      }
    };
    drawRuler(rulerXRef.current, true);
    drawRuler(rulerYRef.current, false);
  }, [view, size, s.rev, floor.walls, toWorld]);

  const onMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = minimapRef.current!;
    const map = (cv as any).__map;
    if (!map) return;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const wx = (mx - map.ox) / map.sc;
    const wy = (my - map.oy) / map.sc;
    setView((v) => ({ s: v.s, x: size.w / 2 - wx * v.s, y: size.h / 2 - wy * v.s }));
  };

  // fit view on floor/project change — wait until the container has real size
  const needsFit = useRef(true);
  useEffect(() => {
    needsFit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.floorId, s.project.id]);
  useEffect(() => {
    if (!needsFit.current) return;
    // measure the container LIVE — size state can lag one commit behind layout
    const el = containerRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    if (w < 120 || h < 120) return;
    const pts = floor.walls.flatMap((wl) => [wl.a, wl.b]);
    if (!pts.length) {
      needsFit.current = false;
      return;
    }
    const bb = bbox(pts);
    const pad = 2;
    const sc = Math.min(w / (bb.max.x - bb.min.x + pad * 2), h / (bb.max.y - bb.min.y + pad * 2));
    if (sc > 0 && Number.isFinite(sc)) {
      const z = Math.min(120, Math.max(8, sc));
      setView({
        s: z,
        x: w / 2 - ((bb.min.x + bb.max.x) / 2) * z,
        y: h / 2 - ((bb.min.y + bb.max.y) / 2) * z,
      });
      needsFit.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.floorId, s.project.id, size]);

  // ------------------------------------------------------- draft previews
  const draft: React.ReactNode[] = [];
  if (s.tool === 'wall' && wallPts.length) {
    const preview = wallPreviewPoint();
    const pts = [...wallPts, preview];
    draft.push(
      <Line key="wpv" points={pts.flatMap((p) => [p.x, p.y])} stroke="#0ea5e9" strokeWidth={Math.max(DEFAULTS.wallThickness[s.wallKind], 0.05)} dash={s.wallKind === 'divider' ? [0.3, 0.18] : undefined} opacity={0.55} lineCap="butt" />,
    );
    const last = wallPts[wallPts.length - 1];
    const L = dist(last, preview);
    const labelText = typedLen ? `${typedLen}⏎ m` : `${fmt(L)} m`;
    draft.push(
      <Group key="wpt" x={(last.x + preview.x) / 2} y={(last.y + preview.y) / 2 - 0.45}>
        <Rect x={-0.55} y={-0.2} width={1.1} height={0.42} fill={typedLen ? '#0369a1' : 'rgba(255,255,255,0.85)'} cornerRadius={0.08} />
        <Text text={labelText} x={-0.55} y={-0.12} width={1.1} align="center" fontSize={0.26} fontStyle="bold" fill={typedLen ? 'white' : '#0369a1'} />
      </Group>,
    );
    // orthogonal guide when locked
    if (Math.abs(preview.x - last.x) < 1e-9 || Math.abs(preview.y - last.y) < 1e-9) {
      draft.push(<Line key="wog" points={[last.x, last.y, preview.x, preview.y]} stroke="#f472b6" strokeWidth={1.5 / view.s} dash={[0.3, 0.2]} />);
    }
    // close-the-loop marker on the first point
    if (wallPts.length >= 3) {
      const near = dist(cursor, wallPts[0]) < 0.35;
      draft.push(
        <Circle key="wcl" x={wallPts[0].x} y={wallPts[0].y} radius={9 / view.s} fill={near ? '#22c55e' : 'rgba(34,197,94,0.25)'} stroke="#16a34a" strokeWidth={2 / view.s} />,
      );
    }
  }
  if (s.tool === 'rect' && rectStart) {
    draft.push(
      <Rect key="rpv" x={Math.min(rectStart.x, cursor.x)} y={Math.min(rectStart.y, cursor.y)} width={Math.abs(cursor.x - rectStart.x)} height={Math.abs(cursor.y - rectStart.y)} stroke="#0ea5e9" strokeWidth={0.06} dash={[0.2, 0.12]} />,
      <Text key="rpt" text={`${fmt(Math.abs(cursor.x - rectStart.x))} × ${fmt(Math.abs(cursor.y - rectStart.y))} m`} x={cursor.x + 0.2} y={cursor.y + 0.2} fontSize={0.26} fill="#0369a1" />,
    );
  }
  if (s.tool === 'arc' && arcDraft.a) {
    const b = arcDraft.b ?? cursor;
    if (arcDraft.b) {
      const mid = lerp(arcDraft.a, b, 0.5);
      const n = perp(norm(sub(b, arcDraft.a)));
      const sag = (cursor.x - mid.x) * n.x + (cursor.y - mid.y) * n.y;
      const chord = dist(arcDraft.a, b);
      const bulge = Math.max(-1.5, Math.min(1.5, (-2 * sag) / chord));
      const pts = arcPoints(arcDraft.a, b, bulge, 24);
      draft.push(<Line key="apv" points={pts.flatMap((p) => [p.x, p.y])} stroke="#0ea5e9" strokeWidth={0.1} opacity={0.6} />);
    } else {
      draft.push(<Line key="apv" points={[arcDraft.a.x, arcDraft.a.y, b.x, b.y]} stroke="#0ea5e9" strokeWidth={0.05} dash={[0.15, 0.1]} />);
    }
  }
  if (s.tool === 'furniture' && s.placingDef) {
    const def = libDef(s.placingDef);
    draft.push(<Rect key="fpv" x={cursor.x - def.w / 2} y={cursor.y - def.h / 2} width={def.w} height={def.h} stroke={def.color} strokeWidth={0.03} dash={[0.1, 0.06]} fill={def.color + '22'} />);
  }
  if ((s.tool === 'door' || s.tool === 'window') && floor.walls.length) {
    const hit = wallAtPoint(cursor);
    if (hit) {
      const c = wallPoint(hit.wall, hit.t);
      const d = wallDir(hit.wall, hit.t);
      const isDoor = s.tool === 'door';
      const wdt = isDoor ? DEFAULTS.doorWidth[s.doorSub] : DEFAULTS.windowWidth[s.windowSub];
      const ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
      draft.push(
        <Group key="opv" x={c.x} y={c.y} rotation={ang} opacity={0.7}>
          <Rect x={-wdt / 2} y={-hit.wall.thickness / 2} width={wdt} height={hit.wall.thickness} fill={isDoor ? '#f59e0b' : '#38bdf8'} />
        </Group>,
      );
    }
  }
  if (s.tool === 'dimension' && dimDraft.length) {
    draft.push(<Line key="dpv" points={[...dimDraft, cursor].flatMap((p) => [p.x, p.y])} stroke="#0f766e" strokeWidth={0.02} dash={[0.1, 0.06]} />);
  }
  if (s.tool === 'calibrate' && calDraft.length) {
    draft.push(<Line key="cpv" points={[...calDraft, cursor].flatMap((p) => [p.x, p.y])} stroke="#dc2626" strokeWidth={0.03} dash={[0.15, 0.1]} />);
  }
  // open wall ends — the plan cannot enclose rooms until these are closed
  for (let i = 0; i < openEnds.length; i++) {
    const p = openEnds[i];
    draft.push(
      <Circle key={`open${i}`} x={p.x} y={p.y} radius={7 / view.s} fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth={2 / view.s} />,
    );
  }
  if (snapMark) {
    draft.push(<Circle key="snap" x={snapMark.x} y={snapMark.y} radius={0.12} stroke="#f59e0b" strokeWidth={0.03} />);
  }
  if (marquee) {
    draft.push(
      <Rect key="marq" x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)} width={Math.abs(marquee.b.x - marquee.a.x)} height={Math.abs(marquee.b.y - marquee.a.y)} fill="rgba(14,165,233,0.08)" stroke="#0ea5e9" strokeWidth={0.02} />,
    );
  }

  const cursorStyle =
    s.tool === 'select'
      ? hoverId
        ? 'move'
        : 'default'
      : s.tool === 'calibrate'
        ? 'crosshair'
        : ['door', 'window', 'room'].includes(s.tool)
          ? 'copy'
          : 'crosshair';

  // context-toolbar selection composition
  const selDoor = floor.openings.find((o) => s.selection.includes(o.id) && o.kind === 'door');
  const selRotatable =
    floor.furniture.some((f2) => s.selection.includes(f2.id)) ||
    floor.stairs.some((x) => s.selection.includes(x.id)) ||
    (floor.blocks ?? []).some((b) => s.selection.includes(b.id));
  const selAnyLocked =
    floor.walls.some((w) => s.selection.includes(w.id) && w.locked) ||
    floor.furniture.some((f2) => s.selection.includes(f2.id) && f2.locked);
  const showEmptyHint =
    !hintDismissed &&
    s.tool === 'select' &&
    floor.walls.length === 0 &&
    !(floor.blocks ?? []).length &&
    !floor.bg &&
    wallPts.length === 0 &&
    !rectStart;

  const CtxBtn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      title={title}
      className="rounded px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
    >
      {children}
    </button>
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-slate-100"
      style={{ cursor: cursorStyle, touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.s}
        scaleY={view.s}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onDblClick={onStageDblClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDblTap={(e) => onStageDblClick(e as unknown as KonvaEventObject<MouseEvent>)}
      >
        {/* grid */}
        <Layer listening={false}>
          {gridLines.minor.map((l, i) => (
            <Line key={`gm${i}`} points={l} stroke="#e2e8f0" strokeWidth={1 / view.s} />
          ))}
          {gridLines.major.map((l, i) => (
            <Line key={`gM${i}`} points={l} stroke="#cbd5e1" strokeWidth={1.5 / view.s} />
          ))}
          <Line points={[-0.5, 0, 0.5, 0]} stroke="#f87171" strokeWidth={2 / view.s} />
          <Line points={[0, -0.5, 0, 0.5]} stroke="#4ade80" strokeWidth={2 / view.s} />
        </Layer>

        {/* model layer: background, rooms, blocks, walls, furniture, dimensions */}
        <Layer>
        {bgImg && floor.bg && (
            <KImage
              name="bg"
              image={bgImg}
              x={floor.bg.x}
              y={floor.bg.y}
              rotation={floor.bg.rotation}
              scaleX={floor.bg.scale}
              scaleY={floor.bg.scale}
              opacity={floor.bg.opacity}
              draggable={s.tool === 'select' && !floorLocked}
              onDragEnd={(e) => s.updateBg({ x: e.target.x(), y: e.target.y() })}
            />
        )}

        {/* detected rooms */}
        <Group>
          {rooms.map((r) => {
            const color = r.anchor ? ROOM_COLORS[r.anchor.type] : '#e2e8f0';
            const label = r.anchor ? (r.anchor.name ?? r.anchor.type) : 'Room?';
            // label placement: dodge furniture inside the room
            const furnRects = floor.furniture
              .filter((fu) => pointInPoly({ x: fu.x + fu.w / 2, y: fu.y + fu.h / 2 }, r.poly))
              .map((fu) => ({ x1: fu.x - 0.1, y1: fu.y - 0.1, x2: fu.x + fu.w + 0.1, y2: fu.y + fu.h + 0.1 }));
            const fs0 = Math.min(0.32, Math.max(0.14, Math.sqrt(r.netArea) * 0.085));
            const lw = Math.min(2.2, Math.max(1.1, label.length * fs0 * 0.55));
            const lh = fs0 * 2.3;
            const clear = (cx: number, cy: number) =>
              pointInPoly({ x: cx, y: cy }, r.poly) &&
              !furnRects.some((f2) => cx + lw / 2 > f2.x1 && cx - lw / 2 < f2.x2 && cy + lh / 2 > f2.y1 && cy - lh / 2 < f2.y2);
            let lp = r.centroid;
            if (furnRects.length && !clear(r.centroid.x, r.centroid.y)) {
              const step = Math.max(0.5, Math.sqrt(r.netArea) / 5);
              const cands: [number, number][] = [
                [0, -step], [0, step], [-step, 0], [step, 0],
                [0, -2 * step], [0, 2 * step], [-step, -step], [step, -step], [-step, step], [step, step],
              ];
              for (const [dx, dy] of cands) {
                if (clear(r.centroid.x + dx, r.centroid.y + dy)) {
                  lp = { x: r.centroid.x + dx, y: r.centroid.y + dy };
                  break;
                }
              }
            }
            return (
              <Group key={r.key}>
                <Line
                  name="room-fill"
                  points={r.poly.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={color + (r.anchor ? '3d' : '22')}
                />
                {s.showLabels && (
                  <>
                    <Text text={label} x={lp.x - 1.5} y={lp.y - fs0} width={3} align="center" fontSize={fs0} fontStyle="bold" fill="#0f172a" listening={false} />
                    <Text text={`${fmt(r.netArea)} m²`} x={lp.x - 1.5} y={lp.y + fs0 * 0.35} width={3} align="center" fontSize={fs0 * 0.78} fill="#475569" listening={false} />
                  </>
                )}
              </Group>
            );
          })}
        </Group>

        {/* planned room blocks (Quick Plan) */}
        <Group>
          {(floor.blocks ?? []).map((b) => {
            const color = ROOM_COLORS[b.type];
            const selected = s.selection.includes(b.id);
            return (
              <Group
                key={b.id}
                id={`block-${b.id}`}
                x={b.x}
                y={b.y}
                draggable={s.tool === 'select' && !floorLocked}
                onDragStart={() => queueMicrotask(() => s.commit())}
                onDragMove={(e) => {
                  // magnetic snap: align edges with the other blocks, then grid
                  let nx = e.target.x();
                  let ny = e.target.y();
                  for (const ob of floor.blocks ?? []) {
                    if (ob.id === b.id) continue;
                    const xCands: [number, number][] = [
                      [nx, ob.x + ob.w],
                      [nx + b.w, ob.x],
                      [nx, ob.x],
                      [nx + b.w, ob.x + ob.w],
                    ];
                    for (const [mine, theirs] of xCands) if (Math.abs(mine - theirs) < 0.28) nx += theirs - mine;
                    const yCands: [number, number][] = [
                      [ny, ob.y + ob.h],
                      [ny + b.h, ob.y],
                      [ny, ob.y],
                      [ny + b.h, ob.y + ob.h],
                    ];
                    for (const [mine, theirs] of yCands) if (Math.abs(mine - theirs) < 0.28) ny += theirs - mine;
                  }
                  if (s.snap.grid) {
                    nx = Math.round(nx / 0.05) * 0.05;
                    ny = Math.round(ny / 0.05) * 0.05;
                  }
                  e.target.position({ x: nx, y: ny });
                }}
                onDragEnd={(e) => {
                  s.mutate((f) => {
                    f.blocks = (f.blocks ?? []).map((x) => (x.id === b.id ? { ...x, x: e.target.x(), y: e.target.y() } : x));
                  }, false);
                }}
                onMouseEnter={() => setHoverId(b.id)}
                onMouseLeave={() => setHoverId((h) => (h === b.id ? null : h))}
                onClick={(e) => {
                  e.cancelBubble = true;
                  s.select([b.id], e.evt.shiftKey);
                }}
              >
                <Rect
                  width={b.w}
                  height={b.h}
                  fill={color + '4d'}
                  stroke={selected ? SEL : hoverId === b.id ? '#3b82f6' : color}
                  strokeWidth={selected ? 0.07 : 0.05}
                  dash={[0.3, 0.15]}
                  cornerRadius={0.06}
                />
                <Text
                  text={`${b.name || b.type}\n${fmt(b.w, 1)} × ${fmt(b.h, 1)} m`}
                  width={b.w}
                  y={b.h / 2 - 0.35}
                  align="center"
                  fontSize={Math.min(0.32, b.w / 5)}
                  fontStyle="bold"
                  fill="#1e293b"
                  listening={false}
                />
              </Group>
            );
          })}
        </Group>

        {/* walls + openings + stairs */}
        <Group visible={s.layers.walls.visible}>
          {floor.walls.map((w) => {
            const pts = arcPoints(w.a, w.b, w.bulge ?? 0, 24);
            const selected = s.selection.includes(w.id);
            const isDivider = w.kind === 'divider';
            return (
              <Group key={w.id}>
                <Line
                  points={pts.flatMap((p) => [p.x, p.y])}
                  stroke={isDivider ? (selected ? SEL : '#0d9488') : strokeFor(w)}
                  dash={isDivider ? [0.3, 0.18] : undefined}
                  strokeWidth={isDivider ? 0.05 : w.thickness}
                  lineCap="butt"
                  hitStrokeWidth={Math.max(w.thickness, 16 / view.s)}
                  onMouseEnter={() => setHoverId(w.id)}
                  onMouseLeave={() => setHoverId((h) => (h === w.id ? null : h))}
                  draggable={s.tool === 'select' && !w.locked && !wallsLocked && !floorLocked}
                  onDragStart={() => queueMicrotask(() => s.commit())}
                  onDragEnd={(e) => {
                    const dx = e.target.x();
                    const dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    s.mutate((f) => {
                      f.walls = f.walls.map((x) =>
                        x.id === w.id ? { ...x, a: { x: x.a.x + dx, y: x.a.y + dy }, b: { x: x.b.x + dx, y: x.b.y + dy } } : x,
                      );
                    }, false);
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    if (s.tool === 'select') s.select([w.id], e.evt.shiftKey);
                  }}
                />
                {selected && s.showDims && (
                  <Text
                    text={`${fmt(wallLength(w))} m`}
                    x={(w.a.x + w.b.x) / 2 - 0.7}
                    y={(w.a.y + w.b.y) / 2 - 0.5}
                    width={1.4}
                    align="center"
                    fontSize={0.24}
                    fill={SEL}
                    listening={false}
                  />
                )}
                {selected && !w.locked && !floorLocked && (
                  <>
                    {(['a', 'b'] as const).map((end) => (
                      <Circle
                        key={end}
                        x={w[end].x}
                        y={w[end].y}
                        radius={0.16}
                        fill="white"
                        stroke={HANDLE}
                        strokeWidth={0.04}
                        draggable
                        onDragStart={() => queueMicrotask(() => s.commit())}
                        onDragMove={(e) => {
                          const p = doSnap({ x: e.target.x(), y: e.target.y() }, [w.id]);
                          e.target.position(p);
                          s.mutate((f) => {
                            f.walls = f.walls.map((x) => (x.id === w.id ? { ...x, [end]: p } : x));
                          }, false, true);
                        }}
                        onDragEnd={() => s.bumpRev()}
                      />
                    ))}
                  </>
                )}
              </Group>
            );
          })}
          {floor.openings.map(renderOpening)}
          {floor.stairs.map(renderStair)}
        </Group>

        {/* furniture */}
        <Group>
          {floor.furniture.map(renderFurniture)}
          <Transformer
            ref={trRef}
            rotateEnabled
            ignoreStroke
            anchorSize={8}
            borderStroke={SEL}
            anchorStroke={SEL}
            anchorFill="white"
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          />
        </Group>

        {/* dimensions */}
        <Group>{floor.dims.map(renderDim)}</Group>
        </Layer>

        {/* draft previews */}
        <Layer listening={false}>{draft}</Layer>
      </Stage>

      {/* rulers */}
      <canvas ref={rulerXRef} width={size.w} height={22} className="pointer-events-none absolute left-0 top-0 opacity-90" />
      <canvas ref={rulerYRef} width={22} height={size.h} className="pointer-events-none absolute left-0 top-0 opacity-90" />

      {/* minimap */}
      <canvas
        ref={minimapRef}
        width={168}
        height={120}
        onClick={onMinimapClick}
        className="absolute bottom-3 right-3 cursor-pointer rounded-md border border-slate-600 shadow-lg"
        title="Mini-map — click to navigate"
      />

      {/* locked-plan banner */}
      {floorLocked && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg border border-amber-700 bg-amber-950/90 px-4 py-1.5 text-xs font-medium text-amber-300 shadow-lg">
          🔒 Plan locked — read-only. Measurements are frozen; unlock from the top bar to edit.
        </div>
      )}

      {/* floating context toolbar for the current selection */}
      {!floorLocked && s.tool === 'select' && s.selection.length > 0 && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-900/95 px-1 py-0.5 shadow-xl">
          <span className="px-2 text-[11px] text-slate-500">{s.selection.length} selected</span>
          {selRotatable && <CtxBtn title="Rotate 90°" onClick={() => s.rotateSelected(90)}>⟳ 90°</CtxBtn>}
          {selDoor && (
            <>
              <CtxBtn title="Swing direction" onClick={() => s.updateOpening(selDoor.id, { swing: selDoor.swing === 1 ? -1 : 1 })}>
                Swing
              </CtxBtn>
              <CtxBtn title="Flip to other side of wall" onClick={() => s.updateOpening(selDoor.id, { flip: !selDoor.flip })}>
                Flip
              </CtxBtn>
            </>
          )}
          <CtxBtn title="Duplicate (⌘D)" onClick={() => s.duplicateSelection()}>Duplicate</CtxBtn>
          <CtxBtn title={selAnyLocked ? 'Unlock' : 'Lock'} onClick={() => s.lockSelection(!selAnyLocked)}>
            {selAnyLocked ? 'Unlock' : 'Lock'}
          </CtxBtn>
          <button
            onClick={() => s.deleteSelected()}
            title="Delete (⌫)"
            className="rounded px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      )}

      {/* empty-state onboarding */}
      {showEmptyHint && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-300 bg-white/95 p-6 text-center shadow-lg">
          <button
            onClick={() => setHintDismissed(true)}
            className="pointer-events-auto absolute right-2 top-2 rounded px-2 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Dismiss — draw directly on the canvas"
          >
            ✕
          </button>
          <div className="mb-2 text-lg font-semibold text-slate-800">Start your floor plan</div>
          <button
            onClick={() => s.openQuickPlan()}
            className="pointer-events-auto mb-3 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-500"
          >
            📐 Quick Plan — type room sizes, we draw the plan
          </button>
          <div className="space-y-1.5 text-sm text-slate-600">
            <p><b>R</b> — drag a rectangle for the building outline</p>
            <p><b>W</b> — click points to draw walls · type a length + <b>Enter</b> for exact walls</p>
            <p><b>Trace</b> (top bar) — import a plan image and trace over it</p>
          </div>
          <div className="mt-3 text-xs text-slate-400">Scroll to pan · pinch or ⌘+scroll to zoom</div>
        </div>
      )}

      {/* status + live hints */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/85 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
        x {cursor.x.toFixed(2)} · y {cursor.y.toFixed(2)} · zoom {(view.s / 50).toFixed(2)}×
        <span className="ml-2 text-sky-300">
          {s.tool === 'wall' && wallPts.length === 0 && 'Wall: click to start · Shift = free angle'}
          {s.tool === 'wall' && wallPts.length > 0 && (typedLen ? `length ${typedLen} m — Enter to place` : 'click / type length ⏎ · right-click or Enter to finish · green dot closes')}
          {s.tool === 'rect' && 'drag a rectangle (or click two corners)'}
          {s.tool === 'arc' && 'click start → end → drag curvature → click'}
          {s.tool === 'dimension' && 'click two points, then the label side'}
          {s.tool === 'door' && 'hover a wall and click to place the door'}
          {s.tool === 'window' && 'hover a wall and click to place the window'}
          {s.tool === 'room' && 'click inside an enclosed space to assign the room type'}
          {s.tool === 'furniture' && !s.placingDef && 'pick an item from the Library panel →'}
          {s.tool === 'furniture' && s.placingDef && 'click to place · Shift-click to place several'}
          {s.tool === 'select' && 'scroll = pan · pinch/⌘-scroll = zoom · dbl-click wall = split · arrows = nudge'}
        </span>
        <span className="ml-2 text-red-400 font-semibold">
          {openEnds.length > 0 && `⚠ ${openEnds.length} open wall end${openEnds.length > 1 ? 's' : ''} (red dots) — close them or rooms/GFA won't count`}
        </span>
      </div>
    </div>
  );
}
