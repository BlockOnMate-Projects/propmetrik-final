'use client';

import dynamic from 'next/dynamic';
import { PropertyEnrichmentResponse } from '@/types/property';

interface ZoneMapProps {
  location: PropertyEnrichmentResponse['property']['location'];
  pois: PropertyEnrichmentResponse['pois'];
}

// PERF: mapbox-gl / react-map-gl is heavy and browser-only. Load it lazily
// (ssr:false) so it stays out of the initial property-page bundle and only
// downloads when the map actually renders.
const ZoneMapInner = dynamic(() => import('./ZoneMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-muted flex items-center justify-center rounded-xl text-muted-foreground animate-pulse">
      Loading map…
    </div>
  ),
});

export function ZoneMap(props: ZoneMapProps) {
  return <ZoneMapInner {...props} />;
}
