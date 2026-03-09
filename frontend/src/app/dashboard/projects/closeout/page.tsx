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

const ITEM_STATUS: Record<string, string> = { not_started: 'bg-zinc-500/20 text-zinc-400', in_progress: 'bg-blue-500/20 text-blue-400', completed: 'bg-green-500/20 text-green-400', na: 'bg-zinc-500/20 text-zinc-400' };
const CLAIM_STATUS: Record<string, string> = { submitted: 'bg-blue-500/20 text-blue-400', under_review: 'bg-yellow-500/20 text-yellow-400', approved: 'bg-green-500/20 text-green-400', denied: 'bg-red-500/20 text-red-400', resolved: 'bg-purple-500/20 text-purple-400' };

function daysUntil(d: string) { const ms = new Date(d).getTime() - Date.now(); return Math.ceil(ms / 86400000); }

export default function CloseoutPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('checklist');
  const [showWarranty, setShowWarranty] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: closeout } = useQuery({
    queryKey: ['closeout', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/closeout`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: items } = useQuery({
    queryKey: ['closeout-items', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/closeout/items`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: warranties } = useQuery({
    queryKey: ['warranties', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/warranties`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: dashboard } = useQuery({
    queryKey: ['warranty-dashboard', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/warranty-dashboard`).then(r => r.json()),
    enabled: !!projectId,
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }: any) => authedFetch(`/api/closeout/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['closeout-items'] }); qc.invalidateQueries({ queryKey: ['closeout'] }); toast({ title: 'Item updated' }); },
  });

  const createWarranty = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/warranties`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warranties'] }); qc.invalidateQueries({ queryKey: ['warranty-dashboard'] }); setShowWarranty(false); setForm({}); toast({ title: 'Warranty added' }); },
  });

  const coData = closeout?.data;
  const pct = coData ? Math.round((parseInt(coData.items_completed || 0) / Math.max(parseInt(coData.total_items || 1), 1)) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">PROJECT CLOSEOUT</h1>
          <p className="text-[10px] font-mono text-zinc-500">CHECKLIST • WARRANTIES • CLAIMS</p>
        </div>
        <Dialog open={showWarranty} onOpenChange={setShowWarranty}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs">+ WARRANTY</Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
            <DialogHeader><DialogTitle className="text-white">Add Warranty</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-[10px] font-mono text-zinc-500">ITEM / SYSTEM</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.item_name || ''} onChange={e => setForm({ ...form, item_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] font-mono text-zinc-500">WARRANTY TYPE</Label>
                  <Select value={form.warranty_type || 'manufacturer'} onValueChange={v => setForm({ ...form, warranty_type: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="manufacturer">Manufacturer</SelectItem><SelectItem value="contractor">Contractor</SelectItem><SelectItem value="extended">Extended</SelectItem><SelectItem value="roofing">Roofing</SelectItem><SelectItem value="structural">Structural</SelectItem></SelectContent></Select></div>
                <div><Label className="text-[10px] font-mono text-zinc-500">PROVIDER</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.provider || ''} onChange={e => setForm({ ...form, provider: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] font-mono text-zinc-500">START DATE</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label className="text-[10px] font-mono text-zinc-500">END DATE</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><Label className="text-[10px] font-mono text-zinc-500">TERMS</Label><Textarea className="bg-zinc-800 border-zinc-700 text-white" rows={2} value={form.terms || ''} onChange={e => setForm({ ...form, terms: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" onClick={() => createWarranty.mutate(form)}>Add Warranty</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Progress */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono text-zinc-500">CLOSEOUT PROGRESS</p>
            <Badge className={coData?.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}>{coData?.status || 'not_started'}</Badge>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-3">
            <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-zinc-500 mt-1">{coData?.items_completed || 0} / {coData?.total_items || 0} items complete ({pct}%)</p>
        </CardContent>
      </Card>

      {/* Dashboard Stats */}
      {dashboard?.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">ACTIVE WARRANTIES</p><p className="text-2xl font-bold text-white">{dashboard.data.active_count || 0}</p></CardContent></Card>
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">EXPIRING SOON</p><p className="text-2xl font-bold text-yellow-400">{dashboard.data.expiring_soon?.length || 0}</p></CardContent></Card>
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">OPEN CLAIMS</p><p className="text-2xl font-bold text-red-400">{dashboard.data.open_claims?.length || 0}</p></CardContent></Card>
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">TOTAL WARRANTIES</p><p className="text-2xl font-bold text-white">{warranties?.data?.length || 0}</p></CardContent></Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="checklist" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">CHECKLIST ({items?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="warranties" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">WARRANTIES ({warranties?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="claims" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">CLAIMS</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-4 space-y-2">
          {(items?.data || []).map((item: any) => (
            <Card key={item.id} className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    className={`w-5 h-5 rounded border flex items-center justify-center ${item.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-zinc-600'}`}
                    onClick={() => updateItem.mutate({ id: item.id, data: { status: item.status === 'completed' ? 'not_started' : 'completed' } })}
                  >
                    {item.status === 'completed' && <span className="text-white text-xs">✓</span>}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${item.status === 'completed' ? 'text-zinc-500 line-through' : 'text-white'}`}>{item.item_name}</p>
                      <Badge className={ITEM_STATUS[item.status] || ''}>{item.status?.replace(/_/g, ' ')}</Badge>
                      {item.category && <Badge variant="outline" className="border-zinc-700 text-zinc-400">{item.category}</Badge>}
                    </div>
                    {item.description && <p className="text-xs text-zinc-500">{item.description}</p>}
                    {item.due_date && <p className="text-xs text-zinc-500">Due: {new Date(item.due_date).toLocaleDateString()}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!items?.data?.length && <p className="text-center text-zinc-500 py-8 text-sm">No closeout items — closeout record will be auto-created</p>}
        </TabsContent>

        <TabsContent value="warranties" className="mt-4 space-y-2">
          {(warranties?.data || []).map((w: any) => {
            const days = w.end_date ? daysUntil(w.end_date) : null;
            const expiring = days !== null && days <= 90 && days > 0;
            const expired = days !== null && days <= 0;
            return (
              <Card key={w.id} className="bg-zinc-900/80 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-amber-500">{w.warranty_number}</span>
                        <Badge className={w.status === 'active' ? 'bg-green-500/20 text-green-400' : w.status === 'expired' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-500/20 text-zinc-400'}>{w.status}</Badge>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400">{w.warranty_type}</Badge>
                        {expiring && <Badge className="bg-yellow-500/20 text-yellow-400">Expires in {days}d</Badge>}
                        {expired && <Badge className="bg-red-500/20 text-red-400">EXPIRED</Badge>}
                      </div>
                      <p className="text-sm text-white font-medium">{w.item_name}</p>
                      <p className="text-xs text-zinc-500">{w.provider} • {new Date(w.start_date).toLocaleDateString()} — {new Date(w.end_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!warranties?.data?.length && <p className="text-center text-zinc-500 py-8 text-sm">No warranties registered</p>}
        </TabsContent>

        <TabsContent value="claims" className="mt-4 space-y-2">
          {(dashboard?.data?.open_claims || []).map((c: any) => (
            <Card key={c.id} className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-amber-500">{c.claim_number}</span>
                      <Badge className={CLAIM_STATUS[c.status] || ''}>{c.status}</Badge>
                    </div>
                    <p className="text-sm text-white">{c.description}</p>
                    <p className="text-xs text-zinc-500">{c.item_name} • Filed: {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!dashboard?.data?.open_claims?.length && <p className="text-center text-zinc-500 py-8 text-sm">No warranty claims</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
