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
  ArrowRight,
  Navigation,
  ExternalLink,
  Share2,
  Shield,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Camera,
  Building2,
  Phone,
  Mail,
  Globe,
  BadgeCheck,
  Award,
  Home,
  CheckCircle2,
  Flag,
  AlertTriangle,
} from 'lucide-react';
import Image from 'next/image';
import ApplicationForm from '@/components/ApplicationForm';
import NeighborhoodInsights from '@/components/marketplace/NeighborhoodInsights';

interface Listing {
  organization_id: string;
  service: 'property_management' | 'crm';
  company_name?: string | null;
  tagline?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  region?: string | null;
  professional_body?: string | null;
  license_number?: string | null;
  primary_color?: string | null;
  logo_url?: string | null;
  configured?: boolean;
  verified?: boolean;
  verified_at?: string | null;
  owner_authorized?: boolean;
}

interface Property {
  id: string;
  source: 'pm' | 'crm';
  permanent_link_token: string;
  title: string;
  description?: string;
  property_type: string;
  transaction_type: 'rental' | 'sale' | 'lease';
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
  distance_km?: number;
  listing?: Listing | null;
}

export default function PropertyApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [similarProperties, setSimilarProperties] = useState<Property[]>([]);
  const [nearbyHomes, setNearbyHomes] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

      // Load similar properties (matched by type + price band)
      fetch(`/api/marketplace/properties/${token}/similar?limit=6`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.properties) setSimilarProperties(d.properties); })
        .catch(() => {});

      // Load nearby homes (closest public listings by distance, any type)
      fetch(`/api/marketplace/properties/${token}/nearby?limit=6`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.properties) setNearbyHomes(d.properties); })
        .catch(() => {});
    } catch (error: any) {
      console.error('Failed to load property:', error);
      setError(error.message || 'Failed to load property details');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: property?.title ?? 'Property', url: window.location.href }).catch(() => {});
    } else if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading property details...</p>
        </div>
      </div>
    );
  }

  if (error && !property) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-card rounded-2xl p-8 text-center border border-border shadow-sm">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Property Not Found</h2>
          <p className="text-muted-foreground mb-6">
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

  // Region is stored as a code ("greater_accra") — display it as a label ("Greater Accra").
  const formatRegion = (r?: string) =>
    r ? r.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) : '';

  // Backend `address` is "street, city" (may be blank). Clean stray commas, fall back to
  // city, then append the region label — no leading comma, no raw enum.
  const cleanedAddress = (property.address || '').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  const locationText = [cleanedAddress || property.city || '', formatRegion(property.region)]
    .filter(Boolean)
    .join(', ');

  const dealLabel =
    property.transaction_type === 'rental' ? 'For Rent'
    : property.transaction_type === 'lease' ? 'For Lease'
    : 'For Sale';
  const priceSuffix =
    property.transaction_type === 'rental' ? 'per month'
    : property.transaction_type === 'lease' ? 'lease price'
    : 'asking price';

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 to-background pt-24 sm:pt-28 md:pt-32">
      {/* Sub-header: breadcrumb + share */}
      <div className="border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/marketplace')}
              className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Marketplace
            </button>
            <button
              onClick={handleShare}
              className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2 text-sm font-medium"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Link copied' : 'Share'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Hero gallery ─────────────────────────────────────────── */}
        {imageUrls.length > 0 ? (
          <div className="mb-6">
            <div className="hidden md:grid md:grid-cols-[2fr_1fr] gap-2 h-[420px] lg:h-[480px] rounded-2xl overflow-hidden ring-1 ring-border">
              <button className="relative bg-muted group" onClick={() => openLightbox(0)} aria-label="View photo">
                <Image src={imageUrls[0]} alt={property.title} fill className="object-cover group-hover:scale-[1.02] transition-transform duration-500" priority />
                <span className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-indigo-600 shadow-lg">
                  {dealLabel}
                </span>
              </button>
              <div className="grid grid-rows-2 gap-2">
                {[1, 2].map((idx, i) => (
                  <button key={idx} className="relative bg-muted group overflow-hidden" onClick={() => openLightbox(imageUrls[idx] ? idx : 0)} aria-label="View photo">
                    {imageUrls[idx] ? (
                      <Image src={imageUrls[idx]} alt={`${property.title} - ${idx + 1}`} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted"><Camera className="w-8 h-8" /></div>
                    )}
                    {i === 1 && imageUrls.length > 3 && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="text-white text-center">
                          <Camera className="w-6 h-6 mx-auto mb-1" />
                          <span className="text-sm font-semibold">+{imageUrls.length - 3} photos</span>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {/* Mobile */}
            <div className="md:hidden relative h-[280px] sm:h-[380px] bg-muted rounded-2xl overflow-hidden ring-1 ring-border">
              <Image src={imageUrls[0]} alt={property.title} fill className="object-cover" onClick={() => openLightbox(0)} priority />
              <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold text-white bg-indigo-600 shadow-lg">{dealLabel}</span>
              {imageUrls.length > 1 && (
                <button onClick={() => openLightbox(0)} className="absolute bottom-3 right-3 bg-card/90 backdrop-blur-sm text-foreground px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 shadow-sm">
                  <Camera className="w-4 h-4" /> {imageUrls.length} photos
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="h-[280px] sm:h-[380px] bg-gradient-to-br from-muted to-muted/50 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-border">
            <div className="text-center">
              <Home className="w-14 h-14 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Photos coming soon</p>
              <p className="text-muted-foreground/70 text-sm mt-1">Contact the agent for more details</p>
            </div>
          </div>
        )}

        {/* ── Two-column body ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* LEFT: details */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Title + location */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2.5 py-1 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-semibold">{dealLabel}</span>
                <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs font-semibold">{formatPropertyType(property.property_type)}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                  <Eye className="w-3.5 h-3.5" /> {property.views} views
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground tracking-tight mb-2">
                {property.title}
              </h1>
              <div className="flex items-center text-muted-foreground gap-1.5 text-sm sm:text-base">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span>{locationText || 'Location available on request'}</span>
              </div>
              {property.digital_address && (
                <a
                  href={`https://ghanapostgps.com/map?q=${property.digital_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 text-sm font-medium mt-2"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {property.digital_address}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Quick stats bar */}
            <div className="flex flex-wrap gap-2.5">
              {property.bedrooms !== undefined && property.bedrooms !== null && (
                <Stat icon={<Bed className="w-4 h-4" />} value={property.bedrooms} label="Beds" />
              )}
              {property.bathrooms !== undefined && property.bathrooms !== null && (
                <Stat icon={<Bath className="w-4 h-4" />} value={property.bathrooms} label="Baths" />
              )}
              {property.total_area_sqm ? (
                <Stat icon={<Square className="w-4 h-4" />} value={`${property.total_area_sqm}`} label="m²" />
              ) : null}
              {property.parking_spaces ? (
                <Stat icon={<Home className="w-4 h-4" />} value={property.parking_spaces} label="Parking" />
              ) : null}
              {property.year_built ? (
                <Stat icon={<Award className="w-4 h-4" />} value={property.year_built} label="Built" />
              ) : null}
            </div>

            {/* Description */}
            {property.description && (
              <Section title="About this property">
                <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{property.description}</p>
              </Section>
            )}

            {/* Key facts */}
            <Section title="Key facts">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Fact label="Property Type" value={formatPropertyType(property.property_type)} />
                {property.year_built ? <Fact label="Year Built" value={String(property.year_built)} /> : null}
                {property.parking_spaces ? <Fact label="Parking" value={`${property.parking_spaces} spaces`} /> : null}
                {property.land_area_sqm ? <Fact label="Land Area" value={`${property.land_area_sqm} m²`} /> : null}
                {property.total_area_sqm && property.price ? (
                  <Fact label="Price / m²" value={formatPrice(Math.round(property.price / property.total_area_sqm), property.currency)} />
                ) : null}
                {property.property_condition ? (
                  <Fact label="Condition" value={property.property_condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
                ) : null}
                <Fact label="Listed" value={new Date(property.listed_at).toLocaleDateString('en-GB')} />
                {property.price_negotiable ? <Fact label="Negotiable" value="Yes" accent /> : null}
              </div>
            </Section>

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <Section title="Amenities & features">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  {property.amenities.map((amenity, index) => (
                    <div key={index} className="flex items-center gap-2 text-foreground/80">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                      <span className="text-sm">{formatAmenity(amenity)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Map */}
            {property.location && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 p-5 pb-3">
                  <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-lg font-semibold text-foreground">Location</h2>
                </div>
                <div className="h-[280px] sm:h-[360px]">
                  <iframe
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${property.location.lon - 0.01}%2C${property.location.lat - 0.01}%2C${property.location.lon + 0.01}%2C${property.location.lat + 0.01}&layer=mapnik&marker=${property.location.lat}%2C${property.location.lon}`}
                    className="w-full h-full border-0"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {/* Neighbourhood insights — schools/amenities, getting-around, flood, demographics, AI overview */}
            <NeighborhoodInsights token={token} />
          </div>

          {/* RIGHT: sticky sidebar */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-28 space-y-4">
              {/* Price + CTA */}
              <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="mb-4">
                  <div className="text-3xl font-bold text-foreground mb-0.5">
                    {formatPrice(property.price, property.currency)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{priceSuffix}</span>
                    {property.price_negotiable && (
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full text-[11px] font-semibold">Negotiable</span>
                    )}
                  </div>
                </div>

                {error && property && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>
                  </div>
                )}

                {property.source === 'pm' && property.transaction_type === 'rental' ? (
                  <>
                    <button
                      onClick={handleStartApplication}
                      disabled={applying}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {applying ? (<><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>) : (<>Apply to Rent <ArrowRight className="w-5 h-5" /></>)}
                    </button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">Complete tenant application form</p>
                  </>
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">Make an offer or enquire</h3>
                    <p className="text-xs text-muted-foreground mb-3">Fill in your details and the listing team will reach out to you.</p>
                    <ApplicationForm property={property} token={token} />
                  </div>
                )}
              </div>

              {/* Listed by company */}
              <ListedByCard listing={property.listing} />

              {/* Trust note */}
              <div className="flex items-start gap-2.5 px-1">
                <Shield className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Never send money before viewing. Verify ownership documents and deal only with the listing company shown above.
                </p>
              </div>

              {/* Report this listing */}
              <ReportListing token={token} />
            </div>
          </div>
        </div>

        {/* Lightbox */}
        {showLightbox && imageUrls.length > 0 && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
            <button onClick={closeLightbox} className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2">
              <X className="w-7 h-7" />
            </button>
            <div className="absolute top-4 left-4 text-white/80 text-sm font-medium z-10">
              {lightboxIndex + 1} / {imageUrls.length}
            </div>
            {imageUrls.length > 1 && (
              <button onClick={prevImage} className="absolute left-2 sm:left-4 text-white/70 hover:text-white z-10 p-2">
                <ChevronLeft className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>
            )}
            <div className="relative w-full h-full max-w-5xl max-h-[80vh] mx-12 sm:mx-20">
              <Image src={imageUrls[lightboxIndex]} alt={`${property.title} - ${lightboxIndex + 1}`} fill className="object-contain" sizes="100vw" priority />
            </div>
            {imageUrls.length > 1 && (
              <button onClick={nextImage} className="absolute right-2 sm:right-4 text-white/70 hover:text-white z-10 p-2">
                <ChevronRight className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>
            )}
          </div>
        )}

        {/* Nearby homes — closest public listings by distance (any type) */}
        {nearbyHomes.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-foreground mb-1">Nearby homes</h2>
            <p className="text-sm text-muted-foreground mb-4">The closest listings to this property.</p>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
              {nearbyHomes.map((np) => (
                <div key={np.id} className="snap-start shrink-0 w-[280px]">
                  <MiniPropertyCard p={np} onClick={() => router.push(`/apply/${np.permanent_link_token}`)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar properties — matched by type + price band */}
        {similarProperties.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-foreground mb-1">Similar properties</h2>
            <p className="text-sm text-muted-foreground mb-4">Comparable homes by type and price.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {similarProperties.map((sp) => (
                <MiniPropertyCard key={sp.id} p={sp} onClick={() => router.push(`/apply/${sp.permanent_link_token}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small presentational helpers ─────────────────────────────────── */

/** Compact property card, shared by "Nearby homes" + "Similar properties". */
function MiniPropertyCard({ p, onClick }: { p: Property; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const img = p.images?.[0];
  const imgUrl = img ? (typeof img === 'string' ? img : img.url) : null;
  const dist = typeof p.distance_km === 'number'
    ? (p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)} m` : `${p.distance_km.toFixed(1)} km`)
    : null;
  return (
    <div
      onClick={onClick}
      className="bg-card rounded-2xl overflow-hidden border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
    >
      <div className="relative h-44 bg-muted">
        {imgUrl && !imgFailed ? (
          // Plain <img> (not next/image): marketplace thumbnails come from mixed sources
          // (MinIO + scraped) — some hotlink-protected — which 403 the /_next/image
          // optimizer. onError degrades to the placeholder instead of a broken image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={p.title}
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Home className="w-8 h-8" /></div>
        )}
        <span className={`absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white shadow ${p.transaction_type === 'rental' ? 'bg-emerald-500' : p.transaction_type === 'lease' ? 'bg-amber-500' : 'bg-indigo-600'}`}>
          {p.transaction_type === 'rental' ? 'RENT' : p.transaction_type === 'lease' ? 'LEASE' : 'SALE'}
        </span>
        {dist && (
          <span className="absolute top-2.5 right-2.5 px-2 py-1 rounded-full text-[11px] font-semibold text-foreground bg-card/90 backdrop-blur-sm shadow inline-flex items-center gap-1">
            <Navigation className="w-3 h-3" />{dist}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="text-lg font-bold text-foreground mb-1">
          {p.currency} {p.price.toLocaleString()}
          {p.transaction_type === 'rental' && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
        </div>
        <h3 className="text-sm font-medium text-foreground/90 line-clamp-1 mb-1">{p.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-1 mb-2.5">
          <MapPin className="inline w-3 h-3 mr-0.5" />{p.city}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {p.bedrooms ? <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" />{p.bedrooms}</span> : null}
          {p.bathrooms ? <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{p.bathrooms}</span> : null}
          {p.total_area_sqm ? <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5" />{p.total_area_sqm}m²</span> : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
      <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
      <div className="leading-tight">
        <span className="text-base font-bold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground ml-1">{label}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-3 bg-muted/60 rounded-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm font-semibold ${accent ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

/** "Listed by" — the org's per-service branding (company name, logo, contact). */
function ListedByCard({ listing }: { listing?: Listing | null }) {
  if (!listing || !listing.company_name) return null;

  const accent = listing.primary_color || undefined;
  const initials = listing.company_name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const contacts = [
    listing.phone && { icon: <Phone className="w-3.5 h-3.5" />, label: listing.phone, href: `tel:${listing.phone}` },
    listing.email && { icon: <Mail className="w-3.5 h-3.5" />, label: listing.email, href: `mailto:${listing.email}` },
    listing.website && {
      icon: <Globe className="w-3.5 h-3.5" />,
      label: listing.website.replace(/^https?:\/\//, ''),
      href: listing.website.startsWith('http') ? listing.website : `https://${listing.website}`,
    },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; href: string }[];

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="h-1" style={{ backgroundColor: accent || '#4f46e5' }} />
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Listed by</p>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-border">
            {listing.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.logo_url} alt={listing.company_name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-lg font-bold" style={{ color: accent || '#4f46e5' }}>{initials || <Building2 className="w-6 h-6" />}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-bold text-foreground truncate">{listing.company_name}</h3>
              {listing.verified && (
                <span title="Verified company (KYB)" className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-semibold">
                  <BadgeCheck className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            {listing.owner_authorized && (
              <span title="The owner authorised this listing" className="inline-flex items-center gap-0.5 mt-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 text-[10px] font-semibold">
                <ShieldCheck className="w-3 h-3" /> Owner-authorised
              </span>
            )}
            {listing.tagline && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{listing.tagline}</p>}
            {(listing.city || listing.region) && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" />{[listing.city, listing.region].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>

        {(listing.professional_body || listing.license_number) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {listing.professional_body && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-[11px] font-medium text-muted-foreground">
                <Award className="w-3 h-3" />{listing.professional_body}
              </span>
            )}
            {listing.license_number && (
              <span className="px-2 py-0.5 bg-muted rounded-md text-[11px] font-medium text-muted-foreground">
                Lic. {listing.license_number}
              </span>
            )}
          </div>
        )}

        {contacts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            {contacts.map((c, i) => (
              <a key={i} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                 className="flex items-center gap-2.5 text-sm text-foreground/80 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <span className="text-muted-foreground">{c.icon}</span>
                <span className="truncate">{c.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Public "report this listing" — Gate E (abuse reporting). */
const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'scam', label: 'Looks like a scam / fraud' },
  { value: 'already_sold_rented', label: 'Already sold or rented' },
  { value: 'not_owner', label: 'Lister is not the real owner' },
  { value: 'wrong_info', label: 'Wrong or misleading information' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'offensive', label: 'Offensive or inappropriate' },
  { value: 'other', label: 'Something else' },
];

function ReportListing({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('scam');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketplace/properties/${token}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, details, reporter_email: email }),
      });
      if (res.ok) setDone(true);
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors px-1">
        <Flag className="w-3.5 h-3.5" /> Report this listing
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground mb-1">Thank you for reporting</h3>
            <p className="text-sm text-muted-foreground mb-4">Our team will review this listing. If enough people report it, it&apos;s automatically hidden pending review.</p>
            <button onClick={() => setOpen(false)} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Flag className="w-4 h-4 text-red-500" /> Report this listing</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Help keep the marketplace safe. Tell us what&apos;s wrong with this listing.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-indigo-500 outline-none">
                  {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Details (optional)</label>
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="What did you notice?"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Your email (optional)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={submit} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} Submit report
              </button>
            </div>
          </>
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
