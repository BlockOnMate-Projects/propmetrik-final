'use client';

import { useState, useEffect } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, ArrowUpRight, RotateCcw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

const STATUS_COLORS: Record<string, string> = { available: 'bg-green-500/20 text-green-400', in_use: 'bg-blue-500/20 text-blue-400', maintenance: 'bg-yellow-500/20 text-yellow-400', repair: 'bg-orange-500/20 text-orange-400', retired: 'bg-zinc-500/20 text-zinc-400', disposed: 'bg-red-500/20 text-red-400' };
const CONDITION_COLORS: Record<string, string> = { excellent: 'bg-green-500/20 text-green-400', good: 'bg-blue-500/20 text-blue-400', fair: 'bg-yellow-500/20 text-yellow-400', poor: 'bg-orange-500/20 text-orange-400', critical: 'bg-red-500/20 text-red-400' };

interface Project { id: string; name: string; }

export default function EquipmentPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('inventory');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [assignProject, setAssignProject] = useState('');

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

  const { data: allEquipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => authedFetch(`${API}/equipment`).then(r => r.json()),
  });
  const { data: projectEquipment } = useQuery({
    queryKey: ['project-equipment', selectedProject],
    queryFn: () => authedFetch(`${API}/projects/${selectedProject}/equipment`).then(r => r.json()),
    enabled: !!selectedProject,
  });
  const { data: equipStats } = useQuery({
    queryKey: ['equipment-stats'],
    queryFn: () => authedFetch(`${API}/equipment-stats`).then(r => r.json()),
  });

  const createEquipment = useMutation({
    mutationFn: (data: any) => authedFetch(`${API}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment'] }); qc.invalidateQueries({ queryKey: ['equipment-stats'] }); setShowCreate(false); setForm({}); toast({ title: 'Equipment added' }); },
  });

  const updateEquipment = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => authedFetch(`${API}/equipment/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment'] }); qc.invalidateQueries({ queryKey: ['equipment-stats'] }); setShowEdit(false); setEditingId(null); setForm({}); toast({ title: 'Equipment updated' }); },
  });

  const deleteEquipment = useMutation({
    mutationFn: (id: string) => authedFetch(`${API}/equipment/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment'] }); qc.invalidateQueries({ queryKey: ['equipment-stats'] }); toast({ title: 'Equipment deleted' }); },
  });

  const assignEquipment = useMutation({
    mutationFn: ({ projectId, equipmentId }: { projectId: string; equipmentId: string }) =>
      authedFetch(`${API}/projects/${projectId}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipment_id: equipmentId }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-equipment'] }); qc.invalidateQueries({ queryKey: ['equipment'] }); qc.invalidateQueries({ queryKey: ['equipment-stats'] }); setShowAssign(false); setAssigningId(null); setAssignProject(''); toast({ title: 'Equipment assigned to project' }); },
  });

  const returnEquipment = useMutation({
    mutationFn: ({ projectId, assignmentId }: { projectId: string; assignmentId: string }) =>
      authedFetch(`${API}/projects/${projectId}/equipment/${assignmentId}/return`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-equipment'] }); qc.invalidateQueries({ queryKey: ['equipment'] }); qc.invalidateQueries({ queryKey: ['equipment-stats'] }); toast({ title: 'Equipment returned' }); },
  });

  const openEdit = (eq: any) => {
    setEditingId(eq.id);
    setForm({ name: eq.name, equipment_number: eq.equipment_number, category: eq.category, ownership_type: eq.ownership_type, make: eq.make, model: eq.model, serial_number: eq.serial_number, status: eq.status, condition_rating: eq.condition_rating, notes: eq.notes });
    setShowEdit(true);
  };

  const openAssign = (eq: any) => {
    setAssigningId(eq.id);
    setAssignProject('');
    setShowAssign(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">EQUIPMENT TRACKING</h1>
          <p className="text-[10px] font-mono text-zinc-500">INVENTORY • ASSIGNMENTS • MAINTENANCE</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white text-xs">+ ADD EQUIPMENT</Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
            <DialogHeader><DialogTitle className="text-white">Add Equipment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] font-mono text-zinc-500">EQUIPMENT #</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.equipment_number || ''} onChange={e => setForm({ ...form, equipment_number: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-zinc-500">NAME</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] font-mono text-zinc-500">CATEGORY</Label>
                  <Select value={form.category || 'heavy'} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="heavy">Heavy</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="power_tools">Power Tools</SelectItem><SelectItem value="vehicles">Vehicles</SelectItem><SelectItem value="scaffolding">Scaffolding</SelectItem><SelectItem value="safety">Safety</SelectItem><SelectItem value="measuring">Measuring</SelectItem></SelectContent></Select></div>
                <div><Label className="text-[10px] font-mono text-zinc-500">OWNERSHIP</Label>
                  <Select value={form.ownership_type || 'owned'} onValueChange={v => setForm({ ...form, ownership_type: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="owned">Owned</SelectItem><SelectItem value="rented">Rented</SelectItem><SelectItem value="leased">Leased</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-[10px] font-mono text-zinc-500">MAKE</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.make || ''} onChange={e => setForm({ ...form, make: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-zinc-500">MODEL</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.model || ''} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-zinc-500">SERIAL #</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.serial_number || ''} onChange={e => setForm({ ...form, serial_number: e.target.value })} /></div>
              </div>
              <div><Label className="text-[10px] font-mono text-zinc-500">NOTES</Label><Textarea className="bg-zinc-800 border-zinc-700 text-white" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => createEquipment.mutate(form)}>Add Equipment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['available', 'in_use', 'maintenance', 'repair'].map(s => {
          const count = (equipStats?.data?.by_status_category || []).filter((r: any) => r.status === s).reduce((a: number, r: any) => a + parseInt(r.count), 0);
          return (
            <Card key={s} className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">{s.replace(/_/g, ' ').toUpperCase()}</p><p className="text-2xl font-bold text-white">{count}</p></CardContent></Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="inventory" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">INVENTORY ({allEquipment?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="assigned" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">ASSIGNED ({projectEquipment?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">MAINTENANCE</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-4">
          <div className="space-y-2">
            {(allEquipment?.data || []).map((eq: any) => (
              <Card key={eq.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-amber-500">{eq.equipment_number}</span>
                      <Badge className={STATUS_COLORS[eq.status] || ''}>{eq.status?.replace(/_/g, ' ')}</Badge>
                      <Badge className={CONDITION_COLORS[eq.condition_rating] || ''}>{eq.condition_rating}</Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400">{eq.category}</Badge>
                    </div>
                    <p className="text-sm text-white font-medium">{eq.name}</p>
                    <p className="text-xs text-zinc-500">{eq.make} {eq.model} {eq.year ? `(${eq.year})` : ''} • S/N: {eq.serial_number || 'N/A'} • {eq.ownership_type}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {eq.status === 'available' && (
                      <Button size="sm" variant="outline" className="text-xs border-green-600/50 text-green-400 h-7" onClick={() => openAssign(eq)}>
                        <ArrowUpRight className="h-3 w-3 mr-1" />Assign
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs text-zinc-400 h-7 w-7 p-0" onClick={() => openEdit(eq)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-red-400 h-7 w-7 p-0" onClick={() => { if (confirm('Delete this equipment?')) deleteEquipment.mutate(eq.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!allEquipment?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No equipment in inventory</p>}
          </div>
        </TabsContent>

        <TabsContent value="assigned" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-[220px] bg-zinc-900 border-zinc-800 text-sm text-white"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {(projectEquipment?.data || []).map((a: any) => (
              <Card key={a.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-amber-500">{a.equipment_number}</span>
                      <Badge className={STATUS_COLORS[a.status] || ''}>{a.status}</Badge>
                    </div>
                    <p className="text-sm text-white">{a.equipment_name}</p>
                    <p className="text-xs text-zinc-500">{a.category} • {a.make} {a.model} • Assigned: {new Date(a.assigned_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.daily_rate > 0 && <span className="text-sm font-mono text-green-400">${parseFloat(a.daily_rate).toFixed(0)}/day</span>}
                    {a.status !== 'returned' && (
                      <Button size="sm" variant="outline" className="text-xs border-zinc-700 text-zinc-400 h-7" onClick={() => returnEquipment.mutate({ projectId: selectedProject, assignmentId: a.id })}>
                        <RotateCcw className="h-3 w-3 mr-1" />Return
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!projectEquipment?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">{selectedProject ? 'No equipment assigned to this project' : 'Select a project above to view assignments'}</p>}
          </div>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <div className="space-y-2">
            {(equipStats?.data?.upcoming_maintenance || []).map((m: any) => (
              <Card key={m.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-amber-500">{m.equipment_number}</span>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400">{m.maintenance_type}</Badge>
                      </div>
                      <p className="text-sm text-white">{m.name} — {m.description}</p>
                      <p className="text-xs text-zinc-500">Due: {new Date(m.scheduled_date).toLocaleDateString()} {m.vendor ? `• Vendor: ${m.vendor}` : ''}</p>
                    </div>
                    {m.cost > 0 && <span className="text-sm font-mono text-amber-400">${parseFloat(m.cost).toFixed(0)}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!(equipStats?.data?.upcoming_maintenance?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No upcoming maintenance</p>}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Equipment Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader><DialogTitle className="text-white">Edit Equipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[10px] font-mono text-zinc-500">EQUIPMENT #</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.equipment_number || ''} onChange={e => setForm({ ...form, equipment_number: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">NAME</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[10px] font-mono text-zinc-500">STATUS</Label>
                <Select value={form.status || 'available'} onValueChange={v => setForm({ ...form, status: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="available">Available</SelectItem><SelectItem value="in_use">In Use</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="repair">Repair</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">CONDITION</Label>
                <Select value={form.condition_rating || 'good'} onValueChange={v => setForm({ ...form, condition_rating: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="excellent">Excellent</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-[10px] font-mono text-zinc-500">CATEGORY</Label>
                <Select value={form.category || 'heavy'} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="heavy">Heavy</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="power_tools">Power Tools</SelectItem><SelectItem value="vehicles">Vehicles</SelectItem><SelectItem value="scaffolding">Scaffolding</SelectItem><SelectItem value="safety">Safety</SelectItem><SelectItem value="measuring">Measuring</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">OWNERSHIP</Label>
                <Select value={form.ownership_type || 'owned'} onValueChange={v => setForm({ ...form, ownership_type: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="owned">Owned</SelectItem><SelectItem value="rented">Rented</SelectItem><SelectItem value="leased">Leased</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-[10px] font-mono text-zinc-500">MAKE</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.make || ''} onChange={e => setForm({ ...form, make: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">MODEL</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.model || ''} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">SERIAL #</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.serial_number || ''} onChange={e => setForm({ ...form, serial_number: e.target.value })} /></div>
            </div>
            <div><Label className="text-[10px] font-mono text-zinc-500">NOTES</Label><Textarea className="bg-zinc-800 border-zinc-700 text-white" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => editingId && updateEquipment.mutate({ id: editingId, data: form })}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to Project Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader><DialogTitle className="text-white">Assign Equipment to Project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] font-mono text-zinc-500">SELECT PROJECT</Label>
              <Select value={assignProject} onValueChange={setAssignProject}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="Choose a project..." /></SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" disabled={!assignProject} onClick={() => assigningId && assignEquipment.mutate({ projectId: assignProject, equipmentId: assigningId })}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
