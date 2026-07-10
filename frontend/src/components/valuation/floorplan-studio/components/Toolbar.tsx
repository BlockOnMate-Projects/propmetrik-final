import React from 'react';
import {
  MousePointer2,
  PenLine,
  Square,
  Spline,
  Tag,
  DoorOpen,
  RectangleHorizontal,
  ArrowUpNarrowWide,
  Armchair,
  Ruler,
  Crosshair,
} from 'lucide-react';
import { useStore, type Tool } from '../store';

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
  { id: 'select', icon: <MousePointer2 size={17} />, label: 'Select', key: 'V' },
  { id: 'wall', icon: <PenLine size={17} />, label: 'Wall', key: 'W' },
  { id: 'rect', icon: <Square size={17} />, label: 'Rect', key: 'R' },
  { id: 'arc', icon: <Spline size={17} />, label: 'Curve', key: 'A' },
  { id: 'room', icon: <Tag size={17} />, label: 'Room', key: 'T' },
  { id: 'door', icon: <DoorOpen size={17} />, label: 'Door', key: 'D' },
  { id: 'window', icon: <RectangleHorizontal size={17} />, label: 'Window', key: 'N' },
  { id: 'stair', icon: <ArrowUpNarrowWide size={17} />, label: 'Stairs', key: 'S' },
  { id: 'furniture', icon: <Armchair size={17} />, label: 'Objects', key: 'F' },
  { id: 'dimension', icon: <Ruler size={17} />, label: 'Dim', key: 'M' },
  { id: 'calibrate', icon: <Crosshair size={17} />, label: 'Scale', key: '' },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="flex w-16 flex-col items-stretch gap-0.5 overflow-y-auto border-r border-slate-700 bg-slate-900 px-1 py-2">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={`${t.label}${t.key ? ` (${t.key})` : ''}`}
          className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors ${
            tool === t.id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {t.icon}
          <span className="text-[9px] leading-none">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
