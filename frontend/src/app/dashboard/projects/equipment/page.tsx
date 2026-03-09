'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const STATUS_COLORS: Record<string, string> = { available: 'bg-green-500/20 text-green-400', in_use: 'bg-blue-500/20 text-blue-400', maintenance: 'bg-yellow-500/20 text-yellow-400', repair: 'bg-orange-500/20 text-orange-400', retired: 'bg-zinc-500/20 text-zinc-400', disposed: 'bg-red-500/20 text-red-400' };
const CONDITION_COLORS: Record<string, string> = { excellent: 'bg-green-500/20 text-green-400', good: 'bg-blue-500/20 text-blue-400', fair: 'bg-yellow-500/20 text-yellow-400', poor: 'bg-orange-500/20 text-orange-400', critical: 'bg-red-500/20 text-red-400' };

export default function EquipmentPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('inventory');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: allEquipment } = useQuery({
    queryKey: ['equipment'],
    queryFn: () => authedFetch('/api/equipment').then(r => r.json()),
  });
  const { data: projectEquipment } = useQuery({
    queryKey: ['project-equipment', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/equipment`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: equipStats } = useQuery({
    queryKey: ['equipment-stats'],
    queryFn: () => authedFetch('/api/equipment-stats').then(r => r.json()),
  });

  const createEquipment = useMutation({
    mutationFn: (data: any) => authedFetch('/api/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment'] }); setShowCreate(false); setForm({}); toast({ title: 'Equipment added' }); },
  });

  const assignEquipment = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/equipment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-equipment'] }); qc.invalidateQueries({ queryKey: ['equipment'] }); toast({ title: 'Equipment assigned' }); },
  });

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">EQUIPMENT TRACKING</h1>
          <p className="text-[10px] font-mono text-zinc-500">INVENTORY • ASSIGNMENTS • MAINTENANCE</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs">+ ADD EQUIPMENT</Button>
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
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" onClick={() => createEquipment.mutate(form)}>Add Equipment</Button>
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
                  <div className="flex items-center gap-2">
                    {eq.status === 'available' && projectId && (
                      <Button size="sm" variant="outline" className="text-xs border-amber-500/50 text-amber-400" onClick={() => assignEquipment.mutate({ equipment_id: eq.id })}>Assign</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!allEquipment?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No equipment in inventory</p>}
          </div>
        </TabsContent>

        <TabsContent value="assigned" className="mt-4">
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
                  {a.daily_rate && <span className="text-sm font-mono text-green-400">${parseFloat(a.daily_rate).toFixed(0)}/day</span>}
                </CardContent>
              </Card>
            ))}
            {(!projectEquipment?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No equipment assigned to this project</p>}
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
    </div>
  );
}
