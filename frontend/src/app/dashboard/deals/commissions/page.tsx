'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    DollarSign,
    FileText,
    TrendingUp,
    CheckCircle2,
    Clock,
    AlertCircle,
    Plus,
    RefreshCw,
    Download,
    Filter,
    Calculator,
    Users,
    CreditCard,
    PiggyBank,
    Calendar,
    BarChart3,
    Eye,
    Check,
    X,
    RotateCcw,
    FileSpreadsheet,
    ChevronRight,
    Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/crm/EmptyState';
import { toast } from 'sonner';

// Types
interface CommissionRecord {
    id: string;
    deal_id: string;
    agent_id: string;
    agent_name: string;
    deal_name: string;
    property_address?: string;
    source_type: string;
    deal_value: number;
    commission_rate: number;
    split_percentage: number;
    gross_commission: number;
    agent_share: number;
    company_share: number;
    status: 'pending' | 'approved' | 'paid' | 'clawback' | 'voided';
    is_clawback: boolean;
    deal_close_date: string;
    created_at: string;
}

interface CommissionStatement {
    id: string;
    agent_id: string;
    agent_name: string;
    statement_number: string;
    period_start: string;
    period_end: string;
    total_deals: number;
    total_deal_value: number;
    gross_commission: number;
    deductions: number;
    clawbacks: number;
    bonuses: number;
    net_commission: number;
    status: 'draft' | 'approved' | 'paid' | 'disputed';
    paid_at?: string;
    created_at: string;
}

interface CommissionPlan {
    id: string;
    name: string;
    description?: string;
    plan_type: string;
    base_rate: number;
    is_default: boolean;
    is_active: boolean;
    tiers?: any[];
}

interface CommissionSummary {
    total_pending: number;
    total_approved: number;
    total_paid: number;
    pending_count: number;
    approved_count: number;
    paid_count: number;
    ytd_commission: number;
    mtd_commission: number;
    avg_deal_commission: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Helper functions
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: 'GHS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'paid':
            return 'bg-green-500/10 text-green-500 border-green-500/20';
        case 'approved':
            return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        case 'pending':
        case 'draft':
            return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
        case 'clawback':
        case 'voided':
        case 'disputed':
            return 'bg-red-500/10 text-red-500 border-red-500/20';
        default:
            return 'bg-muted text-muted-foreground border-border';
    }
}

// Calculate Commission Dialog
function CalculateDialog({ 
    open, 
    onOpenChange 
}: { 
    open: boolean; 
    onOpenChange: (open: boolean) => void; 
}) {
    const [loading, setLoading] = useState(false);
    const [dealValue, setDealValue] = useState('');
    const [result, setResult] = useState<any>(null);

    const handleCalculate = async () => {
        if (!dealValue) return;
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/api/crm/commissions/calculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    deal_value: parseFloat(dealValue),
                }),
            });

            if (!response.ok) throw new Error('Calculation failed');
            const data = await response.json();
            setResult(data.calculation);
        } catch (error) {
            toast.error('Failed to calculate commission');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        onOpenChange(false);
        setResult(null);
        setDealValue('');
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        Commission Calculator
                    </DialogTitle>
                    <DialogDescription>
                        Calculate commission based on deal value
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Deal Value (GHS)</Label>
                        <Input
                            type="number"
                            placeholder="Enter deal value"
                            value={dealValue}
                            onChange={(e) => setDealValue(e.target.value)}
                        />
                    </div>

                    <Button 
                        onClick={handleCalculate} 
                        disabled={loading || !dealValue}
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {loading ? 'Calculating...' : 'Calculate'}
                    </Button>

                    {result && (
                        <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Commission Rate</span>
                                <span className="font-medium">{formatPercent(result.commission_rate)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Gross Commission</span>
                                <span className="font-medium">{formatCurrency(result.gross_commission)}</span>
                            </div>
                            <div className="flex justify-between border-t border-border pt-3">
                                <span className="text-muted-foreground">Agent Share</span>
                                <span className="font-bold text-green-500">{formatCurrency(result.agent_share)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Company Share</span>
                                <span className="font-medium">{formatCurrency(result.company_share)}</span>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Generate Statement Dialog
function GenerateStatementDialog({ 
    open, 
    onOpenChange,
    onGenerated 
}: { 
    open: boolean; 
    onOpenChange: (open: boolean) => void;
    onGenerated: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [agentId, setAgentId] = useState('');

    const handleGenerate = async () => {
        if (!periodStart || !periodEnd) return;
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/api/crm/commissions/statements/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    period_start: periodStart,
                    period_end: periodEnd,
                    agent_id: agentId || undefined,
                }),
            });

            if (!response.ok) throw new Error('Failed to generate statement');
            
            const data = await response.json();
            toast.success(data.message || 'Statement generated');
            onOpenChange(false);
            onGenerated();
        } catch (error) {
            toast.error('Failed to generate statement');
        } finally {
            setLoading(false);
        }
    };

    // Set default period to current month
    useEffect(() => {
        if (open) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setPeriodStart(start.toISOString().split('T')[0]);
            setPeriodEnd(end.toISOString().split('T')[0]);
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        Generate Commission Statement
                    </DialogTitle>
                    <DialogDescription>
                        Generate monthly commission statements for agents
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Period Start</Label>
                            <Input
                                type="date"
                                value={periodStart}
                                onChange={(e) => setPeriodStart(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Period End</Label>
                            <Input
                                type="date"
                                value={periodEnd}
                                onChange={(e) => setPeriodEnd(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Agent (optional)</Label>
                        <Input
                            placeholder="Leave empty to generate for all agents"
                            value={agentId}
                            onChange={(e) => setAgentId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave empty to generate statements for all agents with commissions in this period
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleGenerate}
                        disabled={loading}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {loading ? 'Generating...' : 'Generate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Commission Records Table
function CommissionRecordsTable({ 
    records, 
    onApprove, 
    onPay,
    selectedIds,
    onSelectId,
    onSelectAll,
}: { 
    records: CommissionRecord[]; 
    onApprove: (id: string) => void;
    onPay: (id: string) => void;
    selectedIds: Set<string>;
    onSelectId: (id: string, checked: boolean) => void;
    onSelectAll: (checked: boolean) => void;
}) {
    const pendingRecords = records.filter(r => r.status === 'pending');
    const allSelected = pendingRecords.length > 0 && pendingRecords.every(r => selectedIds.has(r.id));

    return (
        <Table>
            <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10">
                        <Checkbox 
                            checked={allSelected}
                            onCheckedChange={onSelectAll}
                        />
                    </TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Deal</TableHead>
                    <TableHead className="text-right">Deal Value</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {records.map((record) => (
                    <TableRow key={record.id} className="border-border">
                        <TableCell>
                            {record.status === 'pending' && (
                                <Checkbox 
                                    checked={selectedIds.has(record.id)}
                                    onCheckedChange={(checked) => onSelectId(record.id, checked as boolean)}
                                />
                            )}
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-muted text-xs">
                                        {record.agent_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{record.agent_name}</span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div>
                                <div className="font-medium">{record.deal_name}</div>
                                {record.property_address && (
                                    <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                                        {record.property_address}
                                    </div>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(record.deal_value)}</TableCell>
                        <TableCell className="text-right">{formatPercent(record.commission_rate)}</TableCell>
                        <TableCell className="text-right font-medium">
                            <span className={record.is_clawback ? 'text-red-500' : 'text-green-500'}>
                                {record.is_clawback ? '-' : ''}{formatCurrency(Math.abs(record.agent_share))}
                            </span>
                        </TableCell>
                        <TableCell>
                            <Badge variant="outline" className={getStatusColor(record.status)}>
                                {record.status}
                            </Badge>
                        </TableCell>
                        <TableCell>{formatDate(record.deal_close_date)}</TableCell>
                        <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                {record.status === 'pending' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onApprove(record.id)}
                                        className="h-8 w-8 p-0 text-green-500 hover:text-green-400"
                                    >
                                        <Check className="h-4 w-4" />
                                    </Button>
                                )}
                                {record.status === 'approved' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onPay(record.id)}
                                        className="h-8 w-8 p-0 text-blue-500 hover:text-blue-400"
                                    >
                                        <CreditCard className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
                {records.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No commission records found
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

// Statements Table
function StatementsTable({ 
    statements, 
    onApprove, 
    onView 
}: { 
    statements: CommissionStatement[]; 
    onApprove: (id: string) => void;
    onView: (id: string) => void;
}) {
    return (
        <Table>
            <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Statement #</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Deals</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {statements.map((statement) => (
                    <TableRow key={statement.id} className="border-border">
                        <TableCell className="text-sm font-medium">{statement.statement_number}</TableCell>
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-muted text-xs">
                                        {statement.agent_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{statement.agent_name}</span>
                            </div>
                        </TableCell>
                        <TableCell>
                            {formatDate(statement.period_start)} - {formatDate(statement.period_end)}
                        </TableCell>
                        <TableCell className="text-right">{statement.total_deals}</TableCell>
                        <TableCell className="text-right">{formatCurrency(statement.gross_commission)}</TableCell>
                        <TableCell className="text-right font-medium text-green-500">
                            {formatCurrency(statement.net_commission)}
                        </TableCell>
                        <TableCell>
                            <Badge variant="outline" className={getStatusColor(statement.status)}>
                                {statement.status}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onView(statement.id)}
                                    className="h-8 w-8 p-0"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                                {statement.status === 'draft' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onApprove(statement.id)}
                                        className="h-8 w-8 p-0 text-green-500 hover:text-green-400"
                                    >
                                        <Check className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
                {statements.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No statements found
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

// Main Page Component
export default function CommissionsPage() {
    const router = useRouter();
    const [records, setRecords] = useState<CommissionRecord[]>([]);
    const [statements, setStatements] = useState<CommissionStatement[]>([]);
    const [plans, setPlans] = useState<CommissionPlan[]>([]);
    const [summary, setSummary] = useState<CommissionSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // Dialogs
    const [calculateDialogOpen, setCalculateDialogOpen] = useState(false);
    const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
    
    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const fetchData = useCallback(async () => {
        try {
            const [recordsRes, statementsRes, summaryRes, plansRes] = await Promise.all([
                fetch(`${API_BASE}/api/crm/commissions/records?limit=100`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/commissions/statements?limit=50`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/commissions/summary`, { credentials: 'include' }),
                fetch(`${API_BASE}/api/crm/commissions/plans`, { credentials: 'include' }),
            ]);

            if (recordsRes.ok) {
                const data = await recordsRes.json();
                setRecords(data.records || []);
            }
            if (statementsRes.ok) {
                const data = await statementsRes.json();
                setStatements(data.statements || []);
            }
            if (summaryRes.ok) {
                const data = await summaryRes.json();
                setSummary(data.summary);
            }
            if (plansRes.ok) {
                const data = await plansRes.json();
                setPlans(data.plans || []);
            }
        } catch (error) {
            console.error('Failed to fetch commission data:', error);
            toast.error('Failed to load commission data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleApproveRecord = async (id: string) => {
        try {
            const response = await fetch(`${API_BASE}/api/crm/commissions/records/${id}/approve`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) throw new Error('Failed to approve');
            toast.success('Commission approved');
            fetchData();
        } catch (error) {
            toast.error('Failed to approve commission');
        }
    };

    const handlePayRecord = async (id: string) => {
        try {
            const response = await fetch(`${API_BASE}/api/crm/commissions/records/${id}/pay`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) throw new Error('Failed to mark as paid');
            toast.success('Commission marked as paid');
            fetchData();
        } catch (error) {
            toast.error('Failed to mark as paid');
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/crm/commissions/records/approve-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ record_ids: Array.from(selectedIds) }),
            });
            if (!response.ok) throw new Error('Failed to approve');
            toast.success(`Approved ${selectedIds.size} commissions`);
            setSelectedIds(new Set());
            fetchData();
        } catch (error) {
            toast.error('Failed to approve commissions');
        }
    };

    const handleApproveStatement = async (id: string) => {
        try {
            const response = await fetch(`${API_BASE}/api/crm/commissions/statements/${id}/approve`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) throw new Error('Failed to approve');
            toast.success('Statement approved');
            fetchData();
        } catch (error) {
            toast.error('Failed to approve statement');
        }
    };

    const handleSelectId = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const pendingIds = records.filter(r => r.status === 'pending').map(r => r.id);
            setSelectedIds(new Set(pendingIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const filteredRecords = records.filter(r => {
        if (statusFilter === 'all') return true;
        return r.status === statusFilter;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <DollarSign className="h-6 w-6 text-primary" />
                        Commission Management
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Track, approve, and manage agent commissions
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCalculateDialogOpen(true)}
                    >
                        <Calculator className="h-4 w-4 mr-2" />
                        Calculator
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGenerateDialogOpen(true)}
                    >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Generate Statements
                    </Button>
                    <Button
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => router.push('/dashboard/deals/commissions/plans')}
                    >
                        <Settings className="h-4 w-4 mr-2" />
                        Plans
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Pending</p>
                                    <p className="text-xl font-bold text-yellow-500">
                                        {formatCurrency(summary.total_pending)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{summary.pending_count} records</p>
                                </div>
                                <Clock className="h-8 w-8 text-yellow-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Approved</p>
                                    <p className="text-xl font-bold text-blue-500">
                                        {formatCurrency(summary.total_approved)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{summary.approved_count} records</p>
                                </div>
                                <CheckCircle2 className="h-8 w-8 text-blue-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Paid</p>
                                    <p className="text-xl font-bold text-green-500">
                                        {formatCurrency(summary.total_paid)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{summary.paid_count} records</p>
                                </div>
                                <CreditCard className="h-8 w-8 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">MTD</p>
                                    <p className="text-xl font-bold">{formatCurrency(summary.mtd_commission)}</p>
                                </div>
                                <Calendar className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">YTD</p>
                                    <p className="text-xl font-bold">{formatCurrency(summary.ytd_commission)}</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Avg/Deal</p>
                                    <p className="text-xl font-bold">{formatCurrency(summary.avg_deal_commission)}</p>
                                </div>
                                <BarChart3 className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Main Content Tabs */}
            <Tabs defaultValue="records" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="records">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Commission Records
                    </TabsTrigger>
                    <TabsTrigger value="statements">
                        <FileText className="h-4 w-4 mr-2" />
                        Statements
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="records" className="space-y-4">
                    {/* Filters & Actions */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="paid">Paid</SelectItem>
                                        <SelectItem value="clawback">Clawback</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        {selectedIds.size > 0 && (
                            <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={handleBulkApprove}
                            >
                                <Check className="h-4 w-4 mr-2" />
                                Approve Selected ({selectedIds.size})
                            </Button>
                        )}
                    </div>

                    <Card className="shadow-sm">
                        <CardContent className="p-0">
                            <CommissionRecordsTable
                                records={filteredRecords}
                                onApprove={handleApproveRecord}
                                onPay={handlePayRecord}
                                selectedIds={selectedIds}
                                onSelectId={handleSelectId}
                                onSelectAll={handleSelectAll}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="statements" className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle>Commission Statements</CardTitle>
                            <CardDescription>
                                Monthly commission summaries for payout processing
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <StatementsTable
                                statements={statements}
                                onApprove={handleApproveStatement}
                                onView={(id) => router.push(`/dashboard/deals/commissions/statements/${id}`)}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            <CalculateDialog open={calculateDialogOpen} onOpenChange={setCalculateDialogOpen} />
            <GenerateStatementDialog 
                open={generateDialogOpen} 
                onOpenChange={setGenerateDialogOpen}
                onGenerated={fetchData}
            />
        </div>
    );
}
