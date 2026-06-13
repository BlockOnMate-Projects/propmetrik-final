'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  FileText, 
  Plus, 
  Search, 
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Eye,
  Loader2,
  RefreshCw,
  Calendar,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import ProjectSubnav from '@/components/dashboard/projects/ProjectSubnav';
import { projectsApi } from '@/lib/projects-api';
import { drawsApi, type DrawRequest, type DrawSummary, type DrawStatus } from '@/lib/pm-portal-api';
import { formatCurrency as formatCurrencyUtil } from '@/lib/utils';
import { format } from 'date-fns';

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500/20 text-muted-foreground', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', icon: Send },
  under_review: { label: 'Under Review', color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  partially_funded: { label: 'Partially Funded', color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400', icon: DollarSign },
  funded: { label: 'Funded', color: 'bg-green-500/20 text-green-600 dark:text-green-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-600 dark:text-red-400', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-700/20 text-muted-foreground', icon: AlertCircle }
};

export default function ProjectDrawsPayAppsPage() {
  const { id: projectId } = useParams() as { id: string };
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [draws, setDraws] = useState<DrawRequest[]>([]);
  const [summary, setSummary] = useState<DrawSummary | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currency, setCurrency] = useState('GHS');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [drawsRes, summaryRes, projectRes] = await Promise.all([
        drawsApi.getAll(projectId),
        drawsApi.getSummary(projectId),
        projectsApi.getById(projectId)
      ]);
      
      // Filter by status on client side if needed
      let drawsList = drawsRes as DrawRequest[];
      if (statusFilter !== 'all') {
        drawsList = drawsList.filter(d => d.status === statusFilter);
      }
      
      setDraws(drawsList);
      setSummary(summaryRes);
      setCurrency(projectRes.currency || 'GHS');
    } catch (error) {
      console.error('Failed to fetch draws:', error);
      toast({
        title: 'Error',
        description: 'Failed to load draw requests. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (amount: number) => formatCurrencyUtil(amount, currency);
  
  const formatDate = (date: string) => {
    try {
      return format(new Date(date), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  const filteredDraws = draws.filter(draw => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        String(draw.draw_number || '').toLowerCase().includes(search) ||
        draw.title?.toLowerCase().includes(search) ||
        draw.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Draws / Pay Apps</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage draw requests and payment applications.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border text-muted-foreground" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-foreground border-0" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Draw Request
          </Button>
        </div>
      </div>

      <ProjectSubnav projectId={projectId} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Requested</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(summary?.total_requested || 0)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Approved</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(summary?.total_approved || 0)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Paid</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(summary?.total_paid || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary?.total_requested ? Math.round((summary.total_paid / summary.total_requested) * 100) : 0}% funded
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(summary?.pending || 0)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search draws..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-card border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(statusConfig).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Draws Table */}
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Draw #</TableHead>
                    <TableHead className="text-muted-foreground">Description</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Submitted</TableHead>
                    <TableHead className="text-muted-foreground text-right">Requested</TableHead>
                    <TableHead className="text-muted-foreground text-right">Approved</TableHead>
                    <TableHead className="text-muted-foreground text-right">Funded</TableHead>
                    <TableHead className="text-muted-foreground"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDraws.map((draw) => {
                    const StatusIcon = statusConfig[draw.status]?.icon || FileText;
                    return (
                      <TableRow key={draw.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-mono text-amber-500">{draw.draw_number}</TableCell>
                        <TableCell className="font-medium text-foreground max-w-[200px] truncate">
                          {draw.title || draw.description || 'Draw Request'}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig[draw.status]?.color || 'bg-zinc-500/20 text-muted-foreground'}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[draw.status]?.label || draw.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {draw.submitted_at ? formatDate(draw.submitted_at) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(draw.amount || 0)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {draw.approved_amount ? formatCurrency(draw.approved_amount) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          {draw.paid_at ? formatCurrency(draw.approved_amount || draw.amount) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredDraws.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No draw requests found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">New Draw Request</DialogTitle>
            <DialogDescription className="text-muted-foreground">Create a new draw request for this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea placeholder="Enter description..." className="bg-muted border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Requested Amount</Label>
                <Input type="number" placeholder="0.00" className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Period Ending</Label>
                <Input type="date" className="bg-muted border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea placeholder="Additional notes..." className="bg-muted border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700">Create Draw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
