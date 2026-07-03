'use client';

/**
 * Billing Board — CRM accounts-receivable dashboard.
 * AR summary + aging buckets + invoice list with the draft→sent→paid workflow.
 * All live from /crm/invoices/*.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Receipt, AlertTriangle, Wallet, Clock, Plus, Send, CreditCard, XCircle, RefreshCw, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';
import { toast } from 'sonner';

const n = (v: unknown): number => { const x = typeof v === 'string' ? parseFloat(v) : (v as number); return Number.isFinite(x) ? x : 0; };
const money = (v: unknown) => formatCurrency(n(v));
const dateStr = (s?: string) => s ? new Date(s).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

interface Invoice {
    id: string; invoice_number: string; client_name?: string; deal_title?: string;
    amount: number; paid_amount: number; status: string; issue_date: string; due_date: string;
}
interface Summary { total_invoiced: number; total_collected: number; outstanding: number; overdue: number; open_count: number; draft_count: number; paid_count: number; }
interface Aging { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number; }

const statusColor = (s: string) => ({
    paid: 'bg-green-500/10 text-green-500 border-green-500/20',
    partially_paid: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    sent: 'bg-primary/10 text-primary border-primary/20',
    overdue: 'bg-red-500/10 text-red-500 border-red-500/20',
    draft: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    cancelled: 'bg-muted text-muted-foreground border-border',
}[s] || 'bg-muted text-muted-foreground border-border');

const isOverdue = (inv: Invoice) =>
    ['sent', 'partially_paid', 'overdue'].includes(inv.status) && new Date(inv.due_date) < new Date();

function PaymentDialog({ open, onOpenChange, invoice, onDone }: {
    open: boolean; onOpenChange: (o: boolean) => void; invoice: Invoice | null; onDone: () => void;
}) {
    const [amount, setAmount] = useState('');
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);
    const remaining = invoice ? n(invoice.amount) - n(invoice.paid_amount) : 0;

    useEffect(() => { if (open && invoice) setAmount(String(n(invoice.amount) - n(invoice.paid_amount))); }, [open, invoice]);

    const submit = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
        setSaving(true);
        try {
            const res = await authedFetch(`/api/crm/invoices/${invoice!.id}/record-payment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ amount: amt, payment_method: 'bank_transfer', payment_reference: reference.trim() || undefined }),
            });
            if (!res.ok) throw new Error();
            toast.success('Payment recorded');
            onOpenChange(false); onDone();
        } catch { toast.error('Failed to record payment'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Record Payment</DialogTitle>
                    <DialogDescription>{invoice?.invoice_number} · {money(remaining)} outstanding</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2"><Label>Amount (GHS)</Label>
                        <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Reference (optional)</Label>
                        <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Transfer / receipt no." /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        {saving ? 'Recording…' : 'Record'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CreateInvoiceDialog({ open, onOpenChange, onDone }: {
    open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
    const [form, setForm] = useState({ client_name: '', amount: '', due_date: '', description: '' });
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const amt = parseFloat(form.amount);
        if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
        setSaving(true);
        try {
            const res = await authedFetch(`/api/crm/invoices`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    client_name: form.client_name.trim() || undefined,
                    amount: amt,
                    due_date: form.due_date || undefined,
                    description: form.description.trim() || undefined,
                }),
            });
            if (!res.ok) throw new Error();
            toast.success('Invoice created');
            setForm({ client_name: '', amount: '', due_date: '', description: '' });
            onOpenChange(false); onDone();
        } catch { toast.error('Failed to create invoice'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> New Invoice</DialogTitle>
                    <DialogDescription>Raise a receivable. Net-30 terms unless a due date is set.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2"><Label>Client</Label>
                        <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Client name" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Amount (GHS)</Label>
                            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Due date</Label>
                            <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
                    </div>
                    <div className="space-y-2"><Label>Description</Label>
                        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this for?" /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        {saving ? 'Creating…' : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function BillingBoard({ className }: { className?: string }) {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [aging, setAging] = useState<Aging | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [revrec, setRevrec] = useState<{ recognized: number; deferred: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [payInv, setPayInv] = useState<Invoice | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const [s, a, list, rr] = await Promise.all([
                authedFetch('/api/crm/invoices/summary', { credentials: 'include' }),
                authedFetch('/api/crm/invoices/ar-aging', { credentials: 'include' }),
                authedFetch('/api/crm/invoices', { credentials: 'include' }),
                authedFetch('/api/crm/analytics/revenue-recognition', { credentials: 'include' }),
            ]);
            if (s.ok) setSummary((await s.json()).summary);
            if (a.ok) setAging((await a.json()).aging);
            if (list.ok) setInvoices((await list.json()).invoices || []);
            if (rr.ok) { const d = await rr.json(); setRevrec({ recognized: n(d.recognized), deferred: n(d.deferred) }); }
        } finally { setLoading(false); }
    }, []);

    const exportCsv = () => {
        if (invoices.length === 0) { toast.error('No invoices to export'); return; }
        const headers = ['Invoice', 'Client', 'Issue', 'Due', 'Amount', 'Paid', 'Balance', 'Status'];
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = invoices.map(i => [
            i.invoice_number, i.client_name || i.deal_title || '', i.issue_date, i.due_date,
            n(i.amount), n(i.paid_amount), n(i.amount) - n(i.paid_amount), i.status,
        ].map(esc).join(','));
        const csv = [headers.map(esc).join(','), ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `receivables-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${invoices.length} invoices`);
    };

    useEffect(() => { load(); }, [load]);

    const action = async (id: string, verb: 'send' | 'cancel') => {
        try {
            const res = await authedFetch(`/api/crm/invoices/${id}/${verb}`, { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error();
            toast.success(verb === 'send' ? 'Invoice sent' : 'Invoice cancelled');
            load();
        } catch { toast.error(`Failed to ${verb} invoice`); }
    };

    if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div>;

    const agingRows = aging ? [
        { label: 'Current', value: aging.current, accent: 'bg-success' },
        { label: '1–30 days', value: aging.d1_30, accent: 'bg-primary' },
        { label: '31–60 days', value: aging.d31_60, accent: 'bg-amber-500' },
        { label: '61–90 days', value: aging.d61_90, accent: 'bg-orange-500' },
        { label: '90+ days', value: aging.d90_plus, accent: 'bg-red-500' },
    ] : [];
    const agingMax = Math.max(1, ...agingRows.map(r => r.value));

    return (
        <div className={className}>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">Billing &amp; Receivables</h2>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={exportCsv}>
                        <Download className="w-4 h-4 mr-2" /> Export CSV
                    </Button>
                    <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> New Invoice
                    </Button>
                </div>
            </div>

            {/* Revenue recognition strip */}
            {revrec && (revrec.recognized > 0 || revrec.deferred > 0) && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                        <p className="text-sm text-muted-foreground">Recognized revenue</p>
                        <p className="text-xl font-bold text-success">{money(revrec.recognized)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Cash collected to date</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-sm text-muted-foreground">Deferred revenue</p>
                        <p className="text-xl font-bold">{money(revrec.deferred)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Invoiced, awaiting collection</p>
                    </div>
                </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card className="shadow-sm"><CardContent className="pt-6">
                    <div className="flex items-center justify-between"><div>
                        <p className="text-sm text-muted-foreground">Outstanding</p>
                        <p className="text-xl font-bold">{money(summary?.outstanding)}</p>
                        <p className="text-xs text-muted-foreground">{summary?.open_count || 0} open</p>
                    </div><Wallet className="w-7 h-7 text-primary/60" /></div>
                </CardContent></Card>
                <Card className="shadow-sm border-red-500/20"><CardContent className="pt-6">
                    <div className="flex items-center justify-between"><div>
                        <p className="text-sm text-muted-foreground">Overdue</p>
                        <p className="text-xl font-bold text-red-500">{money(summary?.overdue)}</p>
                    </div><AlertTriangle className="w-7 h-7 text-red-500/60" /></div>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="pt-6">
                    <div className="flex items-center justify-between"><div>
                        <p className="text-sm text-muted-foreground">Collected</p>
                        <p className="text-xl font-bold text-success">{money(summary?.total_collected)}</p>
                        <p className="text-xs text-muted-foreground">{summary?.paid_count || 0} paid</p>
                    </div><CreditCard className="w-7 h-7 text-success/60" /></div>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="pt-6">
                    <div className="flex items-center justify-between"><div>
                        <p className="text-sm text-muted-foreground">Total invoiced</p>
                        <p className="text-xl font-bold">{money(summary?.total_invoiced)}</p>
                    </div><Receipt className="w-7 h-7 text-muted-foreground/50" /></div>
                </CardContent></Card>
            </div>

            {/* Aging */}
            {aging && aging.total > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-medium">AR Aging</h3>
                        <span className="text-xs text-muted-foreground ml-auto">{money(aging.total)} outstanding</span></div>
                    <div className="space-y-2">
                        {agingRows.map(r => (
                            <div key={r.label} className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-20 shrink-0">{r.label}</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${r.accent}`} style={{ width: `${(r.value / agingMax) * 100}%` }} />
                                </div>
                                <span className="text-xs font-medium w-24 text-right">{formatCurrencyCompact(r.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Invoice list */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-medium">Invoices</h3></div>
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                            <TableHead>Invoice</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.map(inv => {
                            const bal = n(inv.amount) - n(inv.paid_amount);
                            const overdue = isOverdue(inv);
                            return (
                                <TableRow key={inv.id} className="border-border">
                                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                    <TableCell className="text-muted-foreground">{inv.client_name || inv.deal_title || '—'}</TableCell>
                                    <TableCell className={overdue ? 'text-red-500' : ''}>{dateStr(inv.due_date)}</TableCell>
                                    <TableCell className="text-right">{money(inv.amount)}</TableCell>
                                    <TableCell className="text-right font-medium">{money(bal)}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={statusColor(overdue && inv.status !== 'paid' ? 'overdue' : inv.status)}>
                                            {overdue && inv.status !== 'paid' ? 'overdue' : inv.status.replace('_', ' ')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {inv.status === 'draft' && (
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary" title="Send"
                                                    onClick={() => action(inv.id, 'send')}><Send className="h-4 w-4" /></Button>
                                            )}
                                            {['sent', 'partially_paid', 'overdue'].includes(inv.status) && bal > 0 && (
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-500" title="Record payment"
                                                    onClick={() => setPayInv(inv)}><CreditCard className="h-4 w-4" /></Button>
                                            )}
                                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" title="Cancel"
                                                    onClick={() => action(inv.id, 'cancel')}><XCircle className="h-4 w-4" /></Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {invoices.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                No invoices yet. Won deals auto-raise a draft invoice, or create one manually.
                            </TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <PaymentDialog open={!!payInv} onOpenChange={(o) => !o && setPayInv(null)} invoice={payInv} onDone={load} />
            <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} onDone={load} />
        </div>
    );
}
