'use client';

/**
 * Standalone Deals email inbox — thin wrapper over the shared <MailInbox/>. The primary entry
 * point is now the Communications hub (Mail tab); this route is kept for back-compat/deep-links.
 */

import { Mail } from 'lucide-react';
import { MailInbox } from '@/components/communications/MailInbox';

export default function DealsInboxPage() {
  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-4">
      <div className="pb-3 border-b border-border">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" /> Email Inbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Emails synced from your connected account, logged against contacts &amp; deals.</p>
      </div>
      <div className="flex-1 min-h-0">
        <MailInbox service="deals" />
      </div>
    </div>
  );
}
