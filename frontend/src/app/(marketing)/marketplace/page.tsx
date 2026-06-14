'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PropertyCard } from '@/components/marketplace/PropertyCard';
import { FilterPanel } from '@/components/marketplace/FilterPanel';
import { LocationSearch } from '@/components/marketplace/LocationSearch';
import { Loader2, Map as MapIcon, List as ListIcon, SlidersHorizontal, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

interface SearchFilters {
  query?: string;
  transaction_type: 'all' | 'rental' | 'sale';
  property_types?: string[];
  min_price?: number;
  max_price?: number;
  bedrooms?: number;
  bathrooms?: number;
  amenities?: string[];
  region?: string;
  city?: string;
  
  // Geospatial filters
  geo_radius?: {
    latitude: number;
    longitude: number;
    radius_km: number;
  };
  
  // Sorting
  sort_by?: 'relevance' | 'price' | 'distance' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

export default function MarketplacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>({
    transaction_type: 'all',
    sort_by: 'created_at',
    sort_order: 'desc'
  });
  const [selectedLocation, setSelectedLocation] = useState<{
    place_name: string;
    center: [number, number];
  } | null>(null);
  const [pagination, setPagination] = useState({
    from: 0,
    size: 20,
    total: 0
  });
  const [aggregations, setAggregations] = useState<any>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load properties when filters change
  useEffect(() => {
    loadProperties();
  }, [filters, pagination.from]);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/marketplace/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...filters,
          from: pagination.from,
          size: pagination.size
        })
      });
      
      if (!response.ok) {
        console.error('Search API error:', response.status);
        setProperties([]);
        setPagination(prev => ({ ...prev, total: 0 }));
        return;
      }
      
      const data = await response.json();
      
      setProperties(data.properties || []);
      setPagination(prev => ({ ...prev, total: data.total || 0 }));
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = (location: any) => {
    setSelectedLocation(location);
    
    // Set radius search centered on selected location
    setFilters(prev => ({
      ...prev,
      geo_radius: {
        latitude: location.center[1],
        longitude: location.center[0],
        radius_km: 10
      },
      sort_by: 'distance'
    }));
  };

  const handlePropertyClick = (property: any) => {
    // Track click event
    fetch('/api/marketplace/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_source: property.source,
        property_id: property.id,
        event_type: 'view',
        session_id: getSessionId(),
        search_query: filters.query,
        search_filters: filters
      })
    });
    
    // Navigate to application page
    router.push(`/apply/${property.permanent_link_token}`);
  };

  return (
    <div className="min-h-screen bg-card">
      {/* Hero Search Section */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 border-b border-indigo-800">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-28 sm:pt-36 md:pt-44 pb-12 sm:pb-16 md:pb-20">
          <div className="max-w-4xl mx-auto text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground mb-3 sm:mb-4">
              Discover Your Dream Property
            </h1>
            <p className="text-sm sm:text-lg text-indigo-100">
              Browse {pagination.total.toLocaleString()}+ verified properties across Ghana
            </p>
          </div>
          
          {/* Search Bar */}
          <div className="max-w-3xl mx-auto">
            <LocationSearch 
              onSelect={handleLocationSelect}
              placeholder="Enter city, neighborhood, or landmark..."
            />
            {selectedLocation && (
              <div className="mt-3 text-center">
                <span className="text-sm text-indigo-100">
                  Showing properties within 10km of{' '}
                  <strong className="text-foreground">{selectedLocation.place_name}</strong>
                  <button
                    onClick={() => {
                      setSelectedLocation(null);
                      setFilters(prev => {
                        const { geo_radius, ...rest } = prev;
                        return { ...rest, sort_by: 'created_at' as any };
                      });
                    }}
                    className="ml-2 text-foreground hover:text-indigo-200 underline"
                  >
                    Clear
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      {mobileFiltersOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-background/50 z-40" onClick={() => setMobileFiltersOpen(false)} />
          <div className="lg:hidden fixed inset-y-0 left-0 w-[85vw] max-w-sm z-50 bg-card overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
              <h3 className="font-bold text-lg text-gray-900">Filters</h3>
              <button onClick={() => setMobileFiltersOpen(false)} className="p-2 text-muted-foreground hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 [&>div]:border-0 [&>div]:shadow-none [&>div]:p-0 [&>div]:rounded-none [&>div>.flex.items-center.justify-between]:hidden">
              <FilterPanel
                filters={filters}
                onFilterChange={setFilters}
                aggregations={aggregations}
              />
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filter Sidebar - Hidden on mobile, visible on desktop */}
          <aside className="hidden lg:block lg:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-24">
              <FilterPanel
                filters={filters}
                onFilterChange={setFilters}
                aggregations={aggregations}
              />
            </div>
          </aside>

          {/* Property List */}
          <main className="flex-1 min-w-0">
            {/* Results Header */}
            <div className="bg-card rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 border border-border shadow-sm flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-gray-900 font-medium text-sm sm:text-base">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </span>
                  ) : (
                    <span>{pagination.total.toLocaleString()} properties</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filters.transaction_type !== 'all' && (
                    <span className="capitalize">{filters.transaction_type} only • </span>
                  )}
                  {filters.region && (
                    <span>
                      {filters.region.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} region
                    </span>
                  )}
                </p>
              </div>

              {/* Filter toggle + Sort */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setMobileFiltersOpen(true)}
                  className="lg:hidden flex items-center gap-1.5 px-2.5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-muted transition-colors"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                </button>
                <div className="relative" ref={sortRef}>
                  <button
                    onClick={() => setSortDropdownOpen(o => !o)}
                    className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-2.5 py-2 text-sm bg-card text-gray-900 hover:bg-muted transition-colors cursor-pointer"
                  >
                    <span>
                      {(() => {
                        const key = `${filters.sort_by}_${filters.sort_order}`;
                        const labels: Record<string, string> = {
                          created_at_desc: 'Newest',
                          price_asc: 'Price ↑',
                          price_desc: 'Price ↓',
                          distance_asc: 'Nearest',
                          views_desc: 'Popular',
                        };
                        return labels[key] || 'Sort';
                      })()}
                    </span>
                    <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sortDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {sortDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-30 py-1 overflow-hidden">
                      {[
                        { value: 'created_at_desc', label: 'Newest First' },
                        { value: 'price_asc', label: 'Price: Low to High' },
                        { value: 'price_desc', label: 'Price: High to Low' },
                        ...(filters.geo_radius ? [{ value: 'distance_asc', label: 'Nearest First' }] : []),
                        { value: 'views_desc', label: 'Most Popular' },
                      ].map(opt => {
                        const isActive = `${filters.sort_by}_${filters.sort_order}` === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              const [sort_by, sort_order] = opt.value.split('_');
                              setFilters(prev => ({ ...prev, sort_by: sort_by as any, sort_order: sort_order as any }));
                              setSortDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                              isActive
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-gray-700 hover:bg-muted'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Property Grid */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
                <p className="text-muted-foreground">Loading properties...</p>
              </div>
            ) : properties.length === 0 ? (
              <div className="bg-card rounded-xl p-12 text-center border border-border shadow-sm">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No properties found</h3>
                  <p className="text-muted-foreground mb-6">Try adjusting your filters or search in a different area</p>
                  <button
                    onClick={() => {
                      setFilters({ transaction_type: 'all', sort_by: 'created_at', sort_order: 'desc' });
                      setSelectedLocation(null);
                    }}
                    className="px-6 py-3 bg-indigo-600 text-foreground rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {properties.map(property => (
                    <PropertyCard 
                      key={property.id} 
                      property={property}
                      onClick={() => handlePropertyClick(property)}
                      showDistance={!!filters.geo_radius}
                    />
                  ))}
                </div>
                
                {/* Pagination */}
                {pagination.total > pagination.size && (
                  <div className="mt-8 sm:mt-10 flex items-center justify-center gap-1 sm:gap-2">
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, from: Math.max(0, prev.from - prev.size) }))}
                      disabled={pagination.from === 0}
                      className="px-3 sm:px-5 py-2 sm:py-2.5 border border-gray-300 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed bg-card text-gray-900 transition-colors font-medium text-sm"
                    >
                      <span className="hidden sm:inline">← </span>Prev
                    </button>
                    <div className="flex items-center gap-2 px-2 sm:px-4">
                      <span className="text-muted-foreground text-xs sm:text-sm">
                        <strong className="text-gray-900">{Math.floor(pagination.from / pagination.size) + 1}</strong>
                        <span className="mx-1">/</span>
                        <strong className="text-gray-900">{Math.ceil(pagination.total / pagination.size)}</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, from: prev.from + prev.size }))}
                      disabled={pagination.from + pagination.size >= pagination.total}
                      className="px-3 sm:px-5 py-2 sm:py-2.5 border border-gray-300 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed bg-card text-gray-900 transition-colors font-medium text-sm"
                    >
                      Next<span className="hidden sm:inline"> →</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// Helper function for session ID (client-side only)
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  
  try {
    let sessionId = localStorage.getItem('marketplace_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      localStorage.setItem('marketplace_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return '';
  }
}
