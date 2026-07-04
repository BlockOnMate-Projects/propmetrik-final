'use client';

import { Suspense } from 'react';
import { CommunicationsHub } from '@/components/communications/CommunicationsHub';

export default function ProjectsCommunicationsPage() {
  return (
    <div className="p-2 sm:p-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <CommunicationsHub service="projects" />
      </Suspense>
    </div>
  );
}
