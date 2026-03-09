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

const STATUS_COLORS: Record<string, string> = { draft: 'bg-zinc-500/20 text-zinc-400', submitted: 'bg-blue-500/20 text-blue-400', approved: 'bg-green-500/20 text-green-400', rejected: 'bg-red-500/20 text-red-400' };

export default function TimesheetsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('entries');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: entries } = useQuery({
    queryKey: ['time-entries', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/time-entries`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: timesheets } = useQuery({
    queryKey: ['timesheets', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/timesheets`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: stats } = useQuery({
    queryKey: ['time-stats', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/time-stats`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: crews } = useQuery({
    queryKey: ['crews', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/crews`).then(r => r.json()),
    enabled: !!projectId,
  });

  const clockIn = useMutation({
    mutationFn: () => {
      return new Promise<any>((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => authedFetch(`/api/projects/${projectId}/time-entries/clock-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }) }).then(r => r.json()).then(resolve),
            () => authedFetch(`/api/projects/${projectId}/time-entries/clock-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(r => r.json()).then(resolve)
          );
        } else {
          authedFetch(`/api/projects/${projectId}/time-entries/clock-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(r => r.json()).then(resolve);
        }
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time-entries'] }); toast({ title: 'Clocked in' }); },
  });

  const createEntry = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/time-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time-entries'] }); qc.invalidateQueries({ queryKey: ['time-stats'] }); setShowCreate(false); setForm({}); toast({ title: 'Time entry created' }); },
  });

  const approveEntry = useMutation({
    mutationFn: (id: string) => authedFetch(`/api/projects/${projectId}/time-entries/${id}/approve`, { method: 'PUT' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time-entries'] }); toast({ title: 'Entry approved' }); },
  });

  const summary = stats?.data?.summary || {};

  if (!projectId) return <div className="p-8 text-center text-zinc-500">Select a project to view timesheets</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">TIME TRACKING</h1>
          <p className="text-[10px] font-mono text-zinc-500">CLOCK IN/OUT • GPS TRACKING • APPROVAL WORKFLOW</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-green-500/50 text-green-400 text-xs hover:bg-green-500/10" onClick={() => clockIn.mutate()}>CLOCK IN</Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs">+ ENTRY</Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
              <DialogHeader><DialogTitle className="text-white">New Time Entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">DATE</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={form.entry_date || ''} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">HOURS</Label><Input type="number" step="0.5" className="bg-zinc-800 border-zinc-700 text-white" value={form.hours_worked || ''} onChange={e => setForm({ ...form, hours_worked: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">ACTIVITY</Label>
                    <Select value={form.activity_type || 'labor'} onValueChange={v => setForm({ ...form, activity_type: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="labor">Labor</SelectItem><SelectItem value="supervision">Supervision</SelectItem><SelectItem value="inspection">Inspection</SelectItem><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="travel">Travel</SelectItem><SelectItem value="training">Training</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">COST CODE</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.cost_code || ''} onChange={e => setForm({ ...form, cost_code: e.target.value })} /></div>
                </div>
                <div><Label className="text-[10px] font-mono text-zinc-500">DESCRIPTION</Label><Textarea className="bg-zinc-800 border-zinc-700 text-white" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">HOURLY RATE</Label><Input type="number" step="0.01" className="bg-zinc-800 border-zinc-700 text-white" value={form.hourly_rate || ''} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">OVERTIME HRS</Label><Input type="number" step="0.5" className="bg-zinc-800 border-zinc-700 text-white" value={form.overtime_hours || ''} onChange={e => setForm({ ...form, overtime_hours: e.target.value })} /></div>
                </div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" onClick={() => createEntry.mutate(form)}>Add Entry</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">TOTAL HOURS</p><p className="text-2xl font-bold text-white">{parseFloat(summary.total_hours || 0).toFixed(1)}</p></CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">OVERTIME</p><p className="text-2xl font-bold text-amber-400">{parseFloat(summary.total_overtime || 0).toFixed(1)}</p></CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">WORKERS</p><p className="text-2xl font-bold text-blue-400">{summary.unique_workers || 0}</p></CardContent></Card>
        <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">TOTAL COST</p><p className="text-2xl font-bold text-green-400">${parseFloat(summary.total_cost || 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="entries" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">ENTRIES ({entries?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="timesheets" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">TIMESHEETS ({timesheets?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="crews" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">CREWS ({crews?.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-4">
          <div className="space-y-2">
            {(entries?.data || []).map((e: any) => (
              <Card key={e.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLORS[e.status] || ''}>{e.status}</Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400">{e.activity_type}</Badge>
                      {e.latitude && <span className="text-[10px] text-green-400">📍 GPS</span>}
                    </div>
                    <p className="text-sm text-white">{e.description || e.activity_type} — {e.hours_worked}h {e.overtime_hours > 0 ? `(+${e.overtime_hours}h OT)` : ''}</p>
                    <p className="text-xs text-zinc-500">{new Date(e.entry_date).toLocaleDateString()} • {e.cost_code || 'No cost code'} • {e.user_name || 'Self'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.total_cost && <span className="text-sm font-mono text-green-400">${parseFloat(e.total_cost).toFixed(2)}</span>}
                    {e.status === 'submitted' && <Button size="sm" variant="outline" className="text-xs border-green-500/50 text-green-400" onClick={() => approveEntry.mutate(e.id)}>Approve</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!entries?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No time entries</p>}
          </div>
        </TabsContent>

        <TabsContent value="timesheets" className="mt-4">
          <div className="space-y-2">
            {(timesheets?.data || []).map((ts: any) => (
              <Card key={ts.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={STATUS_COLORS[ts.status] || ''}>{ts.status}</Badge>
                      <span className="text-sm text-white">{ts.user_name}</span>
                    </div>
                    <p className="text-xs text-zinc-500">Week: {new Date(ts.week_start).toLocaleDateString()} – {new Date(ts.week_end).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">{parseFloat(ts.total_regular_hours || 0).toFixed(1)}h</p>
                    <p className="text-[10px] text-amber-400">{parseFloat(ts.total_overtime_hours || 0).toFixed(1)}h OT</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!timesheets?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No timesheets</p>}
          </div>
        </TabsContent>

        <TabsContent value="crews" className="mt-4">
          <div className="space-y-2">
            {(crews?.data || []).map((c: any) => (
              <Card key={c.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{c.crew_name}</p>
                      <p className="text-xs text-zinc-500">{c.trade} • Foreman: {c.foreman_name || 'TBA'} • {c.headcount} workers</p>
                      <p className="text-xs text-zinc-500">{new Date(c.schedule_date).toLocaleDateString()} {c.start_time}–{c.end_time}</p>
                    </div>
                    <Badge className={STATUS_COLORS[c.status] || 'bg-zinc-500/20 text-zinc-400'}>{c.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!crews?.data?.length) && <p className="text-center text-zinc-500 py-8 text-sm">No crew schedules</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
