'use client';

/**
 * Warns the current user that campaign/workflow email won't be delivered until they connect their
 * own mailbox — because those now send FROM the agent's Gmail/Outlook, never the platform address.
 * Renders nothing once an account is connected (or if the status check fails, to avoid false alarms).
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, AlertTriangle } from 'lucide-react';
import { emailsApi } from '@/lib/crm-api';

export function ConnectEmailBanner({ noun = 'These messages' }: { noun?: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    emailsApi.getStatus()
      .then((s) => { if (alive) setConnected(!!(s.gmail?.connected || s.outlook?.connected)); })
      .catch(() => { if (alive) setConnected(true); }); // fail safe → don't nag
    return () => { alive = false; };
  }, []);

  if (connected !== false) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm mb-4">
      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-amber-600 dark:text-amber-400">Connect your email to activate sending</p>
        <p className="text-muted-foreground">
          {noun} send from <span className="font-medium">your own mailbox</span>. Until you connect Gmail or Outlook, they queue and won&apos;t be delivered.
        </p>
      </div>
      <Link href="/dashboard/deals/integrations"
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-black text-xs font-medium px-3 py-1.5">
        <Mail className="h-3.5 w-3.5" /> Connect email
      </Link>
    </div>
  );
}

export default ConnectEmailBanner;
