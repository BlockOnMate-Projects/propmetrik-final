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
import { subTabsListClass, subTabsTriggerClass } from '@/components/layout/subTabStyles';

const categoryLabels: Record<string, string> = {
  land_acquisition: 'Land Acquisition',
  permits_approvals: 'Permits & Approvals',
  design_engineering: 'Design & Engineering',
  site_preparation: 'Site Preparation',
  foundation: 'Foundation',
  structural: 'Structural',
  roofing: 'Roofing',
  mep: 'MEP (Mechanical/Electrical/Plumbing)',
  exterior_finishing: 'Exterior Finishing',
  interior_finishing: 'Interior Finishing',
  landscaping: 'Landscaping',
  amenities: 'Amenities',
  contingency: 'Contingency',
  professional_fees: 'Professional Fees',
  insurance: 'Insurance',
  marketing_sales: 'Marketing & Sales',
  legal: 'Legal',
  financing_costs: 'Financing Costs',
  other: 'Other'
};

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500/20 text-muted-foreground' },
  budgeted: { label: 'Budgeted', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  committed: { label: 'Committed', color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400' },
  invoiced: { label: 'Invoiced', color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  approved: { label: 'Approved', color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  paid: { label: 'Paid', color: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-600 dark:text-red-400' }
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
  const [newCost, setNewCost] = useState({ description: '', category: '', original_budget: '', notes: '' });
  const [addingCost, setAddingCost] = useState(false);

  const handleAddCost = async () => {
    if (!newCost.description || !newCost.category || !newCost.original_budget) {
      toast({ title: 'Missing fields', description: 'Description, category and budget are required.', variant: 'destructive' });
      return;
    }
    setAddingCost(true);
    try {
      await costsApi.create(projectId, {
        description: newCost.description,
        category: newCost.category as CostCategory,
        original_budget: parseFloat(newCost.original_budget),
        notes: newCost.notes || undefined,
      });
      toast({ title: 'Cost added', description: newCost.description });
      setShowAddDialog(false);
      setNewCost({ description: '', category: '', original_budget: '', notes: '' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setAddingCost(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Budget & Cost</h1>
          <p className="text-muted-foreground text-sm mt-1">Track budgets, commitments, and actuals.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border text-muted-foreground" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-foreground border-0" onClick={() => setShowAddDialog(true)}>
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
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Budget</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalBudget)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <PieChart className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Committed</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(budgetSummary?.total_committed || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{committedPercentage}% of budget</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Spent</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalSpent)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{budgetUtilization}% utilized</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-card border-border ${isOverBudget ? 'border-red-500/50' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Variance</p>
                    <p className={`text-2xl font-bold mt-1 ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {isOverBudget ? '-' : '+'}{formatCurrency(Math.abs(variance))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{isOverBudget ? 'Over budget' : 'Under budget'}</p>
                  </div>
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${isOverBudget ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                    {isOverBudget ? <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" /> : <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={subTabsListClass}>
              <TabsTrigger value="overview" className={subTabsTriggerClass}>Overview</TabsTrigger>
              <TabsTrigger value="costs" className={subTabsTriggerClass}>Cost Items</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Budget Breakdown</CardTitle>
                  <CardDescription className="text-muted-foreground">Budget vs. actual spending by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {budgetSummary?.by_category && (Array.isArray(budgetSummary.by_category)
                      ? budgetSummary.by_category
                      : Object.entries(budgetSummary.by_category).map(([key, val]) => ({ category: key, ...(val as Record<string, unknown>) }))
                    ).map((cat: any) => {
                      const catBudget = cat.revised_budget || cat.original_budget || 0;
                      const catSpent = cat.actual || 0;
                      const percentage = catBudget > 0 ? Math.round((catSpent / catBudget) * 100) : 0;
                      return (
                        <div key={cat.category} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{categoryLabels[cat.category] || cat.category}</span>
                            <span className={`font-mono text-xs ${percentage > 100 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{percentage}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${percentage > 100 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(!budgetSummary?.by_category || (Array.isArray(budgetSummary.by_category) ? budgetSummary.by_category.length === 0 : Object.keys(budgetSummary.by_category).length === 0)) && (
                      <div className="text-center py-8 text-muted-foreground">No budget categories configured yet.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="costs" className="mt-6">
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search costs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card border-border" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px] bg-card border-border"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] bg-card border-border"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(statusConfig).map(([value, { label }]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Description</TableHead>
                        <TableHead className="text-muted-foreground">Category</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground text-right">Budgeted</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actual</TableHead>
                        <TableHead className="text-muted-foreground text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costs.map((cost) => {
                        const costBudget = cost.revised_budget || cost.original_budget || 0;
                        const costActual = cost.actual_costs || 0;
                        const costVariance = costBudget - costActual;
                        return (
                          <TableRow key={cost.id} className="border-border hover:bg-muted/50">
                            <TableCell className="font-medium text-foreground">{cost.description}</TableCell>
                            <TableCell className="text-muted-foreground">{categoryLabels[cost.category] || cost.category}</TableCell>
                            <TableCell><Badge className={statusConfig[cost.status]?.color || 'bg-zinc-500/20 text-muted-foreground'}>{statusConfig[cost.status]?.label || cost.status}</Badge></TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(costBudget)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(costActual)}</TableCell>
                            <TableCell className={`text-right font-mono ${costVariance < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{costVariance < 0 ? '-' : '+'}{formatCurrency(Math.abs(costVariance))}</TableCell>
                          </TableRow>
                        );
                      })}
                      {costs.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No cost items found.</TableCell></TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Cost Item</DialogTitle>
            <DialogDescription className="text-muted-foreground">Add a new cost item to the project budget.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description</Label>
              <Input
                placeholder="Enter cost description"
                className="bg-muted border-border"
                value={newCost.description}
                onChange={(e) => setNewCost(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Category</Label>
                <Select value={newCost.category} onValueChange={(val) => setNewCost(prev => ({ ...prev, category: val }))}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Budgeted Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="bg-muted border-border"
                  value={newCost.original_budget}
                  onChange={(e) => setNewCost(prev => ({ ...prev, original_budget: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                className="bg-muted border-border"
                value={newCost.notes}
                onChange={(e) => setNewCost(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={addingCost}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleAddCost} disabled={addingCost}>
              {addingCost ? 'Adding...' : 'Add Cost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
