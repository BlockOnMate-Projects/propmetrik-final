import { Client, ClientOptions } from '@opensearch-project/opensearch';
import { config } from '../config';
import { logger } from '../utils/logger';

// OpenSearch client configuration
const clientOptions: ClientOptions = {
  node: config.opensearch.url,
  auth: {
    username: config.opensearch.username || '',
    password: config.opensearch.password || '',
  },
  ssl: {
    rejectUnauthorized: false, // For self-signed certs in development
  },
};

export const opensearchClient = new Client(clientOptions);

// Index names with prefix
export const indices = {
  properties: `${config.opensearch.indexPrefix}properties`,
  transactions: `${config.opensearch.indexPrefix}transactions`,
  neighborhoods: `${config.opensearch.indexPrefix}neighborhoods`,
  valuations: `${config.opensearch.indexPrefix}valuations`,
  audit: `${config.opensearch.indexPrefix}audit`,
};

// Property index mapping
export const propertyIndexMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      external_id: { type: 'keyword' },
      
      // Text fields for full-text search
      title: {
        type: 'text',
        analyzer: 'standard',
        fields: {
          keyword: { type: 'keyword', ignore_above: 256 },
        },
      },
      description: {
        type: 'text',
        analyzer: 'standard',
      },
      
      // Property classification
      property_type: { type: 'keyword' },
      property_subtype: { type: 'keyword' },
      transaction_type: { type: 'keyword' },
      status: { type: 'keyword' },
      
      // Location - geo_point for geospatial queries
      location: { type: 'geo_point' },
      address_raw: { type: 'text' },
      address_standardized: { type: 'object' },
      neighborhood: { type: 'keyword' },
      district: { type: 'keyword' },
      region: { type: 'keyword' },
      ghana_post_gps: { type: 'keyword' },
      
      // Financial
      price_ghs: { type: 'long' },
      price_usd: { type: 'long' },
      price_per_sqm_ghs: { type: 'float' },
      rental_yield: { type: 'float' },
      
      // Specifications
      bedrooms: { type: 'integer' },
      bathrooms: { type: 'integer' },
      toilets: { type: 'integer' },
      parking_spaces: { type: 'integer' },
      floors: { type: 'integer' },
      land_area_sqm: { type: 'float' },
      built_area_sqm: { type: 'float' },
      year_built: { type: 'integer' },
      
      // Condition & Quality
      property_condition: { type: 'keyword' },
      quality_grade: { type: 'keyword' },
      
      // Features & Amenities (arrays)
      features: { type: 'keyword' },
      amenities: { type: 'keyword' },
      utilities: { type: 'keyword' },
      
      // Data quality metrics
      confidence_score: { type: 'float' },
      completeness_score: { type: 'float' },
      source_tier: { type: 'keyword' },
      data_sources: { type: 'keyword' },
      
      // Media
      images_count: { type: 'integer' },
      has_virtual_tour: { type: 'boolean' },
      has_floor_plan: { type: 'boolean' },
      
      // Metadata
      listed_date: { type: 'date' },
      last_verified: { type: 'date' },
      created_at: { type: 'date' },
      updated_at: { type: 'date' },
      created_by: { type: 'keyword' },
      organization_id: { type: 'keyword' },
      
      // Search suggestions
      suggest: {
        type: 'completion',
        analyzer: 'simple',
        preserve_separators: true,
        preserve_position_increments: true,
        max_input_length: 50,
      },
    },
  },
  settings: {
    number_of_shards: 3,
    number_of_replicas: 1,
    analysis: {
      analyzer: {
        ghana_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'stop', 'ghana_synonyms'],
        },
      },
      filter: {
        ghana_synonyms: {
          type: 'synonym',
          synonyms: [
            'apartment,flat',
            'house,home,residence',
            'toilet,bathroom,washroom',
            'parlor,sitting room,living room',
            'boys quarters,bq,outhouse',
            'selfcontain,self-contained,studio',
            'chamber,room',
            'storey,story,floor',
          ],
        },
      },
    },
  },
};

// Neighborhood index mapping
export const neighborhoodIndexMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      name: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      district: { type: 'keyword' },
      region: { type: 'keyword' },
      boundary: { type: 'geo_shape' },
      center: { type: 'geo_point' },
      
      // Market metrics
      median_price_ghs: { type: 'long' },
      price_per_sqm_median: { type: 'float' },
      market_activity_score: { type: 'float' },
      appreciation_rate: { type: 'float' },
      rental_yield_avg: { type: 'float' },
      
      // Property counts
      total_properties: { type: 'integer' },
      active_listings: { type: 'integer' },
      
      // Infrastructure scores
      infrastructure_score: { type: 'float' },
      accessibility_score: { type: 'float' },
      amenity_score: { type: 'float' },
      
      updated_at: { type: 'date' },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
  },
};

// Transaction index mapping
export const transactionIndexMapping = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      property_id: { type: 'keyword' },
      transaction_type: { type: 'keyword' },
      transaction_date: { type: 'date' },
      price_ghs: { type: 'long' },
      price_per_sqm: { type: 'float' },
      source: { type: 'keyword' },
      verified: { type: 'boolean' },
      confidence_level: { type: 'float' },
      
      // Denormalized property data for fast queries
      property_type: { type: 'keyword' },
      location: { type: 'geo_point' },
      neighborhood: { type: 'keyword' },
      district: { type: 'keyword' },
      region: { type: 'keyword' },
      
      created_at: { type: 'date' },
    },
  },
  settings: {
    number_of_shards: 2,
    number_of_replicas: 1,
  },
};

/**
 * Create an index if it doesn't exist
 */
export async function createIndexIfNotExists(
  indexName: string,
  mapping: Record<string, unknown>
): Promise<boolean> {
  try {
    const exists = await opensearchClient.indices.exists({ index: indexName });
    
    if (!exists.body) {
      await opensearchClient.indices.create({
        index: indexName,
        body: mapping,
      });
      logger.info(`Created OpenSearch index: ${indexName}`);
      return true;
    }
    
    logger.debug(`OpenSearch index already exists: ${indexName}`);
    return false;
  } catch (error) {
    logger.error(`Failed to create index ${indexName}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Initialize all indices
 */
export async function initializeIndices(): Promise<void> {
  await createIndexIfNotExists(indices.properties, propertyIndexMapping);
  await createIndexIfNotExists(indices.neighborhoods, neighborhoodIndexMapping);
  await createIndexIfNotExists(indices.transactions, transactionIndexMapping);
  logger.info('All OpenSearch indices initialized');
}

/**
 * Index a document
 */
export async function indexDocument(
  indexName: string,
  id: string,
  document: Record<string, unknown>
): Promise<void> {
  await opensearchClient.index({
    index: indexName,
    id,
    body: document,
    refresh: true,
  });
}

/**
 * Bulk index documents
 */
export async function bulkIndex(
  indexName: string,
  documents: Array<{ id: string; document: Record<string, unknown> }>
): Promise<{ successful: number; failed: number }> {
  const body = documents.flatMap(({ id, document }) => [
    { index: { _index: indexName, _id: id } },
    document,
  ]);

  const response = await opensearchClient.bulk({ body, refresh: true });
  
  const failed = response.body.items.filter((item: any) => item.index?.error).length;
  
  return {
    successful: documents.length - failed,
    failed,
  };
}

/**
 * Search properties
 */
export async function searchProperties(
  query: Record<string, unknown>,
  options: {
    from?: number;
    size?: number;
    sort?: Array<Record<string, unknown>>;
  } = {}
): Promise<{
  hits: Array<{ id: string; score: number; source: Record<string, unknown> }>;
  total: number;
}> {
  const { from = 0, size = 20, sort } = options;

  const response = await opensearchClient.search({
    index: indices.properties,
    body: {
      query,
      from,
      size,
      sort: sort || [{ _score: 'desc' }, { updated_at: 'desc' }],
    },
  });

  return {
    hits: response.body.hits.hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score,
      source: hit._source,
    })),
    total: response.body.hits.total.value,
  };
}

/**
 * Geo-distance search
 */
export async function searchByLocation(
  lat: number,
  lon: number,
  radiusKm: number,
  filters?: Record<string, unknown>,
  options: { from?: number; size?: number } = {}
): Promise<{
  hits: Array<{ id: string; distance: number; source: Record<string, unknown> }>;
  total: number;
}> {
  const { from = 0, size = 20 } = options;

  const query: Record<string, unknown> = {
    bool: {
      must: [
        {
          geo_distance: {
            distance: `${radiusKm}km`,
            location: { lat, lon },
          },
        },
      ],
      filter: filters ? [filters] : [],
    },
  };

  const response = await opensearchClient.search({
    index: indices.properties,
    body: {
      query,
      from,
      size,
      sort: [
        {
          _geo_distance: {
            location: { lat, lon },
            order: 'asc',
            unit: 'km',
          },
        },
      ],
    },
  });

  return {
    hits: response.body.hits.hits.map((hit: any) => ({
      id: hit._id,
      distance: hit.sort?.[0] || 0,
      source: hit._source,
    })),
    total: response.body.hits.total.value,
  };
}

/**
 * Check OpenSearch health
 */
export async function checkHealth(): Promise<{
  connected: boolean;
  clusterHealth: string;
  indices: Record<string, { exists: boolean; docCount: number }>;
}> {
  try {
    const health = await opensearchClient.cluster.health();
    
    const indexStatus: Record<string, { exists: boolean; docCount: number }> = {};
    
    for (const [name, indexName] of Object.entries(indices)) {
      try {
        const exists = await opensearchClient.indices.exists({ index: indexName });
        if (exists.body) {
          const stats = await opensearchClient.count({ index: indexName });
          indexStatus[name] = {
            exists: true,
            docCount: stats.body.count,
          };
        } else {
          indexStatus[name] = { exists: false, docCount: 0 };
        }
      } catch {
        indexStatus[name] = { exists: false, docCount: 0 };
      }
    }

    return {
      connected: true,
      clusterHealth: health.body.status,
      indices: indexStatus,
    };
  } catch (error) {
    return {
      connected: false,
      clusterHealth: 'unavailable',
      indices: {},
    };
  }
}

export default {
  client: opensearchClient,
  indices,
  createIndexIfNotExists,
  initializeIndices,
  indexDocument,
  bulkIndex,
  searchProperties,
  searchByLocation,
  checkHealth,
};
