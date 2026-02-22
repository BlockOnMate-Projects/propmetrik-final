# PropMetrik Public Marketplace - Technical Specification

**Version:** 2.0 (Enhanced with OpenSearch, Geocoding & Maps)  
**Date:** February 21, 2026  
**Status:** Design Specification  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Marketplace Requirements](#marketplace-requirements)
4. [Architecture Design](#architecture-design)
5. [OpenSearch Integration](#opensearch-integration)
6. [Geocoding & Location Services](#geocoding--location-services)
7. [Mapbox Integration](#mapbox-integration)
8. [Database Schema Changes](#database-schema-changes)
9. [API Endpoints](#api-endpoints)
10. [Frontend Implementation](#frontend-implementation)
11. [Workflow Changes](#workflow-changes)
12. [Migration Strategy](#migration-strategy)
13. [Security & Privacy](#security--privacy)
14. [Performance & Scalability](#performance--scalability)
15. [Testing Strategy](#testing-strategy)
16. [Future Enhancements](#future-enhancements)

---

## Executive Summary

### What is the Marketplace?

The PropMetrik Marketplace is a **public-facing property listing page** that aggregates properties from both:
- **Property Management (PM)** - Rental properties managed by landlords/property managers
- **Deal Management (CRM)** - Sale properties listed by deal managers/agents

### Key Features

#### Core Features
✅ **Unified Property Display** - Single page showing rentals and sales  
✅ **Permanent Application Links** - Properties stay listed indefinitely (no 30-day expiration)  
✅ **Auto-listing by Default** - Properties appear automatically unless explicitly disabled  
✅ **Seamless Application Flow** - Same workflow as current tenant applications  
✅ **Email Notifications** - Landlords/Deal Managers receive applications via email  

#### Advanced Search & Discovery (Zillow/Apartments.com-like)
✅ **OpenSearch Integration** - Lightning-fast full-text search across properties  
✅ **Interactive Map View** - Mapbox-powered map with property markers  
✅ **Geospatial Search** - "Search this area" and radius-based filtering  
✅ **Smart Autocomplete** - Address and location suggestions powered by geocoding  
✅ **Draw on Map** - Draw polygon to search properties in custom areas  
✅ **Nearby Amenities** - Show schools, hospitals, shopping centers near properties  
✅ **Heatmap View** - Visualize property density and price ranges  
✅ **Street View Integration** - Google Street View for property locations  
✅ **Commute Time Calculator** - Calculate travel time to workplace  
✅ **Advanced Filters** - Price range sliders, property age, amenities, pet-friendly, etc.  

### Non-Goals (Out of Scope for v1.0)

❌ Changing existing approval/rejection workflows  
❌ Creating new user roles or permissions  
❌ Building a bidding or offer system  
❌ Adding payment processing to marketplace  
❌ Social features (reviews, ratings, comments)  
❌ Mortgage calculator (future enhancement)  
❌ 3D property tours (future enhancement)  

---

## Current System Analysis

### Property Management (PM) Module

#### Current Tables
```sql
-- Properties table (partitioned by region)
properties (
  id UUID,
  organization_id UUID,
  name VARCHAR,
  address TEXT,
  property_type VARCHAR,
  bedrooms INT,
  bathrooms INT,
  monthly_rent DECIMAL,
  ...
)

-- Application links (temporary, 30-day expiration)
application_links (
  id UUID,
  organization_id UUID,
  property_id UUID,
  token VARCHAR UNIQUE,
  expires_at TIMESTAMPTZ, -- Currently NOW() + 30 days
  max_uses INT,
  current_uses INT,
  is_active BOOLEAN,
  ...
)

-- Applications (tenant submissions)
applications (
  id UUID,
  organization_id UUID,
  property_id UUID,
  status application_status_enum, -- draft, submitted, approved, rejected, etc.
  applicant_full_name VARCHAR,
  applicant_email VARCHAR,
  applicant_phone VARCHAR,
  ...
)
```

#### Current Workflow
1. **Property Manager** creates a property in their dashboard
2. **Property Manager** generates an application link (default 30-day expiration)
3. **Property Manager** shares link via WhatsApp/Email/SMS to prospective tenants
4. **Tenant** clicks link → redirected to tenant portal `/apply/[token]`
5. **Tenant** fills out application form and submits
6. **System** auto-submits application (status = 'submitted')
7. **Property Manager** receives email notification
8. **Property Manager** reviews in dashboard → approves/rejects
9. **On approval** → Generate lease → E-sign workflow

#### Current API Endpoints
```
GET  /api/v1/pm/application-links/:token/validate
POST /api/v1/pm/application-links/:token/apply
POST /api/v1/pm/application-links
```

---

### Deal Management (CRM) Module

#### Current Tables
```sql
-- CRM Properties (standalone, not partitioned)
crm_properties (
  id UUID,
  organization_id UUID,
  title VARCHAR,
  property_type VARCHAR,
  transaction_type VARCHAR, -- 'sale', 'rental', 'lease'
  price DECIMAL,
  address_city VARCHAR,
  region VARCHAR,
  status VARCHAR, -- 'pending', 'active', 'under_offer', 'sold', 'rented'
  ...
)

-- Contacts (leads/buyers)
contacts (
  id UUID,
  organization_id UUID,
  first_name VARCHAR,
  last_name VARCHAR,
  primary_phone VARCHAR,
  email VARCHAR,
  lead_status lead_status_enum, -- 'new', 'contacted', 'qualified', 'negotiating'
  ...
)

-- Deals (sales pipeline)
deals (
  id UUID,
  organization_id UUID,
  primary_contact_id UUID,
  property_ids UUID[], -- Array of property IDs
  deal_status deal_status_enum, -- 'active', 'won', 'lost'
  ...
)
```

#### Current Workflow (Assumed)
1. **Deal Manager** creates property listing in CRM
2. **Deal Manager** manually generates a link or shares property details
3. **Prospective Buyer** inquires via phone/email/WhatsApp
4. **Deal Manager** creates contact and deal manually
5. **Deal Manager** follows up through pipeline stages
6. **On deal win** → Contract signing via e-sign

---

## Marketplace Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Display properties from both PM and CRM on a single public page | Must Have |
| FR-2 | Properties must be listed automatically when created (opt-out model) | Must Have |
| FR-3 | Property managers can disable/enable marketplace listing per property | Must Have |
| FR-4 | Application links must be permanent (no expiration by default) | Must Have |
| FR-5 | Clicking "Apply" on a property must use existing tenant application flow | Must Have |
| FR-6 | Landlords receive email notifications for marketplace applications | Must Have |
| FR-7 | Full-text search across properties (title, description, location) | Must Have |
| FR-8 | Interactive map view with property markers | Must Have |
| FR-9 | Geospatial search within radius or drawn polygon | Must Have |
| FR-10 | Address autocomplete with geocoding | Must Have |
| FR-11 | Filter by: transaction type, price range, beds, baths, property type | Must Have |
| FR-12 | Display property details: images, price/rent, beds, baths, location | Must Have |
| FR-13 | Show nearby amenities (schools, hospitals, transit) | Should Have |
| FR-14 | Calculate commute time to user's workplace | Should Have |
| FR-15 | Properties must show basic contact info (phone/email) for inquiries | Should Have |
| FR-16 | Marketplace must be mobile-responsive with touch-friendly map | Must Have |
| FR-17 | Save search preferences and get alerts for new listings | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Marketplace page must load in < 2 seconds | Must Have |
| NFR-2 | Support 1000+ concurrent users browsing marketplace | Must Have |
| NFR-3 | Search queries must return results in < 300ms (via OpenSearch) | Must Have |
| NFR-4 | Map view must render 1000+ markers smoothly with clustering | Must Have |
| NFR-5 | Geocoding API calls must complete in < 200ms | Should Have |
| NFR-6 | Application submission must complete in < 2 seconds | Must Have |
| NFR-7 | System must not disrupt existing PM/CRM workflows | Must Have |
| NFR-8 | OpenSearch index must sync with PostgreSQL in near real-time | Must Have |
| NFR-9 | Map tiles must load progressively for slow connections | Should Have |

---

## Architecture Design

### High-Level Architecture (Enhanced with OpenSearch, Geocoding & Maps)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend Layer (Next.js)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Public Marketplace (/marketplace)                                      │
│  ┌──────────────────────┬──────────────────────┐                       │
│  │  List View           │  Map View (Mapbox)   │                       │
│  │  - Property Cards    │  - Property Markers  │                       │
│  │  - Search Bar        │  - Cluster Groups    │                       │
│  │  - Filter Sidebar    │  - Draw Tool         │                       │
│  │  - Autocomplete      │  - Heatmap Layer     │                       │
│  └──────────────────────┴──────────────────────┘                       │
│                                                                          │
│  React Components:                                                      │
│  - MapView (Mapbox GL JS)                                              │
│  - SearchBar (Autocomplete with Mapbox Geocoding)                     │
│  - PropertyCard, FilterSidebar, PropertyDetail                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      API Layer (Node.js/Express)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  MarketplaceService                                                     │
│  ├─ GET /marketplace/search (→ OpenSearch)                             │
│  ├─ GET /marketplace/properties/:id                                     │
│  ├─ GET /marketplace/autocomplete (→ Mapbox Geocoding)                 │
│  ├─ POST /marketplace/geocode (→ Mapbox/Google Geocoding)             │
│  └─ GET /marketplace/nearby-amenities (→ Mapbox/Overpass API)         │
│                                                                          │
│  GeocodingService                                                       │
│  ├─ Forward geocoding (address → lat/lng)                              │
│  ├─ Reverse geocoding (lat/lng → address)                              │
│  └─ Batch geocoding for bulk property updates                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────┬────────────────────┬──────────────────────────┐
│   PostgreSQL         │   OpenSearch       │   External APIs          │
├──────────────────────┼────────────────────┼──────────────────────────┤
│  properties          │  properties_index  │  Mapbox Geocoding API    │
│  crm_properties      │  - Full-text       │  Mapbox Maps API         │
│  marketplace_enabled │  - Geo queries     │  (Google Maps fallback)  │
│  lat/lng columns     │  - Faceted search  │  Overpass API (OSM)      │
│                      │  - Aggregations    │                          │
│  ↓ Change Data       │                    │                          │
│  Capture (CDC)       │                    │                          │
│  via Debezium        │                    │                          │
└──────────────────────┴────────────────────┴──────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Search Engine** | OpenSearch 2.x | Full-text search, geospatial queries, faceted filtering |
| **Mapping** | Mapbox GL JS v3 | Interactive maps, markers, clustering, draw tools |
| **Geocoding** | Mapbox Geocoding API | Address autocomplete, forward/reverse geocoding |
| **Database** | PostgreSQL + PostGIS | Primary data store with geospatial extensions |
| **Cache** | Redis | Geocoding cache, session storage |
| **CDN** | CloudFront | Map tiles, images, static assets |
| **Monitoring** | Datadog/Grafana | Performance metrics, search analytics |

---

## OpenSearch Integration

### Why OpenSearch?

**OpenSearch** (fork of Elasticsearch) provides:
- ⚡ **Lightning-fast full-text search** across millions of properties
- 🗺️ **Native geospatial queries** (radius, bounding box, polygon)
- 📊 **Faceted search** (aggregations for filters: price ranges, bedroom counts)
- 🔍 **Fuzzy matching** for typo-tolerant search
- 📈 **Relevance scoring** to rank best matches first
- 🚀 **Horizontal scalability** for growth

### OpenSearch Index Schema

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "source": { "type": "keyword" },
      "permanent_link_token": { "type": "keyword" },
      
      "title": { 
        "type": "text",
        "analyzer": "english",
        "fields": {
          "keyword": { "type": "keyword" },
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete_analyzer"
          }
        }
      },
      
      "description": { 
        "type": "text",
        "analyzer": "english" 
      },
      
      "property_type": { "type": "keyword" },
      "transaction_type": { "type": "keyword" },
      
      "location": {
        "type": "geo_point"
      },
      
      "address": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      
      "city": { "type": "keyword" },
      "region": { "type": "keyword" },
      "neighborhood": { "type": "keyword" },
      "digital_address": { "type": "keyword" },
      
      "price": { "type": "double" },
      "currency": { "type": "keyword" },
      "price_negotiable": { "type": "boolean" },
      
      "bedrooms": { "type": "integer" },
      "bathrooms": { "type": "integer" },
      "total_area_sqm": { "type": "double" },
      "land_area_sqm": { "type": "double" },
      "year_built": { "type": "integer" },
      "floors": { "type": "integer" },
      
      "features": { "type": "keyword" },
      "amenities": { "type": "keyword" },
      
      "images": {
        "type": "nested",
        "properties": {
          "url": { "type": "keyword" },
          "caption": { "type": "text" }
        }
      },
      
      "contact_phone": { "type": "keyword" },
      "contact_email": { "type": "keyword" },
      
      "organization_name": { "type": "text" },
      "organization_id": { "type": "keyword" },
      
      "marketplace_enabled": { "type": "boolean" },
      "listed_at": { "type": "date" },
      "updated_at": { "type": "date" },
      "views": { "type": "integer" },
      "clicks": { "type": "integer" },
      
      "status": { "type": "keyword" }
    }
  },
  "settings": {
    "index": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s"
    },
    "analysis": {
      "analyzer": {
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "autocomplete_filter"]
        }
      },
      "filter": {
        "autocomplete_filter": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 20
        }
      }
    }
  }
}
```

### OpenSearch Query Examples

#### 1. Full-Text Search with Geo-Radius

```json
POST /properties/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "modern apartment swimming pool",
            "fields": ["title^3", "description^2", "amenities"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        },
        {
          "geo_distance": {
            "distance": "5km",
            "location": {
              "lat": 5.6037,
              "lon": -0.1870
            }
          }
        }
      ],
      "filter": [
        { "term": { "marketplace_enabled": true } },
        { "term": { "transaction_type": "rental" } },
        { "range": { "price": { "gte": 1000, "lte": 3000 } } },
        { "range": { "bedrooms": { "gte": 2 } } }
      ]
    }
  },
  "sort": [
    {
      "_geo_distance": {
        "location": {
          "lat": 5.6037,
          "lon": -0.1870
        },
        "order": "asc",
        "unit": "km"
      }
    }
  ],
  "aggs": {
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 1000 },
          { "from": 1000, "to": 2000 },
          { "from": 2000, "to": 5000 },
          { "from": 5000 }
        ]
      }
    },
    "property_types": {
      "terms": { "field": "property_type", "size": 20 }
    },
    "cities": {
      "terms": { "field": "city", "size": 20 }
    }
  },
  "from": 0,
  "size": 20,
  "track_total_hits": true
}
```

#### 2. Search Within Polygon (Draw on Map)

```json
POST /properties/_search
{
  "query": {
    "bool": {
      "must": [
        { "match_all": {} }
      ],
      "filter": [
        {
          "geo_polygon": {
            "location": {
              "points": [
                { "lat": 5.55, "lon": -0.20 },
                { "lat": 5.65, "lon": -0.20 },
                { "lat": 5.65, "lon": -0.15 },
                { "lat": 5.55, "lon": -0.15 }
              ]
            }
          }
        },
        { "term": { "marketplace_enabled": true } }
      ]
    }
  }
}
```

#### 3. Autocomplete Search

```json
POST /properties/_search
{
  "query": {
    "multi_match": {
      "query": "eas leg",
      "fields": ["title.autocomplete", "address.autocomplete", "neighborhood.autocomplete"],
      "type": "bool_prefix"
    }
  },
  "size": 10
}
```

### Data Synchronization Strategy

**PostgreSQL → OpenSearch** sync using **Debezium CDC** (Change Data Capture):

```yaml
# docker-compose.yml addition
debezium:
  image: debezium/connect:2.4
  environment:
    - BOOTSTRAP_SERVERS=kafka:9092
    - CONFIG_STORAGE_TOPIC=debezium_configs
    - OFFSET_STORAGE_TOPIC=debezium_offsets
  depends_on:
    - kafka
    - postgres
    - opensearch

# Connector configuration
{
  "name": "propmetrik-properties-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "propmetrik",
    "database.password": "***",
    "database.dbname": "propmetrik",
    "table.include.list": "public.properties,public.crm_properties",
    "plugin.name": "pgoutput",
    "transforms": "route",
    "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.route.regex": ".*",
    "transforms.route.replacement": "opensearch.properties"
  }
}
```

**Alternative: Application-Level Sync** (simpler for MVP):

```typescript
// backend/src/services/marketplace/opensearchSync.ts

export class OpenSearchSyncService {
  private client: OpenSearchClient;

  async syncProperty(property: Property | CRMProperty, source: 'pm' | 'crm') {
    const document = this.transformToOpenSearchDoc(property, source);
    
    await this.client.index({
      index: 'properties',
      id: `${source}_${property.id}`,
      body: document,
      refresh: false // Bulk refresh every 5s
    });
  }

  async deleteProperty(id: string, source: 'pm' | 'crm') {
    await this.client.delete({
      index: 'properties',
      id: `${source}_${id}`
    });
  }

  private transformToOpenSearchDoc(property: any, source: string) {
    return {
      id: property.id,
      source,
      title: property.name || property.title,
      description: property.description,
      location: {
        lat: property.latitude,
        lon: property.longitude
      },
      price: source === 'pm' ? property.monthly_rent : property.price,
      // ... map all fields
    };
  }
}
```

Hook into property service:

```typescript
// After property creation/update
await openSearchSyncService.syncProperty(property, 'pm');
```

---

## Geocoding & Location Services

### Geocoding Strategy

**Primary:** Mapbox Geocoding API  
**Fallback:** Google Maps Geocoding API  
**Cache:** Redis (30-day TTL)  

### Why Mapbox Geocoding?

- ✅ **Cost-effective** - $0.50 per 1000 requests (vs Google $5 per 1000)
- ✅ **Fast** - Average 150ms response time
- ✅ **Accurate** - Especially good for Ghana addresses
- ✅ **Autocomplete** - Built-in suggestions
- ✅ **Batch geocoding** - Up to 50 addresses per request

### Geocoding Service Implementation

```typescript
// backend/src/services/marketplace/geocodingService.ts

import axios from 'axios';
import { createClient } from 'redis';

interface GeocodingResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  place_name?: string;
  accuracy?: string; // 'rooftop', 'street', 'city'
}

export class GeocodingService {
  private mapboxToken: string;
  private googleApiKey: string;
  private redisClient: ReturnType<typeof createClient>;

  constructor() {
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN!;
    this.googleApiKey = process.env.GOOGLE_MAPS_API_KEY!;
    this.redisClient = createClient({ url: process.env.REDIS_URL });
    this.redisClient.connect();
  }

  /**
   * Forward geocoding: Address → Coordinates
   */
  async geocode(address: string): Promise<GeocodingResult | null> {
    // Check cache first
    const cacheKey = `geocode:${address}`;
    const cached = await this.redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // Try Mapbox first
      const result = await this.geocodeWithMapbox(address);
      
      // Cache for 30 days
      await this.redisClient.setEx(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(result));
      
      return result;
    } catch (error) {
      console.error('Mapbox geocoding failed, trying Google:', error);
      
      try {
        // Fallback to Google
        const result = await this.geocodeWithGoogle(address);
        await this.redisClient.setEx(cacheKey, 30 * 24 * 60 * 60, JSON.stringify(result));
        return result;
      } catch (googleError) {
        console.error('Google geocoding also failed:', googleError);
        return null;
      }
    }
  }

  /**
   * Reverse geocoding: Coordinates → Address
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    const cacheKey = `reverse:${latitude},${longitude}`;
    const cached = await this.redisClient.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;
      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          types: 'address,poi'
        }
      });

      const address = response.data.features[0]?.place_name || null;
      if (address) {
        await this.redisClient.setEx(cacheKey, 30 * 24 * 60 * 60, address);
      }
      return address;
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
      return null;
    }
  }

  /**
   * Autocomplete suggestions
   */
  async autocomplete(query: string, proximity?: { lat: number; lng: number }): Promise<Array<{
    place_name: string;
    center: [number, number]; // [lng, lat]
    context?: any;
  }>> {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
      const params: any = {
        access_token: this.mapboxToken,
        country: 'GH', // Restrict to Ghana
        types: 'address,locality,place,neighborhood',
        autocomplete: true,
        limit: 10
      };

      if (proximity) {
        params.proximity = `${proximity.lng},${proximity.lat}`;
      }

      const response = await axios.get(url, { params });
      return response.data.features;
    } catch (error) {
      console.error('Autocomplete failed:', error);
      return [];
    }
  }

  /**
   * Batch geocoding (up to 50 addresses)
   */
  async batchGeocode(addresses: string[]): Promise<Map<string, GeocodingResult | null>> {
    const results = new Map<string, GeocodingResult | null>();
    
    // Process in chunks of 10 (rate limiting)
    const chunks = this.chunkArray(addresses, 10);
    
    for (const chunk of chunks) {
      const promises = chunk.map(address => 
        this.geocode(address).then(result => ({ address, result }))
      );
      
      const chunkResults = await Promise.all(promises);
      chunkResults.forEach(({ address, result }) => {
        results.set(address, result);
      });
      
      // Rate limiting: wait 100ms between chunks
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  /**
   * Get nearby amenities (schools, hospitals, etc.)
   */
  async getNearbyAmenities(
    latitude: number,
    longitude: number,
    categories: string[] = ['school', 'hospital', 'shopping'],
    radius: number = 2000 // meters
  ) {
    try {
      // Using Mapbox Tilequery API or Overpass API for OSM data
      const promises = categories.map(category => 
        this.queryAmenities(latitude, longitude, category, radius)
      );
      
      const results = await Promise.all(promises);
      
      return categories.reduce((acc, category, index) => {
        acc[category] = results[index];
        return acc;
      }, {} as Record<string, any[]>);
    } catch (error) {
      console.error('Failed to fetch nearby amenities:', error);
      return {};
    }
  }

  // Private methods

  private async geocodeWithMapbox(address: string): Promise<GeocodingResult> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
    const response = await axios.get(url, {
      params: {
        access_token: this.mapboxToken,
        country: 'GH',
        limit: 1
      }
    });

    const feature = response.data.features[0];
    if (!feature) {
      throw new Error('No results found');
    }

    return {
      latitude: feature.center[1],
      longitude: feature.center[0],
      formatted_address: feature.place_name,
      place_name: feature.text,
      accuracy: feature.properties?.accuracy || 'street'
    };
  }

  private async geocodeWithGoogle(address: string): Promise<GeocodingResult> {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const response = await axios.get(url, {
      params: {
        address,
        key: this.googleApiKey,
        components: 'country:GH'
      }
    });

    const result = response.data.results[0];
    if (!result) {
      throw new Error('No results found');
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formatted_address: result.formatted_address,
      accuracy: result.geometry.location_type.toLowerCase()
    };
  }

  private async queryAmenities(lat: number, lng: number, category: string, radius: number) {
    // Using Overpass API for OpenStreetMap data
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const query = `
      [out:json];
      (
        node["amenity"="${category}"](around:${radius},${lat},${lng});
        way["amenity"="${category}"](around:${radius},${lat},${lng});
      );
      out center;
    `;

    try {
      const response = await axios.post(overpassUrl, `data=${encodeURIComponent(query)}`);
      return response.data.elements.map((el: any) => ({
        name: el.tags.name || 'Unknown',
        lat: el.lat || el.center.lat,
        lng: el.lon || el.center.lon,
        distance: this.calculateDistance(lat, lng, el.lat || el.center.lat, el.lon || el.center.lon)
      }));
    } catch (error) {
      console.error(`Failed to query ${category} amenities:`, error);
      return [];
    }
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export const geocodingService = new GeocodingService();
```

### Auto-Geocoding Properties

When properties are created without coordinates, auto-geocode:

```typescript
// In propertyService.createProperty()
if (!property.latitude || !property.longitude) {
  const fullAddress = `${property.address}, ${property.city}, ${property.region}, Ghana`;
  const geocoded = await geocodingService.geocode(fullAddress);
  
  if (geocoded) {
    property.latitude = geocoded.latitude;
    property.longitude = geocoded.longitude;
    
    // Update database
    await db.query(
      'UPDATE properties SET latitude = $1, longitude = $2 WHERE id = $3',
      [geocoded.latitude, geocoded.longitude, property.id]
    );
    
    // Sync to OpenSearch
    await openSearchSyncService.syncProperty(property, 'pm');
  }
}
```

---

## Mapbox Integration

### Why Mapbox?

**Mapbox** is superior to Google Maps for property marketplaces:
- 🎨 **Customizable styling** - Match your brand
- 🚀 **Better performance** - WebGL-based rendering
- 💰 **Cost-effective** - $5 per 1000 map loads (vs Google $7)
- 🗺️ **Advanced features** - Clustering, heatmaps, 3D buildings
- 📱 **Mobile-optimized** - Smooth touch interactions
- 🔧 **Developer-friendly** - Excellent documentation

### Mapbox Setup

#### Installation

```bash
# Frontend
npm install mapbox-gl react-map-gl @mapbox/mapbox-gl-draw @mapbox/mapbox-gl-geocoder

# Backend
npm install @mapbox/mapbox-sdk
```

#### Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoicHJvcG1ldHJpayIsImEiOiJja...

# Backend (.env)
MAPBOX_ACCESS_TOKEN=sk.eyJ1IjoicHJvcG1ldHJpayIsImEiOiJja...
MAPBOX_GEOCODING_URL=https://api.mapbox.com/geocoding/v5
MAPBOX_DIRECTIONS_URL=https://api.mapbox.com/directions/v5
```

### React Map Component

```tsx
// frontend/src/components/marketplace/MapView.tsx

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { 
  Marker, 
  Popup, 
  NavigationControl, 
  GeolocateControl,
  ScaleControl,
  Layer,
  Source
} from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

interface MapViewProps {
  properties: MarketplaceProperty[];
  onBoundsChange?: (bounds: any) => void;
  onPolygonDrawn?: (polygon: any) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  showClustering?: boolean;
  showHeatmap?: boolean;
}

export function MapView({
  properties,
  onBoundsChange,
  onPolygonDrawn,
  center = { lat: 5.6037, lng: -0.1870 }, // Accra
  zoom = 11,
  showClustering = true,
  showHeatmap = false
}: MapViewProps) {
  const mapRef = useRef<any>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<MarketplaceProperty | null>(null);
  const [viewState, setViewState] = useState({
    latitude: center.lat,
    longitude: center.lng,
    zoom: zoom
  });

  // Initialize MapboxDraw
  useEffect(() => {
    if (mapRef.current && !drawRef.current) {
      const map = mapRef.current.getMap();
      
      drawRef.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true
        },
        defaultMode: 'simple_select'
      });
      
      map.addControl(drawRef.current);

      // Listen for polygon creation
      map.on('draw.create', (e: any) => {
        const polygon = e.features[0];
        onPolygonDrawn?.(polygon.geometry.coordinates);
      });

      map.on('draw.update', (e: any) => {
        const polygon = e.features[0];
        onPolygonDrawn?.(polygon.geometry.coordinates);
      });

      map.on('draw.delete', () => {
        onPolygonDrawn?.(null);
      });
    }
  }, [mapRef.current]);

  // Handle bounds change
  const handleMoveEnd = useCallback(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      const bounds = map.getBounds();
      onBoundsChange?.({
        ne: bounds.getNorthEast(),
        sw: bounds.getSouthWest()
      });
    }
  }, [onBoundsChange]);

  // Convert properties to GeoJSON for clustering
  const propertiesGeoJSON = {
    type: 'FeatureCollection' as const,
    features: properties.map(property => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [property.longitude, property.latitude]
      },
      properties: {
        id: property.id,
        title: property.title,
        price: property.price,
        bedrooms: property.bedrooms,
        transaction_type: property.transaction_type,
        permanent_link_token: property.permanent_link_token
      }
    }))
  };

  // Heatmap layer style
  const heatmapLayer = {
    id: 'properties-heatmap',
    type: 'heatmap' as const,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'price'], 0, 0, 10000, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(33,102,172,0)',
        0.2, 'rgb(103,169,207)',
        0.4, 'rgb(209,229,240)',
        0.6, 'rgb(253,219,199)',
        0.8, 'rgb(239,138,98)',
        1, 'rgb(178,24,43)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, 20],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 15, 0]
    }
  };

  // Cluster layer styles
  const clusterLayer = {
    id: 'clusters',
    type: 'circle' as const,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step',
        ['get', 'point_count'],
        '#51bbd6', 20,
        '#f1f075', 50,
        '#f28cb1'
      ],
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        20, 20,
        30, 50,
        40
      ]
    }
  };

  const clusterCountLayer = {
    id: 'cluster-count',
    type: 'symbol' as const,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12
    }
  };

  const unclusteredPointLayer = {
    id: 'unclustered-point',
    type: 'circle' as const,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['match', ['get', 'transaction_type'], 'rental', '#2563eb', '#10b981'],
      'circle-radius': 8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff'
    }
  };

  return (
    <div className="h-full w-full relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onMoveEnd={handleMoveEnd}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Controls */}
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />
        <ScaleControl />

        {/* Search this area button */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
          <button
            onClick={handleMoveEnd}
            className="bg-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-50"
          >
            🔍 Search this area
          </button>
        </div>

        {/* Heatmap Layer */}
        {showHeatmap && (
          <Source
            id="properties-heatmap"
            type="geojson"
            data={propertiesGeoJSON}
          >
            <Layer {...heatmapLayer} />
          </Source>
        )}

        {/* Clustering enabled */}
        {showClustering ? (
          <Source
            id="properties"
            type="geojson"
            data={propertiesGeoJSON}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
          </Source>
        ) : (
          // Individual markers
          properties.map(property => (
            <Marker
              key={property.id}
              latitude={property.latitude}
              longitude={property.longitude}
              onClick={() => setSelectedProperty(property)}
            >
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold
                ${property.transaction_type === 'rental' ? 'bg-blue-600' : 'bg-green-600'}
                hover:scale-110 transition cursor-pointer
              `}>
                {property.bedrooms}
              </div>
            </Marker>
          ))
        )}

        {/* Popup for selected property */}
        {selectedProperty && (
          <Popup
            latitude={selectedProperty.latitude}
            longitude={selectedProperty.longitude}
            onClose={() => setSelectedProperty(null)}
            closeOnClick={false}
          >
            <div className="p-2">
              <img 
                src={selectedProperty.images[0]?.url || '/placeholder.jpg'} 
                alt={selectedProperty.title}
                className="w-48 h-32 object-cover rounded mb-2"
              />
              <h3 className="font-semibold text-sm">{selectedProperty.title}</h3>
              <p className="text-xs text-gray-600">{selectedProperty.city}</p>
              <p className="text-sm font-bold text-blue-600 mt-1">
                {selectedProperty.currency} {selectedProperty.price.toLocaleString()}
                {selectedProperty.transaction_type === 'rental' && '/month'}
              </p>
              <div className="flex gap-2 text-xs text-gray-700 mt-1">
                <span>🛏️ {selectedProperty.bedrooms}</span>
                <span>🚿 {selectedProperty.bathrooms}</span>
              </div>
              <button
                onClick={() => window.location.href = `/apply/${selectedProperty.permanent_link_token}`}
                className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
              >
                Apply Now
              </button>
            </div>
          </Popup>
        )}
      </Map>

      {/* Map legend */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg">
        <h4 className="font-semibold text-sm mb-2">Legend</h4>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-full bg-blue-600"></div>
            <span>For Rent</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-full bg-green-600"></div>
            <span>For Sale</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Geocoding Autocomplete Component

```tsx
// frontend/src/components/marketplace/LocationSearch.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPinIcon } from 'lucide-react';

interface LocationSearchProps {
  onLocationSelect: (location: { place_name: string; center: [number, number] }) => void;
  placeholder?: string;
}

export function LocationSearch({ onLocationSelect, placeholder = 'Search location...' }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/marketplace/autocomplete?q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setIsOpen(true);
      } catch (error) {
        console.error('Autocomplete failed:', error);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSelect = (suggestion: any) => {
    setQuery(suggestion.place_name);
    setIsOpen(false);
    onLocationSelect(suggestion);
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPinIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(suggestions.length > 0)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSelect(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">{suggestion.text}</p>
                  <p className="text-xs text-gray-500">{suggestion.place_name}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

###
      |                            | (permanent_link_token=...)| 
      |                            |                          |
      |                            |<-------------------------|
      |<---------------------------|                          |
      |  Property Created          |                          |
      |  (Auto-listed on marketplace)|                        |
```

#### Applying for a Property from Marketplace

```
Tenant                     Marketplace Page           Backend               Database
  |                              |                        |                     |
  | Browse properties            |                        |                     |
  |----------------------------->|                        |                     |
  |                              | GET /marketplace/properties                  |
  |                              |----------------------->|                     |
  |                              |                        | SELECT FROM         |
  |                              |                        | properties/crm_props|
  |                              |                        |-------------------->|
  |                              |<-----------------------|                     |
  | Display property cards       |                        |                     |
  |<-----------------------------|                        |                     |
  |                              |                        |                     |
  | Click "Apply"                |                        |                     |
  |----------------------------->|                        |                     |
  |                              | Redirect to            |                     |
  |                              | /apply/[permanent_token]                     |
  |----------------------------->|                        |                     |
  |                              |                        | Validate token      |
  |                              |                        |-------------------->|
  |                              |<-----------------------|                     |
  | Show Application Form        |                        |                     |
  |<-----------------------------|                        |                     |
  |                              |                        |                     |
  | Submit Application           |                        |                     |
  |-------------------------------------------------->|                        |
  |                              |                        | INSERT application  |
  |                              |                        |-------------------->|
  |                              |                        | (status='submitted')|
  |                              |                        |                     |
  |                              |                        | Send Email to       |
  |                              |                        | Property Manager    |
  |<--------------------------------------------------|                        |
  | Application Submitted        |                        |                     |
```

---

## Database Schema Changes

### 0. Enable PostGIS Extension

```sql
-- Migration: XXX_enable_postgis.sql

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify installation
SELECT PostGIS_Version();
```

### 1. Add Marketplace & Geospatial Columns to Properties Table

```sql
-- Migration: XXX_add_marketplace_and_geo_to_properties.sql

-- Add marketplace columns
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS permanent_link_token VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS marketplace_listed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS marketplace_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketplace_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255), -- For filtering
ADD COLUMN IF NOT EXISTS geocoding_accuracy VARCHAR(50); -- 'rooftop', 'street', 'city'

-- Ensure lat/lng columns exist (should already be there)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- Add PostGIS geometry column for advanced geospatial queries
SELECT AddGeometryColumn('public', 'properties', 'geom', 4326, 'POINT', 2);

-- Populate geom from lat/lng for existing properties
UPDATE properties 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geom IS NULL;

-- Generate permanent tokens for existing properties
UPDATE properties
SET permanent_link_token = encode(gen_random_bytes(32), 'hex')
WHERE permanent_link_token IS NULL;

-- Create indexes for marketplace queries
CREATE INDEX IF NOT EXISTS idx_properties_marketplace 
ON properties(marketplace_enabled, marketplace_listed_at DESC) 
WHERE marketplace_enabled = TRUE;

-- Create spatial index for geospatial queries (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_properties_geom_gist 
ON properties USING GIST(geom)
WHERE geom IS NOT NULL;

-- Create index for lat/lng (fallback for simpler queries)
CREATE INDEX IF NOT EXISTS idx_properties_coordinates 
ON properties(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for region-based queries
CREATE INDEX IF NOT EXISTS idx_properties_location 
ON properties(region, city, neighborhood)
WHERE marketplace_enabled = TRUE;

-- Add constraint to ensure token uniqueness
ALTER TABLE properties 
ADD CONSTRAINT IF NOT EXISTS unique_permanent_link_token UNIQUE (permanent_link_token);

-- Add trigger to auto-update geom when lat/lng changes
CREATE OR REPLACE FUNCTION update_properties_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER properties_geom_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON properties
FOR EACH ROW
EXECUTE FUNCTION update_properties_geom();
```

### 2. Add Marketplace & Geospatial Columns to CRM Properties Table

```sql
-- Migration: XXX_add_marketplace_and_geo_to_crm_properties.sql

-- Add marketplace columns
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS permanent_link_token VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS marketplace_listed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS marketplace_views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketplace_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255),
ADD COLUMN IF NOT EXISTS geocoding_accuracy VARCHAR(50);

-- Ensure lat/lng columns exist
ALTER TABLE crm_properties 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- Add PostGIS geometry column
SELECT AddGeometryColumn('public', 'crm_properties', 'geom', 4326, 'POINT', 2);

-- Populate geom from lat/lng
UPDATE crm_properties 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geom IS NULL;

-- Generate permanent tokens
UPDATE crm_properties
SET permanent_link_token = encode(gen_random_bytes(32), 'hex')
WHERE permanent_link_token IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crm_properties_marketplace 
ON crm_properties(marketplace_enabled, marketplace_listed_at DESC) 
WHERE marketplace_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_crm_properties_geom_gist 
ON crm_properties USING GIST(geom)
WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_properties_coordinates 
ON crm_properties(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_properties_location 
ON crm_properties(region, address_city, neighborhood)
WHERE marketplace_enabled = TRUE;

ALTER TABLE crm_properties 
ADD CONSTRAINT IF NOT EXISTS unique_crm_permanent_link_token UNIQUE (permanent_link_token);

-- Add trigger to auto-update geom
CREATE OR REPLACE FUNCTION update_crm_properties_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_properties_geom_update
BEFORE INSERT OR UPDATE OF latitude, longitude ON crm_properties
FOR EACH ROW
EXECUTE FUNCTION update_crm_properties_geom();
```

### 3. Update Application Links to Support Permanent Links

```sql
-- Migration: XXX_support_permanent_application_links.sql

-- Add support for NULL expires_at (permanent links)
ALTER TABLE application_links 
ALTER COLUMN expires_at DROP NOT NULL;

-- Add flag to indicate permanent links
ALTER TABLE application_links 
ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN DEFAULT FALSE;

-- Update existing links to be non-permanent
UPDATE application_links 
SET is_permanent = FALSE 
WHERE is_permanent IS NULL;

-- Create index for active permanent links
CREATE INDEX IF NOT EXISTS idx_app_links_permanent 
ON application_links(property_id, is_permanent) 
WHERE is_active = TRUE AND is_permanent = TRUE;

-- Update validation query index
CREATE INDEX IF NOT EXISTS idx_app_links_token_active 
ON application_links(token, is_active, expires_at);
```

### 4. Create Marketplace Analytics Table

```sql
-- Migration: XXX_marketplace_analytics.sql

CREATE TABLE IF NOT EXISTS marketplace_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Property reference
  property_source VARCHAR(50) NOT NULL, -- 'pm' or 'crm'
  property_id UUID NOT NULL,
  
  -- Event tracking
  event_type VARCHAR(50) NOT NULL, -- 'view', 'click', 'apply', 'inquiry', 'favorite'
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- User context
  user_id UUID, -- NULL for anonymous
  session_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  
  -- Location context (user's location when viewing)
  user_latitude DECIMAL(10, 8),
  user_longitude DECIMAL(11, 8),
  
  -- Additional metadata
  referrer_url TEXT,
  search_query TEXT, -- What did user search for?
  search_filters JSONB, -- Active filters at time of event
  device_type VARCHAR(50), -- 'mobile', 'tablet', 'desktop'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX idx_marketplace_analytics_property 
ON marketplace_analytics(property_source, property_id, event_timestamp DESC);

CREATE INDEX idx_marketplace_analytics_event 
ON marketplace_analytics(event_type, event_timestamp DESC);

CREATE INDEX idx_marketplace_analytics_session 
ON marketplace_analytics(session_id, event_timestamp);

CREATE INDEX idx_marketplace_analytics_timestamp
ON marketplace_analytics(event_timestamp DESC);

-- Partitioning by month for efficient querying (optional but recommended)
-- Convert to partitioned table for large-scale analytics
CREATE TABLE marketplace_analytics_partitioned (
  LIKE marketplace_analytics INCLUDING ALL
) PARTITION BY RANGE (event_timestamp);

-- Create partitions for current and next 3 months
CREATE TABLE marketplace_analytics_2026_02 PARTITION OF marketplace_analytics_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE marketplace_analytics_2026_03 PARTITION OF marketplace_analytics_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE marketplace_analytics_2026_04 PARTITION OF marketplace_analytics_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
```

### 5. Create Saved Searches Table (Future Enhancement)

```sql
-- Migration: XXX_saved_searches.sql

CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference
  user_id UUID, -- NULL for anonymous (using email)
  email VARCHAR(255), -- For anonymous users
  
  -- Search criteria
  search_name VARCHAR(255),
  transaction_type VARCHAR(50), -- 'rental', 'sale', 'all'
  location_query TEXT, -- "Accra" or "East Legon"
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  radius_km DECIMAL(10, 2), -- Search radius
  
  -- Filters
  min_price DECIMAL(15, 2),
  max_price DECIMAL(15, 2),
  bedrooms INTEGER,
  bathrooms INTEGER,
  property_types TEXT[], -- ['apartment', 'house']
  amenities TEXT[], -- ['pool', 'parking']
  
  -- Polygon search (if drawn on map)
  search_polygon GEOMETRY(POLYGON, 4326),
  
  -- Notification preferences
  email_alerts_enabled BOOLEAN DEFAULT TRUE,
  alert_frequency VARCHAR(50) DEFAULT 'daily', -- 'instant', 'daily', 'weekly'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_alert_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_email ON saved_searches(email);
CREATE INDEX idx_saved_searches_alerts 
ON saved_searches(email_alerts_enabled, last_alert_sent_at)
WHERE email_alerts_enabled = TRUE;

-- Spatial index for polygon searches
CREATE INDEX idx_saved_searches_polygon_gist 
ON saved_searches USING GIST(search_polygon)
WHERE search_polygon IS NOT NULL;
```

### Geospatial Query Examples

#### Find properties within 5km radius

```sql
SELECT 
  id,
  name,
  citymarketplace_enabled,
  permanent_link_token
FROM properties
WHERE marketplace_enabled = TRUE
  AND ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_MakePoint(-0.1870, 5.6037), 4326)::geography,
    5000 -- 5km in meters
  )
ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(-0.1870, 5.6037), 4326)::geography)
LIMIT 20;
```

#### Find properties within a polygon (drawn on map)

```sql
SELECT 
  id,
  name,
  latitude,
  longitude
FROM properties
WHERE marketplace_enabled = TRUE
  AND ST_Within(
    geom,
    ST_GeomFromText('POLYGON((
      -0.20 5.55,
      -0.20 5.65,
      -0.15 5.65,
      -0.15 5.55,
      -0.20 5.55
    ))', 4326)
  );
```

#### Find properties within bounding box (map viewport)

```sql
SELECT 
  id,
  name,
  latitude,
  longitude
FROM properties
WHERE marketplace_enabled = TRUE
  AND geom && ST_MakeEnvelope(
    -0.25, 5.50, -- SW corner (lng, lat)
    -0.10, 5.70, -- NE corner (lng, lat)
    4326
  )
ORDER BY marketplace_listed_at DESC;
```

--- 
ON marketplace_analytics(property_source, property_id, event_timestamp DESC);

CREATE INDEX idx_marketplace_analytics_event 
ON marketplace_analytics(event_type, event_timestamp DESC);

CREATE INDEX idx_marketplace_analytics_session 
ON marketplace_analytics(session_id, event_timestamp);
```

---

## API Endpoints

### New Geospatial Search Endpoints

#### 1. Search Properties (OpenSearch with Geospatial Queries)

```typescript
/**
 * POST /api/v1/marketplace/search
 * Public endpoint - No authentication required
 * 
 * Primary search endpoint using OpenSearch with geospatial capabilities
 * Supports radius search, polygon search, bounding box, and full-text queries
 * 
 * Body:
 * {
 *   // Text search
 *   query?: string, // Full-text search across title, description, address
 *   
 *   // Geospatial filters (choose ONE)
 *   geo_radius?: {
 *     latitude: number,
 *     longitude: number,
 *     radius_km: number
 *   },
 *   geo_polygon?: {
 *     points: Array<[lng, lat]> // GeoJSON polygon coordinates
 *   },
 *   geo_bbox?: {
 *     top_left: { lat: number, lon: number },
 *     bottom_right: { lat: number, lon: number }
 *   },
 *   
 *   // Property filters
 *   transaction_type?: 'rental' | 'sale' | 'all',
 *   property_types?: string[], // ['apartment', 'house', 'villa']
 *   min_price?: number,
 *   max_price?: number,
 *   bedrooms?: number,
 *   bathrooms?: number,
 *   min_area?: number, // sqm
 *   max_area?: number,
 *   amenities?: string[], // ['pool', 'gym', 'parking']
 *   
 *   // Sorting
 *   sort_by?: 'relevance' | 'price' | 'distance' | 'created_at' | 'views',
 *   sort_order?: 'asc' | 'desc',
 *   
 *   // Pagination
 *   from?: number, // default: 0
 *   size?: number  // default: 20, max: 100
 * }
 * 
 * Response:
 * {
 *   total: number,
 *   properties: Array<MarketplaceProperty & {
 *     distance_km?: number, // Only if geo_radius search
 *     relevance_score?: number
 *   }>,
 *   aggregations?: {
 *     property_types: { [key: string]: number },
 *     price_ranges: { [key: string]: number },
 *     bedrooms: { [key: string]: number }
 *   },
 *   search_metadata: {
 *     took_ms: number,
 *     max_score: number
 *   }
 * }
 */

interface MarketplaceProperty {
  id: string;
  source: 'pm' | 'crm'; // Property Management or CRM
  permanent_link_token: string;
  
  // Basic info
  title: string;
  description: string;
  property_type: string;
  transaction_type: 'rental' | 'sale';
  
  // Location
  address: string;
  city: string;
  region: string;
  neighborhood?: string;
  digital_address?: string;
  location: {
    lat: number;
    lon: number;
  };
  
  // Pricing
  price: number; // monthly_rent for PM, price for CRM
  currency: string;
  price_negotiable?: boolean;
  
  // Specifications
  bedrooms: number;
  bathrooms: number;
  total_area_sqm?: number;
  parking_spaces?: number;
  
  // Features & Amenities
  amenities: string[];
  features: string[];
  
  // Media
  images: Array<{
    url: string;
    caption?: string;
  }>;
  
  // Contact (optional, based on privacy settings)
  contact_phone?: string;
  contact_email?: string;
  
  // Metadata
  listed_at: string; // ISO date
  views: number;
  clicks: number;
}

// Implementation example
// backend/src/controllers/marketplace/searchController.ts
export async function searchProperties(req: Request, res: Response) {
  const {
    query,
    geo_radius,
    geo_polygon,
    geo_bbox,
    transaction_type,
    property_types,
    min_price,
    max_price,
    bedrooms,
    bathrooms,
    amenities,
    sort_by = 'relevance',
    sort_order = 'desc',
    from = 0,
    size = 20
  } = req.body;

  // Build OpenSearch query
  const osQuery: any = {
    bool: {
      must: [],
      filter: []
    }
  };

  // Full-text search
  if (query) {
    osQuery.bool.must.push({
      multi_match: {
        query,
        fields: ['title^3', 'description^2', 'address', 'neighborhood', 'city'],
        fuzziness: 'AUTO'
      }
    });
  }

  // Geospatial filters
  if (geo_radius) {
    osQuery.bool.filter.push({
      geo_distance: {
        distance: `${geo_radius.radius_km}km`,
        location: {
          lat: geo_radius.latitude,
          lon: geo_radius.longitude
        }
      }
    });
  } else if (geo_polygon) {
    osQuery.bool.filter.push({
      geo_polygon: {
        location: {
          points: geo_polygon.points
        }
      }
    });
  } else if (geo_bbox) {
    osQuery.bool.filter.push({
      geo_bounding_box: {
        location: {
          top_left: geo_bbox.top_left,
          bottom_right: geo_bbox.bottom_right
        }
      }
    });
  }

  // Property filters
  if (transaction_type && transaction_type !== 'all') {
    osQuery.bool.filter.push({ term: { transaction_type } });
  }
  if (property_types?.length) {
    osQuery.bool.filter.push({ terms: { property_type: property_types } });
  }
  if (min_price !== undefined || max_price !== undefined) {
    osQuery.bool.filter.push({
      range: {
        price: {
          gte: min_price,
          lte: max_price
        }
      }
    });
  }
  if (bedrooms) {
    osQuery.bool.filter.push({ term: { bedrooms } });
  }
  if (bathrooms) {
    osQuery.bool.filter.push({ term: { bathrooms } });
  }
  if (amenities?.length) {
    osQuery.bool.filter.push({ terms: { amenities } });
  }

  // Sorting
  let sort: any[] = [];
  if (sort_by === 'distance' && geo_radius) {
    sort.push({
      _geo_distance: {
        location: {
          lat: geo_radius.latitude,
          lon: geo_radius.longitude
        },
        order: sort_order,
        unit: 'km'
      }
    });
  } else if (sort_by === 'price') {
    sort.push({ price: { order: sort_order } });
  } else if (sort_by === 'created_at') {
    sort.push({ listed_at: { order: sort_order } });
  } else if (sort_by === 'views') {
    sort.push({ views: { order: sort_order } });
  } else {
    sort.push('_score'); // relevance
  }

  // Execute OpenSearch query
  const response = await opensearchClient.search({
    index: 'marketplace_properties',
    body: {
      query: osQuery,
      sort,
      from,
      size,
      aggs: {
        property_types: { terms: { field: 'property_type.keyword' } },
        price_ranges: {
          range: {
            field: 'price',
            ranges: [
              { key: '0-500', to: 500 },
              { key: '500-1000', from: 500, to: 1000 },
              { key: '1000-2000', from: 1000, to: 2000 },
              { key: '2000+', from: 2000 }
            ]
          }
        },
        bedrooms: { terms: { field: 'bedrooms' } }
      }
    }
  });

  // Format response
  const properties = response.body.hits.hits.map((hit: any) => ({
    ...hit._source,
    relevance_score: hit._score,
    distance_km: hit.sort?.[0] // If sorted by distance
  }));

  return res.json({
    total: response.body.hits.total.value,
    properties,
    aggregations: {
      property_types: formatAggregation(response.body.aggregations.property_types),
      price_ranges: formatAggregation(response.body.aggregations.price_ranges),
      bedrooms: formatAggregation(response.body.aggregations.bedrooms)
    },
    search_metadata: {
      took_ms: response.body.took,
      max_score: response.body.hits.max_score
    }
  });
}
```

#### 2. Location Autocomplete (Mapbox Geocoding)

```typescript
/**
 * GET /api/v1/marketplace/autocomplete
 * Public endpoint - No authentication required
 * 
 * Provides location autocomplete suggestions using Mapbox Geocoding API
 * Used in search bars for "Where?" input
 * 
 * Query Parameters:
 * - q: string (search query, e.g., "East Legon, A")
 * - country?: string (default: 'GH' for Ghana)
 * - types?: string (comma-separated: 'place,locality,neighborhood,address')
 * - proximity?: string (lat,lng for proximity bias)
 * - limit?: number (default: 5, max: 10)
 * 
 * Response:
 * {
 *   suggestions: Array<{
 *     id: string,
 *     place_name: string, // "East Legon, Accra, Greater Accra, Ghana"
 *     center: [lng, lat],
 *     place_type: string[], // ['neighborhood', 'locality']
 *     relevance: number, // 0-1
 *     context: Array<{ id: string, text: string }> // City, Region hierarchy
 *   }>
 * }
 */

// Implementation
export async function autocomplete(req: Request, res: Response) {
  const { q, country = 'GH', types = 'place,locality,neighborhood', proximity, limit = 5 } = req.query;

  // Check cache first
  const cacheKey = `autocomplete:${q}:${country}:${types}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Call Mapbox Geocoding API
  const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`;
  const params = new URLSearchParams({
    access_token: process.env.MAPBOX_ACCESS_TOKEN!,
    country,
    types,
    limit: limit.toString()
  });
  if (proximity) {
    params.append('proximity', proximity);
  }

  const response = await fetch(`${mapboxUrl}?${params}`);
  const data = await response.json();

  const result = {
    suggestions: data.features.map((feature: any) => ({
      id: feature.id,
      place_name: feature.place_name,
      center: feature.center,
      place_type: feature.place_type,
      relevance: feature.relevance,
      context: feature.context || []
    }))
  };

  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(result));

  return res.json(result);
}
```

#### 3. Geocode Address

```typescript
/**
 * POST /api/v1/marketplace/geocode
 * Public endpoint - No authentication required
 * 
 * Convert address to coordinates (forward geocoding)
 * Used when user enters a custom address or location
 * 
 * Body:
 * {
 *   address: string, // "East Legon, Accra, Ghana"
 *   country?: string // default: 'GH'
 * }
 * 
 * Response:
 * {
 *   address: string,
 *   location: {
 *     lat: number,
 *     lon: number
 *   },
 *   formatted_address: string,
 *   accuracy: 'rooftop' | 'street' | 'locality' | 'city',
 *   components: {
 *     street?: string,
 *     neighborhood?: string,
 *     city?: string,
 *     region?: string,
 *     postal_code?: string,
 *     country?: string
 *   }
 * }
 */

// Implementation uses GeocodingService from section above
export async function geocodeAddress(req: Request, res: Response) {
  const { address, country = 'GH' } = req.body;

  const geocodingService = new GeocodingService();
  const result = await geocodingService.geocode(address, country);

  if (!result) {
    return res.status(404).json({ error: 'Address not found' });
  }

  return res.json(result);
}
```

#### 4. Reverse Geocode (Coordinates to Address)

```typescript
/**
 * GET /api/v1/marketplace/reverse-geocode
 * Public endpoint - No authentication required
 * 
 * Convert coordinates to address (reverse geocoding)
 * Used when user clicks on map to search that area
 * 
 * Query Parameters:
 * - lat: number
 * - lng: number
 * 
 * Response: Same as geocode endpoint
 */

export async function reverseGeocode(req: Request, res: Response) {
  const { lat, lng } = req.query;

  const geocodingService = new GeocodingService();
  const result = await geocodingService.reverseGeocode(
    parseFloat(lat as string),
    parseFloat(lng as string)
  );

  if (!result) {
    return res.status(404).json({ error: 'Location not found' });
  }

  return res.json(result);
}
```

#### 5. Get Nearby Amenities

```typescript
/**
 * GET /api/v1/marketplace/nearby-amenities
 * Public endpoint - No authentication required
 * 
 * Find nearby amenities (schools, hospitals, transit) for a property
 * Uses OpenStreetMap Overpass API
 * 
 * Query Parameters:
 * - lat: number
 * - lng: number
 * - radius_km?: number (default: 2)
 * - types?: string (comma-separated: 'school,hospital,transit')
 * 
 * Response:
 * {
 *   amenities: {
 *     schools: Array<{
 *       name: string,
 *       distance_km: number,
 *       location: { lat: number, lon: number }
 *     }>,
 *     hospitals: Array<...>,
 *     transit_stops: Array<...>
 *   }
 * }
 */

export async function getNearbyAmenities(req: Request, res: Response) {
  const { lat, lng, radius_km = 2, types = 'school,hospital,transit' } = req.query;

  const geocodingService = new GeocodingService();
  const result = await geocodingService.getNearbyAmenities(
    parseFloat(lat as string),
    parseFloat(lng as string),
    parseFloat(radius_km as string),
    (types as string).split(',')
  );

  return res.json(result);
}
```

#### 6. Calculate Commute Time

```typescript
/**
 * POST /api/v1/marketplace/commute-time
 * Public endpoint - No authentication required
 * 
 * Calculate travel time from property to a destination
 * Uses Mapbox Directions API
 * 
 * Body:
 * {
 *   from: { lat: number, lng: number }, // Property location
 *   to: { lat: number, lng: number },   // Destination (work, etc.)
 *   mode: 'driving' | 'walking' | 'cycling' | 'transit'
 * }
 * 
 * Response:
 * {
 *   duration_minutes: number,
 *   distance_km: number,
 *   mode: string,
 *   route_geometry?: string // GeoJSON LineString for map display
 * }
 */

export async function calculateCommuteTime(req: Request, res: Response) {
  const { from, to, mode = 'driving' } = req.body;

  // Call Mapbox Directions API
  const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${from.lng},${from.lat};${to.lng},${to.lat}`;
  const params = new URLSearchParams({
    access_token: process.env.MAPBOX_ACCESS_TOKEN!,
    geometries: 'geojson',
    overview: 'full'
  });

  const response = await fetch(`${mapboxUrl}?${params}`);
  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    return res.status(404).json({ error: 'No route found' });
  }

  const route = data.routes[0];

  return res.json({
    duration_minutes: Math.round(route.duration / 60),
    distance_km: Number((route.distance / 1000).toFixed(2)),
    mode,
    route_geometry: route.geometry
  });
}
```

#### 7. Get Property by Permanent Token

```typescript
/**
 * GET /api/v1/marketplace/properties/:token
 * Public endpoint - No authentication required
 * 
 * Returns detailed property information for a specific permanent token
 * Used when user clicks on a property to see full details
 * Also increments view count
 */

interface MarketplacePropertyDetail extends MarketplaceProperty {
  // Additional fields for detail view
  year_built?: number;
  floors?: number;
  furnishing?: string; // 'unfurnished', 'semi-furnished', 'fully-furnished'
  pet_friendly?: boolean;
  
  // Organization info (sanitized)
  managed_by: string; // Organization name
  
  // Availability
  available_from?: string;
  lease_term_months?: number; // For rentals
  
  // Nearby data (computed on-demand)
  nearby_schools?: number; // Count within 2km
  nearby_hospitals?: number;
  nearby_transit?: number;
}
```

#### 8. Track Marketplace Event

```typescript
/**
 * POST /api/v1/marketplace/analytics/track
 * Public endpoint - No authentication required
 * 
 * Track user interactions with marketplace
 * Used for analytics and improving recommendations
 * 
 * Body:
 * {
 *   property_source: 'pm' | 'crm',
 *   property_id: string,
 *   event_type: 'view' | 'click' | 'apply' | 'inquiry' | 'favorite' | 'share',
 *   session_id: string,
 *   search_query?: string,
 *   search_filters?: Record<string, any>,
 *   user_location?: { lat: number, lng: number },
 *   metadata?: Record<string, any>
 * }
 */
```

#### 9. Save Search (Future Enhancement)

```typescript
/**
 * POST /api/v1/marketplace/saved-searches
 * Requires authentication
 * 
 * Save a search query for email alerts
 * 
 * Body:
 * {
 *   name: string,
 *   search_criteria: {
 *     // Same as search endpoint body
 *   },
 *   alert_frequency: 'instant' | 'daily' | 'weekly'
 * }
 */
```

### Modified Endpoints

#### Update Application Link Creation

```typescript
/**
 * POST /api/v1/pm/application-links
 * 
 * CHANGE: Add support for permanent links
 * 
 * Body:
 * {
 *   propertyId: string,
 *   applicationType?: 'standard' | 'express' | 'premium',
 *   maxUses?: number,
 *   expiresInDays?: number, // NULL or 0 = permanent
 *   isPermanent?: boolean // NEW: explicitly mark as permanent
 * }
 */
```

#### Update Property Creation/Update

```typescript
/**
 * POST /api/v1/pm/properties
 * PUT /api/v1/pm/properties/:id
 * 
 * CHANGE: Add marketplace_enabled field and auto-geocode address
 * 
 * Body includes:
 * {
 *   ...existing fields,
 *   marketplace_enabled?: boolean, // default: true
 *   latitude?: number, // Auto-populated if not provided
 *   longitude?: number
 * }
 * 
 * Backend logic:
 * - If lat/lng not provided but address is, auto-geocode
 * - Update OpenSearch index after property creation/update
 * - Generate permanent_link_token if marketplace_enabled = true
 */
```

---

## Frontend Implementation

### New Marketplace Pages & Components

#### 1. Main Marketplace Page with Map Integration (`frontend/src/app/(marketing)/marketplace/page.tsx`)

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PropertyCard } from '@/components/marketplace/PropertyCard';
import { FilterPanel } from '@/components/marketplace/FilterPanel';
import { MapView } from '@/components/marketplace/MapView'; // From Mapbox Integration section
import { LocationSearch } from '@/components/marketplace/LocationSearch';
import { Loader2, Map as MapIcon, List as ListIcon } from 'lucide-react';
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
  
  // Geospatial filters
  geo_radius?: {
    latitude: number;
    longitude: number;
    radius_km: number;
  };
  geo_polygon?: {
    points: Array<[number, number]>;
  };
  geo_bbox?: {
    top_left: { lat: number; lon: number };
    bottom_right: { lat: number; lon: number };
  };
  
  // Sorting
  sort_by?: 'relevance' | 'price' | 'distance' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

type ViewMode = 'list' | 'map';

export default function MarketplacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filters, setFilters] = useState<SearchFilters>({
    transaction_type: 'all',
    sort_by: 'relevance',
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
  const [mapBounds, setMapBounds] = useState<any>(null);

  // Load properties when filters change
  useEffect(() => {
    loadProperties();
  }, [filters, pagination.from]);

  // Update URL with search params
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.query) params.set('q', filters.query);
    if (filters.transaction_type !== 'all') params.set('type', filters.transaction_type);
    if (selectedLocation) params.set('location', selectedLocation.place_name);
    
    router.push(`?${params.toString()}`, { scroll: false });
  }, [filters, selectedLocation]);

  const loadProperties = async () => {
    setLoading(true);
    try {
      // Use OpenSearch search endpoint
      const response = await fetch('/api/v1/marketplace/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...filters,
          from: pagination.from,
          size: pagination.size
        })
      });
      
      const data = await response.json();
      
      setProperties(data.properties);
      setPagination(prev => ({ ...prev, total: data.total }));
      setAggregations(data.aggregations);
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
        radius_km: 10 // Default 10km radius
      },
      geo_polygon: undefined,
      geo_bbox: undefined,
      sort_by: 'distance' // Sort by distance when location selected
    }));
  };

  const handleMapMove = useCallback((bounds: any) => {
    // Update search when map is moved (for "Search this area" button)
    setMapBounds(bounds);
  }, []);

  const handleSearchThisArea = () => {
    if (!mapBounds) return;
    
    setFilters(prev => ({
      ...prev,
      geo_bbox: {
        top_left: {
          lat: mapBounds.getNorth(),
          lon: mapBounds.getWest()
        },
        bottom_right: {
          lat: mapBounds.getSouth(),
          lon: mapBounds.getEast()
        }
      },
      geo_radius: undefined,
      geo_polygon: undefined
    }));
  };

  const handlePolygonDrawn = (polygon: any) => {
    // When user draws a polygon on map
    setFilters(prev => ({
      ...prev,
      geo_polygon: {
        points: polygon.geometry.coordinates[0]
      },
      geo_radius: undefined,
      geo_bbox: undefined
    }));
  };

  const handlePropertyClick = (property: any) => {
    // Track click event
    fetch('/api/v1/marketplace/analytics/track', {
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
    
    // Navigate to property detail page
    router.push(`/marketplace/properties/${property.permanent_link_token}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Search */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="container mx-auto py-4 px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Find Your Perfect Property</h1>
            
            {/* Location Search */}
            <div className="flex-1 max-w-xl">
              <LocationSearch 
                onSelect={handleLocationSelect}
                placeholder="Search by city, neighborhood, or address..."
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2 border rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ListIcon className="h-4 w-4" />
                List
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-4 py-2 rounded flex items-center gap-2 ${
                  viewMode === 'map' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MapIcon className="h-4 w-4" />
                Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto py-6 px-4">
        <div className="flex gap-6">
          {/* Filter Sidebar - Always visible in list view, collapsible in map view */}
          <div className={`${viewMode === 'map' ? 'hidden lg:block' : ''} w-80 flex-shrink-0`}>
            <FilterPanel 
              filters={filters}
              onFilterChange={setFilters}
              aggregations={aggregations}
            />
          </div>
          
          {/* Property List or Map View */}
          <div className="flex-1 min-w-0">
            {/* Results Header */}
            <div className="bg-white rounded-lg p-4 mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  {pagination.total.toLocaleString()} properties found
                  {selectedLocation && (
                    <span className="ml-2">near <strong>{selectedLocation.place_name}</strong></span>
                  )}
                </p>
              </div>
              
              {/* Sort Dropdown */}
              <select
                value={`${filters.sort_by}_${filters.sort_order}`}
                onChange={(e) => {
                  const [sort_by, sort_order] = e.target.value.split('_');
                  setFilters(prev => ({ ...prev, sort_by: sort_by as any, sort_order: sort_order as any }));
                }}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="relevance_desc">Most Relevant</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="distance_asc">Distance: Nearest First</option>
                <option value="created_at_desc">Newest First</option>
                <option value="views_desc">Most Viewed</option>
              </select>
            </div>

            {/* List View */}
            {viewMode === 'list' && (
              <div>
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : properties.length === 0 ? (
                  <div className="bg-white rounded-lg p-12 text-center">
                    <p className="text-gray-500">No properties match your search criteria</p>
                    <button
                      onClick={() => setFilters({ transaction_type: 'all' })}
                      className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Clear Filters
                    </button>
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
                      <div className="mt-8 flex justify-center gap-2">
                        <button
                          onClick={() => setPagination(prev => ({ ...prev, from: Math.max(0, prev.from - prev.size) }))}
                          disabled={pagination.from === 0}
                          className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <span className="px-4 py-2">
                          Page {Math.floor(pagination.from / pagination.size) + 1} of {Math.ceil(pagination.total / pagination.size)}
                        </span>
                        <button
                          onClick={() => setPagination(prev => ({ ...prev, from: prev.from + prev.size }))}
                          disabled={pagination.from + pagination.size >= pagination.total}
                          className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Map View */}
            {viewMode === 'map' && (
              <div className="relative">
                <MapView
                  properties={properties}
                  onMarkerClick={handlePropertyClick}
                  onMoveEnd={handleMapMove}
                  onPolygonDrawn={handlePolygonDrawn}
                  center={selectedLocation?.center}
                  enableClustering={true}
                  enableHeatmap={false}
                  enableDrawing={true}
                />
                
                {/* Search This Area Button */}
                <button
                  onClick={handleSearchThisArea}
                  className="absolute top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-white shadow-lg rounded-full hover:bg-gray-50 font-medium z-10"
                >
                  Search this area
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function for session ID
function getSessionId(): string {
  let sessionId = localStorage.getItem('marketplace_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    localStorage.setItem('marketplace_session_id', sessionId);
  }
  return sessionId;
}
```

#### 2. Enhanced Property Card Component

```tsx
// frontend/src/components/marketplace/PropertyCard.tsx

import Image from 'next/image';
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
    fetch('/api/v1/marketplace/analytics/track', {
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
      className="bg-white rounded-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer border border-gray-200"
    >
      {/* Property Image */}
      <div className="relative h-48 w-full">
        <Image
          src={property.images[0]?.url || '/placeholder-property.jpg'}
          alt={property.title}
          fill
          className="object-cover"
        />
        
        {/* Transaction Type Badge */}
        <div className="absolute top-2 left-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            property.transaction_type === 'rental' 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-500 text-white'
          }`}>
            {property.transaction_type === 'rental' ? 'For Rent' : 'For Sale'}
          </span>
        </div>

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteClick}
          className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-gray-50"
        >
          <Heart className={`h-5 w-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
        </button>

        {/* Distance Badge (if location search active) */}
        {showDistance && property.distance_km !== undefined && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
            {property.distance_km.toFixed(1)} km away
          </div>
        )}
      </div>
      
      {/* Property Info */}
      <div className="p-4">
        {/* Price */}
        <div className="mb-2">
          <span className="text-2xl font-bold text-gray-900">
            {property.currency} {property.price.toLocaleString()}
          </span>
          {property.transaction_type === 'rental' && (
            <span className="text-gray-600 text-sm">/month</span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-lg mb-1 line-clamp-1">
          {property.title}
        </h3>
        
        {/* Location */}
        <div className="flex items-center gap-1 text-gray-600 text-sm mb-3">
          <MapPin className="h-4 w-4" />
          <span className="line-clamp-1">
            {property.neighborhood ? `${property.neighborhood}, ` : ''}{property.city}
          </span>
        </div>
        
        {/* Property Specs */}
        <div className="flex items-center gap-4 text-gray-700 text-sm border-t pt-3">
          <div className="flex items-center gap-1">
            <Bed className="h-4 w-4" />
            <span>{property.bedrooms} beds</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            <span>{property.bathrooms} baths</span>
          </div>
          {property.total_area_sqm && (
            <div className="flex items-center gap-1">
              <Square className="h-4 w-4" />
              <span>{property.total_area_sqm} m²</span>
            </div>
          )}
        </div>

        {/* Amenities (show first 3) */}
        {property.amenities?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {property.amenities.slice(0, 3).map((amenity: string) => (
              <span key={amenity} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                {amenity}
              </span>
            ))}
            {property.amenities.length > 3 && (
              <span className="text-xs px-2 py-1 text-gray-600">
                +{property.amenities.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 3. Advanced Filter Panel Component

```tsx
// frontend/src/components/marketplace/FilterPanel.tsx

import { useState } from 'react';
import { X } from 'lucide-react';

interface FilterPanelProps {
  filters: any;
  onFilterChange: (filters: any) => void;
  aggregations?: any;
}

export function FilterPanel({ filters, onFilterChange, aggregations }: FilterPanelProps) {
  const [priceRange, setPriceRange] = useState({
    min: filters.min_price || '',
    max: filters.max_price || ''
  });

  const handleClearFilters = () => {
    onFilterChange({ transaction_type: 'all' });
    setPriceRange({ min: '', max: '' });
  };

  const activeFilterCount = 
    (filters.property_types?.length || 0) +
    (filters.min_price ? 1 : 0) +
    (filters.max_price ? 1 : 0) +
    (filters.bedrooms ? 1 : 0) +
    (filters.bathrooms ? 1 : 0) +
    (filters.amenities?.length || 0);

  return (
    <div className="bg-white rounded-lg p-6 sticky top-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-lg">Filters</h3>
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>
      
      {/* Transaction Type */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">Transaction Type</label>
        <div className="flex gap-2">
          {['all', 'rental', 'sale'].map(type => (
            <button
              key={type}
              onClick={() => onFilterChange({ ...filters, transaction_type: type })}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                filters.transaction_type === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? 'All' : type === 'rental' ? 'Rent' : 'Buy'}
            </button>
          ))}
        </div>
      </div>

      {/* Property Type */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">Property Type</label>
        <div className="space-y-2">
          {['Apartment', 'House', 'Villa', 'Townhouse', 'Studio'].map(type => {
            const isSelected = filters.property_types?.includes(type.toLowerCase());
            const count = aggregations?.property_types?.[type.toLowerCase()] || 0;
            
            return (
              <label key={type} className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const newTypes = e.target.checked
                        ? [...(filters.property_types || []), type.toLowerCase()]
                        : (filters.property_types || []).filter((t: string) => t !== type.toLowerCase());
                      onFilterChange({ ...filters, property_types: newTypes.length > 0 ? newTypes : undefined });
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">{type}</span>
                </div>
                <span className="text-xs text-gray-500">({count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Price Range */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">Price Range</label>
        <div className="flex gap-2">
          <input 
            type="number"
            placeholder="Min"
            value={priceRange.min}
            onChange={(e) => {
              setPriceRange({ ...priceRange, min: e.target.value });
              onFilterChange({ ...filters, min_price: parseInt(e.target.value) || undefined });
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <span className="self-center text-gray-500">-</span>
          <input 
            type="number"
            placeholder="Max"
            value={priceRange.max}
            onChange={(e) => {
              setPriceRange({ ...priceRange, max: e.target.value });
              onFilterChange({ ...filters, max_price: parseInt(e.target.value) || undefined });
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Quick Price Filters */}
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { label: 'Under GHS 500', max: 500 },
            { label: 'GHS 500-1000', min: 500, max: 1000 },
            { label: 'GHS 1000-2000', min: 1000, max: 2000 },
            { label: 'GHS 2000+', min: 2000 }
          ].map(range => (
            <button
              key={range.label}
              onClick={() => {
                setPrice Range({ min: range.min?.toString() || '', max: range.max?.toString() || '' });
                onFilterChange({ ...filters, min_price: range.min, max_price: range.max });
              }}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full"
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Bedrooms */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">Bedrooms</label>
        <div className="grid grid-cols-5 gap-2">
          {['Any', '1+', '2+', '3+', '4+'].map((label, index) => {
            const value = index === 0 ? undefined : index;
            const count = aggregations?.bedrooms?.[index] || 0;
            
            return (
              <button
                key={label}
                onClick={() => onFilterChange({ ...filters, bedrooms: value })}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  filters.bedrooms === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
                {index > 0 && <div className="text-xs opacity-70">({count})</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bathrooms */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">Bathrooms</label>
        <div className="grid grid-cols-5 gap-2">
          {['Any', '1+', '2+', '3+', '4+'].map((label, index) => {
            const value = index === 0 ? undefined : index;
            
            return (
              <button
                key={label}
                onClick={() => onFilterChange({ ...filters, bathrooms: value })}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  filters.bathrooms === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amenities */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3">Amenities</label>
        <div className="space-y-2">
          {['Pool', 'Gym', 'Parking', 'Security', 'Garden', 'Balcony'].map(amenity => {
            const isSelected = filters.amenities?.includes(amenity.toLowerCase());
            
            return (
              <label key={amenity} className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const newAmenities = e.target.checked
                      ? [...(filters.amenities || []), amenity.toLowerCase()]
                      : (filters.amenities || []).filter((a: string) => a !== amenity.toLowerCase());
                    onFilterChange({ ...filters, amenities: newAmenities.length > 0 ? newAmenities : undefined });
                  }}
                  className="w-4 h-4 text-blue-600 rounded mr-2"
                />
                <span className="text-sm">{amenity}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

### Updates to Existing Components

#### Property Management Dashboard - Add Marketplace Toggle

```tsx
// frontend/src/app/dashboard/property-management/properties/[id]/page.tsx

// Add marketplace toggle section in property details page
<div className="border rounded-lg p-4 mt-6">
  <h3 className="font-semibold mb-2">Marketplace Listing</h3>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-gray-600">
        {property.marketplace_enabled 
          ? 'This property is listed on the public marketplace' 
          : 'This property is not listed on the marketplace'}
      </p>
      {property.marketplace_enabled && (
        <a 
          href={`/marketplace/properties/${property.permanent_link_token}`}
          target="_blank"
          className="text-sm text-blue-600 hover:underline"
        >
          View on marketplace →
        </a>
      )}
    </div>
    <button
      onClick={toggleMarketplace}
      className={`px-4 py-2 rounded ${
        property.marketplace_enabled 
          ? 'bg-red-100 text-red-600 hover:bg-red-200' 
          : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {property.marketplace_enabled ? 'Remove from Marketplace' : 'List on Marketplace'}
    </button>
  </div>
</div>
```

---
        event_type: 'click',
        session_id: getSessionId()
      })
    });
    
    // Redirect to application page
    window.location.href = `/apply/${property.permanent_link_token}`;
  };

  return (
    <div className="border rounded-lg overflow-hidden hover:shadow-lg transition">
      {/* Property Image */}
      <img 
        src={property.images[0]?.url || '/placeholder.jpg'} 
        alt={property.title}
        className="w-full h-48 object-cover"
      />
      
      {/* Property Info */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-lg">{property.title}</h3>
          <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded">
            {property.transaction_type === 'rental' ? 'For Rent' : 'For Sale'}
          </span>
        </div>
        
        <p className="text-gray-600 text-sm mb-3">
          {property.city}, {property.region}
        </p>
        
        <div className="flex items-center gap-4 mb-3 text-sm text-gray-700">
          <span>🛏️ {property.bedrooms} beds</span>
          <span>🚿 {property.bathrooms} baths</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-xl font-bold text-blue-600">
            {property.currency} {property.price.toLocaleString()}
            {property.transaction_type === 'rental' && '/month'}
          </span>
          
          <button 
            onClick={handleApplyClick}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### 3. Filter Sidebar Component

```tsx
interface FilterSidebarProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

export function FilterSidebar({ filters, onFilterChange }: FilterSidebarProps) {
  return (
    <div className="w-64 border rounded-lg p-4">
      <h3 className="font-semibold mb-4">Filters</h3>
      
      {/* Transaction Type */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Type</label>
        <select 
          value={filters.transaction_type}
          onChange={(e) => onFilterChange({ ...filters, transaction_type: e.target.value as any })}
          className="w-full border rounded px-3 py-2"
        >
          <option value="all">All Properties</option>
          <option value="rental">For Rent</option>
          <option value="sale">For Sale</option>
        </select>
      </div>
      
      {/* Region */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Region</label>
        <select 
          value={filters.region || ''}
          onChange={(e) => onFilterChange({ ...filters, region: e.target.value })}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">All Regions</option>
          <option value="greater_accra">Greater Accra</option>
          <option value="ashanti">Ashanti</option>
          <option value="western">Western</option>
          {/* Add more regions */}
        </select>
      </div>
      
      {/* Bedrooms */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Bedrooms</label>
        <select 
          value={filters.bedrooms || ''}
          onChange={(e) => onFilterChange({ ...filters, bedrooms: parseInt(e.target.value) || undefined })}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Any</option>
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="4">4+</option>
        </select>
      </div>
      
      {/* Price Range */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Price Range</label>
        <div className="flex gap-2">
          <input 
            type="number"
            placeholder="Min"
            value={filters.min_price || ''}
            onChange={(e) => onFilterChange({ ...filters, min_price: parseInt(e.target.value) || undefined })}
            className="w-full border rounded px-3 py-2"
          />
          <input 
            type="number"
            placeholder="Max"
            value={filters.max_price || ''}
            onChange={(e) => onFilterChange({ ...filters, max_price: parseInt(e.target.value) || undefined })}
            className="w-full border rounded px-3 py-2"
          />
        </div>
      </div>
      
      <button 
        onClick={() => onFilterChange({ transaction_type: 'all' })}
        className="w-full px-4 py-2 text-sm border rounded hover:bg-gray-50"
      >
        Clear Filters
      </button>
    </div>
  );
}
```

### Updates to Existing Components

#### Property Management Dashboard - Add Marketplace Toggle

```tsx
// frontend/src/app/dashboard/property-management/properties/[id]/page.tsx

// Add marketplace toggle section
<div className="border rounded-lg p-4">
  <h3 className="font-semibold mb-2">Marketplace Listing</h3>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-gray-600">
        {property.marketplace_enabled 
          ? 'This property is listed on the public marketplace' 
          : 'This property is not listed on the marketplace'}
      </p>
      {property.marketplace_enabled && (
        <a 
          href={`/marketplace/properties/${property.permanent_link_token}`}
          target="_blank"
          className="text-sm text-blue-600 hover:underline"
        >
          View on marketplace →
        </a>
      )}
    </div>
    <button
      onClick={toggleMarketplace}
      className={`px-4 py-2 rounded ${
        property.marketplace_enabled 
          ? 'bg-red-100 text-red-600 hover:bg-red-200' 
          : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {property.marketplace_enabled ? 'Remove from Marketplace' : 'List on Marketplace'}
    </button>
  </div>
</div>
```

---

## Workflow Changes

### 1. Property Creation Workflow (Property Management)

#### BEFORE
```
Property Manager creates property
  → Property saved to database
  → Property manager manually creates application link (30-day expiration)
  → Property manager shares link with tenants
```

#### AFTER
```
Property Manager creates property
  → Property saved to database
  → System auto-generates permanent_link_token
  → marketplace_enabled = TRUE by default
  → Property automatically appears on marketplace
  → (Property manager can disable marketplace listing if needed)
```

### 2. Application Workflow from Marketplace

#### NEW FLOW
```
Tenant browses marketplace
  → Clicks on property
  → Sees property details
  → Clicks "Apply" button
  → Redirected to: /apply/[permanent_link_token]
  → Uses EXISTING tenant application form
  → Submits application
  → Application status = 'submitted'
  → System sends email to Property Manager (UNCHANGED)
  → Property Manager reviews in dashboard (UNCHANGED)
  → Property Manager approves/rejects (UNCHANGED)
  → On approval → Generate lease → E-sign (UNCHANGED)
```

#### KEY POINTS
✅ **No changes to application form**  
✅ **No changes to approval/rejection logic**  
✅ **No changes to email notification system**  
✅ **No changes to lease generation**  
✅ **Only change: How tenant discovers the property**  

### 3. Deal Manager Workflow (CRM)

#### BEFORE
```
Deal Manager creates property in CRM
  → Property visible only in CRM dashboard
  → Deal manager manually shares details with leads
  → Creates deals and contacts manually
```

#### AFTER
```
Deal Manager creates property in CRM
  → Property saved to crm_properties
  → System auto-generates permanent_link_token
  → marketplace_enabled = TRUE by default
  → Property automatically appears on marketplace (tagged as "For Sale")
  → Prospective buyers click "Apply"
  → System creates contact in CRM (auto-capture lead)
  → Deal manager follows up through existing pipeline
```

---

## Migration Strategy

### Phase 1: Database Changes (Week 1)

**Goal:** Add marketplace columns without breaking existing functionality

1. ✅ Run migration to add `marketplace_enabled`, `permanent_link_token` to `properties` table
2. ✅ Run migration to add same columns to `crm_properties` table
3. ✅ Generate permanent tokens for existing properties
4. ✅ Set `marketplace_enabled = FALSE` for all existing properties initially (manual opt-in during rollout)
5. ✅ Test queries to ensure no performance degradation

**Rollback Plan:** Drop added columns if issues arise

### Phase 2: Backend API (Week 2)

**Goal:** Build marketplace API without affecting existing endpoints

1. ✅ Create new service: `MarketplaceService`
   - Aggregates data from `properties` and `crm_properties`
   - Handles filtering, sorting, pagination
2. ✅ Create new route: `/api/v1/marketplace/properties`
3. ✅ Update property creation to set `marketplace_enabled = TRUE` by default (NEW properties only)
4. ✅ Add endpoint to toggle marketplace listing per property
5. ✅ Test API thoroughly with existing data

**Rollback Plan:** Disable marketplace routes if issues arise

### Phase 3: Frontend Development (Week 2-3)

**Goal:** Build marketplace page without breaking existing pages

1. ✅ Create marketplace page at `/marketplace`
2. ✅ Build PropertyCard, FilterSidebar components
3. ✅ Update property detail pages with marketplace toggle
4. ✅ Test application flow: marketplace → apply → submit → approval
5. ✅ Ensure existing PM dashboard workflows still work

**Rollback Plan:** Remove marketplace route from Next.js if issues arise

### Phase 4: Testing & QA (Week 3-4)

**Goal:** Verify no disruption to existing workflows

1. ✅ Test existing tenant application flow (from direct link)
2. ✅ Test new marketplace application flow
3. ✅ Test email notifications still work
4. ✅ Test approval/rejection still works
5. ✅ Test lease generation still works
6. ✅ Load test marketplace page (1000+ concurrent users)
7. ✅ Security audit (ensure no sensitive data exposed)

### Phase 5: Gradual Rollout (Week 4-5)

**Goal:** Launch to users incrementally

1. ✅ Launch to internal team (beta testing)
2. ✅ Invite 10-20 property managers to list properties
3. ✅ Monitor analytics: views, clicks, applications
4. ✅ Collect feedback and iterate
5. ✅ Enable marketplace for all new properties by default
6. ✅ Public announcement and marketing push

---

## Security & Privacy

### Data Exposure Concerns

| Field | PM Properties | CRM Properties | Marketplace Display |
|-------|--------------|----------------|---------------------|
| Organization Name | ✅ Visible | ✅ Visible | ✅ Show "Managed by XYZ" |
| Property Address | ✅ Full address | ✅ Full address | ⚠️ Show city/region only (hide street) |
| Owner Name | ✅ Visible | ✅ Visible | ❌ Hidden |
| Owner Phone | ✅ Visible | ✅ Visible | ⚠️ Optional (sanitized) |
| Owner Email | ✅ Visible | ✅ Visible | ⚠️ Optional (sanitized) |
| Monthly Rent/Price | ✅ Visible | ✅ Visible | ✅ Show full price |
| Property Photos | ✅ Visible | ✅ Visible | ✅ Show all photos |
| Applicant Data | ❌ Not public | ❌ Not public | ❌ Never exposed |

### Security Measures

1. **Rate Limiting**
   - Limit marketplace API to 100 requests/minute per IP
   - Limit application submissions to 10/hour per IP

2. **Data Sanitization**
   - Strip sensitive fields from API responses
   - Sanitize email/phone before display (e.g., `02*****678`)

3. **CAPTCHA**
   - Add CAPTCHA to application form to prevent bots

4. **Access Control**
   - Only property owners can toggle `marketplace_enabled`
   - Only authenticated users can access application details

5. **Audit Logging**
   - Log all marketplace_enabled changes
   - Track who disabled/enabled marketplace per property

---

## Testing Strategy

### Unit Tests

```typescript
// Test: MarketplaceService aggregates properties correctly
describe('MarketplaceService.getProperties', () => {
  it('should return both PM and CRM properties', async () => {
    const result = await marketplaceService.getProperties({ transaction_type: 'all' });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some(p => p.source === 'pm')).toBe(true);
    expect(result.data.some(p => p.source === 'crm')).toBe(true);
  });

  it('should filter by transaction_type=rental', async () => {
    const result = await marketplaceService.getProperties({ transaction_type: 'rental' });
    expect(result.data.every(p => p.transaction_type === 'rental')).toBe(true);
  });

  it('should not return properties with marketplace_enabled=false', async () => {
    const result = await marketplaceService.getProperties();
    expect(result.data.every(p => p.marketplace_enabled === true)).toBe(true);
  });
});
```

### Integration Tests

```typescript
// Test: Full application flow from marketplace
describe('Marketplace to Application Flow', () => {
  it('should complete full flow: browse → apply → submit → approve', async () => {
    // 1. Browse marketplace
    const marketplace = await request(app).get('/api/v1/marketplace/properties');
    expect(marketplace.status).toBe(200);
    const property = marketplace.body.data[0];

    // 2. Navigate to apply page
    const token = property.permanent_link_token;
    const validation = await request(app).get(`/api/v1/pm/application-links/${token}/validate`);
    expect(validation.body.valid).toBe(true);

    // 3. Submit application
    const application = await request(app)
      .post(`/api/v1/pm/application-links/${token}/apply`)
      .send({
        applicantFullName: 'John Doe',
        applicantEmail: 'john@example.com',
        applicantPhone: '0241234567',
        // ... other required fields
      });
    expect(application.status).toBe(201);
    expect(application.body.status).toBe('submitted');

    // 4. Verify email sent (mock)
    expect(emailService.send).toHaveBeenCalledWith({
      to: expect.stringContaining('@'),
      subject: expect.stringContaining('New Application'),
    });

    // 5. Approve application
    const approval = await request(app)
      .post(`/api/v1/pm/applications/${application.body.id}/approve`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ approvalNotes: 'Approved' });
    expect(approval.status).toBe(200);
    expect(approval.body.status).toBe('approved');
  });
});
```

### End-to-End Tests (Cypress)

```typescript
describe('Marketplace E2E', () => {
  it('Tenant can browse, filter, and apply for property', () => {
    cy.visit('/marketplace');
    
    // Browse properties
    cy.contains('Property Marketplace').should('be.visible');
    cy.get('[data-testid="property-card"]').should('have.length.greaterThan', 0);
    
    // Filter by rental
    cy.get('[data-testid="transaction-type-filter"]').select('rental');
    cy.get('[data-testid="property-card"]').each(($card) => {
      cy.wrap($card).contains('For Rent').should('be.visible');
    });
    
    // Click on property
    cy.get('[data-testid="property-card"]').first().click();
    
    // Apply button
    cy.get('[data-testid="apply-button"]').click();
    
    // Should redirect to application form
    cy.url().should('include', '/apply/');
    cy.contains('Application Form').should('be.visible');
    
    // Fill and submit form
    cy.get('[name="applicantFullName"]').type('John Doe');
    cy.get('[name="applicantEmail"]').type('john@example.com');
    cy.get('[name="applicantPhone"]').type('0241234567');
    // ... fill other fields
    cy.get('[data-testid="submit-application"]').click();
    
    // Should show success message
    cy.contains('Application Submitted').should('be.visible');
  });
});
```

---

## Future Enhancements

### Phase 2 Features (Not in Initial Launch)

1. **Search Functionality**
   - Full-text search across property titles/descriptions
   - Autocomplete for locations
   - "Search nearby" based on user location

2. **Advanced Filters**
   - Property age (year built)
   - Parking availability
   - Pet-friendly
   - Furnished/Unfurnished
   - Utilities included

3. **Map View**
   - Display properties on interactive map
   - Cluster markers for multiple properties in same area
   - Filter by drawing on map

4. **Favorites/Watchlist**
   - Allow users to save properties
   - Email alerts for price changes
   - Notify when new properties match saved filters

5. **Inquiry System**
   - "Contact Us" button for general inquiries
   - Auto-create lead in CRM for deal properties
   - WhatsApp Business API integration

6. **Property Comparison**
   - Compare 2-3 properties side-by-side
   - Highlight differences in specs and pricing

7. **Virtual Tours**
   - Embed 360° tours or video walkthroughs
   - Schedule viewing appointments directly

8. **Marketplace Analytics Dashboard**
   - Show property managers: views, clicks, conversion rates
   - Recommend optimizations (better photos, pricing)

9. **SEO Optimization**
   - Server-side rendering for better Google indexing
   - Dynamic Open Graph meta tags for social sharing
   - Sitemap generation for search engines

10. **Mobile App**
    - Native iOS/Android apps with push notifications
    - Location-based property discovery

---

## Appendix

### A. SQL Query Examples

#### Get All Marketplace Properties (Unified Query)

```sql
-- Combine PM properties and CRM properties
WITH pm_properties AS (
  SELECT 
    id,
    'pm' AS source,
    permanent_link_token,
    name AS title,
    NULL AS description, -- PM properties may not have descriptions
    property_type,
    'rental' AS transaction_type,
    address,
    city,
    region,
    monthly_rent AS price,
    'GHS' AS currency,
    bedrooms,
    bathrooms,
    total_area_sqm,
    marketplace_listed_at AS listed_at,
    marketplace_views AS views
  FROM properties
  WHERE marketplace_enabled = TRUE
    AND deleted_at IS NULL
),
crm_props AS (
  SELECT 
    id,
    'crm' AS source,
    permanent_link_token,
    title,
    description,
    property_type,
    CASE 
      WHEN transaction_type = 'rental' THEN 'rental'
      ELSE 'sale'
    END AS transaction_type,
    address_street AS address,
    address_city AS city,
    region,
    price,
    price_currency AS currency,
    bedrooms,
    bathrooms,
    total_area_sqm,
    marketplace_listed_at AS listed_at,
    marketplace_views AS views
  FROM crm_properties
  WHERE marketplace_enabled = TRUE
    AND status IN ('active', 'pending')
)
SELECT * FROM (
  SELECT * FROM pm_properties
  UNION ALL
  SELECT * FROM crm_props
) AS all_properties
WHERE 1=1
  -- Apply filters dynamically
  AND (:transaction_type = 'all' OR transaction_type = :transaction_type)
  AND (:region IS NULL OR region = :region)
  AND (:city IS NULL OR city = :city)
  AND (:min_price IS NULL OR price >= :min_price)
  AND (:max_price IS NULL OR price <= :max_price)
  AND (:bedrooms IS NULL OR bedrooms >= :bedrooms)
ORDER BY listed_at DESC
LIMIT :limit OFFSET :offset;
```

### B. Environment Variables

```bash
# .env additions for marketplace feature

# Frontend
NEXT_PUBLIC_MARKETPLACE_ENABLED=true
NEXT_PUBLIC_MARKETPLACE_PAGE_SIZE=20

# Backend
MARKETPLACE_RATE_LIMIT_PER_MINUTE=100
MARKETPLACE_APPLICATION_RATE_LIMIT_PER_HOUR=10
MARKETPLACE_ENABLE_ANALYTICS=true
MARKETPLACE_CAPTCHA_ENABLED=true
MARKETPLACE_CAPTCHA_SITE_KEY=your_recaptcha_site_key
```

### C. API Response Examples

#### GET /api/v1/marketplace/properties

```json
{
  "data": [
    {
      "id": "prop_123",
      "source": "pm",
      "permanent_link_token": "abc123xyz789",
      "title": "Modern 2-Bedroom Apartment in Osu",
      "description": null,
      "property_type": "apartment",
      "transaction_type": "rental",
      "address": "Osu, Accra",
      "city": "Accra",
      "region": "greater_accra",
      "digital_address": "GA-123-4567",
      "latitude": 5.5560,
      "longitude": -0.1969,
      "price": 1500,
      "currency": "GHS",
      "price_negotiable": false,
      "bedrooms": 2,
      "bathrooms": 2,
      "total_area_sqm": 85,
      "images": [
        {
          "url": "https://storage.propmetrik.com/properties/prop_123/img1.jpg",
          "caption": "Living Room"
        }
      ],
      "contact_phone": "024*****678",
      "contact_email": "pm****@example.com",
      "listed_at": "2026-02-15T10:30:00Z",
      "views": 45
    },
    {
      "id": "crm_prop_456",
      "source": "crm",
      "permanent_link_token": "def456uvw012",
      "title": "3-Bedroom House for Sale in East Legon",
      "description": "Beautiful home with spacious compound",
      "property_type": "house",
      "transaction_type": "sale",
      "address": "East Legon, Accra",
      "city": "Accra",
      "region": "greater_accra",
      "latitude": 5.6492,
      "longitude": -0.1550,
      "price": 350000,
      "currency": "USD",
      "price_negotiable": true,
      "bedrooms": 3,
      "bathrooms": 3,
      "total_area_sqm": 200,
      "images": [
        {
          "url": "https://storage.propmetrik.com/crm_properties/crm_prop_456/img1.jpg",
          "caption": "Exterior View"
        }
      ],
      "contact_phone": null,
      "contact_email": "agent****@realestate.com",
      "listed_at": "2026-02-20T14:00:00Z",
      "views": 120
    }
  ],
  "pagination": {
    "total": 245,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

---

## Conclusion

This marketplace feature provides a **unified public listing** for both Property Management and Deal Management properties, with:

✅ **Minimal disruption** - No changes to existing workflows  
✅ **Permanent links** - No more 30-day expiration  
✅ **Auto-listing** - Properties appear automatically  
✅ **Seamless application** - Uses existing tenant application flow  
✅ **Scalable architecture** - Supports thousands of properties  
✅ **Privacy-first design** - Sensitive data sanitized  

### Next Steps

1. **Review & Approve** - Stakeholder sign-off on this specification
2. **Database Migrations** - Execute schema changes in staging
3. **Backend Development** - Build MarketplaceService and API endpoints
4. **Frontend Development** - Build marketplace page and components
5. **Testing** - Comprehensive QA across all workflows
6. **Launch** - Gradual rollout with monitoring

---

**Document Prepared By:** GitHub Copilot  
**Date:** February 21, 2026  
**Version:** 1.0  
**Status:** Draft - Pending Review
