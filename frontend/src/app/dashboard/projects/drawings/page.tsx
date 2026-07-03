'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Download, Loader2, Eye, GitCompare, FileText, CheckCircle, Upload, Trash2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

interface Drawing {
  id: string; project_id: string; drawing_number: string; title: string; discipline: string;
  current_revision: string; status: string; description: string | null;
  sheet_size: string; scale: string | null; created_at: string;
  revision_count: number; recent_revisions: any[] | null;
  project_name: string | null; submitted_at: string | null; reviewed_at: string | null;
}

interface Revision {
  id: string; revision_number: string; file_name: string | null; file_url: string | null;
  change_description: string | null; status: string; created_at: string;
  reviewed_by: string | null; approved_by: string | null;
}

interface Project { id: string; name: string; }

const disciplineColors: Record<string, string> = {
  architectural: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800',
  structural: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 border-orange-800',
  mechanical: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800',
  electrical: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400 border-yellow-800',
  plumbing: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 border-cyan-800',
  civil: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 border-purple-800',
  landscape: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 border-emerald-800',
};
const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-800',
  approved: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-800',
  superseded: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border-red-800',
  issued: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-blue-800',
  reviewed: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 border-purple-800',
};

export default function DrawingsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('all'); // 'all' = every project; or a project id
  const [createProject, setCreateProject] = useState(''); // the project a NEW drawing is assigned to
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<(Drawing & { revisions: Revision[] }) | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [compareRevs, setCompareRevs] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [showAddRevision, setShowAddRevision] = useState(false);
  const [form, setForm] = useState<any>({});
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API}/projects?limit=100`);
        const json = await res.json();
        const list = json.data?.projects || json.data || json.projects || [];
        setProjects(list);
        // List stays on "All Projects"; the create dialog needs a concrete default project.
        if (list.length > 0) setCreateProject(prev => prev || list[0].id);
      } catch (e) { console.error('Failed to load projects', e); }
    })();
  }, []);

  const fetchDrawings = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const q = encodeURIComponent(search);
      const url = selectedProject === 'all'
        ? `${API}/drawings?search=${q}`
        : `${API}/projects/${selectedProject}/drawings?search=${q}`;
      const res = await authedFetch(url);
      const json = await res.json();
      setDrawings(json.data || []);
    } catch (e) { console.error('Failed to load drawings', e); }
    setLoading(false);
  }, [selectedProject, search]);

  useEffect(() => { fetchDrawings(); }, [fetchDrawings]);

  const viewDrawing = async (id: string, projectId: string) => {
    const res = await authedFetch(`${API}/projects/${projectId}/drawings/${id}`);
    const json = await res.json();
    setSelectedDrawing(json.data);
    setShowDetail(true);
  };

  const createDrawing = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const fd = new FormData();
      fd.append('drawing_number', form.drawing_number || '');
      fd.append('title', form.title || '');
      fd.append('discipline', form.discipline || 'architectural');
      fd.append('description', form.description || '');
      fd.append('sheet_size', form.sheet_size || 'A1');
      fd.append('scale', form.scale || '');
      if (drawingFile) fd.append('file', drawingFile);

      const res = await authedFetch(`${API}/projects/${createProject}/drawings`, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        toast({ title: 'Drawing created' }); setShowCreate(false); setForm({}); setDrawingFile(null); fetchDrawings();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Could not create drawing', description: err?.error || err?.message || `Server returned ${res.status}`, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Failed to create drawing', description: e?.message || 'Network error — please try again.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const addRevision = async () => {
    if (!selectedDrawing) return;
    try {
      const fd = new FormData();
      fd.append('revision_number', form.revision_number || '');
      fd.append('change_description', form.change_description || '');
      if (revisionFile) fd.append('file', revisionFile);

      const res = await authedFetch(`${API}/projects/${selectedDrawing.project_id}/drawings/${selectedDrawing.id}/revisions`, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        toast({ title: 'Revision added' }); setShowAddRevision(false); setForm({}); setRevisionFile(null);
        viewDrawing(selectedDrawing.id, selectedDrawing.project_id); fetchDrawings();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Could not add revision', description: err?.error || err?.message || `Server returned ${res.status}`, variant: 'destructive' });
      }
    } catch (e: any) { toast({ title: 'Failed to add revision', description: e?.message || 'Network error', variant: 'destructive' }); }
  };

  const reviewRevision = async (revisionId: string, action: 'review' | 'approve') => {
    if (!selectedDrawing) return;
    await authedFetch(`${API}/projects/${selectedDrawing.project_id}/drawings/${selectedDrawing.id}/revisions/${revisionId}/review`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    toast({ title: action === 'approve' ? 'Revision approved' : 'Revision reviewed' });
    viewDrawing(selectedDrawing.id, selectedDrawing.project_id);
    fetchDrawings();
  };

  const deleteDrawing = async (id: string, projectId: string) => {
    if (!confirm('Delete this drawing and all its revisions?')) return;
    try {
      const res = await authedFetch(`${API}/projects/${projectId}/drawings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Drawing deleted' }); setShowDetail(false); setSelectedDrawing(null); fetchDrawings();
      } else { toast({ title: 'Failed to delete drawing', variant: 'destructive' }); }
    } catch (e) { toast({ title: 'Failed to delete drawing', variant: 'destructive' }); }
  };

  const previewFile = async (drawingId: string, projectId: string) => {
    try {
      const r = await authedFetch(`${API}/projects/${projectId}/drawings/${drawingId}/download`);
      const data = await r.json();
      if (data.url) window.open(data.url, '_blank');
      else toast({ title: data.error || 'No file available', variant: 'destructive' });
    } catch { toast({ title: 'Failed to download file', variant: 'destructive' }); }
  };

  const exportDrawings = () => {
    window.open(`${API}/projects/${selectedProject}/export/drawings?format=csv`, '_blank');
  };

  const stats = {
    total: drawings.length,
    approved: drawings.filter(d => d.status === 'approved').length,
    inReview: drawings.filter(d => d.status === 'in_review').length,
    disciplines: [...new Set(drawings.map(d => d.discipline))].length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Drawing Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage architectural, structural, and engineering drawings with version control</p>
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-[200px] bg-card border-border text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Drawings</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Approved</p>
          <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">In Review</p>
          <p className="text-2xl font-bold text-amber-500">{stats.inReview}</p>
        </CardContent></Card>
        <Card className="bg-card/80 border-border"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Disciplines</p>
          <p className="text-2xl font-bold text-blue-500">{stats.disciplines}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search drawings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[250px] bg-card border-border" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-border" onClick={exportDrawings} disabled={selectedProject === 'all'} title={selectedProject === 'all' ? 'Pick a specific project to export' : 'Export drawings (CSV)'}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => { setForm({}); setDrawingFile(null); setShowCreate(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />New Drawing</Button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
        <Card className="bg-card/80 border-border">
          <Table>
            <TableHeader><TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground font-mono text-[10px]">NUMBER</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">TITLE</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">DISCIPLINE</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">REV</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">PROJECT</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">STATUS</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">SUBMITTED</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">REVIEWED</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">REVISIONS</TableHead>
              <TableHead className="text-muted-foreground font-mono text-[10px]">ACTIONS</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {drawings.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No drawings found. Create one to get started.</TableCell></TableRow>
              ) : drawings.map(d => (
                <TableRow key={d.id} className="border-border hover:bg-muted/50 cursor-pointer" onClick={() => viewDrawing(d.id, d.project_id)}>
                  <TableCell className="font-mono text-xs text-amber-500">{d.drawing_number}</TableCell>
                  <TableCell className="text-sm text-foreground max-w-[200px] truncate">{d.title}</TableCell>
                  <TableCell><Badge variant="outline" className={disciplineColors[d.discipline] || 'border-border'}>{d.discipline}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-foreground">{d.current_revision}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{d.project_name || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[d.status] || 'border-border'}>{d.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.submitted_at ? new Date(d.submitted_at).toLocaleDateString('en-GB') : '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.reviewed_at ? new Date(d.reviewed_at).toLocaleDateString('en-GB') : '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.revision_count || 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="View" onClick={(e) => { e.stopPropagation(); viewDrawing(d.id, d.project_id); }}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Download" onClick={(e) => { e.stopPropagation(); previewFile(d.id, d.project_id); }}><Download className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 dark:text-red-400 hover:text-red-300" title="Delete" onClick={(e) => { e.stopPropagation(); deleteDrawing(d.id, d.project_id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Drawing Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader><DialogTitle>Create Drawing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">Assign to Project *</Label>
              <Select value={createProject} onValueChange={setCreateProject}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-xs">Drawing Number *</Label><Input value={form.drawing_number || ''} onChange={(e) => setForm({ ...form, drawing_number: e.target.value })} className="bg-muted border-border" placeholder="A-101" /></div>
              <div><Label className="text-muted-foreground text-xs">Discipline</Label>
                <Select value={form.discipline || 'architectural'} onValueChange={(v) => setForm({ ...form, discipline: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['architectural','structural','mechanical','electrical','plumbing','civil','landscape'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div><Label className="text-muted-foreground text-xs">Title *</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-muted border-border" /></div>
            <div><Label className="text-muted-foreground text-xs">Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-muted border-border" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-xs">Sheet Size</Label>
                <Select value={form.sheet_size || 'A1'} onValueChange={(v) => setForm({ ...form, sheet_size: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{['A0','A1','A2','A3','A4','ARCH D','ARCH E'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-muted-foreground text-xs">Scale</Label><Input value={form.scale || ''} onChange={(e) => setForm({ ...form, scale: e.target.value })} className="bg-muted border-border" placeholder="1:100" /></div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Drawing File</Label>
              <label className="flex items-center gap-2 mt-1 p-3 rounded-lg border border-dashed border-border bg-muted/50 cursor-pointer hover:border-amber-600/50 transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">{drawingFile ? drawingFile.name : 'Click to upload drawing file (PDF, DWG, DXF...)'}</span>
                <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.dwf,.rvt,.ifc,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setDrawingFile(e.target.files?.[0] || null)} />
              </label>
              {drawingFile && <p className="text-[10px] text-muted-foreground mt-1">{(drawingFile.size / 1024 / 1024).toFixed(1)} MB — will be uploaded as Rev A</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border" disabled={creating}>Cancel</Button>
            <Button onClick={createDrawing} className="bg-amber-600 hover:bg-amber-700" disabled={creating || !form.title || !form.drawing_number || !createProject}>
              {creating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDrawing && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-amber-500">{selectedDrawing.drawing_number}</span>
                <span>{selectedDrawing.title}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className={disciplineColors[selectedDrawing.discipline] || 'border-border'}>{selectedDrawing.discipline}</Badge>
                <Badge variant="outline" className={statusColors[selectedDrawing.status] || 'border-border'}>{selectedDrawing.status}</Badge>
                <Badge variant="outline" className="border-border">Rev {selectedDrawing.current_revision}</Badge>
                <Badge variant="outline" className="border-border">{selectedDrawing.sheet_size}</Badge>
                {selectedDrawing.scale && <Badge variant="outline" className="border-border">{selectedDrawing.scale}</Badge>}
              </div>
              {selectedDrawing.description && <p className="text-sm text-muted-foreground">{selectedDrawing.description}</p>}

              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 dark:text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteDrawing(selectedDrawing.id, selectedDrawing.project_id)}><Trash2 className="h-3 w-3 mr-1" />Delete Drawing</Button>
              </div>

              {/* Revisions */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Revisions ({selectedDrawing.revisions?.length || 0})</h3>
                <div className="flex gap-2">
                  {(selectedDrawing.revisions?.length || 0) >= 2 && (
                    <Button size="sm" variant="outline" className="border-border h-7 text-xs" onClick={() => { setCompareRevs({ a: selectedDrawing.revisions![selectedDrawing.revisions!.length - 1]?.id, b: selectedDrawing.revisions![0]?.id }); setShowCompare(true); }}>
                      <GitCompare className="h-3 w-3 mr-1" />Compare
                    </Button>
                  )}
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={() => { setForm({ revision_number: '' }); setRevisionFile(null); setShowAddRevision(true); }}>
                    <Plus className="h-3 w-3 mr-1" />Add Revision
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {(selectedDrawing.revisions || []).map((rev: Revision) => (
                  <div key={rev.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm text-amber-500 font-bold">Rev {rev.revision_number}</div>
                      <div className="text-xs text-muted-foreground">{rev.change_description || 'No description'}</div>
                      <Badge variant="outline" className={statusColors[rev.status] || 'border-border'} >{rev.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {rev.file_url && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => previewFile(selectedDrawing.id, selectedDrawing.project_id)} title="Preview file">
                          <Eye className="h-3 w-3 mr-1" />Preview
                        </Button>
                      )}
                      {rev.file_url && (
                        <a href={rev.file_url} download={rev.file_name || 'drawing'} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" title="Download file">
                            <Download className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                      {rev.status === 'draft' && <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 dark:text-blue-400" onClick={() => reviewRevision(rev.id, 'review')}>Review</Button>}
                      {rev.status === 'reviewed' && <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 dark:text-green-400" onClick={() => reviewRevision(rev.id, 'approve')}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>}
                      <span className="text-[10px] text-muted-foreground">{new Date(rev.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                ))}
                {(selectedDrawing.revisions || []).length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No revisions yet</p>}
              </div>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Add Revision Dialog */}
      <Dialog open={showAddRevision} onOpenChange={setShowAddRevision}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader><DialogTitle>Add Revision</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-muted-foreground text-xs">Revision Number *</Label><Input value={form.revision_number || ''} onChange={(e) => setForm({ ...form, revision_number: e.target.value })} className="bg-muted border-border" placeholder="B" /></div>
            <div>
              <Label className="text-muted-foreground text-xs">Drawing File</Label>
              <label className="flex items-center gap-2 mt-1 p-3 rounded-lg border border-dashed border-border bg-muted/50 cursor-pointer hover:border-amber-600/50 transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">{revisionFile ? revisionFile.name : 'Click to upload revised drawing file'}</span>
                <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.dwf,.rvt,.ifc,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setRevisionFile(e.target.files?.[0] || null)} />
              </label>
              {revisionFile && <p className="text-[10px] text-muted-foreground mt-1">{(revisionFile.size / 1024 / 1024).toFixed(1)} MB</p>}
            </div>
            <div><Label className="text-muted-foreground text-xs">Change Description</Label><Textarea value={form.change_description || ''} onChange={(e) => setForm({ ...form, change_description: e.target.value })} className="bg-muted border-border" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRevision(false)} className="border-border">Cancel</Button>
            <Button onClick={addRevision} className="bg-amber-600 hover:bg-amber-700" disabled={!form.revision_number}>Add Revision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Revisions Dialog */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl">
          <DialogHeader><DialogTitle><GitCompare className="h-4 w-4 inline mr-2" />Version Comparison</DialogTitle></DialogHeader>
          {selectedDrawing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-muted-foreground text-xs">Revision A (older)</Label>
                  <Select value={compareRevs.a} onValueChange={(v) => setCompareRevs({ ...compareRevs, a: v })}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select revision" /></SelectTrigger>
                    <SelectContent>{(selectedDrawing.revisions || []).map(r => <SelectItem key={r.id} value={r.id}>Rev {r.revision_number}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-muted-foreground text-xs">Revision B (newer)</Label>
                  <Select value={compareRevs.b} onValueChange={(v) => setCompareRevs({ ...compareRevs, b: v })}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select revision" /></SelectTrigger>
                    <SelectContent>{(selectedDrawing.revisions || []).map(r => <SelectItem key={r.id} value={r.id}>Rev {r.revision_number}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              {compareRevs.a && compareRevs.b && (
                <div className="grid grid-cols-2 gap-4">
                  {[compareRevs.a, compareRevs.b].map(revId => {
                    const rev = (selectedDrawing.revisions || []).find((r: Revision) => r.id === revId);
                    return rev ? (
                      <Card key={revId} className="bg-muted border-border p-4">
                        <p className="font-mono text-amber-500 font-bold mb-2">Rev {rev.revision_number}</p>
                        <p className="text-xs text-muted-foreground mb-1"><span className="text-muted-foreground">Status:</span> {rev.status}</p>
                        <p className="text-xs text-muted-foreground mb-1"><span className="text-muted-foreground">Date:</span> {new Date(rev.created_at).toLocaleDateString('en-GB')}</p>
                        <p className="text-xs text-muted-foreground mb-1"><span className="text-muted-foreground">File:</span> {rev.file_name || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground"><span className="text-muted-foreground">Changes:</span> {rev.change_description || 'No description'}</p>
                      </Card>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
