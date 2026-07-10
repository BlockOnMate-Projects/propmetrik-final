'use client';

// ============================================================================
// Floor Plan Studio — embedded root for the valuation wizard.
// Loads/saves against valuation_floor_plans via the store's server adapter.
// ============================================================================
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import StudioTopBar from './components/StudioTopBar';
import Toolbar from './components/Toolbar';
import Panels from './components/Panels';
import Editor2D from './components/Editor2D';
import View3D from './components/View3D';
import { useStore } from './store';

class PaneBoundary extends React.Component<{ label: string; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-900 text-slate-400">
          <div className="text-sm">The {this.props.label} view hit an error and was isolated.</div>
          <div className="max-w-md truncate font-mono text-xs text-slate-500">{this.state.error}</div>
          <button onClick={() => this.setState({ error: null })} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500">
            Reload {this.props.label} view
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface FloorPlanStudioProps {
  valuationId: string;
  projectName?: string;
  /** height of the editor shell (the wizard page provides surrounding chrome) */
  className?: string;
}

export default function FloorPlanStudio({ valuationId, projectName, className }: FloorPlanStudioProps) {
  const s = useStore();

  // bind to the valuation on mount / id change
  useEffect(() => {
    void useStore.getState().loadValuation(valuationId, projectName);
  }, [valuationId, projectName]);

  // flush pending edits when the user navigates away / closes the tab
  useEffect(() => {
    const onLeave = () => {
      void useStore.getState().flush();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, []);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return;
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.undo();
        return;
      }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        st.saveNow();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        st.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        st.paste();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelected();
        return;
      }
      if (e.key.startsWith('Arrow') && st.selection.length && st.tool === 'select' && !st.three.walk) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : Math.max(st.snap.size, 0.05);
        const d: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        if (d[e.key]) st.moveSelected(...d[e.key]);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'v': st.setTool('select'); break;
        case 'w': st.setTool('wall'); break;
        case 'r': st.setTool('rect'); break;
        case 'a': st.setTool('arc'); break;
        case 't': st.setTool('room'); break;
        case 'd': st.setTool('door'); break;
        case 'n': st.setTool('window'); break;
        case 's': st.setTool('stair'); break;
        case 'f': st.setTool('furniture'); break;
        case 'm': st.setTool('dimension'); break;
        case 'g': st.toggle('showGrid'); break;
        case 'l': st.toggle('showLabels'); break;
        case '1': st.setView('2d'); break;
        case '2': st.setView('split'); break;
        case '3': st.setView('3d'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (s.loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-950 text-slate-400 ${className ?? 'h-[70vh]'}`}>
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading floor plans…
      </div>
    );
  }
  if (s.loadError) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-400 ${className ?? 'h-[70vh]'}`}>
        <div className="text-sm text-red-400">{s.loadError}</div>
        <button
          onClick={() => void useStore.getState().loadValuation(valuationId, projectName)}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-slate-200 ${className ?? 'h-[78vh]'}`}>
      <StudioTopBar />
      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <div className="flex min-w-0 flex-1">
          {s.view !== '3d' && (
            <div className={s.view === 'split' ? 'min-w-0 flex-1 border-r border-slate-700' : 'min-w-0 flex-1'}>
              <PaneBoundary label="2D">
                <Editor2D />
              </PaneBoundary>
            </div>
          )}
          {s.view !== '2d' && (
            <div className="min-w-0 flex-1">
              <PaneBoundary label="3D">
                <View3D />
              </PaneBoundary>
            </div>
          )}
        </div>
        {!s.fullscreen && <Panels />}
      </div>
    </div>
  );
}
