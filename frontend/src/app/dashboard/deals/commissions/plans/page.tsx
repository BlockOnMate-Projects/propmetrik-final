'use client';

/**
 * Commission Plan Builder
 *
 * Configure how agents are paid: base-rate plans plus optional tiered rate
 * bands (higher rate as deal value crosses thresholds). The plan flagged
 * "Default" is what calculate_deal_commission applies org-wide when an agent
 * has no explicit assignment — so setting one default here immediately changes
 * every future commission from the 3% fallback to the configured structure.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Percent, Plus, Trash2, ChevronLeft, Star, Layers,
    Pencil, Check, X, Settings2, RefreshCw, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────
type PlanType = 'standard' | 'tiered' | 'flat' | 'graduated';

interface CommissionTier {
    id: string;
    plan_id: string;
    tier_name: string;
    min_value: number;
    max_value?: number | null;
    commission_rate: number;
    tier_bonus: number;
    tier_order: number;
}

interface CommissionPlan {
    id: string;
    name: string;
    description?: string;
    plan_type: PlanType;
    base_rate: number;
    is_default: boolean;
    is_active: boolean;
    effective_from?: string;
    tiers?: CommissionTier[];
}

// ─── Helpers ────────────────────────────────────────
const n = (v: unknown): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(x) ? x : 0;
};
const pctFromRate = (rate: unknown): string => (n(rate) * 100).toFixed(2);
const rateFromPct = (pct: string): number => (parseFloat(pct) || 0) / 100;
const fmtMoney = (v: unknown): string =>
    new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(n(v));

const PLAN_TYPES: { value: PlanType; label: string; hint: string }[] = [
    { value: 'standard', label: 'Standard', hint: 'Single base rate on every deal' },
    { value: 'flat', label: 'Flat', hint: 'Fixed rate, no tiers' },
    { value: 'tiered', label: 'Tiered', hint: 'Rate steps up as deal value crosses bands' },
    { value: 'graduated', label: 'Graduated', hint: 'Progressive bands with per-tier bonuses' },
];

const emptyPlan = {
    name: '', description: '', plan_type: 'standard' as PlanType,
    base_pct: '3.00', is_default: false, is_active: true,
};

// ─── Plan create/edit dialog ────────────────────────
function PlanDialog({
    open, onOpenChange, editing, onSaved,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    editing: CommissionPlan | null;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({ ...emptyPlan });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setForm(editing
                ? {
                    name: editing.name,
                    description: editing.description || '',
                    plan_type: editing.plan_type,
                    base_pct: pctFromRate(editing.base_rate),
                    is_default: editing.is_default,
                    is_active: editing.is_active,
                }
                : { ...emptyPlan });
        }
    }, [open, editing]);

    const save = async () => {
        if (!form.name.trim()) { toast.error('Plan name is required'); return; }
        const rate = rateFromPct(form.base_pct);
        if (rate < 0 || rate > 1) { toast.error('Base rate must be between 0% and 100%'); return; }
        setSaving(true);
        try {
            const body = {
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                plan_type: form.plan_type,
                base_rate: rate,
                is_default: form.is_default,
                is_active: form.is_active,
            };
            const res = editing
                ? await authedFetch(`/api/crm/commissions/plans/${editing.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    credentials: 'include', body: JSON.stringify(body),
                })
                : await authedFetch(`/api/crm/commissions/plans`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    credentials: 'include', body: JSON.stringify(body),
                });
            if (!res.ok) throw new Error('save failed');
            toast.success(editing ? 'Plan updated' : 'Plan created');
            onOpenChange(false);
            onSaved();
        } catch {
            toast.error('Failed to save plan');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5 text-primary" />
                        {editing ? 'Edit Commission Plan' : 'New Commission Plan'}
                    </DialogTitle>
                    <DialogDescription>
                        Define the base rate and structure. Mark one plan as default to apply it org-wide.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Plan name</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Standard Sales Plan" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Plan type</Label>
                            <Select value={form.plan_type} onValueChange={(v) => setForm(f => ({ ...f, plan_type: v as PlanType }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PLAN_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {PLAN_TYPES.find(t => t.value === form.plan_type)?.hint}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Base rate (%)</Label>
                            <Input type="number" step="0.01" min="0" max="100" value={form.base_pct}
                                onChange={e => setForm(f => ({ ...f, base_pct: e.target.value }))} />
                            <p className="text-xs text-muted-foreground">On a GH₵1M deal = {fmtMoney(rateFromPct(form.base_pct) * 1_000_000)}</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Textarea value={form.description} rows={2}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-6 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={form.is_default}
                                onCheckedChange={(c) => setForm(f => ({ ...f, is_default: c as boolean }))} />
                            <span className="text-sm">Default plan (applies org-wide)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={form.is_active}
                                onCheckedChange={(c) => setForm(f => ({ ...f, is_active: c as boolean }))} />
                            <span className="text-sm">Active</span>
                        </label>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={save} disabled={saving}
                        className="bg-primary text-primary-foreground hover:bg-primary/90">
                        {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Tier row editor (inline add) ───────────────────
function AddTierRow({ planId, onAdded }: { planId: string; onAdded: () => void }) {
    const [t, setT] = useState({ tier_name: '', min_value: '', max_value: '', rate_pct: '', tier_bonus: '' });
    const [saving, setSaving] = useState(false);

    const add = async () => {
        if (!t.tier_name.trim()) { toast.error('Tier name required'); return; }
        setSaving(true);
        try {
            const res = await authedFetch(`/api/crm/commissions/plans/${planId}/tiers`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    tier_name: t.tier_name.trim(),
                    min_value: parseFloat(t.min_value) || 0,
                    max_value: t.max_value ? parseFloat(t.max_value) : undefined,
                    commission_rate: rateFromPct(t.rate_pct),
                    tier_bonus: parseFloat(t.tier_bonus) || 0,
                }),
            });
            if (!res.ok) throw new Error();
            toast.success('Tier added');
            setT({ tier_name: '', min_value: '', max_value: '', rate_pct: '', tier_bonus: '' });
            onAdded();
        } catch {
            toast.error('Failed to add tier');
        } finally {
            setSaving(false);
        }
    };

    return (
        <TableRow className="border-border bg-muted/20">
            <TableCell><Input className="h-8" placeholder="Tier name" value={t.tier_name}
                onChange={e => setT(s => ({ ...s, tier_name: e.target.value }))} /></TableCell>
            <TableCell><Input className="h-8" type="number" placeholder="0" value={t.min_value}
                onChange={e => setT(s => ({ ...s, min_value: e.target.value }))} /></TableCell>
            <TableCell><Input className="h-8" type="number" placeholder="∞" value={t.max_value}
                onChange={e => setT(s => ({ ...s, max_value: e.target.value }))} /></TableCell>
            <TableCell><Input className="h-8" type="number" step="0.01" placeholder="%" value={t.rate_pct}
                onChange={e => setT(s => ({ ...s, rate_pct: e.target.value }))} /></TableCell>
            <TableCell><Input className="h-8" type="number" placeholder="0" value={t.tier_bonus}
                onChange={e => setT(s => ({ ...s, tier_bonus: e.target.value }))} /></TableCell>
            <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={add} disabled={saving}
                    className="h-8 text-green-500 hover:text-green-400">
                    <Check className="h-4 w-4" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

// ─── Plan card (with tiers) ─────────────────────────
function PlanCard({
    plan, onEdit, onDelete, onRefresh,
}: {
    plan: CommissionPlan;
    onEdit: (p: CommissionPlan) => void;
    onDelete: (p: CommissionPlan) => void;
    onRefresh: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const tiers = [...(plan.tiers || [])].sort((a, b) => n(a.tier_order) - n(b.tier_order));

    const deleteTier = async (tierId: string) => {
        try {
            const res = await authedFetch(`/api/crm/commissions/tiers/${tierId}`, {
                method: 'DELETE', credentials: 'include',
            });
            if (!res.ok) throw new Error();
            toast.success('Tier removed');
            onRefresh();
        } catch { toast.error('Failed to remove tier'); }
    };

    return (
        <Card className="shadow-sm">
            <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground">{plan.name}</h3>
                            {plan.is_default && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                    <Star className="h-3 w-3 mr-1" /> Default
                                </Badge>
                            )}
                            {!plan.is_active && (
                                <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
                            )}
                            <Badge variant="outline" className="capitalize">{plan.plan_type}</Badge>
                        </div>
                        {plan.description && (
                            <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                        )}
                        <p className="text-sm mt-2">
                            <span className="text-muted-foreground">Base rate</span>{' '}
                            <span className="font-semibold text-foreground">{pctFromRate(plan.base_rate)}%</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEdit(plan)}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                            onClick={() => onDelete(plan)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="mt-4">
                    <Button size="sm" variant="outline" onClick={() => setExpanded(e => !e)}>
                        <Layers className="h-4 w-4 mr-2" />
                        {tiers.length > 0 ? `${tiers.length} rate tier${tiers.length !== 1 ? 's' : ''}` : 'Add rate tiers'}
                    </Button>
                    {expanded && (
                        <div className="mt-3 rounded-lg border border-border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border hover:bg-transparent">
                                        <TableHead>Tier</TableHead>
                                        <TableHead>Min value</TableHead>
                                        <TableHead>Max value</TableHead>
                                        <TableHead>Rate</TableHead>
                                        <TableHead>Bonus</TableHead>
                                        <TableHead className="text-right">—</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tiers.map(tier => (
                                        <TableRow key={tier.id} className="border-border">
                                            <TableCell className="font-medium">{tier.tier_name}</TableCell>
                                            <TableCell>{fmtMoney(tier.min_value)}</TableCell>
                                            <TableCell>{tier.max_value != null ? fmtMoney(tier.max_value) : '∞'}</TableCell>
                                            <TableCell>{pctFromRate(tier.commission_rate)}%</TableCell>
                                            <TableCell>{fmtMoney(tier.tier_bonus)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="ghost"
                                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                                                    onClick={() => deleteTier(tier.id)}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <AddTierRow planId={plan.id} onAdded={onRefresh} />
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Agent → plan assignments ───────────────────────
interface AgentRow { id: string; display_name?: string; first_name?: string; last_name?: string; email?: string; }

function AgentAssignments({ plans }: { plans: CommissionPlan[] }) {
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [assigned, setAssigned] = useState<Record<string, string>>({}); // agentId -> planId
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await authedFetch(`/api/crm/agents?limit=200`, { credentials: 'include' });
            const data = res.ok ? await res.json() : { data: [] };
            const list: AgentRow[] = data.data || data.agents || [];
            setAgents(list);
            // Resolve each agent's current assignment in parallel.
            const entries = await Promise.all(list.map(async (a) => {
                try {
                    const r = await authedFetch(`/api/crm/agents/${a.id}/commission-assignment`, { credentials: 'include' });
                    if (!r.ok) return [a.id, ''] as const;
                    const j = await r.json();
                    return [a.id, j.assignment?.plan_id || ''] as const;
                } catch { return [a.id, ''] as const; }
            }));
            setAssigned(Object.fromEntries(entries));
        } catch {
            toast.error('Failed to load agents');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const assign = async (agentId: string, planId: string) => {
        setAssigned(prev => ({ ...prev, [agentId]: planId }));
        try {
            const res = await authedFetch(`/api/crm/agents/${agentId}/commission-assignment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ plan_id: planId }),
            });
            if (!res.ok) throw new Error();
            toast.success('Plan assigned');
        } catch {
            toast.error('Failed to assign plan');
            load();
        }
    };

    const name = (a: AgentRow) => a.display_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || 'Agent';

    if (loading) return null;
    if (agents.length === 0) return null;

    return (
        <Card className="shadow-sm">
            <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                    <Users className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold">Agent Assignments</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    Override the default plan per agent. Unassigned agents use the default plan.
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead>Agent</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead className="w-[220px]">Commission plan</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {agents.map(a => (
                                <TableRow key={a.id} className="border-border">
                                    <TableCell className="font-medium">{name(a)}</TableCell>
                                    <TableCell className="text-muted-foreground text-sm">{a.email || '—'}</TableCell>
                                    <TableCell>
                                        <Select value={assigned[a.id] || ''} onValueChange={(v) => assign(a.id, v)}>
                                            <SelectTrigger className="h-8">
                                                <SelectValue placeholder="Default plan" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {plans.filter(p => p.is_active).map(p => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.name} ({pctFromRate(p.base_rate)}%)
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Page ───────────────────────────────────────────
export default function CommissionPlansPage() {
    const router = useRouter();
    const [plans, setPlans] = useState<CommissionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<CommissionPlan | null>(null);

    const fetchPlans = useCallback(async () => {
        try {
            const res = await authedFetch(`/api/crm/commissions/plans?active=false`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setPlans(data.plans || []);
            }
        } catch {
            toast.error('Failed to load plans');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPlans(); }, [fetchPlans]);

    const del = async (plan: CommissionPlan) => {
        if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
        try {
            const res = await authedFetch(`/api/crm/commissions/plans/${plan.id}`, {
                method: 'DELETE', credentials: 'include',
            });
            if (!res.ok) throw new Error();
            toast.success('Plan deleted');
            fetchPlans();
        } catch { toast.error('Failed to delete plan'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <button onClick={() => router.push('/dashboard/deals/commissions')}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
                        <ChevronLeft className="h-4 w-4" /> Back to Commissions
                    </button>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <Percent className="h-6 w-6 text-primary" />
                        Commission Plans
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure base rates and tiered structures. The default plan prices every deal automatically.
                    </p>
                </div>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => { setEditing(null); setDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> New Plan
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : plans.length === 0 ? (
                <Card className="shadow-sm">
                    <CardContent className="py-16 text-center">
                        <Percent className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="font-medium text-foreground">No commission plans yet</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                            Without a default plan, deals fall back to a flat 3%. Create your structure to take control.
                        </p>
                        <Button className="bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => { setEditing(null); setDialogOpen(true); }}>
                            <Plus className="h-4 w-4 mr-2" /> Create your first plan
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {plans.map(plan => (
                        <PlanCard key={plan.id} plan={plan}
                            onEdit={(p) => { setEditing(p); setDialogOpen(true); }}
                            onDelete={del}
                            onRefresh={fetchPlans} />
                    ))}
                </div>
            )}

            {!loading && plans.length > 0 && <AgentAssignments plans={plans} />}

            <PlanDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={fetchPlans} />
        </div>
    );
}
