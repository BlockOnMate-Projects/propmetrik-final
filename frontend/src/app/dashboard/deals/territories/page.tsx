'use client';

/**
 * Agent Territories — draw PostGIS geo-fences on the map, assign them to agents, and let
 * inbound leads auto-route to the owning agent by point-in-polygon (backend). Uses
 * react-map-gl click-to-draw (no extra draw dependency).
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, Plus, Trash2, Undo2, Check, X, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { territoriesApi, agentsApi, type AgentTerritory } from '@/lib/crm-api';
import { toast } from 'sonner';

const TerritoryMap = dynamic(() => import('./TerritoryMap'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading map…
        </div>
    ),
});

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6'];

export default function TerritoriesPage() {
    const [territories, setTerritories] = useState<AgentTerritory[]>([]);
    const [agents, setAgents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // draw state
    const [drawing, setDrawing] = useState(false);
    const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);

    // create form
    const [formOpen, setFormOpen] = useState(false);
    const [pendingBoundary, setPendingBoundary] = useState<any>(null);
    const [form, setForm] = useState({ agentId: '', name: '', isExclusive: true, priority: 0, color: COLORS[0] });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const [terr, ag] = await Promise.all([
                territoriesApi.getAll(),
                agentsApi.getAll({ limit: 200 }),
            ]);
            setTerritories(terr || []);
            const list = (ag as any)?.data ?? (ag as any)?.items ?? (ag as any)?.agents ?? [];
            setAgents(Array.isArray(list) ? list : []);
        } catch (e: any) {
            toast.error(e?.message || 'Failed to load territories');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const agentName = (id: string) => {
        const a = agents.find((x) => x.id === id);
        return a ? (a.display_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Agent') : 'Agent';
    };

    const addPoint = useCallback((lng: number, lat: number) => setDrawPoints((p) => [...p, [lng, lat]]), []);
    const startDraw = () => { setSelectedId(null); setDrawPoints([]); setDrawing(true); };
    const cancelDraw = () => { setDrawing(false); setDrawPoints([]); };

    const finishDraw = () => {
        if (drawPoints.length < 3) { toast.error('A territory needs at least 3 points'); return; }
        setPendingBoundary({ type: 'Polygon', coordinates: [[...drawPoints, drawPoints[0]]] });
        setForm({ agentId: agents[0]?.id || '', name: '', isExclusive: true, priority: 0, color: COLORS[territories.length % COLORS.length] });
        setDrawing(false);
        setFormOpen(true);
    };

    const save = async (allowOverlap = false) => {
        if (!form.agentId || !form.name.trim()) { toast.error('Name and agent are required'); return; }
        setSaving(true);
        try {
            await territoriesApi.create({
                agentId: form.agentId,
                name: form.name.trim(),
                boundary: pendingBoundary,
                isExclusive: form.isExclusive,
                priority: form.priority,
                color: form.color,
                allowOverlap,
            });
            toast.success('Territory created');
            setFormOpen(false);
            setPendingBoundary(null);
            setDrawPoints([]);
            load();
        } catch (e: any) {
            // 409 overlap → offer to save anyway (with allowOverlap).
            if (/overlap/i.test(e?.message || '') && !allowOverlap) {
                if (typeof window !== 'undefined' && window.confirm(`${e.message}.\n\nSave anyway (allow the overlap)?`)) {
                    setSaving(false);
                    return save(true);
                }
            } else {
                toast.error(e?.message || 'Failed to create territory');
            }
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (typeof window !== 'undefined' && !window.confirm('Delete this territory?')) return;
        try {
            await territoriesApi.delete(id);
            toast.success('Territory deleted');
            if (selectedId === id) setSelectedId(null);
            load();
        } catch (e: any) {
            toast.error(e?.message || 'Failed to delete territory');
        }
    };

    return (
        <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <MapIcon className="h-5 w-5 text-primary" /> Agent Territories
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Draw geo-fenced territories; new leads auto-route to the owning agent by location.
                    </p>
                </div>
                {!drawing ? (
                    <Button onClick={startDraw}><Plus className="h-4 w-4 mr-1" /> New Territory</Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground mr-1">Click the map to add points ({drawPoints.length})</span>
                        <Button variant="outline" size="sm" onClick={() => setDrawPoints((p) => p.slice(0, -1))} disabled={!drawPoints.length}>
                            <Undo2 className="h-4 w-4 mr-1" /> Undo
                        </Button>
                        <Button size="sm" onClick={finishDraw} disabled={drawPoints.length < 3}>
                            <Check className="h-4 w-4 mr-1" /> Finish
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelDraw}><X className="h-4 w-4" /></Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Territory list */}
                <Card className="lg:col-span-1 shadow-sm">
                    <CardContent className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                        ) : territories.length === 0 ? (
                            <div className="text-center py-8 text-sm text-muted-foreground">
                                No territories yet. Click <strong>New Territory</strong> and draw one on the map.
                            </div>
                        ) : (
                            territories.map((t) => (
                                <div
                                    key={t.id}
                                    onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                        t.id === selectedId ? 'border-primary bg-muted/50' : 'border-border hover:bg-muted/30'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: t.color || '#6366f1' }} />
                                            <span className="font-medium truncate">{t.name}</span>
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                                            onClick={(e) => { e.stopPropagation(); remove(t.id); }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                                        <span className="truncate">{t.agent_name || agentName(t.agent_id)}</span>
                                        {t.is_exclusive && (
                                            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                                                <ShieldCheck className="h-3 w-3 mr-0.5" /> exclusive
                                            </Badge>
                                        )}
                                        {t.priority > 0 && <span className="text-[10px]">priority {t.priority}</span>}
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Map */}
                <Card className="lg:col-span-2 shadow-sm overflow-hidden">
                    <div className="h-[70vh] w-full">
                        <TerritoryMap
                            territories={territories}
                            drawing={drawing}
                            drawPoints={drawPoints}
                            onAddPoint={addPoint}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                        />
                    </div>
                </Card>
            </div>

            {/* Create form */}
            <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setPendingBoundary(null); setDrawPoints([]); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Territory</DialogTitle>
                        <DialogDescription>Assign the drawn area to an agent. Leads that geocode inside it route to that agent.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Accra East" autoFocus />
                        </div>
                        <div>
                            <Label>Agent</Label>
                            <Select value={form.agentId} onValueChange={(v) => setForm((f) => ({ ...f, agentId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                                <SelectContent>
                                    {agents.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.display_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Agent'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Checkbox id="excl" checked={form.isExclusive} onCheckedChange={(c) => setForm((f) => ({ ...f, isExclusive: !!c }))} />
                                <Label htmlFor="excl" className="cursor-pointer">Exclusive (no overlap)</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="prio" className="text-sm">Priority</Label>
                                <Input id="prio" type="number" className="w-20" value={form.priority}
                                    onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
                            </div>
                        </div>
                        <div>
                            <Label>Colour</Label>
                            <div className="flex items-center gap-2 mt-1">
                                {COLORS.map((c) => (
                                    <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                                        className={`w-7 h-7 rounded-md border-2 ${form.color === c ? 'border-foreground' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }} aria-label={c} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setFormOpen(false); setPendingBoundary(null); setDrawPoints([]); }}>Cancel</Button>
                        <Button onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Create Territory'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
