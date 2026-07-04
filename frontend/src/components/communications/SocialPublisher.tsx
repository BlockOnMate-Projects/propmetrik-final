'use client';

/**
 * Social publishing surface for ONE platform (TikTok / Facebook / Instagram), used inside the
 * Communications hub's "Social" tab. Mirrors the Mail tab's shape: a connection badge, a compose
 * action, and a scrollable history — except here "compose" publishes a property listing (the
 * capability we built) and the history is the org's recent posts to that platform.
 *
 * It reuses the exact backend pipeline the property-page share buttons use:
 *   getConnections → getCreatorInfo (TikTok) / testIntegration (Meta) → shareListing → getShareStatus.
 * The only new piece over the property-scoped buttons is a property PICKER, since the central hub
 * has no property in context.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Send, RefreshCw, Plug, Loader2, Search, ExternalLink, ImageIcon, X, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProviderLogo } from '@/components/integrations/ProviderLogo';
import { cn } from '@/lib/utils';
import {
  getConnections, getCreatorInfo, testIntegration, shareListing, getShareStatus, getPosts,
  type CreatorInfo, type TikTokPrivacy, type SocialPost,
} from '@/lib/integrations-api';
import { propertyManagementApi } from '@/lib/property-management-api';
import type { Property, PaginatedResponse } from '@/types/property-management';

export type SocialPlatform = 'tiktok' | 'facebook' | 'instagram';

const META: Record<SocialPlatform, { label: string; emoji: string }> = {
  tiktok: { label: 'TikTok', emoji: '🎵' },
  facebook: { label: 'Facebook', emoji: '📘' },
  instagram: { label: 'Instagram', emoji: '📸' },
};

const PRIVACY_LABEL: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: 'Public — everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends (mutual follow)',
  FOLLOWER_OF_CREATOR: 'Followers only',
  SELF_ONLY: 'Only me (private)',
};

const INTEGRATIONS_PATH: Record<string, string> = {
  deals: '/dashboard/deals/integrations',
  'property-management': '/dashboard/property-management/integrations',
  projects: '/dashboard/projects/integrations-marketplace',
};

function relTime(dateStr: string): string {
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d`;
  return new Date(dateStr).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

function normalizeProperties(res: Property[] | PaginatedResponse<Property>): Property[] {
  return Array.isArray(res) ? res : res.data;
}

export function SocialPublisher({ platform, service = 'property-management' }: {
  platform: SocialPlatform;
  service?: 'deals' | 'property-management' | 'projects';
}) {
  const { label, emoji } = META[platform];
  const [connected, setConnected] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const conns = await getConnections();
      const isConn = !!conns[platform];
      setConnected(isConn);
      if (!isConn) return;
      // Identity + (TikTok) allowed privacy levels.
      if (platform === 'tiktok') {
        const info = await getCreatorInfo('tiktok').catch(() => null);
        setCreator(info);
        setAccount(info ? `@${info.creatorUsername}` : null);
      } else {
        const t = await testIntegration(platform).catch(() => null);
        setAccount(t?.detail?.replace(/^Connected to (Page: )?/, '') || null);
      }
      const rows = await getPosts(platform).catch(() => []);
      setPosts(rows);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => { load(); }, [load]);

  if (loading && connected === null) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (connected === false) {
    return (
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="py-4 flex items-center gap-3">
          <Plug className="h-5 w-5 text-amber-500" />
          <div className="flex-1">
            <p className="font-medium text-amber-600 dark:text-amber-400">{label} isn't connected</p>
            <p className="text-sm text-muted-foreground">Connect {label} to publish your listings from here.</p>
          </div>
          <Link href={INTEGRATIONS_PATH[service] || '/dashboard/property-management/integrations'}>
            <Button size="sm" variant="outline">Go to Integrations</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30 gap-1.5">
            <ProviderLogo type={platform} emoji={emoji} size={14} /> {label}{account ? ` · ${account}` : ''}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCompose(true)}>
            <Send className="h-4 w-4 mr-2" /> New post
          </Button>
        </div>
      </div>

      {/* Post history */}
      <Card className="flex-1 flex flex-col min-h-0">
        <div className="p-3 border-b border-border text-sm font-medium text-muted-foreground">Recent posts</div>
        <ScrollArea className="flex-1">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-6">
              <ImageIcon className="h-12 w-12 mb-2 opacity-40" />
              <p className="font-medium">No posts yet</p>
              <p className="text-sm">Click "New post" to publish a property listing to {label}.</p>
            </div>
          ) : posts.map((p) => (
            <div key={p.id} className="flex items-start gap-3 p-3 border-b border-border">
              <div className="mt-0.5"><ProviderLogo type={platform} emoji={emoji} size={20} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{p.property_title || 'Property listing'}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{relTime(p.created_at)}</span>
                </div>
                {p.caption && <p className="text-sm text-muted-foreground truncate">{p.caption}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <PostStatusBadge status={p.status} />
                  <span className="text-[11px] text-muted-foreground">{p.media_count} image{p.media_count === 1 ? '' : 's'}</span>
                  {p.post_url && (
                    <a href={p.post_url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline">
                      <ExternalLink className="h-3 w-3" /> View
                    </a>
                  )}
                </div>
                {p.error && <p className="text-[11px] text-red-500 mt-0.5">{p.error}</p>}
              </div>
            </div>
          ))}
        </ScrollArea>
      </Card>

      <ComposeDialog
        open={compose}
        onClose={() => setCompose(false)}
        platform={platform}
        creator={creator}
        onPublished={() => { setCompose(false); load(); }}
      />
    </div>
  );
}

function PostStatusBadge({ status }: { status: string }) {
  const ok = status === 'published';
  const failed = status === 'failed';
  return (
    <Badge variant="outline" className={cn('text-[10px] gap-1',
      ok ? 'text-green-600 dark:text-green-400 border-green-500/30'
        : failed ? 'text-red-500 border-red-500/30'
          : 'text-amber-500 border-amber-500/30')}>
      {ok && <CheckCircle2 className="h-3 w-3" />}{status}
    </Badge>
  );
}

function ComposeDialog({ open, onClose, platform, creator, onPublished }: {
  open: boolean; onClose: () => void; platform: SocialPlatform; creator: CreatorInfo | null; onPublished: () => void;
}) {
  const { label } = META[platform];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Property[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<TikTokPrivacy | ''>('');
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset each open; default TikTok privacy to the most private option allowed (unaudited apps).
  useEffect(() => {
    if (!open) return;
    setQuery(''); setResults([]); setSelected(null); setCaption(''); setStatus(null); setError(null);
    if (platform === 'tiktok' && creator) {
      const order: TikTokPrivacy[] = ['SELF_ONLY', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'];
      setPrivacy(order.find(p => creator.privacyOptions.includes(p)) || creator.privacyOptions[0] || '');
    } else {
      setPrivacy('');
    }
  }, [open, platform, creator]);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await propertyManagementApi.getProperties({ searchTerm: q || undefined, limit: 20 });
      setResults(normalizeProperties(res));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { if (open && !selected) search(''); }, [open, selected, search]);

  async function publish() {
    if (!selected) return;
    setPosting(true); setError(null); setStatus('Publishing…');
    try {
      const r = await shareListing(platform, {
        propertyId: selected.id,
        caption: caption.trim() || undefined,
        ...(platform === 'tiktok' && privacy ? { privacy } : {}),
      });
      // TikTok photo posts finalise async — poll a few times. Meta publishes synchronously.
      let final = r.status;
      if (platform === 'tiktok') {
        for (let i = 0; i < 6 && final === 'processing'; i++) {
          await new Promise(res => setTimeout(res, 2500));
          const s = await getShareStatus('tiktok', r.publishId).catch(() => null);
          if (s) { final = s.status; if (s.status !== 'processing') break; }
        }
      }
      if (final === 'failed') {
        setStatus(null);
        setError(`${label} rejected the post — check media / domain verification.`);
      } else {
        setStatus(`Published to ${label} ✓ (${r.mediaCount} image${r.mediaCount === 1 ? '' : 's'})`);
        setTimeout(onPublished, 900);
      }
    } catch (e: any) {
      setStatus(null);
      setError(e?.message || 'Publishing failed');
    } finally {
      setPosting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <ProviderLogo type={platform} emoji={META[platform].emoji} size={22} /> New {label} post
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Step 1 — pick the listing */}
          {!selected ? (
            <div className="space-y-2">
              <Label className="text-[10px] font-mono text-muted-foreground">CHOOSE A PROPERTY LISTING</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 bg-muted border-border" placeholder="Search properties…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') search(query); }} />
              </div>
              <ScrollArea className="h-64 rounded-md border border-border">
                {searching ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">No properties found.</div>
                ) : results.map((p) => (
                  <button key={p.id} onClick={() => setSelected(p)}
                    className="w-full text-left flex items-center gap-3 p-3 border-b border-border hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[p.addressCity, p.region].filter(Boolean).join(', ')} · {p.referenceNumber}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize text-[10px]">{p.status}</Badge>
                  </button>
                ))}
              </ScrollArea>
            </div>
          ) : (
            <>
              {/* Selected listing */}
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selected.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[selected.addressCity, selected.region].filter(Boolean).join(', ')} · {selected.referenceNumber}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><X className="h-4 w-4 mr-1" /> Change</Button>
              </div>

              {/* Step 2 — caption */}
              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">CAPTION <span className="opacity-60">(optional — auto-generated if blank)</span></Label>
                <Textarea className="bg-muted border-border text-foreground" rows={4} value={caption}
                  onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption for this listing…" />
              </div>

              {/* Step 3 (TikTok only) — privacy */}
              {platform === 'tiktok' && creator && (
                <div>
                  <Label className="text-[10px] font-mono text-muted-foreground">WHO CAN SEE THIS</Label>
                  <Select value={privacy} onValueChange={(v) => setPrivacy(v as TikTokPrivacy)}>
                    <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue placeholder="Select privacy" /></SelectTrigger>
                    <SelectContent className="bg-muted border-border">
                      {creator.privacyOptions.map(p => <SelectItem key={p} value={p}>{PRIVACY_LABEL[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {creator.privacyOptions.length === 1 && creator.privacyOptions[0] === 'SELF_ONLY' && (
                    <p className="text-[10px] text-muted-foreground mt-1">Your TikTok app is unaudited, so posts can only be private for now.</p>
                  )}
                </div>
              )}

              {status && <p className="text-xs text-foreground flex items-center gap-1.5">{posting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{status}</p>}
              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-400">
                  <p className="font-semibold">Couldn't post</p>
                  <p className="mt-0.5 break-words">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={onClose} disabled={posting}>Cancel</Button>
                <Button onClick={publish} disabled={posting || (platform === 'tiktok' && !privacy)}>
                  {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Publish to {label}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Uses the property's approved photos.{' '}
                {platform === 'instagram' && 'Your IG must be a Business account linked to a Facebook Page. '}
                The media host domain must be verified in your {label} app.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SocialPublisher;
