'use client';

import { Suspense } from 'react';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';

export default function PMIntegrationsPage() {
  return (
    <div className="p-4 md:p-6 bg-background min-h-screen">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading integrations…</p>}>
        <IntegrationsHub service="pm" title="Integrations" />
      </Suspense>
    </div>
  );
}
