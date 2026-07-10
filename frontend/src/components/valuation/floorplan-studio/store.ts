// ============================================================================
// Floor Plan Studio store — Zustand, bound to the PropMetrik valuation backend.
// Persistence model: one valuation_floor_plans row per floor (floor_number =
// index in level order). canvas_json is the v2 studio document:
//   { version:'2', studio:true, floor:{...}, roof, projectMeta?, rooms:[...],
//     measurements:{grossArea, netUsableArea, efficiencyRatio} }
// rooms[] + measurements are computed by the exact geometry engine so the
// backend columns, report appendices, and analytics stay populated.
// ============================================================================
import { create } from 'zustand';
import { floorPlanApi } from '@/lib/valuation-api';
import type {
  BgImage,
  Dimension,
  DoorSub,
  Floor,
  Furniture,
  LayerId,
  Opening,
  PlanVersion,
  Project,
  RoomAnchor,
  RoomType,
  Roof,
  RoomBlock,
  Stair,
  StairKind,
  Vec,
  Wall,
  WindowSub,
} from './types';
import { BACKEND_ROOM_TYPE, DEFAULTS, ROOM_COLORS, uid } from './types';
import { blocksToWalls, cleanupPlanWalls, detectRooms, joinWalls, lerp, offsetWall, projectT, splitWall } from './geometry';
import { measureFloor } from './measure';

export type Tool =
  | 'select'
  | 'wall'
  | 'rect'
  | 'arc'
  | 'room'
  | 'door'
  | 'window'
  | 'stair'
  | 'furniture'
  | 'dimension'
  | 'calibrate';

export type ViewMode = '2d' | '3d' | 'split';
export type PanelTab = 'inspect' | 'rooms' | 'measure' | 'layers' | 'library' | '3d';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface LayerState {
  visible: boolean;
  locked: boolean;
}

const LAYERS: LayerId[] = ['walls', 'doors', 'windows', 'furniture', 'text', 'dimensions', 'electrical', 'plumbing'];

const emptyFloor = (level = 0, name = 'Ground Floor'): Floor => ({
  id: uid(),
  name,
  level,
  height: DEFAULTS.floorHeight,
  walls: [],
  openings: [],
  stairs: [],
  furniture: [],
  rooms: [],
  dims: [],
});

const emptyProject = (name = 'Floor Plan'): Project => ({
  id: uid(),
  name,
  floors: [emptyFloor()],
  roof: { kind: 'gable', height: 1.6, overhang: 0.4 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1,
});

// ---------------------------------------------------------------------------
// v2 document serialization
// ---------------------------------------------------------------------------

/** backend room payload — pre-normalized types, exact areas */
function backendRooms(floor: Floor) {
  const detected = detectRooms(floor.walls, floor.rooms);
  return detected.map((r) => {
    const type: RoomType = r.anchor?.type ?? 'Other';
    return {
      id: r.anchor?.id ?? r.key,
      name: r.anchor?.name || r.anchor?.type || 'Room',
      type: BACKEND_ROOM_TYPE[type],
      area: Math.round(r.netArea * 100) / 100,
      perimeter: Math.round(r.netPerimeter * 100) / 100,
      polygon: (r.innerPoly ?? r.poly).map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })),
      fillColor: ROOM_COLORS[type],
    };
  });
}

function buildCanvasDoc(project: Project, floor: Floor, isPrimary: boolean) {
  const m = measureFloor(floor);
  return {
    version: '2',
    studio: true,
    floor: {
      id: floor.id,
      name: floor.name,
      level: floor.level,
      height: floor.height,
      walls: floor.walls,
      openings: floor.openings,
      stairs: floor.stairs,
      furniture: floor.furniture,
      rooms: floor.rooms, // room anchors
      dims: floor.dims,
      blocks: floor.blocks ?? [],
      bg: floor.bg,
      locked: floor.locked ?? false,
    },
    roof: project.roof,
    ...(isPrimary ? { projectMeta: { name: project.name, versions: project.versions ?? [] } } : {}),
    rooms: backendRooms(floor),
    measurements: {
      grossArea: Math.round(m.grossFloorArea * 100) / 100,
      netUsableArea: Math.round(m.netFloorArea * 100) / 100,
      efficiencyRatio: m.grossFloorArea > 0 ? Math.round((m.netFloorArea / m.grossFloorArea) * 10000) / 10000 : 0,
    },
  };
}

interface V2Doc {
  version: string;
  studio?: boolean;
  floor?: Partial<Floor> & { rooms?: RoomAnchor[] };
  roof?: Roof;
  projectMeta?: { name?: string; versions?: PlanVersion[] };
}

function floorFromDoc(doc: V2Doc, row: { is_locked?: boolean }): Floor {
  const f = doc.floor ?? {};
  return {
    id: (f.id as string) || uid(),
    name: f.name || 'Ground Floor',
    level: f.level ?? 0,
    height: f.height ?? DEFAULTS.floorHeight,
    walls: (f.walls as Wall[]) ?? [],
    openings: (f.openings as Opening[]) ?? [],
    stairs: (f.stairs as Stair[]) ?? [],
    furniture: (f.furniture as Furniture[]) ?? [],
    rooms: (f.rooms as RoomAnchor[]) ?? [],
    dims: (f.dims as Dimension[]) ?? [],
    blocks: (f.blocks as RoomBlock[]) ?? [],
    bg: f.bg as BgImage | undefined,
    locked: !!row.is_locked,
  };
}

type Snapshot = string;

interface State {
  project: Project;
  floorId: string;
  rev: number;
  tool: Tool;
  view: ViewMode;
  selection: string[];
  clipboard: Furniture[] | null;
  layers: Record<LayerId, LayerState>;
  snap: { grid: boolean; size: number; corners: boolean; walls: boolean };
  showGrid: boolean;
  showDims: boolean;
  showLabels: boolean;
  fullscreen: boolean;
  panelTab: PanelTab;
  doorSub: DoorSub;
  windowSub: WindowSub;
  stairKind: StairKind;
  wallKind: Wall['kind'];
  placingDef: string | null;
  roomType: RoomType;
  three: {
    mode: 'dollhouse' | 'exterior';
    transparent: boolean;
    shadows: boolean;
    isolate: boolean;
    walk: boolean;
    sectionY: number | null;
    sunAz: number;
    sunEl: number;
  };
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  // server binding
  valuationId: string | null;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  savedAt: string | null;
  /** floor.id → backend plan row id */
  planIds: Record<string, string>;
  /** true once loadValuation has completed for the bound valuation — flush is a no-op before that */
  ready: boolean;

  setTool: (t: Tool) => void;
  setView: (v: ViewMode) => void;
  setPanelTab: (t: PanelTab) => void;
  openQuickPlan: () => void;
  setThree: (patch: Partial<State['three']>) => void;
  setLayer: (id: LayerId, patch: Partial<LayerState>) => void;
  setSnap: (patch: Partial<State['snap']>) => void;
  toggle: (k: 'showGrid' | 'showDims' | 'showLabels' | 'fullscreen') => void;
  setPlacing: (patch: Partial<Pick<State, 'doorSub' | 'windowSub' | 'stairKind' | 'wallKind' | 'placingDef' | 'roomType'>>) => void;

  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  mutate: (fn: (f: Floor, p: Project) => void, commit?: boolean, quiet?: boolean) => void;
  bumpRev: () => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;

  addWall: (w: Omit<Wall, 'id'>) => string;
  addWalls: (ws: Omit<Wall, 'id'>[]) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  splitWallAt: (id: string, t: number) => void;
  joinSelectedWalls: () => void;
  offsetSelectedWall: (d: number) => void;

  addOpening: (o: Omit<Opening, 'id'>) => void;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  addStair: (s: Omit<Stair, 'id'>) => void;
  updateStair: (id: string, patch: Partial<Stair>) => void;
  addFurniture: (f: Omit<Furniture, 'id'>) => string;
  updateFurniture: (id: string, patch: Partial<Furniture>) => void;
  setRoomAnchor: (x: number, y: number, type: RoomType) => void;
  updateRoom: (id: string, patch: Partial<RoomAnchor>) => void;
  addDim: (d: Omit<Dimension, 'id'>) => void;

  /** one-click repair: strays, duplicate walls (re-homes openings), near-miss gaps */
  cleanupPlan: () => { removedStray: number; removedDuplicate: number; healedGaps: number };
  addBlock: (b: Omit<RoomBlock, 'id' | 'x' | 'y'>) => void;
  updateBlock: (id: string, patch: Partial<RoomBlock>) => void;
  deleteBlock: (id: string) => void;
  clearBlocks: () => void;
  generateWallsFromBlocks: () => void;

  deleteSelected: () => void;
  moveSelected: (dx: number, dy: number) => void;
  rotateSelected: (deg: number) => void;
  copySelection: () => void;
  paste: () => void;
  duplicateSelection: () => void;
  lockSelection: (locked: boolean) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  alignSelection: (edge: 'left' | 'right' | 'top' | 'bottom' | 'cx' | 'cy') => void;

  setBg: (bg: BgImage | undefined) => void;
  updateBg: (patch: Partial<BgImage>) => void;

  addFloor: (opts?: { duplicate?: boolean; level?: number; name?: string }) => void;
  deleteFloor: (id: string) => void;
  setFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;
  setFloorHeight: (id: string, h: number) => void;
  setRoof: (patch: Partial<Roof>) => void;

  setFloorLocked: (id: string, locked: boolean) => Promise<void>;
  saveVersion: (label: string) => void;
  restoreVersion: (id: string) => void;
  deleteVersion: (id: string) => void;

  // server persistence
  loadValuation: (valuationId: string, projectName?: string) => Promise<void>;
  /** immediate save of all dirty floors; withImages also renders + uploads per-floor PNGs */
  flush: (opts?: { withImages?: boolean }) => Promise<boolean>;
  saveNow: () => void;
}

const snap = (p: Project): Snapshot => JSON.stringify({ floors: p.floors, roof: p.roof });

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastNudgeAt = 0;
/** per-floor serialized hash of the last successfully saved doc */
const savedHash = new Map<string, string>();
let flushInFlight: Promise<boolean> | null = null;

export const useStore = create<State>((set, get) => {
  const scheduleSave = () => {
    if (!get().valuationId) return;
    set({ saveState: 'dirty' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().flush();
    }, 1500);
  };

  const boot = emptyProject();

  return {
    project: boot,
    floorId: boot.floors[0].id,
    rev: 0,
    tool: 'select',
    view: 'split',
    selection: [],
    clipboard: null,
    layers: Object.fromEntries(LAYERS.map((l) => [l, { visible: true, locked: false }])) as Record<LayerId, LayerState>,
    snap: { grid: true, size: 0.1, corners: true, walls: true },
    showGrid: true,
    showDims: true,
    showLabels: true,
    fullscreen: false,
    panelTab: 'measure',
    doorSub: 'single',
    windowSub: 'sliding',
    stairKind: 'straight',
    wallKind: 'exterior',
    placingDef: null,
    roomType: 'Living Room',
    three: { mode: 'dollhouse', transparent: false, shadows: true, isolate: false, walk: false, sectionY: null, sunAz: 45, sunEl: 55 },
    undoStack: [],
    redoStack: [],

    valuationId: null,
    loading: false,
    loadError: null,
    saveState: 'idle',
    savedAt: null,
    ready: false,
    planIds: {},

    setTool: (t) => set({ tool: t, placingDef: t === 'furniture' ? get().placingDef : null }),
    setView: (view) => set({ view }),
    setPanelTab: (panelTab) => set({ panelTab }),
    openQuickPlan: () => set({ panelTab: 'rooms', fullscreen: false, view: get().view === '3d' ? 'split' : get().view }),
    setThree: (patch) => set((s) => ({ three: { ...s.three, ...patch } })),
    setLayer: (id, patch) => set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], ...patch } } })),
    setSnap: (patch) => set((s) => ({ snap: { ...s.snap, ...patch } })),
    toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<State>),
    setPlacing: (patch) => set(patch as Partial<State>),

    select: (ids, additive) => set((s) => ({ selection: additive ? [...new Set([...s.selection, ...ids])] : ids })),
    clearSelection: () => set({ selection: [] }),

    commit: () => {
      // Konva can invoke handlers synchronously inside a react-konva commit;
      // capture the undo snapshot NOW (pure read) but defer the store write one
      // microtask so React never observes a render-phase update.
      const snapNow = snap(get().project);
      queueMicrotask(() =>
        set((s) => ({
          undoStack: [...s.undoStack.slice(-49), snapNow],
          redoStack: [],
        })),
      );
    },

    mutate: (fn, commitFirst = true, quiet = false) => {
      const s = get();
      const cur = s.project.floors.find((fl) => fl.id === s.floorId);
      if (cur?.locked) return;
      if (commitFirst) s.commit();
      const p: Project = { ...s.project, floors: s.project.floors.map((f) => ({ ...f })) };
      const f = p.floors.find((fl) => fl.id === s.floorId)!;
      fn(f, p);
      set({ project: p, rev: quiet ? s.rev : s.rev + 1 });
      scheduleSave();
    },
    bumpRev: () => set((s) => ({ rev: s.rev + 1 })),

    undo: () => {
      const s = get();
      const last = s.undoStack[s.undoStack.length - 1];
      if (!last) return;
      const cur = snap(s.project);
      const data = JSON.parse(last) as { floors: Floor[]; roof: Roof };
      const p = { ...s.project, floors: data.floors, roof: data.roof };
      set({
        project: p,
        floorId: p.floors.some((f) => f.id === s.floorId) ? s.floorId : p.floors[0].id,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, cur],
        rev: s.rev + 1,
        selection: [],
      });
      scheduleSave();
    },
    redo: () => {
      const s = get();
      const nxt = s.redoStack[s.redoStack.length - 1];
      if (!nxt) return;
      const cur = snap(s.project);
      const data = JSON.parse(nxt) as { floors: Floor[]; roof: Roof };
      const p = { ...s.project, floors: data.floors, roof: data.roof };
      set({
        project: p,
        floorId: p.floors.some((f) => f.id === s.floorId) ? s.floorId : p.floors[0].id,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, cur],
        rev: s.rev + 1,
        selection: [],
      });
      scheduleSave();
    },

    addWall: (w) => {
      const id = uid();
      get().mutate((f) => {
        f.walls = [...f.walls, { ...w, id }];
      });
      return id;
    },
    addWalls: (ws) =>
      get().mutate((f) => {
        f.walls = [...f.walls, ...ws.map((w) => ({ ...w, id: uid() }))];
      }),
    updateWall: (id, patch) =>
      get().mutate((f) => {
        f.walls = f.walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
      }),
    splitWallAt: (id, t) =>
      get().mutate((f) => {
        const w = f.walls.find((x) => x.id === id);
        if (!w) return;
        const [w1, w2] = splitWall(w, t);
        f.walls = f.walls.filter((x) => x.id !== id).concat([w1, w2]);
        f.openings = f.openings.map((o) => {
          if (o.wallId !== id) return o;
          return o.t <= t
            ? { ...o, wallId: w1.id, t: t > 0 ? o.t / t : 0 }
            : { ...o, wallId: w2.id, t: (o.t - t) / (1 - t) };
        });
      }),
    joinSelectedWalls: () => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const sel = f.walls.filter((w) => s.selection.includes(w.id));
      if (sel.length !== 2) return;
      const joined = joinWalls(sel[0], sel[1]);
      if (!joined) return;
      s.mutate((fl) => {
        fl.walls = fl.walls.filter((w) => w.id !== sel[1].id).map((w) => (w.id === sel[0].id ? joined : w));
        fl.openings = fl.openings.filter((o) => o.wallId !== sel[1].id);
      });
      set({ selection: [joined.id] });
    },
    offsetSelectedWall: (d) => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const w = f.walls.find((x) => s.selection.includes(x.id) && !x.bulge);
      if (!w) return;
      s.mutate((fl) => {
        fl.walls = [...fl.walls, offsetWall(w, d)];
      });
    },

    addOpening: (o) =>
      get().mutate((f) => {
        f.openings = [...f.openings, { ...o, id: uid() }];
      }),
    updateOpening: (id, patch) =>
      get().mutate((f) => {
        f.openings = f.openings.map((o) => (o.id === id ? { ...o, ...patch } : o));
      }),
    addStair: (st) =>
      get().mutate((f) => {
        f.stairs = [...f.stairs, { ...st, id: uid() }];
      }),
    updateStair: (id, patch) =>
      get().mutate((f) => {
        f.stairs = f.stairs.map((st) => (st.id === id ? { ...st, ...patch } : st));
      }),
    addFurniture: (fu) => {
      const id = uid();
      get().mutate((f) => {
        f.furniture = [...f.furniture, { ...fu, id }];
      });
      return id;
    },
    updateFurniture: (id, patch) =>
      get().mutate((f) => {
        f.furniture = f.furniture.map((x) => (x.id === id ? { ...x, ...patch } : x));
      }),
    setRoomAnchor: (x, y, type) =>
      get().mutate((f) => {
        f.rooms = [...f.rooms, { id: uid(), x, y, type }];
      }),
    updateRoom: (id, patch) =>
      get().mutate((f) => {
        f.rooms = f.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
      }),
    addDim: (d) =>
      get().mutate((f) => {
        f.dims = [...f.dims, { ...d, id: uid() }];
      }),

    cleanupPlan: () => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const res = cleanupPlanWalls(f.walls);
      s.mutate((fl) => {
        fl.walls = res.walls;
        // re-home openings whose host wall was removed as a duplicate
        fl.openings = fl.openings
          .map((o) => {
            const survivorId = res.openings.removedWallIds.get(o.wallId);
            if (!survivorId) return o;
            const survivor = res.walls.find((w) => w.id === survivorId);
            const oldHost = f.walls.find((w) => w.id === o.wallId);
            if (!survivor || !oldHost) return o;
            const c = lerp(oldHost.a, oldHost.b, o.t);
            return { ...o, wallId: survivorId, t: Math.max(0.02, Math.min(0.98, projectT(c, survivor.a, survivor.b))) };
          })
          .filter((o) => res.walls.some((w) => w.id === o.wallId));
      });
      set({ selection: [] });
      return { removedStray: res.removedStray, removedDuplicate: res.removedDuplicate, healedGaps: res.healedGaps };
    },
    addBlock: (b) => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const pts = [
        ...f.walls.flatMap((w) => [w.a, w.b]),
        ...(f.blocks ?? []).flatMap((bl) => [
          { x: bl.x, y: bl.y },
          { x: bl.x + bl.w, y: bl.y + bl.h },
        ]),
      ];
      const maxX = pts.length ? Math.max(...pts.map((p: Vec) => p.x)) + 0.8 : 1;
      const minY = pts.length ? Math.min(...pts.map((p: Vec) => p.y)) : 1;
      s.mutate((fl) => {
        fl.blocks = [...(fl.blocks ?? []), { ...b, id: uid(), x: maxX, y: Math.max(minY, 0) }];
      });
    },
    updateBlock: (id, patch) =>
      get().mutate((f) => {
        f.blocks = (f.blocks ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b));
      }),
    deleteBlock: (id) =>
      get().mutate((f) => {
        f.blocks = (f.blocks ?? []).filter((b) => b.id !== id);
      }),
    clearBlocks: () =>
      get().mutate((f) => {
        f.blocks = [];
      }),
    generateWallsFromBlocks: () => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const blocks = f.blocks ?? [];
      if (!blocks.length) return;
      const segs = blocksToWalls(blocks).filter((seg) => {
        // fuse with hand-drawn geometry: drop generated segments that already
        // lie on an existing wall instead of doubling it
        const samples = [0.25, 0.5, 0.75].map((t) => lerp(seg.a, seg.b, t));
        return !f.walls.some(
          (w) =>
            !w.bulge &&
            w.kind !== 'divider' &&
            samples.every((p) => {
              const t = projectT(p, w.a, w.b);
              const q = lerp(w.a, w.b, t);
              return Math.hypot(p.x - q.x, p.y - q.y) < w.thickness / 2 + 0.08;
            }),
        );
      });
      s.mutate((fl) => {
        fl.walls = [
          ...fl.walls,
          ...segs.map((w) => ({
            id: uid(),
            a: w.a,
            b: w.b,
            kind: w.kind,
            thickness: DEFAULTS.wallThickness[w.kind],
            height: fl.height,
          })),
        ];
        fl.rooms = [
          ...fl.rooms,
          ...blocks.map((b) => ({
            id: uid(),
            x: b.x + b.w / 2,
            y: b.y + b.h / 2,
            type: b.type,
            name: b.name || undefined,
          })),
        ];
        fl.blocks = [];
      });
      set({ selection: [] });
    },

    deleteSelected: () => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      s.mutate((f) => {
        const lockedWall = new Set(f.walls.filter((w) => w.locked).map((w) => w.id));
        f.walls = f.walls.filter((w) => !ids.has(w.id) || lockedWall.has(w.id));
        f.openings = f.openings.filter((o) => !ids.has(o.id) && f.walls.some((w) => w.id === o.wallId));
        f.stairs = f.stairs.filter((st) => !ids.has(st.id) || st.locked);
        f.furniture = f.furniture.filter((fu) => !ids.has(fu.id) || fu.locked);
        f.rooms = f.rooms.filter((r) => !ids.has(r.id));
        f.dims = f.dims.filter((d) => !ids.has(d.id));
        f.blocks = (f.blocks ?? []).filter((b) => !ids.has(b.id));
      });
      set({ selection: [] });
    },
    moveSelected: (dx, dy) => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      const now = Date.now();
      const batch = now - lastNudgeAt < 900;
      lastNudgeAt = now;
      s.mutate((f) => {
        f.walls = f.walls.map((w) =>
          ids.has(w.id) && !w.locked
            ? { ...w, a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } }
            : w,
        );
        f.furniture = f.furniture.map((x) => (ids.has(x.id) && !x.locked ? { ...x, x: x.x + dx, y: x.y + dy } : x));
        f.stairs = f.stairs.map((x) => (ids.has(x.id) && !x.locked ? { ...x, x: x.x + dx, y: x.y + dy } : x));
        f.rooms = f.rooms.map((x) => (ids.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x));
        f.blocks = (f.blocks ?? []).map((x) => (ids.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x));
      }, !batch);
    },
    rotateSelected: (deg) => {
      const s = get();
      if (!s.selection.length) return;
      const ids = new Set(s.selection);
      s.mutate((f) => {
        f.furniture = f.furniture.map((x) => (ids.has(x.id) && !x.locked ? { ...x, rot: (x.rot + deg) % 360 } : x));
        f.stairs = f.stairs.map((x) => (ids.has(x.id) && !x.locked ? { ...x, rot: (x.rot + deg) % 360 } : x));
        f.blocks = (f.blocks ?? []).map((x) => (ids.has(x.id) ? { ...x, w: x.h, h: x.w } : x));
      });
    },
    copySelection: () => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const fu = f.furniture.filter((x) => s.selection.includes(x.id));
      if (fu.length) set({ clipboard: fu.map((x) => ({ ...x })) });
    },
    paste: () => {
      const s = get();
      if (!s.clipboard?.length) return;
      const ids: string[] = [];
      s.mutate((f) => {
        for (const c of s.clipboard!) {
          const id = uid();
          ids.push(id);
          f.furniture = [...f.furniture, { ...c, id, x: c.x + 0.5, y: c.y + 0.5, group: undefined }];
        }
      });
      set({ selection: ids });
    },
    duplicateSelection: () => {
      get().copySelection();
      get().paste();
    },
    lockSelection: (locked) => {
      const s = get();
      const ids = new Set(s.selection);
      s.mutate((f) => {
        f.walls = f.walls.map((w) => (ids.has(w.id) ? { ...w, locked } : w));
        f.furniture = f.furniture.map((x) => (ids.has(x.id) ? { ...x, locked } : x));
        f.stairs = f.stairs.map((x) => (ids.has(x.id) ? { ...x, locked } : x));
      });
    },
    groupSelection: () => {
      const s = get();
      const g = uid();
      const ids = new Set(s.selection);
      s.mutate((f) => {
        f.furniture = f.furniture.map((x) => (ids.has(x.id) ? { ...x, group: g } : x));
      });
    },
    ungroupSelection: () => {
      const s = get();
      const ids = new Set(s.selection);
      s.mutate((f) => {
        f.furniture = f.furniture.map((x) => (ids.has(x.id) ? { ...x, group: undefined } : x));
      });
    },
    alignSelection: (edge) => {
      const s = get();
      const f = s.project.floors.find((fl) => fl.id === s.floorId)!;
      const items = f.furniture.filter((x) => s.selection.includes(x.id));
      if (items.length < 2) return;
      const ref =
        edge === 'left' || edge === 'cx'
          ? Math.min(...items.map((i) => i.x))
          : edge === 'right'
            ? Math.max(...items.map((i) => i.x))
            : edge === 'top' || edge === 'cy'
              ? Math.min(...items.map((i) => i.y))
              : Math.max(...items.map((i) => i.y));
      s.mutate((fl) => {
        fl.furniture = fl.furniture.map((x) => {
          if (!s.selection.includes(x.id)) return x;
          if (edge === 'left' || edge === 'right' || edge === 'cx') return { ...x, x: ref };
          return { ...x, y: ref };
        });
      });
    },

    setBg: (bg) =>
      get().mutate((f) => {
        f.bg = bg;
      }),
    updateBg: (patch) =>
      get().mutate((f) => {
        if (f.bg) f.bg = { ...f.bg, ...patch };
      }, false),

    addFloor: (opts) => {
      const s = get();
      s.commit();
      const p = { ...s.project };
      const src = p.floors.find((f) => f.id === s.floorId)!;
      const maxLevel = Math.max(...p.floors.map((f) => f.level));
      const level = opts?.level ?? maxLevel + 1;
      const name =
        opts?.name ??
        (level < 0 ? 'Basement' : level === 0 ? 'Ground Floor' : level % 1 !== 0 ? 'Mezzanine' : `Floor ${level}`);
      const nf: Floor = opts?.duplicate
        ? { ...(JSON.parse(JSON.stringify(src)) as Floor), id: uid(), name, level, locked: false }
        : { ...emptyFloor(level, name), id: uid() };
      p.floors = [...p.floors, nf].sort((a, b) => a.level - b.level);
      set({ project: p, floorId: nf.id, rev: s.rev + 1 });
      scheduleSave();
    },
    deleteFloor: (id) => {
      const s = get();
      if (s.project.floors.length <= 1) return;
      if (s.project.floors.find((f) => f.id === id)?.locked) return;
      s.commit();
      const p = { ...s.project, floors: s.project.floors.filter((f) => f.id !== id) };
      set({ project: p, floorId: p.floors[0].id, rev: s.rev + 1 });
      scheduleSave();
    },
    setFloor: (id) => set({ floorId: id, selection: [] }),
    renameFloor: (id, name) => {
      const s = get();
      const p = { ...s.project, floors: s.project.floors.map((f) => (f.id === id ? { ...f, name } : f)) };
      set({ project: p, rev: s.rev + 1 });
      scheduleSave();
    },
    setFloorHeight: (id, h) => {
      const s = get();
      if (s.project.floors.find((f) => f.id === id)?.locked) return;
      s.commit();
      const p = { ...s.project, floors: s.project.floors.map((f) => (f.id === id ? { ...f, height: h } : f)) };
      set({ project: p, rev: s.rev + 1 });
      scheduleSave();
    },
    setRoof: (patch) => {
      const s = get();
      s.commit();
      set({ project: { ...s.project, roof: { ...s.project.roof, ...patch } }, rev: s.rev + 1 });
      scheduleSave();
    },

    // -----------------------------------------------------------------------
    // plan lock — server-enforced (is_locked column) + local mirror
    // -----------------------------------------------------------------------
    setFloorLocked: async (id, locked) => {
      const s = get();
      const applyLocal = () => {
        const p = {
          ...get().project,
          floors: get().project.floors.map((f) => (f.id === id ? { ...f, locked } : f)),
        };
        set({ project: p, rev: get().rev + 1, selection: [] });
      };
      if (!s.valuationId) {
        applyLocal();
        return;
      }
      // make sure the latest content is persisted before freezing it
      await s.flush();
      const planId = get().planIds[id];
      if (!planId) return;
      try {
        const res = locked ? await floorPlanApi.lock(planId) : await floorPlanApi.unlock(planId);
        if (res.success) applyLocal();
        else alert(res.error || 'Could not change lock state (are you signed in?)');
      } catch {
        alert('Could not change lock state');
      }
    },
    saveVersion: (label) => {
      const s = get();
      const v: PlanVersion = {
        id: uid(),
        label: label || `Version ${(s.project.versions?.length ?? 0) + 1}`,
        createdAt: new Date().toISOString(),
        floors: JSON.parse(JSON.stringify(s.project.floors)) as Floor[],
        roof: { ...s.project.roof },
      };
      set({ project: { ...s.project, versions: [...(s.project.versions ?? []), v] } });
      scheduleSave();
    },
    restoreVersion: (id) => {
      const s = get();
      const v = s.project.versions?.find((x) => x.id === id);
      if (!v) return;
      s.commit();
      const floors = JSON.parse(JSON.stringify(v.floors)) as Floor[];
      const p = { ...s.project, floors, roof: { ...v.roof } };
      set({
        project: p,
        floorId: floors.some((f) => f.id === s.floorId) ? s.floorId : floors[0].id,
        rev: s.rev + 1,
        selection: [],
      });
      scheduleSave();
    },
    deleteVersion: (id) => {
      const s = get();
      set({ project: { ...s.project, versions: (s.project.versions ?? []).filter((v) => v.id !== id) } });
      scheduleSave();
    },

    // -----------------------------------------------------------------------
    // server persistence
    // -----------------------------------------------------------------------
    loadValuation: async (valuationId, projectName) => {
      set({ loading: true, loadError: null, valuationId, planIds: {}, ready: false });
      savedHash.clear();
      try {
        const res = await floorPlanApi.getByValuation(valuationId);
        if (!res.success) throw new Error(res.error || 'Failed to load floor plans');
        const rows = (res.data ?? []) as unknown as Array<{
          id: string;
          floor_number: number;
          floor_label: string;
          canvas_version: string;
          is_locked?: boolean;
          canvas_json: unknown;
        }>;
        const v2 = rows
          .filter((r) => (r.canvas_json as V2Doc | null)?.studio)
          .sort((a, b) => a.floor_number - b.floor_number);

        let project: Project;
        const planIds: Record<string, string> = {};
        if (v2.length) {
          const floors = v2.map((r) => {
            const fl = floorFromDoc(r.canvas_json as V2Doc, r);
            planIds[fl.id] = r.id;
            return fl;
          });
          const primary = v2[0].canvas_json as V2Doc;
          project = {
            id: valuationId,
            name: primary.projectMeta?.name || projectName || 'Floor Plan',
            floors,
            roof: primary.roof ?? { kind: 'gable', height: 1.6, overhang: 0.4 },
            versions: primary.projectMeta?.versions ?? [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          };
          // mark loaded floors clean
          for (const fl of floors) {
            savedHash.set(fl.id, JSON.stringify(buildCanvasDoc(project, fl, fl.id === floors[0].id)));
          }
        } else {
          project = emptyProject(projectName || 'Floor Plan');
        }
        set({
          project,
          floorId: project.floors[0].id,
          planIds,
          loading: false,
          rev: get().rev + 1,
          undoStack: [],
          redoStack: [],
          selection: [],
          saveState: 'idle',
          ready: true,
        });
      } catch (e) {
        set({ loading: false, loadError: e instanceof Error ? e.message : 'Failed to load floor plans' });
      }
    },

    flush: async (opts) => {
      const run = async (): Promise<boolean> => {
        await Promise.resolve(); // detach from any render/cleanup phase before setting state
        const s = get();
        if (!s.valuationId) return true;
        if (!s.ready) return true; // load not finished — flushing now would save the empty boot project
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        set({ saveState: 'saving' });
        try {
          const project = s.project;
          const floors = [...project.floors].sort((a, b) => a.level - b.level);
          const planIds = { ...get().planIds };

          for (let i = 0; i < floors.length; i++) {
            const floor = floors[i];
            const doc = buildCanvasDoc(project, floor, i === 0);
            const hash = JSON.stringify(doc);
            const existingId = planIds[floor.id];
            const dirty = savedHash.get(floor.id) !== hash;
            if (floor.locked && existingId) continue; // frozen server-side; never overwrite
            if (!dirty && existingId && !opts?.withImages) continue;
            const res = await floorPlanApi.create(s.valuationId, {
              canvas_json: doc as unknown as string,
              floor_number: i,
              floor_label: floor.name,
              scale_pixels_per_meter: 1, // v2 geometry is already in meters
            });
            if (!res.success || !res.data?.id) throw new Error(res.error || 'Save failed');
            planIds[floor.id] = res.data.id;
            savedHash.set(floor.id, hash);

            if (opts?.withImages) {
              try {
                const { floorToSVG, svgToPng } = await import('./exporters');
                const png = await svgToPng(floorToSVG(floor, project), 2);
                await floorPlanApi.uploadImage(planIds[floor.id], png.url, png.w * 2, png.h * 2);
              } catch (imgErr) {
                console.warn('Floor plan image upload failed', imgErr);
              }
            }
          }

          // auto-capture the current 3D view into the report (Appendix B — 3D Views),
          // replacing the previous auto-snapshot so reports never accumulate stale views
          if (opts?.withImages && typeof window !== 'undefined') {
            try {
              const cap = (window as unknown as { __fpCapture3D?: () => string }).__fpCapture3D;
              const shot = cap?.();
              if (shot && shot.length > 1000) {
                const existing = await floorPlanApi.listDocuments(s.valuationId, '3d_view');
                if (existing.success) {
                  for (const d of existing.data) await floorPlanApi.deleteDocument(s.valuationId, d.id);
                }
                await floorPlanApi.uploadReportPhoto(
                  s.valuationId,
                  shot,
                  `3D View — ${get().three.mode === 'dollhouse' ? 'Dollhouse' : 'Exterior'}`,
                  '3d_view',
                );
              }
            } catch (e3d) {
              console.warn('3D snapshot capture failed', e3d);
            }
          }

          // remove server rows for floors that no longer exist (never legacy rows)
          const keepIds = new Set(Object.values(planIds).filter(Boolean));
          const listed = await floorPlanApi.getByValuation(s.valuationId);
          if (listed.success) {
            for (const row of (listed.data ?? []) as Array<{ id: string; canvas_json: unknown; is_locked?: boolean }>) {
              if ((row.canvas_json as V2Doc | null)?.studio && !keepIds.has(row.id) && !row.is_locked) {
                await floorPlanApi.delete(row.id);
              }
            }
          }

          set({ planIds, saveState: 'saved', savedAt: new Date().toISOString() });
          return true;
        } catch (e) {
          console.error('Floor plan save failed', e);
          set({ saveState: 'error' });
          return false;
        }
      };
      // serialize concurrent flushes
      if (flushInFlight) await flushInFlight.catch(() => undefined);
      flushInFlight = run();
      const ok = await flushInFlight;
      flushInFlight = null;
      return ok;
    },

    saveNow: () => {
      void get().flush();
    },
  };
});

declare global {
  interface Window {
    __fp?: typeof useStore;
  }
}
if (typeof window !== 'undefined') window.__fp = useStore;
