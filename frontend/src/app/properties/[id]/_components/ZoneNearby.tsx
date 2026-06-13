'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PropertyEnrichmentResponse } from '@/types/property';
import { Bed, Bath, Move, MapPin, Home } from 'lucide-react';

interface ZoneNearbyProps {
  nearby: PropertyEnrichmentResponse['nearby'];
  currentLocation?: { lat: number; lng: number };
}

export function ZoneNearby({ nearby, currentLocation }: ZoneNearbyProps) {
  if (!nearby || nearby.length === 0) return null;

  const formatDistance = (meters: number) => {
    if (meters === 0 || meters < 10) {
      return 'Same area'; // Properties at same geocoded location
    }
    if (meters < 1000) {
      return `${Math.round(meters)}m away`;
    }
    return `${(meters / 1000).toFixed(1)}km away`;
  };

  const formatPrice = (price: number, currency: string, transactionType: string) => {
    const formatted = new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(price);
    
    if (transactionType === 'rental') {
      return `${formatted}/mo`;
    }
    return formatted;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Properties Nearby</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {nearby.length} properties within 2km
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {nearby.map((property) => (
          <Link key={property.id} href={`/properties/${property.id}`}>
            <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden h-full">
              <div className="relative h-36 w-full bg-gray-200">
                {property.image ? (
                  <Image
                    src={property.image}
                    alt={property.title || 'Property'}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Home className="w-12 h-12" />
                  </div>
                )}
                
                {/* Distance Badge */}
                <div className="absolute top-2 right-2 bg-background/60 text-foreground text-xs px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {formatDistance(property.distance)}
                </div>
                
                {/* Transaction Type Badge */}
                <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded ${
                  property.transaction_type === 'sale'
                    ? 'bg-blue-500 text-foreground'
                    : 'bg-purple-500 text-foreground'
                }`}>
                  {property.transaction_type === 'sale' ? 'SALE' : 'RENT'}
                </div>
              </div>
              
              <CardContent className="p-3">
                <div className="font-bold text-base mb-1 truncate">
                  {formatPrice(property.price, property.currency, property.transaction_type)}
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-0.5">
                    <Bed className="w-3 h-3" /> {property.beds}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Bath className="w-3 h-3" /> {property.baths}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Move className="w-3 h-3" /> {property.sqm}m²
                  </span>
                </div>
                
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {property.digital_address ? (
                    <span className="font-mono text-green-600 dark:text-green-400">{property.digital_address}</span>
                  ) : (
                    property.address
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
