'use client';

import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { PropertyEnrichmentResponse } from '@/types/property';
import { MapPin, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface ZoneMapProps {
  location: PropertyEnrichmentResponse['property']['location'];
  pois: PropertyEnrichmentResponse['pois'];
}

// Get human-readable label for coordinate source
function getSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'original': return 'Exact Location';
    case 'ghana_post_gps': return 'Ghana Post GPS';
    case 'street_landmark': return 'Street/Landmark';
    case 'neighborhood': return 'Neighborhood Center';
    case 'city': return 'City/Area Center';
    case 'geocoded': return 'Geocoded';
    default: return 'Estimated';
  }
}

// Get location accuracy level for UI
function getAccuracyLevel(location: ZoneMapProps['location']): 'high' | 'medium' | 'low' {
  if (location.geocoding_confidence !== null && location.geocoding_confidence !== undefined) {
    if (location.geocoding_confidence >= 0.8) return 'high';
    if (location.geocoding_confidence >= 0.5) return 'medium';
    return 'low';
  }
  const source = location.coordinates_source;
  if (source === 'original' || source === 'ghana_post_gps') return 'high';
  if (source === 'street_landmark' || source === 'geocoded') return 'medium';
  return 'low';
}

/**
 * Mapbox-backed map. Split out from ZoneMap and loaded via next/dynamic(ssr:false)
 * so react-map-gl / mapbox-gl stay out of the initial page bundle.
 */
export default function ZoneMapInner({ location, pois }: ZoneMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoicHJvcG1ldHJpayIsImEiOiJjbHJ...'; // Placeholder

  const accuracyLevel = getAccuracyLevel(location);
  const sourceLabel = getSourceLabel(location.coordinates_source);

  if (!token || !location.lat || !location.lng) {
    return (
      <div className="w-full h-[400px] bg-muted flex items-center justify-center rounded-xl text-muted-foreground">
        Map unavailable
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Location Accuracy Indicator */}
      <div className={`absolute top-2 left-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm ${
        accuracyLevel === 'high'
          ? 'bg-green-50 text-green-800 border-green-200'
          : accuracyLevel === 'medium'
          ? 'bg-blue-50 text-blue-800 border-blue-200'
          : 'bg-yellow-50 text-yellow-800 border-yellow-200'
      }`}>
        {accuracyLevel === 'high' ? (
          <CheckCircle className="w-4 h-4" />
        ) : accuracyLevel === 'medium' ? (
          <Info className="w-4 h-4" />
        ) : (
          <AlertTriangle className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">{sourceLabel}</span>
        {location.geocoding_confidence !== null && location.geocoding_confidence !== undefined && (
          <span className="text-xs opacity-75">
            ({Math.round(location.geocoding_confidence * 100)}%)
          </span>
        )}
      </div>

      <div className="w-full h-[400px] rounded-xl overflow-hidden border border-border dark:border-gray-800">
        <Map
          initialViewState={{
            longitude: location.lng,
            latitude: location.lat,
            zoom: accuracyLevel === 'high' ? 16 : accuracyLevel === 'medium' ? 14 : 12
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v11"
          mapboxAccessToken={token}
        >
          <NavigationControl position="top-right" />

          {/* Main Property Marker - different styling based on accuracy */}
          <Marker longitude={location.lng} latitude={location.lat} anchor="bottom">
            <div className="relative">
              {accuracyLevel === 'high' ? (
                <>
                  <MapPin className="w-10 h-10 text-primary fill-current" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-background/20 blur-[2px] rounded-full"></div>
                </>
              ) : accuracyLevel === 'medium' ? (
                <div className="relative">
                  <div className="absolute -inset-2 bg-primary/10 border border-primary/30 rounded-full animate-pulse"></div>
                  <MapPin className="w-8 h-8 text-primary fill-current relative z-10" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-primary/15 border-2 border-primary/40 border-dashed rounded-full flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
              )}
            </div>
          </Marker>

          {/* POI Markers Implementation would go here iterating over pois.schools etc */}
        </Map>
      </div>
    </div>
  );
}
