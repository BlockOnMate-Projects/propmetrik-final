'use client';

/**
 * Shared Integrations Hub — the single UI behind every service's "Integrations" tab.
 * Renders the org-wide provider catalog (from the backend `integrationCatalog`, tagged BYO vs
 * platform per §8A) and drives connect/disconnect for OAuth, API-key and webhook providers.
 *
 * Reused by PM, CRM, Valuation and Projects — pass the `service` prop to scope the catalog.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getIntegrationCatalog, getConnections, connectOAuth, connectApiKey, connectWebhook, connectTwilio,
  disconnectIntegration, testIntegration, syncIntegration, type IntegrationProvider, type ServiceKey,
} from '@/lib/integrations-api';
import { ProviderLogo } from '@/components/integrations/ProviderLogo';

const MODEL_LABEL: Record<string, string> = {
  byo_org: 'Your account', byo_user: 'Your account', platform: 'Managed', hybrid: 'Optional',
};

export function IntegrationsHub({ service, title = 'Integrations' }: { service?: ServiceKey; title?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // Mirror the backend gate (orgIntegrations canManageOrgIntegration): only org leadership + finance
  // may manage ORG-SHARED integrations (QuickBooks/Xero/webhooks/social). Per-user (byo_user) email/
  // calendar/drive is connectable by anyone (their own account). This just hides the buttons — the
  // server-side 403 is the real boundary.
  const ORG_MANAGER_ROLES = ['super_admin', 'admin', 'firm_principal', 'manager', 'finance_manager', 'service_admin'];
  const canManageOrg = useMemo(() => {
    const u = session?.user as any;
    if (!u) return false;
    if (ORG_MANAGER_ROLES.includes(u.role)) return true;
    const csr = u.customerServiceRoles ? Object.values(u.customerServiceRoles) : [];
    return csr.includes('service_admin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const canManage = (p: IntegrationProvider) => p.model === 'byo_user' || canManageOrg;
  const [dialog, setDialog] = useState<IntegrationProvider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookSecret, setHookSecret] = useState('');
  const [twSid, setTwSid] = useState('');
  const [twToken, setTwToken] = useState('');
  const [twFrom, setTwFrom] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Reflect the OAuth callback redirect (?connected=x / ?error=y). Shown as an inline banner
  // (the app has no global Toaster mounted, so a toast alone would be invisible). On success we
  // refresh the connections so the card flips to "Connected" without a manual reload, then strip
  // the one-shot params so a page refresh doesn't replay the banner.
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      setNotice({ kind: 'ok', text: `${connected} is now connected to your account.` });
      qc.invalidateQueries({ queryKey: ['integrations-connections'] });
    } else if (error) {
      setNotice({ kind: 'err', text: error });
    }
    if ((connected || error) && typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data: catalog = [], isLoading: catLoading } = useQuery({
    queryKey: ['integrations-catalog', service ?? 'all'],
    queryFn: () => getIntegrationCatalog(service),
  });
  const { data: connections = {} } = useQuery({
    queryKey: ['integrations-connections'],
    queryFn: getConnections,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations-connections'] });

  const oauthConnect = useMutation({
    mutationFn: (type: string) => connectOAuth(type),
    onSuccess: ({ authUrl }) => { window.location.href = authUrl; },
    onError: (e: any) => toast({
      title: e?.code === 'not_configured' ? 'Requires setup' : 'Could not connect',
      description: e?.message, variant: 'destructive',
    }),
  });

  const keyConnect = useMutation({
    mutationFn: ({ type, key, name }: { type: string; key: string; name: string }) => connectApiKey(type, key, name),
    onSuccess: () => { refresh(); setDialog(null); setApiKey(''); toast({ title: 'Connected' }); },
    onError: (e: any) => toast({ title: 'Could not connect', description: e?.message, variant: 'destructive' }),
  });

  const twilioConnect = useMutation({
    mutationFn: ({ sid, token, from }: { sid: string; token: string; from: string }) => connectTwilio(sid, token, from),
    onSuccess: () => { refresh(); setDialog(null); setTwSid(''); setTwToken(''); setTwFrom(''); toast({ title: 'Twilio connected' }); },
    onError: (e: any) => toast({ title: 'Could not connect', description: e?.message, variant: 'destructive' }),
  });

  const hookConnect = useMutation({
    mutationFn: ({ type, url, secret }: { type: string; url: string; secret?: string }) => connectWebhook(type, url, secret),
    onSuccess: () => { refresh(); setDialog(null); setHookUrl(''); setHookSecret(''); toast({ title: 'Webhook saved' }); },
    onError: (e: any) => toast({ title: 'Could not save', description: e?.message, variant: 'destructive' }),
  });

  const disconnect = useMutation({
    mutationFn: (type: string) => disconnectIntegration(type),
    onSuccess: () => { refresh(); toast({ title: 'Disconnected' }); },
    onError: (e: any) => toast({ title: 'Could not disconnect', description: e?.message, variant: 'destructive' }),
  });

  const test = useMutation({
    mutationFn: (type: string) => testIntegration(type),
    onSuccess: (r) => toast({ title: 'Connection OK', description: r.detail }),
    onError: (e: any) => toast({ title: 'Connection test failed', description: e?.message, variant: 'destructive' }),
  });

  const sync = useMutation({
    mutationFn: (type: string) => syncIntegration(type),
    onSuccess: (r) => {
      refresh();
      const desc = r.errors.length
        ? `${r.synced} synced, ${r.errors.length} failed — ${r.errors[0]}`
        : `${r.synced} approved cost(s) pushed`;
      toast({ title: 'Sync complete', description: desc, variant: r.errors.length ? 'destructive' : 'default' });
    },
    onError: (e: any) => toast({ title: 'Sync failed', description: e?.message, variant: 'destructive' }),
  });

  // Mixed flat list — connectable/available first, platform-managed and coming-soon last.
  const ordered = useMemo(() => {
    const rank = (p: IntegrationProvider) => {
      if (connections[p.type]) return 0;                          // connected
      if (p.connectable && p.configured) return 1;                // ready to connect
      if (p.connectable && !p.configured) return 2;               // requires setup
      if (p.model === 'platform') return 3;                       // managed
      return 4;                                                   // coming soon
    };
    return [...catalog].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, connections]);

  const startConnect = (p: IntegrationProvider) => {
    if (p.auth === 'oauth2') oauthConnect.mutate(p.type);
    else setDialog(p); // api_key / webhook → collect input in dialog
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-foreground">{title.toUpperCase()}</h1>
        <p className="text-[10px] font-mono text-muted-foreground">CONNECT YOUR ACCOUNTS • BRING-YOUR-OWN & PLATFORM SERVICES</p>
      </div>

      {notice && (
        <div className={`relative rounded-md border px-3 py-2.5 text-xs ${notice.kind === 'ok'
          ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
          : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          <button onClick={() => setNotice(null)} className="absolute right-2 top-2 text-sm leading-none opacity-60 hover:opacity-100">✕</button>
          <p className="font-semibold">{notice.kind === 'ok' ? 'Connected' : 'Connection failed'}</p>
          <p className="mt-1 whitespace-pre-wrap break-words pr-5 font-mono text-[11px] leading-relaxed">{notice.text}</p>
        </div>
      )}

      {catLoading && <p className="text-sm text-muted-foreground">Loading integrations…</p>}

      {/* Mixed flat grid — no category grouping. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {ordered.map((p) => {
          const conn = connections[p.type];
          const isConnected = !!conn;
          const needsSetup = p.connectable && !p.configured;
          return (
            <Card key={p.type} className="bg-card/80 border-border">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <ProviderLogo type={p.type} emoji={p.icon} />
                    <div>
                      <h3 className="text-sm font-medium text-foreground leading-tight">{p.name}</h3>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{p.category}</span>
                    </div>
                  </div>
                  {isConnected ? (
                    <Badge className="bg-green-500/20 text-green-600 dark:text-green-400">Connected</Badge>
                  ) : p.status === 'coming_soon' ? (
                    <Badge variant="outline" className="border-amber-800 text-amber-500">Coming soon</Badge>
                  ) : needsSetup ? (
                    <Badge variant="outline" className="border-border text-muted-foreground">Requires setup</Badge>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground">{MODEL_LABEL[p.model] || p.model}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3 flex-1">{p.description}</p>

                {isConnected ? (
                  canManage(p) ? (
                    <div className="flex flex-wrap gap-2">
                      {p.syncable && (
                        <>
                          <Button size="sm" variant="outline" className="border-border text-muted-foreground text-xs"
                            disabled={test.isPending && test.variables === p.type}
                            onClick={() => test.mutate(p.type)}>
                            {test.isPending && test.variables === p.type ? 'Testing…' : 'Test'}
                          </Button>
                          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs"
                            disabled={sync.isPending && sync.variables === p.type}
                            onClick={() => sync.mutate(p.type)}>
                            {sync.isPending && sync.variables === p.type ? 'Syncing…' : 'Sync costs'}
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" className="border-red-500/50 text-red-600 dark:text-red-400 text-xs ml-auto"
                        disabled={disconnect.isPending}
                        onClick={() => disconnect.mutate(p.type)}>
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Connected · managed by an admin</p>
                  )
                ) : p.model === 'platform' ? (
                  <Button size="sm" variant="outline" className="w-full border-border text-muted-foreground text-xs cursor-default" disabled>
                    Managed by PropMetrik
                  </Button>
                ) : p.status === 'coming_soon' || !p.connectable ? (
                  <Button size="sm" variant="outline" className="w-full border-border text-muted-foreground text-xs cursor-not-allowed" disabled>
                    Coming soon
                  </Button>
                ) : needsSetup ? (
                  <Button size="sm" variant="outline" className="w-full border-border text-muted-foreground text-xs cursor-not-allowed" disabled
                    title="An administrator must configure this integration's app credentials first.">
                    Requires setup
                  </Button>
                ) : !canManage(p) ? (
                  <Button size="sm" variant="outline" className="w-full border-border text-muted-foreground text-xs cursor-not-allowed" disabled
                    title="Only organisation admins or finance managers can connect this integration.">
                    Admins only
                  </Button>
                ) : (
                  <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black text-xs"
                    disabled={oauthConnect.isPending}
                    onClick={() => startConnect(p)}>
                    Connect
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* API-key / webhook connect dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle className="text-foreground">Connect {dialog?.name}</DialogTitle></DialogHeader>
          {dialog?.auth === 'api_key' && dialog.type === 'twilio' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Connect your own Twilio account. Find these in your Twilio Console → Account Info. Your Auth Token is encrypted at rest.
              </p>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">ACCOUNT SID</Label>
                <Input className="bg-muted border-border text-foreground" value={twSid}
                  onChange={(e) => setTwSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              </div>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">AUTH TOKEN</Label>
                <Input className="bg-muted border-border text-foreground" type="password" value={twToken}
                  onChange={(e) => setTwToken(e.target.value)} placeholder="Your Twilio Auth Token" />
              </div>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">FROM NUMBER (E.164)</Label>
                <Input className="bg-muted border-border text-foreground" value={twFrom}
                  onChange={(e) => setTwFrom(e.target.value)} placeholder="+14155552671" />
              </div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                disabled={!twSid.trim() || !twToken.trim() || !twFrom.trim() || twilioConnect.isPending}
                onClick={() => twilioConnect.mutate({ sid: twSid.trim(), token: twToken.trim(), from: twFrom.trim() })}>
                {twilioConnect.isPending ? 'Verifying with Twilio…' : 'Connect Twilio'}
              </Button>
            </div>
          )}
          {dialog?.auth === 'api_key' && dialog.type !== 'twilio' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{dialog.description}</p>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">API KEY / TOKEN</Label>
                <Input className="bg-muted border-border text-foreground" type="password" value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your key" />
              </div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                disabled={!apiKey.trim() || keyConnect.isPending}
                onClick={() => dialog && keyConnect.mutate({ type: dialog.type, key: apiKey.trim(), name: dialog.name })}>
                {keyConnect.isPending ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
          )}
          {dialog?.auth === 'webhook' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{dialog.description}</p>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">ENDPOINT URL</Label>
                <Input className="bg-muted border-border text-foreground" value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)} placeholder="https://your-endpoint.example.com/hook" />
              </div>
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">SIGNING SECRET (OPTIONAL)</Label>
                <Input className="bg-muted border-border text-foreground" value={hookSecret}
                  onChange={(e) => setHookSecret(e.target.value)} placeholder="Used to sign event payloads" />
              </div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                disabled={!hookUrl.trim() || hookConnect.isPending}
                onClick={() => dialog && hookConnect.mutate({ type: dialog.type, url: hookUrl.trim(), secret: hookSecret.trim() || undefined })}>
                {hookConnect.isPending ? 'Saving…' : 'Save webhook'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default IntegrationsHub;
