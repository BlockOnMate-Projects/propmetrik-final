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

const PSTATUS: Record<string, string> = { draft: 'bg-zinc-500/20 text-muted-foreground', published: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', under_review: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', awarded: 'bg-green-500/20 text-green-600 dark:text-green-400', cancelled: 'bg-red-500/20 text-red-600 dark:text-red-400' };
const BSTATUS: Record<string, string> = { submitted: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', under_review: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', shortlisted: 'bg-purple-500/20 text-purple-600 dark:text-purple-400', awarded: 'bg-green-500/20 text-green-600 dark:text-green-400', rejected: 'bg-red-500/20 text-red-600 dark:text-red-400', withdrawn: 'bg-zinc-500/20 text-muted-foreground' };

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
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">BIDDING & PROCUREMENT</h1>
          <p className="text-[10px] font-mono text-muted-foreground">BID PACKAGES • VENDOR PREQUALIFICATION • COMPARISON</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showVendor} onOpenChange={setShowVendor}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="border-border text-muted-foreground text-xs">+ VENDOR</Button></DialogTrigger>
            <DialogContent className="bg-card border-border max-w-lg">
              <DialogHeader><DialogTitle className="text-foreground">Register Vendor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">COMPANY NAME</Label><Input className="bg-muted border-border text-foreground" value={vf.company_name || ''} onChange={e => setVf({ ...vf, company_name: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">CONTACT PERSON</Label><Input className="bg-muted border-border text-foreground" value={vf.contact_person || ''} onChange={e => setVf({ ...vf, contact_person: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">EMAIL</Label><Input className="bg-muted border-border text-foreground" value={vf.email || ''} onChange={e => setVf({ ...vf, email: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">PHONE</Label><Input className="bg-muted border-border text-foreground" value={vf.phone || ''} onChange={e => setVf({ ...vf, phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">TRADE CATEGORY</Label>
                    <Select value={vf.trade_category || 'general'} onValueChange={v => setVf({ ...vf, trade_category: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="general">General</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="plumbing">Plumbing</SelectItem><SelectItem value="hvac">HVAC</SelectItem><SelectItem value="concrete">Concrete</SelectItem><SelectItem value="steel">Steel</SelectItem><SelectItem value="roofing">Roofing</SelectItem><SelectItem value="painting">Painting</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">LICENSE #</Label><Input className="bg-muted border-border text-foreground" value={vf.license_number || ''} onChange={e => setVf({ ...vf, license_number: e.target.value })} /></div>
                </div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => createVendor.mutate(vf)}>Register Vendor</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-foreground text-xs">+ BID PACKAGE</Button></DialogTrigger>
            <DialogContent className="bg-card border-border max-w-lg">
              <DialogHeader><DialogTitle className="text-foreground">Create Bid Package</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-[10px] font-mono text-muted-foreground">TITLE</Label><Input className="bg-muted border-border text-foreground" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">TRADE CATEGORY</Label>
                    <Select value={form.trade_category || 'general'} onValueChange={v => setForm({ ...form, trade_category: v })}><SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger><SelectContent className="bg-muted border-border"><SelectItem value="general">General</SelectItem><SelectItem value="electrical">Electrical</SelectItem><SelectItem value="plumbing">Plumbing</SelectItem><SelectItem value="hvac">HVAC</SelectItem><SelectItem value="concrete">Concrete</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">ESTIMATED VALUE</Label><Input type="number" className="bg-muted border-border text-foreground" value={form.estimated_value || ''} onChange={e => setForm({ ...form, estimated_value: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[10px] font-mono text-muted-foreground">BID DUE DATE</Label><Input type="date" className="bg-muted border-border text-foreground" value={form.bid_due_date || ''} onChange={e => setForm({ ...form, bid_due_date: e.target.value })} /></div>
                  <div><Label className="text-[10px] font-mono text-muted-foreground">PRE-BID MEETING</Label><Input type="datetime-local" className="bg-muted border-border text-foreground" value={form.pre_bid_meeting_date || ''} onChange={e => setForm({ ...form, pre_bid_meeting_date: e.target.value })} /></div>
                </div>
                <div><Label className="text-[10px] font-mono text-muted-foreground">SCOPE OF WORK</Label><Textarea className="bg-muted border-border text-foreground" rows={3} value={form.scope_of_work || ''} onChange={e => setForm({ ...form, scope_of_work: e.target.value })} /></div>
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-foreground" onClick={() => createPkg.mutate(form)}>Create Package</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="packages" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">PACKAGES ({packages?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="compare" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">COMPARE</TabsTrigger>
          <TabsTrigger value="vendors" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">VENDORS ({vendors?.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="mt-4 space-y-2">
          {(packages?.data || []).map((pkg: any) => (
            <Card key={pkg.id} className={`bg-card/80 border-border cursor-pointer ${selectedPkg === pkg.id ? 'ring-1 ring-amber-500' : ''}`} onClick={() => setSelectedPkg(pkg.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-amber-500">{pkg.package_number}</span>
                      <Badge className={PSTATUS[pkg.status] || ''}>{pkg.status?.replace(/_/g, ' ')}</Badge>
                      <Badge variant="outline" className="border-border text-muted-foreground">{pkg.trade_category}</Badge>
                    </div>
                    <p className="text-sm text-foreground font-medium">{pkg.title}</p>
                    <p className="text-xs text-muted-foreground">Due: {pkg.bid_due_date ? new Date(pkg.bid_due_date).toLocaleDateString('en-GB') : 'TBD'} • Bids: {pkg.bid_count || 0}{pkg.estimated_value ? ` • Est: $${parseFloat(pkg.estimated_value).toLocaleString()}` : ''}</p>
                  </div>
                </div>
                {selectedPkg === pkg.id && bids?.data?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <p className="text-[10px] font-mono text-muted-foreground">SUBMITTED BIDS</p>
                    {bids.data.map((bid: any) => (
                      <div key={bid.id} className="flex items-center justify-between py-1.5 px-3 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground">{bid.vendor_name || bid.company_name || 'Unknown'}</span>
                          <Badge className={BSTATUS[bid.status] || ''}>{bid.status}</Badge>
                        </div>
                        <span className="text-sm font-mono text-green-600 dark:text-green-400">${parseFloat(bid.total_amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!packages?.data?.length && <p className="text-center text-muted-foreground py-8 text-sm">No bid packages yet</p>}
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          {selectedPkg && compare?.data ? (
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <p className="text-[10px] font-mono text-muted-foreground mb-3">BID COMPARISON MATRIX — {compare.data.package?.title}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border">
                      <th className="text-left text-muted-foreground py-2 px-2">Vendor</th>
                      <th className="text-right text-muted-foreground py-2 px-2">Amount</th>
                      <th className="text-right text-muted-foreground py-2 px-2">Timeline</th>
                      <th className="text-center text-muted-foreground py-2 px-2">Score</th>
                      <th className="text-center text-muted-foreground py-2 px-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {(compare.data.bids || []).map((b: any, i: number) => (
                        <tr key={b.id} className={`border-b border-border/50 ${i === 0 ? 'bg-green-500/5' : ''}`}>
                          <td className="py-2 px-2 text-foreground">{b.vendor_name || b.company_name}</td>
                          <td className="py-2 px-2 text-right font-mono text-green-600 dark:text-green-400">${parseFloat(b.total_amount || 0).toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{b.proposed_timeline || '—'} days</td>
                          <td className="py-2 px-2 text-center"><Badge variant="outline" className="border-border">{b.technical_score || '—'}</Badge></td>
                          <td className="py-2 px-2 text-center"><Badge className={BSTATUS[b.status] || ''}>{b.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-center text-muted-foreground py-8 text-sm">{selectedPkg ? 'No bids to compare' : 'Select a bid package to compare bids'}</p>
          )}
        </TabsContent>

        <TabsContent value="vendors" className="mt-4 space-y-2">
          {(vendors?.data || []).map((v: any) => (
            <Card key={v.id} className="bg-card/80 border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground font-medium">{v.company_name}</p>
                    <Badge className={v.prequalification_status === 'approved' ? 'bg-green-500/20 text-green-600 dark:text-green-400' : v.prequalification_status === 'pending' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}>{v.prequalification_status}</Badge>
                    <Badge variant="outline" className="border-border text-muted-foreground">{v.trade_category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{v.contact_person} • {v.email} • {v.phone}</p>
                  {v.safety_rating && <p className="text-xs text-muted-foreground">Safety: {v.safety_rating}/5 • Quality: {v.quality_rating || '?'}/5</p>}
                </div>
                {v.prequalification_status === 'pending' && (
                  <Button size="sm" variant="outline" className="text-xs border-green-500/50 text-green-600 dark:text-green-400">Approve</Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!vendors?.data?.length && <p className="text-center text-muted-foreground py-8 text-sm">No registered vendors</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
