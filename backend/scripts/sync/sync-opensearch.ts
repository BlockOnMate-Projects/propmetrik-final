/**
 * Sync PostgreSQL properties to OpenSearch
 * 
 * This script ensures OpenSearch has the same data as PostgreSQL,
 * properly formatted with geo_point locations for search.
 * 
 * Usage:
 *   npx ts-node scripts/sync/sync-opensearch.ts           # Full sync
 *   npx ts-node scripts/sync/sync-opensearch.ts --recent  # Last 24 hours only
 *   npx ts-node scripts/sync/sync-opensearch.ts --id=xxx  # Single property
 */

import { pool } from '../../src/database';
import { opensearchClient, indices, propertyIndexMapping } from '../../src/database/opensearch';
import { logger } from '../../src/utils/logger';

interface SyncOptions {
  fullSync?: boolean;
  recentOnly?: boolean;
  propertyId?: string;
  batchSize?: number;
}

async function ensureIndexExists(): Promise<void> {
  const indexName = indices.properties;
  
  try {
    const exists = await opensearchClient.indices.exists({ index: indexName });
    
    if (!exists.body) {
      logger.info(`Creating index: ${indexName}`);
      await opensearchClient.indices.create({
        index: indexName,
        body: propertyIndexMapping
      });
      logger.info(`Index created: ${indexName}`);
    } else {
      logger.info(`Index exists: ${indexName}`);
    }
  } catch (error) {
    logger.error('Error checking/creating index', { error });
    throw error;
  }
}

async function deleteAndRecreateIndex(): Promise<void> {
  const indexName = indices.properties;
  
  try {
    const exists = await opensearchClient.indices.exists({ index: indexName });
    
    if (exists.body) {
      logger.info(`Deleting existing index: ${indexName}`);
      await opensearchClient.indices.delete({ index: indexName });
    }
    
    logger.info(`Creating fresh index: ${indexName}`);
    await opensearchClient.indices.create({
      index: indexName,
      body: propertyIndexMapping
    });
    logger.info(`Index recreated: ${indexName}`);
  } catch (error) {
    logger.error('Error recreating index', { error });
    throw error;
  }
}

function transformPropertyForOpenSearch(row: any): Record<string, any> {
  // Transform PostgreSQL row to OpenSearch document format
  // Must match propertyIndexMapping in opensearch.ts
  
  return {
    id: row.id,
    external_id: row.external_id || row.source_id,
    
    // Text fields
    title: row.title || '',
    description: row.description || '',
    
    // Classification
    property_type: row.property_type || 'unknown',
    property_subtype: row.property_sub_type || null,
    transaction_type: row.transaction_type || 'sale',
    status: row.status || 'active',
    
    // Location - geo_point format for OpenSearch
    location: row.latitude && row.longitude ? {
      lat: parseFloat(row.latitude),
      lon: parseFloat(row.longitude)
    } : null,
    location_accuracy: row.location_accuracy ? parseInt(row.location_accuracy) : null,
    address_raw: row.address_raw || row.address || '',
    neighborhood: row.neighborhood || null,
    district: row.district || null,
    region: row.region || null,
    ghana_post_gps: row.ghana_post_gps || null,
    
    // Financial - normalize to GHS and USD
    price_ghs: row.price ? Math.round(parseFloat(row.price)) : null,
    price_usd: row.price_usd ? Math.round(parseFloat(row.price_usd)) : null,
    price_per_sqm_ghs: row.price_per_sqm ? parseFloat(row.price_per_sqm) : null,
    
    // Specifications
    bedrooms: row.bedrooms ? parseInt(row.bedrooms) : 0,
    bathrooms: row.bathrooms ? parseInt(row.bathrooms) : 0,
    toilets: row.toilets ? parseInt(row.toilets) : null,
    parking_spaces: row.parking_spaces ? parseInt(row.parking_spaces) : null,
    floors: row.floors ? parseInt(row.floors) : null,
    land_area_sqm: row.land_area_sqm ? parseFloat(row.land_area_sqm) : null,
    built_area_sqm: row.total_area_sqm || row.built_area_sqm ? 
      parseFloat(row.total_area_sqm || row.built_area_sqm) : null,
    year_built: row.year_built ? parseInt(row.year_built) : null,
    
    // Condition & Quality
    property_condition: row.condition || null,
    quality_grade: row.quality_grade || null,
    
    // Features & Amenities
    features: row.features || [],
    amenities: row.amenities || [],
    utilities: row.utilities || [],
    
    // Data quality
    confidence_score: row.confidence_score ? parseFloat(row.confidence_score) : null,
    completeness_score: row.completeness_score ? parseFloat(row.completeness_score) : null,
    source_tier: row.source_tier || 'tier3',
    data_sources: row.source_slug ? [row.source_slug] : [],
    
    // Media
    images_count: row.image_count || 0,
    has_virtual_tour: row.has_virtual_tour || false,
    has_floor_plan: row.has_floor_plan || false,
    primary_image_url: row.primary_image_url || null,
    
    // Metadata
    listed_date: row.listing_date || row.created_at,
    last_verified: row.verified_at || row.updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    organization_id: row.organization_id || null,
    
    // Suggestions for autocomplete
    suggest: {
      input: [
        row.title,
        row.neighborhood,
        row.district,
        row.region,
        row.address
      ].filter(Boolean)
    }
  };
}

async function syncProperties(options: SyncOptions = {}): Promise<{ synced: number; failed: number }> {
  const { recentOnly = false, propertyId, batchSize = 100 } = options;
  
  let whereClause = 'WHERE latitude IS NOT NULL AND longitude IS NOT NULL';
  const params: any[] = [];
  
  if (propertyId) {
    whereClause += ' AND id = $1';
    params.push(propertyId);
  } else if (recentOnly) {
    whereClause += ' AND updated_at > NOW() - INTERVAL \'24 hours\'';
  }
  
  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM properties ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].count);
  
  logger.info(`Starting sync of ${totalCount} properties`);
  
  let synced = 0;
  let failed = 0;
  let offset = 0;
  
  while (offset < totalCount) {
    // Fetch batch
    const result = await pool.query(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM property_images WHERE property_id = p.id) as image_count
      FROM properties p
      ${whereClause}
      ORDER BY p.id
      LIMIT ${batchSize} OFFSET ${offset}
    `, params);
    
    if (result.rows.length === 0) break;
    
    // Prepare bulk operations
    const bulkBody: any[] = [];
    
    for (const row of result.rows) {
      const doc = transformPropertyForOpenSearch(row);
      
      // Skip if no location (shouldn't happen with WHERE clause, but safety check)
      if (!doc.location) {
        logger.warn(`Skipping property ${row.id}: no location`);
        failed++;
        continue;
      }
      
      bulkBody.push(
        { index: { _index: indices.properties, _id: row.id } },
        doc
      );
    }
    
    // Execute bulk index
    if (bulkBody.length > 0) {
      try {
        const bulkResponse = await opensearchClient.bulk({ 
          body: bulkBody,
          refresh: true 
        });
        
        if (bulkResponse.body.errors) {
          for (const item of bulkResponse.body.items) {
            if (item.index?.error) {
              logger.error(`Failed to index ${item.index._id}`, { error: item.index.error });
              failed++;
            } else {
              synced++;
            }
          }
        } else {
          synced += result.rows.length;
        }
      } catch (error) {
        logger.error('Bulk index failed', { error });
        failed += result.rows.length;
      }
    }
    
    offset += batchSize;
    const progress = Math.round((offset / totalCount) * 100);
    logger.info(`Progress: ${Math.min(offset, totalCount)}/${totalCount} (${progress}%)`);
  }
  
  return { synced, failed };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fullSync = args.includes('--full');
  const recentOnly = args.includes('--recent');
  const propertyIdArg = args.find(a => a.startsWith('--id='));
  const propertyId = propertyIdArg?.split('=')[1];
  
  logger.info('=== OpenSearch Sync Started ===');
  logger.info(`Mode: ${fullSync ? 'FULL (recreate index)' : recentOnly ? 'Recent only' : propertyId ? `Single: ${propertyId}` : 'Incremental'}`);
  
  try {
    // Test connections
    await pool.query('SELECT 1');
    logger.info('✓ PostgreSQL connected');
    
    await opensearchClient.ping();
    logger.info('✓ OpenSearch connected');
    
    // Handle index
    if (fullSync) {
      await deleteAndRecreateIndex();
    } else {
      await ensureIndexExists();
    }
    
    // Sync properties
    const result = await syncProperties({
      fullSync,
      recentOnly,
      propertyId
    });
    
    logger.info('=== Sync Complete ===');
    logger.info(`Synced: ${result.synced}`);
    logger.info(`Failed: ${result.failed}`);
    
    // Verify count
    const countResponse = await opensearchClient.count({ index: indices.properties });
    logger.info(`OpenSearch document count: ${countResponse.body.count}`);
    
  } catch (error: any) {
    console.error('Sync failed with error:');
    console.error(error);
    if (error.meta?.body) {
      console.error('OpenSearch error body:', JSON.stringify(error.meta.body, null, 2));
    }
    logger.error('Sync failed', { error: error.message || error });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
