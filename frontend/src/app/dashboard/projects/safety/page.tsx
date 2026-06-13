'use client';

import { useState, useEffect } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

const SEVERITY_COLORS: Record<string, string> = { low: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', medium: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', high: 'bg-orange-500/20 text-orange-600 dark:text-orange-400', critical: 'bg-red-500/20 text-red-600 dark:text-red-400' };
const STATUS_COLORS: Record<string, string> = { reported: 'bg-zinc-500/20 text-muted-foreground', under_investigation: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', corrective_action: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', resolved: 'bg-green-500/20 text-green-600 dark:text-green-400', closed: 'bg-zinc-700/20 text-muted-foreground', open: 'bg-red-500/20 text-red-600 dark:text-red-400', in_progress: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', scheduled: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', completed: 'bg-green-500/20 text-green-600 dark:text-green-400', failed: 'bg-red-500/20 text-red-600 dark:text-red-400' };

interface Project { id: string; name: string; }

export default function SafetyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('incidents');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editType, setEditType] = useState<'incident'|'observation'|'inspection'>('incident');
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API}/projects?limit=100`);
        const json = await res.json();
        const list = json.data?.projects || json.data || json.projects || [];
        setProjects(list);
        if (list.length > 0 && !projectId) setProjectId(list[0].id);
      } catch (e) { console.error('Failed to load projects', e); }
    })();
  }, []);

  const { data: incidents } = useQuery({
    queryKey: ['safety-incidents', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/safety/incidents`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: observations } = useQuery({
    queryKey: ['safety-observations', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/safety/observations`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: inspections } = useQuery({
    queryKey: ['safety-inspections', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/safety/inspections`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: stats } = useQuery({
    queryKey: ['safety-stats', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/safety/stats`).then(r => r.json()),
    enabled: !!projectId,
  });

  const createIncident = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/safety/incidents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['safety-incidents'] }); qc.invalidateQueries({ queryKey: ['safety-stats'] }); setShowCreate(false); setForm({}); toast({ title: 'Incident reported' }); },
  });
  const createObservation = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/safety/observations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['safety-observations'] }); setShowCreate(false); setForm({}); toast({ title: 'Observation recorded' }); },
  });
  const createInspection = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/safety/inspections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['safety-inspections'] }); setShowCreate(false); setForm({}); toast({ title: 'Inspection scheduled' }); },
  });

  const updateIncident = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/safety/incidents/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['safety-incidents'] }); qc.invalidateQueries({ queryKey: ['safety-stats'] }); setShowEdit(false); setForm({}); toast({ title: 'Incident updated' }); },
  });
  const updateObservation = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/safety/observations/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['safety-observations'] }); setShowEdit(false); setForm({}); toast({ title: 'Observation updated' }); },
  });
  const updateInspection = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/safety/inspections/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['safety-inspections'] }); setShowEdit(false); setForm({}); toast({ title: 'Inspection updated' }); },
  });

  const deleteItem = async (type: 'incidents'|'observations'|'inspections', id: string) => {
    if (!confirm(`Delete this ${type.slice(0, -1)}?`)) return;
    try {
      await authedFetch(`/api/projects/${projectId}/safety/${type}/${id}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: [`safety-${type}`] });
      qc.invalidateQueries({ queryKey: ['safety-stats'] });
      toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1, -1)} deleted` });
    } catch (e) { toast({ title: 'Delete failed', variant: 'destructive' }); }
  };

  const openEditIncident = (inc: any) => { setEditType('incident'); setEditId(inc.id); setForm({ title: inc.title, incident_type: inc.incident_type, severity: inc.severity, location: inc.location, description: inc.description }); setShowEdit(true); };
  const openEditObservation = (obs: any) => { setEditType('observation'); setEditId(obs.id); setForm({ category: obs.category, severity: obs.severity, description: obs.description, location: obs.location, corrective_action: obs.corrective_action }); setShowEdit(true); };
  const openEditInspection = (ins: any) => { setEditType('inspection'); setEditId(ins.id); setForm({ inspection_type: ins.inspection_type, inspection_date: ins.inspection_date?.split('T')[0], notes: ins.notes }); setShowEdit(true); };

  const summary = stats?.data?.summary || {};

  if (!projectId) return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen">
      <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" /></div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">SAFETY & INCIDENT MANAGEMENT</h1>
          <p className="text-[10px] font-mono text-muted-foreground">INCIDENT REPORTING • OBSERVATIONS • INSPECTIONS</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-[200px] bg-card border-border text-sm text-foreground"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs">+ NEW</Button>
            </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader><DialogTitle className="text-foreground">{tab === 'incidents' ? 'Report Incident' : tab === 'observations' ? 'New Observation' : 'Schedule Inspection'}</DialogTitle></DialogHeader>
            {tab === 'incidents' && (
              <div className="space-y-3">
                <div><Label className="text-[10px] font-mono text-muted-foreground">TITLE</Label><Input className="bg-muted border-border text-foreground" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">TYPE</Label>
                    <Select value={form.incident_type || 'near_miss'} onValueChange={v => setForm({ ...form, incident_type: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="near_miss">Near Miss</SelectItem><SelectItem value="first_aid">First Aid</SelectItem><SelectItem value="recordable">Recordable</SelectItem><SelectItem value="lost_time">Lost Time</SelectItem><SelectItem value="property_damage">Property Damage</SelectItem><SelectItem value="environmental">Environmental</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">SEVERITY</Label>
                    <Select value={form.severity || 'low'} onValueChange={v => setForm({ ...form, severity: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
                </div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">LOCATION</Label><Input className="bg-muted border-border text-foreground" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</Label><Textarea className="bg-muted border-border text-foreground" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => createIncident.mutate(form)}>Report Incident</Button>
              </div>
            )}
            {tab === 'observations' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">CATEGORY</Label>
                    <Select value={form.category || 'unsafe_condition'} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="unsafe_condition">Unsafe Condition</SelectItem><SelectItem value="unsafe_act">Unsafe Act</SelectItem><SelectItem value="positive">Positive</SelectItem><SelectItem value="housekeeping">Housekeeping</SelectItem><SelectItem value="ppe">PPE</SelectItem><SelectItem value="fall_protection">Fall Protection</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">SEVERITY</Label>
                    <Select value={form.severity || 'low'} onValueChange={v => setForm({ ...form, severity: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
                </div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</Label><Textarea className="bg-muted border-border text-foreground" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">LOCATION</Label><Input className="bg-muted border-border text-foreground" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">CORRECTIVE ACTION</Label><Textarea className="bg-muted border-border text-foreground" value={form.corrective_action || ''} onChange={e => setForm({ ...form, corrective_action: e.target.value })} /></div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => createObservation.mutate(form)}>Record Observation</Button>
              </div>
            )}
            {tab === 'inspections' && (
              <div className="space-y-3">
                <div><Label className="text-[10px] font-mono text-muted-foreground">TYPE</Label>
                  <Select value={form.inspection_type || 'routine'} onValueChange={v => setForm({ ...form, inspection_type: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="routine">Routine</SelectItem><SelectItem value="pre_task">Pre-Task</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="regulatory">Regulatory</SelectItem></SelectContent></Select></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">DATE</Label><Input type="date" className="bg-muted border-border text-foreground" value={form.inspection_date || ''} onChange={e => setForm({ ...form, inspection_date: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">NOTES</Label><Textarea className="bg-muted border-border text-foreground" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => createInspection.mutate(form)}>Schedule Inspection</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[10px] font-mono text-muted-foreground">TOTAL INCIDENTS</p><p className="text-2xl font-bold text-foreground">{summary.total || 0}</p></CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[10px] font-mono text-muted-foreground">OSHA RECORDABLE</p><p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.osha_recordable || 0}</p></CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[10px] font-mono text-muted-foreground">LOST WORK DAYS</p><p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.total_lost_days || 0}</p></CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[10px] font-mono text-muted-foreground">INJURIES</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{summary.total_injuries || 0}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={v => { setTab(v); setForm({}); }}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="incidents" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">INCIDENTS ({incidents?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="observations" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">OBSERVATIONS ({observations?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="inspections" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">INSPECTIONS ({inspections?.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="incidents" className="mt-4">
          <div className="space-y-2">
            {(incidents?.data || []).map((inc: any) => (
              <Card key={inc.id} className="bg-card/80 border-border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-amber-500">{inc.incident_number}</span>
                      <Badge className={SEVERITY_COLORS[inc.severity] || ''}>{inc.severity}</Badge>
                      <Badge className={STATUS_COLORS[inc.status] || ''}>{inc.status?.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-sm text-foreground font-medium">{inc.title}</p>
                    <p className="text-xs text-muted-foreground">{inc.location} • {new Date(inc.incident_date).toLocaleDateString('en-GB')} • Type: {inc.incident_type?.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {inc.osha_recordable && <Badge className="bg-red-500/20 text-red-600 dark:text-red-400">OSHA</Badge>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEditIncident(inc)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => deleteItem('incidents', inc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!incidents?.data?.length) && <p className="text-center text-muted-foreground py-8 text-sm">No incidents reported</p>}
          </div>
        </TabsContent>

        <TabsContent value="observations" className="mt-4">
          <div className="space-y-2">
            {(observations?.data || []).map((obs: any) => (
              <Card key={obs.id} className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-amber-500">{obs.observation_number}</span>
                        <Badge className={SEVERITY_COLORS[obs.severity] || ''}>{obs.severity}</Badge>
                        <Badge className={STATUS_COLORS[obs.status] || ''}>{obs.status}</Badge>
                        <Badge variant="outline" className="border-border text-muted-foreground">{obs.category?.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="text-sm text-foreground">{obs.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{obs.location} • {new Date(obs.created_at).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEditObservation(obs)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => deleteItem('observations', obs.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!observations?.data?.length) && <p className="text-center text-muted-foreground py-8 text-sm">No observations recorded</p>}
          </div>
        </TabsContent>

        <TabsContent value="inspections" className="mt-4">
          <div className="space-y-2">
            {(inspections?.data || []).map((ins: any) => (
              <Card key={ins.id} className="bg-card/80 border-border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-amber-500">{ins.inspection_number}</span>
                      <Badge className={STATUS_COLORS[ins.status] || ''}>{ins.status}</Badge>
                      <Badge variant="outline" className="border-border text-muted-foreground">{ins.inspection_type?.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(ins.inspection_date).toLocaleDateString('en-GB')} • Inspector: {ins.inspector_name || 'Unassigned'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {ins.score !== null && ins.score !== undefined && (
                      <div className="text-right mr-2">
                        <p className="text-lg font-bold text-foreground">{ins.score}%</p>
                        <p className="text-[10px] font-mono text-muted-foreground">SCORE</p>
                      </div>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEditInspection(ins)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => deleteItem('inspections', ins.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!inspections?.data?.length) && <p className="text-center text-muted-foreground py-8 text-sm">No inspections scheduled</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle className="text-foreground">{editType === 'incident' ? 'Edit Incident' : editType === 'observation' ? 'Edit Observation' : 'Edit Inspection'}</DialogTitle></DialogHeader>
          {editType === 'incident' && (
            <div className="space-y-3">
              <div><Label className="text-[10px] font-mono text-muted-foreground">TITLE</Label><Input className="bg-muted border-border text-foreground" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] font-mono text-muted-foreground">TYPE</Label>
                  <Select value={form.incident_type || 'near_miss'} onValueChange={v => setForm({ ...form, incident_type: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="near_miss">Near Miss</SelectItem><SelectItem value="first_aid">First Aid</SelectItem><SelectItem value="recordable">Recordable</SelectItem><SelectItem value="lost_time">Lost Time</SelectItem><SelectItem value="property_damage">Property Damage</SelectItem><SelectItem value="environmental">Environmental</SelectItem></SelectContent></Select></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">SEVERITY</Label>
                  <Select value={form.severity || 'low'} onValueChange={v => setForm({ ...form, severity: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
              </div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">LOCATION</Label><Input className="bg-muted border-border text-foreground" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</Label><Textarea className="bg-muted border-border text-foreground" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => updateIncident.mutate(form)}>Update Incident</Button>
            </div>
          )}
          {editType === 'observation' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] font-mono text-muted-foreground">CATEGORY</Label>
                  <Select value={form.category || 'unsafe_condition'} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="unsafe_condition">Unsafe Condition</SelectItem><SelectItem value="unsafe_act">Unsafe Act</SelectItem><SelectItem value="positive">Positive</SelectItem><SelectItem value="housekeeping">Housekeeping</SelectItem><SelectItem value="ppe">PPE</SelectItem><SelectItem value="fall_protection">Fall Protection</SelectItem></SelectContent></Select></div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">SEVERITY</Label>
                  <Select value={form.severity || 'low'} onValueChange={v => setForm({ ...form, severity: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
              </div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">DESCRIPTION</Label><Textarea className="bg-muted border-border text-foreground" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">LOCATION</Label><Input className="bg-muted border-border text-foreground" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">CORRECTIVE ACTION</Label><Textarea className="bg-muted border-border text-foreground" value={form.corrective_action || ''} onChange={e => setForm({ ...form, corrective_action: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => updateObservation.mutate(form)}>Update Observation</Button>
            </div>
          )}
          {editType === 'inspection' && (
            <div className="space-y-3">
              <div><Label className="text-[10px] font-mono text-muted-foreground">TYPE</Label>
                <Select value={form.inspection_type || 'routine'} onValueChange={v => setForm({ ...form, inspection_type: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="routine">Routine</SelectItem><SelectItem value="pre_task">Pre-Task</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="regulatory">Regulatory</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">DATE</Label><Input type="date" className="bg-muted border-border text-foreground" value={form.inspection_date || ''} onChange={e => setForm({ ...form, inspection_date: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-muted-foreground">NOTES</Label><Textarea className="bg-muted border-border text-foreground" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => updateInspection.mutate(form)}>Update Inspection</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
