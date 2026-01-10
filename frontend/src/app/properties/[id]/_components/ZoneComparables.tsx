'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { PropertyEnrichmentResponse } from '@/types/property';
import { Bed, Bath, Move, ArrowRight, TrendingUp, Calendar } from 'lucide-react';

interface ZoneComparablesProps {
  comparables: PropertyEnrichmentResponse['comparables'];
}

function getSimilarityColor(score: number): string {
  if (score >= 0.8) return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
  if (score >= 0.6) return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
  if (score >= 0.4) return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
  return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
}

export function ZoneComparables({ comparables }: ZoneComparablesProps) {
  if (comparables.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Comparable Properties</h2>
        <div className="text-center py-8 text-muted-foreground bg-gray-50 dark:bg-gray-900 rounded-lg">
          No comparable properties found in this area.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Comparable Properties</h2>
          <p className="text-sm text-muted-foreground">
            Properties used for valuation analysis • Sorted by similarity
          </p>
        </div>
        <Link href="#" className="text-primary text-sm font-medium flex items-center hover:underline">
          Export Comps <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>

      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex w-max space-x-4 p-1">
          {comparables.map((comp) => (
            <Link key={comp.id} href={`/properties/${comp.id}`} className="block w-[300px]">
              <Card className="hover:shadow-lg transition-shadow duration-300 overflow-hidden h-full">
                <div className="relative h-40 w-full bg-gray-200">
                  <Image
                    src={comp.image || '/placeholder-property.jpg'}
                    alt={comp.title || 'Comparable property'}
                    fill
                    className="object-cover"
                  />
                  {/* Similarity Score Badge */}
                  <div className={`absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-semibold border ${getSimilarityColor(comp.similarity_score)}`}>
                    {Math.round(comp.similarity_score * 100)}% Match
                  </div>
                  {/* Distance Badge */}
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                    {comp.distance === 0 || comp.distance < 10
                      ? 'Same area'
                      : comp.distance < 1000 
                        ? `${Math.round(comp.distance)} m` 
                        : `${(comp.distance / 1000).toFixed(1)} km`}
                  </div>
                </div>
                <CardContent className="p-4 space-y-3">
                  {/* Price */}
                  <div>
                    <div className="font-bold text-lg">
                      {new Intl.NumberFormat('en-GH', { style: 'currency', currency: comp.currency, maximumFractionDigits: 0 }).format(comp.price)}
                    </div>
                    {comp.price_per_sqm && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        GH₵ {comp.price_per_sqm.toLocaleString()}/m²
                      </div>
                    )}
                  </div>

                  {/* Property Details */}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" /> {comp.beds}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {comp.baths}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Move className="w-3.5 h-3.5" /> {comp.sqm} m²</span>
                  </div>

                  {/* Additional Valuation Info */}
                  <div className="flex flex-wrap gap-2">
                    {comp.property_type && (
                      <Badge variant="secondary" className="text-xs capitalize">
                        {comp.property_type.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {comp.condition && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {comp.condition.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {comp.year_built && (
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {comp.year_built}
                      </Badge>
                    )}
                  </div>

                  {/* Ghana Post GPS Code */}
                  {comp.digital_address && (
                    <div className="text-xs font-mono text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-1 rounded border border-green-200 dark:border-green-800">
                      📍 {comp.digital_address}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
