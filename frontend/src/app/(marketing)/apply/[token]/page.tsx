'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  MapPin, 
  Bed, 
  Bath, 
  Square,
  Eye,
  ArrowLeft,
  Loader2,
  X,
  FileText,
  ArrowRight
} from 'lucide-react';
import Image from 'next/image';
import ApplicationForm from '@/components/ApplicationForm';

interface Property {
  id: string;
  source: 'pm' | 'crm';
  permanent_link_token: string;
  title: string;
  description?: string;
  property_type: string;
  transaction_type: 'rental' | 'sale';
  address: string;
  city: string;
  region: string;
  digital_address?: string;
  location?: { lat: number; lon: number };
  price: number;
  currency: string;
  price_negotiable?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  total_area_sqm?: number;
  amenities?: string[];
  features?: string[];
  images?: (string | { id: string; url: string; original_name?: string })[];
  listed_at: string;
  views: number;
  clicks: number;
}

export default function PropertyApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadProperty();
    }
  }, [token]);

  const loadProperty = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace/properties/${token}`);
      
      if (!response.ok) {
        throw new Error('Property not found');
      }
      
      const data = await response.json();
      setProperty(data);

      // Track view
      fetch('/api/marketplace/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_source: data.source,
          property_id: data.id,
          event_type: 'view',
          session_id: getSessionId(),
        })
      });
    } catch (error: any) {
      console.error('Failed to load property:', error);
      setError(error.message || 'Failed to load property details');
    } finally {
      setLoading(false);
    }
  };

  const handleStartApplication = async () => {
    if (!property) return;

    // Check if it's a PM property (only PM properties have applications)
    if (property.source !== 'pm') {
      setError('Applications are only available for property management listings. Please contact the property owner directly.');
      return;
    }

    setApplying(true);
    setError(null);

    try {
      // Get or create application link
      const response = await fetch(`/api/marketplace/properties/${token}/application-link`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start application');
      }

      const data = await response.json();
      
      // Redirect to tenant portal with application token
      window.location.href = data.tenant_portal_url || `http://localhost:3001/apply/${data.application_token}`;
    } catch (error: any) {
      console.error('Failed to start application:', error);
      setError(error.message || 'Failed to start application. Please try again.');
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading property details...</p>
        </div>
      </div>
    );
  }

  if (error && !property) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl p-8 text-center border border-gray-200 shadow-sm">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Property Not Found</h2>
          <p className="text-gray-600 mb-6">
            {error || 'This property may have been removed or the link is invalid.'}
          </p>
          <button
            onClick={() => router.push('/marketplace')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  if (!property) return null;

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency || 'GHS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatPropertyType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatAmenity = (amenity: string) => {
    return amenity
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="min-h-screen bg-white pt-16 md:pt-20">
      {/* Header with Back Button */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/marketplace')}
            className="text-gray-600 hover:text-gray-900 transition-colors inline-flex items-center gap-2 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Top Section: Title, Price, and CTA */}
        <div className="flex items-start justify-between gap-6 mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {property.title}
            </h1>
            <div className="flex items-center text-gray-600 gap-2 mb-4">
              <MapPin className="w-5 h-5" />
              <span>{property.address}, {property.city}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm font-medium">
                For {property.transaction_type === 'rental' ? 'Rent' : 'Sale'}
              </span>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm font-medium">
                {formatPropertyType(property.property_type)}
              </span>
              <div className="flex items-center text-gray-600 text-sm gap-1">
                <Eye className="w-4 h-4" />
                <span>{property.views} views</span>
              </div>
            </div>
          </div>

          {/* Price and Application CTA - Top Right */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 min-w-[280px] shadow-sm">
            <div className="mb-4">
              <div className="text-3xl font-bold text-indigo-600 mb-1">
                {formatPrice(property.price, property.currency)}
              </div>
              <div className="text-sm text-gray-600">
                {property.transaction_type === 'rental' ? 'per month' : 'total price'}
              </div>
            </div>

            {/* Error Message */}
            {error && property && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {/* PM rental properties → redirect to tenant portal */}
            {property.source === 'pm' ? (
              <>
                <button
                  onClick={handleStartApplication}
                  disabled={applying}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Apply to Rent
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Complete tenant application form
                </p>
              </>
            ) : (
              /* CRM sale properties → inline inquiry form */
              <ApplicationForm property={property} token={token} />
            )}
          </div>
        </div>

        {/* Property Image Gallery */}
        {property.images && property.images.length > 0 && (typeof property.images[0] === 'string' ? property.images[0] : property.images[0]?.url) ? (
          <div className="relative h-[500px] bg-gray-100 rounded-xl overflow-hidden mb-6 border border-gray-200">
            <Image
              src={typeof property.images[0] === 'string' ? property.images[0] : property.images[0].url}
              alt={property.title}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="h-[500px] bg-gray-100 rounded-xl flex items-center justify-center mb-6 border border-gray-200">
            <div className="text-center">
              <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No images available</p>
            </div>
          </div>
        )}

        {/* Property Details Grid */}
        <div className="grid grid-cols-1 gap-6 mb-6">
          <div className="space-y-6">
            {/* Property Specs Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Property Details</h2>
              <div className="grid grid-cols-3 gap-6">
                {property.bedrooms !== undefined && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Bed className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm text-gray-600">Bedrooms</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{property.bedrooms}</div>
                  </div>
                )}

                {property.bathrooms !== undefined && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Bath className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm text-gray-600">Bathrooms</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{property.bathrooms}</div>
                  </div>
                )}

                {property.total_area_sqm && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Square className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm text-gray-600">Area</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{property.total_area_sqm} m²</div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {property.description && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">About This Property</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {property.description}
                </p>
              </div>
            )}

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Amenities & Features</h2>
                <div className="grid grid-cols-2 gap-3">
                  {property.amenities.map((amenity, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-2 text-gray-700"
                    >
                      <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                      <span>{formatAmenity(amenity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to get/create session ID
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  
  const key = 'marketplace_session_id';
  let sessionId = localStorage.getItem(key);
  
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(key, sessionId);
  }
  
  return sessionId;
}
