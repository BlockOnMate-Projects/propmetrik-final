// ============================================================================
// Right-hand panels: Inspector · Rooms · Measurements · Layers · Library · 3D
// ============================================================================
import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { measureBuilding } from '../measure';
import { fmt, fmtM, fmtM2 } from '../measure';
import { LIBRARY, LIB_CATEGORIES, libDef } from '../library';
import { DEFAULTS, ROOM_TYPES, type LayerId, type RoofKind } from '../types';
import { dist, norm, openEndpoints, sub, wallLength } from '../geometry';

import type { PanelTab as Tab } from '../store';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-xs text-slate-400">{label}</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const Num = ({ value, onChange, step = 0.05, min = 0.01, max = 100 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <input
    type="number"
    className="w-20 rounded bg-slate-800 px-1.5 py-0.5 text-right text-xs text-slate-200"
    value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
    step={step}
    min={min}
    max={max}
    onChange={(e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) onChange(v);
    }}
  />
);

const Btn = ({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
  <button onClick={onClick} className={`rounded px-2 py-1 text-xs ${danger ? 'bg-red-900/40 text-red-300 hover:bg-red-900/70' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
    {children}
  </button>
);

const MRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between border-b border-slate-800 py-1 text-xs ${bold ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
    <span>{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);

function Inspector() {
  const s = useStore();
  const floor = s.project.floors.find((f) => f.id === s.floorId)!;
  const sel = s.selection;
  const wall = floor.walls.find((w) => sel.includes(w.id));
  const opening = floor.openings.find((o) => sel.includes(o.id));
  const furn = floor.furniture.filter((f) => sel.includes(f.id));
  const stair = floor.stairs.find((st) => sel.includes(st.id));
  const room = floor.rooms.find((r) => sel.includes(r.id));
  const dim = floor.dims.find((d) => sel.includes(d.id));
  const block = (floor.blocks ?? []).find((b) => sel.includes(b.id));
  const selWalls = floor.walls.filter((w) => sel.includes(w.id));

  if (!sel.length)
    return (
      <div className="p-3 text-xs leading-relaxed text-slate-500">
        Nothing selected.
        <br />
        <br />
        · Click any wall, door, window, stair or object to edit it — a toolbar appears above the canvas.
        <br />
        · Double-click a wall to <b>split</b> it; drag its endpoints to reshape.
        <br />
        · Shift-click multi-selects; drag on empty space for a marquee.
        <br />
        · Arrow keys nudge the selection.
        <br />
        · Scroll = pan · pinch or ⌘+scroll = zoom · Space-drag = pan.
      </div>
    );

  return (
    <div className="space-y-3 p-3">
      <div className="text-xs font-semibold text-slate-200">
        {sel.length} selected
        <div className="mt-1 flex flex-wrap gap-1">
          <Btn onClick={() => s.duplicateSelection()}>Duplicate</Btn>
          <Btn onClick={() => s.lockSelection(true)}>Lock</Btn>
          <Btn onClick={() => s.lockSelection(false)}>Unlock</Btn>
          <Btn danger onClick={() => s.deleteSelected()}>
            Delete
          </Btn>
        </div>
      </div>

      {wall && selWalls.length === 1 && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-sky-400">Wall — {fmt(wallLength(wall))} m</div>
          <Row label="Type">
            <select value={wall.kind} onChange={(e) => s.updateWall(wall.id, { kind: e.target.value as typeof wall.kind })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              <option value="exterior">Exterior</option>
              <option value="interior">Interior</option>
              <option value="partition">Partition</option>
              <option value="divider">Divider (open plan)</option>
            </select>
          </Row>
          {!wall.bulge && (
            <Row label="Length (m)">
              <Num
                value={dist(wall.a, wall.b)}
                onChange={(L) => {
                  if (L < 0.05) return;
                  const d = norm(sub(wall.b, wall.a));
                  s.updateWall(wall.id, { b: { x: wall.a.x + d.x * L, y: wall.a.y + d.y * L } });
                }}
                step={0.05}
              />
            </Row>
          )}
          <Row label="Thickness (m)">
            <Num value={wall.thickness} onChange={(v) => s.updateWall(wall.id, { thickness: v })} step={0.01} />
          </Row>
          <Row label="Height (m)">
            <Num value={wall.height} onChange={(v) => s.updateWall(wall.id, { height: v })} step={0.1} />
          </Row>
          {wall.bulge !== undefined && wall.bulge !== 0 && (
            <Row label="Curvature">
              <Num value={wall.bulge ?? 0} onChange={(v) => s.updateWall(wall.id, { bulge: v })} step={0.05} min={-1.5} max={1.5} />
            </Row>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            <Btn onClick={() => s.splitWallAt(wall.id, 0.5)}>Split middle</Btn>
            <Btn onClick={() => s.offsetSelectedWall(0.9)}>Offset +0.9m</Btn>
            <Btn onClick={() => s.offsetSelectedWall(-0.9)}>Offset −0.9m</Btn>
          </div>
        </div>
      )}
      {selWalls.length === 2 && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-sky-400">2 walls</div>
          <Btn onClick={() => s.joinSelectedWalls()}>Join collinear walls</Btn>
        </div>
      )}

      {opening && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-amber-400">
            {opening.kind === 'door' ? 'Door' : 'Window'} · {opening.sub}
          </div>
          <Row label="Style">
            <select
              value={opening.sub}
              onChange={(e) => s.updateOpening(opening.id, { sub: e.target.value as never })}
              className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200"
            >
              {(opening.kind === 'door' ? ['single', 'double', 'sliding', 'folding', 'glass', 'opening'] : ['sliding', 'casement', 'fixed', 'louver', 'bay']).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </Row>
          <Row label="Width (m)">
            <Num value={opening.width} onChange={(v) => s.updateOpening(opening.id, { width: v })} />
          </Row>
          <Row label="Height (m)">
            <Num value={opening.height} onChange={(v) => s.updateOpening(opening.id, { height: v })} />
          </Row>
          {(() => {
            const host = floor.walls.find((w) => w.id === opening.wallId);
            if (!host) return null;
            const L = wallLength(host);
            return (
              <Row label="From wall start (m)">
                <Num
                  value={opening.t * L}
                  onChange={(d) => s.updateOpening(opening.id, { t: Math.max(0.02, Math.min(0.98, d / L)) })}
                  step={0.05}
                  max={L}
                />
              </Row>
            );
          })()}
          {opening.kind === 'window' && (
            <Row label="Sill (m)">
              <Num value={opening.sill} onChange={(v) => s.updateOpening(opening.id, { sill: v })} min={0} />
            </Row>
          )}
          {opening.kind === 'door' && (
            <div className="mt-1 flex gap-1">
              <Btn onClick={() => s.updateOpening(opening.id, { swing: opening.swing === 1 ? -1 : 1 })}>Swing direction</Btn>
              <Btn onClick={() => s.updateOpening(opening.id, { flip: !opening.flip })}>Flip side</Btn>
            </div>
          )}
        </div>
      )}

      {stair && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-emerald-400">Stair · {stair.kind}</div>
          <Row label="Width (m)">
            <Num value={stair.width} onChange={(v) => s.updateStair(stair.id, { width: v })} />
          </Row>
          <Row label="Run length (m)">
            <Num value={stair.length} onChange={(v) => s.updateStair(stair.id, { length: v })} />
          </Row>
          <Row label="Rotation (°)">
            <Num value={stair.rot} onChange={(v) => s.updateStair(stair.id, { rot: v })} step={15} min={-360} max={360} />
          </Row>
          {(() => {
            const steps = Math.max(2, Math.round(floor.height / DEFAULTS.riserIdeal));
            const riser = floor.height / steps;
            const going = stair.length / (stair.kind === 'straight' ? steps : Math.ceil(steps / 2));
            return (
              <div className="mt-1 rounded bg-slate-800/60 p-1.5 font-mono text-[11px] text-slate-300">
                total rise {fmt(floor.height)} m · {steps} steps
                <br />
                riser {fmt(riser * 1000, 0)} mm · going {fmt(going * 1000, 0)} mm
              </div>
            );
          })()}
        </div>
      )}

      {block && (
        <div className="rounded border border-sky-900 p-2">
          <div className="mb-1 text-xs font-semibold text-sky-400">Planned room (Quick Plan)</div>
          <Row label="Name">
            <input className="w-32 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200" value={block.name} placeholder={block.type} onChange={(e) => s.updateBlock(block.id, { name: e.target.value })} />
          </Row>
          <Row label="Type">
            <select value={block.type} onChange={(e) => s.updateBlock(block.id, { type: e.target.value as (typeof ROOM_TYPES)[number] })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              {ROOM_TYPES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Row>
          <Row label="Width (m)">
            <Num value={block.w} onChange={(v) => s.updateBlock(block.id, { w: v })} step={0.1} />
          </Row>
          <Row label="Depth (m)">
            <Num value={block.h} onChange={(v) => s.updateBlock(block.id, { h: v })} step={0.1} />
          </Row>
          <div className="mt-1 text-[10px] text-slate-500">Area {fmt(block.w * block.h)} m² — drag on canvas to arrange, then "Build walls" in the Rooms tab.</div>
        </div>
      )}

      {room && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-violet-400">Room</div>
          <Row label="Type">
            <select value={room.type} onChange={(e) => s.updateRoom(room.id, { type: e.target.value as (typeof ROOM_TYPES)[number] })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              {ROOM_TYPES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Row>
          <Row label="Name">
            <input className="w-32 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200" value={room.name ?? ''} placeholder={room.type} onChange={(e) => s.updateRoom(room.id, { name: e.target.value || undefined })} />
          </Row>
        </div>
      )}

      {furn.length === 1 && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-indigo-400">{libDef(furn[0].def).name}</div>
          <Row label="Width (m)">
            <Num value={furn[0].w} onChange={(v) => s.updateFurniture(furn[0].id, { w: v })} />
          </Row>
          <Row label="Depth (m)">
            <Num value={furn[0].h} onChange={(v) => s.updateFurniture(furn[0].id, { h: v })} />
          </Row>
          <Row label="Rotation (°)">
            <Num value={furn[0].rot} onChange={(v) => s.updateFurniture(furn[0].id, { rot: v })} step={15} min={-360} max={360} />
          </Row>
          <Row label="Layer">
            <select value={furn[0].layer} onChange={(e) => s.updateFurniture(furn[0].id, { layer: e.target.value as LayerId })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              {(['furniture', 'electrical', 'plumbing', 'text'] as LayerId[]).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Row>
        </div>
      )}
      {furn.length >= 2 && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-indigo-400">{furn.length} objects</div>
          <div className="flex flex-wrap gap-1">
            <Btn onClick={() => s.alignSelection('left')}>Align X</Btn>
            <Btn onClick={() => s.alignSelection('top')}>Align Y</Btn>
            <Btn onClick={() => s.groupSelection()}>Group</Btn>
            <Btn onClick={() => s.ungroupSelection()}>Ungroup</Btn>
          </div>
        </div>
      )}

      {dim && (
        <div className="rounded border border-slate-800 p-2">
          <div className="mb-1 text-xs font-semibold text-teal-400">Dimension</div>
          <Btn danger onClick={() => s.deleteSelected()}>
            Remove
          </Btn>
        </div>
      )}
    </div>
  );
}

const FT = 0.3048;

function QuickPlan() {
  const s = useStore();
  const floor = s.project.floors.find((f) => f.id === s.floorId)!;
  const blocks = floor.blocks ?? [];
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof ROOM_TYPES)[number]>('Bedroom');
  const [w, setW] = useState('');
  const [d, setD] = useState('');
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const k = unit === 'ft' ? FT : 1;

  const add = () => {
    const wv = parseFloat(w) * k;
    const dv = parseFloat(d) * k;
    if (!Number.isFinite(wv) || !Number.isFinite(dv) || wv <= 0.2 || dv <= 0.2) return;
    s.addBlock({ name: name.trim(), type, w: Math.round(wv * 100) / 100, h: Math.round(dv * 100) / 100 });
    setName('');
    setW('');
    setD('');
    s.setTool('select');
  };

  return (
    <div className="mb-3 rounded-lg border border-sky-900 bg-sky-950/40 p-2.5">
      <div className="mb-1.5 text-xs font-semibold text-sky-300">Quick Plan — enter room measurements</div>
      <div className="mb-1.5 flex gap-1">
        <input
          className="min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-1 text-xs text-slate-200"
          placeholder="Name (e.g. Bedroom 1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <select value={type} onChange={(e) => setType(e.target.value as never)} className="w-24 rounded bg-slate-800 px-1 py-1 text-xs text-slate-200">
          {ROOM_TYPES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <input className="w-16 rounded bg-slate-800 px-1.5 py-1 text-right text-xs text-slate-200" placeholder="W" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <span className="text-xs text-slate-500">×</span>
        <input className="w-16 rounded bg-slate-800 px-1.5 py-1 text-right text-xs text-slate-200" placeholder="D" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select value={unit} onChange={(e) => setUnit(e.target.value as 'm' | 'ft')} className="rounded bg-slate-800 px-1 py-1 text-xs text-slate-200">
          <option value="m">m</option>
          <option value="ft">ft</option>
        </select>
        <button onClick={add} className="ml-auto rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500">
          Add
        </button>
      </div>

      {blocks.length > 0 && (
        <>
          <div className="mt-2 space-y-1">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center gap-1 rounded bg-slate-800/60 px-1.5 py-1 text-xs text-slate-300">
                <button className="min-w-0 flex-1 truncate text-left hover:text-sky-300" onClick={() => s.select([b.id])} title="Select on canvas">
                  {b.name || b.type}
                </button>
                <span className="font-mono text-slate-400">
                  {fmt(b.w, 1)}×{fmt(b.h, 1)}
                </span>
                <button onClick={() => s.updateBlock(b.id, { w: b.h, h: b.w })} title="Rotate (swap W×D)" className="px-1 text-slate-500 hover:text-sky-300">
                  ⟳
                </button>
                <button onClick={() => s.deleteBlock(b.id)} className="px-1 text-slate-500 hover:text-red-400">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <button
              onClick={() => s.generateWallsFromBlocks()}
              className="flex-1 rounded bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Build walls from {blocks.length} room{blocks.length > 1 ? 's' : ''}
            </button>
            <button onClick={() => s.clearBlocks()} className="rounded bg-slate-800 px-2 text-xs text-slate-400 hover:text-red-400">
              Clear
            </button>
          </div>
          <div className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            Drag the blocks on the canvas — edges snap together. Touching edges become one shared interior wall; outer edges become exterior walls. Undo restores the blocks.
          </div>
        </>
      )}
    </div>
  );
}

function RoomsPanel() {
  const s = useStore();
  const metrics = useMemo(() => measureBuilding(s.project), [s.rev, s.project]);
  const fm = metrics.floors.find((f) => f.floorId === s.floorId);
  if (!fm) return null;
  return (
    <div className="p-3">
      <QuickPlan />
      <div className="mb-2 text-xs text-slate-400">
        Rooms are detected automatically from enclosed walls. Use the <b>Assign room</b> tool (tag icon) and click inside a space.
      </div>
      {fm.rooms.length === 0 && <div className="text-xs text-slate-500">No enclosed spaces yet — draw a closed wall loop.</div>}
      {fm.rooms.map((r, i) => (
        <div
          key={r.key}
          className={`mb-1 flex w-full items-center gap-1 rounded border px-2 py-1.5 text-xs ${
            r.anchor ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-amber-700/50 bg-amber-900/20 text-amber-300'
          }`}
        >
          <button
            className="min-w-0 flex-1 truncate text-left hover:text-sky-300"
            title={r.anchor ? 'Open in Inspect to rename / change type' : 'Assign a type: activates the Room tool — click inside this space'}
            onClick={() => {
              if (r.anchor) {
                s.select([r.anchor.id]);
                s.setPanelTab('inspect');
              } else {
                s.setTool('room');
              }
            }}
          >
            {r.anchor ? (r.anchor.name ?? r.anchor.type) : `Unassigned room ${i + 1} — click to assign`}
          </button>
          {r.anchor && (
            <button
              onClick={() => {
                const n = prompt('Room name:', r.anchor!.name ?? r.anchor!.type);
                if (n !== null) s.updateRoom(r.anchor!.id, { name: n.trim() || undefined });
              }}
              className="px-1 text-slate-500 hover:text-sky-300"
              title="Rename room"
            >
              ✏️
            </button>
          )}
          <span className="font-mono" title={r.netExact ? 'Exact finish-to-finish internal area' : 'Approximate (irregular geometry)'}>
            {r.netExact ? '' : '≈ '}
            {fmtM2(r.netArea)}
          </span>
        </div>
      ))}
      <div className="mt-2 border-t border-slate-700 pt-2">
        <MRow label="Rooms on this floor" value={String(fm.roomCount)} />
        <MRow label="Net floor area" value={fmtM2(fm.netFloorArea)} bold />
      </div>
    </div>
  );
}

function MeasurePanel() {
  const s = useStore();
  const metrics = useMemo(() => measureBuilding(s.project), [s.rev, s.project]);
  const floor = s.project.floors.find((f) => f.id === s.floorId);
  const openEnds = useMemo(() => (floor ? openEndpoints(floor.walls) : []), [s.rev, floor]);
  const fm = metrics.floors.find((f) => f.floorId === s.floorId);
  if (!fm) return null;
  return (
    <div className="p-3">
      <button
        onClick={() => {
          const r = s.cleanupPlan();
          alert(
            r.removedDuplicate + r.removedStray + r.healedGaps === 0
              ? 'Plan is already clean — no duplicate walls, strays or open gaps found.'
              : `Plan cleaned:\n· ${r.removedDuplicate} duplicate wall${r.removedDuplicate === 1 ? '' : 's'} removed (doors re-attached to the surviving wall)\n· ${r.removedStray} stray segment${r.removedStray === 1 ? '' : 's'} removed\n· ${r.healedGaps} gap${r.healedGaps === 1 ? '' : 's'} closed\n\nUndo (⌘Z) restores everything.`,
          );
        }}
        className="mb-3 w-full rounded bg-emerald-700 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
        title="Remove duplicate/stray walls (they block 3D door openings), close near-miss gaps, re-attach doors"
      >
        🧹 Clean up plan (duplicates · strays · gaps)
      </button>
      {openEnds.length > 0 && (
        <div className="mb-3 rounded border border-red-800 bg-red-950/40 p-2 text-[11px] leading-relaxed text-red-300">
          <b>⚠ Plan is not fully enclosed — {openEnds.length} open wall end{openEnds.length > 1 ? 's' : ''}</b> (red dots
          on the canvas). Only enclosed space counts toward rooms, GFA and net area. Drag wall ends together (they snap) or delete
          stray/duplicate walls (duplicates also block door openings in 3D). Open-plan layouts: keep the outside
          envelope closed, place doors ON walls, and use the <b>Divider</b> wall type to split living/kitchen areas
          without drawing a real wall.
        </div>
      )}
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">This floor</div>
      <MRow label="Gross Floor Area" value={fmtM2(fm.grossFloorArea)} bold />
      <MRow label="Net Floor Area" value={fmtM2(fm.netFloorArea)} bold />
      <MRow label="Footprint" value={fmtM2(fm.footprint)} />
      <MRow label="Building perimeter" value={fmtM(fm.perimeter)} />
      <MRow label="Wall length" value={fmtM(fm.wallLength)} />
      <MRow label="Wall area (net of openings)" value={fmtM2(fm.wallArea)} />
      <MRow label="Ceiling area" value={fmtM2(fm.ceilingArea)} />
      <MRow label="Windows" value={`${fm.windowCount} · ${fmtM2(fm.windowArea)}`} />
      <MRow label="Doors" value={`${fm.doorCount} · ${fmtM2(fm.doorArea)}`} />
      <MRow label="Rooms" value={String(fm.roomCount)} />
      <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Whole building</div>
      <MRow label="Total GFA" value={fmtM2(metrics.totalGFA)} bold />
      <MRow label="Total net area" value={fmtM2(metrics.totalNFA)} bold />
      <MRow label="Ground footprint" value={fmtM2(metrics.footprint)} />
      <MRow label="Building height (incl. roof)" value={fmtM(metrics.buildingHeight)} />
      <MRow label="Total rooms" value={String(metrics.totalRooms)} />
      <MRow label="Floors" value={String(metrics.floors.length)} />
      <div className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Gross areas at wall centerlines (IPMS 2). Net internal areas are <b>exact</b> finish-to-finish, computed from
        the miter-offset inner wall faces per room (IPMS 3B convention); rooms marked ≈ contain irregular geometry and
        use a conservative approximation. Updates live as you edit.
      </div>
    </div>
  );
}

function LayersPanel() {
  const s = useStore();
  const layers = Object.entries(s.layers) as [LayerId, { visible: boolean; locked: boolean }][];
  return (
    <div className="p-3">
      {layers.map(([id, st]) => (
        <div key={id} className="flex items-center justify-between border-b border-slate-800 py-1.5 text-xs text-slate-300">
          <span className="capitalize">{id}</span>
          <div className="flex gap-2">
            <button onClick={() => s.setLayer(id, { visible: !st.visible })} className={st.visible ? 'text-sky-400' : 'text-slate-600'}>
              {st.visible ? 'visible' : 'hidden'}
            </button>
            <button onClick={() => s.setLayer(id, { locked: !st.locked })} className={st.locked ? 'text-amber-400' : 'text-slate-600'}>
              {st.locked ? 'locked' : 'unlocked'}
            </button>
          </div>
        </div>
      ))}
      <div className="mt-3 text-[10px] text-slate-500">Hidden layers are excluded from the canvas; locked layers can't be edited.</div>
    </div>
  );
}

function LibraryPanel() {
  const s = useStore();
  const [cat, setCat] = useState<(typeof LIB_CATEGORIES)[number]>('Furniture');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {LIB_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`rounded px-2 py-0.5 text-[11px] ${cat === c ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-1.5 overflow-y-auto p-2">
        {LIBRARY.filter((d) => d.category === cat).map((d) => (
          <button
            key={d.id}
            onClick={() => {
              s.setPlacing({ placingDef: d.id });
              s.setTool('furniture');
            }}
            className={`rounded border p-2 text-left text-[11px] ${
              s.placingDef === d.id ? 'border-sky-500 bg-sky-900/30 text-sky-300' : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-600'
            }`}
          >
            <span className="mb-1 block h-2 w-6 rounded-sm" style={{ background: d.color }} />
            {d.name}
            <span className="block text-[10px] text-slate-500">
              {d.w}×{d.h} m
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-slate-800 p-2 text-[10px] text-slate-500">Pick an item then click the canvas to place. Hold Shift to place several.</div>
    </div>
  );
}

function ThreePanel() {
  const s = useStore();
  const floor = s.project.floors.find((f) => f.id === s.floorId)!;
  const t = s.three;
  const Chk = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center justify-between py-1 text-xs text-slate-300">
      {label}
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-sky-500" />
    </label>
  );
  return (
    <div className="p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Building</div>
      <Row label="Floor height (m)">
        <Num value={floor.height} onChange={(v) => s.setFloorHeight(floor.id, v)} step={0.1} min={2} max={6} />
      </Row>
      <Row label="View">
        <select value={s.three.mode} onChange={(e) => s.setThree({ mode: e.target.value as 'dollhouse' | 'exterior' })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
          <option value="dollhouse">Dollhouse (see rooms)</option>
          <option value="exterior">Exterior (with roof)</option>
        </select>
      </Row>
      <Row label="Roof type">
        <select value={s.project.roof.kind} onChange={(e) => s.setRoof({ kind: e.target.value as RoofKind })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
          <option value="flat">Flat</option>
          <option value="gable">Gable</option>
          <option value="hip">Hip</option>
          <option value="shed">Shed</option>
        </select>
      </Row>
      <Row label="Roof height (m)">
        <Num value={s.project.roof.height} onChange={(v) => s.setRoof({ height: v })} step={0.1} min={0.2} max={6} />
      </Row>
      <Row label="Overhang (m)">
        <Num value={s.project.roof.overhang} onChange={(v) => s.setRoof({ overhang: v })} step={0.1} min={0} max={2} />
      </Row>

      <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">3D view</div>
      <Chk label="Transparent walls" value={t.transparent} onChange={(v) => s.setThree({ transparent: v })} />
      <Chk label="Shadows / sunlight" value={t.shadows} onChange={(v) => s.setThree({ shadows: v })} />
      <Chk label="Isolate current floor" value={t.isolate} onChange={(v) => s.setThree({ isolate: v })} />
      <Chk label="Section cut" value={t.sectionY != null} onChange={(v) => s.setThree({ sectionY: v ? 1.4 : null })} />
      {t.sectionY != null && (
        <Row label={`Cut height ${fmt(t.sectionY)} m`}>
          <input type="range" min={0.2} max={9} step={0.1} value={t.sectionY} onChange={(e) => s.setThree({ sectionY: parseFloat(e.target.value) })} />
        </Row>
      )}
      <Row label={`Sun azimuth ${t.sunAz}°`}>
        <input type="range" min={0} max={360} value={t.sunAz} onChange={(e) => s.setThree({ sunAz: parseInt(e.target.value) })} />
      </Row>
      <Row label={`Sun elevation ${t.sunEl}°`}>
        <input type="range" min={10} max={85} value={t.sunEl} onChange={(e) => s.setThree({ sunEl: parseInt(e.target.value) })} />
      </Row>
      <button
        onClick={() => s.setThree({ walk: !t.walk })}
        className={`mt-3 w-full rounded py-1.5 text-xs font-medium ${t.walk ? 'bg-red-600 text-white' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
      >
        {t.walk ? 'Exit walk mode' : 'Enter first-person walk mode'}
      </button>
      <div className="mt-2 text-[10px] text-slate-500">Walk mode: WASD + mouse-look at 1.6 m eye height. Requires the 3D pane to be visible.</div>
    </div>
  );
}

export default function Panels() {
  const tab = useStore((s) => s.panelTab);
  const setTab = useStore((s) => s.setPanelTab);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'inspect', label: 'Inspect' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'measure', label: 'Measure' },
    { id: 'layers', label: 'Layers' },
    { id: 'library', label: 'Library' },
    { id: '3d', label: '3D' },
  ];
  const selection = useStore((s) => s.selection);
  // auto-jump to inspector when something is selected
  const prevSel = React.useRef(0);
  React.useEffect(() => {
    if (selection.length && !prevSel.current) setTab('inspect');
    prevSel.current = selection.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.length]);

  return (
    <div className="flex w-72 flex-col border-l border-slate-700 bg-slate-900">
      <div className="flex border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[11px] font-medium ${tab === t.id ? 'border-b-2 border-sky-500 text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'inspect' && <Inspector />}
        {tab === 'rooms' && <RoomsPanel />}
        {tab === 'measure' && <MeasurePanel />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'library' && <LibraryPanel />}
        {tab === '3d' && <ThreePanel />}
      </div>
    </div>
  );
}
