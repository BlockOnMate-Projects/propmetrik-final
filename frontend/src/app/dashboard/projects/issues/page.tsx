'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, AlertTriangle, ShieldAlert, Download, Filter, Loader2, LayoutGrid, List, Calendar as CalendarIcon } from 'lucide-react';
import { PmKanbanBoard, type KanbanColumnDef } from '@/components/projects/PmKanbanBoard';

const API = process.env.NEXT_PUBLIC_API_URL || '';

// Columns for the issue task board (status drives the column).
const ISSUE_COLUMNS: KanbanColumnDef[] = [
  { id: 'open', title: 'Open', accent: 'bg-blue-500' },
  { id: 'in_progress', title: 'In Progress', accent: 'bg-amber-500' },
  { id: 'resolved', title: 'Resolved', accent: 'bg-green-500' },
  { id: 'closed', title: 'Closed', accent: 'bg-zinc-500' },
];

interface Issue {
  id: string; issue_number: string; title: string; description: string; category: string;
  severity: string; status: string; priority: string; assigned_to: string | null;
  due_date: string | null; location: string | null; tags: string[]; created_at: string;
  resolved_at: string | null; resolution_notes: string | null;
}

interface Risk {
  id: string; risk_number: string; title: string; description: string; category: string;
  risk_level: string; probability: string; impact: string; status: string;
  mitigation_plan: string | null; contingency_plan: string | null; response_strategy: string;
  cost_impact: number | null; schedule_impact_days: number | null; created_at: string;
}

interface Project { id: string; name: string; }

const severityColors: Record<string, string> = {
  low: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800', medium: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400 border-yellow-800',
  high: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 border-orange-800', critical: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800',
};
const statusColors: Record<string, string> = {
  open: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800', in_progress: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800',
  resolved: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800', closed: 'bg-muted text-muted-foreground border-border',
  identified: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800', assessing: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400 border-yellow-800',
  mitigating: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800', monitoring: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 border-purple-800',
};

export default function IssuesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'issues' | 'risks'>('issues');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [issuesView, setIssuesView] = useState<'board' | 'table'>('board');
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [showCreateRisk, setShowCreateRisk] = useState(false);

  // Form state
  const [form, setForm] = useState<any>({});

  // Fetch projects list
  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API}/projects?limit=100`);
        const json = await res.json();
        const list = json.data?.projects || json.data || json.projects || [];
        setProjects(list);
        if (list.length > 0 && !selectedProject) setSelectedProject(list[0].id);
      } catch (e) { console.error('Failed to load projects', e); }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const [issuesRes, risksRes] = await Promise.all([
        authedFetch(`${API}/projects/${selectedProject}/issues?search=${search}`).then(r => r.json()),
        authedFetch(`${API}/projects/${selectedProject}/risks?search=${search}`).then(r => r.json()),
      ]);
      setIssues(issuesRes.data || []);
      setRisks(risksRes.data || []);
    } catch (e) { console.error('Failed to load issues/risks', e); }
    setLoading(false);
  }, [selectedProject, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createIssue = async () => {
    try {
      const res = await authedFetch(`${API}/projects/${selectedProject}/issues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: 'Issue created', variant: 'default' });
        setShowCreateIssue(false); setForm({}); fetchData();
      }
    } catch (e) { toast({ title: 'Failed to create issue', variant: 'destructive' }); }
  };

  const createRisk = async () => {
    try {
      const res = await authedFetch(`${API}/projects/${selectedProject}/risks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: 'Risk created', variant: 'default' });
        setShowCreateRisk(false); setForm({}); fetchData();
      }
    } catch (e) { toast({ title: 'Failed to create risk', variant: 'destructive' }); }
  };

  const updateIssueStatus = async (id: string, status: string) => {
    // Optimistic: move the card immediately, then persist + reconcile.
    const prev = issues;
    setIssues((cur) => cur.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const res = await authedFetch(`${API}/projects/${selectedProject}/issues/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('update failed');
      fetchData();
    } catch {
      setIssues(prev); // rollback on failure
      toast({ title: 'Could not update status', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const exportData = (type: 'issues' | 'risks') => {
    window.open(`${API}/projects/${selectedProject}/export/${type}?format=csv`, '_blank');
  };

  const issueStats = {
    total: issues.length, open: issues.filter(i => i.status === 'open').length,
    critical: issues.filter(i => i.severity === 'critical').length,
    overdue: issues.filter(i => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'resolved' && i.status !== 'closed').length,
  };
  const riskStats = {
    total: risks.length, high: risks.filter(r => r.risk_level === 'high' || r.risk_level === 'critical').length,
    mitigating: risks.filter(r => r.status === 'mitigating').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Issues & Risk Register</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage project issues and risks</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[200px] bg-card border-border text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Open Issues</p>
          <p className="text-2xl font-bold text-amber-500">{issueStats.open}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Critical</p>
          <p className="text-2xl font-bold text-red-500">{issueStats.critical}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Overdue</p>
          <p className="text-2xl font-bold text-orange-500">{issueStats.overdue}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Issues</p>
          <p className="text-2xl font-bold text-foreground">{issueStats.total}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">High Risks</p>
          <p className="text-2xl font-bold text-red-500">{riskStats.high}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Risks</p>
          <p className="text-2xl font-bold text-foreground">{riskStats.total}</p>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="issues" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Issues ({issues.length})</TabsTrigger>
            <TabsTrigger value="risks" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500"><ShieldAlert className="h-3.5 w-3.5 mr-1.5" />Risks ({risks.length})</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {tab === 'issues' && (
              <div className="flex items-center rounded-md border border-border bg-card p-0.5">
                <Button size="sm" variant="ghost" onClick={() => setIssuesView('board')}
                  className={`h-7 px-2 text-xs ${issuesView === 'board' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" />Board
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIssuesView('table')}
                  className={`h-7 px-2 text-xs ${issuesView === 'table' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                  <List className="h-3.5 w-3.5 mr-1" />Table
                </Button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[200px] bg-card border-border" />
            </div>
            <Button variant="outline" size="sm" className="border-border" onClick={() => exportData(tab)}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => { setForm({}); tab === 'issues' ? setShowCreateIssue(true) : setShowCreateRisk(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />{tab === 'issues' ? 'New Issue' : 'New Risk'}
            </Button>
          </div>
        </div>

        {/* Issues — Board or Table */}
        <TabsContent value="issues" className="mt-4">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : issuesView === 'board' ? (
            issues.length === 0 ? (
              <Card className="bg-card/80 border-border"><CardContent className="py-12 text-center text-muted-foreground">No issues found. Create one to get started.</CardContent></Card>
            ) : (
              <PmKanbanBoard
                columns={ISSUE_COLUMNS}
                items={issues.map((i) => ({ ...i, columnId: i.status }))}
                onMove={(id, toColumnId) => updateIssueStatus(id, toColumnId)}
                renderCard={(issue) => (
                  <Card className="bg-card border-border hover:border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{issue.issue_number}</span>
                      <Badge variant="outline" className={`${severityColors[issue.severity] || 'border-border'} text-[10px] px-1.5 py-0`}>{issue.severity}</Badge>
                    </div>
                    <p className="text-sm text-foreground leading-snug line-clamp-2">{issue.title}</p>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {issue.due_date ? new Date(issue.due_date).toLocaleDateString('en-GB') : '—'}
                      </span>
                      {issue.priority && <Badge variant="outline" className={`${severityColors[issue.priority] || 'border-border'} text-[10px] px-1.5 py-0`}>{issue.priority}</Badge>}
                    </div>
                  </Card>
                )}
              />
            )
          ) : (
            <Card className="bg-card/80 border-border">
              <Table>
                <TableHeader><TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-mono text-[10px]">NUMBER</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">TITLE</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">SEVERITY</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">PRIORITY</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">STATUS</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">DUE DATE</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">ACTIONS</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {issues.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No issues found. Create one to get started.</TableCell></TableRow>
                  ) : issues.map(issue => (
                    <TableRow key={issue.id} className="border-border hover:bg-muted/50">
                      <TableCell className="font-mono text-xs text-muted-foreground">{issue.issue_number}</TableCell>
                      <TableCell className="text-sm text-foreground max-w-[200px] truncate">{issue.title}</TableCell>
                      <TableCell><Badge variant="outline" className={severityColors[issue.severity] || 'border-border'}>{issue.severity}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={severityColors[issue.priority] || 'border-border'}>{issue.priority}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={statusColors[issue.status] || 'border-border'}>{issue.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{issue.due_date ? new Date(issue.due_date).toLocaleDateString('en-GB') : '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {issue.status === 'open' && <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-500" onClick={() => updateIssueStatus(issue.id, 'in_progress')}>Start</Button>}
                          {issue.status === 'in_progress' && <Button size="sm" variant="ghost" className="h-7 text-xs text-green-500" onClick={() => updateIssueStatus(issue.id, 'resolved')}>Resolve</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Risks Table */}
        <TabsContent value="risks" className="mt-4">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
            <Card className="bg-card/80 border-border">
              <Table>
                <TableHeader><TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-mono text-[10px]">NUMBER</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">TITLE</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">RISK LEVEL</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">PROBABILITY</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">IMPACT</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">STATUS</TableHead>
                  <TableHead className="text-muted-foreground font-mono text-[10px]">COST IMPACT</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {risks.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No risks registered. Add one to start tracking.</TableCell></TableRow>
                  ) : risks.map(risk => (
                    <TableRow key={risk.id} className="border-border hover:bg-muted/50">
                      <TableCell className="font-mono text-xs text-muted-foreground">{risk.risk_number}</TableCell>
                      <TableCell className="text-sm text-foreground max-w-[200px] truncate">{risk.title}</TableCell>
                      <TableCell><Badge variant="outline" className={severityColors[risk.risk_level] || 'border-border'}>{risk.risk_level}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{risk.probability}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{risk.impact}</TableCell>
                      <TableCell><Badge variant="outline" className={statusColors[risk.status] || 'border-border'}>{risk.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{risk.cost_impact ? `$${Number(risk.cost_impact).toLocaleString()}` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Issue Dialog */}
      <Dialog open={showCreateIssue} onOpenChange={setShowCreateIssue}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader><DialogTitle>Create Issue</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-muted-foreground text-xs">Title *</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-muted border-border" /></div>
            <div><Label className="text-muted-foreground text-xs">Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-muted border-border" rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-xs">Severity</Label>
                <Select value={form.severity || 'medium'} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['low','medium','high','critical'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-muted-foreground text-xs">Priority</Label>
                <Select value={form.priority || 'medium'} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['low','medium','high','critical'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-xs">Category</Label>
                <Select value={form.category || 'general'} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['general','safety','quality','design','schedule','budget','permit','environmental'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-muted-foreground text-xs">Due Date</Label><Input type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="bg-muted border-border" /></div>
            </div>
            <div><Label className="text-muted-foreground text-xs">Location</Label><Input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} className="bg-muted border-border" placeholder="e.g., Floor 3, Unit 201" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateIssue(false)} className="border-border">Cancel</Button>
            <Button onClick={createIssue} className="bg-amber-600 hover:bg-amber-700" disabled={!form.title}>Create Issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Risk Dialog */}
      <Dialog open={showCreateRisk} onOpenChange={setShowCreateRisk}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader><DialogTitle>Register Risk</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-muted-foreground text-xs">Title *</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-muted border-border" /></div>
            <div><Label className="text-muted-foreground text-xs">Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-muted border-border" rows={3} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-muted-foreground text-xs">Risk Level</Label>
                <Select value={form.risk_level || 'medium'} onValueChange={(v) => setForm({ ...form, risk_level: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['low','medium','high','critical'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-muted-foreground text-xs">Probability</Label>
                <Select value={form.probability || 'possible'} onValueChange={(v) => setForm({ ...form, probability: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['rare','unlikely','possible','likely','certain'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-muted-foreground text-xs">Impact</Label>
                <Select value={form.impact || 'moderate'} onValueChange={(v) => setForm({ ...form, impact: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['negligible','minor','moderate','major','catastrophic'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div><Label className="text-muted-foreground text-xs">Mitigation Plan</Label><Textarea value={form.mitigation_plan || ''} onChange={(e) => setForm({ ...form, mitigation_plan: e.target.value })} className="bg-muted border-border" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-xs">Cost Impact ($)</Label><Input type="number" value={form.cost_impact || ''} onChange={(e) => setForm({ ...form, cost_impact: e.target.value })} className="bg-muted border-border" /></div>
              <div><Label className="text-muted-foreground text-xs">Schedule Impact (days)</Label><Input type="number" value={form.schedule_impact_days || ''} onChange={(e) => setForm({ ...form, schedule_impact_days: parseInt(e.target.value) })} className="bg-muted border-border" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateRisk(false)} className="border-border">Cancel</Button>
            <Button onClick={createRisk} className="bg-amber-600 hover:bg-amber-700" disabled={!form.title}>Register Risk</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
