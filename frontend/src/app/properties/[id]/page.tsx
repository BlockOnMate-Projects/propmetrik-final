import { notFound } from 'next/navigation';
import { ZoneHero } from './_components/ZoneHero';
import { ZoneValuation } from './_components/ZoneValuation';
import { ZoneFacts } from './_components/ZoneFacts';
import { ZoneMap } from './_components/ZoneMap';
import { ZoneComparables } from './_components/ZoneComparables';
import { ZoneNearby } from './_components/ZoneNearby';
import { PropertyEnrichmentResponse } from '@/types/property';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

// Force dynamic rendering since data changes frequently or depends on backend state
export const dynamic = 'force-dynamic';

async function getPropertyData(id: string): Promise<PropertyEnrichmentResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_INTERNAL_API_URL || 'http://localhost:4000';
  
  try {
    const res = await fetch(`${apiUrl}/api/public/properties/${id}/enriched`, {
      cache: 'no-store', // Always fetch fresh data for valuation accuracy
      next: { revalidate: 0 }
    });

    if (res.status === 404) return null;
    
    if (!res.ok) {
      throw new Error(`Failed to fetch property: ${res.statusText}`);
    }

    return res.json();
  } catch (error) {
    console.error("Error fetching property data:", error);
    throw error;
  }
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPropertyData(id);

  if (!data) {
    return notFound();
  }

  const { property, valuation, pois, comparables, nearby } = data;

  return (
    <main className="min-h-screen bg-card dark:bg-background text-gray-900 dark:text-gray-100 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
        {/* Breadcrumb / Back Navigation */}
        <div className="flex items-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/properties" className="hover:text-primary transition-colors">Properties</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-[300px]">
            {property.address?.formatted || property.region}
          </span>
        </div>

        {/* Zone A: Hero / Visuals */}
        <section id="zone-hero">
          <ZoneHero property={property} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-10">
            {/* Zone C: Facts & Features */}
            <section id="zone-facts">
              <ZoneFacts property={property} dataQuality={property.data_quality} />
            </section>
            
            {/* Zone D: Location Context */}
            <section id="zone-map">
              <h2 className="text-xl font-bold mb-2">Location & Nearby</h2>
              {property.address?.formatted && (
                <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {property.address.formatted}
                </p>
              )}
              <ZoneMap location={property.location} pois={pois} />
              
              {/* Coordinates Display */}
              {property.location.lat && property.location.lng && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Coordinates: {property.location.lat.toFixed(6)}, {property.location.lng.toFixed(6)}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Column */}
          <div className="lg:col-span-1 space-y-8">
             {/* Zone B: Valuation Block */}
             <section id="zone-valuation" className="sticky top-8 space-y-6">
               <ZoneValuation valuation={valuation} currency="GHS" dataQuality={property.data_quality} />
             </section>
          </div>
        </div>

        {/* Zone E: Comparable Properties */}
        <section id="zone-comparables">
          <div className="border-t border-gray-100 dark:border-gray-800 pt-10">
            <ZoneComparables comparables={comparables} />
          </div>
        </section>

        {/* Zone F: Nearby Properties (Zillow-style) */}
        {nearby && nearby.length > 0 && (
          <section id="zone-nearby">
            <div className="border-t border-gray-100 dark:border-gray-800 pt-10">
              <ZoneNearby nearby={nearby} currentLocation={property.location} />
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
