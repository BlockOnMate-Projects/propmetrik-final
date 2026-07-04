'use client';

/**
 * "Share to Facebook / Instagram" — publishes a property listing to the org's connected Meta
 * accounts. Renders a button per connected platform; each opens a caption modal and publishes via
 * the shared /org-integrations/:type/share endpoint (Meta posts synchronously, so no polling).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProviderLogo } from '@/components/integrations/ProviderLogo';
import { getConnections, shareListing } from '@/lib/integrations-api';

const META: Array<{ type: 'facebook' | 'instagram'; label: string; emoji: string }> = [
  { type: 'facebook', label: 'Facebook', emoji: '📘' },
  { type: 'instagram', label: 'Instagram', emoji: '📸' },
];

export function ShareToMeta({ propertyId, defaultCaption }: { propertyId: string; defaultCaption?: string }) {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<'facebook' | 'instagram' | null>(null);
  const [caption, setCaption] = useState(defaultCaption || '');
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConnections()
      .then(c => setConnected({ facebook: !!c['facebook'], instagram: !!c['instagram'] }))
      .catch(() => setConnected({}));
  }, []);

  function open(type: 'facebook' | 'instagram') {
    setActive(type);
    setCaption(defaultCaption || '');
    setStatus(null);
    setError(null);
  }

  async function publish() {
    if (!active) return;
    setPosting(true); setStatus('Publishing…'); setError(null);
    try {
      const r = await shareListing(active, { propertyId, caption: caption.trim() || undefined });
      setStatus(`Published to ${active === 'facebook' ? 'Facebook' : 'Instagram'} ✓ (${r.mediaCount} image${r.mediaCount === 1 ? '' : 's'})`);
    } catch (e: any) {
      setStatus(null);
      setError(e?.message || 'Publishing failed');
    } finally {
      setPosting(false);
    }
  }

  const visible = META.filter(m => connected[m.type]);
  if (!visible.length) return null; // nothing connected → no buttons (discover via Integrations)

  return (
    <>
      {visible.map(m => (
        <Button key={m.type} size="sm" variant="outline" className="border-border text-foreground text-xs gap-1.5" onClick={() => open(m.type)}>
          <ProviderLogo type={m.type} emoji={m.emoji} size={18} /> Share to {m.label}
        </Button>
      ))}

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {active && <ProviderLogo type={active} emoji={active === 'facebook' ? '📘' : '📸'} size={22} />}
              Share to {active === 'facebook' ? 'Facebook' : 'Instagram'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-mono text-muted-foreground">CAPTION</Label>
              <Textarea className="bg-muted border-border text-foreground" rows={4} value={caption}
                onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption for this listing…" />
            </div>
            {status && <p className="text-xs text-foreground">{status}</p>}
            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-400">
                <p className="font-semibold">Couldn't post</p>
                <p className="mt-0.5 break-words">{error}</p>
              </div>
            )}
            <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black" disabled={posting} onClick={publish}>
              {posting ? 'Publishing…' : `Publish to ${active === 'facebook' ? 'Facebook' : 'Instagram'}`}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Uses the property's approved photos.{' '}
              {active === 'instagram' && 'Your IG must be a Business account linked to a Facebook Page. '}
              <Link href="/dashboard/property-management/integrations" className="text-amber-500 underline">Manage integrations</Link>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ShareToMeta;
