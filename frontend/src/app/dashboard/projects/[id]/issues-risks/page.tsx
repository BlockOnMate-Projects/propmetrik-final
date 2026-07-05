'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  AlertTriangle, 
  Plus, 
  Search, 
  Shield,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  TrendingUp,
  Flag
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
import { format } from 'date-fns';
import { authedFetch } from '@/lib/authed-fetch';
import { subTabsListClass, subTabsTriggerClass } from '@/components/layout/subTabStyles';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const fetch = authedFetch;

type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type IssuePriority = 'low' | 'medium' | 'high' | 'critical';
type RiskStatus = 'identified' | 'assessing' | 'mitigating' | 'monitoring' | 'closed';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface Issue {
  id: string;
  issue_number: string;
  title: string;
  description?: string;
  category?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigned_to?: string;
  assigned_to_name?: string;
  reported_by_name?: string;
  due_date?: string;
  resolved_date?: string;
  created_at: string;
}

interface Risk {
  id: string;
  risk_number: string;
  title: string;
  description?: string;
  category?: string;
  status: RiskStatus;
  probability: number;
  impact: number;
  risk_level: RiskLevel;
  mitigation_plan?: string;
  owner_name?: string;
  identified_date: string;
}

const issueStatusConfig: Record<IssueStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  closed: { label: 'Closed', color: 'bg-zinc-500/20 text-muted-foreground' }
};

const priorityConfig: Record<IssuePriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-zinc-500/20 text-muted-foreground' },
  medium: { label: 'Medium', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' },
  critical: { label: 'Critical', color: 'bg-red-500/20 text-red-600 dark:text-red-400' }
};

const riskLevelConfig: Record<RiskLevel, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  medium: { label: 'Medium', color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' },
  critical: { label: 'Critical', color: 'bg-red-500/20 text-red-600 dark:text-red-400' }
};

export default function ProjectIssuesRisksPage() {
  const { id: projectId } = useParams() as { id: string };
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [activeTab, setActiveTab] = useState('issues');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateIssueDialog, setShowCreateIssueDialog] = useState(false);
  const [showCreateRiskDialog, setShowCreateRiskDialog] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [issuesRes, risksRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}/issues`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`${API_BASE}/projects/${projectId}/risks`).then(r => r.json()).catch(() => ({ data: [] }))
      ]);
      
      setIssues(issuesRes.data || issuesRes.issues || []);
      setRisks(risksRes.data || risksRes.risks || []);
    } catch (error) {
      console.error('Failed to fetch issues/risks:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (date: string) => {
    try {
      return format(new Date(date), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  const openIssues = issues.filter(i => i.status === 'open' || i.status === 'in_progress').length;
  const criticalIssues = issues.filter(i => i.priority === 'critical').length;
  const highRisks = risks.filter(r => r.risk_level === 'high' || r.risk_level === 'critical').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Issues / Risks</h1>
          <p className="text-muted-foreground text-sm mt-1">Log and track project issues and risks.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border text-muted-foreground" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            className="bg-amber-600 hover:bg-amber-700 text-foreground border-0" 
            onClick={() => activeTab === 'issues' ? setShowCreateIssueDialog(true) : setShowCreateRiskDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {activeTab === 'issues' ? 'Log Issue' : 'Add Risk'}
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Open Issues</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{openIssues}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-card border-border ${criticalIssues > 0 ? 'border-red-500/50' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Critical Issues</p>
                    <p className={`text-2xl font-bold mt-1 ${criticalIssues > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{criticalIssues}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Risks</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{risks.filter(r => r.status !== 'closed').length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-card border-border ${highRisks > 0 ? 'border-orange-500/50' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">High/Critical Risks</p>
                    <p className={`text-2xl font-bold mt-1 ${highRisks > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>{highRisks}</p>
                  </div>
                  <div className="h-12 w-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Flag className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={subTabsListClass}>
              <TabsTrigger value="issues" className={subTabsTriggerClass}>Issues ({issues.length})</TabsTrigger>
              <TabsTrigger value="risks" className={subTabsTriggerClass}>Risk Register ({risks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="issues" className="mt-6">
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search issues..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card border-border" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] bg-card border-border"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(issueStatusConfig).map(([value, { label }]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Issue #</TableHead>
                        <TableHead className="text-muted-foreground">Title</TableHead>
                        <TableHead className="text-muted-foreground">Priority</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground">Assigned To</TableHead>
                        <TableHead className="text-muted-foreground">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issues.map((issue) => (
                        <TableRow key={issue.id} className="border-border hover:bg-muted/50 cursor-pointer">
                          <TableCell className="font-mono text-amber-500">{issue.issue_number}</TableCell>
                          <TableCell className="font-medium text-foreground">{issue.title}</TableCell>
                          <TableCell><Badge className={priorityConfig[issue.priority]?.color}>{priorityConfig[issue.priority]?.label}</Badge></TableCell>
                          <TableCell><Badge className={issueStatusConfig[issue.status]?.color}>{issueStatusConfig[issue.status]?.label}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{issue.assigned_to_name || '—'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(issue.created_at)}</TableCell>
                        </TableRow>
                      ))}
                      {issues.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No issues logged yet.</TableCell></TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="risks" className="mt-6">
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Risk #</TableHead>
                        <TableHead className="text-muted-foreground">Title</TableHead>
                        <TableHead className="text-muted-foreground">Risk Level</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground">Owner</TableHead>
                        <TableHead className="text-muted-foreground">Identified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {risks.map((risk) => (
                        <TableRow key={risk.id} className="border-border hover:bg-muted/50 cursor-pointer">
                          <TableCell className="font-mono text-amber-500">{risk.risk_number}</TableCell>
                          <TableCell className="font-medium text-foreground">{risk.title}</TableCell>
                          <TableCell><Badge className={riskLevelConfig[risk.risk_level]?.color}>{riskLevelConfig[risk.risk_level]?.label}</Badge></TableCell>
                          <TableCell className="text-muted-foreground capitalize">{risk.status.replace('_', ' ')}</TableCell>
                          <TableCell className="text-muted-foreground">{risk.owner_name || '—'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(risk.identified_date)}</TableCell>
                        </TableRow>
                      ))}
                      {risks.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No risks identified yet.</TableCell></TableRow>)}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Create Issue Dialog */}
      <Dialog open={showCreateIssueDialog} onOpenChange={setShowCreateIssueDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Log Issue</DialogTitle>
            <DialogDescription className="text-muted-foreground">Log a new project issue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Title</Label>
              <Input placeholder="Issue title" className="bg-muted border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Priority</Label>
                <Select>
                  <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>{Object.entries(priorityConfig).map(([value, { label }]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Due Date</Label>
                <Input type="date" className="bg-muted border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea placeholder="Describe the issue..." className="bg-muted border-border" rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateIssueDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700">Log Issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Risk Dialog */}
      <Dialog open={showCreateRiskDialog} onOpenChange={setShowCreateRiskDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Risk</DialogTitle>
            <DialogDescription className="text-muted-foreground">Add a new risk to the register.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Title</Label>
              <Input placeholder="Risk title" className="bg-muted border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Probability (1-5)</Label>
                <Input type="number" min="1" max="5" placeholder="3" className="bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Impact (1-5)</Label>
                <Input type="number" min="1" max="5" placeholder="3" className="bg-muted border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea placeholder="Describe the risk..." className="bg-muted border-border" rows={3} />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Mitigation Plan</Label>
              <Textarea placeholder="How will this risk be mitigated?" className="bg-muted border-border" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateRiskDialog(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700">Add Risk</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
