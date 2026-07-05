export interface PropertyEnrichmentResponse {
  property: {
    id: string;
    title: string;
    description: string;
    price: {
      ghs: number;
      usd: number;
      per_sqm: number | null;
    };
    transaction_type: string;
    rental_period: string | null;
    beds: number;
    baths: number;
    floors: number;
    total_area_sqm: number | null;
    land_area_sqm: number | null;
    built_area_sqm: number | null;
    plot_size_acres: number | null;
    year_built: number | null;
    condition: string | null;
    region: string;
    property_type: string;
    property_sub_type: string | null;
    status: string;
    amenities: string[];
    features: string[];
    parking?: string | number;
    // Data quality metrics inside property
    data_quality: {
      trust_score: number;
      completeness_score: number | null;
      verification_status: string;
      data_source: string;
      last_updated: string;
    };
    images: string[];
    video_url?: string | null;
    location: {
      lat: number;
      lng: number;
      verified: boolean;
      accuracy: number | null;
      coordinates_source?: 'original' | 'ghana_post_gps' | 'street_landmark' | 'neighborhood' | 'city' | 'geocoded' | null;
      geocoding_confidence?: number | null;
    };
    address: {
      street: string | null;
      city: string | null;
      district: string | null;
      landmark: string | null;
      digital_address: string | null;
      formatted: string;
    };
  };
  valuation: {
    low: number;
    high: number;
    median: number;
    confidence: number;
    price_per_sqm: number | null;
    methodology: string;
    comparables_count: number;
    source?: 'redis' | 'calculated';
  };
  market_context: {
    neighborhood_avg_price_sqm: number | null;
    region_avg_price_sqm: number | null;
    price_trend: 'rising' | 'stable' | 'falling' | 'unknown';
    days_on_market: number | null;
  };
  pois: {
    schools: Array<{ name: string; distance: number; lat: number; lng: number }>;
    banks: Array<{ name: string; distance: number; lat: number; lng: number }>;
    hospitals: Array<{ name: string; distance: number; lat: number; lng: number }>;
  };
  comparables: Array<{
    id: string;
    title: string | null;
    price: number;
    price_per_sqm: number | null;
    currency: string;
    beds: number;
    baths: number;
    sqm: number;
    property_type: string | null;
    condition: string | null;
    year_built: number | null;
    image: string;
    distance: number;
    similarity_score: number;
    digital_address: string | null;
  }>;
  nearby: Array<{
    id: string;
    title: string;
    price: number;
    currency: string;
    beds: number;
    baths: number;
    sqm: number;
    property_type: string;
    transaction_type: string;
    image: string;
    distance: number;
    address: string;
    digital_address: string | null;
    location: {
      lat: number;
      lng: number;
    };
  }>;
}
