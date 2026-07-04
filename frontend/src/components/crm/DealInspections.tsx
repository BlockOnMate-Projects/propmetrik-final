'use client';

/**
 * Deal Inspections — CRM/sales surface over the shared inspection engine. Lets a deal own
 * buyer due-diligence / pre-purchase condition inspections (same engine as PM, deal-linked).
 */

import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dealInspectionsApi, type PropertyInspection, type InspectionItem } from '@/lib/crm-api';
import { toast } from 'sonner';

const TYPES = ['due_diligence', 'pre_purchase', 'pre_listing', 'condition'];
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'damaged', 'na'];

const condColor = (c: string) =>
    c === 'excellent' || c === 'good' ? 'text-emerald-500 border-emerald-500/30'
        : c === 'fair' ? 'text-yellow-500 border-yellow-500/30'
            : c === 'poor' || c === 'damaged' ? 'text-red-500 border-red-500/30' : 'text-muted-foreground';
const statusColor = (s: string) =>
    s === 'completed' ? 'text-emerald-500 border-emerald-500/30'
        : s === 'in_progress' ? 'text-blue-500 border-blue-500/30'
            : s === 'cancelled' ? 'text-red-500 border-red-500/30' : 'text-yellow-500 border-yellow-500/30';

export default function DealInspections({ dealId }: { dealId: string }) {
    const [inspections, setInspections] = useState<PropertyInspection[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ inspectionType: 'due_diligence', scheduledFor: '', summary: '' });
    const [active, setActive] = useState<PropertyInspection | null>(null);
    const [newItem, setNewItem] = useState({ area: '', item: '', condition: 'good', notes: '' });
    const [showComplete, setShowComplete] = useState(false);
    const [completeForm, setCompleteForm] = useState({ overallCondition: 'good', summary: '' });
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        dealInspectionsApi.getForDeal(dealId).then(setInspections).catch(() => setInspections([])).finally(() => setLoading(false));
    }, [dealId]);
    useEffect(() => { load(); }, [load]);

    const openConduct = async (id: string) => {
        try { setActive(await dealInspectionsApi.getById(id)); }
        catch (e: any) { toast.error(e?.message || 'Failed to open inspection'); }
    };
    const refreshActive = async () => { if (active) setActive(await dealInspectionsApi.getById(active.id)); };

    const create = async () => {
        setBusy(true);
        try {
            const insp = await dealInspectionsApi.create(dealId, {
                inspectionType: form.inspectionType, scheduledFor: form.scheduledFor || undefined, summary: form.summary || undefined,
            });
            toast.success('Inspection created');
            setShowCreate(false);
            setForm({ inspectionType: 'due_diligence', scheduledFor: '', summary: '' });
            load();
            openConduct(insp.id);
        } catch (e: any) { toast.error(e?.message || 'Failed to create'); }
        finally { setBusy(false); }
    };
    const addItem = async () => {
        if (!active || !newItem.area.trim() || !newItem.item.trim()) { toast.error('Area and item are required'); return; }
        try { await dealInspectionsApi.addItem(active.id, newItem); setNewItem({ area: newItem.area, item: '', condition: 'good', notes: '' }); refreshActive(); }
        catch (e: any) { toast.error(e?.message || 'Failed to add item'); }
    };
    const complete = async () => {
        if (!active) return;
        setBusy(true);
        try { await dealInspectionsApi.complete(active.id, completeForm); toast.success('Inspection completed'); setShowComplete(false); await refreshActive(); load(); }
        catch (e: any) { toast.error(e?.message || 'Failed to complete'); }
        finally { setBusy(false); }
    };
    const remove = async (id: string) => {
        if (typeof window !== 'undefined' && !window.confirm('Delete this inspection?')) return;
        try { await dealInspectionsApi.remove(id); toast.success('Deleted'); if (active?.id === id) setActive(null); load(); }
        catch (e: any) { toast.error(e?.message || 'Failed to delete'); }
    };

    return (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Inspections</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}><Plus className="h-3 w-3 mr-1" /> New</Button>
            </CardHeader>
            <CardContent className="space-y-2">
                {loading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
                ) : inspections.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No inspections. Add a buyer due-diligence inspection.</p>
                ) : inspections.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50" onClick={() => openConduct(i.id)}>
                        <div className="min-w-0 flex-1">
                            <span className="text-sm capitalize">{i.inspection_type.replace(/_/g, ' ')}</span>
                            {i.overall_condition && <Badge variant="outline" className={`ml-2 text-[10px] ${condColor(i.overall_condition)} capitalize`}>{i.overall_condition}</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{i.item_count ?? 0} items</span>
                        <Badge variant="outline" className={`text-[10px] ${statusColor(i.status)}`}>{i.status.replace('_', ' ')}</Badge>
                        <button className="text-muted-foreground hover:text-red-400" onClick={(e) => { e.stopPropagation(); remove(i.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                ))}
            </CardContent>

            {/* Create */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                    <DialogHeader><DialogTitle>New Deal Inspection</DialogTitle><DialogDescription>Attach a condition/due-diligence inspection to this deal.</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Type</Label>
                            <Select value={form.inspectionType} onValueChange={(v) => setForm((s) => ({ ...s, inspectionType: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Scheduled for</Label>
                            <Input type="date" value={form.scheduledFor} onChange={(e) => setForm((s) => ({ ...s, scheduledFor: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Conduct */}
            <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 capitalize">
                            {active?.inspection_type.replace(/_/g, ' ')} inspection
                            {active && <Badge variant="outline" className={`text-[10px] ${statusColor(active.status)}`}>{active.status.replace('_', ' ')}</Badge>}
                        </DialogTitle>
                        <DialogDescription>Room-by-room condition items.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        {(active?.items || []).map((it: InspectionItem) => (
                            <div key={it.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium">{it.area}</span><span className="text-sm text-muted-foreground"> · {it.item}</span>
                                    {it.notes && <p className="text-xs text-muted-foreground truncate">{it.notes}</p>}
                                </div>
                                <Badge variant="outline" className={`${condColor(it.condition)} capitalize`}>{it.condition}</Badge>
                                {active?.status !== 'completed' && (
                                    <button className="text-muted-foreground hover:text-red-400"
                                        onClick={async () => { await dealInspectionsApi.deleteItem(it.id); refreshActive(); }}><Trash2 className="h-3.5 w-3.5" /></button>
                                )}
                            </div>
                        ))}
                        {(active?.items || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No items yet.</p>}

                        {active?.status !== 'completed' && (
                            <div className="grid grid-cols-12 gap-2 pt-2 border-t border-border/50">
                                <Input className="col-span-3" placeholder="Area" value={newItem.area} onChange={(e) => setNewItem((s) => ({ ...s, area: e.target.value }))} />
                                <Input className="col-span-3" placeholder="Element" value={newItem.item} onChange={(e) => setNewItem((s) => ({ ...s, item: e.target.value }))} />
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
                    </div>
                    {active?.status !== 'completed' && (
                        <DialogFooter>
                            <Button onClick={() => { setCompleteForm({ overallCondition: active?.overall_condition || 'good', summary: active?.summary || '' }); setShowComplete(true); }}>
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            {/* Complete */}
            <Dialog open={showComplete} onOpenChange={setShowComplete}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Complete inspection</DialogTitle><DialogDescription>Record the overall condition.</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Overall condition</Label>
                            <Select value={completeForm.overallCondition} onValueChange={(v) => setCompleteForm((s) => ({ ...s, overallCondition: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{CONDITIONS.filter((c) => c !== 'na').map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Summary</Label><Textarea rows={3} value={completeForm.summary} onChange={(e) => setCompleteForm((s) => ({ ...s, summary: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowComplete(false)}>Cancel</Button>
                        <Button onClick={complete} disabled={busy}>{busy ? 'Completing…' : 'Complete'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
