'use client';

/**
 * Property Condition Inspections (PM) — move-in / move-out / routine condition reports.
 * List + conduct (room-by-room condition items) + complete.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    ClipboardCheck, Plus, ArrowLeft, Trash2, CheckCircle2, Loader2, Home, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { inspectionsApi, propertyManagementApi, type PropertyInspection, type InspectionItem } from '@/lib/property-management-api';
import { toast } from 'sonner';

const TYPES = ['move_in', 'move_out', 'routine', 'periodic', 'maintenance'];
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'damaged', 'na'];

const condColor = (c: string) =>
    c === 'excellent' || c === 'good' ? 'text-emerald-500 border-emerald-500/30'
        : c === 'fair' ? 'text-yellow-500 border-yellow-500/30'
            : c === 'poor' || c === 'damaged' ? 'text-red-500 border-red-500/30'
                : 'text-muted-foreground';

const statusColor = (s: string) =>
    s === 'completed' ? 'text-emerald-500 border-emerald-500/30'
        : s === 'in_progress' ? 'text-blue-500 border-blue-500/30'
            : s === 'cancelled' ? 'text-red-500 border-red-500/30'
                : 'text-yellow-500 border-yellow-500/30';

export default function InspectionsPage() {
    const [inspections, setInspections] = useState<PropertyInspection[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<PropertyInspection | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ propertyId: '', inspectionType: 'move_in', scheduledFor: '', summary: '' });

    const [newItem, setNewItem] = useState({ area: '', item: '', condition: 'good', notes: '' });
    const [showComplete, setShowComplete] = useState(false);
    const [completeForm, setCompleteForm] = useState({ overallCondition: 'good', summary: '' });
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [insp, props] = await Promise.all([
                inspectionsApi.getAll(),
                propertyManagementApi.getProperties({ limit: 200 }).catch(() => []),
            ]);
            setInspections(insp || []);
            const list = Array.isArray(props) ? props : ((props as any)?.data ?? (props as any)?.items ?? []);
            setProperties(list);
        } catch (e: any) {
            toast.error(e?.message || 'Failed to load inspections');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const openDetail = async (id: string) => {
        try { setSelected(await inspectionsApi.getById(id)); }
        catch (e: any) { toast.error(e?.message || 'Failed to load inspection'); }
    };
    const refreshDetail = async () => { if (selected) setSelected(await inspectionsApi.getById(selected.id)); };

    const propName = (id: string | null) => {
        if (!id) return 'Unassigned property';
        const p = properties.find((x) => x.id === id);
        return p?.title || p?.name || p?.address_street || 'Property';
    };

    const create = async () => {
        setBusy(true);
        try {
            const insp = await inspectionsApi.create({
                propertyId: form.propertyId || undefined,
                inspectionType: form.inspectionType,
                scheduledFor: form.scheduledFor || undefined,
                summary: form.summary || undefined,
            });
            toast.success('Inspection created');
            setShowCreate(false);
            setForm({ propertyId: '', inspectionType: 'move_in', scheduledFor: '', summary: '' });
            await load();
            openDetail(insp.id);
        } catch (e: any) { toast.error(e?.message || 'Failed to create'); }
        finally { setBusy(false); }
    };

    const addItem = async () => {
        if (!selected || !newItem.area.trim() || !newItem.item.trim()) { toast.error('Area and item are required'); return; }
        try {
            await inspectionsApi.addItem(selected.id, newItem);
            setNewItem({ area: newItem.area, item: '', condition: 'good', notes: '' }); // keep area for fast entry
            refreshDetail();
        } catch (e: any) { toast.error(e?.message || 'Failed to add item'); }
    };
    const deleteItem = async (itemId: string) => {
        try { await inspectionsApi.deleteItem(itemId); refreshDetail(); }
        catch (e: any) { toast.error(e?.message || 'Failed to delete item'); }
    };
    const complete = async () => {
        if (!selected) return;
        setBusy(true);
        try {
            await inspectionsApi.complete(selected.id, completeForm);
            toast.success('Inspection completed');
            setShowComplete(false);
            await refreshDetail();
            load();
        } catch (e: any) { toast.error(e?.message || 'Failed to complete'); }
        finally { setBusy(false); }
    };
    const remove = async (id: string) => {
        if (typeof window !== 'undefined' && !window.confirm('Delete this inspection?')) return;
        try { await inspectionsApi.remove(id); toast.success('Deleted'); setSelected(null); load(); }
        catch (e: any) { toast.error(e?.message || 'Failed to delete'); }
    };

    // ── Detail (conduct) view ────────────────────────────
    if (selected) {
        return (
            <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Home className="h-5 w-5 text-primary" /> {selected.property_name || propName(selected.property_id)}
                        </h1>
                        <p className="text-sm text-muted-foreground capitalize">{selected.inspection_type.replace('_', ' ')} inspection</p>
                    </div>
                    <Badge variant="outline" className={statusColor(selected.status)}>{selected.status.replace('_', ' ')}</Badge>
                    {selected.status !== 'completed' && (
                        <Button size="sm" onClick={() => { setCompleteForm({ overallCondition: selected.overall_condition || 'good', summary: selected.summary || '' }); setShowComplete(true); }}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-400" onClick={() => remove(selected.id)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>

                {/* Condition items */}
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="text-sm">Condition items</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {(selected.items || []).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">No items yet. Add rooms/elements below.</p>
                        )}
                        {(selected.items || []).map((it: InspectionItem) => (
                            <div key={it.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded">
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium">{it.area}</span>
                                    <span className="text-sm text-muted-foreground"> · {it.item}</span>
                                    {it.notes && <p className="text-xs text-muted-foreground truncate">{it.notes}</p>}
                                </div>
                                <Badge variant="outline" className={`${condColor(it.condition)} capitalize`}>{it.condition}</Badge>
                                {selected.status !== 'completed' && (
                                    <button className="text-muted-foreground hover:text-red-400" onClick={() => deleteItem(it.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                                )}
                            </div>
                        ))}

                        {/* Add item (inline) */}
                        {selected.status !== 'completed' && (
                            <div className="grid grid-cols-12 gap-2 pt-2 border-t border-border/50">
                                <Input className="col-span-3" placeholder="Area (Kitchen)" value={newItem.area} onChange={(e) => setNewItem((s) => ({ ...s, area: e.target.value }))} />
                                <Input className="col-span-3" placeholder="Element (Walls)" value={newItem.item} onChange={(e) => setNewItem((s) => ({ ...s, item: e.target.value }))} />
                                <div className="col-span-2">
                                    <Select value={newItem.condition} onValueChange={(v) => setNewItem((s) => ({ ...s, condition: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <Input className="col-span-3" placeholder="Notes" value={newItem.notes} onChange={(e) => setNewItem((s) => ({ ...s, notes: e.target.value }))} />
                                <Button className="col-span-1" size="sm" onClick={addItem}><Plus className="h-4 w-4" /></Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {(selected.overall_condition || selected.summary) && (
                    <Card className="shadow-sm">
                        <CardContent className="p-4">
                            {selected.overall_condition && (
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm text-muted-foreground">Overall:</span>
                                    <Badge variant="outline" className={`${condColor(selected.overall_condition)} capitalize`}>{selected.overall_condition}</Badge>
                                </div>
                            )}
                            {selected.summary && <p className="text-sm text-muted-foreground">{selected.summary}</p>}
                        </CardContent>
                    </Card>
                )}

                {/* Complete dialog */}
                <Dialog open={showComplete} onOpenChange={setShowComplete}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Complete inspection</DialogTitle>
                            <DialogDescription>Record the overall condition and any summary notes.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label>Overall condition</Label>
                                <Select value={completeForm.overallCondition} onValueChange={(v) => setCompleteForm((s) => ({ ...s, overallCondition: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{CONDITIONS.filter((c) => c !== 'na').map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Summary</Label>
                                <Textarea rows={3} value={completeForm.summary} onChange={(e) => setCompleteForm((s) => ({ ...s, summary: e.target.value }))} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowComplete(false)}>Cancel</Button>
                            <Button onClick={complete} disabled={busy}>{busy ? 'Completing…' : 'Complete'}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // ── List view ────────────────────────────────────────
    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /> Property Inspections</h1>
                    <p className="text-sm text-muted-foreground mt-1">Move-in / move-out / routine condition reports.</p>
                </div>
                <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New Inspection</Button>
            </div>

            <Card className="shadow-sm">
                <CardContent className="p-3 space-y-2">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                    ) : inspections.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">No inspections yet.</div>
                    ) : (
                        inspections.map((i) => (
                            <div key={i.id} onClick={() => openDetail(i.id)}
                                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer">
                                <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium">{i.property_name || propName(i.property_id)}</span>
                                    <span className="text-xs text-muted-foreground ml-2 capitalize">{i.inspection_type.replace('_', ' ')}</span>
                                </div>
                                {i.scheduled_for && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(i.scheduled_for).toLocaleDateString()}</span>
                                )}
                                <span className="text-xs text-muted-foreground">{i.item_count ?? 0} items</span>
                                <Badge variant="outline" className={statusColor(i.status)}>{i.status.replace('_', ' ')}</Badge>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            {/* New inspection dialog */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Inspection</DialogTitle>
                        <DialogDescription>Schedule a condition inspection for a property.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Property</Label>
                            <Select value={form.propertyId} onValueChange={(v) => setForm((s) => ({ ...s, propertyId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select a property" /></SelectTrigger>
                                <SelectContent>
                                    {properties.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.title || p.name || p.address_street || 'Property'}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Type</Label>
                                <Select value={form.inspectionType} onValueChange={(v) => setForm((s) => ({ ...s, inspectionType: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Scheduled for</Label>
                                <Input type="date" value={form.scheduledFor} onChange={(e) => setForm((s) => ({ ...s, scheduledFor: e.target.value }))} />
                            </div>
                        </div>
                        <div>
                            <Label>Notes (optional)</Label>
                            <Textarea rows={2} value={form.summary} onChange={(e) => setForm((s) => ({ ...s, summary: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
