'use client';

import { Suspense } from 'react';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';

export default function CrmIntegrationsPage() {
  return (
    <div className="p-2 sm:p-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading integrations…</p>}>
        <IntegrationsHub service="crm" title="Integrations" />
      </Suspense>
    </div>
  );
}
