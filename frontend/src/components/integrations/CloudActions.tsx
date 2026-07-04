'use client';

/**
 * Reusable actions that push app content to a user's connected BYO integration:
 *  - SaveToCloudButton    → uploads a document to their Google Drive / OneDrive
 *  - AddToCalendarButton  → creates an event in their Google Calendar / Outlook
 * Provider auto-resolves server-side to whichever the user connected; a friendly nudge
 * shows if nothing is connected yet.
 */

import { useState } from 'react';
import { Cloud, CalendarPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveToCloud, pushToCalendar } from '@/lib/integrations-api';
import { toast } from 'sonner';

const notConnected = (e: any) => e?.code === 'not_connected' || /not.?connected/i.test(e?.message || '');

export function SaveToCloudButton({
  bucket, objectKey, sourceUrl, name,
  size = 'sm', variant = 'ghost', label = 'Save to cloud', className,
}: {
  bucket?: string; objectKey?: string; sourceUrl?: string; name?: string;
  size?: 'sm' | 'default'; variant?: 'ghost' | 'outline' | 'default'; label?: string; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await saveToCloud({ bucket, key: objectKey, sourceUrl, name });
      toast.success(`Saved to ${r.provider === 'onedrive' ? 'OneDrive' : 'Google Drive'}`,
        r.url ? { action: { label: 'Open', onClick: () => window.open(r.url!, '_blank') } } : undefined);
    } catch (e: any) {
      toast.error(notConnected(e) ? 'Connect Google Drive or OneDrive in Integrations first.' : (e?.message || 'Save to cloud failed'));
    } finally { setBusy(false); }
  };
  return (
    <Button variant={variant} size={size} onClick={run} disabled={busy} className={className}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4 mr-1" />}{label}
    </Button>
  );
}

export function AddToCalendarButton({
  event, size = 'sm', variant = 'outline', label = 'Add to my calendar', className,
}: {
  event: { title: string; start: string; end: string; description?: string; location?: string; attendees?: string[] };
  size?: 'sm' | 'default'; variant?: 'ghost' | 'outline' | 'default'; label?: string; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await pushToCalendar(event);
      toast.success(`Added to ${r.provider === 'outlook' ? 'Outlook' : 'Google'} Calendar`,
        r.url ? { action: { label: 'Open', onClick: () => window.open(r.url!, '_blank') } } : undefined);
    } catch (e: any) {
      toast.error(notConnected(e) ? 'Connect Google Calendar or Outlook in Integrations first.' : (e?.message || 'Add to calendar failed'));
    } finally { setBusy(false); }
  };
  return (
    <Button variant={variant} size={size} onClick={run} disabled={busy} className={className}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-1" />}{label}
    </Button>
  );
}
