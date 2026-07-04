'use client';

/**
 * Canonical org-wide Integrations hub. Shows the full provider catalog (all services) and is the
 * landing target for the OAuth callback redirect (`?connected=` / `?error=`). Each service's nav
 * links here; the same `IntegrationsHub` component is also mounted scoped inside individual services.
 */

import { Suspense } from 'react';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';

export default function IntegrationsPage() {
  return (
    <div className="p-4 md:p-6 bg-background min-h-screen">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading integrations…</p>}>
        <IntegrationsHub title="Integrations" />
      </Suspense>
    </div>
  );
}
