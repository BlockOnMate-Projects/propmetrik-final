// Studio toolbar for the valuation wizard — project management is replaced by
// the valuation binding; everything else (versions, export, trace, quick plan,
// floors, lock) carries over from the standalone studio.
import React, { useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  Save,
  Trash2,
  Download,
  Image as ImageIcon,
  Grid3X3,
  Magnet,
  Maximize,
  Layers as LayersIcon,
  ChevronDown,
  ListPlus,
  Plus,
  Lock,
  Unlock,
  History,
  Loader2,
} from 'lucide-react';
import { useStore } from '../store';
import { exportDXF, exportJSON, exportPDF, exportPNG, exportSVG } from '../exporters';
import { ROOM_TYPES, type DoorSub, type StairKind, type WallKind, type WindowSub } from '../types';

function Menu({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
      >
        {icon}
        {label}
        <ChevronDown size={13} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-52 rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}

const Item = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onMouseDown={onClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800">
    {children}
  </button>
);

export default function StudioTopBar() {
  const s = useStore();
  const bgRef = useRef<HTMLInputElement>(null);
  const floor = s.project.floors.find((f) => f.id === s.floorId)!;

  const applyBg = (src: string, note = '') => {
    s.setBg({ src, x: 0, y: 0, scale: 0.02, opacity: 0.55, rotation: 0 });
    alert(`Plan added as tracing background.${note}\n\nNow use the Scale tool (crosshair, bottom of the toolbar): click two points with a known distance — e.g. across a door — and enter the real length. Then trace walls over it, or arrange Quick Plan rooms on top.`);
  };

  const onBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
      try {
        const { rasterizePdf } = await import('../pdfImport');
        const buf = await f.arrayBuffer();
        let page = 1;
        let img = await rasterizePdf(buf.slice(0), page);
        if (img.pageCount > 1) {
          const p = parseInt(prompt(`PDF has ${img.pageCount} pages. Which page is the floor plan?`, '1') ?? '1');
          if (Number.isFinite(p) && p >= 1 && p <= img.pageCount && p !== page) {
            page = p;
            img = await rasterizePdf(buf.slice(0), page);
          }
        }
        applyBg(img.dataUrl, ` (PDF page ${page} of ${img.pageCount})`);
      } catch (err) {
        alert(`Could not read this PDF: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }
    const r = new FileReader();
    r.onload = () => applyBg(String(r.result));
    r.readAsDataURL(f);
  };

  const ViewBtn = ({ id, label }: { id: '2d' | 'split' | '3d'; label: string }) => (
    <button
      onClick={() => s.setView(id)}
      className={`rounded px-2.5 py-1 text-xs font-medium ${s.view === id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
    >
      {label}
    </button>
  );

  const saveLabel =
    s.saveState === 'saving' ? 'saving…' : s.saveState === 'dirty' ? 'unsaved changes' : s.saveState === 'error' ? 'save failed — retrying on next change' : s.savedAt ? `saved ${new Date(s.savedAt).toLocaleTimeString()}` : '';

  return (
    <div className="flex flex-col border-b border-slate-700 bg-slate-900">
      <div className="flex items-center gap-1 px-2 py-1">
        <Menu label="Versions" icon={<History size={14} />}>
          <Item onClick={() => { const l = prompt('Version label (e.g. "As inspected", "Issued with report"):', ''); if (l !== null) s.saveVersion(l); }}>
            Save current plan as version…
          </Item>
          <div className="my-1 border-t border-slate-700" />
          {(s.project.versions ?? []).length === 0 && <div className="px-3 py-1.5 text-xs text-slate-500">No saved versions yet</div>}
          {(s.project.versions ?? [])
            .slice()
            .reverse()
            .map((v) => (
              <div key={v.id} className="flex items-center">
                <Item onClick={() => { if (confirm(`Restore "${v.label}"? The current plan goes to Undo.`)) s.restoreVersion(v.id); }}>
                  <span>
                    {v.label}
                    <span className="ml-1 text-[10px] text-slate-500">{new Date(v.createdAt).toLocaleString()}</span>
                  </span>
                </Item>
                <button onMouseDown={() => s.deleteVersion(v.id)} className="px-2 text-slate-500 hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
        </Menu>

        <Menu label="Export" icon={<Download size={14} />}>
          <Item onClick={() => exportPNG(s.project)}>PNG image</Item>
          <Item onClick={() => exportSVG(s.project, floor)}>SVG vector</Item>
          <Item onClick={() => void exportPDF(s.project)}>PDF report (all floors + schedule)</Item>
          <Item onClick={() => exportDXF(s.project, floor)}>DXF (CAD)</Item>
          <Item onClick={() => exportJSON(s.project)}>JSON project</Item>
        </Menu>

        <button onClick={() => bgRef.current?.click()} title="Import a plan image or PDF for tracing" className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
          <ImageIcon size={14} /> Trace
        </button>
        <button
          onClick={() => s.openQuickPlan()}
          title="Quick Plan — type room measurements and the plan draws itself"
          className="flex items-center gap-1.5 rounded bg-sky-700/40 px-2.5 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-700/70"
        >
          <ListPlus size={14} /> Quick Plan
        </button>

        <div className="mx-2 h-5 w-px bg-slate-700" />
        <button onClick={() => s.undo()} title="Undo (Ctrl+Z)" className="rounded p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30" disabled={!s.undoStack.length}>
          <Undo2 size={16} />
        </button>
        <button onClick={() => s.redo()} title="Redo (Ctrl+Y)" className="rounded p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30" disabled={!s.redoStack.length}>
          <Redo2 size={16} />
        </button>
        <button onClick={() => s.saveNow()} title="Save now (autosaves as you edit)" className="rounded p-1.5 text-slate-400 hover:bg-slate-800">
          {s.saveState === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        </button>

        <div className="mx-2 h-5 w-px bg-slate-700" />
        <button onClick={() => s.setSnap({ grid: !s.snap.grid })} title="Snap to grid" className={`rounded p-1.5 ${s.snap.grid ? 'text-sky-400' : 'text-slate-500'} hover:bg-slate-800`}>
          <Magnet size={16} />
        </button>
        <button onClick={() => s.toggle('showGrid')} title="Show grid (G)" className={`rounded p-1.5 ${s.showGrid ? 'text-sky-400' : 'text-slate-500'} hover:bg-slate-800`}>
          <Grid3X3 size={16} />
        </button>
        <button onClick={() => s.toggle('showLabels')} title="Room labels (L)" className={`rounded p-1.5 ${s.showLabels ? 'text-sky-400' : 'text-slate-500'} hover:bg-slate-800`}>
          <LayersIcon size={16} />
        </button>
        <button onClick={() => s.toggle('fullscreen')} title="Focus mode (hide side panel)" className="rounded p-1.5 text-slate-400 hover:bg-slate-800">
          <Maximize size={16} />
        </button>

        <div className="flex-1" />
        <span className="mr-2 max-w-56 truncate text-sm font-medium text-slate-300">{s.project.name}</span>
        <span className={`mr-1 max-w-72 text-right text-[10px] leading-tight ${s.saveState === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{saveLabel}</span>

        <div className="mx-2 h-5 w-px bg-slate-700" />
        <ViewBtn id="2d" label="2D" />
        <ViewBtn id="split" label="Split" />
        <ViewBtn id="3d" label="3D" />
      </div>

      {/* floors + tool context row */}
      <div className="flex items-center gap-1 border-t border-slate-800 px-2 py-1">
        {[...s.project.floors]
          .sort((a, b) => a.level - b.level)
          .map((f) => (
            <button
              key={f.id}
              onClick={() => s.setFloor(f.id)}
              onDoubleClick={() => {
                const n = prompt('Rename floor:', f.name);
                if (n) s.renameFloor(f.id, n);
              }}
              className={`rounded px-2.5 py-1 text-xs ${f.id === s.floorId ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800'}`}
              title="Double-click to rename"
            >
              {f.locked ? '🔒 ' : ''}
              {f.name}
            </button>
          ))}
        <button
          onClick={() => {
            if (!floor.locked && !confirm(`Lock "${floor.name}"? The plan becomes read-only until unlocked — use this once measurements are final (e.g. report issued).`)) return;
            void s.setFloorLocked(floor.id, !floor.locked);
          }}
          title={floor.locked ? 'Unlock plan (currently read-only)' : 'Lock plan (freeze measurements)'}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${floor.locked ? 'bg-amber-900/50 text-amber-300' : 'text-slate-500 hover:bg-slate-800'}`}
        >
          {floor.locked ? <Lock size={12} /> : <Unlock size={12} />}
          {floor.locked ? 'Locked' : 'Lock'}
        </button>
        <Menu label="" icon={<Plus size={14} />}>
          <Item onClick={() => s.addFloor()}>Add empty floor above</Item>
          <Item onClick={() => s.addFloor({ duplicate: true })}>Duplicate current floor</Item>
          <Item onClick={() => s.addFloor({ level: -1, name: 'Basement' })}>Add basement</Item>
          <Item onClick={() => s.addFloor({ level: Math.max(...s.project.floors.map((f) => f.level)) + 0.5, name: 'Mezzanine' })}>Add mezzanine</Item>
          <div className="my-1 border-t border-slate-700" />
          <Item onClick={() => { if (confirm(`Delete floor "${floor.name}"?`)) s.deleteFloor(s.floorId); }}>
            <Trash2 size={13} /> Delete current floor
          </Item>
        </Menu>

        <div className="mx-2 h-4 w-px bg-slate-700" />
        {(s.tool === 'wall' || s.tool === 'rect' || s.tool === 'arc') && (
          <label className="flex items-center gap-1 text-xs text-slate-400">
            Wall type
            <select value={s.wallKind} onChange={(e) => s.setPlacing({ wallKind: e.target.value as WallKind })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              <option value="exterior">Exterior (230mm)</option>
              <option value="interior">Interior (150mm)</option>
              <option value="partition">Partition (100mm)</option>
              <option value="divider">Divider — open-plan split (no wall)</option>
            </select>
          </label>
        )}
        {s.tool === 'door' && (
          <label className="flex items-center gap-1 text-xs text-slate-400">
            Door
            <select value={s.doorSub} onChange={(e) => s.setPlacing({ doorSub: e.target.value as DoorSub })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              {(['single', 'double', 'sliding', 'folding', 'glass', 'opening'] as const).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {s.tool === 'window' && (
          <label className="flex items-center gap-1 text-xs text-slate-400">
            Window
            <select value={s.windowSub} onChange={(e) => s.setPlacing({ windowSub: e.target.value as WindowSub })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              {(['sliding', 'casement', 'fixed', 'louver', 'bay'] as const).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {s.tool === 'stair' && (
          <label className="flex items-center gap-1 text-xs text-slate-400">
            Stair
            <select value={s.stairKind} onChange={(e) => s.setPlacing({ stairKind: e.target.value as StairKind })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              <option value="straight">Straight</option>
              <option value="l">L-shaped</option>
              <option value="u">U-shaped</option>
              <option value="spiral">Spiral</option>
            </select>
          </label>
        )}
        {s.tool === 'room' && (
          <label className="flex items-center gap-1 text-xs text-slate-400">
            Room type
            <select value={s.roomType} onChange={(e) => s.setPlacing({ roomType: e.target.value as (typeof ROOM_TYPES)[number] })} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
              {ROOM_TYPES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <span className="ml-1 text-slate-500">click inside an enclosed space to assign</span>
          </label>
        )}
        {floor.bg && (
          <label className="ml-2 flex items-center gap-1 text-xs text-slate-400">
            Trace opacity
            <input type="range" min={0} max={1} step={0.05} value={floor.bg.opacity} onChange={(e) => s.updateBg({ opacity: parseFloat(e.target.value) })} />
            <button onClick={() => s.setBg(undefined)} className="text-slate-500 hover:text-red-400">remove</button>
          </label>
        )}
      </div>

      <input ref={bgRef} type="file" accept="image/*,.pdf" hidden onChange={onBgUpload} />
    </div>
  );
}
