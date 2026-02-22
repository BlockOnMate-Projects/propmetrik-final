// PropertyCard Component - Display property in marketplace
'use client';

import { Heart, MapPin, Bed, Bath, Square } from 'lucide-react';
import { useState } from 'react';

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
    fetch('/api/marketplace/analytics/track', {
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
      className="bg-white rounded-xl overflow-hidden hover:shadow-xl transition-all cursor-pointer border border-gray-200 group"
    >
      {/* Property Image */}
      <div className="relative h-56 w-full bg-gray-100">
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
              ? 'bg-emerald-500 text-white' 
              : 'bg-indigo-600 text-white'
          }`}>
            {property.transaction_type === 'rental' ? 'FOR RENT' : 'FOR SALE'}
          </span>
        </div>

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteClick}
          className="absolute top-3 right-3 p-2.5 bg-white/95 backdrop-blur-sm rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-700'}`} />
        </button>

        {/* Distance Badge */}
        {showDistance && property.distance_km !== undefined && (
          <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-black/80 text-white text-xs font-medium rounded-lg backdrop-blur-sm">
            <MapPin className="inline-block h-3 w-3 mr-1" />
            {property.distance_km.toFixed(1)} km
          </div>
        )}
      </div>
      
      {/* Property Info */}
      <div className="p-5">
        {/* Price */}
        <div className="mb-3">
          <span className="text-2xl font-bold text-gray-900">
            {property.currency} {property.price.toLocaleString()}
          </span>
          {property.transaction_type === 'rental' && (
            <span className="text-gray-600 text-sm font-medium">/month</span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-base mb-2 line-clamp-2 text-gray-900 leading-snug">
          {property.title}
        </h3>
        
        {/* Location */}
        <div className="flex items-center gap-1.5 text-gray-600 text-sm mb-4">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="line-clamp-1">
            {property.neighborhood ? `${property.neighborhood}, ` : ''}{property.city}
          </span>
        </div>
        
        {/* Property Specs */}
        <div className="flex items-center gap-5 text-gray-700 text-sm border-t border-gray-200 pt-4">
          {property.bedrooms && (
            <div className="flex items-center gap-1.5">
              <Bed className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{property.bedrooms}</span>
            </div>
          )}
          {property.bathrooms && (
            <div className="flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{property.bathrooms}</span>
            </div>
          )}
          {property.total_area_sqm && (
            <div className="flex items-center gap-1.5">
              <Square className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{property.total_area_sqm} m²</span>
            </div>
          )}
        </div>

        {/* Amenities (show first 3) */}
        {property.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {property.amenities.slice(0, 3).map((amenity: string) => (
              <span key={amenity} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md border border-gray-200 capitalize">
                {amenity}
              </span>
            ))}
            {property.amenities.length > 3 && (
              <span className="text-xs px-2.5 py-1 text-gray-500 font-medium">
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
