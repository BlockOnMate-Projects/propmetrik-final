'use client';

/**
 * "Share to TikTok" — publishes a property listing to the org's connected TikTok account via the
 * Content Posting API. Self-contained button + dialog: checks the connection, loads creator info
 * (so the user picks a privacy level TikTok actually allows), lets them edit the caption, posts,
 * then polls the publish status.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProviderLogo } from '@/components/integrations/ProviderLogo';
import {
  getConnections, getCreatorInfo, shareListing, getShareStatus,
  type CreatorInfo, type TikTokPrivacy,
} from '@/lib/integrations-api';

const PRIVACY_LABEL: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: 'Public — everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends (mutual follow)',
  FOLLOWER_OF_CREATOR: 'Followers only',
  SELF_ONLY: 'Only me (private)',
};

export function ShareToTikTok({ propertyId, defaultCaption }: { propertyId: string; defaultCaption?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [caption, setCaption] = useState(defaultCaption || '');
  const [privacy, setPrivacy] = useState<TikTokPrivacy | ''>('');
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    setStatus(null);
    setError(null);
    setLoading(true);
    try {
      const conns = await getConnections();
      const isConn = !!conns['tiktok'];
      setConnected(isConn);
      if (isConn) {
        const info = await getCreatorInfo('tiktok');
        setCreator(info);
        // Default to the most private option TikTok allows (required for unaudited apps).
        const order: TikTokPrivacy[] = ['SELF_ONLY', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'];
        setPrivacy(order.find(p => info.privacyOptions.includes(p)) || info.privacyOptions[0] || '');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load TikTok');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }

  async function post() {
    if (!privacy) return;
    setPosting(true);
    setError(null);
    setStatus('Publishing…');
    try {
      const r = await shareListing('tiktok', { propertyId, caption: caption.trim() || undefined, privacy });
      // Poll status a few times (photo posts finalise within seconds).
      let final = r.status;
      for (let i = 0; i < 6 && final === 'processing'; i++) {
        await new Promise(res => setTimeout(res, 2500));
        const s = await getShareStatus('tiktok', r.publishId).catch(() => null);
        if (s) { final = s.status; if (s.status !== 'processing') break; }
      }
      if (final === 'failed') {
        setStatus(null);
        setError('TikTok rejected the post — check media/domain verification.');
      } else {
        setStatus(final === 'published' ? `Published to TikTok ✓ (${r.mediaCount} image${r.mediaCount === 1 ? '' : 's'})` : 'Submitted — finishing on TikTok…');
        toast({ title: 'Shared to TikTok', description: `${r.mediaCount} image(s) sent as a ${PRIVACY_LABEL[privacy]} post.` });
      }
    } catch (e: any) {
      setStatus(null);
      setError(e?.message || 'Share failed');
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="border-border text-foreground text-xs gap-1.5" onClick={openDialog}>
        <ProviderLogo type="tiktok" emoji="🎵" size={18} /> Share to TikTok
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle className="text-foreground flex items-center gap-2"><ProviderLogo type="tiktok" emoji="🎵" size={22} /> Share to TikTok</DialogTitle></DialogHeader>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && connected === false && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">TikTok isn't connected for your organisation yet.</p>
              <Link href="/dashboard/property-management/integrations" className="text-amber-500 text-sm underline">
                Go to Integrations to connect TikTok →
              </Link>
            </div>
          )}

          {!loading && connected && creator && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Posting to <span className="text-foreground font-medium">@{creator.creatorUsername}</span></p>

              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">CAPTION</Label>
                <Textarea className="bg-muted border-border text-foreground" rows={4} value={caption}
                  onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption for this listing…" />
              </div>

              <div>
                <Label className="text-[10px] font-mono text-muted-foreground">WHO CAN SEE THIS</Label>
                <Select value={privacy} onValueChange={(v) => setPrivacy(v as TikTokPrivacy)}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue placeholder="Select privacy" /></SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    {creator.privacyOptions.map(p => (
                      <SelectItem key={p} value={p}>{PRIVACY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {creator.privacyOptions.length === 1 && creator.privacyOptions[0] === 'SELF_ONLY' && (
                  <p className="text-[10px] text-muted-foreground mt-1">Your TikTok app is unaudited, so posts can only be private for now.</p>
                )}
              </div>

              {status && <p className="text-xs text-foreground">{status}</p>}
              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-400">
                  <p className="font-semibold">Couldn't post</p>
                  <p className="mt-0.5 break-words">{error}</p>
                </div>
              )}

              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" disabled={posting || !privacy} onClick={post}>
                {posting ? 'Publishing…' : 'Publish to TikTok'}
              </Button>
              <p className="text-[10px] text-muted-foreground">Uses the property's approved photos. The media host domain must be verified in your TikTok app's URL properties.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ShareToTikTok;
