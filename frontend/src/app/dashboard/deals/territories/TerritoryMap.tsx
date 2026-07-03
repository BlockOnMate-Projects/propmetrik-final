'use client';

/**
 * Interactive territory map. Renders existing territories as colored polygons and, in
 * draw mode, lets the user click the map to drop polygon vertices (no extra draw library —
 * built on react-map-gl, which is already a dependency).
 */

import { useCallback, useMemo } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, type MapLayerMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { AgentTerritory } from '@/lib/crm-api';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const INITIAL = { longitude: -0.187, latitude: 5.6037, zoom: 9 }; // Accra

interface TerritoryMapProps {
    territories: AgentTerritory[];
    drawing: boolean;
    drawPoints: [number, number][];      // [lng, lat]
    onAddPoint: (lng: number, lat: number) => void;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
}

export default function TerritoryMap({ territories, drawing, drawPoints, onAddPoint, selectedId, onSelect }: TerritoryMapProps) {
    const handleClick = useCallback((e: MapLayerMouseEvent) => {
        if (drawing) { onAddPoint(e.lngLat.lng, e.lngLat.lat); return; }
        const hit = e.features?.find((f) => f.layer?.id === 'territory-fill');
        if (hit && onSelect && hit.properties?.id) onSelect(hit.properties.id as string);
    }, [drawing, onAddPoint, onSelect]);

    const territoryFC = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: territories.filter((t) => t.boundary).map((t) => ({
            type: 'Feature' as const,
            properties: { id: t.id, color: t.color || '#6366f1', selected: t.id === selectedId },
            geometry: t.boundary as GeoJSON.Geometry,
        })),
    }), [territories, selectedId]);

    const drawFC = useMemo(() => {
        if (drawPoints.length < 2) return null;
        const geometry: GeoJSON.Geometry = drawPoints.length >= 3
            ? { type: 'Polygon', coordinates: [[...drawPoints, drawPoints[0]]] }
            : { type: 'LineString', coordinates: drawPoints };
        return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry }] };
    }, [drawPoints]);

    if (!TOKEN) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
                Map unavailable — <code className="mx-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> is not set.
            </div>
        );
    }

    return (
        <Map
            initialViewState={INITIAL}
            mapStyle="mapbox://styles/mapbox/streets-v11"
            mapboxAccessToken={TOKEN}
            onClick={handleClick}
            interactiveLayerIds={['territory-fill']}
            cursor={drawing ? 'crosshair' : undefined}
            style={{ width: '100%', height: '100%' }}
        >
            <NavigationControl position="top-right" />

            <Source id="territories" type="geojson" data={territoryFC}>
                <Layer id="territory-fill" type="fill" paint={{
                    'fill-color': ['get', 'color'] as any,
                    'fill-opacity': ['case', ['get', 'selected'], 0.45, 0.18] as any,
                }} />
                <Layer id="territory-line" type="line" paint={{
                    'line-color': ['get', 'color'] as any,
                    'line-width': ['case', ['get', 'selected'], 3, 1.5] as any,
                }} />
            </Source>

            {drawFC && (
                <Source id="draw" type="geojson" data={drawFC}>
                    <Layer id="draw-fill" type="fill" paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.25 }} />
                    <Layer id="draw-line" type="line" paint={{ 'line-color': '#f59e0b', 'line-width': 2 }} />
                </Source>
            )}

            {drawing && drawPoints.map((p, i) => (
                <Marker key={i} longitude={p[0]} latitude={p[1]}>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white shadow" />
                </Marker>
            ))}
        </Map>
    );
}
