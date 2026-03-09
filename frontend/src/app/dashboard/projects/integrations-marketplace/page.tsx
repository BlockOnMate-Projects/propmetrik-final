'use client';

import { useState } from 'react';
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

const STATUS_COLORS: Record<string, string> = { active: 'bg-green-500/20 text-green-400', inactive: 'bg-zinc-500/20 text-zinc-400', error: 'bg-red-500/20 text-red-400', pending: 'bg-yellow-500/20 text-yellow-400' };

const CATALOG = [
  { type: 'quickbooks', name: 'QuickBooks', desc: 'Accounting & financial management', cat: 'accounting' },
  { type: 'xero', name: 'Xero', desc: 'Cloud accounting platform', cat: 'accounting' },
  { type: 'sage', name: 'Sage 300 CRE', desc: 'Construction accounting', cat: 'accounting' },
  { type: 'procore', name: 'Procore', desc: 'Construction management platform', cat: 'project_management' },
  { type: 'autodesk', name: 'Autodesk BIM 360', desc: 'BIM & document management', cat: 'document_management' },
  { type: 'docusign', name: 'DocuSign', desc: 'Electronic signature', cat: 'document_management' },
  { type: 'zapier', name: 'Zapier', desc: 'Workflow automation', cat: 'automation' },
  { type: 'webhook', name: 'Webhook', desc: 'Custom webhook integration', cat: 'custom' },
  { type: 'custom_api', name: 'Custom API', desc: 'Custom REST API integration', cat: 'custom' },
  { type: 'slack', name: 'Slack', desc: 'Team messaging', cat: 'communication' },
  { type: 'ms_teams', name: 'Microsoft Teams', desc: 'Team collaboration', cat: 'communication' },
  { type: 'google_drive', name: 'Google Drive', desc: 'Cloud file storage', cat: 'storage' },
];

export default function IntegrationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('marketplace');
  const [showConnect, setShowConnect] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [akf, setAkf] = useState<any>({});
  const [newKey, setNewKey] = useState('');

  const { data: integrations } = useQuery({
    queryKey: ['app-integrations'],
    queryFn: () => authedFetch('/api/app-integrations').then(r => r.json()),
  });
  const { data: apiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => authedFetch('/api/api-keys').then(r => r.json()),
  });

  const createIntegration = useMutation({
    mutationFn: (data: any) => authedFetch('/api/app-integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['app-integrations'] }); setShowConnect(false); setForm({}); setSelectedType(null); toast({ title: 'Integration connected' }); },
  });

  const testIntegration = useMutation({
    mutationFn: (id: string) => authedFetch(`/api/app-integrations/${id}/test`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => toast({ title: data.data?.status === 'success' ? 'Connection successful' : 'Connection failed', variant: data.data?.status === 'success' ? 'default' : 'destructive' }),
  });

  const syncIntegration = useMutation({
    mutationFn: (id: string) => authedFetch(`/api/app-integrations/${id}/sync`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['app-integrations'] }); toast({ title: 'Sync triggered' }); },
  });

  const createApiKey = useMutation({
    mutationFn: (data: any) => authedFetch('/api/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['api-keys'] }); setShowApiKey(false); setAkf({}); setNewKey(data.data?.api_key || ''); toast({ title: 'API key created' }); },
  });

  const revokeApiKey = useMutation({
    mutationFn: (id: string) => authedFetch(`/api/api-keys/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast({ title: 'API key revoked' }); },
  });

  const connectedTypes = new Set((integrations?.data || []).map((i: any) => i.integration_type));

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">INTEGRATIONS</h1>
          <p className="text-[10px] font-mono text-zinc-500">MARKETPLACE • CONNECTIONS • API KEYS</p>
        </div>
        <Dialog open={showApiKey} onOpenChange={setShowApiKey}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs">+ API KEY</Button></DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
            <DialogHeader><DialogTitle className="text-white">Create API Key</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-[10px] font-mono text-zinc-500">KEY NAME</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={akf.name || ''} onChange={e => setAkf({ ...akf, name: e.target.value })} /></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">PERMISSIONS</Label>
                <Select value={akf.permissions || 'read'} onValueChange={v => setAkf({ ...akf, permissions: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="read">Read Only</SelectItem><SelectItem value="read_write">Read & Write</SelectItem><SelectItem value="full">Full Access</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[10px] font-mono text-zinc-500">EXPIRES (OPTIONAL)</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={akf.expires_at || ''} onChange={e => setAkf({ ...akf, expires_at: e.target.value })} /></div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" onClick={() => createApiKey.mutate(akf)}>Create Key</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* New key alert */}
      {newKey && (
        <Card className="bg-green-900/20 border-green-800">
          <CardContent className="p-4">
            <p className="text-xs text-green-400 mb-2">API key created. Copy it now — it won't be shown again:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-green-300 bg-green-900/30 px-3 py-1.5 rounded flex-1 break-all">{newKey}</code>
              <Button size="sm" variant="outline" className="border-green-700 text-green-300 text-xs shrink-0" onClick={() => { navigator.clipboard.writeText(newKey); toast({ title: 'Copied' }); }}>Copy</Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400 text-xs shrink-0" onClick={() => setNewKey('')}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="marketplace" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">MARKETPLACE ({CATALOG.length})</TabsTrigger>
          <TabsTrigger value="connected" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">CONNECTED ({integrations?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="api-keys" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">API KEYS ({apiKeys?.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATALOG.map(app => {
              const connected = connectedTypes.has(app.type);
              return (
                <Card key={app.type} className="bg-zinc-900/80 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-white">{app.name}</h3>
                      {connected ? <Badge className="bg-green-500/20 text-green-400">Connected</Badge> : <Badge variant="outline" className="border-zinc-700 text-zinc-400">{app.cat}</Badge>}
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">{app.desc}</p>
                    {!connected ? (
                      <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black text-xs" onClick={() => { setSelectedType(app); setForm({ name: app.name, integration_type: app.type }); setShowConnect(true); }}>Connect</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full border-zinc-700 text-zinc-300 text-xs">Manage</Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="connected" className="mt-4 space-y-2">
          {(integrations?.data || []).map((ig: any) => (
            <Card key={ig.id} className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{ig.name}</p>
                    <Badge className={STATUS_COLORS[ig.status] || ''}>{ig.status}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">{ig.integration_type}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500">{ig.last_sync_at ? `Last sync: ${new Date(ig.last_sync_at).toLocaleString()}` : 'Never synced'}{ig.sync_frequency ? ` • ${ig.sync_frequency}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs" onClick={() => testIntegration.mutate(ig.id)}>Test</Button>
                  <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-400 text-xs" onClick={() => syncIntegration.mutate(ig.id)}>Sync</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!integrations?.data?.length && <p className="text-center text-zinc-500 py-8 text-sm">No integrations connected</p>}
        </TabsContent>

        <TabsContent value="api-keys" className="mt-4 space-y-2">
          {(apiKeys?.data || []).map((k: any) => (
            <Card key={k.id} className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{k.name}</p>
                    <Badge className={k.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>{k.is_active ? 'Active' : 'Revoked'}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">{k.permissions}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500">Prefix: {k.key_prefix}... • Created: {new Date(k.created_at).toLocaleDateString()}{k.expires_at ? ` • Expires: ${new Date(k.expires_at).toLocaleDateString()}` : ''}{k.last_used_at ? ` • Last used: ${new Date(k.last_used_at).toLocaleString()}` : ''}</p>
                </div>
                {k.is_active && (
                  <Button size="sm" variant="outline" className="border-red-500/50 text-red-400 text-xs" onClick={() => revokeApiKey.mutate(k.id)}>Revoke</Button>
                )}
              </CardContent>
            </Card>
          ))}
          {!apiKeys?.data?.length && <p className="text-center text-zinc-500 py-8 text-sm">No API keys</p>}
        </TabsContent>
      </Tabs>

      {/* Connect dialog */}
      <Dialog open={showConnect} onOpenChange={setShowConnect}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader><DialogTitle className="text-white">Connect {selectedType?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-[10px] font-mono text-zinc-500">DISPLAY NAME</Label><Input className="bg-zinc-800 border-zinc-700 text-white" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            {(selectedType?.type === 'webhook' || selectedType?.type === 'custom_api') && (
              <div><Label className="text-[10px] font-mono text-zinc-500">ENDPOINT URL</Label><Input className="bg-zinc-800 border-zinc-700 text-white" placeholder="https://..." value={form.endpoint_url || ''} onChange={e => setForm({ ...form, endpoint_url: e.target.value })} /></div>
            )}
            <div><Label className="text-[10px] font-mono text-zinc-500">SYNC FREQUENCY</Label>
              <Select value={form.sync_frequency || 'manual'} onValueChange={v => setForm({ ...form, sync_frequency: v })}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="manual">Manual</SelectItem><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div>
            <div><Label className="text-[10px] font-mono text-zinc-500">NOTES</Label><Textarea className="bg-zinc-800 border-zinc-700 text-white" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" onClick={() => createIntegration.mutate(form)}>Connect Integration</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
