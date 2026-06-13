// PropertyCard Component - Display property in marketplace
'use client';

import { Heart, MapPin, Bed, Bath, Square, Car, Navigation, ImageIcon, Building2 } from 'lucide-react';
import { useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';

interface PropertyCardProps {
  property: any;
  onClick: () => void;
  showDistance?: boolean;
}

export function PropertyCard({ property, onClick, showDistance }: PropertyCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFavorite(!isFavorite);
    
    // Track favorite event
    authedFetch('/api/marketplace/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_source: property.source,
        property_id: property.id,
        event_type: 'favorite',
        session_id: getSessionId()
      })
    });
  };

  return (
    <div 
      onClick={onClick}
      className="bg-card rounded-xl overflow-hidden hover:shadow-xl transition-all cursor-pointer border border-border group"
    >
      {/* Property Image */}
      <div className="relative h-56 w-full bg-muted">
        {property.images && property.images.length > 0 && (property.images[0]?.url || typeof property.images[0] === 'string') ? (
          <img
            src={typeof property.images[0] === 'string' ? property.images[0] : property.images[0].url}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 22V12h6v10" />
            </svg>
          </div>
        )}
        
        {/* Transaction Type Badge */}
        <div className="absolute top-3 left-3">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg ${
            property.transaction_type === 'rental' 
              ? 'bg-emerald-500 text-foreground' 
              : 'bg-indigo-600 text-foreground'
          }`}>
            {property.transaction_type === 'rental' ? 'FOR RENT' : 'FOR SALE'}
          </span>
        </div>

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteClick}
          className="absolute top-3 right-3 p-2.5 bg-card/95 backdrop-blur-sm rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-700'}`} />
        </button>

        {/* Image Count Badge */}
        {property.images && property.images.length > 1 && (
          <div className="absolute bottom-3 left-3 px-2 py-1 bg-background/70 text-foreground text-xs font-medium rounded-md backdrop-blur-sm flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            {property.images.length}
          </div>
        )}

        {/* Distance Badge */}
        {showDistance && property.distance_km !== undefined && (
          <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-background/80 text-foreground text-xs font-medium rounded-lg backdrop-blur-sm">
            <MapPin className="inline-block h-3 w-3 mr-1" />
            {property.distance_km.toFixed(1)} km
          </div>
        )}
      </div>
      
      {/* Property Info */}
      <div className="p-5">
        {/* Price */}
        <div className="mb-3">
          {property.total_units > 0 && (
            <span className="text-muted-foreground text-sm font-medium mr-1">from</span>
          )}
          <span className="text-2xl font-bold text-gray-900">
            {property.currency} {property.price.toLocaleString()}
          </span>
          {property.transaction_type === 'rental' && (
            <span className="text-muted-foreground text-sm font-medium">/month</span>
          )}
          {property.transaction_type === 'sale' && property.total_area_sqm && (
            <span className="text-xs text-muted-foreground ml-1">
              ({property.currency} {Math.round(property.price / property.total_area_sqm).toLocaleString()}/m²)
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-base mb-2 line-clamp-2 text-gray-900 leading-snug">
          {property.title}
        </h3>
        
        {/* Location */}
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-4">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="line-clamp-1">
            {property.neighborhood ? `${property.neighborhood}, ` : ''}{property.city}
          </span>
        </div>
        {property.digital_address && (
          <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-medium">
            <Navigation className="h-3 w-3" />
            <span>{property.digital_address}</span>
          </div>
        )}
        
        {/* Property Specs */}
        <div className="flex items-center gap-5 text-gray-700 text-sm border-t border-border pt-4">
          {property.total_units > 0 ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{property.total_units} units available</span>
            </div>
          ) : (
            <>
              {property.bedrooms && (
                <div className="flex items-center gap-1.5">
                  <Bed className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{property.bedrooms}</span>
                </div>
              )}
              {property.bathrooms && (
                <div className="flex items-center gap-1.5">
                  <Bath className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{property.bathrooms}</span>
                </div>
              )}
              {property.total_area_sqm && (
                <div className="flex items-center gap-1.5">
                  <Square className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{property.total_area_sqm} m²</span>
                </div>
              )}
              {property.parking_spaces && (
                <div className="flex items-center gap-1.5">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{property.parking_spaces}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Amenities (show first 3) */}
        {property.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {property.amenities.slice(0, 3).map((amenity: string) => (
              <span key={amenity} className="text-xs px-2.5 py-1 bg-muted text-gray-700 rounded-md border border-border capitalize">
                {amenity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            ))}
            {property.amenities.length > 3 && (
              <span className="text-xs px-2.5 py-1 text-muted-foreground font-medium">
                +{property.amenities.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  return localStorage.getItem('marketplace_session_id') || 'anonymous';
}
