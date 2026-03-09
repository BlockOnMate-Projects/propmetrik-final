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
import { Plus, Search, Pencil, Download, Loader2, Eye, GitCompare, FileText, CheckCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Drawing {
  id: string; drawing_number: string; title: string; discipline: string;
  current_revision: string; status: string; description: string | null;
  sheet_size: string; scale: string | null; created_at: string;
  revision_count: number; recent_revisions: any[] | null;
}

interface Revision {
  id: string; revision_number: string; file_name: string | null; file_url: string | null;
  change_description: string | null; status: string; created_at: string;
  reviewed_by: string | null; approved_by: string | null;
}

interface Project { id: string; name: string; }

const disciplineColors: Record<string, string> = {
  architectural: 'bg-blue-900/50 text-blue-400 border-blue-800',
  structural: 'bg-orange-900/50 text-orange-400 border-orange-800',
  mechanical: 'bg-green-900/50 text-green-400 border-green-800',
  electrical: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
  plumbing: 'bg-cyan-900/50 text-cyan-400 border-cyan-800',
  civil: 'bg-purple-900/50 text-purple-400 border-purple-800',
  landscape: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
};
const statusColors: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  in_review: 'bg-amber-900/50 text-amber-400 border-amber-800',
  approved: 'bg-green-900/50 text-green-400 border-green-800',
  superseded: 'bg-red-900/50 text-red-400 border-red-800',
  issued: 'bg-blue-900/50 text-blue-400 border-blue-800',
  reviewed: 'bg-purple-900/50 text-purple-400 border-purple-800',
};

export default function DrawingsPage() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<(Drawing & { revisions: Revision[] }) | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [compareRevs, setCompareRevs] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [showAddRevision, setShowAddRevision] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`${API}/api/v1/projects?limit=100`);
        const json = await res.json();
        const list = json.data?.projects || json.data || json.projects || [];
        setProjects(list);
        if (list.length > 0 && !selectedProject) setSelectedProject(list[0].id);
      } catch (e) { console.error('Failed to load projects', e); }
    })();
  }, []);

  const fetchDrawings = useCallback(async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const res = await authedFetch(`${API}/api/v1/projects/${selectedProject}/drawings?search=${search}`);
      const json = await res.json();
      setDrawings(json.data || []);
    } catch (e) { console.error('Failed to load drawings', e); }
    setLoading(false);
  }, [selectedProject, search]);

  useEffect(() => { fetchDrawings(); }, [fetchDrawings]);

  const viewDrawing = async (id: string) => {
    const res = await authedFetch(`${API}/api/v1/projects/${selectedProject}/drawings/${id}`);
    const json = await res.json();
    setSelectedDrawing(json.data);
    setShowDetail(true);
  };

  const createDrawing = async () => {
    try {
      const res = await authedFetch(`${API}/api/v1/projects/${selectedProject}/drawings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: 'Drawing created' }); setShowCreate(false); setForm({}); fetchDrawings();
      }
    } catch (e) { toast({ title: 'Failed to create drawing', variant: 'destructive' }); }
  };

  const addRevision = async () => {
    if (!selectedDrawing) return;
    try {
      const res = await authedFetch(`${API}/api/v1/projects/${selectedProject}/drawings/${selectedDrawing.id}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: 'Revision added' }); setShowAddRevision(false); setForm({});
        viewDrawing(selectedDrawing.id);
      }
    } catch (e) { toast({ title: 'Failed to add revision', variant: 'destructive' }); }
  };

  const reviewRevision = async (revisionId: string, action: 'review' | 'approve') => {
    if (!selectedDrawing) return;
    await authedFetch(`${API}/api/v1/projects/${selectedProject}/drawings/${selectedDrawing.id}/revisions/${revisionId}/review`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    toast({ title: action === 'approve' ? 'Revision approved' : 'Revision reviewed' });
    viewDrawing(selectedDrawing.id);
  };

  const exportDrawings = () => {
    window.open(`${API}/api/v1/projects/${selectedProject}/export/drawings?format=csv`, '_blank');
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
          <h1 className="text-xl font-bold text-white">Drawing Management</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage architectural, structural, and engineering drawings with version control</p>
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800 text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
          <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Total Drawings</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Approved</p>
          <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">In Review</p>
          <p className="text-2xl font-bold text-amber-500">{stats.inReview}</p>
        </CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Disciplines</p>
          <p className="text-2xl font-bold text-blue-500">{stats.disciplines}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input placeholder="Search drawings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[250px] bg-zinc-900 border-zinc-800" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-zinc-700" onClick={exportDrawings}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => { setForm({}); setShowCreate(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />New Drawing</Button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div> : (
        <Card className="bg-zinc-900/80 border-zinc-800">
          <Table>
            <TableHeader><TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500 font-mono text-[10px]">NUMBER</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">TITLE</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">DISCIPLINE</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">REV</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">STATUS</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">SHEET</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">REVISIONS</TableHead>
              <TableHead className="text-zinc-500 font-mono text-[10px]">ACTIONS</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {drawings.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-8">No drawings found. Create one to get started.</TableCell></TableRow>
              ) : drawings.map(d => (
                <TableRow key={d.id} className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer" onClick={() => viewDrawing(d.id)}>
                  <TableCell className="font-mono text-xs text-amber-500">{d.drawing_number}</TableCell>
                  <TableCell className="text-sm text-white max-w-[200px] truncate">{d.title}</TableCell>
                  <TableCell><Badge variant="outline" className={disciplineColors[d.discipline] || 'border-zinc-700'}>{d.discipline}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-white">{d.current_revision}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[d.status] || 'border-zinc-700'}>{d.status.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-xs text-zinc-400">{d.sheet_size}</TableCell>
                  <TableCell className="text-xs text-zinc-400">{d.revision_count || 0}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); viewDrawing(d.id); }}><Eye className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Drawing Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
          <DialogHeader><DialogTitle>Create Drawing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-400 text-xs">Drawing Number *</Label><Input value={form.drawing_number || ''} onChange={(e) => setForm({ ...form, drawing_number: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="A-101" /></div>
              <div><Label className="text-zinc-400 text-xs">Discipline</Label>
                <Select value={form.discipline || 'architectural'} onValueChange={(v) => setForm({ ...form, discipline: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{['architectural','structural','mechanical','electrical','plumbing','civil','landscape'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Title *</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-800 border-zinc-700" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-400 text-xs">Sheet Size</Label>
                <Select value={form.sheet_size || 'A1'} onValueChange={(v) => setForm({ ...form, sheet_size: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue /></SelectTrigger>
                  <SelectContent>{['A0','A1','A2','A3','A4','ARCH D','ARCH E'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-zinc-400 text-xs">Scale</Label><Input value={form.scale || ''} onChange={(e) => setForm({ ...form, scale: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="1:100" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={createDrawing} className="bg-amber-600 hover:bg-amber-700" disabled={!form.title || !form.drawing_number}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDrawing && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-amber-500">{selectedDrawing.drawing_number}</span>
                <span>{selectedDrawing.title}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className={disciplineColors[selectedDrawing.discipline] || 'border-zinc-700'}>{selectedDrawing.discipline}</Badge>
                <Badge variant="outline" className={statusColors[selectedDrawing.status] || 'border-zinc-700'}>{selectedDrawing.status}</Badge>
                <Badge variant="outline" className="border-zinc-700">Rev {selectedDrawing.current_revision}</Badge>
                <Badge variant="outline" className="border-zinc-700">{selectedDrawing.sheet_size}</Badge>
                {selectedDrawing.scale && <Badge variant="outline" className="border-zinc-700">{selectedDrawing.scale}</Badge>}
              </div>
              {selectedDrawing.description && <p className="text-sm text-zinc-400">{selectedDrawing.description}</p>}

              {/* Revisions */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Revisions ({selectedDrawing.revisions?.length || 0})</h3>
                <div className="flex gap-2">
                  {(selectedDrawing.revisions?.length || 0) >= 2 && (
                    <Button size="sm" variant="outline" className="border-zinc-700 h-7 text-xs" onClick={() => { setCompareRevs({ a: selectedDrawing.revisions![selectedDrawing.revisions!.length - 1]?.id, b: selectedDrawing.revisions![0]?.id }); setShowCompare(true); }}>
                      <GitCompare className="h-3 w-3 mr-1" />Compare
                    </Button>
                  )}
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={() => { setForm({ revision_number: '' }); setShowAddRevision(true); }}>
                    <Plus className="h-3 w-3 mr-1" />Add Revision
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {(selectedDrawing.revisions || []).map((rev: Revision) => (
                  <div key={rev.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm text-amber-500 font-bold">Rev {rev.revision_number}</div>
                      <div className="text-xs text-zinc-400">{rev.change_description || 'No description'}</div>
                      <Badge variant="outline" className={statusColors[rev.status] || 'border-zinc-700'} >{rev.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {rev.file_url && <Button size="sm" variant="ghost" className="h-7 text-xs"><FileText className="h-3 w-3" /></Button>}
                      {rev.status === 'draft' && <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-400" onClick={() => reviewRevision(rev.id, 'review')}>Review</Button>}
                      {rev.status === 'reviewed' && <Button size="sm" variant="ghost" className="h-7 text-xs text-green-400" onClick={() => reviewRevision(rev.id, 'approve')}><CheckCircle className="h-3 w-3 mr-1" />Approve</Button>}
                      <span className="text-[10px] text-zinc-500">{new Date(rev.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {(selectedDrawing.revisions || []).length === 0 && <p className="text-zinc-500 text-sm text-center py-4">No revisions yet</p>}
              </div>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Add Revision Dialog */}
      <Dialog open={showAddRevision} onOpenChange={setShowAddRevision}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader><DialogTitle>Add Revision</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-zinc-400 text-xs">Revision Number *</Label><Input value={form.revision_number || ''} onChange={(e) => setForm({ ...form, revision_number: e.target.value })} className="bg-zinc-800 border-zinc-700" placeholder="B" /></div>
            <div><Label className="text-zinc-400 text-xs">File Name</Label><Input value={form.file_name || ''} onChange={(e) => setForm({ ...form, file_name: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">File URL</Label><Input value={form.file_url || ''} onChange={(e) => setForm({ ...form, file_url: e.target.value })} className="bg-zinc-800 border-zinc-700" /></div>
            <div><Label className="text-zinc-400 text-xs">Change Description</Label><Textarea value={form.change_description || ''} onChange={(e) => setForm({ ...form, change_description: e.target.value })} className="bg-zinc-800 border-zinc-700" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRevision(false)} className="border-zinc-700">Cancel</Button>
            <Button onClick={addRevision} className="bg-amber-600 hover:bg-amber-700" disabled={!form.revision_number}>Add Revision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Revisions Dialog */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl">
          <DialogHeader><DialogTitle><GitCompare className="h-4 w-4 inline mr-2" />Version Comparison</DialogTitle></DialogHeader>
          {selectedDrawing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-zinc-400 text-xs">Revision A (older)</Label>
                  <Select value={compareRevs.a} onValueChange={(v) => setCompareRevs({ ...compareRevs, a: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue placeholder="Select revision" /></SelectTrigger>
                    <SelectContent>{(selectedDrawing.revisions || []).map(r => <SelectItem key={r.id} value={r.id}>Rev {r.revision_number}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-zinc-400 text-xs">Revision B (newer)</Label>
                  <Select value={compareRevs.b} onValueChange={(v) => setCompareRevs({ ...compareRevs, b: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700"><SelectValue placeholder="Select revision" /></SelectTrigger>
                    <SelectContent>{(selectedDrawing.revisions || []).map(r => <SelectItem key={r.id} value={r.id}>Rev {r.revision_number}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              {compareRevs.a && compareRevs.b && (
                <div className="grid grid-cols-2 gap-4">
                  {[compareRevs.a, compareRevs.b].map(revId => {
                    const rev = (selectedDrawing.revisions || []).find((r: Revision) => r.id === revId);
                    return rev ? (
                      <Card key={revId} className="bg-zinc-800 border-zinc-700 p-4">
                        <p className="font-mono text-amber-500 font-bold mb-2">Rev {rev.revision_number}</p>
                        <p className="text-xs text-zinc-400 mb-1"><span className="text-zinc-500">Status:</span> {rev.status}</p>
                        <p className="text-xs text-zinc-400 mb-1"><span className="text-zinc-500">Date:</span> {new Date(rev.created_at).toLocaleDateString()}</p>
                        <p className="text-xs text-zinc-400 mb-1"><span className="text-zinc-500">File:</span> {rev.file_name || 'N/A'}</p>
                        <p className="text-xs text-zinc-400"><span className="text-zinc-500">Changes:</span> {rev.change_description || 'No description'}</p>
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
