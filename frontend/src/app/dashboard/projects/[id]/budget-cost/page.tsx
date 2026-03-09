'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PieChart,
  Plus,
  Search,
  Loader2,
  RefreshCw
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
import { costsApi, projectsApi } from '@/lib/projects-api';
import type { ProjectCost, BudgetSummary, CostCategory, CostStatus } from '@/types/projects';
import { formatCurrency as formatCurrencyUtil } from '@/lib/utils';

const categoryLabels: Record<string, string> = {
  land_acquisition: 'Land Acquisition',
  site_preparation: 'Site Preparation',
  foundation: 'Foundation',
  structure: 'Structure',
  exterior: 'Exterior',
  roofing: 'Roofing',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  interior_finishes: 'Interior Finishes',
  landscaping: 'Landscaping',
  permits_fees: 'Permits & Fees',
  professional_services: 'Professional Services',
  equipment: 'Equipment',
  labor: 'Labor',
  materials: 'Materials',
  contingency: 'Contingency',
  financing: 'Financing',
  other: 'Other'
};

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500/20 text-zinc-400' },
  budgeted: { label: 'Budgeted', color: 'bg-blue-500/20 text-blue-400' },
  committed: { label: 'Committed', color: 'bg-purple-500/20 text-purple-400' },
  invoiced: { label: 'Invoiced', color: 'bg-yellow-500/20 text-yellow-400' },
  approved: { label: 'Approved', color: 'bg-emerald-500/20 text-emerald-400' },
  paid: { label: 'Paid', color: 'bg-green-500/20 text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400' }
};

export default function ProjectBudgetCostPage() {
  const { id: projectId } = useParams() as { id: string };
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [currency, setCurrency] = useState('GHS');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [costsRes, summaryRes, projectRes] = await Promise.all([
        costsApi.getByProject(projectId, {
          category: categoryFilter !== 'all' ? categoryFilter as CostCategory : undefined,
          status: statusFilter !== 'all' ? statusFilter as CostStatus : undefined,
          search: searchQuery || undefined
        }),
        costsApi.getBudgetSummary(projectId),
        projectsApi.getById(projectId)
      ]);
      
      // Handle both array response and object with data property
      const costsData = Array.isArray(costsRes) ? costsRes : (costsRes as { data?: ProjectCost[]; costs?: ProjectCost[] }).data || (costsRes as { data?: ProjectCost[]; costs?: ProjectCost[] }).costs || [];
      setCosts(costsData);
      setBudgetSummary(summaryRes);
      setCurrency(projectRes.currency || 'GHS');
    } catch (error) {
      console.error('Failed to fetch budget data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load budget data. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, categoryFilter, statusFilter, searchQuery, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (amount: number) => formatCurrencyUtil(amount, currency);

  const totalBudget = budgetSummary?.total_revised_budget || budgetSummary?.total_original_budget || 0;
  const totalSpent = budgetSummary?.total_actual || 0;
  
  const budgetUtilization = budgetSummary && totalBudget > 0
    ? Math.round((totalSpent / totalBudget) * 100) 
    : 0;
  
  const committedPercentage = budgetSummary && totalBudget > 0
    ? Math.round((budgetSummary.total_committed / totalBudget) * 100)
    : 0;

  const variance = budgetSummary 
    ? totalBudget - totalSpent 
    : 0;

  const isOverBudget = variance < 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Budget & Cost</h1>
          <p className="text-zinc-400 text-sm mt-1">Track budgets, commitments, and actuals.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white border-0" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Cost
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Total Budget</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalBudget)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <PieChart className="h-6 w-6 text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Committed</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatCurrency(budgetSummary?.total_committed || 0)}</p>
                    <p className="text-xs text-zinc-500 mt-1">{committedPercentage}% of budget</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Spent</p>
                    <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalSpent)}</p>
                    <p className="text-xs text-zinc-500 mt-1">{budgetUtilization}% utilized</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-zinc-900 border-zinc-800 ${isOverBudget ? 'border-red-500/50' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Variance</p>
                    <p className={`text-2xl font-bold mt-1 ${isOverBudget ? 'text-red-400' : 'text-green-400'}`}>
                      {isOverBudget ? '-' : '+'}{formatCurrency(Math.abs(variance))}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{isOverBudget ? 'Over budget' : 'Under budget'}</p>
                  </div>
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${isOverBudget ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                    {isOverBudget ? <TrendingDown className="h-6 w-6 text-red-400" /> : <TrendingUp className="h-6 w-6 text-green-400" />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-zinc-800 border-zinc-700">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="costs">Cost Items</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-white">Budget Breakdown</CardTitle>
                  <CardDescription className="text-zinc-400">Budget vs. actual spending by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {budgetSummary?.by_category?.map((cat) => {
                      const catBudget = cat.revised_budget || cat.original_budget || 0;
                      const catSpent = cat.actual || 0;
                      const percentage = catBudget > 0 ? Math.round((catSpent / catBudget) * 100) : 0;
                      return (
                        <div key={cat.category} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-300">{categoryLabels[cat.category] || cat.category}</span>
                            <span className={`font-mono text-xs ${percentage > 100 ? 'text-red-400' : 'text-zinc-400'}`}>{percentage}%</span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full ${percentage > 100 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(!budgetSummary?.by_category || budgetSummary.by_category.length === 0) && (
                      <div className="text-center py-8 text-zinc-500">No budget categories configured yet.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="costs" className="mt-6">
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input placeholder="Search costs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-zinc-900 border-zinc-800" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] bg-zinc-900 border-zinc-800"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(statusConfig).map(([value, { label }]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400">Description</TableHead>
                        <TableHead className="text-zinc-400">Category</TableHead>
                        <TableHead className="text-zinc-400">Status</TableHead>
                        <TableHead className="text-zinc-400 text-right">Budgeted</TableHead>
                        <TableHead className="text-zinc-400 text-right">Actual</TableHead>
                        <TableHead className="text-zinc-400 text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costs.map((cost) => {
                        const costBudget = cost.revised_budget || cost.original_budget || 0;
                        const costActual = cost.actual_costs || 0;
                        const costVariance = costBudget - costActual;
                        return (
                          <TableRow key={cost.id} className="border-zinc-800 hover:bg-zinc-800/50">
                            <TableCell className="font-medium text-white">{cost.description}</TableCell>
                            <TableCell className="text-zinc-300">{categoryLabels[cost.category] || cost.category}</TableCell>
                            <TableCell><Badge className={statusConfig[cost.status]?.color || 'bg-zinc-500/20 text-zinc-400'}>{statusConfig[cost.status]?.label || cost.status}</Badge></TableCell>
                            <TableCell className="text-right text-zinc-300">{formatCurrency(costBudget)}</TableCell>
                            <TableCell className="text-right text-zinc-300">{formatCurrency(costActual)}</TableCell>
                            <TableCell className={`text-right font-mono ${costVariance < 0 ? 'text-red-400' : 'text-green-400'}`}>{costVariance < 0 ? '-' : '+'}{formatCurrency(Math.abs(costVariance))}</TableCell>
                          </TableRow>
                        );
                      })}
                      {costs.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">No cost items found.</TableCell></TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Add Cost Item</DialogTitle>
            <DialogDescription className="text-zinc-400">Add a new cost item to the project budget.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Input placeholder="Enter cost description" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Category</Label>
                <Select>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Budgeted Amount</Label>
                <Input type="number" placeholder="0.00" className="bg-zinc-800 border-zinc-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Notes</Label>
              <Textarea placeholder="Additional notes..." className="bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700">Add Cost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
