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

const PSTATUS: Record<string, string> = { draft: 'bg-zinc-500/20 text-zinc-400', published: 'bg-blue-500/20 text-blue-400', under_review: 'bg-yellow-500/20 text-yellow-400', awarded: 'bg-green-500/20 text-green-400', cancelled: 'bg-red-500/20 text-red-400' };
const BSTATUS: Record<string, string> = { submitted: 'bg-blue-500/20 text-blue-400', under_review: 'bg-yellow-500/20 text-yellow-400', shortlisted: 'bg-purple-500/20 text-purple-400', awarded: 'bg-green-500/20 text-green-400', rejected: 'bg-red-500/20 text-red-400', withdrawn: 'bg-zinc-500/20 text-zinc-400' };

export default function BiddingPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('packages');
  const [showCreate, setShowCreate] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [vf, setVf] = useState<any>({});

  const { data: packages } = useQuery({
    queryKey: ['bid-packages', projectId],
    queryFn: () => authedFetch(`/api/projects/${projectId}/bid-packages`).then(r => r.json()),
    enabled: !!projectId,
  });
  const { data: bids } = useQuery({
    queryKey: ['bids', selectedPkg],
    queryFn: () => authedFetch(`/api/bid-packages/${selectedPkg}/bids`).then(r => r.json()),
    enabled: !!selectedPkg,
  });
  const { data: compare } = useQuery({
    queryKey: ['bid-compare', selectedPkg],
    queryFn: () => authedFetch(`/api/bid-packages/${selectedPkg}/compare`).then(r => r.json()),
    enabled: !!selectedPkg,
  });
  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => authedFetch('/api/vendors').then(r => r.json()),
  });

  const createPkg = useMutation({
    mutationFn: (data: any) => authedFetch(`/api/projects/${projectId}/bid-packages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bid-packages'] }); setShowCreate(false); setForm({}); toast({ title: 'Bid package created' }); },
  });
  const createVendor = useMutation({
    mutationFn: (data: any) => authedFetch('/api/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setShowVendor(false); setVf({}); toast({ title: 'Vendor registered' }); },
  });

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">BIDDING & PROCUREMENT</h1>
          <p className="text-[10px] font-mono text-zinc-500">BID PACKAGES • VENDOR PREQUALIFICATION • COMPARISON</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showVendor} onOpenChange={setShowVendor}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs">+ VENDOR</Button></DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
              <DialogHeader><DialogTitle className="text-white">Register Vendor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">COMPANY NAME</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={vf.company_name || ''} onChange={e => setVf({ ...vf, company_name: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">CONTACT PERSON</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={vf.contact_person || ''} onChange={e => setVf({ ...vf, contact_person: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">EMAIL</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={vf.email || ''} onChange={e => setVf({ ...vf, email: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">PHONE</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={vf.phone || ''} onChange={e => setVf({ ...vf, phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">TRADE CATEGORY</Label>
                    <Select value={vf.trade_category || 'general'} onValueChange={v => setVf({ ...vf, trade_category: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="general">General</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="plumbing">Plumbing</SelectItem><SelectItem value="hvac">HVAC</SelectItem><SelectItem value="concrete">Concrete</SelectItem><SelectItem value="steel">Steel</SelectItem><SelectItem value="roofing">Roofing</SelectItem><SelectItem value="painting">Painting</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">LICENSE #</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={vf.license_number || ''} onChange={e => setVf({ ...vf, license_number: e.target.value })} /></div>
                </div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => createVendor.mutate(vf)}>Register Vendor</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white text-xs">+ BID PACKAGE</Button></DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
              <DialogHeader><DialogTitle className="text-white">Create Bid Package</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-[10px] font-mono text-zinc-500">TITLE</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">TRADE CATEGORY</Label>
                    <Select value={form.trade_category || 'general'} onValueChange={v => setForm({ ...form, trade_category: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="general">General</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="plumbing">Plumbing</SelectItem><SelectItem value="hvac">HVAC</SelectItem><SelectItem value="concrete">Concrete</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">ESTIMATED VALUE</Label><Input type="number" className="bg-zinc-800 border-zinc-700 text-white" value={form.estimated_value || ''} onChange={e => setForm({ ...form, estimated_value: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-zinc-500">BID DUE DATE</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={form.bid_due_date || ''} onChange={e => setForm({ ...form, bid_due_date: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-zinc-500">PRE-BID MEETING</Label><Input type="datetime-local" className="bg-zinc-800 border-zinc-700 text-white" value={form.pre_bid_meeting_date || ''} onChange={e => setForm({ ...form, pre_bid_meeting_date: e.target.value })} /></div>
                </div>
                <div><Label className="text-[10px] font-mono text-zinc-500">SCOPE OF WORK</Label><Textarea className="bg-zinc-800 border-zinc-700 text-white" rows={3} value={form.scope_of_work || ''} onChange={e => setForm({ ...form, scope_of_work: e.target.value })} /></div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => createPkg.mutate(form)}>Create Package</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="packages" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">PACKAGES ({packages?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="compare" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">COMPARE</TabsTrigger>
          <TabsTrigger value="vendors" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">VENDORS ({vendors?.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="mt-4 space-y-2">
          {(packages?.data || []).map((pkg: any) => (
            <Card key={pkg.id} className={`bg-zinc-900/80 border-zinc-800 cursor-pointer ${selectedPkg === pkg.id ? 'ring-1 ring-amber-500' : ''}`} onClick={() => setSelectedPkg(pkg.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-amber-500">{pkg.package_number}</span>
                      <Badge className={PSTATUS[pkg.status] || ''}>{pkg.status?.replace(/_/g, ' ')}</Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400">{pkg.trade_category}</Badge>
                    </div>
                    <p className="text-sm text-white font-medium">{pkg.title}</p>
                    <p className="text-xs text-zinc-500">Due: {pkg.bid_due_date ? new Date(pkg.bid_due_date).toLocaleDateString('en-GB') : 'TBD'} • Bids: {pkg.bid_count || 0}{pkg.estimated_value ? ` • Est: $${parseFloat(pkg.estimated_value).toLocaleString()}` : ''}</p>
                  </div>
                </div>
                {selectedPkg === pkg.id && bids?.data?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                    <p className="text-[10px] font-mono text-zinc-500">SUBMITTED BIDS</p>
                    {bids.data.map((bid: any) => (
                      <div key={bid.id} className="flex items-center justify-between py-1.5 px-3 bg-zinc-800/50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white">{bid.vendor_name || bid.company_name || 'Unknown'}</span>
                          <Badge className={BSTATUS[bid.status] || ''}>{bid.status}</Badge>
                        </div>
                        <span className="text-sm font-mono text-green-400">${parseFloat(bid.total_amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!packages?.data?.length && <p className="text-center text-zinc-500 py-8 text-sm">No bid packages yet</p>}
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          {selectedPkg && compare?.data ? (
            <Card className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-4">
                <p className="text-[10px] font-mono text-zinc-500 mb-3">BID COMPARISON MATRIX — {compare.data.package?.title}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-500 py-2 px-2">Vendor</th>
                      <th className="text-right text-zinc-500 py-2 px-2">Amount</th>
                      <th className="text-right text-zinc-500 py-2 px-2">Timeline</th>
                      <th className="text-center text-zinc-500 py-2 px-2">Score</th>
                      <th className="text-center text-zinc-500 py-2 px-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {(compare.data.bids || []).map((b: any, i: number) => (
                        <tr key={b.id} className={`border-b border-zinc-800/50 ${i === 0 ? 'bg-green-500/5' : ''}`}>
                          <td className="py-2 px-2 text-white">{b.vendor_name || b.company_name}</td>
                          <td className="py-2 px-2 text-right font-mono text-green-400">${parseFloat(b.total_amount || 0).toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-zinc-400">{b.proposed_timeline || '—'} days</td>
                          <td className="py-2 px-2 text-center"><Badge variant="outline" className="border-zinc-700">{b.technical_score || '—'}</Badge></td>
                          <td className="py-2 px-2 text-center"><Badge className={BSTATUS[b.status] || ''}>{b.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-center text-zinc-500 py-8 text-sm">{selectedPkg ? 'No bids to compare' : 'Select a bid package to compare bids'}</p>
          )}
        </TabsContent>

        <TabsContent value="vendors" className="mt-4 space-y-2">
          {(vendors?.data || []).map((v: any) => (
            <Card key={v.id} className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{v.company_name}</p>
                    <Badge className={v.prequalification_status === 'approved' ? 'bg-green-500/20 text-green-400' : v.prequalification_status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}>{v.prequalification_status}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">{v.trade_category}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500">{v.contact_person} • {v.email} • {v.phone}</p>
                  {v.safety_rating && <p className="text-xs text-zinc-500">Safety: {v.safety_rating}/5 • Quality: {v.quality_rating || '?'}/5</p>}
                </div>
                {v.prequalification_status === 'pending' && (
                  <Button size="sm" variant="outline" className="text-xs border-green-500/50 text-green-400">Approve</Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!vendors?.data?.length && <p className="text-center text-zinc-500 py-8 text-sm">No registered vendors</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
