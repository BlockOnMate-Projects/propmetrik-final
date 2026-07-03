'use client';

/**
 * Commission Statement Detail
 *
 * A payable statement: header + summary + the deal-by-deal line items that make
 * up the net commission, with the draft → approved → paid workflow and a
 * printable view for the payout run.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft, FileText, Check, CreditCard, Printer, RefreshCw,
    Building2, CalendarDays, Hash,
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
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

const n = (v: unknown): number => {
    const x = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(x) ? x : 0;
};
const money = (v: unknown): string =>
    new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(n(v));
const date = (s?: string): string =>
    s ? new Date(s).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

interface LineItem {
    id: string;
    deal_reference?: string;
    property_address?: string;
    deal_close_date: string;
    deal_value: number;
    commission_amount: number;
}
interface Statement {
    id: string;
    statement_number: string;
    agent_name?: string;
    period_start: string;
    period_end: string;
    total_deals: number;
    total_deal_value: number;
    gross_commission: number;
    deductions?: number;
    clawbacks?: number;
    bonuses?: number;
    net_commission: number;
    status: 'draft' | 'approved' | 'paid' | 'disputed';
    paid_at?: string;
    payment_method?: string;
    payment_reference?: string;
    line_items?: LineItem[];
}

const statusColor = (s: string): string => ({
    paid: 'bg-green-500/10 text-green-500 border-green-500/20',
    approved: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    draft: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    disputed: 'bg-red-500/10 text-red-500 border-red-500/20',
}[s] || 'bg-muted text-muted-foreground border-border');

function PayDialog({ open, onOpenChange, onPaid, statementId }: {
    open: boolean; onOpenChange: (o: boolean) => void; onPaid: () => void; statementId: string;
}) {
    const [method, setMethod] = useState('bank_transfer');
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);

    const pay = async () => {
        if (!reference.trim()) { toast.error('Payment reference is required'); return; }
        setSaving(true);
        try {
            const res = await authedFetch(`/api/crm/commissions/statements/${statementId}/pay`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ payment_method: method, payment_reference: reference.trim() }),
            });
            if (!res.ok) throw new Error();
            toast.success('Statement marked paid');
            onOpenChange(false);
            onPaid();
        } catch { toast.error('Failed to record payment'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" /> Record Payment
                    </DialogTitle>
                    <DialogDescription>Mark this statement paid and record how it was settled.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Payment method</Label>
                        <Select value={method} onValueChange={setMethod}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                                <SelectItem value="mobile_money">Mobile money</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="cheque">Cheque</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Payment reference</Label>
                        <Input value={reference} onChange={e => setReference(e.target.value)}
                            placeholder="e.g. transfer / receipt number" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={pay} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        {saving ? 'Recording…' : 'Mark Paid'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function StatementDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const [stmt, setStmt] = useState<Statement | null>(null);
    const [loading, setLoading] = useState(true);
    const [payOpen, setPayOpen] = useState(false);

    const fetchStmt = useCallback(async () => {
        try {
            const res = await authedFetch(`/api/crm/commissions/statements/${id}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setStmt(data.statement);
            } else {
                toast.error('Statement not found');
            }
        } catch { toast.error('Failed to load statement'); }
        finally { setLoading(false); }
    }, [id]);

    useEffect(() => { if (id) fetchStmt(); }, [id, fetchStmt]);

    const approve = async () => {
        try {
            const res = await authedFetch(`/api/crm/commissions/statements/${id}/approve`, {
                method: 'POST', credentials: 'include',
            });
            if (!res.ok) throw new Error();
            toast.success('Statement approved — its commissions are now approved too');
            fetchStmt();
        } catch { toast.error('Failed to approve'); }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    if (!stmt) {
        return (
            <div className="space-y-4">
                <button onClick={() => router.push('/dashboard/deals/commissions')}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" /> Back to Commissions
                </button>
                <Card><CardContent className="py-16 text-center text-muted-foreground">Statement not found.</CardContent></Card>
            </div>
        );
    }

    const items = stmt.line_items || [];

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-border print:border-none">
                <div>
                    <button onClick={() => router.push('/dashboard/deals/commissions')}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1 print:hidden">
                        <ChevronLeft className="h-4 w-4" /> Back to Commissions
                    </button>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" />
                        {stmt.statement_number}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                        <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />{stmt.agent_name || 'Unknown agent'}</span>
                        <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{date(stmt.period_start)} – {date(stmt.period_end)}</span>
                        <Badge variant="outline" className={statusColor(stmt.status)}>{stmt.status}</Badge>
                    </div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer className="h-4 w-4 mr-2" /> Print
                    </Button>
                    {stmt.status === 'draft' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={approve}>
                            <Check className="h-4 w-4 mr-2" /> Approve
                        </Button>
                    )}
                    {stmt.status === 'approved' && (
                        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setPayOpen(true)}>
                            <CreditCard className="h-4 w-4 mr-2" /> Mark Paid
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="shadow-sm"><CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Deals</p>
                    <p className="text-xl font-bold">{n(stmt.total_deals)}</p>
                    <p className="text-xs text-muted-foreground">{money(stmt.total_deal_value)} volume</p>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Gross commission</p>
                    <p className="text-xl font-bold">{money(stmt.gross_commission)}</p>
                </CardContent></Card>
                <Card className="shadow-sm"><CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Adjustments</p>
                    <p className="text-xl font-bold">
                        {n(stmt.bonuses) - n(stmt.clawbacks) - n(stmt.deductions) >= 0 ? '+' : ''}
                        {money(n(stmt.bonuses) - n(stmt.clawbacks) - n(stmt.deductions))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        bonus {money(stmt.bonuses)} · clawback {money(stmt.clawbacks)}
                    </p>
                </CardContent></Card>
                <Card className="shadow-sm border-primary/30"><CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Net payable</p>
                    <p className="text-xl font-bold text-primary">{money(stmt.net_commission)}</p>
                    {stmt.status === 'paid' && stmt.paid_at && (
                        <p className="text-xs text-green-500">Paid {date(stmt.paid_at)}</p>
                    )}
                </CardContent></Card>
            </div>

            {stmt.status === 'paid' && (stmt.payment_method || stmt.payment_reference) && (
                <Card className="shadow-sm bg-green-500/5 border-green-500/20"><CardContent className="py-3">
                    <p className="text-sm text-muted-foreground">
                        Settled via <span className="text-foreground font-medium capitalize">{(stmt.payment_method || '').replace('_', ' ')}</span>
                        {stmt.payment_reference && <> · ref <span className="text-foreground font-medium">{stmt.payment_reference}</span></>}
                    </p>
                </CardContent></Card>
            )}

            {/* Line items */}
            <Card className="shadow-sm">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead>Deal</TableHead>
                                <TableHead>Property</TableHead>
                                <TableHead>Closed</TableHead>
                                <TableHead className="text-right">Deal value</TableHead>
                                <TableHead className="text-right">Commission</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(li => (
                                <TableRow key={li.id} className="border-border">
                                    <TableCell className="font-medium">{li.deal_reference || '—'}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            {li.property_address && <Building2 className="h-3.5 w-3.5 shrink-0" />}
                                            <span className="truncate max-w-[240px]">{li.property_address || '—'}</span>
                                        </span>
                                    </TableCell>
                                    <TableCell>{date(li.deal_close_date)}</TableCell>
                                    <TableCell className="text-right">{money(li.deal_value)}</TableCell>
                                    <TableCell className="text-right font-medium text-green-500">{money(li.commission_amount)}</TableCell>
                                </TableRow>
                            ))}
                            {items.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No line items on this statement.
                                </TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <PayDialog open={payOpen} onOpenChange={setPayOpen} onPaid={fetchStmt} statementId={id} />
        </div>
    );
}
