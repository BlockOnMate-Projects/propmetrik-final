'use client';

import { Suspense } from 'react';
import { CommunicationsHub } from '@/components/communications/CommunicationsHub';

export default function PmCommunicationsPage() {
  return (
    <div className="p-2 sm:p-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <CommunicationsHub service="property-management" />
      </Suspense>
    </div>
  );
}
