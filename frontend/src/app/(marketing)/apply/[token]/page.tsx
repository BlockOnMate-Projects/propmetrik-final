'use client';

import { useEffect, useState, useCallback } from 'react';
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
  ArrowRight,
  Navigation,
  ExternalLink,
  Share2,
  Car,
  Calendar,
  Ruler,
  Shield,
  ChevronLeft,
  ChevronRight,
  Camera
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
  parking_spaces?: number;
  year_built?: number;
  land_area_sqm?: number;
  property_condition?: string;
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
  const [similarProperties, setSimilarProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const getImageUrl = useCallback((img: string | { id: string; url: string; original_name?: string }) => {
    return typeof img === 'string' ? img : img.url;
  }, []);

  const imageUrls = property?.images?.map(getImageUrl).filter(Boolean) ?? [];

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  const closeLightbox = () => setShowLightbox(false);

  const prevImage = () => {
    setLightboxIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1));
  };

  const nextImage = () => {
    setLightboxIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1));
  };

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

      // Load similar properties
      fetch(`/api/marketplace/properties/${token}/similar?limit=6`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.properties) setSimilarProperties(d.properties); })
        .catch(() => {});
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
      
      // Redirect to tenant application page (integrated into main app)
      window.location.href = `/tenant/apply/${data.application_token}`;
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
      {/* Header with Back Button and Share */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/marketplace')}
              className="text-gray-600 hover:text-gray-900 transition-colors inline-flex items-center gap-2 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Marketplace
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: property?.title ?? 'Property', url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="text-gray-600 hover:text-gray-900 transition-colors inline-flex items-center gap-2 font-medium"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Top Section: Title, Price, and CTA */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              {property.title}
            </h1>
            <div className="flex items-center text-gray-600 gap-2 mb-2 text-sm sm:text-base">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span>{property.address}, {property.city}</span>
            </div>
            {property.digital_address && (
              <a
                href={`https://ghanapostgps.com/map?q=${property.digital_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-medium mb-4"
              >
                <Navigation className="w-3.5 h-3.5" />
                {property.digital_address}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {!property.digital_address && <div className="mb-2" />}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="px-2 sm:px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs sm:text-sm font-medium">
                For {property.transaction_type === 'rental' ? 'Rent' : 'Sale'}
              </span>
              <span className="px-2 sm:px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs sm:text-sm font-medium">
                {formatPropertyType(property.property_type)}
              </span>
              <div className="flex items-center text-gray-600 text-xs sm:text-sm gap-1">
                <Eye className="w-4 h-4" />
                <span>{property.views} views</span>
              </div>
            </div>
          </div>

          {/* Price and Application CTA */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 w-full md:min-w-[280px] md:max-w-sm shadow-sm">
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
        {imageUrls.length > 0 ? (
          imageUrls.length === 1 ? (
            /* Single image */
            <div
              className="relative h-[250px] sm:h-[400px] md:h-[500px] bg-gray-100 rounded-xl overflow-hidden mb-6 border border-gray-200 cursor-pointer"
              onClick={() => openLightbox(0)}
            >
              <Image
                src={imageUrls[0]}
                alt={property.title}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            /* Multiple images: grid layout */
            <div className="mb-6">
              {/* Desktop: large + thumbnails */}
              <div className="hidden md:grid md:grid-cols-[1fr_240px] gap-2 h-[500px] rounded-xl overflow-hidden border border-gray-200">
                {/* Main image */}
                <div
                  className="relative bg-gray-100 cursor-pointer"
                  onClick={() => openLightbox(0)}
                >
                  <Image
                    src={imageUrls[0]}
                    alt={property.title}
                    fill
                    className="object-cover"
                  />
                </div>
                {/* Thumbnail column */}
                <div className="flex flex-col gap-2">
                  {imageUrls.slice(1, 3).map((url, i) => (
                    <div
                      key={i}
                      className="relative flex-1 bg-gray-100 cursor-pointer"
                      onClick={() => openLightbox(i + 1)}
                    >
                      <Image
                        src={url}
                        alt={`${property.title} - ${i + 2}`}
                        fill
                        className="object-cover"
                      />
                      {/* "View all" overlay on the last thumbnail */}
                      {i === Math.min(imageUrls.length - 2, 1) && imageUrls.length > 3 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="text-white text-center">
                            <Camera className="w-6 h-6 mx-auto mb-1" />
                            <span className="text-sm font-semibold">View all {imageUrls.length} photos</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Mobile: single image with "View all" button */}
              <div className="md:hidden relative h-[250px] sm:h-[400px] bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                <Image
                  src={imageUrls[0]}
                  alt={property.title}
                  fill
                  className="object-cover cursor-pointer"
                  onClick={() => openLightbox(0)}
                />
                {imageUrls.length > 1 && (
                  <button
                    onClick={() => openLightbox(0)}
                    className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm text-gray-900 px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Camera className="w-4 h-4" />
                    View all {imageUrls.length} photos
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="h-[250px] sm:h-[400px] md:h-[500px] bg-gray-100 rounded-xl flex items-center justify-center mb-6 border border-gray-200">
            <div className="text-center">
              <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No images available</p>
            </div>
          </div>
        )}

        {/* Lightbox Modal */}
        {showLightbox && imageUrls.length > 0 && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2"
            >
              <X className="w-7 h-7" />
            </button>
            {/* Image counter */}
            <div className="absolute top-4 left-4 text-white/80 text-sm font-medium z-10">
              {lightboxIndex + 1} / {imageUrls.length}
            </div>
            {/* Previous button */}
            {imageUrls.length > 1 && (
              <button
                onClick={prevImage}
                className="absolute left-2 sm:left-4 text-white/70 hover:text-white z-10 p-2"
              >
                <ChevronLeft className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>
            )}
            {/* Main image */}
            <div className="relative w-full h-full max-w-5xl max-h-[80vh] mx-12 sm:mx-20">
              <Image
                src={imageUrls[lightboxIndex]}
                alt={`${property.title} - ${lightboxIndex + 1}`}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            </div>
            {/* Next button */}
            {imageUrls.length > 1 && (
              <button
                onClick={nextImage}
                className="absolute right-2 sm:right-4 text-white/70 hover:text-white z-10 p-2"
              >
                <ChevronRight className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>
            )}
          </div>
        )}

        {/* Property Details Grid */}
        <div className="grid grid-cols-1 gap-6 mb-6">
          <div className="space-y-6">
            {/* Property Specs Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Property Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
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

            {/* Key Facts */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Facts</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Property Type</p>
                  <p className="text-sm font-semibold text-gray-900">{formatPropertyType(property.property_type)}</p>
                </div>
                {property.year_built && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Year Built</p>
                    <p className="text-sm font-semibold text-gray-900">{property.year_built}</p>
                  </div>
                )}
                {property.parking_spaces && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Parking</p>
                    <p className="text-sm font-semibold text-gray-900">{property.parking_spaces} spaces</p>
                  </div>
                )}
                {property.land_area_sqm && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Land Area</p>
                    <p className="text-sm font-semibold text-gray-900">{property.land_area_sqm} m&sup2;</p>
                  </div>
                )}
                {property.total_area_sqm && property.price && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Price / m&sup2;</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatPrice(Math.round(property.price / property.total_area_sqm), property.currency)}
                    </p>
                  </div>
                )}
                {property.property_condition && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Condition</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {property.property_condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                  </div>
                )}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Listed</p>
                  <p className="text-sm font-semibold text-gray-900">{new Date(property.listed_at).toLocaleDateString('en-GB')}</p>
                </div>
                {property.price_negotiable && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Negotiable</p>
                    <p className="text-sm font-semibold text-green-600">Yes</p>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {property.amenities.map((amenity, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-gray-700"
                    >
                      <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full flex-shrink-0"></div>
                      <span className="text-sm">{formatAmenity(amenity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Map */}
            {property.location && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900 p-6 pb-4">Location</h2>
                <div className="h-[250px] sm:h-[350px]">
                  <iframe
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${property.location.lon - 0.01}%2C${property.location.lat - 0.01}%2C${property.location.lon + 0.01}%2C${property.location.lat + 0.01}&layer=mapnik&marker=${property.location.lat}%2C${property.location.lon}`}
                    className="w-full h-full border-0"
                    loading="lazy"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Similar Properties */}
        {similarProperties.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Similar Properties</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {similarProperties.map((sp) => {
                const spImage = sp.images?.[0];
                const spImageUrl = spImage ? (typeof spImage === 'string' ? spImage : spImage.url) : null;
                return (
                  <div
                    key={sp.id}
                    onClick={() => router.push(`/apply/${sp.permanent_link_token}`)}
                    className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-all cursor-pointer group"
                  >
                    <div className="relative h-40 bg-gray-100">
                      {spImageUrl ? (
                        <Image src={spImageUrl} alt={sp.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <MapPin className="w-8 h-8" />
                        </div>
                      )}
                      <span className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-semibold text-white ${sp.transaction_type === 'rental' ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
                        {sp.transaction_type === 'rental' ? 'RENT' : 'SALE'}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="text-lg font-bold text-gray-900 mb-1">
                        {sp.currency} {sp.price.toLocaleString()}
                        {sp.transaction_type === 'rental' && <span className="text-sm font-normal text-gray-500">/mo</span>}
                      </div>
                      <h3 className="text-sm font-medium text-gray-800 line-clamp-1 mb-1">{sp.title}</h3>
                      <p className="text-xs text-gray-500 line-clamp-1 mb-2">
                        <MapPin className="inline w-3 h-3 mr-0.5" />{sp.city}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        {sp.bedrooms ? <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" />{sp.bedrooms}</span> : null}
                        {sp.bathrooms ? <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{sp.bathrooms}</span> : null}
                        {sp.total_area_sqm ? <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5" />{sp.total_area_sqm}m²</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
